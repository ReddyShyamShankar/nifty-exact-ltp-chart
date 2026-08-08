import assert from "node:assert/strict";
import test from "node:test";

import { createZerodhaClient } from "./zerodha-client.js";

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload; }
  };
}

function textResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return payload; },
    async json() { throw new Error("not json"); }
  };
}

test("exposes read-only evidence and margin-calculation methods with exact Kite signing", async () => {
  const calls = [];
  const client = createZerodhaClient({
    apiKey: "public-key",
    accessToken: "daily-token",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("/instruments/NFO")) return textResponse(200, "instrument_token,tradingsymbol\n1,NIFTY26AUG25000CE\n");
      return jsonResponse(200, { status: "success", data: url.endsWith("/trades") ? [] : { net: [], day: [] } });
    }
  });

  assert.deepEqual(Object.keys(client).sort(), [
    "calculateBasketMargins", "getFunds", "getInstrumentsNfo", "getPositions", "getTrades"
  ]);
  assert.deepEqual(await client.getPositions(), { status: "success", data: { net: [], day: [] } });
  assert.deepEqual(await client.getTrades(), { status: "success", data: [] });
  assert.deepEqual(await client.getFunds(), { status: "success", data: { net: [], day: [] } });
  assert.match(await client.getInstrumentsNfo(), /NIFTY26AUG25000CE/);
  const orders = [{ exchange: "NFO", tradingsymbol: "NIFTY26AUG25000CE" }];
  assert.deepEqual(await client.calculateBasketMargins(orders), { status: "success", data: { net: [], day: [] } });
  assert.deepEqual(calls.map((call) => call.url), [
    "https://api.kite.trade/portfolio/positions",
    "https://api.kite.trade/trades",
    "https://api.kite.trade/user/margins",
    "https://api.kite.trade/instruments/NFO",
    "https://api.kite.trade/margins/basket?consider_positions=false"
  ]);
  for (const call of calls.slice(0, 4)) {
    assert.equal(call.options.method, "GET");
    assert.equal(call.options.headers.Authorization, "token public-key:daily-token");
    assert.equal(call.options.headers["X-Kite-Version"], "3");
    assert.equal(call.options.body, undefined);
  }
  assert.equal(calls[4].options.method, "POST");
  assert.equal(calls[4].options.headers["Content-Type"], "application/json");
  assert.equal(calls[4].options.body, JSON.stringify(orders));
  assert.doesNotMatch(calls.map((call) => call.url).join("\n"), /\/orders(?:\/|$)/,
    "margin calculation never calls order placement routes");
});

test("fails closed on 401, clears the stale token once, and never retries", async () => {
  let calls = 0;
  let clears = 0;
  const client = createZerodhaClient({
    apiKey: "public-key",
    accessToken: "stale-token",
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse(401, { status: "error", message: "Token is invalid or has expired." });
    },
    onUnauthorized: async () => { clears += 1; }
  });

  await assert.rejects(client.getPositions(), (error) => {
    assert.equal(error.status, 401);
    assert.equal(error.kind, "auth");
    return true;
  });
  assert.equal(calls, 1);
  assert.equal(clears, 1);
});
