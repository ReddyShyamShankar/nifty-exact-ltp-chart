import assert from "node:assert/strict";
import test from "node:test";

import { normalizeNiftyPositions, normalizeNiftyTrades } from "./zerodha-normalize.js";
import * as bridgeServer from "./server.js";

const { createRequestHandler, startServer } = bridgeServer;
const EXTENSION_ORIGIN = "chrome-extension://hjgknhdbplfoeldaalpidhkahnfldjem";

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
    optionHistoryLoader: overrides.optionHistoryLoader,
    expiryLoader: overrides.expiryLoader || (async () => ({ source: "Upstox", expiries: [] })),
    expiryMetadata: overrides.expiryMetadata || ((expiry) => ({ expiry, weekly: false, lotSize: 65 })),
    normalizePositions: normalizeNiftyPositions,
    normalizeTrades: normalizeNiftyTrades,
    extensionOrigin: overrides.extensionOrigin || EXTENSION_ORIGIN,
    now: () => new Date("2026-07-28T18:15:00.000Z")
  });
}

test("chain formatter retains exact Call and Put provider keys", () => {
  const result = bridgeServer.formatChain([{
    strike_price: 24400,
    expiry: "2026-08-25",
    underlying_spot_price: 24392,
    call_options: { instrument_key: "NSE_FO|CALL", market_data: { ltp: 290 } },
    put_options: { instrument_key: "NSE_FO|PUT", market_data: { ltp: 260 } }
  }]);
  assert.equal(result.rows[0].callInstrumentKey, "NSE_FO|CALL");
  assert.equal(result.rows[0].putInstrumentKey, "NSE_FO|PUT");
});

test("chain formatter retains separate validated Call and Put open interest", () => {
  const result = bridgeServer.formatChain([{
    strike_price: 24400,
    underlying_spot_price: 24392,
    call_options: { market_data: { ltp: 290, oi: 1820000 } },
    put_options: { market_data: { ltp: 260, oi: 2470000 } }
  }, {
    strike_price: 24350,
    underlying_spot_price: 24392,
    call_options: { market_data: { ltp: 315, oi: -1 } },
    put_options: { market_data: { ltp: 240, oi: "not-a-number" } }
  }]);

  assert.deepEqual(result.rows.map(({ strike, callOi, putOi }) => ({ strike, callOi, putOi })), [
    { strike: 24400, callOi: 1820000, putOi: 2470000 },
    { strike: 24350, callOi: null, putOi: null }
  ]);
});

test("Upstox history range splits inside documented minute and hourly limits", () => {
  const minute = bridgeServer.splitHistoricalRange({ unit: "minutes", amount: 1 }, "2026-05-01", "2026-08-01");
  assert.ok(minute.length >= 4);
  assert.equal(minute[0].from, "2026-05-01");
  assert.equal(minute.at(-1).to, "2026-08-01");
  minute.forEach((chunk) => {
    assert.ok((Date.parse(`${chunk.to}T00:00:00Z`) - Date.parse(`${chunk.from}T00:00:00Z`)) / 86400000 < 28);
  });

  const hourly = bridgeServer.splitHistoricalRange({ unit: "hours", amount: 4 }, "2025-08-25", "2026-08-01");
  assert.ok(hourly.length >= 4);
  hourly.forEach((chunk) => {
    assert.ok((Date.parse(`${chunk.to}T00:00:00Z`) - Date.parse(`${chunk.from}T00:00:00Z`)) / 86400000 < 89);
  });
  assert.deepEqual(bridgeServer.splitHistoricalRange({ unit: "days", amount: 1 }, "2025-08-25", "2026-08-01"), [
    { from: "2025-08-25", to: "2026-08-01" }
  ]);
});

test("option history validates request before upstream and returns exact envelope", async (t) => {
  let loads = 0;
  const server = await runningServer({
    optionHistoryLoader: async (request) => {
      loads += 1;
      return { version: 1, identity: { expiry: request.expiry, strike: request.strike }, interval: request.interval };
    }
  });
  t.after(() => close(server));

  const invalid = await accountFetch(server, "/api/option-history?expiry=bad&strike=24400&interval=4h&from=2026-07-01&to=2026-08-01");
  assert.equal(invalid.status, 400);
  assert.equal(loads, 0);

  const valid = await accountFetch(server, "/api/option-history?expiry=2026-08-25&strike=24400&interval=4h&from=2026-07-01&to=2026-08-01");
  assert.equal(valid.status, 200);
  assert.equal(valid.headers.get("access-control-allow-origin"), EXTENSION_ORIGIN);
  assert.deepEqual(await valid.json(), {
    version: 1,
    identity: { expiry: "2026-08-25", strike: 24400 },
    interval: "4h"
  });
  assert.equal(loads, 1);
});

