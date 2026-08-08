"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const api = require("./premium-history-pane.js");

const selection = { instrumentKey: "NSE_INDEX|Nifty 50", expiry: "2026-08-25", strike: 24400, interval: "4h", from: "2026-07-01", to: "2026-08-01" };
const view = { points: Array.from({ length: 20 }, (_, index) => ({ time: index, call: { close: index + 1 }, put: { close: 20 - index } })), trades: [] };

test("missing crosshair timestamp never becomes Unix epoch", () => {
  assert.equal(api.activeTimeLabel(null), "AT CROSSHAIR");
  assert.equal(api.activeTimeLabel(undefined), "AT CROSSHAIR");
  assert.equal(api.activeTimeLabel(Number.NaN), "AT CROSSHAIR");
  assert.doesNotMatch(api.activeTimeLabel(null), /1970/);
});

test("Call and Put line emphasis switches reuse one loaded view", async () => {
  let requests = 0;
  const renders = [];
  const pane = api.createPremiumHistoryPane({
    loadHistory: async () => { requests += 1; return view; },
    render: (state) => renders.push(state.focusRight)
  });
  await pane.open(selection);
  pane.setFocusRight("PUT");
  pane.setFocusRight("CALL");
  assert.equal(requests, 1);
  assert.deepEqual(renders.slice(-2), ["PUT", "CALL"]);
});

