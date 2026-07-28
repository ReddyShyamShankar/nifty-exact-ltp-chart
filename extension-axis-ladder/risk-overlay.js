(function (root) {
  "use strict";

  const BLOCKED_VIEW_STATES = new Set(["REVIEW POSITION CHANGES", "STALE"]);
  const BLOCKED_LAYER_STATES = new Set([
    "REVIEW POSITION CHANGES",
    "STALE",
    "ENTRY HISTORY INCOMPLETE",
    "HISTORY INCOMPLETE",
    "INVALID INPUT",
    "RISK INPUT INVALID"
  ]);
  const LANE_ZERO_TOKEN_WIDTH_PX = 220;
  const RISK_LABEL_GAP_PX = 12;
  const LABEL_CLEARANCE_PX = LANE_ZERO_TOKEN_WIDTH_PX + RISK_LABEL_GAP_PX;

  function empty(status) {
    return { status, lines: [], bands: [] };
  }

  function normalizedState(value) {
    return String(value || "").trim().replaceAll("_", " ").toUpperCase();
  }

  function finiteRect(plotRect) {
    const rect = {
      left: Number(plotRect?.left),
      top: Number(plotRect?.top),
      right: Number(plotRect?.right),
      bottom: Number(plotRect?.bottom)
    };
    return Object.values(rect).every(Number.isFinite) && rect.right > rect.left && rect.bottom > rect.top
      ? rect
      : null;
  }

  function isRiskMap(value) {
    return Boolean(value) && (
      Array.isArray(value.breakevens)
      || Array.isArray(value.bands)
      || typeof value.status === "string"
    );
  }

  function riskMaps(view) {
    return {
      current: isRiskMap(view?.currentRisk) ? view.currentRisk : view?.maps?.current,
      wholeTrade: isRiskMap(view?.wholeTradeRisk)
        ? view.wholeTradeRisk
        : isRiskMap(view?.maps?.wholeTrade) ? view.maps.wholeTrade : view?.wholeTrade
    };
  }

  function formatPrice(value) {
    return Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function axisDirection(toY, values) {
    const reference = values.find(Number.isFinite) ?? 0;
    const first = Number(toY(reference));
    const second = Number(toY(reference + 1));
    if (!Number.isFinite(first) || !Number.isFinite(second) || first === second) return null;
    return Math.sign(second - first);
  }

  function decodeBandEndpoint(endpoint) {
    if (typeof endpoint === "number" && Number.isFinite(endpoint)) return { ok: true, value: endpoint };
    if (endpoint
      && typeof endpoint === "object"
      && !Array.isArray(endpoint)
      && Object.keys(endpoint).length === 1
      && endpoint.unbounded === "right") {
      return { ok: true, value: Infinity };
    }
    return { ok: false, value: null };
  }

  function boundaryY(value, toY, rect, direction) {
    if (value === Infinity) return direction > 0 ? rect.bottom : rect.top;
    if (value === -Infinity) return direction > 0 ? rect.top : rect.bottom;
    const y = Number(toY(value));
    return Number.isFinite(y) ? y : null;
  }

  function buildBand(layer, band, toY, rect, direction) {
    const decodedFrom = decodeBandEndpoint(band?.from);
    const decodedTo = decodeBandEndpoint(band?.to);
    const from = decodedFrom.value;
    const to = decodedTo.value;
    if (!["profit", "loss", "flat"].includes(band?.kind)
      || !decodedFrom.ok
      || !decodedTo.ok
      || from >= to) return null;
    const firstY = boundaryY(from, toY, rect, direction);
    const secondY = boundaryY(to, toY, rect, direction);
    if (firstY === null || secondY === null) return null;
    const top = Math.max(rect.top, Math.min(firstY, secondY));
    const bottom = Math.min(rect.bottom, Math.max(firstY, secondY));
    if (bottom <= top) return false;
    return { layer, kind: band.kind, from, to, top, bottom, left: rect.left, right: rect.right };
  }

  function buildLayer(layer, map, toY, rect) {
    if (!isRiskMap(map) || BLOCKED_LAYER_STATES.has(normalizedState(map.status))) {
      return { blocked: true, lines: [], bands: [] };
    }
    const roots = Array.isArray(map.breakevens) ? map.breakevens : [];
    if (!roots.every((root) => typeof root === "number" && Number.isFinite(root))) {
      return { blocked: true, lines: [], bands: [] };
    }
    const yValues = roots.map((root) => Number(toY(root)));
    if (!yValues.every(Number.isFinite)) return { blocked: true, lines: [], bands: [] };
    const lineStyle = layer === "current"
      ? { stroke: "mint", dash: "solid", prefix: "CURRENT" }
      : { stroke: "graphite", dash: "dashed", prefix: "WHOLE" };
    const labelRight = rect.right - LABEL_CLEARANCE_PX;
    const lines = roots.map((price, index) => ({
      layer,
      price,
      y: yValues[index],
      left: rect.left,
      right: rect.right,
      labelAnchor: "right",
      labelClearance: LABEL_CLEARANCE_PX,
      labelRight,
      label: `${lineStyle.prefix} BE ${index + 1} · ${formatPrice(price)}`,
      stroke: lineStyle.stroke,
      dash: lineStyle.dash
    })).filter((line) => line.y >= rect.top && line.y <= rect.bottom);

    const sourceBands = map.bands;
    if (!Array.isArray(sourceBands) || !sourceBands.length) return { blocked: true, lines: [], bands: [] };
    const decodedBoundaries = sourceBands.flatMap((band) => [decodeBandEndpoint(band?.from), decodeBandEndpoint(band?.to)]);
    if (decodedBoundaries.some((boundary) => !boundary.ok)) return { blocked: true, lines: [], bands: [] };
    const direction = axisDirection(toY, roots.concat(decodedBoundaries.map((boundary) => boundary.value)));
    if (direction === null) return { blocked: true, lines: [], bands: [] };
    const builtBands = sourceBands.map((band) => buildBand(layer, band, toY, rect, direction));
    if (builtBands.some((band) => band === null)) return { blocked: true, lines: [], bands: [] };
    return { blocked: false, lines, bands: builtBands.filter(Boolean) };
  }

  function buildRiskLayers(view, toY, plotRect) {
    const rect = finiteRect(plotRect);
    if (!view || typeof toY !== "function" || !rect) return empty("PLACEMENT_UNAVAILABLE");
    if (rect.right - LABEL_CLEARANCE_PX <= rect.left) return empty("LABEL_SPACE_UNAVAILABLE");
    const viewState = view?.broker?.kind === "stale"
      ? "STALE"
      : normalizedState(view.state || view.priority?.label);
    if (BLOCKED_VIEW_STATES.has(viewState)) return empty(viewState);
    if (view.canPublish === false) return empty(viewState || "WITHHELD");

    const activeStrategyId = view.activeStrategyId || view.selectedStrategyId;
    if (activeStrategyId && view.strategyId !== activeStrategyId) return empty("STRATEGY_MISMATCH");
    const activeExpiry = view.activeExpiry || view.selectedExpiry;
    if (activeExpiry && view.expiry !== activeExpiry) return empty("EXPIRY_MISMATCH");

    const maps = riskMaps(view);
    const current = buildLayer("current", maps.current, toY, rect);
    const wholeTrade = buildLayer("whole-trade", maps.wholeTrade, toY, rect);
    if (current.blocked && wholeTrade.blocked) return empty(viewState || "RISK_LAYERS_WITHHELD");
    return {
      status: current.blocked || wholeTrade.blocked ? "PARTIAL" : "OK",
      lines: current.lines.concat(wholeTrade.lines),
      bands: current.bands.concat(wholeTrade.bands)
    };
  }

  const api = { buildRiskLayers };
  root.NiftyRiskOverlay = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
