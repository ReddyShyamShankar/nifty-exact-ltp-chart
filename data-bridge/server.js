import http from "node:http";
import { spawnSync } from "node:child_process";
import { userInfo } from "node:os";
import { createAsyncCache } from "./chain-cache.js";

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

function respond(response, status, payload) {
  response.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

function formatChain(chain) {
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
        put: item.put_options?.market_data?.ltp ?? null
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

async function niftyExpiries() {
  if (expiryCache && Date.now() - expiryCache.updatedAt < EXPIRY_CACHE_MS) return expiryCache.payload;

  const url = new URL(UPSTOX_CONTRACTS_URL);
  url.searchParams.set("instrument_key", NIFTY_KEY);
  const body = await upstoxGet(url);

  const today = new Date().toISOString().slice(0, 10);
  const payload = {
    source: "Upstox",
    updatedAt: new Date().toISOString(),
    expiries: [...new Set((body.data || []).map((item) => item.expiry))]
      .filter((expiry) => expiry >= today)
      .sort()
      .map((expiry) => ({ expiry, daysToExpiry: Math.ceil((new Date(`${expiry}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000) }))
  };
  expiryCache = { updatedAt: Date.now(), payload };
  return payload;
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

http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (request.method !== "GET") {
    respond(response, 404, { error: "Not found" });
    return;
  }
  if (url.pathname === "/") {
    const token = resolveToken();
    respond(response, 200, {
      service: "NIFTY data bridge",
      status: "running",
      token: { configured: Boolean(token.token), source: token.source, expiresAt: token.expiresAt },
      endpoints: ["/api/health", "/api/nifty-chain", "/api/nifty-expiries", "/api/nifty-candles"]
    });
    return;
  }
  if (url.pathname === "/api/health") {
    const token = resolveToken();
    if (!token.token) {
      respond(response, 503, { status: "error", kind: "token_missing", error: "Upstox Analytics Token is not configured." });
      return;
    }
    if (token.expiresAt && Date.parse(token.expiresAt) <= Date.now()) {
      respond(response, 401, { status: "error", kind: "auth", error: "The saved Upstox Analytics Token has expired.", token: { source: token.source, expiresAt: token.expiresAt } });
      return;
    }
    try {
      if (url.searchParams.get("live") === "1") await niftyExpiries();
      respond(response, 200, { status: "ok", bridge: "online", upstox: url.searchParams.get("live") === "1" ? "reachable" : "not_checked", token: { source: token.source, expiresAt: token.expiresAt } });
    } catch (error) {
      respond(response, error.status || 502, { status: "error", kind: error.kind || "upstream", error: error.message, token: { source: token.source, expiresAt: token.expiresAt } });
    }
    return;
  }
  if (url.pathname === "/api/nifty-expiries") {
    try {
      respond(response, 200, await niftyExpiries());
    } catch (error) {
      respond(response, error.status || 502, { error: error.message, kind: error.kind || "upstream" });
    }
    return;
  }
  if (url.pathname === "/api/nifty-candles") {
    const days = Math.max(30, Math.min(365, Number(url.searchParams.get("days")) || 120));
    try {
      respond(response, 200, await niftyCandles(days));
    } catch (error) {
      respond(response, error.status || 502, { error: error.message, kind: error.kind || "upstream" });
    }
    return;
  }
  if (url.pathname !== "/api/nifty-chain") {
    respond(response, 404, { error: "Not found" });
    return;
  }
  const expiry = url.searchParams.get("expiry") || "current_month";
  if (!/^(current|next|far)_(week|month)$/.test(expiry) && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
    respond(response, 400, { error: "Expiry must be a supported relative expiry or YYYY-MM-DD." });
    return;
  }
  try {
    respond(response, 200, await niftyChain(expiry));
  } catch (error) {
    respond(response, error.status || 502, { error: error.message, kind: error.kind || "upstream" });
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`NIFTY data bridge listening at http://127.0.0.1:${PORT}`);
});
