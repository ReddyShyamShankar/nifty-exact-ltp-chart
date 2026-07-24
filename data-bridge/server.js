import http from "node:http";

const PORT = 8787;
const UPSTOX_CHAIN_URL = "https://api.upstox.com/v2/option/chain";
const UPSTOX_CONTRACTS_URL = "https://api.upstox.com/v2/option/contract";
const UPSTOX_CANDLES_URL = "https://api.upstox.com/v3/historical-candle";
const NIFTY_KEY = "NSE_INDEX|Nifty 50";
const STRIKE_STEP = 50;
const EXPIRY_CACHE_MS = 15 * 60 * 1000;
let expiryCache = null;
let candleCache = null;

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

async function niftyChain(expiry) {
  const token = process.env.UPSTOX_ANALYTICS_TOKEN || process.env.UPSTOX_ACCESS_TOKEN;
  if (!token) {
    const error = new Error("UPSTOX_ANALYTICS_TOKEN is not set.");
    error.status = 503;
    throw error;
  }

  const url = new URL(UPSTOX_CHAIN_URL);
  url.searchParams.set("instrument_key", NIFTY_KEY);
  url.searchParams.set("expiry_date", expiry);
  const upstream = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`
    }
  });
  const body = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const error = new Error(body.errors?.[0]?.message || `Upstox returned HTTP ${upstream.status}.`);
    error.status = upstream.status;
    throw error;
  }
  const result = formatChain(body.data || []);
  return {
    source: "Upstox",
    expiryMode: expiry,
    expiry: body.data?.[0]?.expiry || null,
    updatedAt: new Date().toISOString(),
    ...result
  };
}

async function niftyExpiries() {
  if (expiryCache && Date.now() - expiryCache.updatedAt < EXPIRY_CACHE_MS) return expiryCache.payload;

  const token = process.env.UPSTOX_ANALYTICS_TOKEN || process.env.UPSTOX_ACCESS_TOKEN;
  if (!token) {
    const error = new Error("UPSTOX_ANALYTICS_TOKEN is not set.");
    error.status = 503;
    throw error;
  }

  const url = new URL(UPSTOX_CONTRACTS_URL);
  url.searchParams.set("instrument_key", NIFTY_KEY);
  const upstream = await fetch(url, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` }
  });
  const body = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const error = new Error(body.errors?.[0]?.message || `Upstox returned HTTP ${upstream.status}.`);
    error.status = upstream.status;
    throw error;
  }

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
  const token = process.env.UPSTOX_ANALYTICS_TOKEN || process.env.UPSTOX_ACCESS_TOKEN;
  if (!token) {
    const error = new Error("UPSTOX_ANALYTICS_TOKEN is not set.");
    error.status = 503;
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
  const upstream = await fetch(url, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } });
  const body = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const error = new Error(body.errors?.[0]?.message || `Upstox returned HTTP ${upstream.status}.`);
    error.status = upstream.status;
    throw error;
  }
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
  if (url.pathname === "/api/nifty-expiries") {
    try {
      respond(response, 200, await niftyExpiries());
    } catch (error) {
      respond(response, error.status || 502, { error: error.message });
    }
    return;
  }
  if (url.pathname === "/api/nifty-candles") {
    const days = Math.max(30, Math.min(365, Number(url.searchParams.get("days")) || 120));
    try {
      respond(response, 200, await niftyCandles(days));
    } catch (error) {
      respond(response, error.status || 502, { error: error.message });
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
    respond(response, error.status || 502, { error: error.message });
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`NIFTY data bridge listening at http://127.0.0.1:${PORT}`);
});
