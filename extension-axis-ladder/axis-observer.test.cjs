"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const observer = require("./axis-observer.js");

test("observer accepts plain axis numbers and rejects chart prose", () => {
  assert.equal(observer.numericAxisText("24,000.00"), 24000);
  assert.equal(observer.numericAxisText("−250"), -250);
  assert.equal(observer.numericAxisText("C 12 | P 20"), null);
});

test("observer projects canvas coordinates into CSS viewport coordinates", () => {
  observer.resetFrameGeometryCache();
  const context = {
    canvas: {
      width: 400,
      height: 200,
      getAttribute: () => "Chart for NSE_DLY:NIFTY, 1 month",
      getBoundingClientRect: () => ({ left: 800, top: 40, width: 200, height: 100 })
    },
    getTransform: () => ({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 })
  };
  assert.deepEqual(observer.projectedFill(context, "24,000", 50, 30, 1000), {
    price: 24000,
    x: 850,
    y: 70,
    sourceLabel: "Chart for NSE_DLY:NIFTY, 1 month",
    canvasRect: { left: 800, top: 40, right: 1000, bottom: 140 }
  });
  assert.deepEqual(observer.projectedFill(context, "24,000", -300, 30, 1000), {
    price: 24000,
    x: 500,
    y: 70,
    sourceLabel: "Chart for NSE_DLY:NIFTY, 1 month",
    canvasRect: { left: 800, top: 40, right: 1000, bottom: 140 }
  });
});

test("observer reads canvas geometry once per animation frame", () => {
  observer.resetFrameGeometryCache();
  let rectReads = 0;
  let chartQueries = 0;
  const chart = {
    getAttribute: () => "Chart for NSE_DLY:NIFTY, 4 hours",
    getBoundingClientRect: () => ({ left: 50, top: 20, right: 900, bottom: 620 })
  };
  const context = {
    canvas: {
      width: 200,
      height: 600,
      getAttribute: () => null,
      getBoundingClientRect: () => {
        rectReads += 1;
        return { left: 900, top: 20, width: 80, height: 600 };
      }
    },
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })
  };
  const originalDocument = globalThis.document;
  globalThis.document = {
    querySelectorAll: () => {
      chartQueries += 1;
      return [chart];
    }
  };
  try {
    assert.equal(observer.projectedFill(context, "24,000", 10, 20)?.sourceLabel, "Chart for NSE_DLY:NIFTY, 4 hours");
    assert.equal(observer.projectedFill(context, "23,900", 10, 30)?.sourceLabel, "Chart for NSE_DLY:NIFTY, 4 hours");
    assert.equal(rectReads, 1);
    assert.equal(chartQueries, 1);
    observer.resetFrameGeometryCache();
    observer.projectedFill(context, "23,800", 10, 40);
    assert.equal(rectReads, 2);
    assert.equal(chartQueries, 2);
  } finally {
    globalThis.document = originalDocument;
    observer.resetFrameGeometryCache();
  }
});

test("observer associates unlabeled right-axis canvas with adjacent chart canvas", () => {
  const chart = {
    getAttribute: () => "Chart for NSE_DLY:NIFTY, 1 month",
    getBoundingClientRect: () => ({ left: 50, top: 42, right: 1605, bottom: 715 })
  };
  const axis = { getAttribute: () => null };
  const documentRef = { querySelectorAll: () => [chart] };
  assert.equal(observer.chartSourceLabel(axis, {
    left: 1605,
    top: 42,
    right: 1679,
    bottom: 715
  }, documentRef), "Chart for NSE_DLY:NIFTY, 1 month");
});

test("observer never associates a different pane with main chart", () => {
  const chart = {
    getAttribute: () => "Chart for NSE_DLY:NIFTY, 1 month",
    getBoundingClientRect: () => ({ left: 50, top: 42, right: 1605, bottom: 600 })
  };
  const documentRef = { querySelectorAll: () => [chart] };
  assert.equal(observer.chartSourceLabel({ getAttribute: () => null }, {
    left: 1605,
    top: 620,
    right: 1679,
    bottom: 715
  }, documentRef), null);
});

test("observer converts TradingView text baseline to visual tick center", () => {
  const context = {
    canvas: {
      width: 200,
      height: 100,
      getAttribute: () => "Chart for NSE_DLY:NIFTY, 1 hour",
      getBoundingClientRect: () => ({ left: 900, top: 20, width: 200, height: 100 })
    },
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    measureText: () => ({ actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 })
  };
  assert.deepEqual(observer.projectedFill(context, "24,000", 50, 40, 1000), {
    price: 24000,
    x: 950,
    y: 57,
    sourceLabel: "Chart for NSE_DLY:NIFTY, 1 hour",
    canvasRect: { left: 900, top: 20, right: 1100, bottom: 120 }
  });
});

