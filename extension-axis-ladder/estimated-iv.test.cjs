"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const api = require("./estimated-iv.js");

test("recovers known Black-Scholes Call and labels result", () => {
  const result = api.estimateIv({
    right: "CALL", optionPrice: 10.4506, spot: 100, strike: 100,
    years: 1, rate: 0.05, carry: 0, model: "BLACK_SCHOLES",
    assumptionVersion: "trial-v1", calculatedAt: "2026-08-01T00:00:00.000Z"
  });
  assert.ok(Math.abs(result.value - 0.2) < 0.0001);
  assert.equal(result.label, "ESTIMATED IV");
  assert.equal(result.assumptionVersion, "trial-v1");
});

test("Call and Put solve independently", () => {
  const call = api.estimateIv({ right: "CALL", optionPrice: 7.9656, spot: 100, strike: 100, years: 1, rate: 0, carry: 0, model: "BLACK_SCHOLES" });
  const put = api.estimateIv({ right: "PUT", optionPrice: 7.9656, spot: 100, strike: 100, years: 1, rate: 0, carry: 0, model: "BLACK_SCHOLES" });
  assert.ok(Math.abs(call.value - 0.2) < 0.0001);
  assert.ok(Math.abs(put.value - 0.2) < 0.0001);
});

test("impossible premium missing model and expiry fail closed", () => {
  const base = { right: "CALL", spot: 100, strike: 100, rate: 0, carry: 0, model: "BLACK_SCHOLES" };
  assert.equal(api.estimateIv({ ...base, optionPrice: 200, years: 1 }), null);
  assert.equal(api.estimateIv({ ...base, optionPrice: 10, years: 0 }), null);
  assert.equal(api.estimateIv({ ...base, optionPrice: 10, years: 1, model: null }), null);
});
