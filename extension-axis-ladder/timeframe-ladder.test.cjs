const test = require("node:test");
const assert = require("node:assert/strict");
const api = require("./timeframe-ladder.js");

test("normalizes supported TradingView labels", () => {
  assert.equal(api.timeframeKey("Chart for NSE_DLY:NIFTY, 1 minute"), "1m");
  assert.equal(api.timeframeKey("Chart for NSE_DLY:NIFTY, 5 minutes"), "5m");
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

test("selects only native right-axis strikes while retaining ATM metadata", () => {
  const rows = Array.from({ length: 81 }, (_, index) => ({
    strike: 22000 + index * 50,
    call: index,
    put: index + 100
  }));

  const selection = api.selectAxisAlignedRows(rows, 24295.05, [23400, 23700, 24000]);

  assert.equal(api.preferredIntervalForTimeframe, undefined);
  assert.equal(selection.center, 24300);
  assert.deepEqual(selection.rows.map((row) => row.strike), [23400, 23700, 24000]);
  assert.equal(selection.interval, 300);
});

test("native right-axis zoom alone controls row density", () => {
  const rows = Array.from({ length: 81 }, (_, index) => ({ strike: 22000 + index * 50 }));

  const zoomedIn = api.selectAxisAlignedRows(rows, 24276.65, [24100, 24200, 24300, 24400, 24500]);
  const zoomedOut = api.selectAxisAlignedRows(rows, 24276.65, [23700, 24000, 24300]);

  assert.deepEqual(zoomedIn.rows.map((row) => row.strike), [24100, 24200, 24300, 24400, 24500]);
  assert.deepEqual(zoomedOut.rows.map((row) => row.strike), [23700, 24000, 24300]);
  assert.equal(zoomedIn.interval, 100);
  assert.equal(zoomedOut.interval, 300);
});

test("pins real ATM strike when it sits inside visible TradingView range but between grid labels", () => {
  const rows = Array.from({ length: 81 }, (_, index) => ({ strike: 22000 + index * 50 }));

  const selection = api.selectAxisAlignedRows(rows, 24276.65, [23600, 23800, 24000, 24200, 24400, 24600]);

  assert.equal(selection.center, 24300);
  assert.deepEqual(selection.rows.map((row) => row.strike), [23600, 23800, 24000, 24200, 24300, 24400, 24600]);
});

test("does not pin ATM when its exact strike lies outside visible TradingView range", () => {
  const rows = Array.from({ length: 81 }, (_, index) => ({ strike: 22000 + index * 50 }));

  const selection = api.selectAxisAlignedRows(rows, 24276.65, [23000, 23200, 23400, 23600]);

  assert.equal(selection.center, 24300);
  assert.deepEqual(selection.rows.map((row) => row.strike), [23000, 23200, 23400, 23600]);
});

test("restores rounded TradingView grid slot hidden by live-price marker", () => {
  const rows = Array.from({ length: 81 }, (_, index) => ({ strike: 22000 + index * 50 }));

  const selection = api.selectAxisAlignedRows(rows, 24296.60, [24000, 24100, 24200, 24400, 24500]);

  assert.deepEqual(selection.axisPrices, [24000, 24100, 24200, 24300, 24400, 24500]);
  assert.deepEqual(selection.rows.map((row) => row.strike), [24000, 24100, 24200, 24300, 24400, 24500]);
});

test("ignores live-price marker when it distorts neighboring TradingView grid gaps", () => {
  const rows = Array.from({ length: 81 }, (_, index) => ({ strike: 22000 + index * 50 }));
  const axisPrices = [24000, 24100, 24200, 24296.6, 24400, 24500];

  assert.equal(api.nativeAxisInterval(axisPrices), 100);
  assert.deepEqual(api.stableAxisGrid(axisPrices), [24000, 24100, 24200, 24300, 24400, 24500]);

  const selection = api.selectAxisAlignedRows(rows, 24296.6, axisPrices);
  assert.deepEqual(selection.rows.map((row) => row.strike), [24000, 24100, 24200, 24300, 24400, 24500]);
});

test("uses real decimal strikes for a non-NIFTY instrument", () => {
  const rows = [1.05, 1.10, 1.15, 1.20, 1.25].map((strike) => ({ strike }));

  const selection = api.selectAxisAlignedRows(rows, 1.12, [1.00, 1.10, 1.20, 1.30]);

  assert.equal(selection.center, 1.10);
  assert.equal(selection.interval, 0.1);
  assert.equal(selection.atmStep, 0.05);
  assert.deepEqual(selection.rows.map((row) => row.strike), [1.10, 1.20]);
});

test("returns every real strike on visible TradingView grid without row cap", () => {
  const rows = Array.from({ length: 25 }, (_, index) => ({ strike: 100 + index * 10 }));
  const axisPrices = rows.map((row) => row.strike);

  const selection = api.selectAxisAlignedRows(rows, 220, axisPrices);

  assert.equal(selection.rows.length, 25);
  assert.deepEqual(selection.rows.map((row) => row.strike), axisPrices);
});

test("ATM uses nearest real strike with directional midpoint tie", () => {
  const rows = [100, 110, 120].map((strike) => ({ strike }));
  assert.equal(api.nearestAvailableStrike(rows, 114), 110);
  assert.equal(api.nearestAvailableStrike(rows, 115, "up"), 120);
  assert.equal(api.nearestAvailableStrike(rows, 115, "down"), 110);
});
