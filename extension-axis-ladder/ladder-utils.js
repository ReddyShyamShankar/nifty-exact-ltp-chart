(function (root) {
  "use strict";

  function centerForSpot(spot, step) {
    const price = Number(spot);
    const interval = Number(step);
    if (!Number.isFinite(price) || !Number.isFinite(interval) || interval <= 0) return null;
    return Math.round(price / interval) * interval;
  }

  function fiveStrikes(center, step) {
    const middle = Number(center);
    const interval = Number(step);
    if (!Number.isFinite(middle) || !Number.isFinite(interval) || interval <= 0) return [];
    return [-2, -1, 0, 1, 2].map((offset) => middle + offset * interval);
  }

  const api = { centerForSpot, fiveStrikes };
  root.NiftyLadder = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
