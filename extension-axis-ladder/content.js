(function (root) {
  "use strict";

  const RETRY_DELAYS = [0, 250, 650, 1200];
  const LABELS_ID = "nifty-axis-ladder";
  const PREMIUM_STRIKE_MAP_ID = "options-premium-strike-map";
  const PREMIUM_CHART_TRIALS_ID = "options-premium-chart-trials";
  const PREMIUM_HISTORY_STATUS_ID = "options-premium-history-status";
  const RISK_LABEL_GAP_PX = 12;
  const EDGE_STACK_GAP_PX = 4;
  const POSITION_CONTROL_WIDTH_PX = 47;
  const POSITION_CONTROL_HEIGHT_PX = 18;
  const POSITION_LANE_GAP_PX = 6;
  const POSITION_PUT_GUTTER_PX = 60;
  const BREAK_EVEN_LABEL_HEIGHT = 15;
  const SELLER_SAFETY_STALE_MS = 15 * 60 * 1000;
  const VIEWPORT_RESIZE_SETTLE_MS = 500;
  const timeframeApi = root.NiftyTimeframeLadder
    || (typeof module !== "undefined" && module.exports ? require("./timeframe-ladder.js") : null);
  const riskOverlayApi = root.NiftyRiskOverlay
    || (typeof module !== "undefined" && module.exports ? require("./risk-overlay.js") : null);
  const sellerViewIdentityApi = root.NiftySellerViewIdentity
    || (typeof module !== "undefined" && module.exports ? require("./seller-view-identity.js") : null);
  const breakEvenApi = root.NiftyBreakEvenRails
    || (typeof module !== "undefined" && module.exports ? require("./breakeven-rails.js") : null);
  const liveBadgeApi = root.NiftyTradingViewLiveBadge
    || (typeof module !== "undefined" && module.exports ? require("./tradingview-live-badge.js") : null);
  const manualPlanApi = root.NiftyManualPlan
    || (typeof module !== "undefined" && module.exports ? require("./manual-plan.js") : null);
  const manualPayoffApi = root.NiftyManualPayoff
    || (typeof module !== "undefined" && module.exports ? require("./manual-payoff.js") : null);
  const manualInteractionApi = root.NiftyManualInteraction
    || (typeof module !== "undefined" && module.exports ? require("./manual-interaction.js") : null);
  const manualUiApi = root.NiftyManualUi
    || (typeof module !== "undefined" && module.exports ? require("./manual-ui.js") : null);
  const strategyStoreApi = root.OptionsStrategyStore
    || (typeof module !== "undefined" && module.exports ? require("./strategy-store.js") : null);
  const strategyPreviewApi = root.OptionsStrategyPreview
    || (typeof module !== "undefined" && module.exports ? require("./strategy-preview.js") : null);
  const strategyChartApi = root.OptionsStrategyChart
    || (typeof module !== "undefined" && module.exports ? require("./strategy-chart.js") : null);
  const strategyPanelApi = root.OptionsStrategyPanel
    || (typeof module !== "undefined" && module.exports ? require("./strategy-panel.js") : null);
  const premiumHistoryModelApi = root.OptionsPremiumHistoryModel
    || (typeof module !== "undefined" && module.exports ? require("./premium-history-model.js") : null);
  const premiumChartTrialsApi = root.OptionsPremiumChartTrials
    || (typeof module !== "undefined" && module.exports ? require("./premium-chart-trials.js") : null);
  const premiumHistoryPaneApi = root.OptionsPremiumHistoryPane
    || (typeof module !== "undefined" && module.exports ? require("./premium-history-pane.js") : null);
  const DEFAULTS = {
    enabled: false,
    uiTheme: "dark",
    expiry: "current_month",
    panelOpen: false,
    brokerConnection: null,
    selectedStrategyId: "",
    sellerSafetyView: null,
    sellerSafetyChartView: null,
    sellerSafetyChain: null,
    sellerSafetyChainsByExpiry: {},
    manualPlans: manualPlanApi.emptyStore(),
    strategyBook: strategyStoreApi?.emptyBook?.() || {
      version: 1, nextSequence: 1, legs: {}, strategies: {}, versions: {}, quarantine: [], appliedCommands: {}
    }
  };

  function quote(value) {
    if (typeof value === "boolean" || value === null || value === undefined) return null;
    if (typeof value === "string" && value.trim() === "") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function openInterest(value) {
    const numeric = quote(value);
    return numeric !== null && numeric >= 0 ? numeric : null;
  }

  function rankOpenInterestRows(rows) {
    if (!Array.isArray(rows)) return [];
    const ranksFor = (key) => {
      const values = [...new Set(rows
        .map((row) => openInterest(row?.[key]))
        .filter((value) => value !== null && value > 0))]
        .sort((left, right) => right - left);
      return new Map(values.map((value, index) => [value, index + 1]));
    };
    const callRanks = ranksFor("callOi");
    const putRanks = ranksFor("putOi");
    return rows.map((row) => {
      const hasCallOi = Object.prototype.hasOwnProperty.call(row || {}, "callOi");
      const hasPutOi = Object.prototype.hasOwnProperty.call(row || {}, "putOi");
      const callOi = openInterest(row?.callOi);
      const putOi = openInterest(row?.putOi);
      return {
        ...row,
        ...(hasCallOi ? {
          callOi,
          callOiRank: callOi !== null && callOi > 0 ? callRanks.get(callOi) ?? null : null
        } : {}),
        ...(hasPutOi ? {
          putOi,
          putOiRank: putOi !== null && putOi > 0 ? putRanks.get(putOi) ?? null : null
        } : {})
      };
    });
  }

  function riskBandClassName(band) {
    return `nifty-seller-risk__band is-${band.layer} is-${band.kind}`;
  }

  function money(value) {
    const numeric = quote(value);
    return numeric === null ? "—" : numeric.toFixed(2);
  }

  function formatRow(row) {
    return `C ${money(row.call)} | P ${money(row.put)} | ${Number(row.strike).toLocaleString("en-IN")}`;
  }

  function isNiftyChartLabel(label) {
    return /(?:^|\s)NSE(?:_DLY)?:NIFTY(?:\s+50)?(?:,|$)/i.test(String(label || ""));
  }

  function rowLaneLayout(rows, _atm, _interval) {
    if (!Array.isArray(rows) || rows.length < 1) return null;
    const entries = rows.map((row, index) => {
      const strike = Number(row?.strike);
      const y = Number(row?.y);
      if (!Number.isFinite(strike) || !Number.isFinite(y)) return null;
      return { index, strike, y };
    });
    if (entries.some((entry) => !entry)) return null;
    if (new Set(entries.map((entry) => entry.strike)).size !== entries.length) return null;

    return { mode: "single", laneCount: 1, lanes: Array(entries.length).fill(0) };
  }

  function displayAtmStrike(visibleStrikes = [], atm) {
    const target = Number(atm);
    const strikes = [...new Set((Array.isArray(visibleStrikes) ? visibleStrikes : [])
      .map(Number)
      .filter(Number.isFinite))];
    if (!strikes.length || !Number.isFinite(target)) return null;
    return strikes.reduce((nearest, strike) => {
      const distance = Math.abs(strike - target);
      const nearestDistance = Math.abs(nearest - target);
      return distance < nearestDistance || (distance === nearestDistance && strike > nearest)
        ? strike
        : nearest;
    }, strikes[0]);
  }

  function positionSpineBounds(points = [], rect = {}) {
    const ys = (Array.isArray(points) ? points : [])
      .map((point) => Number(point?.y ?? point))
      .filter((y) => Number.isFinite(y)
        && y >= Number(rect.top)
        && y <= Number(rect.bottom));
    if (!ys.length) return null;
    return { top: Math.min(...ys), bottom: Math.max(...ys) };
  }

  function positionSpineLayout(ladderLeft, rect = {}, viewportWidth = 0) {
    const plotLeft = Number(rect.left);
    const plotRight = Number(rect.right);
    const width = Number(viewportWidth);
    const requestedLadderLeft = Number(ladderLeft);
    if (![plotLeft, plotRight, width, requestedLadderLeft].every(Number.isFinite)
      || plotRight <= plotLeft || width <= 0) return null;
    const resolvedLadderLeft = Math.max(plotLeft, Math.min(plotRight, requestedLadderLeft));
    const minimumSpine = plotLeft + POSITION_CONTROL_WIDTH_PX + POSITION_LANE_GAP_PX;
    const spineX = Math.max(minimumSpine, resolvedLadderLeft - POSITION_PUT_GUTTER_PX);
    const call = {
      left: spineX - POSITION_LANE_GAP_PX - POSITION_CONTROL_WIDTH_PX,
      right: spineX - POSITION_LANE_GAP_PX
    };
    const put = {
      left: spineX + POSITION_LANE_GAP_PX,
      right: spineX + POSITION_LANE_GAP_PX + POSITION_CONTROL_WIDTH_PX
    };
    return {
      ladderLeft: resolvedLadderLeft,
      spineX,
      call,
      put,
      hasSafePutGap: put.right <= resolvedLadderLeft - 3
    };
  }

  function breakEvenLabelRight(ladderLeft, rect = {}, viewportWidth = 0, hasPositionControls = false) {
    const plotLeft = Number(rect.left);
    const plotRight = Number(rect.right);
    const requested = Number(ladderLeft);
    if (![plotLeft, plotRight, requested].every(Number.isFinite) || plotRight <= plotLeft) return null;
    const resolved = Math.max(plotLeft, Math.min(plotRight, requested));
    if (!hasPositionControls) return resolved;
    const layout = positionSpineLayout(resolved, rect, viewportWidth);
    if (!layout?.hasSafePutGap) return resolved;
    return Math.max(plotLeft, layout.call.left - POSITION_LANE_GAP_PX);
  }

  function breakEvenLabelRightForRenderedBlockers(labelRight, rect = {}, blockers = [], gap = POSITION_LANE_GAP_PX) {
    const plotLeft = Number(rect.left);
    const plotRight = Number(rect.right);
    const requested = Number(labelRight);
    if (![plotLeft, plotRight, requested].every(Number.isFinite) || plotRight <= plotLeft) return null;
    const resolved = Math.max(plotLeft, Math.min(plotRight, requested));
    const clearance = Number.isFinite(Number(gap)) ? Math.max(0, Number(gap)) : POSITION_LANE_GAP_PX;
    const visibleLefts = (Array.isArray(blockers) ? blockers : [])
      .filter((blocker) => blocker && blocker.hidden !== true && blocker.visible !== false)
      .map((blocker) => ({
        left: Number(blocker.left),
        right: Number(blocker.right),
        top: Number(blocker.top),
        bottom: Number(blocker.bottom)
      }))
      .filter((blocker) => [blocker.left, blocker.right, blocker.top, blocker.bottom].every(Number.isFinite)
        && blocker.right > blocker.left
        && blocker.bottom > blocker.top
        && blocker.right > plotLeft
        && blocker.left < plotRight)
      .map((blocker) => blocker.left);
    if (!visibleLefts.length) return resolved;
    return Math.max(plotLeft, Math.min(resolved, Math.min(...visibleLefts) - clearance));
  }

  function renderedStrategyBlockerRects(rootNodeValue) {
    if (!rootNodeValue?.querySelectorAll) return [];
    const selectors = [
      ".nifty-strategy__card",
      ".nifty-position-spine__compact",
      ".nifty-position-spine__cluster",
      ".nifty-position-spine__cluster-flyout",
      ".nifty-position-spine__card",
      ".nifty-edge-stack__group",
      ".nifty-edge-stack__selector",
      ".nifty-edge-stack__flyout"
    ];
    return selectors.flatMap((selector) => [...rootNodeValue.querySelectorAll(selector)])
      .filter((element) => !element.hidden && !element.classList?.contains?.("is-grouped"))
      .map((element) => {
        try {
          return element.getBoundingClientRect?.() || null;
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  function visibleRowIndexes(rows, dimensions, plotRect, viewportWidth, baseRight, lanes, laneOffset) {
    if (!Array.isArray(rows) || !Array.isArray(dimensions) || rows.length !== dimensions.length) return [];
    if (!Array.isArray(lanes) || lanes.length !== rows.length) return [];
    const top = Number(plotRect?.top);
    const bottom = Number(plotRect?.bottom);
    const left = Number(plotRect?.left);
    const width = Number(viewportWidth);
    const rightInset = Number(baseRight);
    const offset = Number(laneOffset);
    if (![top, bottom, left, width, rightInset, offset].every(Number.isFinite) || bottom <= top || width <= left) return [];
    return rows.map((row, index) => {
      const y = Number(row?.y);
      const rowWidth = Number(dimensions[index]?.width);
      const rowHeight = Number(dimensions[index]?.height);
      const lane = Number(lanes[index]);
      if (![y, rowWidth, rowHeight, lane].every(Number.isFinite)
        || rowWidth <= 0 || rowHeight <= 0 || lane < 0) return null;
      const rowLeft = width - (rightInset + lane * offset) - rowWidth;
      return y - rowHeight / 2 >= top
        && y + rowHeight / 2 <= bottom
        && rowLeft >= left ? index : null;
    }).filter((index) => index !== null);
  }

  function rowsFitPlot(rows, dimensions, plotRect, viewportWidth, baseRight, lanes, laneOffset) {
    if (!Array.isArray(rows)) return false;
    return visibleRowIndexes(rows, dimensions, plotRect, viewportWidth, baseRight, lanes, laneOffset).length === rows.length;
  }

  function priceScaleFailure(kind) {
    if (kind === "overlap") return "VISIBLE STRIKES CANNOT BE PLACED SAFELY";
    if (kind === "outside") return "NO OPTION STRIKES ON VISIBLE PRICE GRID";
    throw new Error("Unknown price-scale failure.");
  }

  function strategyOwnershipChoices(book, instrumentKey, expiry) {
    const existing = strategyStoreApi?.activeStrategies?.(book, instrumentKey, expiry) || [];
    return [
      ...existing.map((strategy) => ({
        kind: "EXISTING",
        strategyId: strategy.id,
        label: `ADD TO ${strategy.label}`
      })),
      { kind: "CREATE_NEW", label: "CREATE NEW STRATEGY" }
    ];
  }

  function chartInstrumentIdentity(label) {
    const match = String(label || "").match(/Chart for\s+([^,]+)/i);
    const instrumentKey = match?.[1]?.trim() || "";
    if (!instrumentKey) return null;
    const underlying = instrumentKey.split(":").at(-1)?.replace(/\s+\d+$/, "").trim() || instrumentKey;
    return { instrumentKey, underlying };
  }

  function premiumHistoryRange(expiry, now = Date.now()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(expiry || ""))) return null;
    const expiryAt = Date.parse(`${expiry}T00:00:00.000Z`);
    const nowAt = Number(now);
    if (!Number.isFinite(expiryAt) || !Number.isFinite(nowAt)) return null;
    const toAt = Math.min(expiryAt, nowAt);
    const contractStartAt = expiryAt - 365 * 86400000;
    const fromAt = Math.min(contractStartAt, toAt);
    return {
      from: new Date(fromAt).toISOString().slice(0, 10),
      to: new Date(toAt).toISOString().slice(0, 10)
    };
  }

  function premiumHistoryStatusMessage(state) {
    if (state?.status !== "unavailable") return null;
    return /extension context invalidated/i.test(String(state?.error || ""))
      ? "RELOAD TRADINGVIEW · EXTENSION UPDATED"
      : null;
  }

  function premiumHistoryStatusView(state, skylinePainted = true) {
    const status = String(state?.status || "closed");
    if (status === "closed" || (status === "ready" && skylinePainted)) return null;
    const strike = Number(state?.selection?.strike);
    const identity = [
      Number.isFinite(strike) ? strike.toLocaleString("en-IN") : null,
      state?.selection?.expiry,
      state?.selection?.interval
    ].filter(Boolean).join(" · ");
    if (status === "loading") {
      return {
        kind: "loading",
        title: "PREMIUM HISTORY · LOADING…",
        detail: identity,
        canRetry: false
      };
    }
    if (status === "ready") {
      return {
        kind: "synchronizing",
        title: "PREMIUM HISTORY · SYNCHRONIZING…",
        detail: "ALIGNING WITH TRADINGVIEW TIME AXIS",
        canRetry: false
      };
    }
    const error = String(state?.error || "CONTRACT HISTORY UNAVAILABLE");
    const reload = premiumHistoryStatusMessage(state);
    const offline = /failed to fetch|fetch failed|network|bridge offline|load failed/i.test(error);
    return {
      kind: status === "stale" ? "stale" : "unavailable",
      title: status === "stale" ? "PREMIUM HISTORY · STALE" : "PREMIUM HISTORY UNAVAILABLE",
      detail: reload || (offline ? "LOCAL BRIDGE OFFLINE" : error),
      canRetry: true
    };
  }

  function premiumHistoryStatusMaxWidth(plotWidth) {
    const width = Number(plotWidth);
    return Number.isFinite(width) ? Math.max(0, width - 24) : null;
  }

  function reconcilePremiumCanvas(documentRef, paint) {
    const painted = Boolean(typeof paint === "function" && paint());
    if (!painted) documentRef?.getElementById?.(PREMIUM_CHART_TRIALS_ID)?.remove?.();
    return painted;
  }

  function normalizePremiumTimeAxis(raw) {
    let parsed = raw;
    if (typeof raw === "string") {
      try { parsed = JSON.parse(raw); } catch { return null; }
    }
    const pairs = Array.isArray(parsed?.pairs) ? parsed.pairs.map((pair) => ({
      ...pair,
      time: Number(pair?.time),
      x: Number(pair?.x)
    })).filter((pair) => Number.isFinite(pair.time) && Number.isFinite(pair.x)) : [];
    if (Number(parsed?.stableCount) < 2 || pairs.length < 2) return null;
    for (let index = 1; index < pairs.length; index += 1) {
      if (pairs[index].time <= pairs[index - 1].time || pairs[index].x <= pairs[index - 1].x) return null;
    }
    const plotRect = pairs.find((pair) => pair?.plotRect)?.plotRect || parsed?.plotRect;
    if (!plotRect || ![plotRect.left, plotRect.top, plotRect.right, plotRect.bottom].every((value) => Number.isFinite(Number(value)))) return null;
    return { ...parsed, pairs, plotRect: { ...plotRect } };
  }

  function setPremiumTimeSync(documentRef, enabled) {
    const element = documentRef?.documentElement;
    if (!element?.setAttribute || !element?.removeAttribute) return false;
    if (enabled) element.setAttribute("data-options-time-sync", "on");
    else {
      element.removeAttribute("data-options-time-axis");
      element.removeAttribute("data-options-time-sync");
    }
    return Boolean(enabled);
  }

  function samePlotRect(left, right) {
    return Boolean(left && right && ["left", "top", "right", "bottom"]
      .every((key) => Number(left[key]) === Number(right[key])));
  }

  function riskLabelLayout(laneZeroRows) {
    const rows = Array.isArray(laneZeroRows) ? laneZeroRows : [laneZeroRows];
    if (!rows.length || rows.some((row) => !row || typeof row.getBoundingClientRect !== "function")) return null;
    const rects = rows.map((row) => row.getBoundingClientRect());
    if (rects.some((rect) => typeof rect?.left !== "number"
      || typeof rect?.right !== "number"
      || !Number.isFinite(rect.left)
      || !Number.isFinite(rect.right)
      || rect.right <= rect.left)) return null;
    return { labelRight: Math.min(...rects.map((rect) => rect.left)) - RISK_LABEL_GAP_PX };
  }

  function edgeStackClusters(items, minimumGap = 20) {
    const gap = Number.isFinite(Number(minimumGap)) && Number(minimumGap) > 0
      ? Number(minimumGap)
      : 20;
    const ordered = (Array.isArray(items) ? items : [])
      .map((item, index) => ({ ...item, y: Number(item?.y), _index: index }))
      .filter((item) => Number.isFinite(item.y))
      .sort((left, right) => left.y - right.y
        || String(left.id).localeCompare(String(right.id))
        || left._index - right._index);
    const clusters = [];
    ordered.forEach((item) => {
      const current = clusters.at(-1);
      if (!current || item.y - current.lastY >= gap) {
        clusters.push({ items: [item], lastY: item.y });
        return;
      }
      current.items.push(item);
      current.lastY = item.y;
    });
    return clusters.map((cluster) => ({
      key: cluster.items.map((item) => String(item.id)).sort().join("|"),
      y: cluster.items.reduce((sum, item) => sum + item.y, 0) / cluster.items.length,
      items: cluster.items.map(({ _index, ...item }) => item)
    }));
  }

  function positionColumnClusters(items, minimumGap = 20) {
    return ["call", "put"].flatMap((side) => edgeStackClusters(
      (Array.isArray(items) ? items : []).filter((item) => item?.side === side),
      minimumGap
    ).map((cluster) => ({
      ...cluster,
      side,
      key: `${side}:${cluster.key}`
    })));
  }

  function placeHeadersAroundFixedControls(cards, controls, options = {}) {
    const minY = Number(options.minY);
    const maxY = Number(options.maxY);
    const gap = Number.isFinite(Number(options.gap)) ? Math.max(0, Number(options.gap)) : 0;
    const controlHeight = Number.isFinite(Number(options.controlHeight))
      ? Math.max(0, Number(options.controlHeight))
      : POSITION_CONTROL_HEIGHT_PX;
    if (!Array.isArray(cards) || !Number.isFinite(minY) || !Number.isFinite(maxY) || minY > maxY) return [];
    const fixed = (Array.isArray(controls) ? controls : [])
      .map((control) => ({ y: Number(control?.y), side: control?.side }))
      .filter((control) => Number.isFinite(control.y))
      .map((control) => ({
        top: control.y - controlHeight / 2,
        bottom: control.y + controlHeight / 2,
        side: control.side
      }));
    const placed = [];
    return cards.map((card, index) => ({
      ...card,
      railY: Number(card?.railY),
      height: Math.max(0, Number(card?.height)),
      _index: index
    })).filter((card) => Number.isFinite(card.railY) && Number.isFinite(card.height))
      .sort((left, right) => left.railY - right.railY || left._index - right._index)
      .map((card) => {
        const desired = card.railY - card.height / 2;
        const obstacles = [...fixed, ...placed]
          .filter((obstacle) => !card.side || !obstacle.side || obstacle.side !== card.side);
        const candidates = new Set([
          Math.max(minY, Math.min(maxY - card.height, desired)),
          minY,
          maxY - card.height
        ]);
        obstacles.forEach((obstacle) => {
          candidates.add(obstacle.top - gap - card.height);
          candidates.add(obstacle.bottom + gap);
        });
        const valid = [...candidates].filter((top) => Number.isFinite(top)
          && top >= minY && top + card.height <= maxY
          && obstacles.every((obstacle) => top + card.height + gap <= obstacle.top
            || top >= obstacle.bottom + gap));
        const cardY = (valid.length ? valid : [Math.max(minY, Math.min(maxY - card.height, desired))])
          .sort((left, right) => Math.abs(left - desired) - Math.abs(right - desired) || left - right)[0];
        placed.push({ top: cardY, bottom: cardY + card.height, side: card.side });
        const { _index, ...result } = card;
        return {
          ...result,
          cardY,
          connector: {
            fromY: cardY + card.height / 2,
            toY: card.railY,
            moved: Math.abs(cardY + card.height / 2 - card.railY) > 0.5
          }
        };
      });
  }

  function axisPriceToY(axisPairs) {
    if (!Array.isArray(axisPairs) || axisPairs.length < 2) return null;
    const pairs = axisPairs.map((pair) => ({ price: Number(pair?.price), y: Number(pair?.y) }));
    if (pairs.some((pair) => !Number.isFinite(pair.price) || !Number.isFinite(pair.y))) return null;
    const first = pairs[0];
    const last = pairs.at(-1);
    const priceSpan = last.price - first.price;
    const pixelSpan = last.y - first.y;
    if (priceSpan === 0 || pixelSpan === 0) return null;
    const slope = pixelSpan / priceSpan;
    if (!Number.isFinite(slope)) return null;
    for (const pair of pairs) {
      if (Math.abs((first.y + (pair.price - first.price) * slope) - pair.y) > 2) return null;
    }
    return (price) => first.y + (Number(price) - first.price) * slope;
  }

  function intervalFromAxisScale(scale) {
    const toY = axisPriceToY(scale?.axisPairs);
    const gap = Number(scale?.gridGapPx);
    if (!toY || !Number.isFinite(gap) || gap <= 0) return null;
    const first = scale.axisPairs[0];
    const second = scale.axisPairs[1];
    const priceDelta = Math.abs(Number(second.price) - Number(first.price));
    const pixelDelta = Math.abs(Number(second.y) - Number(first.y));
    if (!Number.isFinite(priceDelta) || !Number.isFinite(pixelDelta) || pixelDelta <= 0) return null;
    return priceDelta / pixelDelta * gap;
  }

  function freezeMembership({ timeframe, expiry, interval, nativeInterval = interval, axisPrices, spot, chainRows, tieDirection = "up", pinnedStrikes = [] }) {
    const rankedRows = rankOpenInterestRows(chainRows);
    const selection = timeframeApi.selectAxisAlignedRows(rankedRows, spot, axisPrices, undefined, tieDirection);
    if (!selection?.rows?.length) return null;
    const selectedStrikes = new Set(selection.rows.map((row) => Number(row.strike)));
    const chainByStrike = new Map(rankedRows.map((row) => [Number(row?.strike), row]));
    const pins = [...new Set((Array.isArray(pinnedStrikes) ? pinnedStrikes : [])
      .map(Number)
      .filter((strike) => Number.isFinite(strike) && chainByStrike.has(strike)))]
      .sort((left, right) => left - right);
    const offGridStrikes = pins.filter((strike) => !selectedStrikes.has(strike));
    const rows = [...selectedStrikes]
      .sort((left, right) => left - right)
      .map((strike) => chainByStrike.get(strike))
      .filter(Boolean)
      .map((row) => Object.freeze({
      strike: Number(row.strike),
      call: quote(row.call),
      put: quote(row.put),
      ...(Object.prototype.hasOwnProperty.call(row, "callOi") ? {
        callOi: openInterest(row.callOi),
        callOiRank: Number.isInteger(row.callOiRank) ? row.callOiRank : null
      } : {}),
      ...(Object.prototype.hasOwnProperty.call(row, "putOi") ? {
        putOi: openInterest(row.putOi),
        putOiRank: Number.isInteger(row.putOiRank) ? row.putOiRank : null
      } : {})
    }));
    const strikes = rows.map((row) => row.strike);
    const visibleStrikes = strikes.slice();
    return Object.freeze({
      timeframe,
      expiry,
      nativeInterval: selection.interval || timeframeApi.snapStrikeInterval(nativeInterval),
      axisPrices: Object.freeze((selection.axisPrices || []).slice()),
      interval: selection.interval,
      atmStep: selection.atmStep,
      center: selection.center,
      atm: selection.center,
      strikes: Object.freeze(strikes.slice()),
      visibleStrikes: Object.freeze(visibleStrikes),
      pinnedStrikes: Object.freeze(pins),
      offGridStrikes: Object.freeze(offGridStrikes),
      rows: Object.freeze(rows)
    });
  }

  function refreshMembership(membership, chainRows) {
    if (!membership || !Array.isArray(chainRows)) return membership;
    const byStrike = new Map(rankOpenInterestRows(chainRows).map((row) => [Number(row?.strike), row]));
    const rows = membership.rows.map((row) => {
      const live = byStrike.get(row.strike);
      if (!live) return row;
      return Object.freeze({
        strike: row.strike,
        call: quote(live.call),
        put: quote(live.put),
        ...(Object.prototype.hasOwnProperty.call(live, "callOi") ? {
          callOi: openInterest(live.callOi),
          callOiRank: Number.isInteger(live.callOiRank) ? live.callOiRank : null
        } : {}),
        ...(Object.prototype.hasOwnProperty.call(live, "putOi") ? {
          putOi: openInterest(live.putOi),
          putOiRank: Number.isInteger(live.putOiRank) ? live.putOiRank : null
        } : {})
      });
    });
    return Object.freeze({
      ...membership,
      strikes: membership.strikes,
      rows: Object.freeze(rows)
    });
  }

  function sameStrikes(left, right) {
    return Array.isArray(left?.strikes)
      && Array.isArray(right?.strikes)
      && left.strikes.length === right.strikes.length
      && left.strikes.every((strike, index) => strike === right.strikes[index]);
  }

  function refreshMembershipAtSpot(membership, chainRows, spot, tieDirection = "up", pinnedStrikes = membership?.pinnedStrikes || []) {
    const refreshed = refreshMembership(membership, chainRows);
    const atm = timeframeApi.nearestAvailableStrike(chainRows, spot, tieDirection);
    if (!refreshed || !Number.isFinite(atm)) return refreshed;
    if (atm !== refreshed.atm && hasCompleteMembershipRows(refreshed, chainRows)) {
      const reselection = freezeMembership({
        timeframe: refreshed.timeframe,
        expiry: refreshed.expiry,
        interval: refreshed.interval,
        nativeInterval: refreshed.nativeInterval,
        axisPrices: refreshed.axisPrices,
        spot,
        chainRows,
        tieDirection,
        pinnedStrikes
      });
      if (reselection) return reselection;
    }
    return Object.freeze({
      ...refreshed,
      center: atm,
      atm,
      atmStep: timeframeApi.availableStrikeStep(chainRows) || refreshed.atmStep
    });
  }

  function hasCompleteMembershipRows(membership, chainRows) {
    if (!membership || !Array.isArray(chainRows)) return false;
    const available = new Map(chainRows.map((row) => [Number(row?.strike), row]));
    return membership.strikes.every((strike) => {
      const row = available.get(strike);
      return row && quote(row.call) !== null && quote(row.put) !== null;
    });
  }

  function validPineSanity(scale) {
    const lower = Number(scale?.lower?.y);
    const upper = Number(scale?.upper?.y);
    return !Number.isFinite(lower) || !Number.isFinite(upper) || lower > upper;
  }

  function createLadderController(dependencies) {
    const fetchChain = dependencies.fetchChain;
    const captureAxisScale = dependencies.captureAxisScale;
    const renderRows = dependencies.renderRows || (() => {});
    const placeRows = dependencies.placeRows || (() => {});
    const placeRisk = dependencies.placeRisk || (() => {});
    const hideRisk = dependencies.hideRisk || (() => {});
    const hideRows = dependencies.hideRows || (() => {});
    const concealRows = dependencies.concealRows || (() => {});
    const setStatus = dependencies.setStatus || (() => {});
    const axisObservationAt = dependencies.axisObservationAt || (() => 0);
    const activeTimeframe = dependencies.activeTimeframe || (() => desiredTimeframe);
    const beginVisualPlacement = dependencies.beginVisualPlacement || (() => undefined);
    const currentVisualPlacementRevision = dependencies.currentVisualPlacementRevision || (() => undefined);
    const isVisualPlacementCurrent = dependencies.isVisualPlacementCurrent || (() => true);
    const activeStrikes = dependencies.activeStrikes || (() => []);
    let expiry = dependencies.expiry || DEFAULTS.expiry;
    const scheduleRetry = dependencies.scheduleRetry || ((run, delay) => setTimeout(run, delay));
    const cancelRetry = dependencies.cancelRetry || clearTimeout;
    const now = dependencies.now || (() => Date.now());
    const scheduleRiskDeadline = dependencies.scheduleRiskDeadline || ((run, delay) => setTimeout(run, delay));
    const cancelRiskDeadline = dependencies.cancelRiskDeadline || clearTimeout;
    let current = null;
    let desiredTimeframe = null;
    let generation = 0;
    let rebuildAbort = null;
    let refreshing = false;
    let refreshAbort = null;
    let refreshRevision = 0;
    let rebuilding = false;
    let retryTimer = null;
    let riskDeadlineTimer = null;
    let retryIndex = 0;
    let cachedAxisToY = null;
    let committedVisualPlacementRevision = undefined;
    let hasCommittedVisualPlacement = false;
    let cachedRiskLayout = null;
    let cachedRiskGeneration = null;
    let placementRevision = 0;
    let committedAxisObservedAt = 0;
    let transitionMinimumObservedAt = 0;
    let lastSpot = null;
    let dataStatus = "STALE";
    let cachedChain = null;
    const chainSnapshotsByExpiry = new Map();
    let riskView = dependencies.riskView || null;

    function normalizedChainSnapshot(snapshot) {
      if (!snapshot
        || snapshot.version !== 1
        || !sellerViewIdentityApi.exactIsoDate(snapshot.expiry)
        || typeof snapshot.updatedAt !== "string"
        || !Number.isFinite(Date.parse(snapshot.updatedAt))
        || Number(now()) - Date.parse(snapshot.updatedAt) > SELLER_SAFETY_STALE_MS
        || typeof snapshot.lotSize !== "number"
        || !Number.isInteger(snapshot.lotSize)
        || snapshot.lotSize <= 0
        || !Number.isFinite(Number(snapshot.spot))
        || !Array.isArray(snapshot.rows)
        || snapshot.rows.length < 1
        || snapshot.rows.some((row) => !Number.isFinite(Number(row?.strike)))
        || new Set(snapshot.rows.map((row) => Number(row.strike))).size !== snapshot.rows.length) return null;
      return {
        version: 1,
        updatedAt: snapshot.updatedAt,
        expiry: snapshot.expiry,
        lotSize: snapshot.lotSize,
        spot: Number(snapshot.spot),
        rows: snapshot.rows.map((row) => ({ ...row }))
      };
    }

    function setChainSnapshot(snapshot) {
      const stored = normalizedChainSnapshot(snapshot);
      if (!stored) return false;
      chainSnapshotsByExpiry.set(stored.expiry, stored);
      if (stored.expiry !== expiry) return false;
      cachedChain = stored;
      return true;
    }

    function setChainSnapshots(snapshots) {
      if (!snapshots || typeof snapshots !== "object" || Array.isArray(snapshots)) return 0;
      chainSnapshotsByExpiry.clear();
      let accepted = 0;
      for (const snapshot of Object.values(snapshots)) {
        const stored = normalizedChainSnapshot(snapshot);
        if (!stored) continue;
        chainSnapshotsByExpiry.set(stored.expiry, stored);
        accepted += 1;
      }
      cachedChain = chainSnapshotsByExpiry.get(expiry) || null;
      return accepted;
    }

    setChainSnapshots(dependencies.chainSnapshotsByExpiry);
    if (dependencies.chainSnapshot) setChainSnapshot(dependencies.chainSnapshot);
    cachedChain = chainSnapshotsByExpiry.get(expiry) || null;

    function clearRebuildRetry() {
      if (retryTimer !== null) cancelRetry(retryTimer);
      retryTimer = null;
    }

    function clearRiskDeadline() {
      if (riskDeadlineTimer !== null) cancelRiskDeadline(riskDeadlineTimer);
      riskDeadlineTimer = null;
    }

    function riskDeadline(view) {
      const brokerUpdatedAt = Date.parse(view?.brokerUpdatedAt || "");
      const sessionExpiresAt = Date.parse(view?.brokerSessionExpiresAt || "");
      const deadlines = [];
      if (Number.isFinite(brokerUpdatedAt)) deadlines.push(brokerUpdatedAt + SELLER_SAFETY_STALE_MS);
      if (Number.isFinite(sessionExpiresAt)) deadlines.push(sessionExpiresAt);
      return deadlines.length ? Math.min(...deadlines) : null;
    }

    function riskIsPublishable(view, at = now()) {
      if (!sellerViewIdentityApi.isCanonicalAcceptedView(view)) return false;
      const deadline = riskDeadline(view);
      return deadline === null || Number(at) < deadline;
    }

    function armRiskDeadline() {
      clearRiskDeadline();
      if (!riskView) return;
      const view = riskView;
      const deadline = riskDeadline(view);
      if (!riskIsPublishable(view)) {
        hideRisk();
        return;
      }
      if (deadline === null) return;
      riskDeadlineTimer = scheduleRiskDeadline(() => {
        riskDeadlineTimer = null;
        if (riskView === view && !riskIsPublishable(view)) hideRisk();
      }, Math.max(0, deadline - Number(now())));
    }

    function positionedRows(membership, toY) {
      if (!membership || typeof toY !== "function") return null;
      const positioned = membership.rows.map((row) => ({
        ...row,
        text: formatRow(row),
        isAtm: row.strike === membership.atm,
        y: toY(row.strike)
      }));
      return positioned.length >= 1
        && positioned.every((row) => Number.isFinite(row.y)) ? positioned : null;
    }

    function clearCachedRiskPlacement() {
      cachedRiskLayout = null;
      cachedRiskGeneration = null;
    }

    function placeCached(membership = current, visualPlacementRevision = beginVisualPlacement()) {
      if (!isVisualPlacementCurrent(visualPlacementRevision)) return false;
      const positioned = positionedRows(membership, cachedAxisToY);
      if (!positioned) return false;
      clearCachedRiskPlacement();
      const rowPlacement = placeRows(positioned, membership, cachedAxisToY, visualPlacementRevision);
      if (!isVisualPlacementCurrent(visualPlacementRevision) || rowPlacement === false) return false;
      if (visualPlacementRevision !== undefined) {
        committedVisualPlacementRevision = visualPlacementRevision;
        hasCommittedVisualPlacement = true;
      }
      cachedRiskLayout = rowPlacement && typeof rowPlacement === "object"
        ? rowPlacement.riskLayout || null
        : null;
      if (cachedRiskLayout) cachedRiskGeneration = generation;
      if (riskIsPublishable(riskView) && isVisualPlacementCurrent(visualPlacementRevision)) {
        try {
          placeRisk(riskView, cachedAxisToY, membership, cachedRiskLayout);
        } catch {
          hideRisk();
        }
      } else {
        hideRisk();
      }
      return true;
    }

    function setRiskView(nextView) {
      riskView = nextView || null;
      armRiskDeadline();
      if (!riskView) {
        hideRisk();
        return true;
      }
      if (!riskIsPublishable(riskView)
        || rebuilding
        || !current
        || current.expiry !== expiry
        || current.timeframe !== desiredTimeframe
        || typeof cachedAxisToY !== "function"
        || !cachedRiskLayout
        || cachedRiskGeneration !== generation) {
        hideRisk();
        return false;
      }
      try {
        if (placeRisk(riskView, cachedAxisToY, current, cachedRiskLayout) === false) {
          hideRisk();
          return false;
        }
        return true;
      } catch {
        hideRisk();
        return false;
      }
    }

    function isCurrentRequest(localGeneration, timeframe, requestedExpiry, signal) {
      return localGeneration === generation
        && desiredTimeframe === timeframe
        && expiry === requestedExpiry
        && !signal?.aborted;
    }

    function retryRebuild(localGeneration, timeframe, requestedExpiry, minimumObservedAt, delayFloor = 0) {
      if (!isCurrentRequest(localGeneration, timeframe, requestedExpiry) || retryTimer !== null) return;
      const configuredDelay = RETRY_DELAYS[retryIndex++];
      if (configuredDelay === undefined) return;
      const delay = Math.max(configuredDelay, delayFloor);
      retryTimer = scheduleRetry(async () => {
        retryTimer = null;
        if (desiredTimeframe === timeframe && expiry === requestedExpiry) {
          await rebuild(timeframe, false, minimumObservedAt);
        }
      }, delay);
    }

    function failRebuild(localGeneration, timeframe, requestedExpiry, signal, message, minimumObservedAt, allowRetry = true, visualPlacementRevision) {
      if (!isCurrentRequest(localGeneration, timeframe, requestedExpiry, signal)
        || !isVisualPlacementCurrent(visualPlacementRevision)) return false;
      current = null;
      cachedAxisToY = null;
      committedVisualPlacementRevision = undefined;
      hasCommittedVisualPlacement = false;
      clearCachedRiskPlacement();
      hideRisk();
      hideRows(message || "AXIS CALIBRATION UNAVAILABLE");
      if (allowRetry) retryRebuild(localGeneration, timeframe, requestedExpiry, minimumObservedAt);
      return false;
    }

    async function rebuild(timeframe, resetRetry = true, minimumObservedAt = 0) {
      if (!timeframe) return false;
      clearCachedRiskPlacement();
      refreshRevision += 1;
      refreshAbort?.abort();
      refreshAbort = null;
      refreshing = false;
      desiredTimeframe = timeframe;
      if (resetRetry) {
        clearRebuildRetry();
        retryIndex = 0;
      }
      const localGeneration = ++generation;
      rebuilding = true;
      const requestedExpiry = expiry;
      rebuildAbort?.abort();
      rebuildAbort = typeof AbortController === "undefined" ? null : new AbortController();
      const signal = rebuildAbort?.signal;
      setStatus("CALIBRATING");
      concealRows("CALIBRATING");
      const visualPlacementRevision = beginVisualPlacement();
      try {
        let chain = cachedChain;
        if (!chain) {
          try {
            chain = await fetchChain(requestedExpiry, signal);
          } catch (error) {
            return failRebuild(
              localGeneration,
              timeframe,
              requestedExpiry,
              signal,
              error?.message || "Option chain unavailable.",
              minimumObservedAt,
              false,
              visualPlacementRevision
            );
          }
          if (!isCurrentRequest(localGeneration, timeframe, requestedExpiry, signal)
            || !isVisualPlacementCurrent(visualPlacementRevision)) return false;
          cachedChain = chain;
        }
        const firstScale = await captureAxisScale(signal, { minimumObservedAt, timeframe });
        if (!isCurrentRequest(localGeneration, timeframe, requestedExpiry, signal)
          || !isVisualPlacementCurrent(visualPlacementRevision)) return false;
        const firstNativeInterval = timeframeApi.snapStrikeInterval(intervalFromAxisScale(firstScale));
        if (!firstScale?.ok || !validPineSanity(firstScale) || !firstNativeInterval || !Number.isFinite(Number(chain?.spot))) {
          return failRebuild(localGeneration, timeframe, requestedExpiry, signal, "AXIS CALIBRATION UNAVAILABLE", minimumObservedAt, true, visualPlacementRevision);
        }
        const secondScale = await captureAxisScale(signal, { minimumObservedAt, timeframe });
        if (!isCurrentRequest(localGeneration, timeframe, requestedExpiry, signal)
          || !isVisualPlacementCurrent(visualPlacementRevision)) return false;
        const secondNativeInterval = timeframeApi.snapStrikeInterval(intervalFromAxisScale(secondScale));
        if (!secondScale?.ok
          || !validPineSanity(secondScale)
          || !secondNativeInterval
          || secondNativeInterval !== firstNativeInterval
          || secondScale.observationSignature !== firstScale.observationSignature) {
          return failRebuild(localGeneration, timeframe, requestedExpiry, signal, "AXIS CALIBRATION UNAVAILABLE", minimumObservedAt, true, visualPlacementRevision);
        }
        const membership = freezeMembership({
          timeframe,
          expiry: requestedExpiry,
          interval: secondNativeInterval,
          nativeInterval: secondNativeInterval,
          axisPrices: secondScale.axisPairs.map((pair) => Number(pair.price)),
          spot: Number(chain.spot),
          chainRows: chain.rows,
          pinnedStrikes: activeStrikes()
        });
        if (!membership) {
          return failRebuild(localGeneration, timeframe, requestedExpiry, signal, "VISIBLE AXIS CONTRACTS UNAVAILABLE", minimumObservedAt, true, visualPlacementRevision);
        }
        current = membership;
        lastSpot = Number(chain.spot);
        cachedAxisToY = axisPriceToY(secondScale.axisPairs);
        renderRows(current.rows, current);
        if (!placeCached(current, visualPlacementRevision)) {
          return failRebuild(localGeneration, timeframe, requestedExpiry, signal, "Exact strike positions are unavailable.", minimumObservedAt, true, visualPlacementRevision);
        }
        dataStatus = hasCompleteMembershipRows(current, chain.rows) ? "LIVE" : "PARTIAL";
        setStatus(dataStatus);
        if (Number.isFinite(Number(secondScale.observedAt))) {
          committedAxisObservedAt = Math.max(committedAxisObservedAt, Number(secondScale.observedAt));
        }
        clearRebuildRetry();
        retryIndex = 0;
        transitionMinimumObservedAt = 0;
        return true;
      } catch (error) {
        return failRebuild(localGeneration, timeframe, requestedExpiry, signal, error?.message || "AXIS CALIBRATION UNAVAILABLE", minimumObservedAt, true, visualPlacementRevision);
      } finally {
        if (localGeneration === generation) rebuilding = false;
      }
    }

    async function syncTimeframe(label) {
      const timeframe = timeframeApi.timeframeKey(label);
      if (!timeframe) {
        generation += 1;
        refreshRevision += 1;
        refreshAbort?.abort();
        refreshAbort = null;
        refreshing = false;
        rebuildAbort?.abort();
        rebuildAbort = null;
        rebuilding = false;
        clearRebuildRetry();
        desiredTimeframe = null;
        transitionMinimumObservedAt = 0;
        current = null;
        cachedAxisToY = null;
        committedVisualPlacementRevision = undefined;
        hasCommittedVisualPlacement = false;
        clearCachedRiskPlacement();
        hideRisk();
        hideRows("UNSUPPORTED TIMEFRAME");
        setStatus("UNSUPPORTED TIMEFRAME");
        return false;
      }
      if (desiredTimeframe === timeframe) {
        return current ? false : rebuild(timeframe, true, transitionMinimumObservedAt);
      }
      const minimumObservedAt = committedAxisObservedAt > 0 ? committedAxisObservedAt + 1 : 0;
      transitionMinimumObservedAt = minimumObservedAt;
      return rebuild(timeframe, true, minimumObservedAt);
    }

    async function refreshLtp() {
      if (!current || rebuilding) return false;
      const visualPlacementRevision = currentVisualPlacementRevision();
      refreshing = true;
      const snapshot = current;
      let refreshOwnedMembership = snapshot;
      let acceptedFreshData = false;
      const snapshotGeneration = generation;
      const localRefreshRevision = ++refreshRevision;
      refreshAbort?.abort();
      const localRefreshAbort = typeof AbortController === "undefined" ? null : new AbortController();
      refreshAbort = localRefreshAbort;
      try {
        const chain = await fetchChain(expiry, localRefreshAbort?.signal);
        if (generation !== snapshotGeneration
          || localRefreshRevision !== refreshRevision
          || current?.expiry !== expiry) return false;
        cachedChain = chain;
        const membership = current;
        const spot = Number(chain?.spot);
        const direction = Number.isFinite(lastSpot) && spot < lastSpot
          ? "down"
          : Number.isFinite(lastSpot) && spot > lastSpot
          ? "up"
          : membership.atm <= spot ? "down" : "up";
        current = Number.isFinite(spot)
          ? refreshMembershipAtSpot(membership, chain?.rows, spot, direction, activeStrikes())
          : refreshMembership(membership, chain?.rows);
        refreshOwnedMembership = current;
        acceptedFreshData = true;
        const complete = hasCompleteMembershipRows(current, chain?.rows);
        if (complete && Number.isFinite(spot)) lastSpot = spot;
        dataStatus = complete ? "LIVE" : "PARTIAL";
        renderRows(current.rows, current);
        const refreshVisualPlacementRevision = isVisualPlacementCurrent(visualPlacementRevision)
          ? visualPlacementRevision
          : (hasCommittedVisualPlacement && isVisualPlacementCurrent(committedVisualPlacementRevision)
            ? committedVisualPlacementRevision
            : null);
        if (refreshVisualPlacementRevision !== null) {
          const placed = placeCached(current, refreshVisualPlacementRevision);
          if (!placed) throw new Error("EXACT STRIKE POSITIONS UNAVAILABLE");
        }
        setStatus(dataStatus);
        return true;
      } catch (error) {
        if (generation === snapshotGeneration
          && localRefreshRevision === refreshRevision
          && current === refreshOwnedMembership
          && snapshot.expiry === expiry
          && error?.name !== "AbortError") {
          if (acceptedFreshData) {
            concealRows(error?.message || "EXACT STRIKE POSITIONS UNAVAILABLE");
            setStatus(error?.message || "EXACT STRIKE POSITIONS UNAVAILABLE");
          } else {
            dataStatus = "STALE";
            setStatus(dataStatus);
          }
        }
        return false;
      } finally {
        if (localRefreshRevision === refreshRevision) {
          refreshing = false;
          refreshAbort = null;
        }
      }
    }

    async function updateAxisPlacement(replaceMembership, visualPlacementRevision) {
      const snapshot = current;
      if (!snapshot || rebuilding || snapshot.expiry !== expiry || snapshot.timeframe !== desiredTimeframe) return false;
      const localVisualPlacementRevision = visualPlacementRevision === undefined
        ? beginVisualPlacement()
        : visualPlacementRevision;
      clearCachedRiskPlacement();
      const placementGeneration = generation;
      const localPlacementRevision = ++placementRevision;
      try {
        const scale = await captureAxisScale(undefined, {
          minimumObservedAt: committedAxisObservedAt,
          timeframe: snapshot.timeframe
        });
        if (generation !== placementGeneration
          || localPlacementRevision !== placementRevision
          || rebuilding
          || snapshot.expiry !== expiry
          || snapshot.timeframe !== desiredTimeframe
          || !isVisualPlacementCurrent(localVisualPlacementRevision)
          || !current) return false;
        if (!scale?.ok || !validPineSanity(scale)) throw new Error("Axis calibration unavailable.");
        if (activeTimeframe() !== snapshot.timeframe) throw new Error("Timeframe changed during axis capture.");
        if (Number.isFinite(Number(scale.observedAt))
          && Number(scale.observedAt) < committedAxisObservedAt) throw new Error("Stale axis observation.");
        const toY = axisPriceToY(scale.axisPairs);
        if (!toY) throw new Error("Native axis map is unavailable.");
        const nativeInterval = timeframeApi.snapStrikeInterval(intervalFromAxisScale(scale));
        const latestMembership = current;
        if (replaceMembership) {
          const axisMembership = freezeMembership({
            timeframe: latestMembership.timeframe,
            expiry: latestMembership.expiry,
            interval: nativeInterval,
            nativeInterval,
            axisPrices: scale.axisPairs.map((pair) => Number(pair.price)),
            spot: Number(cachedChain?.spot ?? latestMembership.atm),
            chainRows: cachedChain?.rows || latestMembership.rows,
            pinnedStrikes: activeStrikes()
          });
          if (!axisMembership) throw new Error("Visible axis contracts are unavailable.");
          const membershipChanged = !sameStrikes(latestMembership, axisMembership);
          current = axisMembership;
          if (membershipChanged) renderRows(current.rows, current);
        }
        cachedAxisToY = toY;
        if (!placeCached(current, localVisualPlacementRevision)) throw new Error("Exact strike positions are unavailable.");
        if (Number.isFinite(Number(scale.observedAt))) {
          committedAxisObservedAt = Math.max(committedAxisObservedAt, Number(scale.observedAt));
        }
        setStatus(dataStatus);
        return true;
      } catch (error) {
        if (generation !== placementGeneration
          || localPlacementRevision !== placementRevision
          || rebuilding
          || snapshot.expiry !== expiry
          || snapshot.timeframe !== desiredTimeframe
          || !isVisualPlacementCurrent(localVisualPlacementRevision)
          || !current) return false;
        clearCachedRiskPlacement();
        concealRows(error?.message || "AXIS CALIBRATION UNAVAILABLE");
        setStatus(error?.message || "AXIS CALIBRATION UNAVAILABLE");
        return false;
      }
    }

    function place(visualPlacementRevision) {
      return updateAxisPlacement(true, visualPlacementRevision);
    }

    function remap(visualPlacementRevision) {
      return updateAxisPlacement(false, visualPlacementRevision);
    }

    async function setExpiry(nextExpiry) {
      if (!nextExpiry || nextExpiry === expiry) return false;
      expiry = nextExpiry;
      generation += 1;
      refreshRevision += 1;
      refreshAbort?.abort();
      refreshAbort = null;
      refreshing = false;
      rebuildAbort?.abort();
      rebuildAbort = null;
      rebuilding = false;
      clearRebuildRetry();
      clearRiskDeadline();
      current = null;
      cachedChain = chainSnapshotsByExpiry.get(expiry) || null;
      cachedAxisToY = null;
      committedVisualPlacementRevision = undefined;
      hasCommittedVisualPlacement = false;
      clearCachedRiskPlacement();
      hideRisk();
      dataStatus = "STALE";
      hideRows("PRESS REFRESH OPTION NUMBERS");
      setStatus("MANUAL REFRESH REQUIRED");
      return Boolean(cachedChain);
    }

    function invalidate() {
      generation += 1;
      refreshRevision += 1;
      refreshAbort?.abort();
      refreshAbort = null;
      refreshing = false;
      rebuildAbort?.abort();
      rebuildAbort = null;
      rebuilding = false;
      clearRebuildRetry();
      clearRiskDeadline();
      desiredTimeframe = null;
      current = null;
      cachedAxisToY = null;
      committedVisualPlacementRevision = undefined;
      hasCommittedVisualPlacement = false;
      clearCachedRiskPlacement();
      hideRisk();
      dataStatus = "STALE";
      placementRevision += 1;
    }

    armRiskDeadline();

    return {
      chain: () => cachedChain,
      hasCachedChain: () => Boolean(cachedChain),
      invalidate,
      membership: () => current,
      place,
      remap,
      rebuild,
      refreshLtp,
      setChainSnapshot,
      setChainSnapshots,
      setExpiry,
      setRiskView,
      syncTimeframe
    };
  }

  function applyRiskStorageChanges(changes, area, targetSettings, activeController) {
    if (area !== "local" || !changes || !targetSettings) return false;
    let changed = false;
    if (changes.selectedStrategyId) {
      targetSettings.selectedStrategyId = changes.selectedStrategyId.newValue || "";
      changed = true;
    }
    if (changes.sellerSafetyView) {
      targetSettings.sellerSafetyView = changes.sellerSafetyView.newValue || null;
      changed = true;
    }
    if (changes.sellerSafetyChartView) {
      targetSettings.sellerSafetyChartView = changes.sellerSafetyChartView.newValue || null;
      changed = true;
    }
    if (changed && targetSettings.enabled) {
      const candidate = targetSettings.sellerSafetyChartView ||
        (changes.sellerSafetyChartView ? null : targetSettings.sellerSafetyView);
      const normalized = sellerViewIdentityApi.normalizeStoredRiskViews({
        sellerSafetyView: targetSettings.sellerSafetyView,
        sellerSafetyChartView: candidate
      });
      if (normalized.sellerSafetyChartView !== candidate) {
        targetSettings.sellerSafetyChartView = normalized.sellerSafetyChartView;
      }
      activeController?.setRiskView(normalized.sellerSafetyChartView);
    }
    return changed;
  }

  const api = {
    applyRiskStorageChanges,
    axisPriceToY,
    edgeStackClusters,
    positionColumnClusters,
    createLadderController,
    formatRow,
    freezeMembership,
    intervalFromAxisScale,
    isNiftyChartLabel,
    normalizeStoredRiskViews: sellerViewIdentityApi.normalizeStoredRiskViews,
    refreshMembership,
    riskBandClassName,
    riskLabelLayout,
    rowLaneLayout,
    displayAtmStrike,
    positionSpineBounds,
    positionSpineLayout,
    breakEvenLabelRight,
    breakEvenLabelRightForRenderedBlockers,
    rowsFitPlot,
    strategyOwnershipChoices,
    chartInstrumentIdentity,
    normalizePremiumTimeAxis,
    premiumHistoryRange,
    premiumHistoryStatusMessage,
    premiumHistoryStatusMaxWidth,
    premiumHistoryStatusView,
    reconcilePremiumCanvas,
    rankOpenInterestRows,
    setPremiumTimeSync,
    visibleRowIndexes,
    priceScaleFailure
  };
  root.NiftyAxisLadderContent = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  let settings = { ...DEFAULTS };
  let controller = null;
  let timeframeTimer = null;
  let axisPlacementTimer = null;
  let viewportResizeTimer = null;
  let viewportResizeActive = false;
  let axisPlacementPreserveMembership = false;
  let retryTimers = [];
  let currentLabel = null;
  let currentUrl = String(root.location?.href || "");
  let runtimeObserver = null;
  let normalStatus = "LIVE";
  let breakEvenStatusOverride = null;
  let manualPayoffStatusOverride = null;
  let stopLiveBadgeDecorator = () => {};
  try {
    stopLiveBadgeDecorator = liveBadgeApi?.install?.(document, MutationObserver) || (() => {});
  } catch (_) {
    stopLiveBadgeDecorator = () => {};
  }

  function teardownLiveBadgeDecorator() {
    const stopDecorator = stopLiveBadgeDecorator;
    stopLiveBadgeDecorator = () => {};
    try {
      stopDecorator();
    } catch (_) {}
  }

  if (typeof root.addEventListener === "function") {
    root.addEventListener("unload", teardownLiveBadgeDecorator, { once: true });
  }

  let breakEvenSelection = breakEvenApi?.createSelectionController(() => renderBreakEvenSelection()) || {
    clear() {},
    current() { return null; },
    select() { return false; }
  };
  let manualInteraction = null;
  let manualEditor = null;
  let manualEditorToken = 0;
  let manualLifecycleGeneration = 0;
  let railVisualRevision = 0;
  let manualRowsConcealed = false;
  let expandedManualRailDisclosure = null;
  let strategyChartController = null;
  let openedStrategyId = null;
  let visibleStrategyRailId = null;
  let openedEdgeGroupKey = null;
  let strategyOwnershipChooser = null;
  let premiumHistoryPane = null;
  let premiumChartPlacement = null;
  let premiumSkylineState = null;
  let premiumSkylineCrosshair = null;
  let premiumSkylinePointerListener = null;
  let premiumSkylinePaintFrame = null;

  function clearPremiumChartTrials() {
    if (premiumSkylinePointerListener) {
      document.removeEventListener("pointermove", premiumSkylinePointerListener, true);
      premiumSkylinePointerListener = null;
    }
    if (premiumSkylinePaintFrame !== null) {
      root.cancelAnimationFrame?.(premiumSkylinePaintFrame);
      root.clearTimeout?.(premiumSkylinePaintFrame);
      premiumSkylinePaintFrame = null;
    }
    premiumSkylineState = null;
    premiumSkylineCrosshair = null;
    document.getElementById(PREMIUM_CHART_TRIALS_ID)?.remove();
  }

  function drawPremiumSkyline(context, segments, color, dashed) {
    segments.forEach((segment) => {
      if (!segment.length) return;
      context.save();
      context.fillStyle = color;
      context.globalAlpha = dashed ? 0.06 : 0.1;
      context.beginPath();
      context.moveTo(segment[0].x, segment[0].anchorY);
      segment.forEach((point) => context.lineTo(point.x, point.y));
      context.lineTo(segment.at(-1).x, segment.at(-1).anchorY);
      context.closePath();
      context.fill();
      context.globalAlpha = dashed ? 0.65 : 0.9;
      context.strokeStyle = color;
      context.lineWidth = dashed ? 1.75 : 2.25;
      context.setLineDash(dashed ? [7, 5] : []);
      context.beginPath();
      context.moveTo(segment[0].x, segment[0].y);
      segment.slice(1).forEach((point) => context.lineTo(point.x, point.y));
      context.stroke();
      context.setLineDash([]);
      if (segment.length === 1) context.fillRect(segment[0].x - 2, segment[0].y - 2, 4, 4);
      context.restore();
    });
  }

  function premiumSkylineCanvas(plotRect, width, height) {
    const node = document.getElementById(LABELS_ID);
    if (!node) return null;
    let canvas = document.getElementById(PREMIUM_CHART_TRIALS_ID);
    if (!canvas) {
      canvas = document.createElement("canvas");
      if (typeof canvas.getContext !== "function") return null;
      canvas.id = PREMIUM_CHART_TRIALS_ID;
      canvas.setAttribute("aria-hidden", "false");
      canvas.setAttribute("role", "img");
      canvas.style.pointerEvents = "none";
      node.append(canvas);
    }
    const ratio = Math.max(1, Number(root.devicePixelRatio) || 1);
    canvas.style.left = `${Number(plotRect.left)}px`;
    canvas.style.top = `${Number(plotRect.top)}px`;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const pixelWidth = Math.ceil(width * ratio);
    const pixelHeight = Math.ceil(height * ratio);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    return { canvas, ratio };
  }

  function drawPremiumSkylineChip(context, box, text, fill, ink, border = null) {
    if (!box) return;
    context.save();
    context.globalAlpha = 0.96;
    context.fillStyle = fill;
    context.fillRect(box.x, box.y, box.width, box.height);
    if (border) {
      context.strokeStyle = border;
      context.lineWidth = 1;
      context.strokeRect(box.x + 0.5, box.y + 0.5, Math.max(0, box.width - 1), Math.max(0, box.height - 1));
    }
    context.globalAlpha = 1;
    context.fillStyle = ink;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, box.x + box.width / 2, box.y + box.height / 2);
    context.restore();
  }

  function premiumSkylineTimestamp(time) {
    if (!Number.isFinite(Number(time))) return "GAP";
    const parts = new Intl.DateTimeFormat("en-IN", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false
    }).formatToParts(new Date(Number(time)));
    const part = (type) => parts.find((item) => item.type === type)?.value || "";
    return `${part("day")} ${part("month").toUpperCase()} · ${part("hour")}:${part("minute")}`;
  }

  function drawPremiumSkylineCrosshair(context, state, colors, localToY) {
    const hover = premiumSkylineCrosshair;
    if (!hover || !Number.isFinite(Number(hover.localX))) return;
    const x = Number(hover.localX);
    const strike = Number(state?.selection?.strike);
    const sample = premiumChartTrialsApi.skylineCrosshairSample(hover.candle, strike, localToY)
      || { anchorY: Number(localToY(strike)), call: null, put: null };
    context.save();
    context.strokeStyle = colors.secondary;
    context.globalAlpha = 0.7;
    context.lineWidth = 1;
    context.setLineDash([3, 4]);
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, Number(state?.timeAxis?.plotRect?.bottom) - Number(state?.timeAxis?.plotRect?.top));
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = colors.accent;
    if (sample?.call) context.fillRect(x - 3, sample.call.y - 3, 6, 6);
    if (sample?.put) context.fillRect(x - 3, sample.put.y - 3, 6, 6);

    const call = sample?.call ? Number(sample.call.premium) : null;
    const put = sample?.put ? Number(sample.put.premium) : null;
    const date = premiumSkylineTimestamp(hover.time);
    const labels = {
      date,
      call: Number.isFinite(call) ? `CALL ${call.toFixed(2)} ↑` : "",
      put: Number.isFinite(put) ? `PUT ${put.toFixed(2)} ↓` : "",
      strike: strike.toLocaleString("en-IN"),
      missing: "NO PREMIUM CANDLE"
    };
    const plotWidth = Number(state?.timeAxis?.plotRect?.right) - Number(state?.timeAxis?.plotRect?.left);
    const plotHeight = Number(state?.timeAxis?.plotRect?.bottom) - Number(state?.timeAxis?.plotRect?.top);
    context.font = '600 11px "Geist Mono", ui-monospace, monospace';
    const chipWidth = (text) => Math.ceil(context.measureText(text).width) + 20;
    const layout = premiumChartTrialsApi.spatialLabelLayout({
      plotWidth,
      plotHeight,
      x,
      anchorY: sample.anchorY,
      callY: Number.isFinite(call) ? sample.call.y : null,
      putY: Number.isFinite(put) ? sample.put.y : null,
      widths: {
        date: chipWidth(labels.date),
        call: chipWidth(labels.call),
        put: chipWidth(labels.put),
        strike: chipWidth(labels.strike),
        missing: chipWidth(labels.missing)
      },
      height: 24
    });
    if (layout) {
      drawPremiumSkylineChip(context, layout.date, labels.date, colors.panel, colors.primary, colors.line);
      drawPremiumSkylineChip(context, layout.call, labels.call, colors.callFill, colors.callInk, colors.line);
      drawPremiumSkylineChip(context, layout.put, labels.put, colors.putFill, colors.putInk, colors.line);
      drawPremiumSkylineChip(context, layout.strike, labels.strike, colors.accent, colors.strikeInk);
      drawPremiumSkylineChip(context, layout.missing, labels.missing, colors.neutralFill, colors.neutralInk, colors.line);
    }
    context.restore();
  }

  function paintPremiumSkyline(state, placement = premiumChartPlacement) {
    const selectedStrike = Number(state?.selection?.strike);
    const plotRect = placement?.plotRect;
    const priceToClientY = placement?.toY;
    const width = Number(plotRect?.right) - Number(plotRect?.left);
    const height = Number(plotRect?.bottom) - Number(plotRect?.top);
    if (!premiumChartTrialsApi || !Number.isFinite(selectedStrike)
      || state?.status === "closed" || !Array.isArray(state?.view?.points)
      || typeof priceToClientY !== "function" || ![width, height].every(Number.isFinite)
      || width <= 1 || height <= 1) return false;
    const axis = premiumHistoryPaneApi.synchronizedTimeAxis(state.timeAxis, width);
    if (!axis) return false;
    const target = premiumSkylineCanvas(plotRect, width, height);
    if (!target) return false;
    const { canvas, ratio } = target;
    canvas.setAttribute("aria-label",
      `PREMIUM SKYLINE · ${selectedStrike.toLocaleString("en-IN")} · CALL AND PUT`);
    const context = canvas.getContext("2d");
    if (!context) return false;
    context.setTransform?.(1, 0, 0, 1, 0, 0);
    context.clearRect?.(0, 0, canvas.width, canvas.height);
    context.scale?.(ratio, ratio);
    context.beginPath();
    context.rect(0, 0, width, height);
    context.clip();

    const node = document.getElementById(LABELS_ID);
    const computed = root.getComputedStyle?.(node);
    const isLight = node?.dataset?.theme === "light";
    const colors = {
      primary: computed?.getPropertyValue?.("--theme-ink")?.trim() || "#18181b",
      secondary: computed?.getPropertyValue?.("--theme-ink-dim")?.trim() || "#52525b",
      accent: computed?.getPropertyValue?.("--theme-warn")?.trim() || "#bd5505",
      danger: computed?.getPropertyValue?.("--theme-danger")?.trim() || "#dc2626",
      background: computed?.getPropertyValue?.("--theme-bg")?.trim() || "#ffffff",
      panel: computed?.getPropertyValue?.("--theme-panel")?.trim()
        || computed?.getPropertyValue?.("--theme-bg")?.trim() || "#ffffff",
      line: computed?.getPropertyValue?.("--theme-line-2")?.trim()
        || computed?.getPropertyValue?.("--theme-ink-dim")?.trim() || "#52525b",
      contrastInk: computed?.getPropertyValue?.("--theme-contrast-ink")?.trim() || "#18181b",
      strikeInk: computed?.getPropertyValue?.("--ladder-selected-ink")?.trim() || "#ffffff"
    };
    colors.neutralFill = isLight ? colors.primary : colors.panel;
    colors.neutralInk = isLight ? colors.background : colors.primary;
    colors.callFill = computed?.getPropertyValue?.("--theme-accent")?.trim() || colors.primary;
    colors.putFill = colors.danger;
    colors.callInk = isLight ? computed?.getPropertyValue?.("--theme-status-ink")?.trim() || colors.background
      : colors.contrastInk;
    colors.putInk = colors.callInk;
    const localToY = (price) => Number(priceToClientY(price)) - Number(plotRect.top);
    const geometry = premiumChartTrialsApi.skylineGeometry(state.view.points, selectedStrike, axis, localToY, 4);
    drawPremiumSkyline(context, premiumChartTrialsApi.skylineSegments(geometry, "call"), colors.primary, false);
    drawPremiumSkyline(context, premiumChartTrialsApi.skylineSegments(geometry, "put"), colors.secondary, true);
    context.fillStyle = colors.secondary;
    context.font = '10px "Geist Mono", ui-monospace, monospace';
    context.textBaseline = "top";
    context.fillText(`PREMIUM SKYLINE · ${selectedStrike.toLocaleString("en-IN")} · ${state.selection.expiry} · CALL ↑ / PUT ↓`, 8, 7);
    drawPremiumSkylineCrosshair(context, state, colors, localToY);
    return true;
  }

  function schedulePremiumSkylinePaint() {
    if (premiumSkylinePaintFrame !== null) return;
    const requestAnimationFrame = root.requestAnimationFrame || ((callback) => root.setTimeout(callback, 16));
    premiumSkylinePaintFrame = requestAnimationFrame(() => {
      premiumSkylinePaintFrame = null;
      if (premiumSkylineState) paintPremiumSkyline(premiumSkylineState);
    });
  }

  function bindPremiumSkylineCrosshair() {
    if (premiumSkylinePointerListener) return;
    premiumSkylinePointerListener = (event) => {
      const state = premiumSkylineState;
      const rect = state?.timeAxis?.plotRect;
      const x = Number(event?.clientX);
      const y = Number(event?.clientY);
      const inside = rect && [x, y].every(Number.isFinite)
        && x >= Number(rect.left) && x <= Number(rect.right)
        && y >= Number(rect.top) && y <= Number(rect.bottom);
      const next = inside
        ? premiumHistoryPaneApi.synchronizedCrosshair(state?.view?.points, state?.timeAxis, x)
        : null;
      if (premiumChartTrialsApi.sameCrosshair(next, premiumSkylineCrosshair)) return;
      premiumSkylineCrosshair = next;
      schedulePremiumSkylinePaint();
    };
    document.addEventListener("pointermove", premiumSkylinePointerListener, true);
  }

  function renderPremiumChartTrials(state, placement = premiumChartPlacement) {
    premiumSkylineState = state || null;
    premiumChartPlacement = placement || premiumChartPlacement;
    const statePlotRect = state?.timeAxis?.plotRect;
    const placementPlotRect = premiumChartPlacement?.plotRect;
    if (!statePlotRect) {
      premiumSkylineCrosshair = null;
      document.getElementById(PREMIUM_CHART_TRIALS_ID)?.remove();
      return false;
    }
    if (!samePlotRect(statePlotRect, placementPlotRect)) {
      premiumChartPlacement = null;
      premiumSkylineCrosshair = null;
      document.getElementById(PREMIUM_CHART_TRIALS_ID)?.remove();
      return false;
    }
    const painted = reconcilePremiumCanvas(document, () => paintPremiumSkyline(state, premiumChartPlacement));
    if (!painted) premiumSkylineCrosshair = null;
    if (painted) bindPremiumSkylineCrosshair();
    return painted;
  }

  function clearPremiumHistoryStatus() {
    document.getElementById(PREMIUM_HISTORY_STATUS_ID)?.remove();
  }

  function renderPremiumHistoryStatus(state, skylinePainted = false) {
    const view = premiumHistoryStatusView(state, skylinePainted);
    if (!view) {
      clearPremiumHistoryStatus();
      return false;
    }
    const selection = state?.selection;
    const chartRect = premiumChartPlacement?.plotRect || chartCanvas()?.getBoundingClientRect?.();
    let node = document.getElementById(PREMIUM_HISTORY_STATUS_ID);
    if (!node) {
      node = document.createElement("section");
      node.id = PREMIUM_HISTORY_STATUS_ID;
      rootNode().append(node);
    }
    node.dataset.status = view.kind;
    node.setAttribute("role", view.canRetry ? "alert" : "status");
    node.setAttribute("aria-live", view.canRetry ? "assertive" : "polite");
    node.setAttribute("aria-label", view.title || "PREMIUM HISTORY");
    if (Number.isFinite(Number(chartRect?.left))) node.style.left = `${Number(chartRect.left) + 12}px`;
    if (Number.isFinite(Number(chartRect?.top))) node.style.top = `${Number(chartRect.top) + 12}px`;
    if (Number.isFinite(Number(chartRect?.right)) && Number.isFinite(Number(chartRect?.left))) {
      const maxWidth = premiumHistoryStatusMaxWidth(Number(chartRect.right) - Number(chartRect.left));
      if (maxWidth !== null) node.style.maxWidth = `${maxWidth}px`;
    }

    const title = document.createElement("strong");
    title.className = "options-premium-history-status__title";
    title.textContent = view.title;
    const detail = document.createElement("span");
    detail.className = "options-premium-history-status__detail";
    detail.textContent = view.detail || "";
    const actions = document.createElement("span");
    actions.className = "options-premium-history-status__actions";
    if (view.canRetry && selection) {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.setAttribute("data-action", "retry");
      retry.textContent = "RETRY";
      retry.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void openPremiumHistory(selection.strike, selection.interval);
      });
      actions.append(retry);
    }
    const close = document.createElement("button");
    close.type = "button";
    close.setAttribute("data-action", "close");
    close.textContent = "CLOSE";
    close.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closePremiumHistory();
    });
    actions.append(close);
    node.replaceChildren(title, detail, actions);
    return true;
  }

  function clearPremiumStrikeMap() {
    document.getElementById(PREMIUM_STRIKE_MAP_ID)?.remove();
    document.getElementById(LABELS_ID)?.querySelectorAll?.(".nifty-axis-ladder__row")
      .forEach((row) => row.classList.remove("is-history-selected"));
  }

  function renderPremiumStrikeMap(state = premiumHistoryPane?.state?.()) {
    const selectedStrike = Number(state?.selection?.strike);
    const node = document.getElementById(LABELS_ID);
    const rows = node?.querySelectorAll?.(".nifty-axis-ladder__row") || [];
    rows.forEach((row) => row.classList.toggle("is-history-selected",
      Number.isFinite(selectedStrike) && Number(row.dataset.strike) === selectedStrike));
    document.getElementById(PREMIUM_STRIKE_MAP_ID)?.remove();
    if (!Number.isFinite(selectedStrike) || state?.status === "closed") return false;

    const selectedRow = node?.querySelector?.(`.nifty-axis-ladder__row[data-strike="${selectedStrike}"]`);
    if (!selectedRow || selectedRow.hidden || typeof selectedRow.getBoundingClientRect !== "function") return false;
    const rowRect = selectedRow.getBoundingClientRect();
    const plotRect = state?.timeAxis?.plotRect || chartCanvas()?.getBoundingClientRect?.();
    const left = Number(plotRect?.left);
    const right = Math.min(Number(plotRect?.right), Number(rowRect?.left));
    const top = Number(rowRect?.top);
    const bottom = Number(rowRect?.bottom);
    const y = (top + bottom) / 2;
    if (![left, right, y].every(Number.isFinite) || right <= left
      || y < Number(plotRect?.top) || y > Number(plotRect?.bottom)) return false;

    const canvas = document.createElement("canvas");
    if (typeof canvas.getContext !== "function") return false;
    const width = Math.max(1, Math.round(right - left));
    const height = 12;
    const ratio = Math.max(1, Number(root.devicePixelRatio) || 1);
    canvas.id = PREMIUM_STRIKE_MAP_ID;
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.left = `${left}px`;
    canvas.style.top = `${y - height / 2}px`;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.style.pointerEvents = "none";
    canvas.width = Math.ceil(width * ratio);
    canvas.height = Math.ceil(height * ratio);
    const context = canvas.getContext("2d");
    if (!context) return false;
    context.scale?.(ratio, ratio);
    const computed = root.getComputedStyle?.(node);
    const lineColor = computed?.getPropertyValue?.("--strike-touch-line")?.trim() || "#71717a";
    context.strokeStyle = lineColor;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, height / 2);
    context.lineTo(width, height / 2);
    context.stroke();
    node.append(canvas);
    return true;
  }

  function collapseExpandedManualRailDisclosure() {
    const active = expandedManualRailDisclosure;
    expandedManualRailDisclosure = null;
    active?.collapse?.();
  }

  function removeOpenedPositionGroupDom() {
    const strategyRoot = document.getElementById("nifty-strategy-rails");
    strategyRoot?.querySelectorAll?.(".nifty-position-spine__cluster-flyout")
      .forEach((flyout) => flyout.remove());
    strategyRoot?.querySelectorAll?.(".nifty-position-spine__cluster-select")
      .forEach((selector) => selector.setAttribute("aria-expanded", "false"));
  }

  function collapseOpenedPositionGroup() {
    if (!openedEdgeGroupKey) return false;
    openedEdgeGroupKey = null;
    removeOpenedPositionGroupDom();
    void controller?.place();
    return true;
  }

  function collapseOpenedStrategyDetails() {
    if (!openedStrategyId && !openedEdgeGroupKey) return false;
    openedStrategyId = null;
    visibleStrategyRailId = null;
    openedEdgeGroupKey = null;
    removeOpenedPositionGroupDom();
    void controller?.place();
    return true;
  }

  function closeBrokerPositionDetails(strategyId, strategyRoot) {
    if (!strategyId || openedStrategyId !== strategyId) return false;
    openedStrategyId = null;
    if (visibleStrategyRailId === strategyId) visibleStrategyRailId = null;
    strategyRoot?.querySelectorAll?.(".nifty-position-spine__card").forEach((card) => {
      if (card.dataset.strategyId === strategyId) card.remove();
    });
    strategyRoot?.querySelectorAll?.(".nifty-position-spine__be-rail").forEach((rail) => {
      if (rail.dataset.strategyId === strategyId) rail.remove();
    });
    strategyRoot?.querySelectorAll?.(".nifty-position-spine__marker").forEach((marker) => {
      if (marker.dataset.strategyId !== strategyId) return;
      marker.classList.remove("is-open");
      marker.setAttribute("aria-expanded", "false");
    });
    return true;
  }

  function normalizeManualPlans(value) {
    return manualPlanApi.normalizeStore(value);
  }

  function normalizeStrategyBook(value) {
    return strategyStoreApi?.normalizeBook?.(value) || DEFAULTS.strategyBook;
  }

  async function migrateLegacyStrategies() {
    if (!strategyStoreApi) return;
    const identity = currentStrategyIdentity();
    if (!identity) return;
    try {
      const response = await chrome.runtime.sendMessage({
        type: "MIGRATE_MANUAL_PLANS",
        instrumentKey: identity.instrumentKey,
        underlying: identity.underlying,
        at: new Date().toISOString()
      });
      if (!response?.ok || !response.strategyBook) return;
      settings.strategyBook = normalizeStrategyBook(response.strategyBook);
      if (settings.enabled) void controller?.place();
    } catch (_) {}
  }

  function strategyBusinessDate() {
    const identity = currentStrategyIdentity();
    const timeZone = identity?.instrumentKey?.startsWith("NSE") ? "Asia/Kolkata" : "UTC";
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date()).reduce((result, item) => ({ ...result, [item.type]: item.value }), {});
    return { date: `${parts.year}-${parts.month}-${parts.day}`, timeZone };
  }

  async function expireDueStrategies() {
    if (!strategyStoreApi) return;
    const business = strategyBusinessDate();
    try {
      await persistStrategyCommand({
        id: `expire:${business.timeZone}:${business.date}`,
        type: "EXPIRE_DUE",
        asOfDate: business.date
      });
    } catch (_) {}
  }

  async function synchronizeStrategyLifecycle() {
    await migrateLegacyStrategies();
    await expireDueStrategies();
  }

  function manualEntriesForExpiry() {
    const entries = manualPlanApi.entriesFor(settings.manualPlans, settings.expiry);
    const knownLegIds = new Set(Object.keys(settings.strategyBook?.legs || {}));
    if (!knownLegIds.size || !strategyStoreApi) return entries;
    const activeLegIds = new Set(activeChartStrategies()
      .flatMap((strategy) => strategyStoreApi.legsForStrategy(settings.strategyBook, strategy.id))
      .map((leg) => leg.id));
    return entries.filter((entry) => !knownLegIds.has(entry.id) || activeLegIds.has(entry.id));
  }

  function exactHistoryExpiry() {
    return [controller?.membership()?.expiry, controller?.chain()?.expiry, settings.expiry]
      .find((value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) || null;
  }

  function currentPremiumTimeAxis() {
    return normalizePremiumTimeAxis(document.documentElement.getAttribute("data-options-time-axis") || "");
  }

  function premiumHistorySelection(strike, interval = null) {
    const identity = currentStrategyIdentity();
    const expiry = exactHistoryExpiry();
    const range = premiumHistoryRange(expiry);
    const timeframe = interval || controller?.membership()?.timeframe
      || timeframeApi.timeframeKey(chartCanvas()?.getAttribute("aria-label") || "");
    if (!identity || !expiry || !range || !Number.isFinite(Number(strike)) || !timeframe) return null;
    return {
      instrumentKey: identity.instrumentKey,
      underlying: identity.underlying,
      expiry,
      strike: Number(strike),
      interval: timeframe,
      ...range
    };
  }

  function premiumHistoryError(result) {
    if (result?.kind === "auth") return "STALE · AUTH REQUIRED";
    if (result?.kind === "contract_unavailable") return "CONTRACT HISTORY UNAVAILABLE";
    if (result?.kind === "invalid_request") return result?.error || "CONTRACT HISTORY REQUEST INVALID";
    return result?.error || "STALE · REFRESH FAILED";
  }

  async function loadPremiumHistory(selection, signal) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const result = await chrome.runtime.sendMessage({
      type: "FETCH_OPTION_HISTORY",
      expiry: selection.expiry,
      strike: selection.strike,
      interval: selection.interval,
      from: selection.from,
      to: selection.to
    });
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (!result?.ok || !result.history) {
      throw Object.assign(new Error(premiumHistoryError(result)), { kind: result?.kind || "upstream" });
    }
    const expiryAt = selection.instrumentKey.startsWith("NSE")
      ? `${selection.expiry}T15:30:00+05:30`
      : `${selection.expiry}T23:59:59.000Z`;
    return premiumHistoryModelApi.buildViewModel(result.history, {
      expiryAt,
      trades: manualPlanApi.entriesFor(settings.manualPlans, selection.expiry),
      ivAssumptions: selection.instrumentKey.startsWith("NSE") ? {
        model: "BLACK_SCHOLES",
        rate: 0.06,
        carry: 0,
        version: "nse-trial-2026-08",
        calculatedAt: new Date().toISOString()
      } : null
    });
  }

  function ensurePremiumHistoryPane() {
    if (premiumHistoryPane || !premiumHistoryPaneApi?.createPremiumHistoryPane
      || !premiumHistoryModelApi?.buildViewModel) return premiumHistoryPane;
    premiumHistoryPane = premiumHistoryPaneApi.createPremiumHistoryPane({
      loadHistory: loadPremiumHistory,
      render: (state) => {
        renderPremiumStrikeMap(state);
        const skylinePainted = renderPremiumChartTrials(state);
        renderPremiumHistoryStatus(state, skylinePainted);
        const statusMessage = premiumHistoryStatusMessage(state);
        if (statusMessage) showStatus(statusMessage);
      }
    });
    return premiumHistoryPane;
  }

  function closePremiumHistory() {
    premiumHistoryPane?.close?.();
    clearPremiumStrikeMap();
    clearPremiumChartTrials();
    clearPremiumHistoryStatus();
    setPremiumTimeSync(document, false);
  }

  function invalidatePremiumHistoryPlacement() {
    premiumChartPlacement = null;
  }

  async function openPremiumHistory(strike, interval = null) {
    const pane = ensurePremiumHistoryPane();
    const selection = premiumHistorySelection(strike, interval);
    if (!pane || !selection) {
      showStatus("CONTRACT HISTORY UNAVAILABLE");
      return false;
    }
    setPremiumTimeSync(document, true);
    pane.setTimeAxis?.(currentPremiumTimeAxis());
    return pane.open(selection);
  }

  function syncPremiumHistoryTimeframe(label) {
    const pane = premiumHistoryPane;
    const state = pane?.state?.();
    if (!state?.selection) return false;
    const identity = chartInstrumentIdentity(label);
    if (!identity || identity.instrumentKey !== state.selection.instrumentKey) {
      closePremiumHistory();
      invalidatePremiumHistoryPlacement();
      return false;
    }
    const interval = timeframeApi.timeframeKey(label);
    if (!interval || interval === state.selection.interval) return false;
    void openPremiumHistory(state.selection.strike, interval);
    return true;
  }

  function manualEntriesByStrike() {
    return manualPlanApi.groupByStrike(activeLadderEntries());
  }

  function activeLadderEntries() {
    const entries = manualEntriesForExpiry().map((entry) => ({ ...entry, source: "MANUAL" }));
    if (!strategyStoreApi) return entries;
    const brokerEntries = activeChartStrategies().flatMap((strategy) =>
      strategyStoreApi.legsForStrategy(settings.strategyBook, strategy.id)
        .filter((entry) => entry.source === "BROKER_POSITION"));
    return [...new Map([...entries, ...brokerEntries].map((entry) => [entry.id, entry])).values()];
  }

  function activeFaceEntry(strike = breakEvenSelection.current()?.strike) {
    const numericStrike = Number(strike);
    const entryId = Number.isFinite(numericStrike)
      ? ensureManualInteraction()?.activeEntryId(numericStrike)
      : null;
    if (!entryId) return null;
    return activeLadderEntries().find((entry) => entry.id === entryId
      && Number(entry.strike) === numericStrike) || null;
  }

  function activeStrategyOwnerForEntry(entryId) {
    if (!strategyStoreApi || typeof entryId !== "string" || !entryId) return null;
    return activeChartStrategies().find((strategy) =>
      strategyStoreApi.legsForStrategy(settings.strategyBook, strategy.id)
        .some((entry) => entry.id === entryId)) || null;
  }

  function openBrokerEntryDetails(entryId) {
    const entry = activeLadderEntries().find((candidate) => candidate.id === entryId) || null;
    if (entry?.source !== "BROKER_POSITION") return false;
    const owner = activeStrategyOwnerForEntry(entry.id);
    if (!owner) return false;
    const viewId = brokerLegViewId(owner.id, entry.id);
    const strike = Number(entry.strike);
    const liveRow = controller?.membership()?.rows?.find((row) => Number(row?.strike) === strike) || null;
    const alreadyActive = Number(breakEvenSelection.current()?.strike) === strike
      && activeFaceEntry(strike)?.id === entry.id;
    if (liveRow && !alreadyActive) {
      const context = {
        strike,
        liveRow,
        entries: manualEntriesByStrike().get(strike) || []
      };
      if (!ensureManualInteraction()?.openFace?.(context, entry.id)) return false;
    } else if (!alreadyActive) {
      resetStrategyInteractionState();
    }
    openedEdgeGroupKey = null;
    if (openedStrategyId !== viewId) ensureStrategyChartController()?.label(viewId);
    return true;
  }

  function activeTradeStrikes() {
    return [...new Set(activeLadderEntries().map((entry) => Number(entry.strike))
      .filter(Number.isFinite))];
  }

  function offGridTradeGroups(membership, entriesByStrike = manualEntriesByStrike()) {
    const offGrid = new Set(membership?.offGridStrikes || []);
    return [...offGrid].sort((left, right) => left - right).flatMap((strike) => {
      const entries = (entriesByStrike.get(strike) || [])
        .filter((entry) => entry?.source !== "BROKER_POSITION");
      return ["BUY", "SELL"].flatMap((direction) => {
        const matching = entries.filter((entry) => entry.direction === direction);
        if (!matching.length) return [];
        const callLots = matching.filter((entry) => entry.optionType === "CALL")
          .reduce((sum, entry) => sum + Number(entry.lots || 0), 0);
        const putLots = matching.filter((entry) => entry.optionType === "PUT")
          .reduce((sum, entry) => sum + Number(entry.lots || 0), 0);
        const exposure = [callLots ? `C${callLots}` : "", putLots ? `P${putLots}` : ""]
          .filter(Boolean).join(" ");
        return [{
          strike,
          direction,
          token: exposure,
          label: `${exposure} · ${strike.toLocaleString("en-IN")}`
        }];
      });
    });
  }

  function closeManualEditor() {
    const current = manualEditor;
    current?.rowElement?.classList?.remove("has-manual-editor");
    current?.rowElement?.setAttribute?.("aria-hidden", "false");
    current?.rowElement?.setAttribute?.("tabindex", "0");
    current?.element?.remove?.();
    strategyOwnershipChooser = null;
    manualEditor = null;
  }

  function closeManualEditorForOtherRow(strike) {
    if (manualEditor && manualEditor.strike !== Number(strike)) closeManualEditor();
  }

  function manualLifecycleOriginIsCurrent(origin) {
    return Boolean(origin) && manualLifecycleGeneration === origin.lifecycleGeneration;
  }

  function manualEditorOriginIsCurrent(origin) {
    return manualLifecycleOriginIsCurrent(origin) && manualEditor?.token === origin.token;
  }

  function beginVisualPlacement() {
    railVisualRevision += 1;
    return railVisualRevision;
  }

  function invalidateVisualPlacements() {
    railVisualRevision += 1;
  }

  function visualPlacementIsCurrent(revision) {
    return revision === undefined || revision === railVisualRevision;
  }

  function focusManualRow(strike) {
    rootNode().querySelector(`.nifty-axis-ladder__row[data-strike="${strike}"]`)?.focus?.();
  }

  function positionManualEditor() {
    if (!manualEditor?.element || !manualEditor?.rowElement) return;
    const row = manualEditor.rowElement;
    const bounds = row.getBoundingClientRect?.();
    const top = row.style?.top || (Number.isFinite(bounds?.top) && Number.isFinite(bounds?.bottom)
      ? `${(bounds.top + bounds.bottom) / 2}px`
      : null);
    const right = row.style?.right || (Number.isFinite(bounds?.right)
      ? `${Math.max(0, window.innerWidth - bounds.right)}px`
      : null);
    const rowZIndex = Number.parseInt(row.style?.zIndex, 10);
    if (top) manualEditor.element.style.top = top;
    if (right) manualEditor.element.style.right = right;
    if (Number.isFinite(rowZIndex)) manualEditor.element.style.zIndex = String(rowZIndex + 1);
  }

  function ensureManualInteraction() {
    if (manualInteraction || !manualInteractionApi?.createController) return manualInteraction;
    manualInteraction = manualInteractionApi.createController({
      delay: 240,
      setTimer: (callback, delay) => setTimeout(callback, delay),
      clearTimer: (timer) => clearTimeout(timer),
      onQuick: ({ strike, liveRow }) => {
        closeManualEditorForOtherRow(strike);
        resetStrategyInteractionState();
        handleQuickSelection(liveRow);
      },
      onFace: ({ strike, liveRow }) => {
        closeManualEditorForOtherRow(strike);
        resetStrategyInteractionState();
        if (breakEvenSelection.current()?.strike !== strike && liveRow) {
          clearBreakEvenRails();
          breakEvenSelection.select(liveRow);
        }
        renderManualRows([strike]);
        void controller?.place();
      },
      onEditor: (context) => {
        closeManualEditorForOtherRow(context?.strike);
        const brokerEntry = activeLadderEntries().find((entry) => entry.id === context?.entryId
          && entry.source === "BROKER_POSITION");
        resetStrategyInteractionState();
        clearBreakEvenSelection({ repaintStrategyRails: true });
        openManualEditor(brokerEntry ? { ...context, entryId: null } : context);
      },
      onReset: () => {
        resetStrategyInteractionState();
        renderManualRows();
      }
    });
    return manualInteraction;
  }

  function clearManualTransientState({ restorePlanRails = false, invalidatePlacements = true } = {}) {
    const hadEditor = Boolean(manualEditor);
    manualLifecycleGeneration += 1;
    if (invalidatePlacements) invalidateVisualPlacements();
    closeManualEditor();
    ensureManualInteraction()?.reset();
    if (restorePlanRails && hadEditor) restoreSavedManualPlanRails();
  }

  function rootNode() {
    let node = document.getElementById(LABELS_ID);
    if (node) {
      node.dataset.theme = settings.uiTheme === "light" ? "light" : "dark";
      return node;
    }
    node = document.createElement("div");
    node.id = LABELS_ID;
    node.dataset.theme = settings.uiTheme === "light" ? "light" : "dark";
    node.hidden = true;
    document.documentElement.append(node);
    if (controller) {
      node.addEventListener("click", handleLadderClick);
      node.addEventListener("dblclick", handleLadderDoubleClick);
    }
    return node;
  }

  function showStatus(status) {
    const node = rootNode();
    if (status === "OPTION PRICE UNAVAILABLE") breakEvenStatusOverride = status;
    else if (status === "PLAN PAYOFF FLAT") manualPayoffStatusOverride = status;
    else normalStatus = status;
    const visibleStatus = breakEvenStatusOverride || manualPayoffStatusOverride || status;
    node.dataset.status = visibleStatus;
    const invalidManualCount = manualPlanApi?.invalidCount?.(settings.manualPlans) || 0;
    node.dataset.manualInvalidCount = String(invalidManualCount);
    let statusNode = node.querySelector(".nifty-axis-ladder__status");
    if (!statusNode) {
      statusNode = document.createElement("div");
      statusNode.className = "nifty-axis-ladder__status";
      node.append(statusNode);
    }
    statusNode.textContent = invalidManualCount > 0
      ? `${visibleStatus} · MANUAL ENTRY NEEDS REVIEW · ${invalidManualCount}`
      : visibleStatus;
  }

  function clearBreakEvenStatusOverride() {
    if (!breakEvenStatusOverride) return;
    breakEvenStatusOverride = null;
    showStatus(normalStatus);
  }

  function clearManualPayoffStatusOverride() {
    if (!manualPayoffStatusOverride) return;
    manualPayoffStatusOverride = null;
    showStatus(normalStatus);
  }

  function hideRows(status) {
    manualRowsConcealed = true;
    clearManualTransientState();
    clearBreakEvenRails();
    clearManualPlanRails();
    clearStrategyRails();
    const node = rootNode();
    node.querySelectorAll(".nifty-axis-ladder__row").forEach((row) => row.remove());
    node.hidden = !settings.enabled;
    clearRisk();
    showStatus(status);
  }

  function concealRows(status) {
    manualRowsConcealed = true;
    clearManualTransientState();
    clearBreakEvenRails();
    clearManualPlanRails();
    clearStrategyRails();
    const node = rootNode();
    node.querySelectorAll(".nifty-axis-ladder__row").forEach((row) => { row.hidden = true; });
    node.hidden = !settings.enabled;
    clearRisk();
    showStatus(status);
  }

  function renderManualRow(element, row, membership, entriesByStrike) {
    const isSelected = breakEvenSelection.current()?.strike === row.strike;
    const isHistorySelected = Number(premiumHistoryPane?.state?.()?.selection?.strike) === row.strike;
    const entries = entriesByStrike.get(row.strike) || [];
    if (manualUiApi?.renderRow) {
      manualUiApi.renderRow(document, element, {
        liveRow: row,
        isAtm: row.strike === membership.atm,
        entries,
        activeEntryId: ensureManualInteraction()?.activeEntryId(row.strike) || null
      });
    } else {
      element.classList.toggle("is-atm", row.strike === membership.atm);
      element.textContent = formatRow(row);
    }
    element.classList.toggle("is-selected", isSelected);
    element.classList.toggle("is-history-selected", isHistorySelected);
    element.setAttribute("aria-pressed", String(isSelected));
    element.hidden = false;
  }

  function renderRows(rows, membership) {
    closeManualEditor();
    const node = rootNode();
    const existing = new Map([...node.querySelectorAll(".nifty-axis-ladder__row")]
      .map((row) => [Number(row.dataset.strike), row]));
    const entriesByStrike = manualEntriesByStrike();
    node.querySelectorAll(".nifty-axis-ladder__off-grid").forEach((element) => element.remove());
    rows.forEach((row) => {
      let element = existing.get(row.strike);
      if (!element) {
        element = document.createElement("div");
        element.className = "nifty-axis-ladder__row";
        element.dataset.strike = String(row.strike);
        element.setAttribute("role", "button");
        element.setAttribute("tabindex", "0");
        element.setAttribute("aria-pressed", "false");
        node.append(element);
      }
      renderManualRow(element, row, membership, entriesByStrike);
      element.hidden = true;
      existing.delete(row.strike);
    });
    const offGridGroups = offGridTradeGroups(membership, entriesByStrike);
    if (offGridGroups.length) {
      offGridGroups.forEach((group) => {
        const chip = document.createElement("div");
        chip.className = `nifty-axis-ladder__off-grid is-${group.direction.toLowerCase()}`;
        chip.dataset.strike = String(group.strike);
        chip.dataset.direction = group.direction;
        chip.textContent = group.token;
        chip.setAttribute("aria-label", `${group.label} ${group.direction}`);
        chip.setAttribute("title", `${group.label} ${group.direction}`);
        chip.hidden = true;
        node.append(chip);
      });
    }
    existing.forEach((row) => row.remove());
    manualRowsConcealed = false;
    node.hidden = false;
  }

  function renderManualRows(strikes) {
    const membership = controller?.membership();
    if (!membership) return;
    const requested = Array.isArray(strikes) ? new Set(strikes.map(Number)) : null;
    const entriesByStrike = manualEntriesByStrike();
    const node = rootNode();
    membership.rows.filter((row) => !requested || requested.has(row.strike)).forEach((row) => {
      const element = node.querySelector(`.nifty-axis-ladder__row[data-strike="${row.strike}"]`);
      if (element) renderManualRow(element, row, membership, entriesByStrike);
    });
  }

  function clearBreakEvenRails(visualPlacementRevision) {
    if (!visualPlacementIsCurrent(visualPlacementRevision)) return false;
    document.getElementById("nifty-break-even-rails")?.remove();
    return true;
  }

  function removeManualPlanRails(visualPlacementRevision) {
    if (!visualPlacementIsCurrent(visualPlacementRevision)) return false;
    expandedManualRailDisclosure = null;
    document.getElementById("nifty-manual-plan-rails")?.remove();
    return true;
  }

  function clearManualPlanRails(visualPlacementRevision) {
    if (!removeManualPlanRails(visualPlacementRevision)) return false;
    clearManualPayoffStatusOverride();
    return true;
  }

  function restoreSavedManualPlanRails() {
    const visualPlacementRevision = beginVisualPlacement();
    clearManualPlanRails(visualPlacementRevision);
    Promise.resolve(controller?.place?.(visualPlacementRevision)).then((placed) => {
      if (!placed) clearManualPlanRails(visualPlacementRevision);
    }).catch(() => clearManualPlanRails(visualPlacementRevision));
  }

  function breakEvenRoot() {
    let rails = document.getElementById("nifty-break-even-rails");
    if (!rails) {
      rails = document.createElement("div");
      rails.id = "nifty-break-even-rails";
      rootNode().append(rails);
    }
    return rails;
  }

  function manualPlanRailsRoot() {
    let rails = document.getElementById("nifty-manual-plan-rails");
    if (!rails) {
      rails = document.createElement("div");
      rails.id = "nifty-manual-plan-rails";
      rootNode().append(rails);
    }
    return rails;
  }

  function strategyRailsRoot() {
    let rails = document.getElementById("nifty-strategy-rails");
    if (!rails) {
      rails = document.createElement("div");
      rails.id = "nifty-strategy-rails";
      rootNode().append(rails);
    }
    return rails;
  }

  function installStrategyChartController() {
    if (!strategyChartApi?.createController) return null;
    strategyChartController = strategyChartApi.createController({
      onOpen(strategyId) {
        openedStrategyId = openedStrategyId === strategyId ? null : strategyId;
        visibleStrategyRailId = null;
        void controller?.place();
      },
      onSelection() {
        void controller?.place();
      },
      onCompare() {
        void controller?.place();
      }
    });
    return strategyChartController;
  }

  function ensureStrategyChartController() {
    return strategyChartController || installStrategyChartController();
  }

  function clearStrategyRails() {
    document.getElementById("nifty-strategy-rails")?.remove();
  }

  function resetStrategyInteractionState() {
    openedStrategyId = null;
    visibleStrategyRailId = null;
    openedEdgeGroupKey = null;
    strategyOwnershipChooser?.remove?.();
    strategyOwnershipChooser = null;
    installStrategyChartController();
  }

  function discardStoredInteractionIdentities() {
    manualInteraction?.dispose?.();
    manualInteraction = null;
    resetStrategyInteractionState();
  }

  function clearStrategyPreview() {
    resetStrategyInteractionState();
    clearStrategyRails();
  }

  function currentStrategyIdentity() {
    return chartInstrumentIdentity(chartCanvas()?.getAttribute("aria-label") || "");
  }

  function brokerConnectionAllowsChart() {
    const connection = settings.brokerConnection;
    if (!connection || typeof connection !== "object") return true;
    return connection.connected === true;
  }

  function activeChartStrategies() {
    const identity = currentStrategyIdentity();
    if (!identity || !strategyStoreApi) return [];
    const liveEntryIds = liveManualEntryIds();
    const exact = strategyStoreApi.activeStrategies(settings.strategyBook, identity.instrumentKey, settings.expiry);
    const broker = brokerConnectionAllowsChart()
      ? strategyStoreApi.activeStrategies(settings.strategyBook, undefined, settings.expiry)
        .filter((strategy) => strategy.underlying === identity.underlying
          && strategyStoreApi.legsForStrategy(settings.strategyBook, strategy.id)
            .some((leg) => leg.source === "BROKER_POSITION"))
      : [];
    const strategies = [...new Map([...exact, ...broker].map((strategy) => [strategy.id, strategy])).values()];
    return strategies.filter((strategy) => strategyStoreApi.legsForStrategy(settings.strategyBook, strategy.id)
      .some((leg) => isLiveChartEntry(leg, liveEntryIds)));
  }

  function liveManualEntryIds() {
    return new Set(manualPlanApi.entriesFor(settings.manualPlans, settings.expiry)
      .map((entry) => entry.id));
  }

  function isLiveChartEntry(entry, liveEntryIds) {
    return liveEntryIds.has(entry.id) || entry.source === "BROKER_POSITION";
  }

  function knownStrategyCharges(entries) {
    return entries.reduce((total, entry) => total + (entry.charges || []).reduce(
      (sum, charge) => sum + (Number.isFinite(Number(charge?.amount)) ? Number(charge.amount) : 0), 0
    ), 0);
  }

  function strategyPnlItems(entries) {
    const rows = controller?.membership()?.rows || [];
    return entries.map((entry) => {
      const row = rows.find((candidate) => Number(candidate.strike) === Number(entry.strike));
      const importedBrokerPnl = Number(entry?.brokerPnl);
      const pnl = entry?.source === "BROKER_POSITION" && Number.isFinite(importedBrokerPnl)
        ? importedBrokerPnl
        : manualPayoffApi?.positionPnl?.(entry, row);
      const side = entry.optionType === "CALL" ? "C" : "P";
      return {
        entry,
        side,
        direction: entry.direction,
        text: `${side} ${Number(entry.strike).toLocaleString("en-IN")} ${entry.direction} ×${entry.lots}`,
        pnl: signedApproxRupees(pnl),
        tone: pnl > 0 ? "profit" : pnl < 0 ? "loss" : "flat"
      };
    });
  }

  function brokerLegViewId(strategyId, entryId) {
    return `${strategyId}::leg::${entryId}`;
  }

  function brokerEntriesInDisplayOrder(entries) {
    return [...entries].sort((a, b) => Number(a.strike) - Number(b.strike)
      || String(a.optionType).localeCompare(String(b.optionType))
      || String(a.id).localeCompare(String(b.id)));
  }

  function strategyLevelModels({ strategyId, strategyLabel, entries, viewKind = "STANDARD" }) {
    const chargeOffset = knownStrategyCharges(entries);
    const result = manualPayoffApi?.levels?.(entries, `${strategyLabel} BE`, chargeOffset);
    if (result?.status !== "ok") return [];
    const chargesComplete = entries.every((entry) => entry.chargesComplete === true);
    const callCount = entries.filter((entry) => entry.optionType === "CALL").length;
    const putCount = entries.length - callCount;
    return result.levels.map((level) => ({
      kind: "STRATEGY",
      viewKind,
      strategyId,
      strategyLabel,
      exact: level.exact,
      label: level.label,
      selected: ensureStrategyChartController()?.isSelected(strategyId) || false,
      entries,
      detailHeight: viewKind === "BROKER_COMBINED"
        ? 72 + Math.max(callCount, putCount, 1) * 27 + (chargesComplete ? 0 : 27)
        : null,
      disclosure: chargesComplete ? null : "EXCLUDING UNKNOWN CHARGES"
    }));
  }

  function originalStrategyModels() {
    const liveEntryIds = liveManualEntryIds();
    return activeChartStrategies().flatMap((strategy) => {
      const entries = strategyStoreApi.legsForStrategy(settings.strategyBook, strategy.id)
        .filter((entry) => isLiveChartEntry(entry, liveEntryIds));
      const brokerEntries = entries.filter((entry) => entry.source === "BROKER_POSITION");
      if (!brokerEntries.length) {
        return strategyLevelModels({ strategyId: strategy.id, strategyLabel: strategy.label, entries });
      }
      const ordered = brokerEntriesInDisplayOrder(brokerEntries);
      const combined = strategyLevelModels({
        strategyId: strategy.id,
        strategyLabel: strategy.label,
        entries: ordered,
        viewKind: "BROKER_COMBINED"
      });
      const individuals = ordered.flatMap((entry, index) => strategyLevelModels({
        strategyId: brokerLegViewId(strategy.id, entry.id),
        strategyLabel: `B${index + 1}`,
        entries: [entry],
        viewKind: "BROKER_LEG"
      }));
      return [...combined, ...individuals];
    });
  }

  function combinedStrategyModels(originals = []) {
    const selectedIds = ensureStrategyChartController()?.selected() || [];
    if (selectedIds.length < 2 || !strategyPreviewApi) return { models: [], preview: null };
    const previewOptions = {
      quoteUpdatedAt: controller?.chain()?.updatedAt,
      now: new Date().toISOString(),
      maxQuoteAgeMs: SELLER_SAFETY_STALE_MS
    };
    const hasVirtualSelection = selectedIds.some((id) => id.includes("::leg::"));
    const modelById = new Map(originals.map((model) => [model.strategyId, model]));
    const preview = hasVirtualSelection && strategyPreviewApi.buildPreviewFromGroups
      ? {
        ...strategyPreviewApi.buildPreviewFromGroups(selectedIds.map((id) => {
          const model = modelById.get(id);
          return model ? {
            id,
            instrumentKey: model.entries[0]?.instrumentKey,
            expiry: model.entries[0]?.expiry,
            entries: model.entries
          } : null;
        }), controller?.membership()?.rows || [], previewOptions),
        virtualSelection: true
      }
      : strategyPreviewApi.buildPreview(
        settings.strategyBook,
        selectedIds,
        controller?.membership()?.rows || [],
        previewOptions
      );
    if (preview.status !== "OK") return { models: [], preview };
    return {
      preview,
      models: strategyPreviewApi.displayLevels(preview, "COMBINED BE").map((level) => ({
        kind: "COMBINED",
        exact: level.exact,
        label: level.label,
        entries: preview.entries,
        disclosure: preview.disclosure
      }))
    };
  }

  function renderStrategyPreviewBar(rootNodeValue, preview, selectedCount) {
    if (selectedCount < 2) return;
    const bar = document.createElement("div");
    bar.className = "nifty-strategy-preview";
    const summary = document.createElement("span");
    summary.className = "nifty-strategy-preview__summary";
    summary.setAttribute("aria-live", "polite");
    summary.textContent = preview?.status === "OK"
      ? `${selectedCount} SELECTED · ${preview.disclosure || "CHARGES INCLUDED"}`
      : `${selectedCount} SELECTED · ${preview?.status || "INCOMPLETE"}`;
    const compare = document.createElement("button");
    compare.type = "button";
    compare.className = "nifty-strategy-preview__compare";
    compare.textContent = "Compare";
    compare.setAttribute("aria-pressed", String(ensureStrategyChartController()?.comparing() || false));
    compare.addEventListener("click", (event) => {
      event.stopPropagation?.();
      strategyChartController.compare(!strategyChartController.comparing());
    });
    const save = document.createElement("button");
    save.type = "button";
    save.className = "nifty-strategy-preview__save";
    save.textContent = "Save";
    save.disabled = preview?.status !== "OK" || preview?.virtualSelection === true || !strategyPanelApi;
    save.addEventListener("click", (event) => {
      event.stopPropagation?.();
      bar.querySelector(".nifty-strategy-preview__save-chooser")?.remove();
      const selectedIds = ensureStrategyChartController()?.selected() || [];
      const choices = strategyPanelApi?.saveChoices?.(settings.strategyBook, selectedIds) || [];
      if (!choices.length) return;
      const chooser = document.createElement("div");
      chooser.className = "nifty-strategy-preview__save-chooser";
      chooser.setAttribute("role", "dialog");
      chooser.setAttribute("aria-label", "Save combined strategy");
      const closeChooser = () => {
        chooser.remove();
        save.focus();
      };
      const title = document.createElement("span");
      title.className = "nifty-strategy-preview__save-title";
      title.textContent = "SAVE COMBINED AS";
      chooser.append(title);
      const options = [
        { mode: "CREATE_NEW", label: "CREATE NEW STRATEGY" },
        ...choices.flatMap((choice) => (choice.destinations || []).map((destination) => ({
          mode: "EXISTING",
          strategyId: destination.strategyId,
          label: `MERGE INTO ${destination.label}`
        })))
      ];
      options.forEach((option) => {
        const choice = document.createElement("button");
        choice.type = "button";
        choice.className = "nifty-strategy-preview__save-choice";
        choice.textContent = option.label;
        choice.addEventListener("click", async (choiceEvent) => {
          choiceEvent.stopPropagation?.();
          chooser.querySelectorAll(".nifty-strategy-preview__save-choice")
            .forEach((node) => { node.disabled = true; });
          summary.textContent = "SAVING PERMANENT VERSION…";
          try {
            const strategyId = option.mode === "CREATE_NEW" ? crypto.randomUUID() : option.strategyId;
            const command = strategyPanelApi.commandForSave({
              commandId: crypto.randomUUID(),
              versionId: crypto.randomUUID(),
              selectedIds,
              destination: option.mode === "CREATE_NEW"
                ? {
                  mode: "CREATE_NEW",
                  strategyId,
                  label: `T${Number(settings.strategyBook?.nextSequence) || 1}`
                }
                : { mode: "EXISTING", strategyId }
            });
            await persistStrategyCommand(command);
            clearStrategyPreview();
            await controller?.place();
          } catch (error) {
            summary.textContent = `SAVE FAILED · ${error?.message || "TRY AGAIN"}`;
            chooser.querySelectorAll(".nifty-strategy-preview__save-choice")
              .forEach((node) => { node.disabled = false; });
          }
        });
        chooser.append(choice);
      });
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "nifty-strategy-preview__save-cancel";
      cancel.textContent = "CANCEL";
      cancel.addEventListener("click", (cancelEvent) => {
        cancelEvent.stopPropagation?.();
        closeChooser();
      });
      chooser.append(cancel);
      chooser.addEventListener("keydown", (keyEvent) => {
        if (keyEvent.key !== "Escape") return;
        keyEvent.preventDefault?.();
        keyEvent.stopPropagation?.();
        closeChooser();
      });
      bar.append(chooser);
      chooser.querySelector(".nifty-strategy-preview__save-choice")?.focus();
    });
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "nifty-strategy-preview__clear";
    clear.textContent = "Clear";
    clear.addEventListener("click", (event) => {
      event.stopPropagation?.();
      clearStrategyPreview();
      void controller?.place();
    });
    bar.append(summary, compare, save, clear);
    rootNodeValue.append(bar);
  }

  function appendStrategyDetails(card, model) {
    if (model.kind !== "STRATEGY" || openedStrategyId !== model.strategyId) return;
    if (model.viewKind === "BROKER_COMBINED") {
      appendBrokerMatrix(card, model);
      return;
    }
    const details = document.createElement("span");
    details.className = "nifty-strategy__trades";
    strategyPnlItems(model.entries).forEach((item) => {
      const trade = document.createElement("span");
      trade.className = `nifty-strategy__trade is-${item.tone}`;
      const position = document.createElement("span");
      position.textContent = item.text;
      const pnl = document.createElement("span");
      pnl.textContent = item.pnl;
      trade.append(position, pnl);
      details.append(trade);
    });
    if (model.disclosure) {
      const disclosure = document.createElement("span");
      disclosure.className = "nifty-strategy__disclosure";
      disclosure.textContent = model.disclosure;
      details.append(disclosure);
    }
    card.append(details);
  }

  function appendBrokerMatrix(card, model) {
    const matrix = document.createElement("span");
    matrix.className = "nifty-strategy__matrix";
    const filters = document.createElement("span");
    filters.className = "nifty-strategy__matrix-filters";
    const columns = document.createElement("span");
    columns.className = "nifty-strategy__matrix-columns";
    const rows = strategyPnlItems(model.entries);
    const rowNodes = [];
    const setFilter = (filter) => {
      rowNodes.forEach(({ node, item }) => {
        node.hidden = filter !== "ALL" && item.direction !== filter;
      });
      filters.children.forEach((button) => {
        button.setAttribute("aria-pressed", String(button.dataset.filter === filter));
      });
    };
    ["ALL", "BUY", "SELL"].forEach((filter) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "nifty-strategy__matrix-filter";
      button.dataset.filter = filter;
      button.textContent = filter === "BUY" ? "BUYS" : filter === "SELL" ? "SELLS" : filter;
      button.setAttribute("aria-pressed", String(filter === "ALL"));
      button.addEventListener("click", (event) => {
        event.stopPropagation?.();
        setFilter(filter);
      });
      filters.append(button);
    });
    [["CALLS", "CALL"], ["PUTS", "PUT"]].forEach(([titleText, optionType]) => {
      const column = document.createElement("span");
      column.className = "nifty-strategy__matrix-column";
      const title = document.createElement("span");
      title.className = "nifty-strategy__matrix-title";
      title.textContent = titleText;
      column.append(title);
      rows.filter((item) => item.entry.optionType === optionType).forEach((item) => {
        const row = document.createElement("span");
        row.className = `nifty-strategy__matrix-row is-${item.direction.toLowerCase()}`;
        const position = document.createElement("span");
        position.textContent = `${item.side} ${Number(item.entry.strike).toLocaleString("en-IN")} ${item.direction} ×${item.entry.lots}`;
        const pnl = document.createElement("span");
        pnl.className = `nifty-strategy__matrix-pnl is-${item.tone}`;
        pnl.textContent = item.pnl;
        row.append(position, pnl);
        column.append(row);
        rowNodes.push({ node: row, item });
      });
      columns.append(column);
    });
    matrix.append(filters, columns);
    if (model.disclosure) {
      const disclosure = document.createElement("span");
      disclosure.className = "nifty-strategy__disclosure";
      disclosure.textContent = model.disclosure;
      matrix.append(disclosure);
    }
    card.append(matrix);
  }

  function brokerPositionSpineModels(models = []) {
    return models.filter((model) => model?.viewKind === "BROKER_LEG"
      && model?.kind === "STRATEGY"
      && model.entries?.length === 1
      && Number.isFinite(Number(model.entries[0]?.strike)));
  }

  function strategyColumnSide(model, atm) {
    const sides = [...new Set((Array.isArray(model?.entries) ? model.entries : [])
      .map((entry) => entry?.optionType)
      .filter((optionType) => ["CALL", "PUT"].includes(optionType)))];
    if (sides.length === 1) return sides[0] === "PUT" ? "put" : "call";
    const exact = Number(model?.exact);
    const reference = Number(atm);
    if (Number.isFinite(exact) && Number.isFinite(reference)) return exact < reference ? "put" : "call";
    return sides[0] === "PUT" ? "put" : "call";
  }

  function strategyRailText(model) {
    const side = model?.side === "put" ? "PUT" : "CALL";
    const directions = [...new Set((Array.isArray(model?.entries) ? model.entries : [])
      .map((entry) => String(entry?.direction || "").toUpperCase())
      .filter((direction) => ["BUY", "SELL"].includes(direction)))];
    const direction = directions.length === 1 ? directions[0] : null;
    const exact = Number(model?.exact);
    if (!direction || !Number.isFinite(exact)) {
      return String(model?.label || "").replace(`${model?.strategyLabel || ""} `, "");
    }
    const winsAbove = (direction === "BUY" && side === "CALL")
      || (direction === "SELL" && side === "PUT");
    return `${side} BE ${Math.round(exact).toLocaleString("en-IN")} · ${direction} ${winsAbove ? "ABOVE ↑" : "BELOW ↓"}`;
  }

  function renderBrokerPositionSpine(rootNodeValue, models, toY, rect, spineX, guide = {}) {
    const visible = brokerPositionSpineModels(models).map((model) => {
      const entry = model.entries[0];
      const y = Number(toY(Number(entry.strike)));
      return { model, entry, y };
    }).filter(({ y }) => Number.isFinite(y) && y >= Number(rect.top) && y <= Number(rect.bottom));
    if (!visible.length) return;

    const visibleStrikePoints = (guide.visibleStrikes || [])
      .map((strike) => ({ strike: Number(strike), y: Number(toY(Number(strike))) }));
    const controlPoints = [
      ...visibleStrikePoints,
      ...visible.map(({ y }) => ({ y })),
      ...(Array.isArray(guide.positionYs) ? guide.positionYs.map((y) => ({ y })) : [])
    ];
    const bounds = positionSpineBounds(controlPoints, rect)
      || { top: Number(rect.top), bottom: Number(rect.bottom) };
    const line = document.createElement("span");
    line.className = "nifty-position-spine__line";
    line.style.left = `${spineX}px`;
    line.style.top = `${bounds.top}px`;
    line.style.height = `${Math.max(0, bounds.bottom - bounds.top)}px`;
    if (Number.isFinite(Number(guide.atm))) line.dataset.atm = String(guide.atm);
    line.setAttribute("aria-hidden", "true");
    rootNodeValue.append(line);

    [["C", "is-call"], ["P", "is-put"]].forEach(([text, className]) => {
      const laneLabel = document.createElement("span");
      laneLabel.className = `nifty-position-spine__lane-label ${className}`;
      laneLabel.textContent = text;
      laneLabel.style.left = `${spineX}px`;
      laneLabel.style.top = `${Math.max(0, bounds.top - 15)}px`;
      rootNodeValue.append(laneLabel);
    });

    const positionItems = [];

    visible.forEach(({ model, entry, y }) => {
      const side = entry.optionType === "PUT" ? "put" : "call";
      const direction = String(entry.direction || "").toLowerCase();
      const lots = Math.max(1, Number(entry.lots) || 1);
      const compact = document.createElement("span");
      compact.className = `nifty-position-spine__compact is-${side}`;
      compact.style.top = `${y - 9}px`;
      compact.style.right = side === "call"
        ? `${Math.max(0, window.innerWidth - spineX + POSITION_LANE_GAP_PX)}px`
        : `${Math.max(0, window.innerWidth - spineX - POSITION_LANE_GAP_PX - POSITION_CONTROL_WIDTH_PX)}px`;

      const compactSelect = document.createElement("button");
      compactSelect.type = "button";
      compactSelect.className = "nifty-position-spine__compact-select";
      compactSelect.setAttribute("aria-pressed", String(model.selected));
      compactSelect.setAttribute("aria-label", `${model.strategyLabel} ${model.selected ? "selected" : "not selected"} for combined preview`);
      compactSelect.setAttribute("title", "Select exact position for combined preview");
      compactSelect.addEventListener("click", (event) => {
        event.stopPropagation?.();
        ensureStrategyChartController()?.square(model.strategyId);
      });

      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = `nifty-position-spine__marker is-${side} is-${direction}`;
      marker.classList.toggle("is-open", openedStrategyId === model.strategyId);
      marker.dataset.strategyId = model.strategyId;
      marker.textContent = `${side === "call" ? "C" : "P"}${lots}`;
      marker.setAttribute("aria-expanded", String(openedStrategyId === model.strategyId));
      marker.setAttribute("aria-label", `${side === "call" ? "Call" : "Put"} ${entry.direction}, ${lots} ${lots === 1 ? "lot" : "lots"}, strike ${Number(entry.strike).toLocaleString("en-IN")}. Open P and L.`);
      marker.setAttribute("title", `${side === "call" ? "C" : "P"}${lots} · ${entry.direction} · ${Number(entry.strike).toLocaleString("en-IN")}`);
      marker.addEventListener("click", (event) => {
        event.stopPropagation?.();
        openBrokerEntryDetails(entry.id);
      });
      if (side === "call") compact.append(compactSelect, marker);
      else compact.append(marker, compactSelect);
      rootNodeValue.append(compact);
      positionItems.push({
        id: model.strategyId,
        y,
        side,
        kind: "BROKER",
        tone: direction,
        label: `${side === "call" ? "C" : "P"}${lots} · ${Number(entry.strike).toLocaleString("en-IN")} · ${entry.direction}`,
        strategyId: model.strategyId,
        entryId: entry.id,
        element: compact
      });

      if (breakEvenSelection.current() && visibleStrategyRailId === model.strategyId) {
        const projection = strategyChartApi.projectBreakEven(model.exact, {
          minPrice: Math.min(...(controller?.membership()?.axisPrices || []).map(Number).filter(Number.isFinite)),
          maxPrice: Math.max(...(controller?.membership()?.axisPrices || []).map(Number).filter(Number.isFinite)),
          minY: Number(rect.top),
          maxY: Number(rect.bottom),
          priceToY: toY
        });
        if (projection.mode === "RAIL") {
          const rail = document.createElement("span");
          rail.className = "nifty-position-spine__be-rail";
          rail.dataset.strategyId = model.strategyId;
          rail.style.left = `${rect.left}px`;
          rail.style.top = `${projection.railY}px`;
          rail.style.width = `${Math.max(0, spineX - Number(rect.left))}px`;
          rootNodeValue.append(rail);
        }
      }

      if (openedStrategyId !== model.strategyId) return;
      const item = strategyPnlItems(model.entries)[0];
      const card = document.createElement("span");
      card.className = `nifty-position-spine__card is-${direction}`;
      card.dataset.strategyId = model.strategyId;
      card.style.right = `${Math.max(0, window.innerWidth - spineX + 12)}px`;
      card.style.top = `${Math.max(Number(rect.top) + 6, Math.min(Number(rect.bottom) - 104, y - 52))}px`;

      const header = document.createElement("span");
      header.className = "nifty-position-spine__header";
      const token = document.createElement("span");
      token.className = "nifty-position-spine__token";
      token.textContent = `${side === "call" ? "C" : "P"}${lots}`;
      const title = document.createElement("span");
      title.textContent = `${Number(entry.strike).toLocaleString("en-IN")} · ${entry.direction}`;
      const select = document.createElement("button");
      select.type = "button";
      select.className = "nifty-position-spine__select";
      select.setAttribute("aria-pressed", String(model.selected));
      select.setAttribute("aria-label", `${model.strategyLabel} ${model.selected ? "selected" : "not selected"} for combined preview`);
      select.setAttribute("title", "Select for combined preview");
      select.addEventListener("click", (event) => {
        event.stopPropagation?.();
        ensureStrategyChartController()?.square(model.strategyId);
      });
      header.append(token, title, select);

      const pnl = document.createElement("span");
      pnl.className = "nifty-position-spine__pnl";
      const pnlLabel = document.createElement("span");
      pnlLabel.textContent = "LIVE P&L";
      const pnlValue = document.createElement("strong");
      pnlValue.className = `is-${item?.tone || "flat"}`;
      pnlValue.textContent = item?.pnl || "—";
      pnl.append(pnlLabel, pnlValue);

      const actions = document.createElement("span");
      actions.className = "nifty-position-spine__actions";
      const railProjection = strategyChartApi.projectBreakEven(model.exact, {
        minPrice: Math.min(...(controller?.membership()?.axisPrices || []).map(Number).filter(Number.isFinite)),
        maxPrice: Math.max(...(controller?.membership()?.axisPrices || []).map(Number).filter(Number.isFinite)),
        minY: Number(rect.top),
        maxY: Number(rect.bottom),
        priceToY: toY
      });
      const showRail = document.createElement("button");
      showRail.type = "button";
      showRail.className = "nifty-position-spine__rail-toggle";
      const hasActiveStrike = Number(breakEvenSelection.current()?.strike) === Number(entry.strike);
      showRail.disabled = !hasActiveStrike || railProjection.mode !== "RAIL";
      showRail.textContent = !hasActiveStrike
        ? "SELECT STRIKE FOR BE"
        : railProjection.mode !== "RAIL"
        ? "BE OUTSIDE VIEW"
        : visibleStrategyRailId === model.strategyId ? "HIDE BE RAIL" : "SHOW BE RAIL";
      showRail.addEventListener("click", (event) => {
        event.stopPropagation?.();
        if (Number(breakEvenSelection.current()?.strike) !== Number(entry.strike)) return;
        visibleStrategyRailId = visibleStrategyRailId === model.strategyId ? null : model.strategyId;
        void controller?.place();
      });
      const close = document.createElement("button");
      close.type = "button";
      close.className = "nifty-position-spine__close";
      close.textContent = "CLOSE";
      close.addEventListener("click", (event) => {
        event.stopPropagation?.();
        if (!closeBrokerPositionDetails(model.strategyId, rootNodeValue)) return;
        void controller?.place();
      });
      actions.append(showRail, close);
      card.append(header, pnl, actions);
      rootNodeValue.append(card);
    });
    return positionItems;
  }

  function renderEdgeStackGroups(rootNodeValue, items, layout) {
    if (!layout?.call || !layout?.put) return;
    positionColumnClusters(items).filter((cluster) => cluster.items.length > 1).forEach((cluster) => {
      const lane = layout[cluster.side];
      const sideLabel = cluster.side === "put" ? "Put" : "Call";
      cluster.items.forEach((item) => {
        item.element.hidden = true;
        item.element.classList.add("is-grouped");
      });

      const clusterNode = document.createElement("span");
      clusterNode.className = `nifty-position-spine__cluster is-${cluster.side}`;
      clusterNode.dataset.groupKey = cluster.key;
      clusterNode.style.right = `${window.innerWidth - lane.right}px`;
      clusterNode.style.top = `${cluster.y - 9}px`;

      const groupSelector = document.createElement("button");
      groupSelector.type = "button";
      groupSelector.className = "nifty-position-spine__cluster-select";
      groupSelector.dataset.groupKey = cluster.key;
      groupSelector.setAttribute("aria-expanded", String(openedEdgeGroupKey === cluster.key));
      groupSelector.setAttribute("aria-label", `${openedEdgeGroupKey === cluster.key ? "Close" : "Open"} ${cluster.items.length} grouped ${sideLabel} positions`);
      groupSelector.addEventListener("click", (event) => {
        event.stopPropagation?.();
        openedEdgeGroupKey = openedEdgeGroupKey === cluster.key ? null : cluster.key;
        void controller?.place();
      });

      const group = document.createElement("span");
      group.className = "nifty-position-spine__cluster-count";
      group.dataset.groupKey = cluster.key;
      group.textContent = `+${cluster.items.length}`;
      ["buy", "sell"].forEach((tone) => {
        const mark = document.createElement("span");
        mark.className = `nifty-position-spine__cluster-tone is-${tone}`;
        mark.setAttribute("aria-hidden", "true");
        group.append(mark);
      });
      group.setAttribute("aria-hidden", "true");
      if (cluster.side === "call") clusterNode.append(groupSelector, group);
      else clusterNode.append(group, groupSelector);
      rootNodeValue.append(clusterNode);

      if (openedEdgeGroupKey !== cluster.key) return;
      const flyout = document.createElement("span");
      flyout.className = `nifty-position-spine__cluster-flyout is-${cluster.side}`;
      flyout.style.right = `${Math.max(0, window.innerWidth - lane.left + 12)}px`;
      const flyoutHeight = cluster.items.length * 24 + 2;
      const centeredTop = cluster.y - flyoutHeight / 2;
      const maxTop = Math.max(8, Number(window.innerHeight) - flyoutHeight - 8);
      flyout.style.top = `${Math.max(8, Math.min(maxTop, centeredTop))}px`;
      cluster.items.forEach((item) => {
        const row = document.createElement("span");
        row.className = `nifty-position-spine__cluster-row is-${item.tone}`;
        if (["STRATEGY", "BROKER"].includes(item.kind)) {
          const itemSelector = document.createElement("button");
          itemSelector.type = "button";
          itemSelector.className = "nifty-position-spine__cluster-row-select";
          itemSelector.setAttribute("aria-pressed", String(ensureStrategyChartController()?.isSelected(item.strategyId) || false));
          itemSelector.setAttribute("aria-label", `${ensureStrategyChartController()?.isSelected(item.strategyId) ? "Clear" : "Select"} ${item.label} for combined preview`);
          itemSelector.addEventListener("click", (event) => {
            event.stopPropagation?.();
            ensureStrategyChartController()?.square(item.strategyId);
          });
          const openItem = document.createElement("button");
          openItem.type = "button";
          openItem.className = "nifty-position-spine__cluster-row-open";
          openItem.textContent = item.label;
          openItem.addEventListener("click", (event) => {
            event.stopPropagation?.();
            openedEdgeGroupKey = null;
            if (item.kind === "BROKER" && item.entryId) openBrokerEntryDetails(item.entryId);
            else strategyChartController.label(item.strategyId);
          });
          row.append(itemSelector, openItem);
        } else {
          row.textContent = item.label;
        }
        flyout.append(row);
      });
      rootNodeValue.append(flyout);
    });
  }

  function placeStrategyRails(toY, rect, labelRight, visualPlacementRevision, spineGuide = {}) {
    if (!visualPlacementIsCurrent(visualPlacementRevision) || !strategyChartApi || !strategyStoreApi) return false;
    const originals = originalStrategyModels();
    const spineModels = brokerPositionSpineModels(originals);
    const showStrategyBreakEvens = Boolean(breakEvenSelection.current());
    const selectedIds = ensureStrategyChartController()?.selected() || [];
    const selectedIdSet = new Set(selectedIds);
    const faceEntry = activeFaceEntry();
    const manualFaceOwner = faceEntry?.source === "MANUAL"
      ? activeStrategyOwnerForEntry(faceEntry.id)
      : null;
    const manualFaceOwnerIds = new Set(manualFaceOwner ? [manualFaceOwner.id] : []);
    const strategySelectionActive = selectedIds.length > 0;
    const manualFaceStrike = faceEntry?.source === "MANUAL" ? Number(faceEntry.strike) : null;
    if (strategySelectionActive && Number.isFinite(manualFaceStrike)) {
      activeChartStrategies().forEach((strategy) => {
        const ownsManualAtFaceStrike = strategyStoreApi.legsForStrategy(settings.strategyBook, strategy.id)
          .some((entry) => entry.source === "MANUAL" && Number(entry.strike) === manualFaceStrike);
        if (ownsManualAtFaceStrike) manualFaceOwnerIds.add(strategy.id);
      });
    }
    const manualOriginals = originals.filter((model) =>
      !["BROKER_LEG", "BROKER_COMBINED"].includes(model.viewKind));
    const chartOriginals = showStrategyBreakEvens
      ? manualOriginals.filter((model) => manualFaceOwnerIds.has(model.strategyId))
      : [];
    const { models: combined, preview } = showStrategyBreakEvens && strategySelectionActive
      ? combinedStrategyModels(originals)
      : { models: [], preview: null };
    const previewingCombined = showStrategyBreakEvens && selectedIds.length >= 2 && combined.length > 0;
    const showComparedOriginalRails = previewingCombined && strategyChartController.comparing();
    const models = [
      ...chartOriginals.map((model) => ({
        ...model,
        hideRail: previewingCombined
          ? !(showComparedOriginalRails && selectedIdSet.has(model.strategyId))
          : !selectedIdSet.has(model.strategyId)
      })),
      ...combined
    ];
    if (!models.length && !spineModels.length) {
      clearStrategyRails();
      return false;
    }
    const prices = (controller?.membership()?.axisPrices || []).map(Number).filter(Number.isFinite);
    const axisMap = {
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      minY: Number(rect.top),
      maxY: Number(rect.bottom),
      priceToY: toY
    };
    const projected = models.map((model, index) => ({
      ...model,
      id: `${model.kind}:${model.strategyId || "combined"}:${index}`,
      side: strategyColumnSide(model, spineGuide.atm),
      projection: strategyChartApi.projectBreakEven(model.exact, axisMap)
    })).filter((model) => model.projection.mode !== "HIDDEN");
    if (!projected.length && !spineModels.length) {
      clearStrategyRails();
      return false;
    }
    const projectedCards = projected.map((model) => ({
      id: model.id,
      side: model.side,
      railY: model.projection.mode === "RAIL" ? model.projection.railY : model.projection.markerY,
      height: model.kind === "STRATEGY" && !openedStrategyId
        ? POSITION_CONTROL_HEIGHT_PX
        : strategyChartApi.strategyCardHeight(model, openedStrategyId)
    }));
    const fixedControls = [
      ...spineModels.map((model) => ({
        y: Number(toY(Number(model?.entries?.[0]?.strike))),
        side: strategyColumnSide(model, spineGuide.atm)
      })),
      ...[...(document.getElementById(LABELS_ID)
        ?.querySelectorAll(".nifty-axis-ladder__off-grid") || [])]
        .filter((element) => !element.hidden)
        .map((element) => ({
          y: Number(toY(Number(element.dataset.strike))),
          side: /^P\d/.test(element.textContent || "")
            ? "put"
            : /^C\d/.test(element.textContent || "")
              ? "call"
              : null
        }))
    ].filter((control) => Number.isFinite(control.y) && ["call", "put"].includes(control.side));
    const cards = openedStrategyId
      ? ["call", "put"].flatMap((side) => strategyChartApi.stackCards(
        projected.filter((model) => model.side === side).map((model) => ({
          id: model.id,
          railY: model.projection.mode === "RAIL" ? model.projection.railY : model.projection.markerY,
          height: strategyChartApi.strategyCardHeight(model, openedStrategyId)
        })),
        { gap: 6, minY: Number(rect.top), maxY: Number(rect.bottom) }
      ))
      : placeHeadersAroundFixedControls(projectedCards, fixedControls, {
        gap: POSITION_LANE_GAP_PX,
        controlHeight: POSITION_CONTROL_HEIGHT_PX,
        minY: Number(rect.top),
        maxY: Number(rect.bottom)
      });
    const cardById = new Map(cards.map((card) => [card.id, card]));
    const rootNodeValue = strategyRailsRoot();
    rootNodeValue.replaceChildren();
    renderStrategyPreviewBar(rootNodeValue, preview, selectedIds.length);
    const ladderLeft = Math.max(Number(rect.left), Math.min(Number(rect.right), Number(labelRight) || Number(rect.right)));
    const spineLayout = positionSpineLayout(ladderLeft, rect, window.innerWidth);
    const useTypeColumns = spineLayout?.hasSafePutGap;
    const activeSpineX = useTypeColumns ? spineLayout.spineX : ladderLeft;
    const typeLayout = useTypeColumns ? spineLayout : {
      ...spineLayout,
      spineX: activeSpineX,
      call: {
        left: activeSpineX - POSITION_LANE_GAP_PX - POSITION_CONTROL_WIDTH_PX,
        right: activeSpineX - POSITION_LANE_GAP_PX
      },
      put: {
        left: activeSpineX + POSITION_LANE_GAP_PX,
        right: activeSpineX + POSITION_LANE_GAP_PX + POSITION_CONTROL_WIDTH_PX
      }
    };
    const edgeStrategyItems = [];
    projected.forEach((model) => {
      const placement = cardById.get(model.id);
      if (!placement) return;
      const lane = typeLayout[model.side];
      const cardRight = lane.right;
      const rail = document.createElement("div");
      rail.className = model.projection.mode === "RAIL"
        ? "nifty-strategy__rail"
        : `nifty-strategy__edge is-${String(model.projection.edge).toLowerCase()}`;
      rail.style.top = `${placement.railY}px`;
      rail.style.left = `${rect.left}px`;
      rail.style.width = `${Math.max(0, cardRight - rect.left)}px`;
      if (model.strategyId) rail.dataset.strategyId = model.strategyId;
      if (!model.hideRail) {
        if (model.kind === "STRATEGY") rail.classList.add("is-original");
        rootNodeValue.append(rail);
      }
      if (!model.hideRail && placement.connector.moved) {
        const connector = document.createElement("div");
        connector.className = "nifty-strategy__connector";
        connector.style.right = `${window.innerWidth - cardRight}px`;
        connector.style.top = `${Math.min(placement.connector.fromY, placement.connector.toY)}px`;
        connector.style.height = `${Math.abs(placement.connector.toY - placement.connector.fromY)}px`;
        rootNodeValue.append(connector);
      }
      const card = document.createElement("div");
      const isOpen = model.kind === "STRATEGY" && openedStrategyId === model.strategyId;
      card.className = `nifty-strategy__card is-${model.kind.toLowerCase()} is-${String(model.viewKind || "standard").toLowerCase()} is-${model.side} ${isOpen ? "is-open" : "is-collapsed"}`;
      if (model.kind === "STRATEGY" && !isOpen) card.classList.add("is-rail-header");
      card.dataset.exact = String(model.exact);
      if (model.viewKind === "BROKER_COMBINED") card.classList.add("is-summary-source");
      card.style.right = `${window.innerWidth - cardRight}px`;
      card.style.top = `${placement.cardY}px`;
      if (model.kind === "STRATEGY") {
        const selector = document.createElement("button");
        selector.type = "button";
        selector.className = "nifty-strategy__selector";
        selector.setAttribute("aria-pressed", String(model.selected));
        selector.setAttribute("aria-label", `${model.strategyLabel} ${model.selected ? "selected" : "not selected"} for combined preview`);
        selector.addEventListener("pointerdown", (event) => {
          event.preventDefault?.();
          event.stopPropagation?.();
          strategyChartController.square(model.strategyId);
        });
        selector.addEventListener("click", (event) => {
          event.stopPropagation?.();
          if (Number(event.detail) > 0) return;
          strategyChartController.square(model.strategyId);
        });
        const label = document.createElement("button");
        label.type = "button";
        label.className = "nifty-strategy__label";
        label.dataset.token = model.viewKind === "BROKER_COMBINED" ? "ALL" : model.strategyLabel;
        if (!isOpen) {
          const token = document.createElement("span");
          token.className = "nifty-strategy__rail-token";
          token.textContent = `${label.dataset.token} `;
          label.append(token);
          if (!model.hideRail) {
            const divider = document.createElement("span");
            divider.className = "nifty-strategy__rail-divider";
            divider.setAttribute("aria-hidden", "true");
            const text = document.createElement("span");
            text.className = "nifty-strategy__rail-text";
            text.textContent = strategyRailText(model);
            label.append(divider, text);
          }
        } else {
          label.textContent = `${model.label}${model.projection.mode === "EDGE" ? ` ${model.projection.arrow}` : ""}`;
        }
        label.setAttribute("aria-label", strategyChartApi.accessibleLabel({
          ...model,
          mode: model.projection.mode,
          edge: model.projection.edge
        }));
        label.addEventListener("click", (event) => {
          event.stopPropagation?.();
          strategyChartController.label(model.strategyId);
        });
        card.append(selector, label);
      } else {
        const label = document.createElement("span");
        label.className = "nifty-strategy__label";
        label.textContent = `${model.label}${model.projection.mode === "EDGE" ? ` ${model.projection.arrow}` : ""}`;
        card.append(label);
      }
      appendStrategyDetails(card, model);
      rootNodeValue.append(card);
      if (model.kind === "STRATEGY" && !isOpen) {
        edgeStrategyItems.push({
          id: model.id,
          y: placement.cardY + POSITION_CONTROL_HEIGHT_PX / 2,
          side: model.side,
          kind: "STRATEGY",
          tone: "strategy",
          label: model.label,
          strategyId: model.strategyId,
          element: card
        });
      }
    });
    const brokerItems = renderBrokerPositionSpine(rootNodeValue, spineModels, toY, rect,
      activeSpineX, {
        ...spineGuide,
        ladderLeft,
        positionYs: edgeStrategyItems.map((item) => item.y)
      }) || [];
    const edgeTradeItems = [...(document.getElementById(LABELS_ID)
      ?.querySelectorAll(".nifty-axis-ladder__off-grid") || [])]
      .filter((element) => !element.hidden)
      .map((element) => ({
        id: `trade:${element.dataset.direction}:${element.dataset.strike}`,
        y: toY(Number(element.dataset.strike)),
        side: /^P\d/.test(String(element.textContent || "").trim())
          ? "put"
          : /^C\d/.test(String(element.textContent || "").trim()) ? "call" : null,
        kind: "TRADE",
        tone: String(element.dataset.direction || "").toLowerCase(),
        label: element.getAttribute("aria-label") || element.textContent,
        element
      }));
    renderEdgeStackGroups(rootNodeValue, [...edgeStrategyItems, ...brokerItems, ...edgeTradeItems], typeLayout);
    return true;
  }

  function manualDraftIdentity(draft) {
    return {
      id: draft.id || `manual-preview:${draft.expiry}:${draft.strike}`,
      now: draft.createdAt || "1970-01-01T00:00:00.000Z"
    };
  }

  function manualDisplayEntries() {
    const saved = manualEntriesForExpiry();
    const draft = manualEditor?.draft || null;
    const validDraft = Boolean(draft && manualUiApi?.validateDraft?.(draft).ok);
    const displayed = validDraft
      ? manualUiApi.previewEntries(saved, draft, manualDraftIdentity(draft))
      : saved;
    return displayed.map((entry) => {
      const ownedLeg = settings.strategyBook?.legs?.[entry.id];
      return {
        ...entry,
        source: "MANUAL",
        ...(entry.lotSize === undefined && ownedLeg?.source === "MANUAL"
          && Number.isInteger(ownedLeg.lotSize) && ownedLeg.lotSize > 0
          ? { lotSize: ownedLeg.lotSize }
          : {})
      };
    });
  }

  function manualLevels() {
    const entries = manualDisplayEntries();
    const validDraft = Boolean(manualEditor?.draft && manualUiApi?.validateDraft?.(manualEditor.draft).ok);
    return manualPayoffApi?.levels?.(entries, validDraft ? "PREVIEW BE" : "PLAN BE")
      || { status: "empty", levels: [] };
  }

  function signedApproxRupees(value) {
    if (!Number.isFinite(value)) return "—";
    const rounded = Math.round(value);
    const sign = rounded > 0 ? "+" : rounded < 0 ? "-" : "";
    return `${sign}₹${Math.abs(rounded).toLocaleString("en-IN")}`;
  }

  function manualPositionPnlItems(levelIndex, levelCount) {
    const optionType = levelCount === 1 ? null
      : levelIndex === 0 ? "PUT"
        : levelIndex === levelCount - 1 ? "CALL" : null;
    const membershipRows = controller?.membership()?.rows || [];
    return manualDisplayEntries()
      .filter((entry) => !optionType || entry.optionType === optionType)
      .map((entry) => {
        const row = membershipRows.find((candidate) => candidate.strike === entry.strike);
        const pnl = manualPayoffApi?.positionPnl?.(entry, row);
        const side = entry.optionType === "CALL" ? "C" : "P";
        const label = `${side} ${Number(entry.strike).toLocaleString("en-IN")} ${entry.direction} ×${entry.lots}`;
        const pnlText = signedApproxRupees(pnl);
        return {
          label,
          pnlText,
          text: `${label}   ${pnlText}`,
          tone: pnl > 0 ? "profit" : pnl < 0 ? "loss" : "flat"
        };
      });
  }

  function makeManualRailDisclosure(group, breakEvenLabel, pnlItems, widthCh) {
    if (!group) return;
    let expanded = false;
    const summary = document.createElement("span");
    summary.className = "nifty-manual-plan__label is-plan";
    summary.textContent = breakEvenLabel;
    const trades = document.createElement("span");
    trades.className = "nifty-manual-plan__trades";
    pnlItems.forEach((item) => {
      const trade = document.createElement("span");
      trade.className = `nifty-manual-plan__trade is-${item.tone}`;
      trade.style.width = `${widthCh}ch`;
      const position = document.createElement("span");
      position.className = "nifty-manual-plan__position";
      position.textContent = item.label;
      const pnl = document.createElement("span");
      pnl.className = `nifty-manual-plan__pnl is-${item.tone}`;
      pnl.textContent = item.pnlText;
      trade.append(position, pnl);
      trades.append(trade);
    });
    const render = () => {
      group.replaceChildren(summary);
      if (expanded) group.append(trades);
      group.classList.toggle("is-expanded", expanded);
      summary.setAttribute("aria-expanded", String(expanded));
      summary.setAttribute("aria-label", expanded
        ? `${breakEvenLabel}. All ${pnlItems.length} relevant trades shown. Click to collapse.`
        : `${breakEvenLabel}. Click to show all ${pnlItems.length} relevant trades.`);
    };
    const collapse = () => {
      if (!expanded) return;
      expanded = false;
      if (expandedManualRailDisclosure?.group === group) expandedManualRailDisclosure = null;
      render();
    };
    const toggle = (event) => {
      event?.stopPropagation?.();
      if (expanded) {
        collapse();
        return;
      }
      collapseExpandedManualRailDisclosure();
      expanded = true;
      expandedManualRailDisclosure = { group, collapse };
      render();
    };
    if (!pnlItems.length) {
      render();
      return;
    }
    summary.classList.add("is-flippable");
    summary.setAttribute("role", "button");
    summary.setAttribute("tabindex", "0");
    group.addEventListener("click", toggle);
    group.addEventListener("keydown", (event) => {
      if (!["Enter", " "].includes(event?.key)) return;
      event.preventDefault?.();
      toggle(event);
    });
    render();
  }

  function manualRailPlacements(toY, rect, payoff = manualLevels()) {
    if (payoff?.status !== "ok" || !breakEvenApi || typeof toY !== "function") return null;
    const plotLeft = Number(rect?.left);
    const plotRight = Number(rect?.right);
    if (!Number.isFinite(plotLeft) || !Number.isFinite(plotRight) || plotRight <= plotLeft) return null;
    const placements = payoff.levels.map((level) => ({
      level,
      projection: breakEvenApi.project(level, toY, rect)
    }));
    return placements.length && !placements.some(({ projection }) => !projection) ? placements : null;
  }

  function placeManualPlanRails(toY, rect, labelRight, decorations, visualPlacementRevision) {
    if (!visualPlacementIsCurrent(visualPlacementRevision)) return false;
    const payoff = manualLevels();
    if (payoff.status === "empty") {
      clearManualPlanRails(visualPlacementRevision);
      return false;
    }
    if (payoff.status === "flat") {
      removeManualPlanRails(visualPlacementRevision);
      showStatus("PLAN PAYOFF FLAT");
      return true;
    }
    const plotLeft = Number(rect?.left);
    const plotRight = Number(rect?.right);
    const placements = manualRailPlacements(toY, rect, payoff);
    if (!placements) {
      clearManualPlanRails(visualPlacementRevision);
      return false;
    }
    const labelDecorations = decorations === undefined
      ? breakEvenApi.layoutDecorations?.(placements, rect, BREAK_EVEN_LABEL_HEIGHT, 2)
      : decorations;
    if (!labelDecorations) {
      clearManualPlanRails(visualPlacementRevision);
      return false;
    }
    const railRight = Math.max(plotLeft, Math.min(plotRight, Number.isFinite(labelRight) ? labelRight : plotRight));
    const rails = manualPlanRailsRoot();
    rails.replaceChildren();
    const railItems = placements.map(({ level }, index) => ({
      breakEvenLabel: level.label,
      pnlItems: manualPositionPnlItems(index, placements.length)
    }));
    const sharedWidthCh = Math.max(34, Math.min(60, 2 + Math.max(...railItems.flatMap(({ breakEvenLabel, pnlItems }) => [
      breakEvenLabel.length,
      ...pnlItems.map((item) => item.text.length)
    ]))));
    placements.forEach(({ level, projection }, index) => {
      const element = document.createElement("div");
      const className = projection.mode === "line" ? "line" : "marker";
      const themeClass = Number(level.exact) === Number(controller?.membership()?.atm) ? " is-atm" : "";
      element.className = `nifty-manual-plan__${className} is-plan`;
      element.style.top = `${projection.y}px`;
      if (projection.mode === "line") {
        element.style.left = `${plotLeft}px`;
        element.style.width = `${plotRight - plotLeft}px`;
        const group = document.createElement("span");
        group.className = `nifty-manual-plan__group is-plan${themeClass}`;
        group.style.right = `${window.innerWidth - railRight}px`;
        group.style.top = `${labelDecorations[index].top}px`;
        makeManualRailDisclosure(
          group,
          railItems[index].breakEvenLabel,
          railItems[index].pnlItems,
          sharedWidthCh
        );
        element.append(group);
      } else {
        element.classList.add(`is-${projection.edge}`);
        const group = document.createElement("span");
        group.className = `nifty-manual-plan__group is-plan${themeClass}`;
        group.style.right = `${window.innerWidth - railRight}px`;
        group.style.top = `${labelDecorations[index].top}px`;
        makeManualRailDisclosure(
          group,
          railItems[index].breakEvenLabel,
          railItems[index].pnlItems,
          sharedWidthCh
        );
        element.append(group);
      }
      rails.append(element);
    });
    clearManualPayoffStatusOverride();
    return true;
  }

  function quickRailPlacements(toY, rect) {
    const selection = breakEvenSelection.current();
    if (!selection || !breakEvenApi || typeof toY !== "function") return null;
    const breakEvens = breakEvenApi.calculate(selection);
    if (!breakEvens) return null;
    const plotLeft = Number(rect?.left);
    const plotRight = Number(rect?.right);
    const plotTop = Number(rect?.top);
    const plotBottom = Number(rect?.bottom);
    if (![plotLeft, plotRight, plotTop, plotBottom].every(Number.isFinite) || plotRight <= plotLeft || plotBottom <= plotTop) {
      return null;
    }
    const placements = [breakEvens.call, breakEvens.put].map((level) => ({
      level,
      projection: breakEvenApi.project(level, toY, rect)
    }));
    return placements.some(({ projection }) => !projection) ? null : placements;
  }

  function sharedRailDecorations(toY, rect, { includeManual = true } = {}) {
    const quick = quickRailPlacements(toY, rect);
    const manual = includeManual ? manualRailPlacements(toY, rect) : null;
    if (!quick && !manual) return { quick: null, manual: null };
    const combined = [...(quick || []), ...(manual || [])];
    const decorations = breakEvenApi?.layoutDecorations?.(combined, rect, BREAK_EVEN_LABEL_HEIGHT, 2);
    if (!decorations) return { quick: null, manual: null };
    const quickCount = quick?.length || 0;
    return {
      quick: quick ? decorations.slice(0, quickCount) : null,
      manual: manual ? decorations.slice(quickCount) : null
    };
  }

  function placeBreakEvenRails(toY, rect, labelRight, decorations, visualPlacementRevision) {
    if (!visualPlacementIsCurrent(visualPlacementRevision)) return false;
    const placements = quickRailPlacements(toY, rect);
    if (!placements) {
      clearBreakEvenRails(visualPlacementRevision);
      return false;
    }
    const plotLeft = Number(rect?.left);
    const plotRight = Number(rect?.right);
    const railRight = Math.max(plotLeft, Math.min(plotRight, Number.isFinite(labelRight) ? labelRight : plotRight));
    const labelDecorations = decorations === undefined
      ? breakEvenApi.layoutDecorations?.(placements, rect, BREAK_EVEN_LABEL_HEIGHT, 2)
      : decorations;
    if (!labelDecorations) {
      clearBreakEvenRails(visualPlacementRevision);
      return false;
    }
    clearBreakEvenRails(visualPlacementRevision);
    const rails = breakEvenRoot();
    placements.forEach(({ level, projection }, index) => {
      const element = document.createElement("div");
      const className = projection.mode === "line" ? "line" : "marker";
      element.className = `nifty-break-even__${className} is-${level.kind}`;
      element.style.top = `${projection.y}px`;
      if (projection.mode === "line") {
        element.style.left = `${plotLeft}px`;
        element.style.width = `${plotRight - plotLeft}px`;
        const label = document.createElement("span");
        label.className = `nifty-break-even__label is-${level.kind}`;
        label.dataset.exact = String(level.exact);
        label.style.right = `${window.innerWidth - railRight}px`;
        label.style.top = `${labelDecorations[index].top}px`;
        label.textContent = level.label;
        element.append(label);
      } else {
        element.style.left = "";
        element.style.right = `${window.innerWidth - railRight}px`;
        element.style.top = `${labelDecorations[index].top}px`;
        element.classList.add(`is-${projection.edge}`);
        element.textContent = level.label;
      }
      rails.append(element);
    });
    return true;
  }

  function renderBreakEvenSelection() {
    const selectedStrike = breakEvenSelection.current()?.strike;
    rootNode().querySelectorAll(".nifty-axis-ladder__row").forEach((row) => {
      const isSelected = Number(row.dataset.strike) === selectedStrike;
      row.classList.toggle("is-selected", isSelected);
      row.setAttribute("aria-pressed", String(isSelected));
    });
    if (!Number.isFinite(selectedStrike)) clearBreakEvenRails();
  }

  function reconcileBreakEvenSelection(rows, visibleStrikes) {
    const selected = breakEvenSelection.current();
    if (!selected) return false;
    const activeRow = (Array.isArray(rows) ? rows : [])
      .find((row) => Number(row?.strike) === Number(selected.strike));
    const visible = visibleStrikes instanceof Set
      ? visibleStrikes.has(Number(selected.strike))
      : Boolean(activeRow);
    if (!activeRow || !visible) {
      clearBreakEvenSelection();
      return true;
    }
    const quoteChanged = Number(activeRow.call) !== Number(selected.call)
      || Number(activeRow.put) !== Number(selected.put)
      || (activeRow.call == null) !== (selected.call == null)
      || (activeRow.put == null) !== (selected.put == null);
    if (!quoteChanged) return false;
    if (breakEvenSelection.select(activeRow)) clearBreakEvenStatusOverride();
    else showStatus("OPTION PRICE UNAVAILABLE");
    return false;
  }

  function clearBreakEvenSelection({ repaintStrategyRails = false } = {}) {
    const hadSelection = Boolean(breakEvenSelection.current());
    breakEvenSelection.clear();
    manualInteraction?.dispose?.();
    manualInteraction = null;
    resetStrategyInteractionState();
    clearBreakEvenRails();
    const node = rootNode();
    node.querySelectorAll(".nifty-axis-ladder__row").forEach((row) => {
      row.classList.remove("is-selected");
      row.setAttribute("aria-pressed", "false");
    });
    clearBreakEvenStatusOverride();
    if (repaintStrategyRails && hadSelection && controller?.membership()) void controller.place();
  }

  function storageWriteFailure(cause) {
    return { manualStorageWriteFailure: true, cause };
  }

  function canRenderStorageManualPlans(lifecycleGeneration) {
    return manualLifecycleGeneration === lifecycleGeneration
      && !manualRowsConcealed
      && settings.enabled
      && Boolean(controller);
  }

  async function renderStorageManualPlans() {
    const lifecycleGeneration = manualLifecycleGeneration;
    if (!canRenderStorageManualPlans(lifecycleGeneration)) return;
    try {
      renderManualRows();
    } catch (_) {}
    if (!canRenderStorageManualPlans(lifecycleGeneration)) return;
    try {
      await controller?.place();
    } catch (_) {}
  }

  async function renderStorageStrategyBook() {
    if (manualRowsConcealed || !settings.enabled || !controller) return;
    try {
      renderManualRows();
    } catch (_) {}
    if (manualRowsConcealed || !settings.enabled || !controller) return;
    try {
      await controller.place();
    } catch (_) {}
  }

  async function renderCommittedManualPlans(origin) {
    const canRender = () => !manualRowsConcealed
      && settings.enabled
      && Boolean(controller)
      && settings.expiry === origin?.expiry
      && controller?.membership()?.expiry === origin?.expiry;
    if (!canRender()) return;
    try {
      renderManualRows();
    } catch (_) {}
    if (!canRender()) return;
    try {
      await controller?.place();
    } catch (_) {}
  }

  async function persistManualStrategy(mutation) {
    let response;
    try {
      response = await chrome.runtime.sendMessage({
        type: "MUTATE_MANUAL_STRATEGY",
        mutation
      });
    } catch (cause) {
      throw storageWriteFailure(cause);
    }
    if (!response?.ok || !response.manualPlans || !response.strategyBook) {
      throw storageWriteFailure(new Error(response?.error || "Manual strategy mutation failed."));
    }
    settings.manualPlans = normalizeManualPlans(response.manualPlans);
    settings.strategyBook = normalizeStrategyBook(response.strategyBook);
    return {
      manualPlans: settings.manualPlans,
      strategyBook: settings.strategyBook
    };
  }

  async function persistStrategyCommand(command) {
    const response = await chrome.runtime.sendMessage({ type: "MUTATE_STRATEGY_BOOK", command });
    if (!response?.ok || !response.strategyBook) {
      throw new Error(response?.error || "Strategy mutation failed.");
    }
    settings.strategyBook = normalizeStrategyBook(response.strategyBook);
    return settings.strategyBook;
  }

  function openManualEditor(context) {
    if (!manualUiApi?.createDraft || !manualUiApi?.renderEditor || !manualPlanApi) return;
    const strike = Number(context?.strike);
    const liveRow = controller?.membership()?.rows.find((row) => row.strike === strike);
    const rowElement = rootNode().querySelector(`.nifty-axis-ladder__row[data-strike="${strike}"]`);
    if (!liveRow || !rowElement) return;
    const entries = manualEntriesByStrike().get(strike) || [];
    const entry = entries.find((item) => item.id === context?.entryId) || null;
    if (entry?.source === "BROKER_POSITION") {
      openBrokerEntryDetails(entry.id);
      return;
    }
    let draft = manualUiApi.createDraft({
      expiry: settings.expiry,
      row: liveRow,
      entry,
      lotSize: controller?.chain()?.lotSize,
      optionType: context?.optionType
    });
    let editor = null;
    let pendingCommit = false;
    const origin = {
      token: ++manualEditorToken,
      lifecycleGeneration: manualLifecycleGeneration,
      expiry: settings.expiry
    };

    function syncCommitControls() {
      const commit = editor?.querySelector?.(".nifty-manual-editor__commit");
      const remove = editor?.querySelector?.(".nifty-manual-editor__remove");
      if (commit) commit.disabled = pendingCommit || !manualUiApi.validateDraft(draft).ok;
      if (remove) remove.disabled = pendingCommit;
    }

    async function commitManualStrategy(mutation) {
      if (pendingCommit) return false;
      pendingCommit = true;
      syncCommitControls();
      try {
        await persistManualStrategy(mutation);
        if (manualEditorOriginIsCurrent(origin)) {
          closeManualEditor();
          focusManualRow(strike);
        }
        await renderCommittedManualPlans(origin);
        return true;
      } catch (error) {
        if (!manualLifecycleOriginIsCurrent(origin)) return false;
        if (manualEditorOriginIsCurrent(origin)) {
          pendingCommit = false;
          syncCommitControls();
        }
        if (error?.manualStorageWriteFailure) showStatus("PLAN NOT SAVED");
        return false;
      }
    }

    function requestStrategyOwnership(entryToSave) {
      const identity = currentStrategyIdentity();
      if (!identity || !strategyStoreApi) {
        showStatus("STRATEGY NOT SAVED");
        return;
      }
      strategyOwnershipChooser?.remove?.();
      const chooser = document.createElement("div");
      chooser.className = "nifty-strategy-owner";
      const title = document.createElement("span");
      title.className = "nifty-strategy-owner__title";
      title.textContent = "CHOOSE STRATEGY";
      chooser.append(title);
      const choices = strategyOwnershipChoices(settings.strategyBook, identity.instrumentKey, entryToSave.expiry);
      choices.forEach((choice) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "nifty-strategy-owner__choice";
        button.textContent = choice.label;
        button.addEventListener("click", async (event) => {
          event.stopPropagation?.();
          chooser.querySelectorAll(".nifty-strategy-owner__choice").forEach((node) => { node.disabled = true; });
          try {
            const createNew = choice.kind === "CREATE_NEW";
            const strategyId = createNew ? crypto.randomUUID() : choice.strategyId;
            const strategySequence = Number(settings.strategyBook?.nextSequence) || 1;
            const committed = await commitManualStrategy({
              id: crypto.randomUUID(),
              type: "CREATE",
              entry: entryToSave,
              strategy: createNew
                ? {
                  mode: "CREATE_NEW",
                  strategyId,
                  label: `T${strategySequence}`,
                  instrumentKey: identity.instrumentKey,
                  underlying: identity.underlying
                }
                : { mode: "EXISTING", strategyId }
            });
            if (!committed) {
              chooser.querySelectorAll(".nifty-strategy-owner__choice")
                .forEach((node) => { node.disabled = false; });
            }
          } catch (_) {
            chooser.querySelectorAll(".nifty-strategy-owner__choice").forEach((node) => { node.disabled = false; });
            showStatus("STRATEGY NOT SAVED");
          }
        });
        chooser.append(button);
      });
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "nifty-strategy-owner__cancel";
      cancel.textContent = "CANCEL";
      cancel.addEventListener("click", (event) => {
        event.stopPropagation?.();
        chooser.remove();
        strategyOwnershipChooser = null;
      });
      chooser.append(cancel);
      editor.append(chooser);
      strategyOwnershipChooser = chooser;
    }

    function renderEditor(placePreview = false) {
      editor?.remove?.();
      editor = manualUiApi.renderEditor(document, draft, {
        chooseAction(optionType, direction) {
          draft = manualUiApi.chooseAction(draft, optionType, direction);
          renderEditor(true);
        },
        setLots(lots) {
          draft = manualUiApi.setLots(draft, lots);
          renderEditor(true);
        },
        setPremium(premium) {
          draft = manualUiApi.setPremium(draft, premium);
          if (manualEditorOriginIsCurrent(origin)) manualEditor.draft = draft;
          manualUiApi.updateEditorState?.(editor, draft, { preservePremiumInput: true });
          syncCommitControls();
          void controller?.place();
        },
        async save() {
          if (!manualUiApi.validateDraft(draft).ok) return;
          const priorEntryId = draft.id || null;
          const entryToSave = manualUiApi.entryFromDraft(draft, {
            id: crypto.randomUUID(),
            now: new Date().toISOString()
          });
          if (priorEntryId) await commitManualStrategy({
            id: crypto.randomUUID(),
            type: "EDIT",
            entryId: priorEntryId,
            entry: entryToSave
          });
          else requestStrategyOwnership(entryToSave);
        },
        async remove() {
          if (!draft.id) return;
          await commitManualStrategy({
            id: crypto.randomUUID(),
            type: "REMOVE",
            entryId: draft.id
          });
        },
        close() {
          closeManualEditor();
          renderManualRows([strike]);
          focusManualRow(strike);
          void controller?.place();
        }
      });
      editor.dataset.strike = String(strike);
      rowElement.classList.add("has-manual-editor");
      rowElement.setAttribute("aria-hidden", "true");
      rowElement.setAttribute("tabindex", "-1");
      rootNode().append(editor);
      manualEditor = { strike, element: editor, rowElement, draft, ...origin };
      positionManualEditor();
      syncCommitControls();
      if (placePreview) void controller?.place();
    }

    closeManualEditor();
    renderEditor(true);
    if (context?.focusEditor) editor?.querySelector?.(".nifty-manual-editor__action")?.focus?.();
  }

  function riskRoot() {
    const node = rootNode();
    let risk = node.querySelector("#nifty-seller-risk");
    if (risk) return risk;
    risk = document.createElement("div");
    risk.id = "nifty-seller-risk";
    node.append(risk);
    return risk;
  }

  function clearRisk() {
    document.getElementById("nifty-seller-risk")?.remove();
  }

  function placeRisk(view, toY, _membership, layout) {
    const canvas = chartCanvas();
    if (!canvas || typeof toY !== "function") {
      clearRisk();
      return false;
    }
    const rect = canvas.getBoundingClientRect();
    const layers = riskOverlayApi.buildRiskLayers({
      ...view,
      activeStrategyId: settings.selectedStrategyId || view?.strategyId,
      activeExpiry: settings.expiry
    }, toY, rect, layout);
    clearRisk();
    if (!layers.lines.length && !layers.bands.length) return false;
    const node = riskRoot();
    node.dataset.status = layers.status;
    layers.bands.forEach((band) => {
      const element = document.createElement("div");
      element.className = riskBandClassName(band);
      element.dataset.riskLayer = band.layer;
      element.style.left = `${band.left}px`;
      element.style.top = `${band.top}px`;
      element.style.width = `${band.right - band.left}px`;
      element.style.height = `${band.bottom - band.top}px`;
      node.append(element);
    });
    layers.lines.forEach((line) => {
      const element = document.createElement("div");
      element.className = `nifty-seller-risk__line is-${line.layer}`;
      element.dataset.riskLayer = line.layer;
      element.style.left = `${line.left}px`;
      element.style.top = `${line.y}px`;
      element.style.width = `${line.right - line.left}px`;
      const label = document.createElement("span");
      label.className = "nifty-seller-risk__label";
      label.style.left = `${line.labelRight - line.left}px`;
      label.textContent = line.label;
      element.append(label);
      node.append(element);
    });
    return true;
  }

  function chartCanvas() {
    return document.querySelector('canvas[aria-label^="Chart for"]');
  }

  async function captureAxisScale(signal, options = {}) {
    const canvas = chartCanvas();
    if (!canvas) throw new Error("TradingView chart canvas is unavailable.");
    const expectedTimeframe = options.timeframe || null;
    const canvasTimeframe = timeframeApi.timeframeKey(canvas.getAttribute("aria-label") || "");
    if (expectedTimeframe && canvasTimeframe !== expectedTimeframe) {
      throw new Error("TradingView timeframe changed during axis capture.");
    }
    const rect = canvas.getBoundingClientRect();
    let axisCandidates = [];
    let acceptedObservedAt = 0;
    let acceptedObservationSignature = null;
    let acceptedStableCount = 0;
    try {
      const observed = JSON.parse(document.documentElement.getAttribute("data-nifty-axis-ticks") || "null");
      const observedAt = Number(observed?.at);
      const minimumObservedAt = Number(options.minimumObservedAt) || 0;
      const observedTimeframe = timeframeApi.timeframeKey(observed?.sourceLabel || "");
      const stableEnough = !options.requireStable || Number(observed?.stableCount) >= 2;
      if (observedAt >= minimumObservedAt
        && (!expectedTimeframe || observedTimeframe === expectedTimeframe)
        && stableEnough
        && Array.isArray(observed?.candidates)) {
        axisCandidates = observed.candidates;
        acceptedObservedAt = observedAt;
        acceptedObservationSignature = observed.signature || null;
        acceptedStableCount = Number(observed.stableCount) || 0;
      }
    } catch {
      // Missing or malformed observation fails closed in background capture.
    }
    const result = await chrome.runtime.sendMessage({
      type: "CAPTURE_AXIS_SCALE",
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      plotRect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      axisCandidates
    });
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (expectedTimeframe
      && timeframeApi.timeframeKey(chartCanvas()?.getAttribute("aria-label") || "") !== expectedTimeframe) {
      throw new Error("TradingView timeframe changed during axis capture.");
    }
    if (!result?.ok) throw new Error(result?.error || "TradingView axis capture failed.");
    return {
      ...result,
      observedAt: acceptedObservedAt,
      observationSignature: acceptedObservationSignature,
      observationStableCount: acceptedStableCount
    };
  }

  function axisObservationAt() {
    try {
      const observed = JSON.parse(document.documentElement.getAttribute("data-nifty-axis-ticks") || "null");
      const observedAt = Number(observed?.at);
      return Number.isFinite(observedAt) ? observedAt : 0;
    } catch {
      return 0;
    }
  }

  async function fetchChain(expiry, signal) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const result = await chrome.runtime.sendMessage({ type: "FETCH_NIFTY_CHAIN", expiry });
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (!result?.ok) throw new Error(result?.error || "Option chain unavailable.");
    return result.chain;
  }

  function placeRows(rows, membership, toY, visualPlacementRevision) {
    if (!visualPlacementIsCurrent(visualPlacementRevision)) return false;
    const canvas = chartCanvas();
    if (!canvas) {
      concealRows("TRADINGVIEW CHART UNAVAILABLE");
      return false;
    }
    const rect = canvas.getBoundingClientRect();
    const node = rootNode();
    const layout = rowLaneLayout(rows, membership?.atm, membership?.interval);
    if (!layout) {
      throw new Error(priceScaleFailure("overlap"));
    }
    const elements = rows.map((row) => ({
      row,
      element: node.querySelector(`.nifty-axis-ladder__row[data-strike="${row.strike}"]`)
    }));
    const offGridElements = [...node.querySelectorAll(".nifty-axis-ladder__off-grid")];
    const offGridTitle = node.querySelector(".nifty-axis-ladder__off-grid-title");
    if (elements.some(({ element }) => !element)) {
      concealRows("EXACT STRIKE ROWS UNAVAILABLE");
      return false;
    }
    const priorVisibility = node.style.visibility;
    node.hidden = false;
    node.style.visibility = "hidden";
    elements.forEach(({ element }) => { element.hidden = false; });
    try {
      const dimensions = elements.map(({ element }) => {
        const bounds = element.getBoundingClientRect();
        return { width: bounds.width, height: bounds.height };
      });
      const laneOffset = Math.ceil(Math.max(...dimensions.map(({ width }) => width))) + 10;
      const baseRight = Math.max(0, window.innerWidth - rect.right + 7);
      const nativeAxisPrices = (membership?.axisPrices || []).map(Number).filter(Number.isFinite);
      const nativeAxisTolerance = Math.max(1e-9, Math.abs(Number(membership?.atmStep) || 1) * 1e-7);
      const axisVisibleStrikes = new Set((membership?.rows || [])
        .map((row) => Number(row?.strike))
        .filter((strike) => Number.isFinite(strike)
          && nativeAxisPrices.some((price) => Math.abs(price - strike) <= nativeAxisTolerance)));
      const visibleIndexes = visibleRowIndexes(
        rows,
        dimensions,
        rect,
        window.innerWidth,
        baseRight,
        layout.lanes,
        laneOffset
      ).filter((index) => axisVisibleStrikes.has(rows[index].strike));
      if (!visibleIndexes.length) {
        throw new Error(priceScaleFailure("outside"));
      }
      const visibleIndexSet = new Set(visibleIndexes);
      const renderedStrikes = visibleIndexes.map((index) => Number(rows[index].strike));
      reconcileBreakEvenSelection(rows, new Set(renderedStrikes));
      const displayAtm = displayAtmStrike(renderedStrikes, membership?.atm);
      elements.forEach(({ row, element }, index) => {
        element.hidden = !visibleIndexSet.has(index);
        if (element.hidden) return;
        element.classList.toggle("is-atm", Number(row.strike) === Number(displayAtm));
        const lane = layout.lanes[index];
        element.dataset.lane = String(lane);
        element.style.setProperty("--nifty-lane-offset", `${laneOffset}px`);
        element.style.setProperty("--nifty-connector-width", `${lane * laneOffset}px`);
        element.style.right = `${baseRight + lane * laneOffset}px`;
        element.style.top = `${row.y}px`;
        element.style.zIndex = element.classList.contains("has-lot-badges")
          ? String(100 + Math.round(row.y))
          : "";
      });
      premiumChartPlacement = { toY, plotRect: rect };
      const premiumState = premiumHistoryPane?.state?.();
      renderPremiumStrikeMap(premiumState);
      const skylinePainted = renderPremiumChartTrials(premiumState);
      renderPremiumHistoryStatus(premiumState, skylinePainted);
      positionManualEditor();
      const laneZeroRows = elements
        .filter(({ element }, index) => !element.hidden && layout.lanes[index] === 0)
        .map(({ element }) => element);
      const labelRight = riskLabelLayout(laneZeroRows)?.labelRight ?? rect.right;
      const rowLeft = Math.min(...laneZeroRows.map((element) => element.getBoundingClientRect().left));
      let visibleOffGridCount = 0;
      offGridElements.forEach((element, index) => {
        const y = toY(Number(element.dataset.strike));
        const visible = Number.isFinite(y) && y >= rect.top && y <= rect.bottom;
        element.hidden = !visible;
        if (!visible) return;
        visibleOffGridCount += 1;
        const sameStrikeIndex = offGridElements.slice(0, index)
          .filter((candidate) => candidate.dataset.strike === element.dataset.strike && !candidate.hidden).length;
        element.style.right = `${Math.max(0, window.innerWidth - rowLeft + 4)}px`;
        element.style.top = `${y + sameStrikeIndex * 18}px`;
      });
      if (offGridTitle) {
        offGridTitle.hidden = visibleOffGridCount === 0;
        offGridTitle.style.right = `${Math.max(0, window.innerWidth - rowLeft + 4)}px`;
        offGridTitle.style.top = `${rect.top + 6}px`;
      }
      const strategyLabelRight = Math.min(labelRight, rowLeft - EDGE_STACK_GAP_PX);
      const chartStrategies = activeChartStrategies();
      const railDecorations = sharedRailDecorations(toY, rect, {
        includeManual: chartStrategies.length === 0
      });
      if (chartStrategies.length) {
        clearManualPlanRails(visualPlacementRevision);
        placeStrategyRails(toY, rect, strategyLabelRight, visualPlacementRevision, {
          visibleStrikes: renderedStrikes,
          atm: displayAtm
        });
        const estimatedQuickLabelRight = breakEvenLabelRight(strategyLabelRight, rect, window.innerWidth,
          brokerPositionSpineModels(originalStrategyModels()).length > 0);
        const quickLabelRight = breakEvenLabelRightForRenderedBlockers(
          estimatedQuickLabelRight,
          rect,
          renderedStrategyBlockerRects(document.getElementById("nifty-strategy-rails")),
          POSITION_LANE_GAP_PX
        );
        placeBreakEvenRails(toY, rect, quickLabelRight, railDecorations.quick, visualPlacementRevision);
      } else {
        clearStrategyRails();
        placeBreakEvenRails(toY, rect, strategyLabelRight, railDecorations.quick, visualPlacementRevision);
        placeManualPlanRails(toY, rect, strategyLabelRight, railDecorations.manual, visualPlacementRevision);
      }
      return { riskLayout: { labelRight } };
    } catch (error) {
      clearBreakEvenRails(visualPlacementRevision);
      clearManualPlanRails(visualPlacementRevision);
      clearStrategyRails();
      elements.forEach(({ element }) => { element.hidden = true; });
      offGridElements.forEach((element) => { element.hidden = true; });
      if (offGridTitle) offGridTitle.hidden = true;
      throw error;
    } finally {
      node.style.visibility = priorVisibility;
    }
  }

  function clearRetries() {
    retryTimers.forEach(clearTimeout);
    retryTimers = [];
  }

  function requestPlacementRetries() {
    clearRetries();
    retryTimers = RETRY_DELAYS.map((delay) => setTimeout(async () => {
      if (!settings.enabled || !controller?.membership()) return;
      await controller.place();
    }, delay));
  }

  async function rebuildCurrent(force = false, allowDataFetch = false) {
    const label = chartCanvas()?.getAttribute("aria-label") || "";
    currentLabel = label;
    if (!isNiftyChartLabel(label)) {
      clearRetries();
      closePremiumHistory();
      invalidatePremiumHistoryPlacement();
      clearBreakEvenSelection();
      clearStrategyPreview();
      clearManualTransientState();
      clearManualPlanRails();
      controller.invalidate();
      document.getElementById(LABELS_ID)?.remove();
      return false;
    }
    if (!controller.hasCachedChain() && !allowDataFetch) return false;
    const timeframe = timeframeApi.timeframeKey(label);
    if (!timeframe) return controller.syncTimeframe(label);
    const didRebuild = force ? await controller.rebuild(timeframe) : await controller.syncTimeframe(label);
    if (didRebuild) requestPlacementRetries();
    return didRebuild;
  }

  function scheduleTimeframeCheck() {
    if (timeframeTimer !== null) return;
    clearManualTransientState();
    premiumHistoryPane?.setTimeAxis?.(null);
    if (premiumHistoryPane?.state?.()?.selection) setPremiumTimeSync(document, true);
    const nextTimeframe = timeframeApi.timeframeKey(chartCanvas()?.getAttribute("aria-label") || "");
    const membership = controller?.membership();
    if (membership && nextTimeframe !== membership.timeframe) concealRows("CALIBRATING");
    timeframeTimer = setTimeout(async () => {
      timeframeTimer = null;
      const label = chartCanvas()?.getAttribute("aria-label") || "";
      const latestMembership = controller?.membership();
      if (label !== currentLabel || !latestMembership) await rebuildCurrent(false);
      else await controller.place();
      syncPremiumHistoryTimeframe(label);
    }, 250);
  }

  function scheduleAxisPlacement() {
    axisPlacementPreserveMembership = axisPlacementPreserveMembership
      || viewportResizeActive;
    if (axisPlacementTimer !== null) return;
    axisPlacementTimer = setTimeout(async () => {
      const preserveMembership = axisPlacementPreserveMembership || viewportResizeActive;
      axisPlacementPreserveMembership = false;
      axisPlacementTimer = null;
      if (!settings.enabled) return;
      const membership = controller?.membership();
      const timeframe = timeframeApi.timeframeKey(chartCanvas()?.getAttribute("aria-label") || "");
      if (!membership || timeframe !== membership.timeframe) {
        await rebuildCurrent(false);
        return;
      }
      await (preserveMembership ? controller.remap() : controller.place());
    }, 100);
  }

  function handleViewportResize() {
    viewportResizeActive = true;
    axisPlacementPreserveMembership = true;
    clearTimeout(viewportResizeTimer);
    scheduleAxisPlacement();
    viewportResizeTimer = setTimeout(() => {
      viewportResizeTimer = null;
      axisPlacementPreserveMembership = true;
      scheduleAxisPlacement();
      viewportResizeActive = false;
    }, VIEWPORT_RESIZE_SETTLE_MS);
  }

  function handleRuntimeMutations(records) {
    const nextUrl = String(root.location?.href || "");
    if (nextUrl !== currentUrl) {
      currentUrl = nextUrl;
      manualRowsConcealed = true;
      closePremiumHistory();
      invalidatePremiumHistoryPlacement();
      clearBreakEvenSelection();
      clearStrategyPreview();
      clearManualTransientState();
      clearManualPlanRails();
    }
    if (records.some((record) => record.type === "attributes" && record.attributeName === "data-nifty-axis-ticks")) {
      scheduleAxisPlacement();
    }
    if (records.some((record) => record.type === "attributes" && record.attributeName === "data-options-time-axis")) {
      premiumHistoryPane?.setTimeAxis?.(currentPremiumTimeAxis());
    }
    const label = chartCanvas()?.getAttribute("aria-label") || "";
    if (label !== currentLabel) scheduleTimeframeCheck();
  }

  function handleUrlNavigation() {
    currentUrl = String(root.location?.href || "");
    manualRowsConcealed = true;
    closePremiumHistory();
    invalidatePremiumHistoryPlacement();
    clearBreakEvenSelection();
    clearStrategyPreview();
    clearManualTransientState();
    clearManualPlanRails();
  }

  function handlePageHide() {
    manualRowsConcealed = true;
    closePremiumHistory();
    invalidatePremiumHistoryPlacement();
    clearBreakEvenSelection();
    clearStrategyPreview();
    clearManualTransientState();
    clearManualPlanRails();
  }

  function handleDocumentPointerDown(event) {
    if (event.target?.closest?.(`#${PREMIUM_HISTORY_STATUS_ID}`)) return;
    const insideEdgeStack = event.target?.closest?.(".nifty-edge-stack__group")
      || event.target?.closest?.(".nifty-edge-stack__selector")
      || event.target?.closest?.(".nifty-edge-stack__flyout");
    const insidePositionGroup = event.target?.closest?.(".nifty-position-spine__cluster")
      || event.target?.closest?.(".nifty-position-spine__cluster-flyout");
    const insideBrokerCard = event.target?.closest?.(".nifty-position-spine__card");
    const ladderBrokerBadge = event.target?.closest?.(".nifty-axis-ladder__badge");
    const insideBrokerControl = event.target?.closest?.(".nifty-position-spine__compact")
      || event.target?.closest?.(".nifty-position-spine__marker")
      || event.target?.closest?.(".nifty-position-spine__compact-select")
      || ladderBrokerBadge?.dataset?.source === "BROKER_POSITION";
    if (openedEdgeGroupKey && !insidePositionGroup) {
      collapseOpenedPositionGroup();
      return;
    }
    const outsideStrategyCard = !event.target?.closest?.(".nifty-strategy__card")
      && !insideBrokerCard
      && !insideBrokerControl
      && !insideEdgeStack
      && !insidePositionGroup;
    if (event.target?.closest?.(".nifty-manual-plan__label.is-flippable")) {
      if (outsideStrategyCard) collapseOpenedStrategyDetails();
      return;
    }
    collapseExpandedManualRailDisclosure();
    if (event.target?.closest?.(".nifty-manual-editor")) {
      if (outsideStrategyCard) collapseOpenedStrategyDetails();
      return;
    }
    const row = event.target?.closest?.(".nifty-axis-ladder__row");
    if (!row && outsideStrategyCard) {
      closePremiumHistory();
      clearManualTransientState({ restorePlanRails: true });
      clearBreakEvenSelection({ repaintStrategyRails: true });
    }
    if (outsideStrategyCard) collapseOpenedStrategyDetails();
  }

  function handleQuickSelection(snapshot) {
    const strike = Number(snapshot?.strike);
    if (!Number.isFinite(strike)) return;
    if (breakEvenSelection.current()?.strike === strike) {
      clearBreakEvenSelection({ repaintStrategyRails: true });
      return;
    }
    clearBreakEvenRails();
    if (!breakEvenSelection.select(snapshot)) {
      showStatus("OPTION PRICE UNAVAILABLE");
      return;
    }
    clearBreakEvenStatusOverride();
    void controller?.place();
  }

  function manualRowContext(rowElement) {
    const strike = Number(rowElement?.dataset?.strike);
    const liveRow = controller?.membership()?.rows.find((row) => row.strike === strike);
    if (!Number.isFinite(strike) || !liveRow) return null;
    return { strike, entries: manualEntriesByStrike().get(strike) || [], liveRow };
  }

  function handleLadderClick(event) {
    if (event.target?.closest?.(".nifty-manual-editor")) return;
    const context = manualRowContext(event.target?.closest?.(".nifty-axis-ladder__row"));
    if (!context) return;
    if (event.target?.closest?.(".nifty-axis-ladder__strike-face")) {
      event.preventDefault?.();
      event.stopPropagation?.();
      closeManualEditorForOtherRow(context.strike);
      void openPremiumHistory(context.strike);
      return;
    }
    closeManualEditorForOtherRow(context.strike);
    const badge = event.target?.closest?.(".nifty-axis-ladder__badge");
    const entryId = badge?.dataset?.entryId;
    if (badge?.dataset?.source === "BROKER_POSITION") {
      event.preventDefault?.();
      event.stopPropagation?.();
      if (entryId) openBrokerEntryDetails(entryId);
      return;
    }
    if (entryId) {
      event.preventDefault?.();
      event.stopPropagation?.();
      resetStrategyInteractionState();
      clearBreakEvenSelection({ repaintStrategyRails: true });
      openManualEditor({ ...context, entryId });
      return;
    }
    const interaction = ensureManualInteraction();
    if (interaction) interaction.click(context); else handleQuickSelection(context.liveRow);
  }

  function handleLadderDoubleClick(event) {
    if (event.target?.closest?.(".nifty-manual-editor")) return;
    if (event.target?.closest?.(".nifty-axis-ladder__strike-face")) return;
    const context = manualRowContext(event.target?.closest?.(".nifty-axis-ladder__row"));
    if (!context) return;
    const badge = event.target?.closest?.(".nifty-axis-ladder__badge");
    if (badge?.dataset?.source === "BROKER_POSITION") {
      event.preventDefault?.();
      event.stopPropagation?.();
      if (badge.dataset.entryId) openBrokerEntryDetails(badge.dataset.entryId);
      return;
    }
    if (badge?.dataset?.entryId) {
      event.preventDefault?.();
      event.stopPropagation?.();
      closeManualEditorForOtherRow(context.strike);
      resetStrategyInteractionState();
      clearBreakEvenSelection({ repaintStrategyRails: true });
      openManualEditor({ ...context, entryId: badge.dataset.entryId });
      return;
    }
    const optionType = event.target?.closest?.(".nifty-axis-ladder__cell")?.dataset?.optionType;
    closeManualEditorForOtherRow(context.strike);
    ensureManualInteraction()?.doubleClick({
      ...context,
      optionType: ["CALL", "PUT"].includes(optionType) ? optionType : "CALL"
    });
  }

  function handleDocumentKeyDown(event) {
    if (event.key === "Escape") {
      const editorStrike = manualEditor?.strike;
      clearManualTransientState({ restorePlanRails: true });
      clearBreakEvenSelection({ repaintStrategyRails: true });
      if (Number.isFinite(editorStrike)) focusManualRow(editorStrike);
      return;
    }
    if (event.target?.closest?.(".nifty-manual-editor")) return;
    const row = event.target?.closest?.(".nifty-axis-ladder__row");
    if (event.key === "Enter" && event.shiftKey && row) {
      event.preventDefault();
      const context = manualRowContext(row);
      if (!context) return;
      closeManualEditorForOtherRow(context.strike);
      ensureManualInteraction()?.doubleClick({ ...context, focusEditor: true });
      return;
    }
    if (!["Enter", " "].includes(event.key) || !row) return;
    event.preventDefault();
    handleLadderClick(event);
  }

  function start() {
    if (controller) return;
    controller = createLadderController({
      expiry: settings.expiry,
      activeTimeframe: () => timeframeApi.timeframeKey(chartCanvas()?.getAttribute("aria-label") || ""),
      axisObservationAt,
      beginVisualPlacement,
      currentVisualPlacementRevision: () => railVisualRevision,
      isVisualPlacementCurrent: visualPlacementIsCurrent,
      captureAxisScale,
      fetchChain,
      hideRows,
      concealRows,
      hideRisk: clearRisk,
      placeRows,
      placeRisk,
      renderRows,
      activeStrikes: activeTradeStrikes,
      riskView: settings.sellerSafetyChartView || settings.sellerSafetyView,
      chainSnapshot: settings.sellerSafetyChain,
      chainSnapshotsByExpiry: settings.sellerSafetyChainsByExpiry,
      setStatus: showStatus
    });
    currentLabel = chartCanvas()?.getAttribute("aria-label") || "";
    currentUrl = String(root.location?.href || "");
    runtimeObserver = new MutationObserver(handleRuntimeMutations);
    runtimeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["aria-label", "data-nifty-axis-ticks", "data-options-time-axis"],
      childList: true,
      subtree: true
    });
    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    rootNode().addEventListener("click", handleLadderClick);
    rootNode().addEventListener("dblclick", handleLadderDoubleClick);
    document.addEventListener("keydown", handleDocumentKeyDown);
    root.addEventListener?.("resize", handleViewportResize);
    root.addEventListener?.("pagehide", handlePageHide);
    root.addEventListener?.("popstate", handleUrlNavigation);
    root.addEventListener?.("hashchange", handleUrlNavigation);
    root.navigation?.addEventListener?.("navigate", handleUrlNavigation);
    if (controller.hasCachedChain()) void rebuildCurrent(false);
  }

  function stop() {
    setPremiumTimeSync(document, false);
    premiumHistoryPane?.destroy?.();
    premiumHistoryPane = null;
    clearPremiumStrikeMap();
    clearPremiumChartTrials();
    clearPremiumHistoryStatus();
    premiumChartPlacement = null;
    clearBreakEvenSelection();
    clearStrategyPreview();
    clearManualTransientState();
    clearManualPlanRails();
    document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
    document.getElementById(LABELS_ID)?.removeEventListener("click", handleLadderClick);
    document.getElementById(LABELS_ID)?.removeEventListener("dblclick", handleLadderDoubleClick);
    document.removeEventListener("keydown", handleDocumentKeyDown);
    root.removeEventListener?.("resize", handleViewportResize);
    root.removeEventListener?.("pagehide", handlePageHide);
    root.removeEventListener?.("popstate", handleUrlNavigation);
    root.removeEventListener?.("hashchange", handleUrlNavigation);
    root.navigation?.removeEventListener?.("navigate", handleUrlNavigation);
    clearTimeout(timeframeTimer);
    timeframeTimer = null;
    clearTimeout(axisPlacementTimer);
    axisPlacementTimer = null;
    clearTimeout(viewportResizeTimer);
    viewportResizeTimer = null;
    viewportResizeActive = false;
    axisPlacementPreserveMembership = false;
    clearRetries();
    runtimeObserver?.disconnect();
    runtimeObserver = null;
    controller?.invalidate();
    controller = null;
    document.getElementById(LABELS_ID)?.remove();
  }

  chrome.storage.local.get(DEFAULTS, (stored) => {
    const loaded = { ...DEFAULTS, ...stored };
    settings = sellerViewIdentityApi.normalizeStoredRiskViews(loaded);
    settings.manualPlans = normalizeManualPlans(loaded.manualPlans);
    settings.strategyBook = normalizeStrategyBook(loaded.strategyBook);
    if (settings.sellerSafetyChartView !== loaded.sellerSafetyChartView) {
      chrome.storage.local.set?.({ sellerSafetyChartView: settings.sellerSafetyChartView });
    }
    if (settings.enabled) start();
    void synchronizeStrategyLifecycle();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.uiTheme) {
      settings.uiTheme = changes.uiTheme.newValue === "light" ? "light" : "dark";
      const node = document.getElementById(LABELS_ID);
      if (node) node.dataset.theme = settings.uiTheme;
      const historyState = premiumHistoryPane?.state?.();
      if (historyState) premiumHistoryPane.setMode(historyState.mode);
    }
    if (changes.enabled) {
      settings.enabled = Boolean(changes.enabled.newValue);
      if (settings.enabled) start(); else stop();
    }
    if (changes.sellerSafetyChainsByExpiry) {
      settings.sellerSafetyChainsByExpiry = changes.sellerSafetyChainsByExpiry.newValue || {};
      if (settings.enabled) controller?.setChainSnapshots(settings.sellerSafetyChainsByExpiry);
    }
    if (changes.sellerSafetyChain) settings.sellerSafetyChain = changes.sellerSafetyChain.newValue || null;
    if (changes.manualPlans) {
      settings.manualPlans = normalizeManualPlans(changes.manualPlans.newValue);
      discardStoredInteractionIdentities();
      if (!changes.strategyBook) void renderStorageManualPlans();
    }
    if (changes.brokerConnection) {
      settings.brokerConnection = changes.brokerConnection.newValue || null;
      discardStoredInteractionIdentities();
      clearStrategyRails();
      if (settings.enabled) void renderStorageStrategyBook();
    }
    if (changes.strategyBook) {
      settings.strategyBook = normalizeStrategyBook(changes.strategyBook.newValue);
      discardStoredInteractionIdentities();
      clearStrategyRails();
      if (settings.enabled) void renderStorageStrategyBook();
    }
    if (changes.expiry) {
      closePremiumHistory();
      invalidatePremiumHistoryPlacement();
      clearBreakEvenSelection();
      clearStrategyPreview();
      clearManualTransientState();
      settings.expiry = changes.expiry.newValue || DEFAULTS.expiry;
      void expireDueStrategies();
      if (settings.enabled) {
        controller?.setExpiry(settings.expiry).then((hasCached) => {
          const activeSnapshotAccepted = settings.sellerSafetyChain
            ? controller?.setChainSnapshot(settings.sellerSafetyChain)
            : false;
          if (hasCached || activeSnapshotAccepted) {
            controller.rebuild(timeframeApi.timeframeKey(chartCanvas()?.getAttribute("aria-label") || ""))
              .then((rebuilt) => { if (rebuilt) requestPlacementRetries(); });
          }
        });
      }
    } else if (changes.sellerSafetyChain && settings.enabled && controller?.setChainSnapshot(settings.sellerSafetyChain)) {
      controller.rebuild(timeframeApi.timeframeKey(chartCanvas()?.getAttribute("aria-label") || ""))
        .then((rebuilt) => { if (rebuilt) requestPlacementRetries(); });
    }
    applyRiskStorageChanges(changes, area, settings, controller);
  });

  chrome.runtime.onMessage?.addListener((message, _sender, sendResponse) => {
    if (!["CLEAR_BREAK_EVEN_SELECTION", "CLEAR_STRATEGY_PREVIEW", "RETRY_LABEL_PLACEMENT", "REFRESH_OPTION_NUMBERS", "GET_STRATEGY_PREVIEW_STATE", "OPEN_STRATEGY_ON_CHART"].includes(message?.type)) return false;
    if (message.type === "CLEAR_BREAK_EVEN_SELECTION") {
      clearManualTransientState();
      clearBreakEvenSelection({ repaintStrategyRails: true });
      sendResponse({ ok: true });
      return false;
    }
    if (message.type === "CLEAR_STRATEGY_PREVIEW") {
      clearStrategyPreview();
      void controller?.place();
      sendResponse({ ok: true });
      return false;
    }
    if (message.type === "GET_STRATEGY_PREVIEW_STATE") {
      const identity = currentStrategyIdentity();
      sendResponse({
        ok: true,
        selectedIds: ensureStrategyChartController()?.selected() || [],
        compare: ensureStrategyChartController()?.comparing() || false,
        instrumentKey: identity?.instrumentKey || "",
        underlying: identity?.underlying || "",
        expiry: settings.expiry,
        timeZone: identity?.instrumentKey?.startsWith("NSE") ? "Asia/Kolkata" : "UTC"
      });
      return false;
    }
    if (!settings.enabled) {
      sendResponse({ ok: false, error: "Enable ladder first." });
      return false;
    }
    const label = chartCanvas()?.getAttribute("aria-label") || "";
    if (!isNiftyChartLabel(label)) {
      sendResponse({ ok: false, error: "Open NIFTY underlying chart first." });
      return false;
    }
    if (message.type === "OPEN_STRATEGY_ON_CHART") {
      const strategy = activeChartStrategies().find((candidate) => candidate.id === message.strategyId);
      if (!strategy) {
        sendResponse({ ok: false, error: "Saved strategy is not available for active chart expiry." });
        return false;
      }
      ensureStrategyChartController()?.label(strategy.id);
      void controller?.place();
      sendResponse({ ok: true });
      return false;
    }
    if (message.type === "REFRESH_OPTION_NUMBERS") {
      clearBreakEvenSelection();
      clearStrategyPreview();
      clearManualTransientState({ invalidatePlacements: false });
      clearManualPlanRails();
      const refresh = controller?.membership() ? controller.refreshLtp() : rebuildCurrent(true, true);
      refresh.then((ok) => sendResponse(ok
        ? { ok: true, chain: controller.chain() }
        : { ok: false, error: "Option-number refresh failed. Existing numbers were kept." }))
        .catch((error) => sendResponse({ ok: false, error: error?.message || "Option-number refresh failed." }));
      return true;
    }
    if (!controller?.membership()) {
      sendResponse({ ok: false, error: "Press refresh option numbers first." });
      return false;
    }
    controller.place().then((ok) => {
      if (!ok) requestPlacementRetries();
      sendResponse(ok
        ? { ok: true }
        : { ok: false, error: "Axis capture unavailable. Automatic retries started." });
    }).catch((error) => sendResponse({ ok: false, error: error?.message || "Exact-axis retry failed." }));
    return true;
  });
})(typeof globalThis === "undefined" ? this : globalThis);
