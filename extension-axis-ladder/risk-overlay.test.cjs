const test = require("node:test");
const assert = require("node:assert/strict");

const overlay = require("./risk-overlay.js");

const PLOT = { left: 100, top: 20, right: 900, bottom: 620 };
const EXPIRY = "2026-08-25";

const RIGHT_TAIL = Object.freeze({ unbounded: "right" });

function riskMap({ status = "OK", breakevens = [], bands = [{ kind: "profit", from: 0, to: RIGHT_TAIL }] } = {}) {
  return { status, breakevens, bands };
}

function acceptedView(overrides = {}) {
  return {
    strategyId: "aug-seller",
    activeStrategyId: "aug-seller",
    expiry: EXPIRY,
    activeExpiry: EXPIRY,
    acceptedAt: "2026-08-01T09:30:00+05:30",
    state: "ACCEPTED",
    currentRisk: riskMap({
      breakevens: [23100, 23200],
      bands: [
        { kind: "profit", from: 0, to: 23100 },
        { kind: "loss", from: 23100, to: 23200 },
        { kind: "profit", from: 23200, to: RIGHT_TAIL }
      ]
    }),
    wholeTradeRisk: riskMap({ breakevens: [23080, 23220] }),
    explanation: [],
    ...overrides
  };
}

test("current roots use supplied exact-axis y and solid mint presentation", () => {
  const result = overlay.buildRiskLayers(acceptedView(), (price) => 500 - (price - 23000) * 2, PLOT);
  const current = result.lines.filter((line) => line.layer === "current");

  assert.equal(result.status, "OK");
  assert.deepEqual(current.map(({ price, y, stroke, dash }) => ({ price, y, stroke, dash })), [
    { price: 23100, y: 300, stroke: "mint", dash: "solid" },
    { price: 23200, y: 100, stroke: "mint", dash: "solid" }
  ]);
  assert.deepEqual(current.map((line) => line.label), ["CURRENT BE 1 · 23,100.00", "CURRENT BE 2 · 23,200.00"]);
});

test("whole-trade roots are dashed graphite and every label right edge clears lane-zero token", () => {
  const view = acceptedView({
    wholeTradeRisk: riskMap({ breakevens: [23050, 23150, 23250] })
  });
  const result = overlay.buildRiskLayers(view, (price) => price - 23000, PLOT);
  const whole = result.lines.filter((line) => line.layer === "whole-trade");

  assert.deepEqual(whole.map(({ price, y, stroke, dash }) => ({ price, y, stroke, dash })), [
    { price: 23050, y: 50, stroke: "graphite", dash: "dashed" },
    { price: 23150, y: 150, stroke: "graphite", dash: "dashed" },
    { price: 23250, y: 250, stroke: "graphite", dash: "dashed" }
  ]);
  assert.deepEqual(whole.map((line) => line.label), [
    "WHOLE BE 1 · 23,050.00",
    "WHOLE BE 2 · 23,150.00",
    "WHOLE BE 3 · 23,250.00"
  ]);
  assert.ok(whole.every((line) => line.labelAnchor === "right"));
  assert.ok(whole.every((line) => line.labelRight + line.labelClearance === PLOT.right));
  assert.ok(whole.every((line) => line.labelRight <= PLOT.right - 220));
});

test("multiple profitable intervals become clipped plot bands", () => {
  const result = overlay.buildRiskLayers(acceptedView(), (price) => 500 - (price - 23000) * 2, PLOT);
  const currentProfit = result.bands.filter((band) => band.layer === "current" && band.kind === "profit");

  assert.deepEqual(currentProfit.map(({ top, bottom, left, right }) => ({ top, bottom, left, right })), [
    { top: 300, bottom: 620, left: 100, right: 900 },
    { top: 20, bottom: 100, left: 100, right: 900 }
  ]);
});

test("band clipping and root placement remain correct on inverted scales", () => {
  const result = overlay.buildRiskLayers(acceptedView(), (price) => 100 + (price - 23100) * 2, PLOT);
  const current = result.lines.filter((line) => line.layer === "current");
  const profits = result.bands.filter((band) => band.layer === "current" && band.kind === "profit");

  assert.deepEqual(current.map((line) => line.y), [100, 300]);
  assert.deepEqual(profits.map(({ top, bottom }) => ({ top, bottom })), [
    { top: 20, bottom: 100 },
    { top: 300, bottom: 620 }
  ]);
});

test("review and global stale states fail closed for every layer", () => {
  for (const state of ["REVIEW POSITION CHANGES", "STALE"]) {
    const result = overlay.buildRiskLayers(acceptedView({ state }), (price) => price, PLOT);
    assert.equal(result.status, state);
    assert.deepEqual(result.lines, []);
    assert.deepEqual(result.bands, []);
  }
});

