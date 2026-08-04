import http from "node:http";
import { spawnSync } from "node:child_process";
import { userInfo } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import originConfig from "./origin-config.cjs";
import { createAsyncCache } from "./chain-cache.js";
import { createHistoryCache } from "./history-cache.js";
import { createOptionHistoryLoader } from "./option-history.js";
import { createZerodhaClient } from "./zerodha-client.js";
import { createZerodhaSessionStore, ZERODHA_CALLBACK_FAILURE_MESSAGE } from "./zerodha-session.js";
import { normalizeNiftyPositions, normalizeNiftyTrades } from "./zerodha-normalize.js";

const PORT = Number(process.env.NIFTY_BRIDGE_PORT || 8787);
const UPSTOX_CHAIN_URL = "https://api.upstox.com/v2/option/chain";
const UPSTOX_CONTRACTS_URL = "https://api.upstox.com/v2/option/contract";
const UPSTOX_CANDLES_URL = "https://api.upstox.com/v3/historical-candle";
const NIFTY_KEY = "NSE_INDEX|Nifty 50";
const STRIKE_STEP = 50;
const EXPIRY_CACHE_MS = 15 * 60 * 1000;
const CHAIN_CACHE_MS = 2000;
const KEYCHAIN_SERVICE = process.env.NIFTY_UPSTOX_KEYCHAIN_SERVICE || "NIFTY Options Upstox Analytics Token";
let expiryCache = null;
let candleCache = null;
let keychainToken = null;
const chainCache = createAsyncCache({ ttlMs: CHAIN_CACHE_MS });
const optionHistoryCache = createHistoryCache();

function zerodhaServices() {
  return {
    apiKey: process.env.NIFTY_ZERODHA_API_KEYCHAIN_SERVICE || "NIFTY Options Zerodha API Key",
    apiSecret: process.env.NIFTY_ZERODHA_API_SECRET_KEYCHAIN_SERVICE || "NIFTY Options Zerodha API Secret",
    accessToken: process.env.NIFTY_ZERODHA_ACCESS_TOKEN_KEYCHAIN_SERVICE || "NIFTY Options Zerodha Daily Access Token"
  };
}

function readKeychainSecret(service) {
  if (process.platform !== "darwin") return null;
  const result = spawnSync("/usr/bin/security", [
    "find-generic-password", "-a", userInfo().username, "-s", service, "-w"
  ], { encoding: "utf8", timeout: 3000 });
  return result.status === 0 ? result.stdout.trim() || null : null;
}

function writeKeychainSecret(service, secret) {
  if (process.platform !== "darwin") throw new Error("macOS Keychain is required for Zerodha credentials.");
  const result = spawnSync("/usr/bin/security", [
    "add-generic-password", "-U", "-a", userInfo().username, "-s", service, "-w", secret
  ], { encoding: "utf8", timeout: 3000 });
  if (result.status !== 0) throw new Error("Could not save Zerodha credential in macOS Keychain.");
}

function deleteKeychainSecret(service) {
  if (process.platform !== "darwin") return;
  spawnSync("/usr/bin/security", [
    "delete-generic-password", "-a", userInfo().username, "-s", service
  ], { encoding: "utf8", timeout: 3000 });
}

function defaultZerodhaSessionStore() {
  return createZerodhaSessionStore({
    readSecret: readKeychainSecret,
    writeSecret: writeKeychainSecret,
    deleteSecret: deleteKeychainSecret,
    services: zerodhaServices()
  });
}

function tokenExpiry(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return Number.isFinite(payload.exp) ? new Date(payload.exp * 1000).toISOString() : null;
  } catch {
    return null;
  }
}

function resolveToken() {
  const environment = process.env.UPSTOX_ANALYTICS_TOKEN || process.env.UPSTOX_ACCESS_TOKEN;
  if (environment) return { token: environment, source: "environment", expiresAt: tokenExpiry(environment) };
  if (keychainToken) return { token: keychainToken, source: "macOS Keychain", expiresAt: tokenExpiry(keychainToken) };
  if (process.platform !== "darwin") return { token: null, source: null, expiresAt: null };
  const result = spawnSync("/usr/bin/security", [
    "find-generic-password",
    "-a", userInfo().username,
    "-s", KEYCHAIN_SERVICE,
    "-w"
  ], { encoding: "utf8", timeout: 3000 });
  const token = result.status === 0 ? result.stdout.trim() : "";
  if (!token) return { token: null, source: null, expiresAt: null };
  keychainToken = token;
  return { token, source: "macOS Keychain", expiresAt: tokenExpiry(token) };
}

