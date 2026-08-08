const test = require("node:test");
const assert = require("node:assert/strict");
const payoff = require("./manual-payoff.js");

const leg = (overrides) => ({ id: "x", source: "MANUAL", underlying: "NIFTY", expiry: "2026-08-25", strike: 24100,
  optionType: "CALL", direction: "SELL", lots: 1, lotSize: 1, premium: 358, ...overrides });

test("four option directions use exact expiry payoff", () => {
  assert.equal(payoff.legPayoff(leg({ optionType: "CALL", direction: "BUY" }), 24500), 42);
  assert.equal(payoff.legPayoff(leg({ optionType: "CALL", direction: "SELL" }), 24500), -42);
  assert.equal(payoff.legPayoff(leg({ optionType: "PUT", direction: "BUY", strike: 24000, premium: 183 }), 23500), 317);
  assert.equal(payoff.legPayoff(leg({ optionType: "PUT", direction: "SELL", strike: 24000, premium: 183 }), 23500), -317);
});

test("approved lot changes move combined break-evens", () => {
  const put = leg({ id: "p", strike: 24000, optionType: "PUT", direction: "SELL", lots: 3, premium: 183 });
  const oneCall = leg({ id: "c1", lots: 1 });
  const twoCalls = leg({ id: "c2", lots: 2 });
  assert.deepEqual(payoff.breakEvens([oneCall, put]).points.map(Math.round), [23698, 25007]);
  assert.deepEqual(payoff.breakEvens([twoCalls, put]).points.map(Math.round), [23578, 24733]);
});

test("individual position P&L uses its own entry, live premium, direction, and lots", () => {
  assert.equal(payoff.positionPnl(
    leg({ optionType: "CALL", direction: "SELL", lots: 2, lotSize: 65, premium: 358 }),
    { strike: 24100, call: 418, put: 183 }
  ), -7800);
  assert.equal(payoff.positionPnl(
    leg({ optionType: "PUT", direction: "BUY", strike: 24000, lots: 3, lotSize: 65, premium: 183 }),
    { strike: 24000, call: 500, put: 200 }
  ), 3315);
  assert.equal(payoff.positionPnl(
    leg({ optionType: "PUT", direction: "BUY", strike: 24000, lots: 3, lotSize: 65, premium: 183 }),
    { strike: 24000, call: 500, put: 0 }
  ), null);
});

test("each leg uses its own contract size for payoff and current P&L", () => {
  const mixed = [
    leg({ id: "short-call-25", strike: 100, optionType: "CALL", direction: "SELL", premium: 10, lotSize: 25 }),
    leg({ id: "short-put-50", strike: 100, optionType: "PUT", direction: "SELL", premium: 10, lotSize: 50 }),
    leg({ id: "long-call-65", strike: 110, optionType: "CALL", direction: "BUY", premium: 2, lotSize: 65 })
  ];
  assert.equal(payoff.payoffAt(mixed, 120), 770);
  assert.equal(payoff.positionPnl(mixed[0], { strike: 100, call: 8, put: 8 }), 50);
  assert.equal(payoff.positionPnl(mixed[1], { strike: 100, call: 8, put: 8 }), 100);
  assert.equal(payoff.positionPnl(mixed[2], { strike: 110, call: 3, put: 1 }), 65);
});

test("mixed contract sizes weight break-even slopes and rupee charges directly", () => {
  const entries = [
    leg({ id: "call-25", strike: 100, optionType: "CALL", direction: "SELL", premium: 10, lotSize: 25 }),
    leg({ id: "put-50", strike: 100, optionType: "PUT", direction: "SELL", premium: 10, lotSize: 50 })
  ];
  const withoutCharges = payoff.breakEvens(entries).points;
  const withCharges = payoff.breakEvens(entries, 50).points;
  assert.ok(Math.abs(withoutCharges[0] - 85) <= 1e-9);
  assert.ok(Math.abs(withoutCharges[1] - 130) <= 1e-9);
  assert.ok(Math.abs(withCharges[0] - 86) <= 1e-9);
  assert.ok(Math.abs(withCharges[1] - 128) <= 1e-9);
  assert.equal(payoff.payoffAt(entries, 100, 50), 700);
});