test("option history failure returns stable kind and makes no automatic retry", async (t) => {
  let loads = 0;
  const server = await runningServer({
    optionHistoryLoader: async () => {
      loads += 1;
      throw Object.assign(new Error("History unavailable."), { status: 429, kind: "rate_limit" });
    }
  });
  t.after(() => close(server));
  const response = await accountFetch(server, "/api/option-history?expiry=2026-08-25&strike=24400&interval=4h&from=2026-07-01&to=2026-08-01");
  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), { error: "History unavailable.", kind: "rate_limit" });
  assert.equal(loads, 1);
});

function baseUrl(server) {
  return `http://127.0.0.1:${server.address().port}`;
}

function accountFetch(server, path, origin = EXTENSION_ORIGIN) {
  return fetch(`${baseUrl(server)}${path}`, { headers: { Origin: origin } });
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

  const statusResponse = await accountFetch(server, "/api/zerodha/status");
  const loginResponse = await accountFetch(server, "/api/zerodha/login-url");
  const status = await statusResponse.json();
  const login = await loginResponse.json();
  const callbackResponse = await fetch(`${baseUrl(server)}/api/zerodha/callback?request_token=one-time-token`, {
    headers: { Origin: "https://attacker.example" }
  });
  const callback = await callbackResponse.json();

  assert.equal(statusResponse.headers.get("access-control-allow-origin"), EXTENSION_ORIGIN);
  assert.equal(loginResponse.headers.get("access-control-allow-origin"), EXTENSION_ORIGIN);
  assert.equal(callbackResponse.headers.get("access-control-allow-origin"), null);
  assert.deepEqual(status, { configured: true, connected: false, expiresAt: null });
  assert.deepEqual(login, { loginUrl: "https://kite.zerodha.com/connect/login?v=3&api_key=public-key" });
  assert.deepEqual(callback, { configured: true, connected: true, expiresAt: "2026-07-29T00:30:00.000Z" });
  assert.deepEqual(exchanged, ["one-time-token"]);
  assert.doesNotMatch(JSON.stringify({ status, login, callback }), /one-time-token|daily-token|access.?token|api.?secret/i);
});

test("callback exposes one fixed failure while preserving status and kind without logging secrets", async (t) => {
  const upstreamSecret = "request_token=request-secret checksum=checksum-secret access_token=token-secret api_secret=body-secret";
  const error = Object.assign(new Error(upstreamSecret), {
    status: 403,
    kind: "auth",
    body: { message: upstreamSecret },
    requestToken: "request-secret",
    checksum: "checksum-secret",
    accessToken: "token-secret"
  });
  const logs = [];
  t.mock.method(console, "error", (...values) => logs.push(values.join(" ")));
  const server = await runningServer({
    sessionStore: {
      status: async () => ({}),
      loginUrl: async () => "",
      exchangeRequestToken: async () => { throw error; },
      credentials: async () => ({})
    }
  });
  t.after(() => close(server));

  const response = await fetch(`${baseUrl(server)}/api/zerodha/callback?request_token=request-secret`);
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.deepEqual(payload, {
    error: "Zerodha connection failed. Return to the extension and try again.",
    kind: "auth"
  });
  assert.doesNotMatch(JSON.stringify(payload), /request-secret|checksum-secret|token-secret|body-secret|request_token|checksum|access_token|api_secret/);
  assert.deepEqual(logs, []);
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

  const response = await accountFetch(server, "/api/seller-refresh?expiry=2026-08-25");
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), EXTENSION_ORIGIN);
  assert.deepEqual(calls, { positions: 1, trades: 1, chain: 1 });
  assert.equal(payload.updatedAt, "2026-07-28T18:15:00.000Z");
  assert.equal(payload.positions[0].contractId, "NFO:NIFTY:2026-08-25:24100:CE");
  assert.equal(payload.trades[0].id, "trade-1");
  assert.equal(payload.chain.expiry, "2026-08-25");
  assert.equal(payload.chain.lotSize, 65);
  assert.doesNotMatch(JSON.stringify(payload), /daily-token|access.?token|api.?secret/i);
});

