(function (root) {
  "use strict";

  const SUPPORTED_TIMEFRAMES = new Map([
    ["15 minutes", "15m"],
    ["1 hour", "1h"],
    ["4 hours", "4h"],
    ["1 day", "1D"],
    ["1 week", "1W"],
    ["1 month", "1M"],
    ["3 months", "3M"],
    ["6 months", "6M"]
  ]);

  function timeframeKey(label) {
    const text = String(label || "");
    const match = text.match(/\b(\d+)\s+(minutes?|hours?|days?|weeks?|months?)\b/i);
    if (!match) return null;
    const unit = match[2].toLowerCase();
    const normalized = `${match[1]} ${unit}`;
    return SUPPORTED_TIMEFRAMES.get(normalized) || null;
  }

  function snapStrikeInterval(raw) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return null;
    return Math.max(50, Math.round(value / 50) * 50);
  }

  function thirteenStrikes(spot, interval) {
    const price = Number(spot);
    const step = Number(interval);
    if (!Number.isFinite(price) || !Number.isFinite(step) || step <= 0) return [];
    const center = Math.round(price / step) * step;
    return Array.from({ length: 13 }, (_, index) => center + (index - 6) * step);
  }

  function nearestAvailableStrike(rows, spot) {
    const price = Number(spot);
    if (!Array.isArray(rows) || !Number.isFinite(price)) return null;
    return rows
      .map((row) => Number(row?.strike))
      .filter(Number.isFinite)
      .sort((left, right) => Math.abs(left - price) - Math.abs(right - price) || left - right)[0] ?? null;
  }

  function selectAvailable(rows, strikes) {
    if (!Array.isArray(rows) || !Array.isArray(strikes)) return [];
    const byStrike = new Map();
    for (const row of rows) {
      const strike = Number(row?.strike);
      if (Number.isFinite(strike) && !byStrike.has(strike)) byStrike.set(strike, row);
    }
    const available = [...byStrike.values()];
    const unused = new Set(byStrike.keys());
    const selected = [];
    for (const target of strikes) {
      const price = Number(target);
      if (!Number.isFinite(price)) continue;
      const nearest = [...unused]
        .sort((left, right) => Math.abs(left - price) - Math.abs(right - price) || left - right)[0];
      if (nearest === undefined) break;
      selected.push(byStrike.get(nearest));
      unused.delete(nearest);
    }
    return selected.sort((left, right) => Number(left.strike) - Number(right.strike));
  }

  const api = { timeframeKey, snapStrikeInterval, thirteenStrikes, selectAvailable, nearestAvailableStrike };
  root.NiftyTimeframeLadder = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
