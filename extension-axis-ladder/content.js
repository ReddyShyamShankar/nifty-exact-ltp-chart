(function (root) {
  "use strict";

  const RETRY_DELAYS = [0, 250, 650, 1200];
  const API = "http://127.0.0.1:8787";
  const LABELS_ID = "nifty-axis-ladder";
  const MAX_LANES = 13;
  const MINIMUM_ROW_GAP = 22;
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
  const DEFAULTS = {
    enabled: false,
    expiry: "current_month",
    labelCount: "5",
    panelOpen: false,
    selectedStrategyId: "",
    sellerSafetyView: null,
    sellerSafetyChartView: null,
    sellerSafetyChain: null,
    sellerSafetyChainsByExpiry: {},
    manualPlans: manualPlanApi.emptyStore()
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

  function rowLaneLayout(rows, atm, interval) {
    if (!Array.isArray(rows) || rows.length < 1 || rows.length > MAX_LANES) return null;
    const center = Number(atm);
    const step = Number(interval);
    if (!Number.isFinite(center) || !Number.isFinite(step) || step <= 0) return null;
    const entries = rows.map((row, index) => {
      const strike = Number(row?.strike);
      const y = Number(row?.y);
      const rawOffset = (strike - center) / step;
      const offset = Math.round(rawOffset);
      if (!Number.isFinite(strike) || !Number.isFinite(y) || Math.abs(rawOffset - offset) > 1e-7) return null;
      return { index, strike, y };
    });
    if (entries.some((entry) => !entry) || !entries.some((entry) => entry.strike === center)) return null;
    if (new Set(entries.map((entry) => entry.strike)).size !== entries.length) return null;

    const ordered = entries.slice().sort((a, b) => a.strike - b.strike);
    const atmRank = ordered.findIndex((entry) => entry.strike === center);
    for (let laneCount = 1; laneCount <= Math.min(MAX_LANES, entries.length); laneCount += 1) {
      const atmLane = atmRank % laneCount;
      const lanes = Array(entries.length);
      ordered.forEach((entry, rank) => {
        const rawLane = rank % laneCount;
        const lane = rawLane === atmLane ? 0 : (rawLane === 0 ? atmLane : rawLane);
        lanes[entry.index] = lane;
      });
      const fits = Array.from({ length: laneCount }, (_, lane) => entries
        .filter((entry) => lanes[entry.index] === lane)
        .map((entry) => entry.y)
        .sort((a, b) => a - b))
        .every((laneY) => laneY.slice(1)
          .every((value, index) => value - laneY[index] >= MINIMUM_ROW_GAP));
      if (fits) {
        return {
          mode: laneCount === 1 ? "single" : (laneCount === 2 ? "double" : "multi"),
          laneCount,
          lanes
        };
      }
    }
    return null;
  }

  function rowsFitPlot(rows, dimensions, plotRect, viewportWidth, baseRight, lanes, laneOffset) {
    if (!Array.isArray(rows) || !Array.isArray(dimensions) || rows.length !== dimensions.length) return false;
    if (!Array.isArray(lanes) || lanes.length !== rows.length) return false;
    const top = Number(plotRect?.top);
    const bottom = Number(plotRect?.bottom);
    const left = Number(plotRect?.left);
    const width = Number(viewportWidth);
    const rightInset = Number(baseRight);
    const offset = Number(laneOffset);
    if (![top, bottom, left, width, rightInset, offset].every(Number.isFinite) || bottom <= top || width <= left) return false;
    return rows.every((row, index) => {
      const y = Number(row?.y);
      const rowWidth = Number(dimensions[index]?.width);
      const rowHeight = Number(dimensions[index]?.height);
      const lane = Number(lanes[index]);
      if (![y, rowWidth, rowHeight, lane].every(Number.isFinite)
        || rowWidth <= 0 || rowHeight <= 0 || lane < 0) return false;
      const rowLeft = width - (rightInset + lane * offset) - rowWidth;
      return y - rowHeight / 2 >= top
        && y + rowHeight / 2 <= bottom
        && rowLeft >= left;
    });
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

  function freezeMembership({ timeframe, expiry, interval, nativeInterval = interval, spot, chainRows, tieDirection = "up" }) {
    const selection = timeframeApi.selectExactThirteen(chainRows, spot, interval, tieDirection);
    if (!selection) return null;
    const rows = selection.rows.map((row) => Object.freeze({
      strike: Number(row.strike),
      call: quote(row.call),
      put: quote(row.put)
    }));
    const strikes = rows.map((row) => row.strike);
    return Object.freeze({
      timeframe,
      expiry,
      nativeInterval: timeframeApi.maxStrikeInterval(nativeInterval),
      preferredInterval: timeframeApi.maxStrikeInterval(interval),
      interval: selection.interval,
      atmStep: selection.atmStep,
      center: selection.center,
      atm: selection.center,
      strikes: Object.freeze(strikes.slice()),
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
    let cachedRiskLayout = null;
    let cachedRiskGeneration = null;
    let placementRevision = 0;
    let membershipRevision = 0;
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
        || snapshot.rows.length < 13
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
      return positioned.length === 13 && positioned.every((row) => Number.isFinite(row.y)) ? positioned : null;
    }

    function clearCachedRiskPlacement() {
      cachedRiskLayout = null;
      cachedRiskGeneration = null;
    }

    function placeCached(membership = current) {
      const positioned = positionedRows(membership, cachedAxisToY);
      if (!positioned) return false;
      clearCachedRiskPlacement();
      const rowPlacement = placeRows(positioned, membership, cachedAxisToY);
      if (rowPlacement === false) return false;
      cachedRiskLayout = rowPlacement && typeof rowPlacement === "object"
        ? rowPlacement.riskLayout || null
        : null;
      if (cachedRiskLayout) cachedRiskGeneration = generation;
      if (riskIsPublishable(riskView)) {
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

    function failRebuild(localGeneration, timeframe, requestedExpiry, signal, message, minimumObservedAt, allowRetry = true) {
      if (!isCurrentRequest(localGeneration, timeframe, requestedExpiry, signal)) return false;
      current = null;
      cachedAxisToY = null;
      clearCachedRiskPlacement();
      hideRisk();
      hideRows(message || "AXIS CALIBRATION UNAVAILABLE");
      const delayFloor = message === "AUTO-FITTING PRICE SCALE" ? 500 : 0;
      if (allowRetry) retryRebuild(localGeneration, timeframe, requestedExpiry, minimumObservedAt, delayFloor);
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
              false
            );
          }
          if (!isCurrentRequest(localGeneration, timeframe, requestedExpiry, signal)) return false;
          cachedChain = chain;
        }
        const firstScale = await captureAxisScale(signal, { minimumObservedAt, timeframe });
        if (!isCurrentRequest(localGeneration, timeframe, requestedExpiry, signal)) return false;
        const firstNativeInterval = timeframeApi.maxStrikeInterval(intervalFromAxisScale(firstScale));
        const preferredInterval = timeframeApi.preferredIntervalForTimeframe(timeframe);
        if (!firstScale?.ok || !validPineSanity(firstScale) || !firstNativeInterval || !preferredInterval || !Number.isFinite(Number(chain?.spot))) {
          return failRebuild(localGeneration, timeframe, requestedExpiry, signal, "AXIS CALIBRATION UNAVAILABLE", minimumObservedAt);
        }
        const secondScale = await captureAxisScale(signal, { minimumObservedAt, timeframe });
        if (!isCurrentRequest(localGeneration, timeframe, requestedExpiry, signal)) return false;
        const secondNativeInterval = timeframeApi.maxStrikeInterval(intervalFromAxisScale(secondScale));
        if (!secondScale?.ok
          || !validPineSanity(secondScale)
          || !secondNativeInterval
          || secondNativeInterval !== firstNativeInterval
          || secondScale.observationSignature !== firstScale.observationSignature) {
          return failRebuild(localGeneration, timeframe, requestedExpiry, signal, "AXIS CALIBRATION UNAVAILABLE", minimumObservedAt);
        }
        const membership = freezeMembership({
          timeframe,
          expiry: requestedExpiry,
          interval: preferredInterval,
          nativeInterval: secondNativeInterval,
          spot: Number(chain.spot),
          chainRows: chain.rows
        });
        if (!membership) {
          return failRebuild(localGeneration, timeframe, requestedExpiry, signal, "13 EXACT CONTRACTS UNAVAILABLE", minimumObservedAt);
        }
        current = membership;
        lastSpot = Number(chain.spot);
        membershipRevision += 1;
        cachedAxisToY = axisPriceToY(secondScale.axisPairs);
        renderRows(current.rows, current);
        if (!placeCached(current)) {
          return failRebuild(localGeneration, timeframe, requestedExpiry, signal, "Exact strike positions are unavailable.", minimumObservedAt);
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
        return failRebuild(localGeneration, timeframe, requestedExpiry, signal, error?.message || "AXIS CALIBRATION UNAVAILABLE", minimumObservedAt);
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
      if (!current || refreshing || rebuilding) return false;
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
          || current !== snapshot
          || snapshot.expiry !== expiry) return false;
        cachedChain = chain;
        const spot = Number(chain?.spot);
        const lowerMidpoint = snapshot.atm - snapshot.atmStep / 2;
        const upperMidpoint = snapshot.atm + snapshot.atmStep / 2;
        const atLowerMidpoint = Math.abs(spot - lowerMidpoint) < 1e-9;
        const atUpperMidpoint = Math.abs(spot - upperMidpoint) < 1e-9;
        const crossedLower = spot < lowerMidpoint
          || (atLowerMidpoint && Number.isFinite(lastSpot) && lastSpot > spot);
        const crossedUpper = spot > upperMidpoint
          || (atUpperMidpoint && (!Number.isFinite(lastSpot) || lastSpot < spot));
        const direction = crossedLower ? "down" : "up";
        const shouldRecenter = Number.isFinite(spot) && (crossedLower || crossedUpper);
        const recentered = shouldRecenter ? freezeMembership({
          timeframe: snapshot.timeframe,
          expiry: snapshot.expiry,
          interval: snapshot.preferredInterval,
          nativeInterval: snapshot.nativeInterval,
          spot,
          chainRows: chain?.rows,
          tieDirection: direction
        }) : null;
        const membershipChanged = recentered
          && recentered.strikes.some((strike, index) => strike !== snapshot.strikes[index]);
        const pendingRecenter = shouldRecenter && !recentered;
        current = membershipChanged ? recentered : refreshMembership(snapshot, chain?.rows);
        refreshOwnedMembership = current;
        acceptedFreshData = true;
        const complete = hasCompleteMembershipRows(current, chain?.rows);
        if (!pendingRecenter) lastSpot = spot;
        if (membershipChanged) membershipRevision += 1;
        dataStatus = pendingRecenter ? "RECENTER PENDING" : (complete ? "LIVE" : "PARTIAL");
        renderRows(current.rows, current);
        const placed = placeCached(current);
        if (!placed) throw new Error("EXACT STRIKE POSITIONS UNAVAILABLE");
        if (placed) setStatus(dataStatus);
        return placed;
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

    async function place() {
      const snapshot = current;
      if (!snapshot || rebuilding || snapshot.expiry !== expiry || snapshot.timeframe !== desiredTimeframe) return false;
      clearCachedRiskPlacement();
      const placementGeneration = generation;
      const localPlacementRevision = ++placementRevision;
      const placementMembershipRevision = membershipRevision;
      try {
        const scale = await captureAxisScale(undefined, {
          minimumObservedAt: committedAxisObservedAt,
          timeframe: snapshot.timeframe
        });
        if (generation !== placementGeneration
          || localPlacementRevision !== placementRevision
          || membershipRevision !== placementMembershipRevision
          || rebuilding
          || snapshot.expiry !== expiry
          || snapshot.timeframe !== desiredTimeframe
          || !current) return false;
        if (!scale?.ok || !validPineSanity(scale)) throw new Error("Axis calibration unavailable.");
        if (activeTimeframe() !== snapshot.timeframe) throw new Error("Timeframe changed during axis capture.");
        if (Number.isFinite(Number(scale.observedAt))
          && Number(scale.observedAt) < committedAxisObservedAt) throw new Error("Stale axis observation.");
        const toY = axisPriceToY(scale.axisPairs);
        if (!toY) throw new Error("Native axis map is unavailable.");
        cachedAxisToY = toY;
        if (!placeCached(current)) throw new Error("Exact strike positions are unavailable.");
        if (Number.isFinite(Number(scale.observedAt))) {
          committedAxisObservedAt = Math.max(committedAxisObservedAt, Number(scale.observedAt));
        }
        setStatus(dataStatus);
        return true;
      } catch (error) {
        if (generation !== placementGeneration
          || localPlacementRevision !== placementRevision
          || membershipRevision !== placementMembershipRevision
          || rebuilding
          || snapshot.expiry !== expiry
          || snapshot.timeframe !== desiredTimeframe
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
      clearCachedRiskPlacement();
      hideRisk();
      dataStatus = "STALE";
      placementRevision += 1;
      membershipRevision += 1;
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
    rowsFitPlot
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
  let scaleFitAttempts = 0;
  let scaleFitInFlight = false;
  let scaleFitTimeframe = null;
  let normalStatus = "LIVE";
  let breakEvenStatusOverride = null;
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
  let manualPersistTail = Promise.resolve();

  function normalizeManualPlans(value) {
    return manualPlanApi.normalizeStore(value);
  }

  function manualEntriesForExpiry() {
    return manualPlanApi.entriesFor(settings.manualPlans, settings.expiry);
  }

  function manualEntriesByStrike() {
    return manualPlanApi.groupByStrike(manualEntriesForExpiry());
  }

  function closeManualEditor() {
    manualEditor?.element?.remove?.();
    manualEditor = null;
  }

  function closeManualEditorForOtherRow(strike) {
    if (manualEditor && manualEditor.strike !== Number(strike)) closeManualEditor();
  }

  function manualEditorOriginIsCurrent(origin) {
    return Boolean(origin)
      && manualLifecycleGeneration === origin.lifecycleGeneration
      && manualEditor?.token === origin.token;
  }

  function focusManualRow(strike) {
    rootNode().querySelector(`.nifty-axis-ladder__row[data-strike="${strike}"]`)?.focus?.();
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

  function clearManualTransientState() {
    manualLifecycleGeneration += 1;
    closeManualEditor();
    ensureManualInteraction()?.reset();
  }

  function rootNode() {
    let node = document.getElementById(LABELS_ID);
    if (node) return node;
    node = document.createElement("div");
    node.id = LABELS_ID;
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
    else normalStatus = status;
    const visibleStatus = breakEvenStatusOverride || status;
    node.dataset.status = visibleStatus;
    let statusNode = node.querySelector(".nifty-axis-ladder__status");
    if (!statusNode) {
      statusNode = document.createElement("div");
      statusNode.className = "nifty-axis-ladder__status";
      node.append(statusNode);
    }
    statusNode.textContent = visibleStatus;
  }

  function clearBreakEvenStatusOverride() {
    if (!breakEvenStatusOverride) return;
    breakEvenStatusOverride = null;
    showStatus(normalStatus);
  }

  function hideRows(status) {
    clearManualTransientState();
    clearBreakEvenRails();
    const node = rootNode();
    node.querySelectorAll(".nifty-axis-ladder__row").forEach((row) => row.remove());
    node.hidden = !settings.enabled;
    clearRisk();
    showStatus(status);
  }

  function concealRows(status) {
    clearManualTransientState();
    clearBreakEvenRails();
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
      existing.delete(row.strike);
    });
    existing.forEach((row) => row.remove());
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

  function clearBreakEvenRails() {
    document.getElementById("nifty-break-even-rails")?.remove();
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

  function placeBreakEvenRails(toY, rect, labelRight) {
    const selection = breakEvenSelection.current();
    if (!selection) {
      clearBreakEvenRails();
      return false;
    }
    if (!breakEvenApi || typeof toY !== "function") {
      clearBreakEvenRails();
      return false;
    }
    const breakEvens = breakEvenApi.calculate(selection);
    if (!breakEvens) {
      clearBreakEvenRails();
      return false;
    }
    const plotLeft = Number(rect?.left);
    const plotRight = Number(rect?.right);
    const plotTop = Number(rect?.top);
    const plotBottom = Number(rect?.bottom);
    if (![plotLeft, plotRight, plotTop, plotBottom].every(Number.isFinite) || plotRight <= plotLeft || plotBottom <= plotTop) {
      clearBreakEvenRails();
      return false;
    }
    const placements = [breakEvens.call, breakEvens.put].map((level) => ({
      level,
      projection: breakEvenApi.project(level, toY, rect)
    }));
    if (placements.some(({ projection }) => !projection)) {
      clearBreakEvenRails();
      return false;
    }
    const railRight = Math.max(plotLeft, Math.min(plotRight, Number.isFinite(labelRight) ? labelRight : plotRight));
    const decorations = breakEvenApi.layoutDecorations?.(placements, rect, BREAK_EVEN_LABEL_HEIGHT, 2);
    if (!decorations) {
      clearBreakEvenRails();
      return false;
    }
    clearBreakEvenRails();
    const rails = breakEvenRoot();
    placements.forEach(({ level, projection }, index) => {
      const element = document.createElement("div");
      const className = projection.mode === "line" ? "line" : "marker";
      element.className = `nifty-break-even__${className} is-${level.kind}`;
      element.style.top = `${projection.y}px`;
      if (projection.mode === "line") {
        element.style.left = `${railRight}px`;
        element.style.width = `${plotRight - railRight}px`;
        const label = document.createElement("span");
        label.className = `nifty-break-even__label is-${level.kind}`;
        label.style.right = `${window.innerWidth - railRight}px`;
        label.style.top = `${decorations[index].top}px`;
        label.textContent = level.label;
        element.append(label);
      } else {
        element.style.left = "";
        element.style.right = `${window.innerWidth - railRight}px`;
        element.style.top = `${decorations[index].top}px`;
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

  async function renderCommittedManualPlans(origin) {
    if (!manualEditorOriginIsCurrent(origin)) return;
    try {
      renderManualRows();
    } catch (_) {}
    if (!manualEditorOriginIsCurrent(origin)) return;
    try {
      await controller?.place();
    } catch (_) {}
  }

  function persistManualPlans(updater, origin) {
    const commit = async () => {
      const next = typeof updater === "function" ? updater(settings.manualPlans) : updater;
      const normalized = manualPlanApi.normalizeStore(next);
      try {
        await chrome.storage.local.set({ [manualPlanApi.STORAGE_KEY]: normalized });
      } catch (cause) {
        throw storageWriteFailure(cause);
      }
      settings.manualPlans = normalized;
      return normalized;
    };
    const storageCommit = manualPersistTail.then(commit, commit);
    manualPersistTail = storageCommit.catch(() => {});
    return storageCommit.then(async (normalized) => {
      await renderCommittedManualPlans(origin);
      return normalized;
    });
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
      lifecycleGeneration: manualLifecycleGeneration
    };

    function setCommitControlsDisabled(disabled) {
      const commit = editor?.querySelector?.(".nifty-manual-editor__commit");
      const remove = editor?.querySelector?.(".nifty-manual-editor__remove");
      if (commit) commit.disabled = disabled;
      if (remove) remove.disabled = disabled;
    }

    async function commitManualPlan(updater) {
      if (pendingCommit) return;
      pendingCommit = true;
      setCommitControlsDisabled(true);
      try {
        await persistManualPlans(updater, origin);
        if (!manualEditorOriginIsCurrent(origin)) return;
        closeManualEditor();
        focusManualRow(strike);
      } catch (error) {
        if (!manualEditorOriginIsCurrent(origin)) return;
        pendingCommit = false;
        setCommitControlsDisabled(false);
        if (error?.manualStorageWriteFailure) showStatus("PLAN NOT SAVED");
      }
    }

    function renderEditor() {
      editor?.remove?.();
      editor = manualUiApi.renderEditor(document, draft, {
        chooseAction(optionType, direction) {
          draft = manualUiApi.chooseAction(draft, optionType, direction);
          renderEditor();
        },
        setLots(lots) {
          draft = manualUiApi.setLots(draft, lots);
          renderEditor();
        },
        setPremium(premium) {
          draft = manualUiApi.setPremium(draft, premium);
          renderEditor();
        },
        async save() {
          if (!manualUiApi.validateDraft(draft).ok) return;
          const entryToSave = manualUiApi.entryFromDraft(draft, {
            id: draft.id || crypto.randomUUID(),
            now: new Date().toISOString()
          });
          await commitManualPlan((store) => manualPlanApi.upsertEntry(store, entryToSave));
        },
        async remove() {
          if (!draft.id) return;
          await commitManualPlan((store) => manualPlanApi.removeEntry(store, draft.expiry, draft.id));
        },
        close: closeManualEditor
      });
      rowElement.append(editor);
      manualEditor = { strike, element: editor, ...origin };
      setCommitControlsDisabled(pendingCommit);
    }

    closeManualEditor();
    renderEditor();
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

  async function waitForFreshAxisObservation(previousAt, timeout = 1800) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (axisObservationAt() > previousAt) {
        await new Promise((resolve) => setTimeout(resolve, 180));
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    return false;
  }

  async function fetchChain(expiry, signal) {
    const response = await fetch(`${API}/api/nifty-chain?expiry=${encodeURIComponent(expiry)}`, { cache: "no-store", signal });
    const chain = await response.json();
    if (!response.ok) throw new Error(chain.error || "Option chain unavailable.");
    return chain;
  }

  function requestScaleFit(rect, timeframe, direction = "out") {
    if (scaleFitTimeframe !== timeframe) {
      scaleFitTimeframe = timeframe;
      scaleFitAttempts = 0;
    }
    if (scaleFitInFlight || scaleFitAttempts >= 6) return false;
    scaleFitInFlight = true;
    scaleFitAttempts += 1;
    const observationBeforeFit = axisObservationAt();
    chrome.runtime.sendMessage({
      type: "FIT_AXIS_SCALE",
      plotRect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      attempt: scaleFitAttempts,
      direction,
      timeframe
    }).then(async (result) => {
      if (!settings.enabled || timeframe !== timeframeApi.timeframeKey(chartCanvas()?.getAttribute("aria-label") || "")) {
        scaleFitInFlight = false;
        return;
      }
      if (!result?.ok) {
        scaleFitInFlight = false;
        showStatus(`AUTO-FIT UNAVAILABLE · ${result?.error || "TRUSTED GESTURE FAILED"}`);
        return;
      }
      await waitForFreshAxisObservation(observationBeforeFit);
      scaleFitInFlight = false;
      if (!settings.enabled || timeframe !== timeframeApi.timeframeKey(chartCanvas()?.getAttribute("aria-label") || "")) return;
      await controller?.place();
    }).catch((error) => {
      scaleFitInFlight = false;
      showStatus(`AUTO-FIT UNAVAILABLE · ${error?.message || "TRUSTED GESTURE FAILED"}`);
    });
    return true;
  }

  function placeRows(rows, membership, toY) {
    const canvas = chartCanvas();
    if (!canvas) {
      concealRows("TRADINGVIEW CHART UNAVAILABLE");
      return false;
    }
    const rect = canvas.getBoundingClientRect();
    const node = rootNode();
    const layout = rowLaneLayout(rows, membership?.atm, membership?.interval);
    if (!layout) {
      const timeframe = membership?.timeframe || timeframeApi.timeframeKey(canvas.getAttribute("aria-label") || "");
      if (requestScaleFit(rect, timeframe, "reset")) throw new Error("AUTO-FITTING PRICE SCALE");
      throw new Error("13 STRIKES OVERLAP AT THIS SCALE · ZOOM IN");
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
      if (!rowsFitPlot(rows, dimensions, rect, window.innerWidth, baseRight, layout.lanes, laneOffset)) {
        const timeframe = membership?.timeframe || timeframeApi.timeframeKey(canvas.getAttribute("aria-label") || "");
        if (requestScaleFit(rect, timeframe, "out")) throw new Error("AUTO-FITTING PRICE SCALE");
        throw new Error("13 STRIKES OUTSIDE VISIBLE PRICE RANGE · ZOOM OUT");
      }
      elements.forEach(({ row, element }, index) => {
        const lane = layout.lanes[index];
        element.dataset.lane = String(lane);
        element.style.setProperty("--nifty-lane-offset", `${laneOffset}px`);
        element.style.setProperty("--nifty-connector-width", `${lane * laneOffset}px`);
        element.style.right = `${baseRight + lane * laneOffset}px`;
        element.style.top = `${row.y}px`;
      });
      const laneZeroRows = elements
        .filter((_entry, index) => layout.lanes[index] === 0)
        .map(({ element }) => element);
      const labelRight = riskLabelLayout(laneZeroRows)?.labelRight ?? rect.right;
      placeBreakEvenRails(toY, rect, labelRight);
      scaleFitAttempts = 0;
      scaleFitTimeframe = membership?.timeframe || scaleFitTimeframe;
      return { riskLayout: { labelRight } };
    } catch (error) {
      clearBreakEvenRails();
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
      clearManualTransientState();
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
      clearBreakEvenSelection();
      clearManualTransientState();
    }
    if (records.some((record) => record.type === "attributes" && record.attributeName === "data-nifty-axis-ticks")) {
      scheduleAxisPlacement();
    }
    const label = chartCanvas()?.getAttribute("aria-label") || "";
    if (label !== currentLabel) scheduleTimeframeCheck();
  }

  function handleUrlNavigation() {
    currentUrl = String(root.location?.href || "");
    clearBreakEvenSelection();
    clearManualTransientState();
  }

  function handlePageHide() {
    clearBreakEvenSelection();
    clearManualTransientState();
  }

  function handleDocumentPointerDown(event) {
    const row = event.target?.closest?.(".nifty-axis-ladder__row");
    if (!row) {
      clearBreakEvenSelection();
      clearManualTransientState();
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
      clearBreakEvenSelection();
      clearManualTransientState();
    }
    if (event.target?.closest?.(".nifty-manual-editor")) return;
    if (!["Enter", " "].includes(event.key)) return;
    const row = event.target?.closest?.(".nifty-axis-ladder__row");
    if (row) {
      event.preventDefault();
      handleLadderClick(event);
    }
  }

  function start() {
    if (controller) return;
    controller = createLadderController({
      expiry: settings.expiry,
      activeTimeframe: () => timeframeApi.timeframeKey(chartCanvas()?.getAttribute("aria-label") || ""),
      axisObservationAt,
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
    clearManualTransientState();
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
    scaleFitAttempts = 0;
    scaleFitInFlight = false;
    scaleFitTimeframe = null;
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
    if (settings.sellerSafetyChartView !== loaded.sellerSafetyChartView) {
      chrome.storage.local.set?.({ sellerSafetyChartView: settings.sellerSafetyChartView });
    }
    if (settings.enabled) start();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
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
      renderManualRows();
      void controller?.place();
    }
    if (changes.expiry) {
      clearBreakEvenSelection();
      clearManualTransientState();
      settings.expiry = changes.expiry.newValue || DEFAULTS.expiry;
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
    if (!["CLEAR_BREAK_EVEN_SELECTION", "RETRY_LABEL_PLACEMENT", "REFRESH_OPTION_NUMBERS"].includes(message?.type)) return false;
    if (message.type === "CLEAR_BREAK_EVEN_SELECTION") {
      clearBreakEvenSelection();
      sendResponse({ ok: true });
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
