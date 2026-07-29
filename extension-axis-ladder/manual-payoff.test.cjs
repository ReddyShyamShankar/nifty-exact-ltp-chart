const test = require("node:test");
const assert = require("node:assert/strict");
const payoff = require("./manual-payoff.js");

const leg = (overrides) => ({ id: "x", underlying: "NIFTY", expiry: "2026-08-25", strike: 24100,
  optionType: "CALL", direction: "SELL", lots: 1, premium: 358, ...overrides });

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

test("solver returns every root and detects fully flat payoff", () => {
  const butterfly = [leg({ strike: 24000, optionType: "CALL", direction: "BUY", premium: 300 }),
    leg({ strike: 24100, optionType: "CALL", direction: "SELL", lots: 2, premium: 220 }),
    leg({ strike: 24200, optionType: "CALL", direction: "BUY", premium: 160 })];
  assert.deepEqual(payoff.breakEvens(butterfly).points.map(Math.round), [24020, 24180]);
  assert.equal(payoff.breakEvens([leg({ id: "a", direction: "BUY" }), leg({ id: "b", direction: "SELL" })]).status, "flat");
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