test("seller refresh passes the exact Upstox lot size into position and trade normalization", async (t) => {
  const server = await runningServer({
    zerodhaClientFactory: () => ({
      getPositions: async () => ({ status: "success", data: { net: [{
        exchange: "NFO", tradingsymbol: "NIFTY26AUG24100CE", quantity: -50,
        average_price: 358.8, last_price: 320, pnl: 1940
      }] } }),
      getTrades: async () => ({ status: "success", data: [{
        trade_id: "trade-25", exchange: "NFO", tradingsymbol: "NIFTY26AUG24100CE",
        transaction_type: "SELL", quantity: 25, average_price: 358.8,
        fill_timestamp: "2026-08-01 09:15:00"
      }] })
    }),
    expiryMetadata: (expiry) => ({ expiry, weekly: false, lotSize: 25 })
  });
  t.after(() => close(server));

  const response = await accountFetch(server, "/api/seller-refresh?expiry=2026-08-25");
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.positions[0].signedQuantity, -50);
  assert.equal(payload.positions[0].lotSize, 25);
  assert.equal(payload.trades[0].quantity, 25);
  assert.equal(payload.chain.lotSize, 25);
});

test("public chain exposes the exact lot size for the expiry resolved by Upstox", async (t) => {
  const metadataRequests = [];
  const server = await runningServer({
    chainLoader: async () => ({
      source: "Upstox",
      expiry: "2026-08-25",
      spot: 23900,
      rows: [{ strike: 23900, call: 100, put: 90 }]
    }),
    expiryMetadata: (expiry) => {
      metadataRequests.push(expiry);
      return { expiry, weekly: false, lotSize: 25 };
    }
  });
  t.after(() => close(server));

  const response = await fetch(`${baseUrl(server)}/api/nifty-chain?expiry=current_month`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.expiry, "2026-08-25");
  assert.equal(payload.lotSize, 25);
  assert.deepEqual(metadataRequests, ["2026-08-25"]);
});

test("public chain rejects a different expiry when an exact date was requested", async (t) => {
  let metadataRequests = 0;
  const server = await runningServer({
    chainLoader: async () => ({
      source: "Upstox",
      expiry: "2026-09-01",
      spot: 23900,
      rows: []
    }),
    expiryMetadata: () => {
      metadataRequests += 1;
      return { expiry: "2026-09-01", weekly: true, lotSize: 25 };
    }
  });
  t.after(() => close(server));

  const response = await fetch(`${baseUrl(server)}/api/nifty-chain?expiry=2026-08-25`);
  const payload = await response.json();

  assert.equal(response.status, 502);
  assert.equal(payload.kind, "expiry_mismatch");
  assert.match(payload.error, /expiry.*did not match requested expiry/i);
  assert.equal(metadataRequests, 0);
  assert.equal(Object.hasOwn(payload, "rows"), false);
});

test("public chain refreshes expired expiry metadata before exposing its lot size", async (t) => {
  const nowMs = Date.parse("2026-08-05T12:00:00.000Z");
  let expiryLoads = 0;
  let cache = {
    updatedAt: nowMs - 16 * 60 * 1000,
    payload: {
      expiries: [{ expiry: "2026-08-25", weekly: false, lotSize: 65 }]
    }
  };
  const server = await runningServer({
    chainLoader: async (expiry) => ({ source: "Upstox", expiry, spot: 23900, rows: [] }),
    expiryMetadata: (expiry) => bridgeServer.findFreshExpiryMetadata(cache, expiry, nowMs),
    expiryLoader: async () => {
      expiryLoads += 1;
      cache = {
        updatedAt: nowMs,
        payload: {
          expiries: [{ expiry: "2026-08-25", weekly: false, lotSize: 25 }]
        }
      };
      return cache.payload;
    }
  });
  t.after(() => close(server));

  const response = await fetch(`${baseUrl(server)}/api/nifty-chain?expiry=2026-08-25`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.lotSize, 25);
  assert.equal(expiryLoads, 1);
});

