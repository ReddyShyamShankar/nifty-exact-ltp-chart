(function (root) {
  "use strict";

  const SUPPORTED_TIMEFRAMES = new Map([
    ["1 minute", "1m"],
    ["5 minutes", "5m"],
    ["15 minutes", "15m"],
    ["1 hour", "1h"],
    ["4 hours", "4h"],
    ["1 day", "1D"],
    ["1 week", "1W"],
    ["1 month", "1M"],
    ["3 months", "3M"],
    ["6 months", "6M"]
  ]);

  const PREFERRED_INTERVALS = new Map([
    ["1m", 50],
    ["5m", 50],
    ["15m", 50],
    ["1h", 50],
    ["4h", 100],
    ["1D", 100],
    ["1W", 250],
    ["1M", 500],
    ["3M", 1000],
    ["6M", 2000]
  ]);

  function timeframeKey(label) {
    const text = String(label || "");
    const match = text.match(/\b(\d+)\s+(minutes?|hours?|days?|weeks?|months?)\b/i);
    if (!match) return null;
    const unit = match[2].toLowerCase();
    const normalized = `${match[1]} ${unit}`;
    return SUPPORTED_TIMEFRAMES.get(normalized) || null;
  }

  function preferredIntervalForTimeframe(timeframe) {
    return PREFERRED_INTERVALS.get(String(timeframe || "")) || null;
  }

  function snapStrikeInterval(raw) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return null;
    return Math.max(50, Math.round(value / 50) * 50);
  }

  function maxStrikeInterval(raw) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return null;
    return Math.max(50, Math.floor(value / 50) * 50);
  }

  function thirteenStrikes(spot, interval, tieDirection = "up") {
    const price = Number(spot);
    const step = Number(interval);
    if (!Number.isFinite(price) || !Number.isFinite(step) || step <= 0) return [];
    const lower = Math.floor(price / step) * step;
    const upper = Math.ceil(price / step) * step;
    const lowerDistance = price - lower;
    const upperDistance = upper - price;
    const isTie = Math.abs(lowerDistance - upperDistance) < 1e-9;
    const center = isTie
      ? (tieDirection === "down" ? lower : upper)
      : (lowerDistance < upperDistance ? lower : upper);
    return Array.from({ length: 13 }, (_, index) => center + (index - 6) * step);
  }

  function nearestAvailableStrike(rows, spot, tieDirection = "up") {
    const price = Number(spot);
    if (!Array.isArray(rows) || !Number.isFinite(price)) return null;
    const strikes = new Set(rows
      .map((row) => Number(row?.strike))
      .filter(Number.isFinite));
    const canonical = thirteenStrikes(price, 50, tieDirection)[6];
    return strikes.has(canonical) ? canonical : null;
  }

  function availableStrikeStep(rows) {
    return Array.isArray(rows) && rows.some((row) => Number.isFinite(Number(row?.strike))) ? 50 : null;
  }

  function strikesFromCenter(center, interval) {
    const strike = Number(center);
    const step = Number(interval);
    if (!Number.isFinite(strike) || !Number.isFinite(step) || step <= 0) return [];
    return Array.from({ length: 13 }, (_, index) => strike + (index - 6) * step);
  }

  function selectExactThirteen(rows, spot, preferredInterval, tieDirection = "up") {
    if (!Array.isArray(rows)) return null;
    const widestInterval = maxStrikeInterval(preferredInterval);
    if (!widestInterval) return null;
    const byStrike = new Map();
    for (const row of rows) {
      const strike = Number(row?.strike);
      if (Number.isFinite(strike) && !byStrike.has(strike)) byStrike.set(strike, row);
    }
    const center = nearestAvailableStrike(rows, spot, tieDirection);
    const atmStep = availableStrikeStep(rows);
    if (!Number.isFinite(center) || !Number.isFinite(atmStep)) return null;
    for (let interval = widestInterval; interval >= 50; interval -= 50) {
      const strikes = strikesFromCenter(center, interval);
      if (strikes.length !== 13 || !strikes.every((strike) => byStrike.has(strike))) continue;
      return {
        interval,
        center,
        atmStep,
        rows: strikes.map((strike) => byStrike.get(strike))
      };
    }
    return null;
  }

  const api = {
    availableStrikeStep,
    maxStrikeInterval,
    nearestAvailableStrike,
    preferredIntervalForTimeframe,
    timeframeKey,
    snapStrikeInterval,
    strikesFromCenter,
    thirteenStrikes,
    selectExactThirteen
  };
  root.NiftyTimeframeLadder = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
