(function (root) {
  "use strict";

  const DEFAULTS = { enabled: false, expiry: "current_month", labelCount: "5", panelOpen: false };
  const RETRY_DELAYS = [0, 250, 650, 1200];
  const API = "http://127.0.0.1:8787";
  const LABELS_ID = "nifty-axis-ladder";
  const timeframeApi = root.NiftyTimeframeLadder
    || (typeof module !== "undefined" && module.exports ? require("./timeframe-ladder.js") : null);

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

  function axisPriceToY(axisPairs) {
    if (!Array.isArray(axisPairs) || axisPairs.length < 2) return null;
    const pairs = axisPairs.map((pair) => ({ price: Number(pair?.price), y: Number(pair?.y) }));
    if (pairs.some((pair) => !Number.isFinite(pair.price) || !Number.isFinite(pair.y))) return null;
    const first = pairs[0];
    const last = pairs.at(-1);
    const priceSpan = last.price - first.price;
    const pixelSpan = last.y - first.y;
    if (priceSpan === 0 || pixelSpan === 0 || priceSpan * pixelSpan >= 0) return null;
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

  function freezeMembership({ timeframe, expiry, interval, spot, chainRows }) {
    const targets = timeframeApi.thirteenStrikes(spot, interval);
    if (targets.length !== 13) return null;
    const available = timeframeApi.selectAvailable(chainRows, targets, spot);
    if (available.length !== 13) return null;
    const rows = available.map((row) => Object.freeze({
      strike: Number(row.strike),
      call: quote(row.call),
      put: quote(row.put)
    }));
    const strikes = rows.map((row) => row.strike);
    const atm = timeframeApi.nearestAvailableStrike(rows, spot);
    if (!Number.isFinite(atm)) return null;
    return Object.freeze({
      timeframe,
      expiry,
      interval,
      atm,
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
    const hideRows = dependencies.hideRows || (() => {});
    const setStatus = dependencies.setStatus || (() => {});
    let expiry = dependencies.expiry || DEFAULTS.expiry;
    const scheduleRetry = dependencies.scheduleRetry || ((run, delay) => setTimeout(run, delay));
    const cancelRetry = dependencies.cancelRetry || clearTimeout;
    let current = null;
    let desiredTimeframe = null;
    let generation = 0;
    let rebuildAbort = null;
    let refreshing = false;
    let retryTimer = null;
    let retryIndex = 0;
    let cachedAxisToY = null;

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
      placeRows(positioned, membership);
      return true;
    }

    function isCurrentRequest(localGeneration, timeframe, requestedExpiry, signal) {
      return localGeneration === generation
        && desiredTimeframe === timeframe
        && expiry === requestedExpiry
        && !signal?.aborted;
    }

    function retryRebuild(localGeneration, timeframe, requestedExpiry) {
      if (!isCurrentRequest(localGeneration, timeframe, requestedExpiry) || retryTimer !== null) return;
      const delay = RETRY_DELAYS[retryIndex++];
      if (delay === undefined) return;
      retryTimer = scheduleRetry(async () => {
        retryTimer = null;
        if (desiredTimeframe === timeframe && expiry === requestedExpiry) await rebuild(timeframe, false);
      }, delay);
    }

    function failRebuild(localGeneration, timeframe, requestedExpiry, signal, message) {
      if (!isCurrentRequest(localGeneration, timeframe, requestedExpiry, signal)) return false;
      current = null;
      cachedAxisToY = null;
      hideRows(message || "AXIS CALIBRATION UNAVAILABLE");
      retryRebuild(localGeneration, timeframe, requestedExpiry);
      return false;
    }

    async function rebuild(timeframe, resetRetry = true) {
      if (!timeframe) return false;
      desiredTimeframe = timeframe;
      if (resetRetry) {
        clearRebuildRetry();
        retryIndex = 0;
      }
      const localGeneration = ++generation;
      const requestedExpiry = expiry;
      rebuildAbort?.abort();
      rebuildAbort = typeof AbortController === "undefined" ? null : new AbortController();
      const signal = rebuildAbort?.signal;
      setStatus("CALIBRATING");
      try {
        const [firstScale, chain] = await Promise.all([
          captureAxisScale(signal),
          fetchChain(requestedExpiry, signal)
        ]);
        if (!isCurrentRequest(localGeneration, timeframe, requestedExpiry, signal)) return false;
        const firstInterval = timeframeApi.snapStrikeInterval(intervalFromAxisScale(firstScale));
        if (!firstScale?.ok || !validPineSanity(firstScale) || !firstInterval || !Number.isFinite(Number(chain?.spot))) {
          return failRebuild(localGeneration, timeframe, requestedExpiry, signal, "AXIS CALIBRATION UNAVAILABLE");
        }
        const secondScale = await captureAxisScale(signal);
        if (!isCurrentRequest(localGeneration, timeframe, requestedExpiry, signal)) return false;
        const interval = timeframeApi.snapStrikeInterval(intervalFromAxisScale(secondScale));
        if (!secondScale?.ok || !validPineSanity(secondScale) || !interval || interval !== firstInterval) {
          return failRebuild(localGeneration, timeframe, requestedExpiry, signal, "AXIS CALIBRATION UNAVAILABLE");
        }
        const membership = freezeMembership({
          timeframe,
          expiry: requestedExpiry,
          interval,
          spot: Number(chain.spot),
          chainRows: chain.rows
        });
        if (!membership) {
          return failRebuild(localGeneration, timeframe, requestedExpiry, signal, "13 EXACT CONTRACTS UNAVAILABLE");
        }
        current = membership;
        cachedAxisToY = axisPriceToY(secondScale.axisPairs);
        renderRows(current.rows, current);
        if (!placeCached(current)) return failRebuild(localGeneration, timeframe, requestedExpiry, signal, "Exact strike positions are unavailable.");
        setStatus("LIVE");
        clearRebuildRetry();
        retryIndex = 0;
        return true;
      } catch (error) {
        return failRebuild(localGeneration, timeframe, requestedExpiry, signal, error?.message || "AXIS CALIBRATION UNAVAILABLE");
      }
    }

    async function syncTimeframe(label) {
      const timeframe = timeframeApi.timeframeKey(label);
      if (!timeframe) {
        generation += 1;
        rebuildAbort?.abort();
        rebuildAbort = null;
        clearRebuildRetry();
        desiredTimeframe = null;
        current = null;
        cachedAxisToY = null;
        hideRows("UNSUPPORTED TIMEFRAME");
        setStatus("UNSUPPORTED TIMEFRAME");
        return false;
      }
      if (desiredTimeframe === timeframe) return false;
      return rebuild(timeframe);
    }

    async function refreshLtp() {
      if (!current || refreshing) return false;
      refreshing = true;
      const snapshot = current;
      const snapshotGeneration = generation;
      try {
        const chain = await fetchChain(expiry);
        if (generation !== snapshotGeneration || current !== snapshot || snapshot.expiry !== expiry) return false;
        current = refreshMembership(snapshot, chain?.rows);
        renderRows(current.rows, current);
        return placeCached(current);
      } catch {
        setStatus("STALE");
        return false;
      } finally {
        refreshing = false;
      }
    }

    async function place() {
      const snapshot = current;
      if (!snapshot) return false;
      const placementGeneration = generation;
      try {
        const scale = await captureAxisScale();
        if (generation !== placementGeneration || !current) return false;
        if (!scale?.ok || !validPineSanity(scale)) throw new Error("Axis calibration unavailable.");
        const toY = axisPriceToY(scale.axisPairs);
        if (!toY) throw new Error("Native axis map is unavailable.");
        cachedAxisToY = toY;
        if (!placeCached(current)) throw new Error("Exact strike positions are unavailable.");
        setStatus("LIVE");
        return true;
      } catch (error) {
        if (generation !== placementGeneration || !current) return false;
        hideRows(error?.message || "AXIS CALIBRATION UNAVAILABLE");
        return false;
      }
    }

    async function setExpiry(nextExpiry) {
      if (!nextExpiry || nextExpiry === expiry) return false;
      expiry = nextExpiry;
      return desiredTimeframe ? rebuild(desiredTimeframe) : false;
    }

    function invalidate() {
      generation += 1;
      rebuildAbort?.abort();
      rebuildAbort = null;
      clearRebuildRetry();
      desiredTimeframe = null;
      current = null;
      cachedAxisToY = null;
    }

    return {
      invalidate,
      membership: () => current,
      place,
      rebuild,
      refreshLtp,
      setExpiry,
      syncTimeframe
    };
  }

  const api = { axisPriceToY, createLadderController, formatRow, freezeMembership, intervalFromAxisScale, refreshMembership };
  root.NiftyAxisLadderContent = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  let settings = { ...DEFAULTS };
  let controller = null;
  let refreshTimer = null;
  let timeframeTimer = null;
  let retryTimers = [];
  let currentLabel = null;
  let runtimeObserver = null;
  let placementListenersBound = false;

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
      existing.delete(row.strike);
    });
    existing.forEach((row) => row.remove());
    node.hidden = false;
  }

  function chartCanvas() {
    return document.querySelector('canvas[aria-label^="Chart for"]');
  }

  async function captureAxisScale(signal) {
    const canvas = chartCanvas();
    if (!canvas) throw new Error("TradingView chart canvas is unavailable.");
    const rect = canvas.getBoundingClientRect();
    let axisCandidates = [];
    try {
      const observed = JSON.parse(document.documentElement.getAttribute("data-nifty-axis-ticks") || "null");
      if (Date.now() - Number(observed?.at) < 10000 && Array.isArray(observed?.candidates)) {
        axisCandidates = observed.candidates;
      }
    } catch {
      // Background keeps a debugger-based fallback when page observation is unavailable.
    }
    const result = await chrome.runtime.sendMessage({
      type: "CAPTURE_AXIS_SCALE",
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      plotRect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      axisCandidates
    });
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (!result?.ok) throw new Error(result?.error || "TradingView axis capture failed.");
    return result;
  }

  async function fetchChain(expiry, signal) {
    const response = await fetch(`${API}/api/nifty-chain?expiry=${encodeURIComponent(expiry)}`, { cache: "no-store", signal });
    const chain = await response.json();
    if (!response.ok) throw new Error(chain.error || "Option chain unavailable.");
    return chain;
  }

  function placeRows(rows) {
    const canvas = chartCanvas();
    if (!canvas) return hideRows("TRADINGVIEW CHART UNAVAILABLE");
    const rect = canvas.getBoundingClientRect();
    const node = rootNode();
    rows.forEach((row) => {
      const element = node.querySelector(`.nifty-axis-ladder__row[data-strike="${row.strike}"]`);
      if (!element) return;
      const height = element.getBoundingClientRect().height || 22;
      element.style.right = `${Math.max(0, window.innerWidth - rect.right + 7)}px`;
      element.style.top = `${Math.round(row.y - height / 2)}px`;
    });
    node.hidden = false;
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

  async function rebuildCurrent(force = false) {
    const label = chartCanvas()?.getAttribute("aria-label") || "";
    currentLabel = label;
    const timeframe = timeframeApi.timeframeKey(label);
    if (!timeframe) return controller.syncTimeframe(label);
    const didRebuild = force ? await controller.rebuild(timeframe) : await controller.syncTimeframe(label);
    if (didRebuild) requestPlacementRetries();
    return didRebuild;
  }

  function scheduleTimeframeCheck() {
    clearTimeout(timeframeTimer);
    timeframeTimer = setTimeout(() => {
      const label = chartCanvas()?.getAttribute("aria-label") || "";
      if (label !== currentLabel) rebuildCurrent(false);
    }, 250);
  }

  function start() {
    if (controller) return;
    controller = createLadderController({
      expiry: settings.expiry,
      captureAxisScale,
      fetchChain,
      hideRows,
      placeRows,
      renderRows,
      setStatus: showStatus
    });
    rebuildCurrent(false);
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => { controller.refreshLtp(); }, 2000);
    runtimeObserver = new MutationObserver(scheduleTimeframeCheck);
    runtimeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["aria-label"],
      childList: true,
      subtree: true
    });
    if (!placementListenersBound) {
      window.addEventListener("resize", requestPlacementRetries);
      window.addEventListener("wheel", requestPlacementRetries, { passive: true });
      window.addEventListener("pointerup", requestPlacementRetries, { passive: true });
      placementListenersBound = true;
    }
  }

  function stop() {
    clearInterval(refreshTimer);
    clearTimeout(timeframeTimer);
    clearRetries();
    runtimeObserver?.disconnect();
    runtimeObserver = null;
    controller?.invalidate();
    controller = null;
    if (placementListenersBound) {
      window.removeEventListener("resize", requestPlacementRetries);
      window.removeEventListener("wheel", requestPlacementRetries);
      window.removeEventListener("pointerup", requestPlacementRetries);
      placementListenersBound = false;
    }
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
  });

  chrome.runtime.onMessage?.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "RETRY_LABEL_PLACEMENT") return false;
    if (!settings.enabled || !controller?.membership()) {
      sendResponse({ ok: false, error: "Enable ladder and wait for contracts first." });
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
