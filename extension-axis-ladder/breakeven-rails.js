(function (root) {
  "use strict";

  function finiteNonNegative(value) {
    if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
  }

  function formatPoint(value) {
    return Math.round(value).toLocaleString("en-IN");
  }

  function calculate(row) {
    const strike = finiteNonNegative(row?.strike);
    const callPremium = finiteNonNegative(row?.call);
    const putPremium = finiteNonNegative(row?.put);
    if (strike === null || callPremium === null || putPremium === null) return null;
    const callExact = strike + callPremium;
    const putExact = strike - putPremium;
    if (putExact < 0) return null;
    return {
      strike,
      call: { kind: "call", exact: callExact, rounded: Math.round(callExact), label: `CALL BE ${formatPoint(callExact)} · SELL BELOW ↓` },
      put: { kind: "put", exact: putExact, rounded: Math.round(putExact), label: `PUT BE ${formatPoint(putExact)} · SELL ABOVE ↑` }
    };
  }

  function project(level, toY, plotRect) {
    const rawY = Number(typeof toY === "function" ? toY(level?.exact) : NaN);
    const y = Number.isFinite(rawY) ? Number(rawY.toFixed(10)) : rawY;
    const top = Number(plotRect?.top);
    const bottom = Number(plotRect?.bottom);
    if (![y, top, bottom].every(Number.isFinite) || bottom <= top) return null;
    if (y < top) return { mode: "edge", edge: "top", y: top };
    if (y > bottom) return { mode: "edge", edge: "bottom", y: bottom };
    return { mode: "line", y };
  }

  function createSelectionController(onChange = () => {}) {
    let selected = null;
    return {
      clear() { if (selected !== null) { selected = null; onChange(null); } },
      current() { return selected; },
      select(row) {
        if (!calculate(row)) { selected = null; onChange(null); return false; }
        selected = { strike: Number(row.strike), call: Number(row.call), put: Number(row.put) };
        onChange(selected);
        return true;
      }
    };
  }

  const api = { calculate, createSelectionController, project };
  root.NiftyBreakEvenRails = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