test("legacy manual entry alone falls back to 65 while broker entry without lot size fails closed", () => {
  const legacyManual = leg({ source: "MANUAL", lotSize: undefined, lots: 2, premium: 10 });
  const unknownNonNiftyManual = leg({
    source: "MANUAL",
    instrumentKey: "NSE_INDEX|BANKNIFTY",
    underlying: "BANKNIFTY",
    lotSize: undefined,
    lots: 2,
    premium: 10
  });
  const missingBrokerSize = leg({ source: "BROKER_POSITION", lotSize: undefined, premium: 10 });
  assert.equal(payoff.positionPnl(legacyManual, { strike: 24100, call: 8, put: 8 }), 260);
  assert.equal(payoff.lotSizeForEntry(unknownNonNiftyManual), null);
  assert.equal(payoff.positionPnl(unknownNonNiftyManual, { strike: 24100, call: 8, put: 8 }), null);
  assert.equal(payoff.legPayoff(unknownNonNiftyManual, 24100), null);
  assert.deepEqual(payoff.breakEvens([unknownNonNiftyManual]), { status: "invalid", points: [] });
  assert.equal(payoff.positionPnl(missingBrokerSize, { strike: 24100, call: 8, put: 8 }, 65), null);
  assert.equal(payoff.legPayoff(missingBrokerSize, 24100), null);
  assert.deepEqual(payoff.breakEvens([missingBrokerSize]), { status: "invalid", points: [] });
});

test("solver returns every root and detects fully flat payoff", () => {
  const butterfly = [leg({ strike: 24000, optionType: "CALL", direction: "BUY", premium: 300 }),
    leg({ strike: 24100, optionType: "CALL", direction: "SELL", lots: 2, premium: 220 }),
    leg({ strike: 24200, optionType: "CALL", direction: "BUY", premium: 160 })];
  assert.deepEqual(payoff.breakEvens(butterfly).points.map(Math.round), [24020, 24180]);
  assert.equal(payoff.breakEvens([leg({ id: "a", direction: "BUY" }), leg({ id: "b", direction: "SELL" })]).status, "flat");
});

test("solver retains a zero crossing exactly at a strike knot", () => {
  const syntheticLong = [
    leg({ id: "call", strike: 100, optionType: "CALL", direction: "BUY", premium: 10 }),
    leg({ id: "put", strike: 100, optionType: "PUT", direction: "SELL", premium: 10 })
  ];
  assert.deepEqual(payoff.breakEvens(syntheticLong), { status: "ok", points: [100] });
  assert.equal(payoff.payoffAt(syntheticLong, 100), 0);
});

test("empty plans have no break-even points", () => {
  assert.deepEqual(payoff.breakEvens([]), { status: "empty", points: [] });
});

test("lower and upper tail roots stay numerically exact", () => {
  const call = leg({ strike: 100, optionType: "CALL", direction: "BUY", premium: 120 });
  const put = leg({ strike: 100, optionType: "PUT", direction: "BUY", premium: 80 });
  assert.deepEqual(payoff.breakEvens([call]).points, [220]);
  const putRoot = payoff.breakEvens([put]).points[0];
  const putResidual = Math.abs(payoff.payoffAt([put], putRoot));
  assert.ok(putResidual <= Number.EPSILON * Math.max(1, Math.abs(putRoot), put.premium));
});

test("solver preserves raw roots within machine precision", () => {
  const entry = leg({ strike: 24100, optionType: "CALL", direction: "BUY", premium: 358.123456789123 });
  const root = payoff.breakEvens([entry]).points[0];
  const expected = entry.strike + entry.premium;
  const residual = Math.abs(payoff.payoffAt([entry], root));
  assert.equal(root, expected);
  assert.ok(residual <= Number.EPSILON * Math.max(1, Math.abs(root)), `residual=${residual}`);
});

test("levels preserve exact roots and format rounded Indian labels", () => {
  const result = payoff.levels([leg({ strike: 24000, optionType: "CALL", direction: "BUY", premium: 300 }),
    leg({ strike: 24100, optionType: "CALL", direction: "SELL", lots: 2, premium: 220 }),
    leg({ strike: 24200, optionType: "CALL", direction: "BUY", premium: 160 })], "PREVIEW BE");
  assert.equal(result.status, "ok");
  assert.deepEqual(result.levels.map(({ kind, rounded, label }) => ({ kind, rounded, label })), [
    { kind: "plan", rounded: 24020, label: "PREVIEW BE 24,020" },
    { kind: "plan", rounded: 24180, label: "PREVIEW BE 24,180" }
  ]);
  assert.equal(result.levels[0].exact, 24020);
});

test("fixed charge offset moves roots without changing leg premiums", () => {
  const short = [
    leg({ id: "c", strike: 100, optionType: "CALL", direction: "SELL", premium: 10 }),
    leg({ id: "p", strike: 100, optionType: "PUT", direction: "SELL", premium: 10 })
  ];
  assert.deepEqual(payoff.breakEvens(short).points, [80, 120]);
  assert.deepEqual(payoff.breakEvens(short, 4).points, [84, 116]);
  assert.equal(payoff.payoffAt(short, 100, 4), 16);
});
