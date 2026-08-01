"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const api = require("./premium-history-pane.js");

const selection = { instrumentKey: "NSE_INDEX|Nifty 50", expiry: "2026-08-25", strike: 24400, interval: "4h", from: "2026-07-01", to: "2026-08-01" };
const view = { points: Array.from({ length: 20 }, (_, index) => ({ time: index, call: { close: index + 1 }, put: { close: 20 - index } })), trades: [] };

test("one open loads once while renderer switches reuse same view", async () => {
  let requests = 0;
  const renders = [];
  const pane = api.createPremiumHistoryPane({
    loadHistory: async () => { requests += 1; return view; },
    render: (state) => renders.push(state.mode)
  });
  await pane.open(selection);
  pane.setMode("SPLIT");
  pane.setMode("FOCUS");
  pane.setMode("LINES");
  assert.equal(requests, 1);
  assert.deepEqual(renders.slice(-3), ["SPLIT", "FOCUS", "LINES"]);
});

test("concurrent identical opens deduplicate and cached reopen makes no request", async () => {
  let requests = 0;
  let release;
  let requestSignal;
  const pane = api.createPremiumHistoryPane({
    loadHistory: (_selection, signal) => {
      requests += 1;
      requestSignal = signal;
      return new Promise((resolve) => { release = () => resolve(view); });
    },
    render: () => {}
  });
  const first = pane.open(selection);
  const second = pane.open(selection);
  assert.equal(requestSignal.aborted, false);
  release();
  await Promise.all([first, second]);
  pane.close();
  await pane.open(selection);
  assert.equal(requests, 1);
});

test("new selection wins stale response", async () => {
  const releases = [];
  const pane = api.createPremiumHistoryPane({
    loadHistory: (selected) => new Promise((resolve) => releases.push(() => resolve({ ...view, strike: selected.strike }))),
    render: () => {}
  });
  const first = pane.open(selection);
  const second = pane.open({ ...selection, strike: 24500 });
  releases[1]();
  releases[0]();
  await Promise.all([first, second]);
  assert.equal(pane.state().selection.strike, 24500);
  assert.equal(pane.state().view.strike, 24500);
});

test("invalid mode is rejected and close clears transient selection", async () => {
  const pane = api.createPremiumHistoryPane({ loadHistory: async () => view, render: () => {} });
  await pane.open(selection);
  assert.equal(pane.setMode("GRID"), false);
  assert.equal(pane.setFocusRight("PUT"), true);
  pane.close();
  assert.equal(pane.state().status, "closed");
  assert.equal(pane.state().selection, null);
});

test("viewport clipping limits draw work before renderer", () => {
  const points = Array.from({ length: 10000 }, (_, time) => ({ time }));
  const clipped = api.clipPoints(points, { from: 100, to: 199 });
  assert.equal(clipped.length, 100);
});

test("pane x coordinates follow TradingView time-axis calibration", () => {
  const xOf = api.timeXMapper({
    plotRect: { left: 100 },
    pairs: [{ time: 1000, x: 150 }, { time: 3000, x: 350 }]
  }, 400);
  assert.equal(xOf(1000), 50);
  assert.equal(xOf(2000), 150);
  assert.equal(xOf(3000), 250);
  assert.equal(xOf(4000), 350);
});

test("renderer descriptors preserve same data across modes", () => {
  assert.deepEqual(api.rendererDescriptor("LINES", "CALL"), { mode: "LINES", call: "line", put: "dashed-line" });
  assert.deepEqual(api.rendererDescriptor("SPLIT", "CALL"), { mode: "SPLIT", call: "candles", put: "candles" });
  assert.deepEqual(api.rendererDescriptor("FOCUS", "PUT"), { mode: "FOCUS", focus: "PUT", secondary: "CALL" });
});

test("loaded history waiting for chart calibration is not reported as missing", () => {
  assert.equal(api.emptyHistoryContext({ view: { points: [{ time: 1 }] }, timeAxis: null }),
    "CONTRACT HISTORY READY · WAITING FOR TIME AXIS");
  assert.equal(api.emptyHistoryContext({ view: { points: [{ time: 1 }] }, timeAxis: { pairs: [] } }),
    "NO HISTORY INSIDE VISIBLE CHART RANGE");
  assert.equal(api.emptyHistoryContext({ view: { points: [] }, timeAxis: null }), "NO CONTRACT HISTORY");
});