test("Task 4 stale broker view fails closed even without a top-level state field", () => {
  const result = overlay.buildRiskLayers(acceptedView({
    state: undefined,
    broker: { kind: "stale", label: "ZERODHA STALE · 01 AUG, 09:00" }
  }), (price) => price, PLOT);

  assert.deepEqual(result, { status: "STALE", lines: [], bands: [] });
});

test("stale and incomplete map states suppress only affected layer", () => {
  const cases = [
    ["currentRisk", "STALE", "whole-trade"],
    ["currentRisk", "ENTRY HISTORY INCOMPLETE", "whole-trade"],
    ["wholeTradeRisk", "HISTORY INCOMPLETE", "current"]
  ];

  for (const [field, status, survivingLayer] of cases) {
    const view = acceptedView({ [field]: riskMap({ status, breakevens: [23120] }) });
    const result = overlay.buildRiskLayers(view, (price) => price - 23000, PLOT);
    assert.deepEqual([...new Set(result.lines.map((line) => line.layer))], [survivingLayer]);
    assert.equal(result.status, "PARTIAL");
  }
});

test("strategy and expiry mismatches fail closed", () => {
  const cases = [
    [acceptedView({ activeStrategyId: "sep-seller" }), "STRATEGY_MISMATCH"],
    [acceptedView({ activeExpiry: "2026-09-01" }), "EXPIRY_MISMATCH"]
  ];

  for (const [view, status] of cases) {
    assert.deepEqual(overlay.buildRiskLayers(view, (price) => price, PLOT), { status, lines: [], bands: [] });
  }
});

test("non-finite roots fail closed by affected layer", () => {
  const view = acceptedView({ currentRisk: riskMap({ breakevens: [23100, Infinity] }) });
  const result = overlay.buildRiskLayers(view, (price) => price - 23000, PLOT);

  assert.equal(result.status, "PARTIAL");
  assert.deepEqual([...new Set(result.lines.map((line) => line.layer))], ["whole-trade"]);
  assert.equal(result.bands.some((band) => band.layer === "current"), false);
});

test("missing persisted bands fail closed instead of blessing zero bands", () => {
  const task4View = {
    strategyId: "aug-seller",
    activeStrategyId: "aug-seller",
    expiry: EXPIRY,
    activeExpiry: EXPIRY,
    acceptedAt: "2026-08-01T09:30:00+05:30",
    canPublish: true,
    priority: { kind: "risk", label: "CURRENT RISK" },
    currentRisk: { lower: "23,100.00", upper: "23,200.00" },
    wholeTrade: { lower: "23,080.00", upper: "23,220.00", status: "OK" },
    maps: {
      current: { status: "OK", breakevens: [23100, 23200] },
      wholeTrade: { status: "OK", breakevens: [23080, 23220] }
    }
  };
  const result = overlay.buildRiskLayers(task4View, (price) => price - 23000, PLOT);

  assert.deepEqual(result.lines, []);
  assert.deepEqual(result.bands, []);
});

test("band endpoints reject coercible and unsupported values by affected layer", () => {
  const malformed = [
    null,
    "",
    "23100",
    NaN,
    Infinity,
    -Infinity,
    false,
    true,
    [],
    {},
    { unbounded: "left" },
    { unbounded: "right", extra: true }
  ];

  for (const endpoint of malformed) {
    for (const field of ["from", "to"]) {
      const band = { kind: "profit", from: 23000, to: 23100, [field]: endpoint };
      const result = overlay.buildRiskLayers(acceptedView({
        currentRisk: riskMap({ breakevens: [23100], bands: [band] })
      }), (price) => price - 23000, PLOT);
      assert.equal(result.status, "PARTIAL", `${field}=${JSON.stringify(endpoint)}`);
      assert.deepEqual([...new Set(result.lines.map((line) => line.layer))], ["whole-trade"]);
      assert.equal(result.bands.some((candidate) => candidate.layer === "current"), false);
    }
  }
});

test("band endpoints require both explicit boundaries", () => {
  for (const band of [
    { kind: "profit", to: 23100 },
    { kind: "profit", from: 23000 }
  ]) {
    const result = overlay.buildRiskLayers(acceptedView({
      currentRisk: riskMap({ breakevens: [23100], bands: [band] })
    }), (price) => price - 23000, PLOT);
    assert.equal(result.status, "PARTIAL");
    assert.deepEqual([...new Set(result.lines.map((line) => line.layer))], ["whole-trade"]);
  }
});

test("redraw is pure and performs no network request", () => {
  const originalFetch = global.fetch;
  let requests = 0;
  global.fetch = async () => { requests += 1; throw new Error("network forbidden"); };
  try {
    const result = overlay.buildRiskLayers(acceptedView(), (price) => price - 23000, PLOT);
    assert.equal(result.lines.length, 4);
    assert.equal(requests, 0);
  } finally {
    global.fetch = originalFetch;
  }
});