test("public chain coalesces concurrent expiry metadata cache misses", async (t) => {
  let metadata = null;
  let expiryLoads = 0;
  let releaseLoader;
  let markLoaderStarted;
  const loaderGate = new Promise((resolve) => { releaseLoader = resolve; });
  const loaderStarted = new Promise((resolve) => { markLoaderStarted = resolve; });
  const server = await runningServer({
    chainLoader: async (expiry) => ({ source: "Upstox", expiry, spot: 23900, rows: [] }),
    expiryMetadata: () => metadata,
    expiryLoader: async () => {
      expiryLoads += 1;
      markLoaderStarted();
      await loaderGate;
      metadata = { expiry: "2026-08-25", weekly: false, lotSize: 25 };
      return { source: "Upstox", expiries: [metadata] };
    }
  });
  t.after(() => close(server));

  const pending = Array.from({ length: 3 }, () =>
    fetch(`${baseUrl(server)}/api/nifty-chain?expiry=2026-08-25`));
  await loaderStarted;
  await new Promise((resolve) => setTimeout(resolve, 25));
  const observedLoads = expiryLoads;
  releaseLoader();
  const responses = await Promise.all(pending);
  const payloads = await Promise.all(responses.map((response) => response.json()));

  assert.equal(observedLoads, 1);
  assert.equal(expiryLoads, 1);
  assert.equal(responses.every((response) => response.status === 200), true);
  assert.equal(payloads.every((payload) => payload.lotSize === 25), true);
});

test("failed shared expiry metadata load clears so next request can retry", async (t) => {
  let metadata = null;
  let expiryLoads = 0;
  let fail = true;
  const server = await runningServer({
    chainLoader: async (expiry) => ({ source: "Upstox", expiry, spot: 23900, rows: [] }),
    expiryMetadata: () => metadata,
    expiryLoader: async () => {
      expiryLoads += 1;
      if (fail) throw new Error("expiry metadata unavailable");
      metadata = { expiry: "2026-08-25", weekly: false, lotSize: 25 };
      return { source: "Upstox", expiries: [metadata] };
    }
  });
  t.after(() => close(server));

  const failed = await fetch(`${baseUrl(server)}/api/nifty-chain?expiry=2026-08-25`);
  fail = false;
  const retried = await fetch(`${baseUrl(server)}/api/nifty-chain?expiry=2026-08-25`);

  assert.equal(failed.status, 502);
  assert.equal(retried.status, 200);
  assert.equal((await retried.json()).lotSize, 25);
  assert.equal(expiryLoads, 2);
});

test("public chain loads current expiry metadata once and fails closed when no lot size exists", async (t) => {
  let metadata = null;
  let expiryLoads = 0;
  const server = await runningServer({
    chainLoader: async (expiry) => ({ source: "Upstox", expiry, spot: 23900, rows: [] }),
    expiryMetadata: () => metadata,
    expiryLoader: async () => {
      expiryLoads += 1;
      return { source: "Upstox", expiries: [] };
    }
  });
  t.after(() => close(server));

  const response = await fetch(`${baseUrl(server)}/api/nifty-chain?expiry=2026-08-25`);
  const payload = await response.json();

  assert.equal(response.status, 502);
  assert.equal(expiryLoads, 1);
  assert.match(payload.error, /lot size.*positive integer/i);
  assert.equal(Object.hasOwn(payload, "rows"), false);
});

test("public chain rejects a lot size that conflicts with authoritative expiry metadata", async (t) => {
  const server = await runningServer({
    chainLoader: async (expiry) => ({ source: "Upstox", expiry, lotSize: 50, spot: 23900, rows: [] }),
    expiryMetadata: (expiry) => ({ expiry, weekly: false, lotSize: 25 })
  });
  t.after(() => close(server));

  const response = await fetch(`${baseUrl(server)}/api/nifty-chain?expiry=2026-08-25`);
  const payload = await response.json();

  assert.equal(response.status, 502);
  assert.match(payload.error, /conflicting.*lot size/i);
  assert.equal(Object.hasOwn(payload, "rows"), false);
});

