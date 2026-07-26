const test = require("node:test");
const assert = require("node:assert/strict");
const api = require("./timeframe-ladder.js");

test("normalizes supported TradingView labels", () => {
  assert.equal(api.timeframeKey("Chart for NSE_DLY:NIFTY, 15 minutes"), "15m");
  assert.equal(api.timeframeKey("Chart for NSE_DLY:NIFTY, 1 hour"), "1h");
  assert.equal(api.timeframeKey("Chart for NSE_DLY:NIFTY, 4 hours"), "4h");
  assert.equal(api.timeframeKey("Chart for NSE_DLY:NIFTY, 1 day"), "1D");
  assert.equal(api.timeframeKey("Chart for NSE_DLY:NIFTY, 1 week"), "1W");
  assert.equal(api.timeframeKey("Chart for NSE_DLY:NIFTY, 1 month"), "1M");
  assert.equal(api.timeframeKey("Chart for NSE_DLY:NIFTY, 3 months"), "3M");
  assert.equal(api.timeframeKey("Chart for NSE_DLY:NIFTY, 6 months"), "6M");
});

test("returns null for unsupported timeframe labels", () => {
  assert.equal(api.timeframeKey("Chart for NSE_DLY:NIFTY, 2 minutes"), null);
  assert.equal(api.timeframeKey(""), null);
});

test("snaps scale intervals to 50-point grid with a 50-point minimum", () => {
  assert.equal(api.snapStrikeInterval(1), 50);
  assert.equal(api.snapStrikeInterval(24), 50);
  assert.equal(api.snapStrikeInterval(93), 100);
  assert.equal(api.snapStrikeInterval(238), 250);
  assert.equal(api.snapStrikeInterval(487), 500);
});

test("builds six below, ATM, and six above", () => {
  assert.deepEqual(api.thirteenStrikes(23767.45, 100), [
    23200, 23300, 23400, 23500, 23600, 23700, 23800,
    23900, 24000, 24100, 24200, 24300, 24400
  ]);
});

test("selects exact chain rows once and omits missing strikes", () => {
  const rows = [
    { strike: 23800, call: 101, put: 202 },
    { strike: "23900", call: 102, put: 203 },
    { strike: 23900, call: 999, put: 999 },
    { strike: 24050, call: 103, put: 204 }
  ];

  assert.deepEqual(api.selectAvailable(rows, [23800, 23900, 24000]), [
    { strike: 23800, call: 101, put: 202 },
    { strike: "23900", call: 102, put: 203 }
  ]);
});
