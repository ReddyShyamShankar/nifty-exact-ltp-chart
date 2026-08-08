const INTERVALS = new Map([
  ["1m", { unit: "minutes", amount: 1 }],
  ["5m", { unit: "minutes", amount: 5 }],
  ["15m", { unit: "minutes", amount: 15 }],
  ["1h", { unit: "hours", amount: 1 }],
  ["4h", { unit: "hours", amount: 4 }],
  ["1D", { unit: "days", amount: 1 }],
  ["1W", { unit: "weeks", amount: 1 }],
  ["1M", { unit: "months", amount: 1 }]
]);

function exactIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function nonEmpty(value) {
  return typeof value === "string" && Boolean(value.trim());
}

export function normalizeContractRef(input) {
  const strike = Number(input?.strike);
  if (!nonEmpty(input?.provider) || !nonEmpty(input?.underlyingKey)
    || !exactIsoDate(input?.expiry) || !Number.isFinite(strike) || strike <= 0
    || !nonEmpty(input?.callInstrumentKey) || !nonEmpty(input?.putInstrumentKey)) return null;
  return Object.freeze({
    provider: input.provider.trim(),
    underlyingKey: input.underlyingKey.trim(),
    expiry: input.expiry,
    strike,
    callInstrumentKey: input.callInstrumentKey.trim(),
    putInstrumentKey: input.putInstrumentKey.trim()
  });
}

export function historyCacheKey(request) {
  return [request?.provider, request?.underlyingKey, request?.expiry, request?.strike,
    request?.interval, request?.from, request?.to].join("|");
}

export function providerInterval(timeframe) {
  const value = INTERVALS.get(timeframe);
  return value ? { ...value } : null;
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizeProviderCandles(rows) {
  const candles = [];
  const gaps = [];
  for (const [index, raw] of (Array.isArray(rows) ? rows : []).entries()) {
    const [time, openRaw, highRaw, lowRaw, closeRaw, volumeRaw = 0, oiRaw = 0] = Array.isArray(raw) ? raw : [];
    const timestamp = typeof time === "string" ? Date.parse(time) : NaN;
    const open = finiteNumber(openRaw);
    const high = finiteNumber(highRaw);
    const low = finiteNumber(lowRaw);
    const close = finiteNumber(closeRaw);
    const volume = finiteNumber(volumeRaw);
    const oi = finiteNumber(oiRaw);
    if (!Number.isFinite(timestamp) || [open, high, low, close, volume, oi].includes(null)
      || volume < 0 || oi < 0 || high < Math.max(open, close, low) || low > Math.min(open, close, high)) {
      gaps.push(Object.freeze({ index, time: typeof time === "string" ? time : null, reason: "INVALID_CANDLE" }));
      continue;
    }
    candles.push(Object.freeze({ time, timestamp, open, high, low, close, volume, oi }));
  }
  candles.sort((left, right) => left.timestamp - right.timestamp);
  return Object.freeze({ candles: Object.freeze(candles), gaps: Object.freeze(gaps) });
}

export function createOptionHistoryLoader({ fetchCandles, cache, now = () => new Date() }) {
  if (typeof fetchCandles !== "function" || !cache?.get) throw new TypeError("History loader dependencies are invalid.");
  return async function loadOptionHistory(request) {
    const identity = normalizeContractRef(request);
    const interval = providerInterval(request?.interval);
    if (!identity || !interval || !exactIsoDate(request?.from) || !exactIsoDate(request?.to)
      || request.from > request.to) throw Object.assign(new Error("Unsupported exact contract, range, or interval."), { status: 400, kind: "invalid_request" });
    const keyBase = historyCacheKey(request);
    const load = (right, instrumentKey) => cache.get(`${keyBase}|${right}`, async () =>
      normalizeProviderCandles(await fetchCandles({ instrumentKey, interval, from: request.from, to: request.to })));
    const [call, put, underlying] = await Promise.all([
      load("CALL", identity.callInstrumentKey),
      load("PUT", identity.putInstrumentKey),
      load("UNDERLYING", identity.underlyingKey)
    ]);
    return Object.freeze({
      version: 1,
      identity,
      interval: request.interval,
      from: request.from,
      to: request.to,
      call,
      put,
      underlying,
      updatedAt: new Date(now()).toISOString()
    });
  };
}
