(function (root) {
  "use strict";
  const ivApi = root.OptionsEstimatedIv
    || (typeof module !== "undefined" && module.exports ? require("./estimated-iv.js") : null);

  function timestampOf(value) {
    const numeric = Number(value?.timestamp);
    if (Number.isFinite(numeric)) return numeric;
    const parsed = Date.parse(value?.time);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function byTimestamp(series) {
    return new Map((series?.candles || []).map((candle) => [timestampOf(candle), candle])
      .filter(([time]) => time !== null));
  }

  function matchingTrades(trades, identity) {
    return (Array.isArray(trades) ? trades : []).filter((trade) =>
      trade?.expiry === identity.expiry
      && Number(trade?.strike) === Number(identity.strike)
      && typeof trade?.id === "string"
      && Number.isFinite(Date.parse(trade?.createdAt)))
      .map((trade) => Object.freeze({ ...trade, timestamp: Date.parse(trade.createdAt) }))
      .sort((left, right) => left.timestamp - right.timestamp || left.id.localeCompare(right.id));
  }

  function ivFor(candle, underlying, identity, time, expiryAt, assumptions, right) {
    if (!ivApi?.estimateIv || !candle || !underlying || !assumptions?.model) return null;
    return ivApi.estimateIv({
      right,
      optionPrice: Number(candle.close),
      spot: Number(underlying.close),
      strike: Number(identity.strike),
      years: Math.max(0, expiryAt - time) / (365 * 86400000),
      rate: Number(assumptions.rate) || 0,
      carry: Number(assumptions.carry) || 0,
      model: assumptions.model,
      assumptionVersion: assumptions.version || "trial-v1",
      calculatedAt: assumptions.calculatedAt
    });
  }

  function buildViewModel(envelope, options = {}) {
    const identity = envelope?.identity;
    const expiryAt = Date.parse(options.expiryAt);
    if (!identity || !Number.isFinite(Number(identity.strike)) || !Number.isFinite(expiryAt)) {
      throw new TypeError("Exact premium-history identity and expiry timestamp are required.");
    }
    const call = byTimestamp(envelope.call);
    const put = byTimestamp(envelope.put);
    const underlying = byTimestamp(envelope.underlying);
    const timeline = Array.from(new Set([...underlying.keys(), ...call.keys(), ...put.keys()]))
      .filter(Number.isFinite)
      .sort((left, right) => left - right);
    const assumptions = options.ivAssumptions || null;
    const points = timeline.map((time) => {
      const underlyingCandle = underlying.get(time) || null;
      const callCandle = call.get(time) || null;
      const putCandle = put.get(time) || null;
      const spot = Number(underlyingCandle?.close);
      return Object.freeze({
        time,
        underlying: underlyingCandle,
        call: callCandle,
        put: putCandle,
        distance: Number.isFinite(spot) ? spot - Number(identity.strike) : null,
        dteDays: Math.max(0, expiryAt - time) / 86400000,
        combinedClose: callCandle && putCandle ? Number(callCandle.close) + Number(putCandle.close) : null,
        callIv: ivFor(callCandle, underlyingCandle, identity, time, expiryAt, assumptions, "CALL"),
        putIv: ivFor(putCandle, underlyingCandle, identity, time, expiryAt, assumptions, "PUT")
      });
    });
    return Object.freeze({
      version: 1,
      identity: Object.freeze({ ...identity }),
      interval: envelope.interval,
      points: Object.freeze(points),
      trades: Object.freeze(matchingTrades(options.trades, identity)),
      assumptions: assumptions ? Object.freeze({ ...assumptions }) : null,
      updatedAt: envelope.updatedAt || null
    });
  }

  function clipToRange(view, range) {
    const from = Number(range?.from);
    const to = Number(range?.to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) return Object.freeze({ ...view, points: Object.freeze([]), trades: Object.freeze([]) });
    return Object.freeze({
      ...view,
      points: Object.freeze(view.points.filter((point) => point.time >= from && point.time <= to)),
      trades: Object.freeze(view.trades.filter((trade) => trade.timestamp >= from && trade.timestamp <= to))
    });
  }

  function nearestTimestamp(points, target) {
    const time = Number(target);
    if (!Array.isArray(points) || !points.length || !Number.isFinite(time)) return null;
    return points.reduce((nearest, point) =>
      Math.abs(point.time - time) < Math.abs(nearest.time - time) ? point : nearest, points[0]);
  }

  const api = { buildViewModel, clipToRange, nearestTimestamp };
  root.OptionsPremiumHistoryModel = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