test("seller refresh loads expiry proof when bridge cache is empty", async (t) => {
  let metadata = null;
  let expiryLoads = 0;
  const server = await runningServer({
    zerodhaClientFactory: () => ({
      getPositions: async () => ({ status: "success", data: { net: [{
        exchange: "NFO", tradingsymbol: "NIFTY26AUG24100CE", quantity: -65,
        average_price: 358.8, last_price: 320, pnl: 2522
      }] } }),
      getTrades: async () => ({ status: "success", data: [] })
    }),
    expiryMetadata: () => metadata,
    expiryLoader: async () => {
      expiryLoads += 1;
      metadata = { expiry: "2026-08-25", weekly: false, lotSize: 65 };
      return { source: "Upstox", expiries: [metadata] };
    }
  });
  t.after(() => close(server));

  const response = await accountFetch(server, "/api/seller-refresh?expiry=2026-08-25");
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(expiryLoads, 1);
  assert.equal(payload.positions[0].contractId, "NFO:NIFTY:2026-08-25:24100:CE");
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

  const response = await accountFetch(server, "/api/seller-refresh?expiry=2026-02-30");
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

  const response = await accountFetch(server, "/api/seller-refresh?expiry=2026-08-25");
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: "positions unavailable", kind: "upstream" });
  assert.deepEqual(calls, { positions: 1, trades: 1, chain: 1 });
});

test("rejects adversarial and origin-less browser access before account data is read", async (t) => {
  const calls = { status: 0, login: 0, credentials: 0 };
  const sessionStore = {
    status: async () => { calls.status += 1; return { connected: true }; },
    loginUrl: async () => { calls.login += 1; return "https://kite.zerodha.com/connect/login?v=3&api_key=public-key"; },
    exchangeRequestToken: async () => ({}),
    credentials: async () => { calls.credentials += 1; return { apiKey: "public-key", accessToken: "secret-token" }; }
  };
  const server = await runningServer({ sessionStore });
  t.after(() => close(server));
  const attacks = [
    { path: "/api/zerodha/status", origin: "https://attacker.example" },
    { path: "/api/zerodha/login-url", origin: "chrome-extension://hjgknhdbplfoeldaalpidhkahnfldjem.attacker.example" },
    { path: "/api/seller-refresh?expiry=2026-08-25", origin: "chrome-extension://qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq" },
    { path: "/api/zerodha/status", origin: null }
  ];

  for (const attack of attacks) {
    const options = attack.origin ? { headers: { Origin: attack.origin } } : {};
    const response = await fetch(`${baseUrl(server)}${attack.path}`, options);
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.deepEqual(await response.json(), { error: "Forbidden origin." });
  }
  assert.deepEqual(calls, { status: 0, login: 0, credentials: 0 });
});

test("accepts Chrome extension account GET when Chrome omits Origin but sends extension fetch metadata", async (t) => {
  const server = await runningServer();
  t.after(() => close(server));

  const response = await fetch(`${baseUrl(server)}/api/zerodha/status`, {
    headers: {
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Dest": "empty"
    }
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), EXTENSION_ORIGIN);
  assert.deepEqual(await response.json(), {
    configured: true,
    connected: true,
    expiresAt: "2026-07-29T00:30:00.000Z"
  });
});

test("validates configured extension origin as exact Chrome extension origin", () => {
  const sessionStore = { status: async () => ({}) };
  for (const invalid of [
    "https://example.com",
    "chrome-extension://hjgknhdbplfoeldaalpidhkahnfldjem/",
    "chrome-extension://hjgknhdbplfoeldaalpidhkahnfldjeq",
    "chrome-extension://HJGKNHDBPLFOELDAALPIDHKAHNFLDJEM"
  ]) {
    assert.throws(() => createRequestHandler({ sessionStore, extensionOrigin: invalid }), /extension origin/i);
  }
  assert.doesNotThrow(() => createRequestHandler({ sessionStore, extensionOrigin: EXTENSION_ORIGIN }));
});