function upstoxError(body, status) {
  const message = body.errors?.[0]?.message || body.message || `Upstox returned HTTP ${status}.`;
  const error = new Error(status === 401
    ? "Upstox rejected the Analytics Token. Update the saved token, then restart the bridge."
    : message);
  error.status = status;
  error.kind = status === 401 || status === 403 ? "auth" : status === 429 ? "rate_limit" : "upstream";
  error.upstreamMessage = message;
  return error;
}

async function upstoxGet(url) {
  const token = tokenOrThrow();
  let upstream;
  try {
    upstream = await fetch(url, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` }
    });
  } catch (cause) {
    const error = new Error("Cannot reach Upstox. Check the internet connection.");
    error.status = 502;
    error.kind = "network";
    error.cause = cause;
    throw error;
  }
  const body = await upstream.json().catch(() => ({}));
  if (!upstream.ok) throw upstoxError(body, upstream.status);
  return body;
}

function respondJson(response, status, payload, corsOrigin) {
  const headers = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8"
  };
  if (corsOrigin) headers["Access-Control-Allow-Origin"] = corsOrigin;
  if (corsOrigin) headers.Vary = "Origin";
  response.writeHead(status, headers);
  response.end(JSON.stringify(payload));
}

function validatedExtensionOrigin(value) {
  return originConfig.validateExtensionOrigin(value);
}

function isExtensionAccountRequest(headers, allowedOrigin) {
  if (headers.origin === allowedOrigin) return true;
  return !headers.origin &&
    headers["sec-fetch-site"] === "none" &&
    headers["sec-fetch-mode"] === "cors" &&
    headers["sec-fetch-dest"] === "empty";
}

function openInterest(value) {
  if (typeof value === "boolean" || value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

export function formatChain(chain) {
  const spot = chain.find((item) => Number.isFinite(item.underlying_spot_price))?.underlying_spot_price;
  if (!Number.isFinite(spot)) throw new Error("Upstox response did not contain NIFTY spot price.");

  const atm = Math.round(spot / STRIKE_STEP) * STRIKE_STEP;
  return {
    spot,
    atm,
    rows: chain
      .sort((a, b) => b.strike_price - a.strike_price)
      .map((item) => ({
        strike: item.strike_price,
        call: item.call_options?.market_data?.ltp ?? null,
        put: item.put_options?.market_data?.ltp ?? null,
        callOi: openInterest(item.call_options?.market_data?.oi),
        putOi: openInterest(item.put_options?.market_data?.oi),
        callInstrumentKey: item.call_options?.instrument_key ?? null,
        putInstrumentKey: item.put_options?.instrument_key ?? null
      }))
  };
}

function tradingViewOptionSymbol(expiry, strike, right) {
  const compactDate = expiry.replaceAll("-", "").slice(2);
  return `NSE:NIFTY${compactDate}${right}${strike}`;
}

async function loadNiftyChain(expiry) {
  const url = new URL(UPSTOX_CHAIN_URL);
  url.searchParams.set("instrument_key", NIFTY_KEY);
  url.searchParams.set("expiry_date", expiry);
  const body = await upstoxGet(url);
  const result = formatChain(body.data || []);
  const resolvedExpiry = body.data?.[0]?.expiry || null;
  const rows = resolvedExpiry
    ? result.rows.map((row) => ({
      ...row,
      callSymbol: tradingViewOptionSymbol(resolvedExpiry, row.strike, "C"),
      putSymbol: tradingViewOptionSymbol(resolvedExpiry, row.strike, "P")
    }))
    : result.rows;
  return {
    source: "Upstox",
    expiryMode: expiry,
    expiry: resolvedExpiry,
    updatedAt: new Date().toISOString(),
    ...result,
    rows
  };
}

function niftyChain(expiry) {
  return chainCache.get(expiry, () => loadNiftyChain(expiry));
}

export function summarizeNiftyExpiries(contracts, today) {
  const markers = new Map();
  for (const contract of Array.isArray(contracts) ? contracts : []) {
    if (!exactIsoDate(contract?.expiry) || contract.expiry < today) continue;
    if (!markers.has(contract.expiry)) markers.set(contract.expiry, new Set());
    if (typeof contract.weekly === "boolean") markers.get(contract.expiry).add(contract.weekly);
  }
  return Array.from(markers, ([expiry, values]) => ({
    expiry,
    daysToExpiry: Math.ceil((new Date(`${expiry}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000),
    weekly: values.size === 1 ? values.values().next().value : null
  })).sort((left, right) => left.expiry.localeCompare(right.expiry));
}