test("on-chart premium projection is fixed to SKYLINE without mode state or extra history requests", async () => {
  let requests = 0;
  const pane = api.createPremiumHistoryPane({
    loadHistory: async () => { requests += 1; return view; },
    render: () => {}
  });
  await pane.open(selection);
  assert.equal(pane.state().chartMode, undefined);
  assert.equal(pane.setChartMode, undefined);
  assert.equal(requests, 1);
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
  assert.equal(pane.setMode("SPLIT"), false);
  assert.equal(pane.setMode("FOCUS"), false);
  assert.equal(pane.setMode("LINES"), true);
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

test("legacy TradingView calibration remains readable but is not required", () => {
  const xOf = api.timeXMapper({
    plotRect: { left: 100 },
    pairs: [{ time: 1000, x: 150 }, { time: 3000, x: 350 }]
  }, 400);
  assert.equal(xOf(1000), 50);
  assert.equal(xOf(2000), 150);
  assert.equal(xOf(3000), 250);
  assert.equal(xOf(4000), 350);
});

test("independent premium axis maps full contract history without TradingView evidence", () => {
  const points = [
    { time: Date.parse("2026-07-01T09:15:00+05:30") },
    { time: Date.parse("2026-07-15T09:15:00+05:30") },
    { time: Date.parse("2026-08-01T09:15:00+05:30") }
  ];
  const axis = api.independentTimeAxis(points, 1000, 5);
  assert.equal(axis.source, "PREMIUM_HISTORY");
  assert.equal(axis.from, points[0].time);
  assert.equal(axis.to, points[2].time);
  assert.equal(axis.xOf(points[0].time), 48);
  assert.equal(axis.xOf(points[2].time), 988);
  assert.ok(axis.ticks.length >= 2 && axis.ticks.length <= 5);
  assert.match(axis.ticks[0].label, /Jul/);
  assert.match(axis.ticks.at(-1).label, /Aug/);
});

test("independent premium axis rejects missing history instead of inventing dates", () => {
  assert.equal(api.independentTimeAxis([], 1000), null);
  assert.equal(api.independentTimeAxis([{ time: NaN }], 1000), null);
});

test("synchronized premium axis uses TradingView plot geometry and piecewise timestamps", () => {
  const axis = api.synchronizedTimeAxis({
    plotRect: { left: 100, top: 40, right: 1100, bottom: 700 },
    pairs: [
      { time: 1000, x: 200 },
      { time: 2000, x: 700 },
      { time: 4000, x: 1000 }
    ]
  }, 1000);
  assert.equal(axis.source, "TRADINGVIEW");
  assert.equal(axis.xOf(1000), 100);
  assert.equal(axis.xOf(2000), 600);
  assert.equal(axis.xOf(3000), 750);
  assert.equal(axis.timeAtClientX(850), 3000);
});

test("TradingView crosshair selects exact nearest premium candle and preserves screen x", () => {
  const timeAxis = {
    plotRect: { left: 100, top: 40, right: 1100, bottom: 700 },
    pairs: [{ time: 1000, x: 200 }, { time: 3000, x: 1000 }]
  };
  const points = [
    { time: 1000, call: { close: 10 } },
    { time: 2000, call: { close: 20 } },
    { time: 3000, call: { close: 30 } }
  ];
  assert.deepEqual(api.synchronizedCrosshair(points, timeAxis, 610), {
    clientX: 610,
    localX: 510,
    time: 2000,
    candle: points[1],
    point: points[1]
  });
});

test("TradingView crosshair snaps to exact underlying candle and reports true missing premium", () => {
  const timeAxis = {
    plotRect: { left: 100, top: 40, right: 1100, bottom: 700 },
    pairs: [{ time: 1000, x: 200 }, { time: 5000, x: 1000 }]
  };
  const points = [
    { time: 2000, underlying: { close: 24200 }, call: { close: 20 } },
    { time: 3000, underlying: { close: 24300 }, call: null, put: null },
    { time: 4000, underlying: { close: 24400 }, call: { close: 30 } }
  ];
  assert.deepEqual(api.synchronizedCrosshair(points, timeAxis, 590), {
    clientX: 590,
    localX: 490,
    time: 3000,
    candle: points[1],
    point: null
  });
});

test("TradingView crosshair outside every real candle reports unsnapped gap without fake timestamp", () => {
  const timeAxis = {
    plotRect: { left: 100, top: 40, right: 1100, bottom: 700 },
    pairs: [{ time: 1000, x: 200 }, { time: 5000, x: 1000 }]
  };
  const points = [
    { time: 3000, underlying: { close: 24300 }, call: { close: 20 } },
    { time: 4000, underlying: { close: 24400 }, call: { close: 30 } }
  ];
  assert.deepEqual(api.synchronizedCrosshair(points, timeAxis, 200), {
    clientX: 200,
    localX: 100,
    time: null,
    candle: null,
    point: null
  });
});

test("premium timeline excludes underlying-only dates before option contract history begins", () => {
  const points = [
    { time: 1, underlying: { close: 24000 }, call: null, put: null },
    { time: 2, underlying: { close: 24100 }, call: { close: 100 }, put: null },
    { time: 3, underlying: { close: 24200 }, call: null, put: { close: 120 } },
    { time: 4, underlying: { close: 24300 }, call: null, put: null }
  ];
  assert.deepEqual(api.premiumTimelinePoints(points).map((point) => point.time), [2, 3]);
});

test("line renderer preserves both premiums while selected side receives emphasis", () => {
  assert.deepEqual(api.rendererDescriptor("LINES", "CALL"), { mode: "LINES", call: "line", put: "dashed-line" });
  assert.deepEqual(api.rendererDescriptor("LINES", "PUT"), { mode: "LINES", call: "dashed-line", put: "line" });
  assert.equal(api.rendererDescriptor("SPLIT", "CALL"), null);
  assert.equal(api.rendererDescriptor("FOCUS", "PUT"), null);
});

test("dormant legacy renderer keeps Lines Call Put while production chart stays fixed to SKYLINE", () => {
  const source = require("node:fs").readFileSync(require("node:path").join(__dirname, "premium-history-pane.js"), "utf8");
  assert.match(source, />LINES<\/button>/);
  assert.match(source, />CALL<\/button><button type="button" data-right="PUT">PUT<\/button>/);
  assert.doesNotMatch(source, /data-chart-mode=/);
  assert.doesNotMatch(source, />CANDLES<\/button>|>HYBRID<\/button>/);
  assert.doesNotMatch(source, />SPLIT<\/button>|>FOCUS<\/button>/);
});

test("loaded history is ready without chart calibration", () => {
  assert.equal(api.emptyHistoryContext({ view: { points: [{ time: 1, call: { close: 10 } }] }, timeAxis: null }),
    "CONTRACT HISTORY READY");
  assert.equal(api.emptyHistoryContext({ view: { points: [{ time: 1, put: { close: 12 } }] }, timeAxis: { pairs: [] } }),
    "CONTRACT HISTORY READY");
  assert.equal(api.emptyHistoryContext({ view: { points: [] }, timeAxis: null }), "NO CONTRACT HISTORY");
  assert.equal(api.emptyHistoryContext({
    view: { points: [{ time: 1, underlying: { close: 24400 }, call: null, put: null }] },
    timeAxis: null
  }), "NO CONTRACT HISTORY");
});

test("selected strike touch requires real underlying high-low inclusion", () => {
  assert.equal(api.underlyingTouchesStrike({ underlying: { low: 24180, high: 24220 } }, 24200), true);
  assert.equal(api.underlyingTouchesStrike({ underlying: { low: 24200, high: 24240 } }, 24200), true);
  assert.equal(api.underlyingTouchesStrike({ underlying: { low: 24120, high: 24199.95 } }, 24200), false);
  assert.equal(api.underlyingTouchesStrike({ underlying: { close: 24200 } }, 24200), false);
  assert.equal(api.underlyingTouchesStrike({ underlying: { low: 24180, high: 24220 } }, null), false);
});

test("strike touch markers use TradingView time coordinates and visible candles only", () => {
  const timeAxis = {
    plotRect: { left: 100, top: 40, right: 1100, bottom: 700 },
    pairs: [{ time: 1000, x: 200 }, { time: 5000, x: 1000 }]
  };
  const points = [
    { time: 500, underlying: { low: 24100, high: 24300 } },
    { time: 2000, underlying: { low: 24190, high: 24210 } },
    { time: 3000, underlying: { low: 24201, high: 24300 } },
    { time: 4000, underlying: { low: 24100, high: 24200 } },
    { time: 6000, underlying: { low: 24100, high: 24300 } }
  ];
  assert.deepEqual(api.strikeTouchMarkers(points, 24200, timeAxis), [
    { time: 2000, clientX: 400 },
    { time: 4000, clientX: 800 }
  ]);
  assert.deepEqual(api.strikeTouchMarkers(points, 24200, null), []);
});
