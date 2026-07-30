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

  function nativeAxisInterval(axisPrices) {
    const prices = Array.from(new Set((Array.isArray(axisPrices) ? axisPrices : [])
      .map(Number)
      .filter(Number.isFinite)))
      .sort((left, right) => left - right);
    const gaps = prices.slice(1)
      .map((price, index) => price - prices[index])
      .filter((gap) => gap > 0)
      .sort((left, right) => left - right);
    if (!gaps.length) return 50;
    const midpoint = Math.floor(gaps.length / 2);
    const median = gaps.length % 2
      ? gaps[midpoint]
      : (gaps[midpoint - 1] + gaps[midpoint]) / 2;
    return snapStrikeInterval(median);
  }

  function selectAxisAlignedRows(rows, spot, axisPrices, maximumRows = 13, tieDirection = "up") {
    if (!Array.isArray(rows)) return null;
    const limit = Math.max(1, Math.floor(Number(maximumRows)) || 13);
    const byStrike = new Map();
    for (const row of rows) {
      const strike = Number(row?.strike);
      if (Number.isFinite(strike) && !byStrike.has(strike)) byStrike.set(strike, row);
    }
    const center = nearestAvailableStrike(rows, spot, tieDirection);
    if (!Number.isFinite(center)) return null;
    const aligned = Array.from(new Set((Array.isArray(axisPrices) ? axisPrices : [])
      .map(Number)
      .filter((price) => Number.isFinite(price) && byStrike.has(price))));
    if (!aligned.includes(center)) aligned.push(center);
    const selected = aligned.length <= limit
      ? aligned
      : aligned
        .slice()
        .sort((left, right) => Math.abs(left - center) - Math.abs(right - center) || left - right)
        .slice(0, limit);
    selected.sort((left, right) => left - right);
    return {
      interval: nativeAxisInterval(axisPrices),
      center,
      atmStep: availableStrikeStep(rows),
      rows: selected.map((strike) => byStrike.get(strike))
    };
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

  function greatestCommonDivisor(left, right) {
    let a = Math.abs(Math.round(Number(left)));
    let b = Math.abs(Math.round(Number(right)));
    while (b) [a, b] = [b, a % b];
    return a;
  }

  function nearestExactThirteen(byStrike, center, atmStep) {
    const strikes = Array.from(byStrike.keys()).sort((left, right) => left - right);
    if (strikes.length < 13) return null;
    const centerIndex = strikes.indexOf(center);
    if (centerIndex < 0) return null;
    const start = Math.max(0, Math.min(centerIndex - 6, strikes.length - 13));
    const selected = strikes.slice(start, start + 13);
    const interval = selected.reduce(
      (value, strike) => greatestCommonDivisor(value, Math.abs(strike - center)),
      0
    );
    const exactInterval = maxStrikeInterval(interval);
    if (!exactInterval || !selected.includes(center)) return null;
    return {
      interval: exactInterval,
      center,
      atmStep,
      rows: selected.map((strike) => byStrike.get(strike))
    };
  }

  function selectExactThirteen(rows, spot, maximumInterval, tieDirection = "up") {
    if (!Array.isArray(rows)) return null;
    const widestInterval = maxStrikeInterval(maximumInterval);
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
    return nearestExactThirteen(byStrike, center, atmStep);
  }

  const api = {
    availableStrikeStep,
    maxStrikeInterval,
    nativeAxisInterval,
    nearestAvailableStrike,
    selectAxisAlignedRows,
    timeframeKey,
    snapStrikeInterval,
    strikesFromCenter,
    thirteenStrikes,
    selectExactThirteen
  };
  root.NiftyTimeframeLadder = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
