import assert from "node:assert/strict";
import test from "node:test";

import { normalizeNiftyPositions, normalizeNiftyTrades } from "./zerodha-normalize.js";
import { startServer } from "./server.js";

async function close(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function runningServer(overrides = {}) {
  const sessionStore = overrides.sessionStore || {
    status: async () => ({ configured: true, connected: true, expiresAt: "2026-07-29T00:30:00.000Z" }),
    loginUrl: async () => "https://kite.zerodha.com/connect/login?v=3&api_key=public-key",
    exchangeRequestToken: async () => ({ configured: true, connected: true, expiresAt: "2026-07-29T00:30:00.000Z" }),
    credentials: async () => ({ apiKey: "public-key", accessToken: "daily-token", onUnauthorized: async () => {} })
  };
  return startServer({
    host: "127.0.0.1",
    port: 0,
    sessionStore,
    zerodhaClientFactory: overrides.zerodhaClientFactory || (() => ({
      getPositions: async () => ({ status: "success", data: { net: [] } }),
      getTrades: async () => ({ status: "success", data: [] })
    })),
    chainLoader: overrides.chainLoader || (async (expiry) => ({ source: "Upstox", expiry, rows: [] })),
    normalizePositions: normalizeNiftyPositions,
    normalizeTrades: normalizeNiftyTrades,
    now: () => new Date("2026-07-28T18:15:00.000Z")
  });
}

function baseUrl(server) {
  return `http://127.0.0.1:${server.address().port}`;
}

test("serves Zerodha status, login URL, and callback without returning any token", async (t) => {
  const exchanged = [];
  const sessionStore = {
    status: async () => ({ configured: true, connected: false, expiresAt: null }),
    loginUrl: async () => "https://kite.zerodha.com/connect/login?v=3&api_key=public-key",
    exchangeRequestToken: async (requestToken) => {
      exchanged.push(requestToken);
      return { configured: true, connected: true, expiresAt: "2026-07-29T00:30:00.000Z" };
    },
    credentials: async () => { throw new Error("unused"); }
  };
  const server = await runningServer({ sessionStore });
  t.after(() => close(server));

  const status = await (await fetch(`${baseUrl(server)}/api/zerodha/status`)).json();
  const login = await (await fetch(`${baseUrl(server)}/api/zerodha/login-url`)).json();
  const callbackResponse = await fetch(`${baseUrl(server)}/api/zerodha/callback?request_token=one-time-token`);
  const callback = await callbackResponse.json();

  assert.deepEqual(status, { configured: true, connected: false, expiresAt: null });
  assert.deepEqual(login, { loginUrl: "https://kite.zerodha.com/connect/login?v=3&api_key=public-key" });
  assert.deepEqual(callback, { configured: true, connected: true, expiresAt: "2026-07-29T00:30:00.000Z" });
  assert.deepEqual(exchanged, ["one-time-token"]);
  assert.doesNotMatch(JSON.stringify({ status, login, callback }), /one-time-token|daily-token|access.?token|api.?secret/i);
});

test("one seller refresh coordinates positions, trades, and chain exactly once", async (t) => {
  const calls = { positions: 0, trades: 0, chain: 0 };
  const server = await runningServer({
    zerodhaClientFactory: () => ({
      getPositions: async () => {
        calls.positions += 1;
        return { status: "success", data: { net: [{
          exchange: "NFO", tradingsymbol: "NIFTY26AUG24100CE", quantity: -65,
          average_price: 358.8, last_price: 320, pnl: 2522
        }] } };
      },
      getTrades: async () => {
        calls.trades += 1;
        return { status: "success", data: [{
          trade_id: "trade-1", exchange: "NFO", tradingsymbol: "NIFTY26AUG24100CE",
          transaction_type: "SELL", quantity: 65, average_price: 358.8,
          fill_timestamp: "2026-08-01 09:15:00"
        }] };
      }
    }),
    chainLoader: async (expiry) => {
      calls.chain += 1;
      return { source: "Upstox", expiry, spot: 23900, rows: [] };
    }
  });
  t.after(() => close(server));

  const response = await fetch(`${baseUrl(server)}/api/seller-refresh?expiry=2026-08-25`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(calls, { positions: 1, trades: 1, chain: 1 });
  assert.equal(payload.updatedAt, "2026-07-28T18:15:00.000Z");
  assert.equal(payload.positions[0].contractId, "NFO:NIFTY26AUG24100CE");
  assert.equal(payload.trades[0].id, "trade-1");
  assert.equal(payload.chain.expiry, "2026-08-25");
  assert.doesNotMatch(JSON.stringify(payload), /daily-token|access.?token|api.?secret/i);
});

test("invalid exact ISO expiry fails before every upstream call", async (t) => {
  const calls = { client: 0, chain: 0, credentials: 0 };
  const sessionStore = {
    status: async () => ({}), loginUrl: async () => "",
    exchangeRequestToken: async () => ({}),
    credentials: async () => { calls.credentials += 1; return {}; }
  };
  const server = await runningServer({
    sessionStore,
    zerodhaClientFactory: () => { calls.client += 1; return {}; },
    chainLoader: async () => { calls.chain += 1; return {}; }
  });
  t.after(() => close(server));

  const response = await fetch(`${baseUrl(server)}/api/seller-refresh?expiry=2026-02-30`);
  assert.equal(response.status, 400);
  assert.deepEqual(calls, { client: 0, chain: 0, credentials: 0 });
});

test("an upstream failure returns one error and performs no automatic retry", async (t) => {
  const calls = { positions: 0, trades: 0, chain: 0 };
  const server = await runningServer({
    zerodhaClientFactory: () => ({
      getPositions: async () => { calls.positions += 1; throw Object.assign(new Error("positions unavailable"), { status: 502, kind: "upstream" }); },
      getTrades: async () => { calls.trades += 1; return { status: "success", data: [] }; }
    }),
    chainLoader: async () => { calls.chain += 1; return { rows: [] }; }
  });
  t.after(() => close(server));

  const response = await fetch(`${baseUrl(server)}/api/seller-refresh?expiry=2026-08-25`);
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: "positions unavailable", kind: "upstream" });
  assert.deepEqual(calls, { positions: 1, trades: 1, chain: 1 });
});
