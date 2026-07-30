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
    return value;
  }

  function nearestAvailableStrike(rows, spot, tieDirection = "up") {
    const price = Number(spot);
    if (!Array.isArray(rows) || !Number.isFinite(price)) return null;
    const strikes = Array.from(new Set(rows
      .map((row) => Number(row?.strike))
      .filter(Number.isFinite)))
      .sort((left, right) => left - right);
    if (!strikes.length) return null;
    return strikes.reduce((best, strike) => {
      const distance = Math.abs(strike - price);
      const bestDistance = Math.abs(best - price);
      if (distance < bestDistance - 1e-9) return strike;
      if (Math.abs(distance - bestDistance) > 1e-9) return best;
      return tieDirection === "down" ? Math.min(best, strike) : Math.max(best, strike);
    }, strikes[0]);
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
    if (!gaps.length) return null;
    const middle = Math.floor(gaps.length / 2);
    const interval = gaps.length % 2
      ? gaps[middle]
      : (gaps[middle - 1] + gaps[middle]) / 2;
    return rounded(interval, precisionFor(prices));
  }

  function rounded(value, precision) {
    return Number(Number(value).toFixed(precision));
  }

  function precisionFor(values) {
    return Math.min(10, Math.max(0, ...(values || []).map((value) => {
      const text = String(value).toLowerCase();
      if (text.includes("e-")) return Number(text.split("e-")[1]) || 0;
      return (text.split(".")[1] || "").length;
    })));
  }

  function stableAxisGrid(axisPrices) {
    const observed = Array.from(new Set((Array.isArray(axisPrices) ? axisPrices : [])
      .map(Number)
      .filter(Number.isFinite)))
      .sort((left, right) => left - right);
    const interval = nativeAxisInterval(observed);
    if (!Number.isFinite(interval) || interval <= 0 || observed.length < 2) return observed;
    const precision = precisionFor([...observed, interval]);
    const start = observed[0];
    const end = observed.at(-1);
    const count = Math.round((end - start) / interval);
    if (!Number.isFinite(count) || count < 1 || count > 1000) return observed;
    return Array.from({ length: count + 1 }, (_, index) => rounded(start + index * interval, precision));
  }

  function selectAxisAlignedRows(rows, spot, axisPrices, _maximumRows, tieDirection = "up") {
    if (!Array.isArray(rows)) return null;
    const byStrike = new Map();
    for (const row of rows) {
      const strike = Number(row?.strike);
      if (Number.isFinite(strike) && !byStrike.has(strike)) byStrike.set(strike, row);
    }
    const center = nearestAvailableStrike(rows, spot, tieDirection);
    if (!Number.isFinite(center)) return null;
    const grid = stableAxisGrid(axisPrices);
    const strikeStep = availableStrikeStep(rows);
    const tolerance = Math.max(1e-9, Math.abs(Number(strikeStep) || 1) * 1e-7);
    const selected = Array.from(byStrike.keys())
      .filter((strike) => grid.some((price) => Math.abs(price - strike) <= tolerance))
      .sort((left, right) => left - right);
    const gridStart = grid[0];
    const gridEnd = grid.at(-1);
    const atmIsVisible = Number.isFinite(gridStart)
      && Number.isFinite(gridEnd)
      && center >= gridStart - tolerance
      && center <= gridEnd + tolerance;
    if (atmIsVisible && !selected.includes(center)) {
      selected.push(center);
      selected.sort((left, right) => left - right);
    }
    return {
      interval: nativeAxisInterval(grid),
      center,
      atmStep: strikeStep,
      axisPrices: grid,
      rows: selected.map((strike) => byStrike.get(strike))
    };
  }

  function availableStrikeStep(rows) {
    const strikes = Array.from(new Set((Array.isArray(rows) ? rows : [])
      .map((row) => Number(row?.strike))
      .filter(Number.isFinite)))
      .sort((left, right) => left - right);
    const gaps = strikes.slice(1)
      .map((strike, index) => strike - strikes[index])
      .filter((gap) => gap > 0);
    return gaps.length ? rounded(Math.min(...gaps), precisionFor(strikes)) : null;
  }

  const api = {
    availableStrikeStep,
    nativeAxisInterval,
    nearestAvailableStrike,
    selectAxisAlignedRows,
    stableAxisGrid,
    timeframeKey,
    snapStrikeInterval
  };
  root.NiftyTimeframeLadder = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