async function niftyExpiries() {
  if (expiryCache && Date.now() - expiryCache.updatedAt < EXPIRY_CACHE_MS) return expiryCache.payload;

  const url = new URL(UPSTOX_CONTRACTS_URL);
  url.searchParams.set("instrument_key", NIFTY_KEY);
  const body = await upstoxGet(url);

  const today = new Date().toISOString().slice(0, 10);
  const payload = {
    source: "Upstox",
    updatedAt: new Date().toISOString(),
    expiries: summarizeNiftyExpiries(body.data, today)
  };
  expiryCache = { updatedAt: Date.now(), payload };
  return payload;
}

function cachedExpiryMetadata(expiry) {
  return expiryCache?.payload?.expiries?.find((entry) => entry.expiry === expiry) || null;
}

function tokenOrThrow() {
  const { token } = resolveToken();
  if (!token) {
    const error = new Error("Upstox Analytics Token is not configured. Run bin/nifty-bridge setup once.");
    error.status = 503;
    error.kind = "token_missing";
    throw error;
  }
  return token;
}

function isoDate(daysAgo) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

async function niftyCandles(days = 120) {
  if (candleCache && Date.now() - candleCache.updatedAt < 5 * 60 * 1000) return candleCache.payload;
  const token = tokenOrThrow();
  const toDate = isoDate(0);
  const fromDate = isoDate(days);
  const url = `${UPSTOX_CANDLES_URL}/${encodeURIComponent(NIFTY_KEY)}/days/1/${toDate}/${fromDate}`;
  const body = await upstoxGet(url);
  const payload = {
    source: "Upstox",
    updatedAt: new Date().toISOString(),
    candles: (body.data?.candles || []).map(([time, open, high, low, close, volume]) => ({ time, open, high, low, close, volume })).reverse()
  };
  candleCache = { updatedAt: Date.now(), payload };
  return payload;
}

export function splitHistoricalRange(interval, from, to) {
  const dayMs = 86400000;
  const maxDays = interval?.unit === "minutes" && Number(interval?.amount) <= 15
    ? 28
    : interval?.unit === "hours" || interval?.unit === "minutes"
      ? 89
      : null;
  if (!maxDays) return [{ from, to }];
  const start = Date.parse(`${from}T00:00:00.000Z`);
  let cursor = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(cursor) || start > cursor) return [];
  const chunks = [];
  while (cursor >= start) {
    const chunkStart = Math.max(start, cursor - (maxDays - 1) * dayMs);
    chunks.push({
      from: new Date(chunkStart).toISOString().slice(0, 10),
      to: new Date(cursor).toISOString().slice(0, 10)
    });
    cursor = chunkStart - dayMs;
  }
  return chunks.reverse();
}

async function fetchHistoricalCandles({ instrumentKey, interval, from, to }) {
  const rows = [];
  for (const chunk of splitHistoricalRange(interval, from, to)) {
    const url = `${UPSTOX_CANDLES_URL}/${encodeURIComponent(instrumentKey)}/${interval.unit}/${interval.amount}/${chunk.to}/${chunk.from}`;
    const body = await upstoxGet(url);
    rows.push(...(body.data?.candles || []));
  }
  return rows;
}

const loadProviderOptionHistory = createOptionHistoryLoader({
  fetchCandles: fetchHistoricalCandles,
  cache: optionHistoryCache
});

async function loadNiftyOptionHistory(request, chainLoader = niftyChain) {
  const chain = await chainLoader(request.expiry);
  if (!chain || chain.expiry !== request.expiry) {
    throw Object.assign(new Error("Option chain expiry did not match requested history expiry."), {
      status: 502,
      kind: "expiry_mismatch"
    });
  }
  const row = chain.rows?.find((candidate) => Number(candidate?.strike) === request.strike);
  if (!row?.callInstrumentKey || !row?.putInstrumentKey) {
    throw Object.assign(new Error("CONTRACT HISTORY UNAVAILABLE"), {
      status: 404,
      kind: "contract_unavailable"
    });
  }
  return loadProviderOptionHistory({
    ...request,
    provider: "upstox",
    underlyingKey: NIFTY_KEY,
    callInstrumentKey: row.callInstrumentKey,
    putInstrumentKey: row.putInstrumentKey
  });
}

function exactIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function createRequestHandler({
  sessionStore = defaultZerodhaSessionStore(),
  zerodhaClientFactory = createZerodhaClient,
  chainLoader = niftyChain,
  optionHistoryLoader = null,
  expiryLoader = niftyExpiries,
  expiryMetadata = cachedExpiryMetadata,
  normalizePositions = normalizeNiftyPositions,
  normalizeTrades = normalizeNiftyTrades,
  extensionOrigin = originConfig.loadExtensionOrigin(),
  now = () => new Date()
} = {}) {
  const allowedOrigin = validatedExtensionOrigin(extensionOrigin);
  const accountPaths = new Set(["/api/zerodha/status", "/api/zerodha/login-url", "/api/seller-refresh", "/api/option-history"]);
  return async function requestHandler(request, response) {
  const respondPublic = (status, payload) => respondJson(response, status, payload, allowedOrigin);
  const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
  const accountPath = accountPaths.has(url.pathname);
  if (accountPath && !isExtensionAccountRequest(request.headers, allowedOrigin)) {
    respondJson(response, 403, { error: "Forbidden origin." }, null);
    return;
  }
  if (request.method !== "GET") {
    if (accountPath) respondJson(response, 404, { error: "Not found" }, allowedOrigin);
    else respondPublic(404, { error: "Not found" });
    return;
  }
  if (url.pathname === "/") {
    const token = resolveToken();
    respondPublic(200, {
      service: "NIFTY data bridge",
      status: "running",
      token: { configured: Boolean(token.token), source: token.source, expiresAt: token.expiresAt },
      endpoints: [
        "/api/health", "/api/nifty-chain", "/api/nifty-expiries", "/api/nifty-candles", "/api/option-history",
        "/api/zerodha/status", "/api/zerodha/login-url", "/api/zerodha/callback", "/api/seller-refresh"
      ]
    });
    return;
  }
  if (url.pathname === "/api/zerodha/status") {
    try {
      respondJson(response, 200, await sessionStore.status(), allowedOrigin);
    } catch (error) {
      respondJson(response, error.status || 502, { error: error.message, kind: error.kind || "upstream" }, allowedOrigin);
    }
    return;
  }
  if (url.pathname === "/api/zerodha/login-url") {
    try {
      respondJson(response, 200, { loginUrl: await sessionStore.loginUrl() }, allowedOrigin);
    } catch (error) {
      respondJson(response, error.status || 502, { error: error.message, kind: error.kind || "upstream" }, allowedOrigin);
    }
    return;
  }
  if (url.pathname === "/api/zerodha/callback") {
    const requestToken = url.searchParams.get("request_token");
    if (!requestToken) {
      respondJson(response, 400, { error: "Zerodha callback did not include a request token.", kind: "invalid_request" }, null);
      return;
    }
    try {
      respondJson(response, 200, await sessionStore.exchangeRequestToken(requestToken), null);
    } catch (error) {
      respondJson(response, error.status || 502, { error: ZERODHA_CALLBACK_FAILURE_MESSAGE, kind: error.kind || "upstream" }, null);
    }
    return;
  }
  if (url.pathname === "/api/seller-refresh") {
    const expiry = url.searchParams.get("expiry") || "";
    if (!exactIsoDate(expiry)) {
      respondJson(response, 400, { error: "Expiry must be an exact YYYY-MM-DD date." }, allowedOrigin);
      return;
    }
    try {
      const credentials = await sessionStore.credentials();
      const client = zerodhaClientFactory(credentials);
      const [positionsPayload, tradesPayload, chain] = await Promise.all([
        client.getPositions(),
        client.getTrades(),
        chainLoader(expiry)
      ]);
      if (!chain || chain.expiry !== expiry) {
        const error = new Error("Upstox chain expiry did not match requested expiry.");
        error.status = 502;
        error.kind = "expiry_mismatch";
        throw error;
      }
      let metadata = expiryMetadata(expiry);
      if (!metadata) {
        await expiryLoader();
        metadata = expiryMetadata(expiry);
      }
      const expiryKind = metadata?.weekly === false ? "monthly" : metadata?.weekly === true ? "weekly" : "unknown";
      respondJson(response, 200, {
        updatedAt: new Date(now()).toISOString(),
        positions: normalizePositions(positionsPayload, expiry, { expiryKind }),
        trades: normalizeTrades(tradesPayload, expiry, { expiryKind }),
        chain
      }, allowedOrigin);
    } catch (error) {
      respondJson(response, error.status || 502, { error: error.message, kind: error.kind || "upstream" }, allowedOrigin);
    }
    return;
  }
  if (url.pathname === "/api/option-history") {
    const expiry = url.searchParams.get("expiry") || "";
    const strike = Number(url.searchParams.get("strike"));
    const interval = url.searchParams.get("interval") || "";
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";
    const supportedIntervals = new Set(["1m", "5m", "15m", "1h", "4h", "1D", "1W", "1M"]);
    if (!exactIsoDate(expiry) || !Number.isFinite(strike) || strike <= 0
      || !supportedIntervals.has(interval) || !exactIsoDate(from) || !exactIsoDate(to) || from > to) {
      respondJson(response, 400, { error: "History requires exact expiry, strike, interval, from, and to." }, allowedOrigin);
      return;
    }
    try {
      const load = optionHistoryLoader || ((request) => loadNiftyOptionHistory(request, chainLoader));
      respondJson(response, 200, await load({ expiry, strike, interval, from, to }), allowedOrigin);
    } catch (error) {
      respondJson(response, error.status || 502, { error: error.message, kind: error.kind || "upstream" }, allowedOrigin);
    }
    return;
  }
  if (url.pathname === "/api/health") {
    const token = resolveToken();
    if (!token.token) {
      respondPublic(503, { status: "error", kind: "token_missing", error: "Upstox Analytics Token is not configured." });
      return;
    }
    if (token.expiresAt && Date.parse(token.expiresAt) <= Date.now()) {
      respondPublic(401, { status: "error", kind: "auth", error: "The saved Upstox Analytics Token has expired.", token: { source: token.source, expiresAt: token.expiresAt } });
      return;
    }
    try {
      if (url.searchParams.get("live") === "1") await niftyExpiries();
      respondPublic(200, { status: "ok", bridge: "online", upstox: url.searchParams.get("live") === "1" ? "reachable" : "not_checked", token: { source: token.source, expiresAt: token.expiresAt } });
    } catch (error) {
      respondPublic(error.status || 502, { status: "error", kind: error.kind || "upstream", error: error.message, token: { source: token.source, expiresAt: token.expiresAt } });
    }
    return;
  }
  if (url.pathname === "/api/nifty-expiries") {
    try {
      respondPublic(200, await niftyExpiries());
    } catch (error) {
      respondPublic(error.status || 502, { error: error.message, kind: error.kind || "upstream" });
    }
    return;
  }
  if (url.pathname === "/api/nifty-candles") {
    const days = Math.max(30, Math.min(365, Number(url.searchParams.get("days")) || 120));
    try {
      respondPublic(200, await niftyCandles(days));
    } catch (error) {
      respondPublic(error.status || 502, { error: error.message, kind: error.kind || "upstream" });
    }
    return;
  }
  if (url.pathname !== "/api/nifty-chain") {
    respondPublic(404, { error: "Not found" });
    return;
  }
  const expiry = url.searchParams.get("expiry") || "current_month";
  if (!/^(current|next|far)_(week|month)$/.test(expiry) && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
    respondPublic(400, { error: "Expiry must be a supported relative expiry or YYYY-MM-DD." });
    return;
  }
  try {
    respondPublic(200, await niftyChain(expiry));
  } catch (error) {
    respondPublic(error.status || 502, { error: error.message, kind: error.kind || "upstream" });
  }
  };
}

export function startServer({ port = PORT, host = "127.0.0.1", ...handlerOptions } = {}) {
  const server = http.createServer(createRequestHandler(handlerOptions));
  return new Promise((resolveServer, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolveServer(server);
    });
  });
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  startServer().then(() => {
    console.log(`NIFTY data bridge listening at http://127.0.0.1:${PORT}`);
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
