(function (root) {
  "use strict";

  function erf(value) {
    const sign = value < 0 ? -1 : 1;
    const x = Math.abs(value);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t
      - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return sign * y;
  }

  function normalCdf(value) {
    return 0.5 * (1 + erf(value / Math.SQRT2));
  }

  function blackScholesPrice({ right, spot, strike, years, rate, carry, volatility }) {
    const rootTime = Math.sqrt(years);
    const d1 = (Math.log(spot / strike) + (rate - carry + volatility * volatility / 2) * years)
      / (volatility * rootTime);
    const d2 = d1 - volatility * rootTime;
    const discountedSpot = spot * Math.exp(-carry * years);
    const discountedStrike = strike * Math.exp(-rate * years);
    return right === "CALL"
      ? discountedSpot * normalCdf(d1) - discountedStrike * normalCdf(d2)
      : discountedStrike * normalCdf(-d2) - discountedSpot * normalCdf(-d1);
  }

  function finite(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  function estimateIv(input) {
    if (input?.model !== "BLACK_SCHOLES" || !["CALL", "PUT"].includes(input?.right)) return null;
    const optionPrice = finite(input.optionPrice);
    const spot = finite(input.spot);
    const strike = finite(input.strike);
    const years = finite(input.years);
    const rate = finite(input.rate) ?? 0;
    const carry = finite(input.carry) ?? 0;
    if (optionPrice === null || spot === null || strike === null || years === null
      || optionPrice < 0 || spot <= 0 || strike <= 0 || years <= 0) return null;
    const discountedSpot = spot * Math.exp(-carry * years);
    const discountedStrike = strike * Math.exp(-rate * years);
    const intrinsic = input.right === "CALL"
      ? Math.max(0, discountedSpot - discountedStrike)
      : Math.max(0, discountedStrike - discountedSpot);
    const upper = input.right === "CALL" ? discountedSpot : discountedStrike;
    if (optionPrice < intrinsic - 1e-8 || optionPrice > upper + 1e-8) return null;
    let low = 0.0001;
    let high = 5;
    for (let index = 0; index < 100; index += 1) {
      const mid = (low + high) / 2;
      const price = blackScholesPrice({ ...input, spot, strike, years, rate, carry, volatility: mid });
      if (!Number.isFinite(price)) return null;
      if (Math.abs(price - optionPrice) <= 1e-6) {
        return Object.freeze({
          value: mid,
          label: "ESTIMATED IV",
          model: input.model,
          assumptionVersion: input.assumptionVersion || "trial-v1",
          calculatedAt: input.calculatedAt || new Date().toISOString()
        });
      }
      if (price < optionPrice) low = mid; else high = mid;
    }
    const value = (low + high) / 2;
    return Number.isFinite(value) ? Object.freeze({
      value,
      label: "ESTIMATED IV",
      model: input.model,
      assumptionVersion: input.assumptionVersion || "trial-v1",
      calculatedAt: input.calculatedAt || new Date().toISOString()
    }) : null;
  }

  const api = { blackScholesPrice, estimateIv, normalCdf };
  root.OptionsEstimatedIv = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
