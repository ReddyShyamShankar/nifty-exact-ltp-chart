"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const api = require("./premium-history-model.js");

const candle = (time, close) => ({ time, timestamp: Date.parse(time), open: close - 1, high: close + 1, low: close - 2, close, volume: 10, oi: 2 });
const times = ["2026-08-01T09:15:00+05:30", "2026-08-01T10:15:00+05:30"];
function envelope() {
  return {
    identity: { provider: "upstox", underlyingKey: "NSE_INDEX|Nifty 50", expiry: "2026-08-25", strike: 24400 },
    interval: "1h",
    call: { candles: [candle(times[0], 290), candle(times[1], 300)], gaps: [] },
    put: { candles: [candle(times[0], 260), candle(times[1], 250)], gaps: [] },
    underlying: { candles: [candle(times[0], 24392), candle(times[1], 24410)], gaps: [] }
  };
}

test("joins exact timestamps and calculates distance DTE and total", () => {
  const view = api.buildViewModel(envelope(), {
    expiryAt: "2026-08-25T15:30:00+05:30",
    trades: []
  });
  assert.equal(view.points.length, 2);
  assert.equal(view.points[0].combinedClose, 550);
  assert.equal(view.points[0].distance, -8);
  assert.ok(view.points[0].dteDays > 24 && view.points[0].dteDays < 25);
});

test("missing side remains gap and is never forward-filled", () => {
  const data = envelope();
  data.put.candles.pop();
  const view = api.buildViewModel(data, { expiryAt: "2026-08-25T15:30:00+05:30", trades: [] });
  assert.equal(view.points[1].put, null);
  assert.equal(view.points[1].combinedClose, null);
});

test("same-contract repeated trades remain separate and foreign identity is excluded", () => {
  const trades = [
    { id: "a", underlying: "NIFTY", expiry: "2026-08-25", strike: 24400, optionType: "CALL", direction: "SELL", lots: 1, premium: 290, createdAt: times[0] },
    { id: "b", underlying: "NIFTY", expiry: "2026-08-25", strike: 24400, optionType: "CALL", direction: "SELL", lots: 1, premium: 300, createdAt: times[1] },
    { id: "c", underlying: "NIFTY", expiry: "2026-09-01", strike: 24400, optionType: "CALL", direction: "SELL", lots: 1, premium: 310, createdAt: times[1] }
  ];
  const view = api.buildViewModel(envelope(), { expiryAt: "2026-08-25T15:30:00+05:30", trades });
  assert.deepEqual(view.trades.map((trade) => trade.id), ["a", "b"]);
});

test("clips to visible range without mutating full view", () => {
  const view = api.buildViewModel(envelope(), { expiryAt: "2026-08-25T15:30:00+05:30", trades: [] });
  const clipped = api.clipToRange(view, { from: Date.parse(times[1]), to: Date.parse(times[1]) });
  assert.equal(clipped.points.length, 1);
  assert.equal(view.points.length, 2);
  assert.equal(api.nearestTimestamp(view.points, Date.parse(times[1]) - 1000).time, Date.parse(times[1]));
});
