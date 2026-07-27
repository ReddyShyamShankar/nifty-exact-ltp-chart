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

test("uses stable strike spacing for each supported timeframe", () => {
  assert.equal(api.preferredIntervalForTimeframe("15m"), 50);
  assert.equal(api.preferredIntervalForTimeframe("1h"), 50);
  assert.equal(api.preferredIntervalForTimeframe("4h"), 100);
  assert.equal(api.preferredIntervalForTimeframe("1D"), 100);
  assert.equal(api.preferredIntervalForTimeframe("1W"), 250);
  assert.equal(api.preferredIntervalForTimeframe("1M"), 500);
  assert.equal(api.preferredIntervalForTimeframe("3M"), 1000);
  assert.equal(api.preferredIntervalForTimeframe("6M"), 2000);
  assert.equal(api.preferredIntervalForTimeframe("2h"), null);
});

test("snaps scale intervals to 50-point grid with a 50-point minimum", () => {
  assert.equal(api.snapStrikeInterval(1), 50);
  assert.equal(api.snapStrikeInterval(24), 50);
  assert.equal(api.snapStrikeInterval(93), 100);
  assert.equal(api.snapStrikeInterval(238), 250);
  assert.equal(api.snapStrikeInterval(487), 500);
});

test("uses the minimum real NIFTY contract step when native ticks are tighter than 50 points", () => {
  assert.equal(api.maxStrikeInterval(25), 50);
  assert.equal(api.maxStrikeInterval(49), 50);
  assert.equal(api.maxStrikeInterval(50), 50);
  assert.equal(api.maxStrikeInterval(93), 50);
  assert.equal(api.maxStrikeInterval(238), 200);
  assert.equal(api.maxStrikeInterval(487), 450);
});

test("selects exact 50-point contracts when TradingView native ticks are 25 points", () => {
  const rows = Array.from({ length: 101 }, (_, index) => ({
    strike: 21300 + index * 50,
    call: index,
    put: index + 100
  }));

  const selection = api.selectExactThirteen(rows, 23767.45, api.maxStrikeInterval(25));

  assert.equal(selection.interval, 50);
  assert.equal(selection.center, 23750);
  assert.deepEqual(selection.rows.map((row) => Number(row.strike)), [
    23450, 23500, 23550, 23600, 23650, 23700, 23750,
    23800, 23850, 23900, 23950, 24000, 24050
  ]);
});

test("builds six below, ATM, and six above", () => {
  assert.deepEqual(api.thirteenStrikes(23767.45, 100), [
    23200, 23300, 23400, 23500, 23600, 23700, 23800,
    23900, 24000, 24100, 24200, 24300, 24400
  ]);
});

test("directional midpoint ties recenter toward price movement", () => {
  assert.equal(api.thirteenStrikes(23850, 100, "up")[6], 23900);
  assert.equal(api.thirteenStrikes(23750, 100, "down")[6], 23700);
});

test("chooses the widest exact 13-strike interval available instead of clumping at chain edges", () => {
  const rows = Array.from({ length: 101 }, (_, index) => ({
    strike: 21300 + index * 50,
    call: index,
    put: index + 100
  }));

  const selection = api.selectExactThirteen(rows, 23767.45, 1000);

  assert.equal(selection.interval, 400);
  assert.equal(selection.center, 23750);
  assert.equal(selection.atmStep, 50);
  assert.deepEqual(selection.rows.map((row) => Number(row.strike)), [
    21350, 21750, 22150, 22550, 22950, 23350, 23750,
    24150, 24550, 24950, 25350, 25750, 26150
  ]);
});

test("true ATM comes from nearest real contract and never from display spacing", () => {
  const rows = Array.from({ length: 101 }, (_, index) => ({ strike: 21300 + index * 50 }));

  assert.equal(api.nearestAvailableStrike(rows, 23767.45), 23750);
  assert.equal(api.nearestAvailableStrike(rows, 23775, "up"), 23800);
  assert.equal(api.nearestAvailableStrike(rows, 23775, "down"), 23750);
  assert.deepEqual(api.strikesFromCenter(23750, 400), [
    21350, 21750, 22150, 22550, 22950, 23350, 23750,
    24150, 24550, 24950, 25350, 25750, 26150
  ]);
});

test("missing canonical 50-point ATM fails instead of substituting another contract", () => {
  const rows = Array.from({ length: 101 }, (_, index) => ({ strike: 21300 + index * 50 }))
    .filter((row) => row.strike !== 23750);
  assert.equal(api.nearestAvailableStrike(rows, 23767.45), null);
  assert.equal(api.selectExactThirteen(rows, 23767.45, 400), null);
});

test("partial response cannot redefine NIFTY ATM step", () => {
  const rows = Array.from({ length: 21 }, (_, index) => ({ strike: 22800 + index * 100 }));
  assert.equal(api.availableStrikeStep(rows), 50);
});

test("exact 13-strike selection fails closed when no complete symmetric range exists", () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({ strike: 23500 + index * 50 }));
  assert.equal(api.selectExactThirteen(rows, 23767.45, 500), null);
});
