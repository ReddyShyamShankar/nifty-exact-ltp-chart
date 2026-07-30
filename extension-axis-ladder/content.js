(function (root) {
  "use strict";

  const RETRY_DELAYS = [0, 250, 650, 1200];
  const LABELS_ID = "nifty-axis-ladder";
  const RISK_LABEL_GAP_PX = 12;
  const BREAK_EVEN_LABEL_HEIGHT = 15;
  const SELLER_SAFETY_STALE_MS = 15 * 60 * 1000;
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
  const DEFAULTS = {
    enabled: false,
    uiTheme: "dark",
    expiry: "current_month",
    labelCount: "5",
    panelOpen: false,
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

  function freezeMembership({ timeframe, expiry, interval, nativeInterval = interval, axisPrices, spot, chainRows, tieDirection = "up" }) {
    const selection = timeframeApi.selectAxisAlignedRows(chainRows, spot, axisPrices, undefined, tieDirection);
    if (!selection?.rows?.length) return null;
    const rows = selection.rows.map((row) => Object.freeze({
      strike: Number(row.strike),
      call: quote(row.call),
      put: quote(row.put)
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
      rows: Object.freeze(rows)
    });
  }

  function refreshMembership(membership, chainRows) {
    if (!membership || !Array.isArray(chainRows)) return membership;
    const byStrike = new Map(chainRows.map((row) => [Number(row?.strike), row]));
    const rows = membership.rows.map((row) => {
      const live = byStrike.get(row.strike);
      if (!live) return row;
      return Object.freeze({
        strike: row.strike,
        call: quote(live.call),
        put: quote(live.put)
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

  function refreshMembershipAtSpot(membership, chainRows, spot, tieDirection = "up") {
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
        tieDirection
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
        || !Number.isFinite(Number(snapshot.spot))
        || !Array.isArray(snapshot.rows)
        || snapshot.rows.length < 1
        || snapshot.rows.some((row) => !Number.isFinite(Number(row?.strike)))
        || new Set(snapshot.rows.map((row) => Number(row.strike))).size !== snapshot.rows.length) return null;
      return {
        version: 1,
        updatedAt: snapshot.updatedAt,
        expiry: snapshot.expiry,
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
          chainRows: chain.rows
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
          ? refreshMembershipAtSpot(membership, chain?.rows, spot, direction)
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

    async function place(visualPlacementRevision) {
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
        const axisMembership = freezeMembership({
          timeframe: latestMembership.timeframe,
          expiry: latestMembership.expiry,
          interval: nativeInterval,
          nativeInterval,
          axisPrices: scale.axisPairs.map((pair) => Number(pair.price)),
          spot: Number(cachedChain?.spot ?? latestMembership.atm),
          chainRows: cachedChain?.rows || latestMembership.rows
        });
        if (!axisMembership) throw new Error("Visible axis contracts are unavailable.");
        const membershipChanged = !sameStrikes(latestMembership, axisMembership);
        current = axisMembership;
        if (membershipChanged) renderRows(current.rows, current);
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
    rowsFitPlot,
    strategyOwnershipChoices,
    chartInstrumentIdentity,
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
  let strategyOwnershipChooser = null;

  function collapseExpandedManualRailDisclosure() {
    const active = expandedManualRailDisclosure;
    expandedManualRailDisclosure = null;
    active?.collapse?.();
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
    return manualPlanApi.entriesFor(settings.manualPlans, settings.expiry);
  }

  function manualEntriesByStrike() {
    return manualPlanApi.groupByStrike(manualEntriesForExpiry());
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
    if (top) manualEditor.element.style.top = top;
    if (right) manualEditor.element.style.right = right;
  }

  function ensureManualInteraction() {
    if (manualInteraction || !manualInteractionApi?.createController) return manualInteraction;
    manualInteraction = manualInteractionApi.createController({
      delay: 240,
      setTimer: (callback, delay) => setTimeout(callback, delay),
      clearTimer: (timer) => clearTimeout(timer),
      onQuick: ({ strike, liveRow }) => {
        closeManualEditorForOtherRow(strike);
        handleQuickSelection(liveRow);
      },
      onFace: ({ strike }) => {
        closeManualEditorForOtherRow(strike);
        clearBreakEvenSelection();
        renderManualRows([strike]);
        void controller?.place();
      },
      onEditor: (context) => {
        closeManualEditorForOtherRow(context?.strike);
        clearBreakEvenSelection();
        openManualEditor(context);
      },
      onReset: () => renderManualRows()
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
    element.setAttribute("aria-pressed", String(isSelected));
    element.hidden = false;
  }

  function renderRows(rows, membership) {
    closeManualEditor();
    const node = rootNode();
    const existing = new Map([...node.querySelectorAll(".nifty-axis-ladder__row")]
      .map((row) => [Number(row.dataset.strike), row]));
    const entriesByStrike = manualEntriesByStrike();
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
        openedStrategyId = strategyId;
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

  function clearStrategyPreview() {
    openedStrategyId = null;
    strategyOwnershipChooser?.remove?.();
    strategyOwnershipChooser = null;
    installStrategyChartController();
    clearStrategyRails();
  }

  function currentStrategyIdentity() {
    return chartInstrumentIdentity(chartCanvas()?.getAttribute("aria-label") || "");
  }

  function activeChartStrategies() {
    const identity = currentStrategyIdentity();
    if (!identity || !strategyStoreApi) return [];
    return strategyStoreApi.activeStrategies(settings.strategyBook, identity.instrumentKey, settings.expiry);
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
      const pnl = manualPayoffApi?.positionPnl?.(entry, row, 65);
      const side = entry.optionType === "CALL" ? "C" : "P";
      return {
        text: `${side} ${Number(entry.strike).toLocaleString("en-IN")} ${entry.direction} ×${entry.lots}`,
        pnl: signedApproxRupees(pnl),
        tone: pnl > 0 ? "profit" : pnl < 0 ? "loss" : "flat"
      };
    });
  }

  function originalStrategyModels() {
    return activeChartStrategies().flatMap((strategy) => {
      const entries = strategyStoreApi.legsForStrategy(settings.strategyBook, strategy.id);
      const chargeOffset = knownStrategyCharges(entries) / 65;
      const result = manualPayoffApi?.levels?.(entries, `${strategy.label} BE`, chargeOffset);
      if (result?.status !== "ok") return [];
      const chargesComplete = entries.every((entry) => entry.chargesComplete === true);
      return result.levels.map((level) => ({
        kind: "STRATEGY",
        strategyId: strategy.id,
        strategyLabel: strategy.label,
        exact: level.exact,
        label: level.label,
        selected: ensureStrategyChartController()?.isSelected(strategy.id) || false,
        entries,
        disclosure: chargesComplete ? null : "EXCLUDING UNKNOWN CHARGES"
      }));
    });
  }

  function combinedStrategyModels() {
    const selectedIds = ensureStrategyChartController()?.selected() || [];
    if (selectedIds.length < 2 || !strategyPreviewApi) return { models: [], preview: null };
    const preview = strategyPreviewApi.buildPreview(
      settings.strategyBook,
      selectedIds,
      controller?.membership()?.rows || [],
      {
        lotSize: 65,
        quoteUpdatedAt: controller?.chain()?.updatedAt,
        now: new Date().toISOString(),
        maxQuoteAgeMs: SELLER_SAFETY_STALE_MS
      }
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
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "nifty-strategy-preview__clear";
    clear.textContent = "Clear";
    clear.addEventListener("click", (event) => {
      event.stopPropagation?.();
      clearStrategyPreview();
      void controller?.place();
    });
    bar.append(summary, compare, clear);
    rootNodeValue.append(bar);
  }

  function appendStrategyDetails(card, model) {
    if (model.kind !== "STRATEGY" || openedStrategyId !== model.strategyId) return;
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

  function placeStrategyRails(toY, rect, labelRight, visualPlacementRevision) {
    if (!visualPlacementIsCurrent(visualPlacementRevision) || !strategyChartApi || !strategyStoreApi) return false;
    const originals = originalStrategyModels();
    const selectedIds = ensureStrategyChartController()?.selected() || [];
    const { models: combined, preview } = combinedStrategyModels();
    const showOriginals = selectedIds.length < 2 || strategyChartController.comparing() || !combined.length;
    const models = [...(showOriginals ? originals : []), ...combined];
    if (!models.length) {
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
      projection: strategyChartApi.projectBreakEven(model.exact, axisMap)
    })).filter((model) => model.projection.mode !== "HIDDEN");
    if (!projected.length) {
      clearStrategyRails();
      return false;
    }
    const cards = strategyChartApi.stackCards(projected.map((model) => ({
      id: model.id,
      railY: model.projection.mode === "RAIL" ? model.projection.railY : model.projection.markerY,
      height: 28
    })), { gap: 6, minY: Number(rect.top), maxY: Number(rect.bottom) });
    const cardById = new Map(cards.map((card) => [card.id, card]));
    const rootNodeValue = strategyRailsRoot();
    rootNodeValue.replaceChildren();
    renderStrategyPreviewBar(rootNodeValue, preview, selectedIds.length);
    const cardRight = Math.max(Number(rect.left), Math.min(Number(rect.right), Number(labelRight) || Number(rect.right)));
    projected.forEach((model) => {
      const placement = cardById.get(model.id);
      if (!placement) return;
      const rail = document.createElement("div");
      rail.className = model.projection.mode === "RAIL"
        ? "nifty-strategy__rail"
        : `nifty-strategy__edge is-${String(model.projection.edge).toLowerCase()}`;
      rail.style.top = `${placement.railY}px`;
      rail.style.left = `${rect.left}px`;
      rail.style.width = `${rect.right - rect.left}px`;
      rootNodeValue.append(rail);
      if (placement.connector.moved) {
        const connector = document.createElement("div");
        connector.className = "nifty-strategy__connector";
        connector.style.right = `${window.innerWidth - cardRight}px`;
        connector.style.top = `${Math.min(placement.connector.fromY, placement.connector.toY)}px`;
        connector.style.height = `${Math.abs(placement.connector.toY - placement.connector.fromY)}px`;
        rootNodeValue.append(connector);
      }
      const card = document.createElement("div");
      card.className = `nifty-strategy__card is-${model.kind.toLowerCase()}`;
      card.style.right = `${window.innerWidth - cardRight}px`;
      card.style.top = `${placement.cardY}px`;
      if (model.kind === "STRATEGY") {
        const selector = document.createElement("button");
        selector.type = "button";
        selector.className = "nifty-strategy__selector";
        selector.setAttribute("aria-pressed", String(model.selected));
        selector.setAttribute("aria-label", `${model.strategyLabel} ${model.selected ? "selected" : "not selected"} for combined preview`);
        selector.addEventListener("click", (event) => {
          event.stopPropagation?.();
          strategyChartController.square(model.strategyId);
        });
        const label = document.createElement("button");
        label.type = "button";
        label.className = "nifty-strategy__label";
        label.textContent = `${model.label}${model.projection.mode === "EDGE" ? ` ${model.projection.arrow}` : ""}`;
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
    });
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
    return validDraft
      ? manualUiApi.previewEntries(saved, draft, manualDraftIdentity(draft))
      : saved;
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
        const pnl = manualPayoffApi?.positionPnl?.(entry, row, 65);
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

  function sharedRailDecorations(toY, rect) {
    const quick = quickRailPlacements(toY, rect);
    const manual = manualRailPlacements(toY, rect);
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

  function clearBreakEvenSelection() {
    breakEvenSelection.clear();
    clearBreakEvenRails();
    const node = rootNode();
    node.querySelectorAll(".nifty-axis-ladder__row").forEach((row) => {
      row.classList.remove("is-selected");
      row.setAttribute("aria-pressed", "false");
    });
    clearBreakEvenStatusOverride();
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

  async function persistManualPlans(mutation) {
    let response;
    try {
      response = await chrome.runtime.sendMessage({
        type: "MUTATE_MANUAL_PLANS",
        mutation
      });
    } catch (cause) {
      throw storageWriteFailure(cause);
    }
    if (!response?.ok || !response.manualPlans) {
      throw storageWriteFailure(new Error(response?.error || "Manual plan mutation failed."));
    }
    const normalized = normalizeManualPlans(response.manualPlans);
    settings.manualPlans = normalized;
    return normalized;
  }

  async function persistStrategyCommand(command) {
    const response = await chrome.runtime.sendMessage({ type: "MUTATE_STRATEGY_BOOK", command });
    if (!response?.ok || !response.strategyBook) {
      throw new Error(response?.error || "Strategy mutation failed.");
    }
    settings.strategyBook = normalizeStrategyBook(response.strategyBook);
    return settings.strategyBook;
  }

  function strategyLegFromManualEntry(entry, identity) {
    return {
      ...entry,
      source: "MANUAL",
      instrumentKey: identity.instrumentKey,
      underlying: identity.underlying,
      charges: [],
      chargesComplete: false
    };
  }

  function openManualEditor(context) {
    if (!manualUiApi?.createDraft || !manualUiApi?.renderEditor || !manualPlanApi) return;
    const strike = Number(context?.strike);
    const liveRow = controller?.membership()?.rows.find((row) => row.strike === strike);
    const rowElement = rootNode().querySelector(`.nifty-axis-ladder__row[data-strike="${strike}"]`);
    if (!liveRow || !rowElement) return;
    const entries = manualEntriesByStrike().get(strike) || [];
    const entry = entries.find((item) => item.id === context?.entryId) || null;
    let draft = manualUiApi.createDraft({ expiry: settings.expiry, row: liveRow, entry });
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

    async function commitManualPlan(mutation) {
      if (pendingCommit) return;
      pendingCommit = true;
      syncCommitControls();
      try {
        await persistManualPlans(mutation);
        if (manualEditorOriginIsCurrent(origin)) {
          closeManualEditor();
          focusManualRow(strike);
        }
        await renderCommittedManualPlans(origin);
      } catch (error) {
        if (!manualLifecycleOriginIsCurrent(origin)) return;
        if (manualEditorOriginIsCurrent(origin)) {
          pendingCommit = false;
          syncCommitControls();
        }
        if (error?.manualStorageWriteFailure) showStatus("PLAN NOT SAVED");
      }
    }

    function requestStrategyOwnership(entryToSave) {
      const identity = currentStrategyIdentity();
      if (!identity || !strategyStoreApi) {
        void commitManualPlan({ type: "upsert", entry: entryToSave });
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
            let strategyId = choice.strategyId;
            if (choice.kind === "CREATE_NEW") {
              strategyId = crypto.randomUUID();
              const strategySequence = Number(settings.strategyBook?.nextSequence) || 1;
              await persistStrategyCommand({
                id: crypto.randomUUID(),
                type: "CREATE_STRATEGY",
                strategyId,
                versionId: crypto.randomUUID(),
                label: `T${strategySequence}`,
                instrumentKey: identity.instrumentKey,
                underlying: identity.underlying,
                expiry: entryToSave.expiry
              });
            }
            await persistStrategyCommand({
              id: crypto.randomUUID(),
              type: "ADD_LEG",
              strategyId,
              versionId: crypto.randomUUID(),
              leg: strategyLegFromManualEntry(entryToSave, identity)
            });
            chooser.remove();
            strategyOwnershipChooser = null;
            await commitManualPlan({ type: "upsert", entry: entryToSave });
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
          const entryToSave = manualUiApi.entryFromDraft(draft, {
            id: draft.id || crypto.randomUUID(),
            now: new Date().toISOString()
          });
          if (draft.id) await commitManualPlan({ type: "upsert", entry: entryToSave });
          else requestStrategyOwnership(entryToSave);
        },
        async remove() {
          if (!draft.id) return;
          await commitManualPlan({ type: "remove", expiry: draft.expiry, entryId: draft.id });
        },
        close() {
          closeManualEditor();
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
      const axisVisibleStrikes = new Set(membership?.visibleStrikes || [membership?.atm]);
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
      elements.forEach(({ row, element }, index) => {
        element.hidden = !visibleIndexSet.has(index);
        if (element.hidden) return;
        const lane = layout.lanes[index];
        element.dataset.lane = String(lane);
        element.style.setProperty("--nifty-lane-offset", `${laneOffset}px`);
        element.style.setProperty("--nifty-connector-width", `${lane * laneOffset}px`);
        element.style.right = `${baseRight + lane * laneOffset}px`;
        element.style.top = `${row.y}px`;
      });
      positionManualEditor();
      const laneZeroRows = elements
        .filter(({ element }, index) => !element.hidden && layout.lanes[index] === 0)
        .map(({ element }) => element);
      const labelRight = riskLabelLayout(laneZeroRows)?.labelRight ?? rect.right;
      const railDecorations = sharedRailDecorations(toY, rect);
      placeBreakEvenRails(toY, rect, labelRight, railDecorations.quick, visualPlacementRevision);
      if (activeChartStrategies().length) {
        clearManualPlanRails(visualPlacementRevision);
        placeStrategyRails(toY, rect, labelRight, visualPlacementRevision);
      } else {
        clearStrategyRails();
        placeManualPlanRails(toY, rect, labelRight, railDecorations.manual, visualPlacementRevision);
      }
      return { riskLayout: { labelRight } };
    } catch (error) {
      clearBreakEvenRails(visualPlacementRevision);
      clearManualPlanRails(visualPlacementRevision);
      clearStrategyRails();
      elements.forEach(({ element }) => { element.hidden = true; });
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
    const nextTimeframe = timeframeApi.timeframeKey(chartCanvas()?.getAttribute("aria-label") || "");
    const membership = controller?.membership();
    if (membership && nextTimeframe !== membership.timeframe) concealRows("CALIBRATING");
    timeframeTimer = setTimeout(async () => {
      timeframeTimer = null;
      const label = chartCanvas()?.getAttribute("aria-label") || "";
      const latestMembership = controller?.membership();
      if (label !== currentLabel || !latestMembership) await rebuildCurrent(false);
      else await controller.place();
    }, 250);
  }

  function scheduleAxisPlacement() {
    if (axisPlacementTimer !== null) return;
    axisPlacementTimer = setTimeout(async () => {
      axisPlacementTimer = null;
      if (!settings.enabled) return;
      const membership = controller?.membership();
      const timeframe = timeframeApi.timeframeKey(chartCanvas()?.getAttribute("aria-label") || "");
      if (!membership || timeframe !== membership.timeframe) {
        await rebuildCurrent(false);
        return;
      }
      await controller.place();
    }, 100);
  }

  function handleRuntimeMutations(records) {
    const nextUrl = String(root.location?.href || "");
    if (nextUrl !== currentUrl) {
      currentUrl = nextUrl;
      manualRowsConcealed = true;
      clearBreakEvenSelection();
      clearStrategyPreview();
      clearManualTransientState();
      clearManualPlanRails();
    }
    if (records.some((record) => record.type === "attributes" && record.attributeName === "data-nifty-axis-ticks")) {
      scheduleAxisPlacement();
    }
    const label = chartCanvas()?.getAttribute("aria-label") || "";
    if (label !== currentLabel) scheduleTimeframeCheck();
  }

  function handleUrlNavigation() {
    currentUrl = String(root.location?.href || "");
    manualRowsConcealed = true;
    clearBreakEvenSelection();
    clearStrategyPreview();
    clearManualTransientState();
    clearManualPlanRails();
  }

  function handlePageHide() {
    manualRowsConcealed = true;
    clearBreakEvenSelection();
    clearStrategyPreview();
    clearManualTransientState();
    clearManualPlanRails();
  }

  function handleDocumentPointerDown(event) {
    if (event.target?.closest?.(".nifty-manual-plan__label.is-flippable")) return;
    collapseExpandedManualRailDisclosure();
    if (event.target?.closest?.(".nifty-manual-editor")) return;
    const row = event.target?.closest?.(".nifty-axis-ladder__row");
    if (!row) {
      clearBreakEvenSelection();
      clearManualTransientState({ restorePlanRails: true });
    }
  }

  function handleQuickSelection(snapshot) {
    const strike = Number(snapshot?.strike);
    if (!Number.isFinite(strike)) return;
    if (breakEvenSelection.current()?.strike === strike) {
      clearBreakEvenSelection();
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
    closeManualEditorForOtherRow(context.strike);
    const interaction = ensureManualInteraction();
    if (interaction) interaction.click(context); else handleQuickSelection(context.liveRow);
  }

  function handleLadderDoubleClick(event) {
    if (event.target?.closest?.(".nifty-manual-editor")) return;
    const context = manualRowContext(event.target?.closest?.(".nifty-axis-ladder__row"));
    if (!context) return;
    closeManualEditorForOtherRow(context.strike);
    ensureManualInteraction()?.doubleClick(context);
  }

  function handleDocumentKeyDown(event) {
    if (event.key === "Escape") {
      const editorStrike = manualEditor?.strike;
      clearBreakEvenSelection();
      clearManualTransientState({ restorePlanRails: true });
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
      ensureManualInteraction()?.doubleClick(context);
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
      attributeFilter: ["aria-label", "data-nifty-axis-ticks"],
      childList: true,
      subtree: true
    });
    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    rootNode().addEventListener("click", handleLadderClick);
    rootNode().addEventListener("dblclick", handleLadderDoubleClick);
    document.addEventListener("keydown", handleDocumentKeyDown);
    root.addEventListener?.("pagehide", handlePageHide);
    root.addEventListener?.("popstate", handleUrlNavigation);
    root.addEventListener?.("hashchange", handleUrlNavigation);
    root.navigation?.addEventListener?.("navigate", handleUrlNavigation);
    if (controller.hasCachedChain()) void rebuildCurrent(false);
  }

  function stop() {
    clearBreakEvenSelection();
    clearStrategyPreview();
    clearManualTransientState();
    clearManualPlanRails();
    document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
    document.getElementById(LABELS_ID)?.removeEventListener("click", handleLadderClick);
    document.getElementById(LABELS_ID)?.removeEventListener("dblclick", handleLadderDoubleClick);
    document.removeEventListener("keydown", handleDocumentKeyDown);
    root.removeEventListener?.("pagehide", handlePageHide);
    root.removeEventListener?.("popstate", handleUrlNavigation);
    root.removeEventListener?.("hashchange", handleUrlNavigation);
    root.navigation?.removeEventListener?.("navigate", handleUrlNavigation);
    clearTimeout(timeframeTimer);
    timeframeTimer = null;
    clearTimeout(axisPlacementTimer);
    axisPlacementTimer = null;
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
      void renderStorageManualPlans();
    }
    if (changes.strategyBook) {
      settings.strategyBook = normalizeStrategyBook(changes.strategyBook.newValue);
      if (settings.enabled) void controller?.place();
    }
    if (changes.expiry) {
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
    if (!["CLEAR_BREAK_EVEN_SELECTION", "CLEAR_STRATEGY_PREVIEW", "RETRY_LABEL_PLACEMENT", "REFRESH_OPTION_NUMBERS", "GET_STRATEGY_PREVIEW_STATE"].includes(message?.type)) return false;
    if (message.type === "CLEAR_BREAK_EVEN_SELECTION") {
      clearBreakEvenSelection();
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