test("observer marks only repeated same-timeframe geometry as stable", () => {
  const candidates = [
    { price: 24000, x: 900, y: 100, sourceLabel: "Chart for NSE_DLY:NIFTY, 1 month", canvasRect: { left: 0, top: 0, right: 1000, bottom: 600 } },
    { price: 23500, x: 900, y: 200, sourceLabel: "Chart for NSE_DLY:NIFTY, 1 month", canvasRect: { left: 0, top: 0, right: 1000, bottom: 600 } },
    { price: 23000, x: 900, y: 300, sourceLabel: "Chart for NSE_DLY:NIFTY, 1 month", canvasRect: { left: 0, top: 0, right: 1000, bottom: 600 } }
  ];
  const first = observer.observationEnvelope(candidates, null, 100);
  const second = observer.observationEnvelope(candidates, first, 200);
  const changed = observer.observationEnvelope(candidates.map((candidate) => ({
    ...candidate,
    sourceLabel: "Chart for NSE_DLY:NIFTY, 1 week"
  })), second, 300);
  assert.equal(first.stableCount, 1);
  assert.equal(second.stableCount, 2);
  assert.equal(second.sourceLabel, "Chart for NSE_DLY:NIFTY, 1 month");
  assert.equal(changed.stableCount, 1);
});

test("observer publishes new geometry and one stable confirmation, then stays quiet", () => {
  const candidates = [
    { price: 24000, x: 900, y: 100, sourceLabel: "Chart for NSE_DLY:NIFTY, 1 month", canvasRect: { left: 0, top: 0, right: 1000, bottom: 600 } },
    { price: 23500, x: 900, y: 200, sourceLabel: "Chart for NSE_DLY:NIFTY, 1 month", canvasRect: { left: 0, top: 0, right: 1000, bottom: 600 } },
    { price: 23000, x: 900, y: 300, sourceLabel: "Chart for NSE_DLY:NIFTY, 1 month", canvasRect: { left: 0, top: 0, right: 1000, bottom: 600 } }
  ];
  const first = observer.observationEnvelope(candidates, null, 100);
  const stable = observer.observationEnvelope(candidates, first, 200);
  const repeated = observer.observationEnvelope(candidates, stable, 300);
  assert.equal(observer.shouldPublishEnvelope(first, null), true);
  assert.equal(observer.shouldPublishEnvelope(stable, first), true);
  assert.equal(observer.shouldPublishEnvelope(repeated, stable), false);
});

test("observer never marks incomplete axis evidence stable", () => {
  const candidates = [
    { price: 24000, x: 900, y: 100, sourceLabel: "Chart for NSE_DLY:NIFTY, 1 month", canvasRect: { left: 0, top: 0, right: 1000, bottom: 600 } },
    { price: 23500, x: 900, y: 200, sourceLabel: "Chart for NSE_DLY:NIFTY, 1 month", canvasRect: { left: 0, top: 0, right: 1000, bottom: 600 } }
  ];
  const first = observer.observationEnvelope(candidates, null, 100);
  const second = observer.observationEnvelope(candidates, first, 200);
  assert.equal(first.signature, "");
  assert.equal(second.stableCount, 1);
  assert.equal(observer.shouldPublishEnvelope(second, first), false);
});

test("unrelated changing chart numbers do not reset native-axis stability", () => {
  const axis = [24000, 23900, 23800].map((price, index) => ({
    price,
    x: 900,
    y: 100 + index * 50,
    sourceLabel: "Chart for NSE_DLY:NIFTY, 1 hour",
    canvasRect: { left: 0, top: 0, right: 1000, bottom: 600 }
  }));
  const first = observer.observationEnvelope([
    ...axis,
    { ...axis[0], price: 123, x: 100, y: 30 }
  ], null, 100);
  const second = observer.observationEnvelope([
    ...axis,
    { ...axis[0], price: 456, x: 100, y: 30 }
  ], first, 200);
  assert.equal(second.stableCount, 2);
});

test("moving TradingView markers on same axis do not reset native-grid stability", () => {
  const sourceLabel = "Chart for NSE_DLY:NIFTY, 4 hours";
  const canvasRect = { left: 1605, top: 42, right: 1679, bottom: 715 };
  const axis = Array.from({ length: 10 }, (_, index) => ({
    price: 24700 - index * 100,
    x: 1640,
    y: 45.5 + index * 37.7,
    sourceLabel,
    canvasRect
  }));
  const first = observer.observationEnvelope([
    ...axis,
    { price: 23787, x: 1640, y: 390, sourceLabel, canvasRect },
    { price: 24100, x: 1640, y: 256, sourceLabel, canvasRect }
  ], null, 100);
  const second = observer.observationEnvelope([
    ...axis,
    { price: 23805, x: 1640, y: 383, sourceLabel, canvasRect },
    { price: 24100, x: 1640, y: 260, sourceLabel, canvasRect }
  ], first, 200);
  assert.equal(first.signature.includes("23787"), false);
  assert.equal(second.stableCount, 2);
});