test("public bridge responses use the configured exact origin and never wildcard CORS", async () => {
  const writes = [];
  const response = {
    writeHead(status, headers) { writes.push({ status, headers }); },
    end() {}
  };
  const handler = createRequestHandler({
    sessionStore: { status: async () => ({}) },
    extensionOrigin: EXTENSION_ORIGIN
  });

  await handler({ method: "GET", url: "/", headers: { host: "127.0.0.1:8787", origin: EXTENSION_ORIGIN } }, response);

  assert.equal(writes[0].headers["Access-Control-Allow-Origin"], EXTENSION_ORIGIN);
  assert.notEqual(writes[0].headers["Access-Control-Allow-Origin"], "*");
});

test("preserves weekly and monthly markers from cached Upstox contract metadata", () => {
  assert.deepEqual(bridgeServer.summarizeNiftyExpiries([
    { expiry: "2026-08-18", weekly: true, lot_size: 25, instrument_type: "CE" },
    { expiry: "2026-08-18", weekly: true, lot_size: 25, instrument_type: "PE" },
    { expiry: "2026-08-25", weekly: false, lot_size: 25, instrument_type: "CE" },
    { expiry: "2026-08-25", weekly: false, lot_size: 25, instrument_type: "PE" }
  ], "2026-08-01"), [
    { expiry: "2026-08-18", daysToExpiry: 17, weekly: true, lotSize: 25 },
    { expiry: "2026-08-25", daysToExpiry: 24, weekly: false, lotSize: 25 }
  ]);
});

test("rejects missing or inexact Upstox lot sizes while summarizing contract metadata", () => {
  for (const lotSize of [undefined, null, 0, -1, 25.5, "25"]) {
    assert.throws(() => bridgeServer.summarizeNiftyExpiries([
      { expiry: "2026-08-18", weekly: true, lot_size: lotSize, instrument_type: "CE" }
    ], "2026-08-01"), /lot size.*positive integer/i);
  }
});

test("rejects conflicting Upstox lot sizes for one expiry", () => {
  assert.throws(() => bridgeServer.summarizeNiftyExpiries([
    { expiry: "2026-08-18", weekly: true, lot_size: 25, instrument_type: "CE" },
    { expiry: "2026-08-18", weekly: true, lot_size: 50, instrument_type: "PE" }
  ], "2026-08-01"), /conflicting.*lot sizes/i);
});

test("seller refresh fails closed when expiry metadata has no exact lot size", async (t) => {
  const server = await runningServer({
    expiryMetadata: (expiry) => ({ expiry, weekly: false })
  });
  t.after(() => close(server));

  const response = await accountFetch(server, "/api/seller-refresh?expiry=2026-08-25");
  const payload = await response.json();

  assert.equal(response.status, 502);
  assert.match(payload.error, /lot size.*positive integer/i);
  assert.equal(Object.hasOwn(payload, "positions"), false);
});

test("fails coordinated refresh when Upstox resolves a different expiry", async (t) => {
  const calls = { positions: 0, trades: 0, chain: 0 };
  const server = await runningServer({
    zerodhaClientFactory: () => ({
      getPositions: async () => { calls.positions += 1; return { status: "success", data: { net: [] } }; },
      getTrades: async () => { calls.trades += 1; return { status: "success", data: [] }; }
    }),
    chainLoader: async () => { calls.chain += 1; return { source: "Upstox", expiry: "2026-08-18", rows: [] }; }
  });
  t.after(() => close(server));

  const response = await accountFetch(server, "/api/seller-refresh?expiry=2026-08-25");
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: "Upstox chain expiry did not match requested expiry.", kind: "expiry_mismatch" });
  assert.deepEqual(calls, { positions: 1, trades: 1, chain: 1 });
});

test("fails closed when the requested expiry lacks cached Upstox metadata", async (t) => {
  const server = await runningServer({
    zerodhaClientFactory: () => ({
      getPositions: async () => ({ status: "success", data: { net: [{
        exchange: "NFO", tradingsymbol: "NIFTY26AUG24100CE", quantity: -65,
        average_price: 358.8, last_price: 320, pnl: 2522
      }] } }),
      getTrades: async () => ({ status: "success", data: [] })
    }),
    expiryMetadata: () => null
  });
  t.after(() => close(server));

  const response = await accountFetch(server, "/api/seller-refresh?expiry=2026-08-25");
  const payload = await response.json();
  assert.equal(response.status, 502);
  assert.match(payload.error, /lot size.*positive integer/i);
  assert.equal(Object.hasOwn(payload, "positions"), false);
});
