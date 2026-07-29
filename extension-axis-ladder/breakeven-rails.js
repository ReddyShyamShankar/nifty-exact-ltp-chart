(function (root) {
  "use strict";

  function finiteNonNegative(value) {
    if (value === null || value === undefined || (typeof value === "string" && value.trim() === "") || typeof value === "boolean") return null;
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

  function layoutDecorations(placements, plotRect, height = 15, gap = 2) {
    const top = Number(plotRect?.top);
    const bottom = Number(plotRect?.bottom);
    const itemHeight = Number(height);
    const itemGap = Number(gap);
    if (!Array.isArray(placements) || !placements.length
      || ![top, bottom, itemHeight, itemGap].every(Number.isFinite)
      || bottom <= top || itemHeight <= 0 || itemGap < 0
      || placements.length * itemHeight + (placements.length - 1) * itemGap > bottom - top) return null;

    const kindRank = { call: 0, put: 1 };
    const entries = placements.map((placement, index) => {
      const projection = placement?.projection;
      const anchor = Number(projection?.y);
      if (!Number.isFinite(anchor)) return null;
      const desired = projection.mode === "edge" && projection.edge === "top"
        ? top
        : projection.mode === "edge" && projection.edge === "bottom"
          ? bottom - itemHeight
          : anchor - itemHeight;
      return {
        index,
        rank: kindRank[placement?.level?.kind] ?? 2,
        top: Math.max(top, Math.min(bottom - itemHeight, desired))
      };
    });
    if (entries.some((entry) => !entry)) return null;

    const ordered = entries.slice().sort((a, b) => a.top - b.top || a.rank - b.rank || a.index - b.index);
    ordered.forEach((entry, index) => {
      if (index) entry.top = Math.max(entry.top, ordered[index - 1].top + itemHeight + itemGap);
    });
    const overflow = Math.max(0, ordered.at(-1).top + itemHeight - bottom);
    if (overflow) ordered.forEach((entry) => { entry.top -= overflow; });

    const result = Array(placements.length);
    ordered.forEach((entry) => { result[entry.index] = { top: Number(entry.top.toFixed(10)) }; });
    return result;
  }

  function createSelectionController(onChange = () => {}) {
    let selected = null;
    function clear() {
      if (selected !== null) {
        selected = null;
        onChange(null);
      }
    }
    return {
      clear,
      current() { return selected; },
      select(row) {
        const strike = finiteNonNegative(row?.strike);
        if (strike === null) {
          clear();
          return false;
        }
        selected = { strike, call: row.call, put: row.put };
        onChange(selected);
        return Boolean(calculate(selected));
      }
    };
  }

  const api = { calculate, createSelectionController, layoutDecorations, project };
  root.NiftyBreakEvenRails = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
