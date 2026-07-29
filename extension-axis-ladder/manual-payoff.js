(function (root) {
  "use strict";

  const ROOT_EPSILON = 1e-9;
  const DEDUPE_EPSILON = 1e-7;

  function legPayoff(entry, underlyingPrice) {
    const s = Number(underlyingPrice);
    const k = Number(entry.strike);
    const premium = Number(entry.premium);
    const lots = Number(entry.lots);
    const intrinsic = entry.optionType === "CALL" ? Math.max(s - k, 0) : Math.max(k - s, 0);
    return lots * (entry.direction === "BUY" ? intrinsic - premium : premium - intrinsic);
  }

  function payoffAt(entries, underlyingPrice) {
    return entries.reduce((sum, entry) => sum + legPayoff(entry, underlyingPrice), 0);
  }

  function lineForPoints(entries, first, second) {
    const firstValue = payoffAt(entries, first);
    const secondValue = payoffAt(entries, second);
    const slope = (secondValue - firstValue) / (second - first);
    return { slope, intercept: firstValue - slope * first };
  }

  function intervalLine(entries, left, right) {
    const width = right - left;
    return lineForPoints(entries, left + width / 3, left + (2 * width) / 3);
  }

  function sortedKnots(entries) {
    return [...new Set(entries.map((entry) => Number(entry.strike)))]
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
  }

  function breakEvens(entries) {
    if (!Array.isArray(entries) || entries.length === 0) return { status: "empty", points: [] };

    const knots = sortedKnots(entries);
    if (!knots.length) return { status: "empty", points: [] };

    const segments = [];
    if (knots[0] > 0) segments.push({ left: 0, right: knots[0], line: intervalLine(entries, 0, knots[0]) });
    for (let index = 0; index < knots.length - 1; index += 1) {
      const left = knots[index];
      const right = knots[index + 1];
      segments.push({ left, right, line: intervalLine(entries, left, right) });
    }
    const last = knots.at(-1);
    segments.push({ left: last, right: Infinity, line: lineForPoints(entries, last + 1, last + 2) });

    const knotValues = knots.map((knot) => payoffAt(entries, knot));
    const allZero = knotValues.every((value) => Math.abs(value) <= ROOT_EPSILON)
      && segments.every(({ line }) => Math.abs(line.slope) <= ROOT_EPSILON
        && Math.abs(line.intercept) <= ROOT_EPSILON);
    if (allZero) return { status: "flat", points: [] };

    const points = [];
    const addPoint = (value) => {
      if (!Number.isFinite(value) || value < -DEDUPE_EPSILON) return;
      const point = Math.abs(value) <= DEDUPE_EPSILON ? 0 : value;
      if (!points.some((existing) => Math.abs(existing - point) <= DEDUPE_EPSILON)) points.push(point);
    };

    if (Math.abs(payoffAt(entries, 0)) <= ROOT_EPSILON) addPoint(0);
    knots.forEach((knot, index) => {
      if (Math.abs(knotValues[index]) <= ROOT_EPSILON) addPoint(knot);
    });

    segments.forEach(({ left, right, line }) => {
      if (Math.abs(line.slope) <= ROOT_EPSILON) return;
      const root = -line.intercept / line.slope;
      const within = right === Infinity
        ? root >= left - DEDUPE_EPSILON
        : root >= left - DEDUPE_EPSILON && root <= right + DEDUPE_EPSILON;
      if (within) addPoint(root);
    });

    points.sort((a, b) => a - b);
    return { status: "ok", points };
  }

  function levels(entries, prefix = "PLAN BE") {
    const result = breakEvens(entries);
    return {
      ...result,
      levels: result.points.map((exact) => ({
        kind: "plan",
        exact,
        rounded: Math.round(exact),
        label: `${prefix} ${Math.round(exact).toLocaleString("en-IN")}`
      }))
    };
  }

  const api = { legPayoff, payoffAt, breakEvens, levels };
  root.NiftyManualPayoff = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
