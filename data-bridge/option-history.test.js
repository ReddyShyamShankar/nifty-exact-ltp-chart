import test from "node:test";
import assert from "node:assert/strict";
import {
  createOptionHistoryLoader,
  historyCacheKey,
  normalizeContractRef,
  normalizeProviderCandles,
  providerInterval
} from "./option-history.js";
import { createHistoryCache } from "./history-cache.js";

const request = {
  provider: "upstox",
  underlyingKey: "NSE_INDEX|Nifty 50",
  expiry: "2026-08-25",
  strike: 24400,
  callInstrumentKey: "NSE_FO|CALL",
  putInstrumentKey: "NSE_FO|PUT",
  interval: "4h",
  from: "2026-07-01",
  to: "2026-08-01"
};

test("normalizes exact provider-neutral contract identity", () => {
  assert.deepEqual(normalizeContractRef(request), {
    provider: "upstox",
    underlyingKey: "NSE_INDEX|Nifty 50",
    expiry: "2026-08-25",
    strike: 24400,
    callInstrumentKey: "NSE_FO|CALL",
    putInstrumentKey: "NSE_FO|PUT"
  });
  for (const invalid of [{}, { ...request, expiry: "2026-02-30" }, { ...request, strike: 0 }, { ...request, callInstrumentKey: "" }]) {
    assert.equal(normalizeContractRef(invalid), null);
  }
});

test("cache key isolates expiry strike interval and date range", () => {
  const base = historyCacheKey(request);
  for (const changed of [
    { expiry: "2026-09-01" }, { strike: 24450 }, { interval: "1h" },
    { from: "2026-07-02" }, { to: "2026-08-02" }
  ]) assert.notEqual(historyCacheKey({ ...request, ...changed }), base);
});

test("maps only exact supported TradingView intervals", () => {
  assert.deepEqual(providerInterval("1m"), { unit: "minutes", amount: 1 });
  assert.deepEqual(providerInterval("4h"), { unit: "hours", amount: 4 });
  assert.deepEqual(providerInterval("1M"), { unit: "months", amount: 1 });
  assert.equal(providerInterval("3M"), null);
});

test("normalizes genuine candles ascending without zero substitution", () => {
  const normalized = normalizeProviderCandles([
    ["2026-08-01T10:15:00+05:30", 10, 12, 9, 11, 100, 20],
    ["2026-08-01T09:15:00+05:30", 8, 10, 7, 9, 80, 10],
    ["bad", 0, 0, 0, 0, 0, 0],
    ["2026-08-01T11:15:00+05:30", null, 1, 1, 1, 1, 1]
  ]);
  assert.deepEqual(normalized.candles.map((row) => row.close), [9, 11]);
  assert.equal(normalized.gaps.length, 2);
  assert.equal(Object.isFrozen(normalized.candles[0]), true);
});

test("coordinated loader fetches Call Put underlying once and reuses cache", async () => {
  const calls = [];
  const loader = createOptionHistoryLoader({
    cache: createHistoryCache(),
    fetchCandles: async ({ instrumentKey }) => {
      calls.push(instrumentKey);
      return [["2026-08-01T09:15:00+05:30", 1, 2, 0.5, 1.5, 10, 2]];
    },
    now: () => new Date("2026-08-01T04:00:00.000Z")
  });
  const first = await loader(request);
  const second = await loader(request);
  assert.deepEqual(calls.sort(), ["NSE_FO|CALL", "NSE_FO|PUT", "NSE_INDEX|Nifty 50"].sort());
  assert.equal(first.call.candles[0].close, 1.5);
  assert.equal(first.updatedAt, "2026-08-01T04:00:00.000Z");
  assert.deepEqual(first, second);
});

test("loader rejects invalid request and never retries a failure", async () => {
  let calls = 0;
  const loader = createOptionHistoryLoader({
    cache: createHistoryCache(),
    fetchCandles: async () => { calls += 1; throw new Error("offline"); }
  });
  await assert.rejects(loader({ ...request, interval: "3M" }), /unsupported/i);
  assert.equal(calls, 0);
  await assert.rejects(loader(request), /offline/);
  assert.equal(calls, 3);
});
