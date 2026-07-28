(function (root) {
  "use strict";

  const DEFAULTS = {
    enabled: false,
    expiry: "current_month",
    labelCount: "5",
    panelOpen: false,
    selectedStrategyId: "",
    sellerSafetyView: null
  };
  const RETRY_DELAYS = [0, 250, 650, 1200];
  const API = "http://127.0.0.1:8787";
  const LABELS_ID = "nifty-axis-ladder";
  const MAX_LANES = 13;
  const MINIMUM_ROW_GAP = 22;
  const timeframeApi = root.NiftyTimeframeLadder
    || (typeof module !== "undefined" && module.exports ? require("./timeframe-ladder.js") : null);
  const riskOverlayApi = root.NiftyRiskOverlay
    || (typeof module !== "undefined" && module.exports ? require("./risk-overlay.js") : null);

  function quote(value) {
    if (typeof value === "boolean" || value === null || value === undefined) return null;
    if (typeof value === "string" && value.trim() === "") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
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
    let current = null;
    let desiredTimeframe = null;
    let generation = 0;
    let rebuildAbort = null;
    let refreshing = false;
    let refreshAbort = null;
    let refreshRevision = 0;
    let rebuilding = false;
    let retryTimer = null;
    let retryIndex = 0;
    let cachedAxisToY = null;
    let placementRevision = 0;
    let membershipRevision = 0;
    let committedAxisObservedAt = 0;
    let transitionMinimumObservedAt = 0;
    let lastSpot = null;
    let dataStatus = "STALE";
    let cachedChain = null;
    let riskView = dependencies.riskView || null;

    function clearRebuildRetry() {
      if (retryTimer !== null) cancelRetry(retryTimer);
      retryTimer = null;
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

    function placeCached(membership = current) {
      const positioned = positionedRows(membership, cachedAxisToY);
      if (!positioned) return false;
      if (placeRows(positioned, membership) === false) return false;
      if (riskView) {
        try {
          placeRisk(riskView, cachedAxisToY, membership);
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
      if (!riskView) {
        hideRisk();
        return true;
      }
      if (!current || typeof cachedAxisToY !== "function") return false;
      try {
        placeRisk(riskView, cachedAxisToY, current);
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
      hideRisk();
      hideRows(message || "AXIS CALIBRATION UNAVAILABLE");
      const delayFloor = message === "AUTO-FITTING PRICE SCALE" ? 500 : 0;
      if (allowRetry) retryRebuild(localGeneration, timeframe, requestedExpiry, minimumObservedAt, delayFloor);
      return false;
    }

    async function rebuild(timeframe, resetRetry = true, minimumObservedAt = 0) {
      if (!timeframe) return false;
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
      current = null;
      cachedChain = null;
      cachedAxisToY = null;
      hideRisk();
      dataStatus = "STALE";
      hideRows("PRESS REFRESH OPTION NUMBERS");
      setStatus("MANUAL REFRESH REQUIRED");
      return false;
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
      desiredTimeframe = null;
      current = null;
      cachedAxisToY = null;
      hideRisk();
      dataStatus = "STALE";
      placementRevision += 1;
      membershipRevision += 1;
    }

    return {
      chain: () => cachedChain,
      hasCachedChain: () => Boolean(cachedChain),
      invalidate,
      membership: () => current,
      place,
      rebuild,
      refreshLtp,
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
    if (changed && targetSettings.enabled) activeController?.setRiskView(targetSettings.sellerSafetyView);
    return changed;
  }

  const api = { applyRiskStorageChanges, axisPriceToY, createLadderController, formatRow, freezeMembership, intervalFromAxisScale, isNiftyChartLabel, refreshMembership, rowLaneLayout, rowsFitPlot };
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
  let runtimeObserver = null;
  let scaleFitAttempts = 0;
  let scaleFitInFlight = false;
  let scaleFitTimeframe = null;

  function rootNode() {
    let node = document.getElementById(LABELS_ID);
    if (node) return node;
    node = document.createElement("div");
    node.id = LABELS_ID;
    node.hidden = true;
    document.documentElement.append(node);
    return node;
  }

  function showStatus(status) {
    const node = rootNode();
    node.dataset.status = status;
    let statusNode = node.querySelector(".nifty-axis-ladder__status");
    if (!statusNode) {
      statusNode = document.createElement("div");
      statusNode.className = "nifty-axis-ladder__status";
      node.append(statusNode);
    }
    statusNode.textContent = status;
  }

  function hideRows(status) {
    const node = rootNode();
    node.querySelectorAll(".nifty-axis-ladder__row").forEach((row) => row.remove());
    node.hidden = !settings.enabled;
    clearRisk();
    showStatus(status);
  }

  function concealRows(status) {
    const node = rootNode();
    node.querySelectorAll(".nifty-axis-ladder__row").forEach((row) => { row.hidden = true; });
    node.hidden = !settings.enabled;
    clearRisk();
    showStatus(status);
  }

  function renderRows(rows, membership) {
    const node = rootNode();
    const existing = new Map([...node.querySelectorAll(".nifty-axis-ladder__row")]
      .map((row) => [Number(row.dataset.strike), row]));
    rows.forEach((row) => {
      let element = existing.get(row.strike);
      if (!element) {
        element = document.createElement("div");
        element.className = "nifty-axis-ladder__row";
        element.dataset.strike = String(row.strike);
        node.append(element);
      }
      element.classList.toggle("is-atm", row.strike === membership.atm);
      element.textContent = formatRow(row);
      element.hidden = false;
      existing.delete(row.strike);
    });
    existing.forEach((row) => row.remove());
    node.hidden = false;
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

  function placeRisk(view, toY) {
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
    }, toY, rect);
    clearRisk();
    if (!layers.lines.length && !layers.bands.length) return false;
    const node = riskRoot();
    node.dataset.status = layers.status;
    layers.bands.forEach((band) => {
      const element = document.createElement("div");
      element.className = `nifty-seller-risk__band is-${band.layer} is-${band.kind}`;
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

  function placeRows(rows, membership) {
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
      scaleFitAttempts = 0;
      scaleFitTimeframe = membership?.timeframe || scaleFitTimeframe;
      return true;
    } catch (error) {
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
    if (records.some((record) => record.type === "attributes" && record.attributeName === "data-nifty-axis-ticks")) {
      scheduleAxisPlacement();
    }
    const label = chartCanvas()?.getAttribute("aria-label") || "";
    if (label !== currentLabel) scheduleTimeframeCheck();
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
      riskView: settings.sellerSafetyView,
      setStatus: showStatus
    });
    currentLabel = chartCanvas()?.getAttribute("aria-label") || "";
    runtimeObserver = new MutationObserver(handleRuntimeMutations);
    runtimeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["aria-label", "data-nifty-axis-ticks"],
      childList: true,
      subtree: true
    });
  }

  function stop() {
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
    settings = { ...DEFAULTS, ...stored };
    if (settings.enabled) start();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.enabled) {
      settings.enabled = Boolean(changes.enabled.newValue);
      if (settings.enabled) start(); else stop();
    }
    if (changes.expiry) {
      settings.expiry = changes.expiry.newValue || DEFAULTS.expiry;
      if (settings.enabled) controller?.setExpiry(settings.expiry).then((rebuilt) => { if (rebuilt) requestPlacementRetries(); });
    }
    applyRiskStorageChanges(changes, area, settings, controller);
  });

  chrome.runtime.onMessage?.addListener((message, _sender, sendResponse) => {
    if (!["RETRY_LABEL_PLACEMENT", "REFRESH_OPTION_NUMBERS"].includes(message?.type)) return false;
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