test("idle axis self-confirms without requiring a second TradingView redraw", () => {
  const sourceLabel = "Chart for NSE_DLY:NIFTY, 15 minutes";
  const canvasRect = { left: 1605, top: 42, right: 1679, bottom: 715 };
  const candidates = Array.from({ length: 10 }, (_, index) => ({
    price: 24700 - index * 100,
    x: 1640,
    y: 45.5 + index * 37.7,
    sourceLabel,
    canvasRect
  }));
  const first = observer.observationEnvelope(candidates, null, 100);
  const confirmed = observer.confirmStableEnvelope(first, 220);
  assert.equal(first.stableCount, 1);
  assert.equal(confirmed.stableCount, 2);
  assert.equal(observer.shouldPublishEnvelope(confirmed, first), true);
});

test("full canvas repaint discards stale ticks from prior animated scale frame", () => {
  const canvas = {};
  const otherCanvas = {};
  const stale = { price: 24000 };
  const current = { price: 23900 };
  const unrelated = { price: 100 };
  Object.defineProperty(stale, "__canvas", { value: canvas });
  Object.defineProperty(current, "__canvas", { value: canvas });
  Object.defineProperty(unrelated, "__canvas", { value: otherCanvas });
  assert.deepEqual(observer.withoutCanvasCandidates([stale, unrelated], canvas), [unrelated]);
  assert.deepEqual(observer.withoutCanvasCandidates([current, unrelated], otherCanvas), [current]);
});

test("observer keeps latest complete paint burst during animated scale transitions", () => {
  const sourceLabel = "Chart for NSE_DLY:NIFTY, 1 week";
  const canvasRect = { left: 1605, top: 42, right: 1679, bottom: 715 };
  const stale = [24000, 23750, 23500].map((price, index) => ({
    price,
    x: 1640,
    y: 100 + index * 50,
    sourceLabel,
    canvasRect,
    capturedAt: 100 + index
  }));
  const current = [24500, 24250, 24000].map((price, index) => ({
    price,
    x: 1640,
    y: 120 + index * 55,
    sourceLabel,
    canvasRect,
    capturedAt: 120 + index
  }));
  const envelope = observer.observationEnvelope([...stale, ...current], null, 200);
  assert.deepEqual(envelope.candidates.map((candidate) => candidate.price), [24500, 24250, 24000]);
  assert.equal(envelope.signature.includes("23500"), false);
  assert.equal(envelope.signature.includes("24500"), true);
});

test("observer combines separately published major and minor labels from the same visible axis", () => {
  const sourceLabel = "Chart for NSE_DLY:NIFTY, 1 day";
  const canvasRect = { left: 1605, top: 42, right: 1679, bottom: 715 };
  const candidate = (price, capturedAt) => ({
    price,
    x: 1640,
    y: 80 + (24700 - price) * 0.4,
    sourceLabel,
    canvasRect,
    capturedAt
  });
  const minor = [24500, 24300, 24100, 23900, 23700, 23500, 23300, 23100]
    .map((price, index) => candidate(price, 100 + index));
  const major = [24600, 24400, 24200, 24000, 23800, 23600, 23400, 23200, 23000]
    .map((price, index) => candidate(price, 120 + index));

  const minorEnvelope = observer.observationEnvelope(minor, null, 150);
  const envelope = observer.observationEnvelope(major, minorEnvelope, 200);

  assert.deepEqual(
    envelope.candidates.map((entry) => entry.price).sort((left, right) => right - left),
    [24600, 24500, 24400, 24300, 24200, 24100, 24000, 23900, 23800, 23700, 23600, 23500, 23400, 23300, 23200, 23100, 23000]
  );
  assert.equal(envelope.signature.includes("23700"), true);
  assert.equal(envelope.signature.includes("23500"), true);
  assert.equal(envelope.signature.includes("23300"), true);
});

test("observer keeps untimed candidates for deterministic callers", () => {
  const candidates = [{ price: 3 }, { price: 2 }, { price: 1 }];
  assert.equal(observer.latestAxisPaintBurst(candidates), candidates);
});

test("native grid wins over near-duplicate TradingView markers in one candidate slot", () => {
  const native = Array.from({ length: 23 }, (_, index) => ({
    price: 18400 + index * 400,
    x: 1640,
    y: 700 - index * 29.7
  }));
  const markers = [
    { price: 22501.25, x: 1640, y: 412 },
    { price: 22501.3, x: 1640, y: 396 },
    { price: 18400, x: 1640, y: 700 }
  ];
  const grid = observer.dominantLinearCandidates([...native, ...markers]);
  assert.equal(grid.length, 23);
  assert.deepEqual(
    grid.map((candidate) => candidate.price).sort((a, b) => a - b),
    native.map((candidate) => candidate.price).sort((a, b) => a - b)
  );
});

test("native tick wins when an equal-price marker was painted first", () => {
  const marker = { price: 24200, x: 900, y: 200 };
  const native = [
    { price: 24200, x: 900, y: 80 },
    { price: 24100, x: 900, y: 120 },
    { price: 24000, x: 900, y: 160 }
  ];
  const grid = observer.dominantLinearCandidates([marker, ...native]);
  assert.deepEqual(grid.map((candidate) => candidate.y), [80, 120, 160]);
});
