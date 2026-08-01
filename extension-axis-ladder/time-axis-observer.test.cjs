"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const api = require("./time-axis-observer.js");

test("parses exact date month-day and intraday labels against anchor", () => {
  const anchor = Date.parse("2026-08-01T00:00:00.000Z");
  assert.equal(api.parseTimeLabel("2026-07-30", anchor), Date.parse("2026-07-30T00:00:00.000Z"));
  assert.equal(api.parseTimeLabel("Jul 30", anchor), Date.parse("2026-07-30T00:00:00.000Z"));
  assert.equal(api.parseTimeLabel("09:15", anchor), Date.parse("2026-08-01T09:15:00.000Z"));
  assert.equal(api.parseTimeLabel("24,400", anchor), null);
});

test("parses TradingView month-only labels against nearest calendar occurrence", () => {
  const anchor = Date.parse("2026-08-01T00:00:00.000Z");
  assert.equal(api.parseTimeLabel("Mar", anchor), Date.parse("2026-03-01T00:00:00.000Z"));
  assert.equal(api.parseTimeLabel("Aug", anchor), Date.parse("2026-08-01T00:00:00.000Z"));
  assert.equal(api.parseTimeLabel("Nov", anchor), Date.parse("2026-11-01T00:00:00.000Z"));
});

test("stable monotonic pairs map timestamp to x", () => {
  const toX = api.timeToX([
    { time: Date.parse("2026-07-30T09:15:00Z"), x: 100 },
    { time: Date.parse("2026-07-30T10:15:00Z"), x: 300 },
    { time: Date.parse("2026-07-30T11:15:00Z"), x: 500 }
  ]);
  assert.equal(toX(Date.parse("2026-07-30T09:45:00Z")), 200);
});

test("ambiguous duplicate and non-monotonic evidence fails closed", () => {
  assert.equal(api.timeToX([{ time: 2, x: 100 }]), null);
  assert.equal(api.timeToX([{ time: 2, x: 100 }, { time: 1, x: 200 }]), null);
  assert.equal(api.timeToX([{ time: 1, x: 100 }, { time: 1, x: 200 }]), null);
});

test("observation becomes stable only after repeated signature", () => {
  const candidates = [{ time: 1, x: 100 }, { time: 2, x: 200 }];
  const first = api.observationEnvelope(candidates, null, 1);
  const second = api.observationEnvelope(candidates, first, 2);
  assert.equal(first.stableCount, 1);
  assert.equal(second.stableCount, 2);
  assert.equal(api.shouldPublish(second), true);
});

test("one valid idle paint can self-confirm without another TradingView redraw", () => {
  const first = api.observationEnvelope([{ time: 1, x: 100 }, { time: 2, x: 200 }], null, 1);
  const confirmed = api.confirmStableEnvelope(first, 2);
  assert.equal(confirmed.stableCount, 2);
  assert.equal(api.shouldPublish(confirmed), true);
});

test("time-axis canvas must sit directly below matching chart", () => {
  const chart = {
    getAttribute: () => "Chart for NSE_DLY:NIFTY, 4 hours",
    getBoundingClientRect: () => ({ left: 50, top: 40, right: 900, bottom: 600 })
  };
  const documentRef = { querySelectorAll: () => [chart] };
  assert.equal(api.chartSourceLabel({ left: 50, top: 600, right: 900, bottom: 630 }, documentRef), "Chart for NSE_DLY:NIFTY, 4 hours");
  assert.equal(api.chartSourceLabel({ left: 920, top: 40, right: 980, bottom: 600 }, documentRef), null);
});

test("non-time canvas text is rejected before any DOM geometry read", () => {
  let geometryReads = 0;
  const context = { canvas: {}, getTransform: () => ({ a: 1, c: 0, e: 0 }) };
  const candidate = api.projectedTimeFill(context, "24,400", 20, 30, () => {
    geometryReads += 1;
    return null;
  }, Date.parse("2026-08-01T00:00:00.000Z"));

  assert.equal(candidate, null);
  assert.equal(geometryReads, 0);
});

test("time-axis geometry is read once per canvas per animation frame", () => {
  let canvasRectReads = 0;
  let chartRectReads = 0;
  let chartQueries = 0;
  let nextFrame = null;
  const chart = {
    getAttribute: () => "Chart for NSE_DLY:NIFTY, 4 hours",
    getBoundingClientRect: () => {
      chartRectReads += 1;
      return { left: 50, top: 40, right: 900, bottom: 600, width: 850, height: 560 };
    }
  };
  const canvas = {
    width: 850,
    height: 30,
    getBoundingClientRect: () => {
      canvasRectReads += 1;
      return { left: 50, top: 600, right: 900, bottom: 630, width: 850, height: 30 };
    }
  };
  const readGeometry = api.createFrameGeometryReader({
    document: { querySelectorAll: () => {
      chartQueries += 1;
      return [chart];
    } },
    requestAnimationFrame: (callback) => { nextFrame = callback; }
  });

  assert.deepEqual(readGeometry(canvas), readGeometry(canvas));
  assert.equal(canvasRectReads, 1);
  assert.equal(chartQueries, 1);
  assert.equal(chartRectReads, 1);

  nextFrame();
  readGeometry(canvas);
  assert.equal(canvasRectReads, 2);
  assert.equal(chartQueries, 2);
  assert.equal(chartRectReads, 2);
});

test("pending time labels remain bounded during continuous repaint", () => {
  const pending = new Map();
  for (let index = 0; index < 5000; index += 1) {
    api.upsertBoundedCandidate(pending, { time: index, x: index, sourceLabel: "Chart" }, 64);
  }
  assert.equal(pending.size, 64);
  assert.deepEqual([...pending.values()].at(-1), { time: 4999, x: 4999, sourceLabel: "Chart" });
});
