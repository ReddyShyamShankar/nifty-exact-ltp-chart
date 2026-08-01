(function (root) {
  "use strict";
  const MODES = new Set(["LINES", "SPLIT", "FOCUS"]);
  const RIGHTS = new Set(["CALL", "PUT"]);

  function selectionKey(selection) {
    return [selection?.instrumentKey, selection?.expiry, selection?.strike, selection?.interval,
      selection?.from, selection?.to].join("|");
  }

  function clipPoints(points, range) {
    const from = Number(range?.from);
    const to = Number(range?.to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) return [];
    return (Array.isArray(points) ? points : []).filter((point) => Number(point?.time) >= from && Number(point?.time) <= to);
  }

  function rendererDescriptor(mode, focusRight = "CALL") {
    if (mode === "LINES") return { mode, call: "line", put: "dashed-line" };
    if (mode === "SPLIT") return { mode, call: "candles", put: "candles" };
    if (mode === "FOCUS" && RIGHTS.has(focusRight)) {
      return { mode, focus: focusRight, secondary: focusRight === "CALL" ? "PUT" : "CALL" };
    }
    return null;
  }

  function emptyHistoryContext(state) {
    if (!Array.isArray(state?.view?.points) || !state.view.points.length) return "NO CONTRACT HISTORY";
    return state.timeAxis
      ? "NO HISTORY INSIDE VISIBLE CHART RANGE"
      : "CONTRACT HISTORY READY · WAITING FOR TIME AXIS";
  }

  function createPremiumHistoryPane({ loadHistory, render = () => {} }) {
    if (typeof loadHistory !== "function") throw new TypeError("Premium-history loader is required.");
    const cache = new Map();
    const inFlight = new Map();
    let generation = 0;
    let abortController = null;
    let current = {
      status: "closed", selection: null, view: null,
      mode: "LINES", focusRight: "CALL", timeAxis: null, error: null
    };

    function snapshot() { return { ...current }; }
    function publish() { render(snapshot()); }

    async function open(selection) {
      const key = selectionKey(selection);
      const currentKey = selectionKey(current.selection);
      if (currentKey === key && current.status === "ready") return true;
      if (currentKey === key && current.status === "loading" && inFlight.has(key)) {
        try {
          await inFlight.get(key);
          return current.status === "ready";
        } catch {
          return false;
        }
      }
      const localGeneration = ++generation;
      abortController?.abort();
      abortController = new AbortController();
      current = { ...current, status: "loading", selection: { ...selection }, view: cache.get(key) || null, error: null };
      publish();
      if (cache.has(key)) {
        current = { ...current, status: "ready", view: cache.get(key) };
        publish();
        return true;
      }
      let pending = inFlight.get(key);
      if (!pending) {
        pending = Promise.resolve(loadHistory({ ...selection }, abortController.signal));
        inFlight.set(key, pending);
        pending.finally(() => inFlight.delete(key)).catch(() => {});
      }
      try {
        const view = await pending;
        cache.set(key, view);
        if (generation !== localGeneration || selectionKey(current.selection) !== key) return false;
        current = { ...current, status: "ready", view, error: null };
        publish();
        return true;
      } catch (error) {
        if (generation !== localGeneration) return false;
        current = {
          ...current,
          status: current.view ? "stale" : "unavailable",
          error: error?.message || "CONTRACT HISTORY UNAVAILABLE"
        };
        publish();
        return false;
      }
    }

    function close() {
      generation += 1;
      abortController?.abort();
      abortController = null;
      current = { ...current, status: "closed", selection: null, view: null, timeAxis: null, error: null };
      publish();
    }

    function setMode(mode) {
      if (!MODES.has(mode)) return false;
      current = { ...current, mode };
      publish();
      return true;
    }

    function setFocusRight(right) {
      if (!RIGHTS.has(right)) return false;
      current = { ...current, focusRight: right };
      publish();
      return true;
    }

    function setTimeAxis(timeAxis) {
      current = { ...current, timeAxis: timeAxis || null };
      publish();
      return Boolean(timeAxis);
    }

    return {
      close,
      destroy: close,
      open,
      setFocusRight,
      setMode,
      setTimeAxis,
      state: snapshot
    };
  }

  function formatNumber(value, digits = 2) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "—";
  }

  function timeXMapper(timeAxis, width) {
    const pairs = Array.isArray(timeAxis?.pairs) ? timeAxis.pairs : [];
    const rect = timeAxis?.plotRect;
    if (pairs.length < 2 || !rect) return null;
    const first = pairs[0];
    const last = pairs.at(-1);
    const span = Number(last.time) - Number(first.time);
    const xSpan = Number(last.x) - Number(first.x);
    if (![span, xSpan, rect.left].every(Number.isFinite) || span <= 0 || xSpan <= 0) return null;
    return (time) => Math.max(0, Math.min(width,
      Number(first.x) - Number(rect.left) + (Number(time) - Number(first.time)) / span * xSpan));
  }

  function createDomRenderer(documentRef, host) {
    let node = null;
    let canvas = null;
    let latestState = null;
    let hoverPoint = null;

    function ensureNode() {
      if (node?.isConnected) return node;
      node = documentRef.createElement("section");
      node.id = "options-premium-history";
      node.setAttribute("aria-label", "Option premium history");
      node.innerHTML = `<header class="options-premium-history__header">
        <div class="options-premium-history__identity"></div>
        <div class="options-premium-history__modes" role="group" aria-label="Premium history view">
          <button type="button" data-mode="LINES">LINES</button><button type="button" data-mode="SPLIT">SPLIT</button><button type="button" data-mode="FOCUS">FOCUS</button>
        </div>
        <div class="options-premium-history__focus" role="group" aria-label="Focused option side">
          <button type="button" data-right="CALL">CALL</button><button type="button" data-right="PUT">PUT</button>
        </div>
        <button type="button" class="options-premium-history__close" aria-label="Close premium history">×</button>
      </header><div class="options-premium-history__context"></div>
      <div class="options-premium-history__status" role="status" aria-live="polite"></div>
      <canvas class="options-premium-history__canvas" tabindex="0" aria-label="Call and Put premium history chart"></canvas>
      <div class="options-premium-history__tooltip" hidden></div>`;
      host.append(node);
      canvas = node.querySelector("canvas");
      canvas.addEventListener("pointermove", (event) => {
        const axisPairs = Array.isArray(latestState?.timeAxis?.pairs) ? latestState.timeAxis.pairs : [];
        const points = axisPairs.length >= 2
          ? clipPoints(latestState?.view?.points, { from: axisPairs[0].time, to: axisPairs.at(-1).time })
          : [];
        const bounds = canvas.getBoundingClientRect();
        if (!points.length || !bounds.width) return;
        const xOf = timeXMapper(latestState.timeAxis, bounds.width);
        const targetX = event.clientX - bounds.left;
        hoverPoint = xOf ? points.reduce((nearest, point) =>
          Math.abs(xOf(point.time) - targetX) < Math.abs(xOf(nearest.time) - targetX) ? point : nearest, points[0])
          : points[Math.max(0, Math.min(points.length - 1, Math.round(targetX / bounds.width * (points.length - 1))))];
        paint(latestState);
      });
      canvas.addEventListener("pointerleave", () => { hoverPoint = null; paint(latestState); });
      return node;
    }

    function drawLine(context, points, valueOf, xOf, width, height, dashed) {
      const values = points.map(valueOf).filter(Number.isFinite);
      if (values.length < 2) return;
      const min = Math.min(...values);
      const max = Math.max(...values);
      const span = max - min || 1;
      context.setLineDash(dashed ? [6, 5] : []);
      context.beginPath();
      let started = false;
      points.forEach((point, index) => {
        const value = valueOf(point);
        if (!Number.isFinite(value)) { started = false; return; }
        const x = xOf ? xOf(point.time) : points.length === 1 ? width / 2 : index / (points.length - 1) * width;
        const y = height - 12 - (value - min) / span * (height - 24);
        if (!started) context.moveTo(x, y); else context.lineTo(x, y);
        started = true;
      });
      context.stroke();
      context.setLineDash([]);
    }

    function drawCandles(context, points, side, xOf, width, top, height) {
      const candles = points.map((point) => point[side.toLowerCase()]).filter(Boolean);
      const values = candles.flatMap((item) => [item.high, item.low]).filter(Number.isFinite);
      if (!values.length) return;
      const min = Math.min(...values);
      const max = Math.max(...values);
      const span = max - min || 1;
      const body = Math.max(2, Math.min(7, width / Math.max(1, points.length) * 0.55));
      points.forEach((point, index) => {
        const candle = point[side.toLowerCase()];
        if (!candle) return;
        const x = xOf ? xOf(point.time) : points.length === 1 ? width / 2 : index / (points.length - 1) * width;
        const toY = (value) => top + height - 8 - (value - min) / span * (height - 16);
        context.beginPath();
        context.moveTo(x, toY(candle.high));
        context.lineTo(x, toY(candle.low));
        context.stroke();
        context.strokeRect(x - body / 2, Math.min(toY(candle.open), toY(candle.close)), body, Math.max(1, Math.abs(toY(candle.open) - toY(candle.close))));
      });
    }

    function paint(state) {
      latestState = state;
      if (state.status === "closed") { node?.remove(); node = null; canvas = null; return; }
      const element = ensureNode();
      const selection = state.selection || {};
      element.querySelector(".options-premium-history__identity").textContent = `${formatNumber(selection.strike, 0)} · ${selection.expiry || "—"} · ${selection.interval || "—"}`;
      element.querySelectorAll("[data-mode]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.mode === state.mode)));
      element.querySelectorAll("[data-right]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.right === state.focusRight)));
      element.querySelector(".options-premium-history__focus").hidden = state.mode !== "FOCUS";
      const status = element.querySelector(".options-premium-history__status");
      status.textContent = state.status === "loading" ? "LOADING CONTRACT HISTORY"
        : state.status === "stale" ? `STALE · ${state.error || "REFRESH FAILED"}`
          : state.status === "unavailable" ? state.error || "CONTRACT HISTORY UNAVAILABLE"
            : state.timeAxis ? "" : "TIME AXIS UNAVAILABLE";
      const axisPairs = Array.isArray(state.timeAxis?.pairs) ? state.timeAxis.pairs : [];
      const axisRange = axisPairs.length >= 2
        ? { from: Number(axisPairs[0].time), to: Number(axisPairs.at(-1).time) }
        : null;
      const points = axisRange ? clipPoints(state.view?.points, axisRange) : [];
      const last = hoverPoint || points.at(-1);
      const assumptions = state.view?.assumptions;
      element.querySelector(".options-premium-history__context").textContent = last
        ? `UNDERLYING ${formatNumber(last.underlying?.close)} · DIST ${formatNumber(last.distance)} · DTE ${formatNumber(last.dteDays, 1)} · C ${formatNumber(last.call?.close)} · P ${formatNumber(last.put?.close)} · C+P ${formatNumber(last.combinedClose)} · ESTIMATED IV C ${formatNumber(last.callIv?.value == null ? null : last.callIv.value * 100)}% P ${formatNumber(last.putIv?.value == null ? null : last.putIv.value * 100)}%${assumptions ? ` · ${assumptions.model} r ${formatNumber(assumptions.rate * 100)}% q ${formatNumber(assumptions.carry * 100)}%` : ""}`
        : emptyHistoryContext(state);
      const rect = state.timeAxis?.plotRect || state.plotRect;
      canvas.hidden = !state.timeAxis;
      if (rect && Number.isFinite(Number(rect.left)) && Number.isFinite(Number(rect.right))) {
        element.style.left = `${Math.max(0, Number(rect.left))}px`;
        element.style.right = `${Math.max(0, Number(root.innerWidth || rect.right) - Number(rect.right))}px`;
      }
      const width = Math.max(320, Math.floor(rect?.right - rect?.left || element.clientWidth || 640));
      const height = 220;
      canvas.width = width * (root.devicePixelRatio || 1);
      canvas.height = height * (root.devicePixelRatio || 1);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const context = canvas.getContext("2d");
      context.scale(root.devicePixelRatio || 1, root.devicePixelRatio || 1);
      const computed = getComputedStyle(element);
      context.strokeStyle = computed.color;
      context.lineWidth = 1.5;
      const xOf = timeXMapper(state.timeAxis, width);
      if (state.mode === "LINES") {
        drawLine(context, points, (point) => Number(point.call?.close), xOf, width, height, false);
        drawLine(context, points, (point) => Number(point.put?.close), xOf, width, height, true);
      } else if (state.mode === "SPLIT") {
        drawCandles(context, points, "CALL", xOf, width, 0, height / 2);
        drawCandles(context, points, "PUT", xOf, width, height / 2, height / 2);
      } else {
        drawCandles(context, points, state.focusRight, xOf, width, 0, height * 0.76);
        const secondary = state.focusRight === "CALL" ? "put" : "call";
        drawLine(context, points, (point) => Number(point[secondary]?.close), xOf, width, height, true);
      }
      if (xOf) {
        for (const trade of (state.view?.trades || [])) {
          if (trade.timestamp < axisRange.from || trade.timestamp > axisRange.to) continue;
          const x = xOf(trade.timestamp);
          context.fillStyle = trade.direction === "BUY"
            ? computed.getPropertyValue("--ladder-buy")
            : computed.getPropertyValue("--ladder-sell");
          context.fillRect(x - 2, height - 14, 4, 12);
        }
        if (hoverPoint) {
          const x = xOf(hoverPoint.time);
          context.strokeStyle = computed.getPropertyValue("--theme-line-2") || computed.color;
          context.setLineDash([2, 3]);
          context.beginPath();
          context.moveTo(x, 0);
          context.lineTo(x, height);
          context.stroke();
          context.setLineDash([]);
          const tooltip = element.querySelector(".options-premium-history__tooltip");
          tooltip.hidden = false;
          tooltip.style.left = `${Math.max(4, Math.min(width - 180, x + 8))}px`;
          tooltip.style.top = "76px";
          tooltip.textContent = `${new Date(hoverPoint.time).toLocaleString()} · C ${formatNumber(hoverPoint.call?.close)} · P ${formatNumber(hoverPoint.put?.close)}`;
        } else {
          element.querySelector(".options-premium-history__tooltip").hidden = true;
        }
      }
    }

    return {
      bind(controller) {
        const element = ensureNode();
        element.addEventListener("click", (event) => {
          const mode = event.target?.dataset?.mode;
          const right = event.target?.dataset?.right;
          if (mode) controller.setMode(mode);
          if (right) controller.setFocusRight(right);
          if (event.target?.closest?.(".options-premium-history__close")) controller.close();
        });
      },
      render: paint
    };
  }

  const api = { clipPoints, createDomRenderer, createPremiumHistoryPane, emptyHistoryContext, rendererDescriptor, selectionKey, timeXMapper };
  root.OptionsPremiumHistoryPane = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
