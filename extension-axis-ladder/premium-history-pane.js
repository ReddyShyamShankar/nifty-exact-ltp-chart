(function (root) {
  "use strict";
  const MODES = new Set(["LINES"]);
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
    if (mode === "LINES" && RIGHTS.has(focusRight)) return focusRight === "CALL"
      ? { mode, call: "line", put: "dashed-line" }
      : { mode, call: "dashed-line", put: "line" };
    return null;
  }

  function premiumTimelinePoints(points) {
    return (Array.isArray(points) ? points : []).filter((point) =>
      Number.isFinite(Number(point?.time))
      && ((point?.call && Number.isFinite(Number(point.call.close)))
        || (point?.put && Number.isFinite(Number(point.put.close)))));
  }

  function emptyHistoryContext(state) {
    if (!premiumTimelinePoints(state?.view?.points).length) return "NO CONTRACT HISTORY";
    return "CONTRACT HISTORY READY";
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

  function activeTimeLabel(activeTime) {
    if (activeTime === null || activeTime === undefined || !Number.isFinite(Number(activeTime))) return "AT CROSSHAIR";
    return `AT ${new Date(Number(activeTime)).toLocaleString()}`;
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

  function independentTimeAxis(points, width, maxTicks = 6) {
    const times = Array.from(new Set((Array.isArray(points) ? points : [])
      .map((point) => Number(point?.time)).filter(Number.isFinite))).sort((left, right) => left - right);
    const canvasWidth = Number(width);
    if (!times.length || !Number.isFinite(canvasWidth) || canvasWidth < 96) return null;
    const left = 48;
    const right = Math.max(left + 1, canvasWidth - 12);
    const from = times[0];
    const to = times.at(-1);
    const span = to - from;
    const xOf = span > 0
      ? (time) => left + (Number(time) - from) / span * (right - left)
      : () => left + (right - left) / 2;
    const requestedTicks = Math.max(2, Math.floor(Number(maxTicks) || 6));
    const tickCount = span > 0 ? Math.min(requestedTicks, times.length) : 1;
    const format = new Intl.DateTimeFormat("en-IN", span <= 2 * 86400000
      ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
      : { day: "2-digit", month: "short", year: from && new Date(from).getFullYear() !== new Date(to).getFullYear() ? "2-digit" : undefined });
    const ticks = Array.from({ length: tickCount }, (_, index) => {
      const time = tickCount === 1 ? from : from + span * index / (tickCount - 1);
      return Object.freeze({ time, x: xOf(time), label: format.format(new Date(time)) });
    });
    return Object.freeze({ source: "PREMIUM_HISTORY", from, to, left, right, ticks: Object.freeze(ticks), xOf });
  }

  function piecewiseMapper(rows, inputKey, outputKey) {
    const pairs = (Array.isArray(rows) ? rows : [])
      .map((row) => ({ input: Number(row?.[inputKey]), output: Number(row?.[outputKey]) }))
      .filter((row) => Number.isFinite(row.input) && Number.isFinite(row.output))
      .sort((left, right) => left.input - right.input);
    if (pairs.length < 2) return null;
    for (let index = 1; index < pairs.length; index += 1) {
      if (pairs[index].input <= pairs[index - 1].input || pairs[index].output <= pairs[index - 1].output) return null;
    }
    return (value) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return NaN;
      let left = pairs[0];
      let right = pairs[1];
      if (numeric >= pairs.at(-1).input) {
        left = pairs.at(-2);
        right = pairs.at(-1);
      } else if (numeric > pairs[0].input) {
        const upperIndex = pairs.findIndex((pair) => pair.input >= numeric);
        left = pairs[Math.max(0, upperIndex - 1)];
        right = pairs[upperIndex];
      }
      return left.output + (numeric - left.input) / (right.input - left.input) * (right.output - left.output);
    };
  }

  function synchronizedTimeAxis(timeAxis, width) {
    const rect = timeAxis?.plotRect;
    const pairs = Array.isArray(timeAxis?.pairs) ? timeAxis.pairs : [];
    const canvasWidth = Number(width);
    if (!rect || pairs.length < 2 || !Number.isFinite(canvasWidth) || canvasWidth < 1) return null;
    const left = Number(rect.left);
    const right = Number(rect.right);
    if (![left, right].every(Number.isFinite) || right <= left) return null;
    const normalized = pairs.map((pair) => ({ time: Number(pair?.time), screenX: Number(pair?.x) }))
      .filter((pair) => Number.isFinite(pair.time) && Number.isFinite(pair.screenX))
      .sort((a, b) => a.time - b.time);
    const screenXOf = piecewiseMapper(normalized, "time", "screenX");
    const timeAtClientX = piecewiseMapper(normalized, "screenX", "time");
    if (!screenXOf || !timeAtClientX) return null;
    const from = normalized[0].time;
    const to = normalized.at(-1).time;
    const xOf = (time) => Math.max(0, Math.min(canvasWidth, screenXOf(time) - left));
    const span = to - from;
    const format = new Intl.DateTimeFormat("en-IN", span <= 2 * 86400000
      ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
      : { day: "2-digit", month: "short", year: new Date(from).getFullYear() !== new Date(to).getFullYear() ? "2-digit" : undefined });
    const ticks = normalized.map((pair) => Object.freeze({
      time: pair.time,
      x: xOf(pair.time),
      label: format.format(new Date(pair.time))
    }));
    return Object.freeze({ source: "TRADINGVIEW", from, to, left: 0, right: canvasWidth,
      plotRect: Object.freeze({ ...rect }), ticks: Object.freeze(ticks), xOf, timeAtClientX });
  }

  function synchronizedCrosshair(points, timeAxis, clientX) {
    const rect = timeAxis?.plotRect;
    const width = Number(rect?.right) - Number(rect?.left);
    const axis = synchronizedTimeAxis(timeAxis, width);
    const numericX = Number(clientX);
    if (!axis || !Number.isFinite(numericX)) return null;
    const localX = numericX - Number(rect.left);
    const candles = (Array.isArray(points) ? points : [])
      .filter((point) => Number.isFinite(Number(point?.time))
        && Number(point.time) >= axis.from && Number(point.time) <= axis.to
        && (point.underlying || point.call || point.put))
      .map((point) => ({ point, x: axis.xOf(point.time) }))
      .filter((item) => Number.isFinite(item.x))
      .sort((left, right) => left.x - right.x);
    if (!candles.length) return null;
    const nearest = candles.reduce((closest, candidate) =>
      Math.abs(candidate.x - localX) < Math.abs(closest.x - localX) ? candidate : closest,
    candles[0]);
    const gaps = candles.slice(1)
      .map((item, index) => Number(item.x) - Number(candles[index].x))
      .filter((gap) => Number.isFinite(gap) && gap > 0)
      .sort((left, right) => left - right);
    const normalGap = gaps.length
      ? gaps.length % 2
        ? gaps[Math.floor(gaps.length / 2)]
        : (gaps[gaps.length / 2 - 1] + gaps[gaps.length / 2]) / 2
      : 8;
    const candle = Math.abs(nearest.x - localX) <= Math.max(4, normalGap / 2) ? nearest.point : null;
    const point = candle && ((candle.call && Number.isFinite(Number(candle.call.close)))
      || (candle.put && Number.isFinite(Number(candle.put.close)))) ? candle : null;
    return { clientX: numericX, localX, time: candle ? Number(candle.time) : null, candle, point };
  }

  function underlyingTouchesStrike(point, strike) {
    const numericStrike = Number(strike);
    const low = Number(point?.underlying?.low);
    const high = Number(point?.underlying?.high);
    if (!Number.isFinite(numericStrike) || !Number.isFinite(low) || !Number.isFinite(high)) return false;
    return Math.min(low, high) <= numericStrike && numericStrike <= Math.max(low, high);
  }

  function strikeTouchMarkers(points, strike, timeAxis) {
    const rect = timeAxis?.plotRect;
    const width = Number(rect?.right) - Number(rect?.left);
    const axis = synchronizedTimeAxis(timeAxis, width);
    if (!axis) return [];
    return (Array.isArray(points) ? points : [])
      .filter((point) => Number.isFinite(Number(point?.time))
        && Number(point.time) >= axis.from
        && Number(point.time) <= axis.to
        && underlyingTouchesStrike(point, strike))
      .map((point) => ({
        time: Number(point.time),
        clientX: Number(rect.left) + axis.xOf(point.time)
      }))
      .filter((marker) => Number.isFinite(marker.clientX)
        && marker.clientX >= Number(rect.left)
        && marker.clientX <= Number(rect.right));
  }

  function createDomRenderer(documentRef, host) {
    let node = null;
    let canvas = null;
    let latestState = null;
    let hoverPoint = null;
    let chartCrosshair = null;
    let documentPointerListener = null;
    let paintFrame = null;

    function schedulePaint() {
      if (paintFrame !== null) return;
      const requestFrame = root.requestAnimationFrame || ((callback) => root.setTimeout(callback, 16));
      paintFrame = requestFrame(() => {
        paintFrame = null;
        if (latestState) paint(latestState);
      });
    }

    function isChartCanvasAtPlot(target, plotRect) {
      if (String(target?.tagName || "").toUpperCase() !== "CANVAS" || target === canvas) return false;
      const rect = target.getBoundingClientRect?.();
      if (!rect || !plotRect) return false;
      return Math.abs(Number(rect.left) - Number(plotRect.left)) <= 2
        && Math.abs(Number(rect.right) - Number(plotRect.right)) <= 2
        && Math.abs(Number(rect.top) - Number(plotRect.top)) <= 2
        && Math.abs(Number(rect.bottom) - Number(plotRect.bottom)) <= 2;
    }

    function bindDocumentPointer() {
      if (documentPointerListener) return;
      documentPointerListener = (event) => {
        const timeAxis = latestState?.timeAxis;
        if (!isChartCanvasAtPlot(event.target, timeAxis?.plotRect)) {
          if (chartCrosshair && event.target !== canvas) {
            chartCrosshair = null;
            hoverPoint = null;
            schedulePaint();
          }
          return;
        }
        chartCrosshair = synchronizedCrosshair(latestState?.view?.points, timeAxis, event.clientX);
        hoverPoint = chartCrosshair?.point || null;
        schedulePaint();
      };
      documentRef.addEventListener("pointermove", documentPointerListener, true);
    }

    function unbindDocumentPointer() {
      if (!documentPointerListener) return;
      documentRef.removeEventListener("pointermove", documentPointerListener, true);
      documentPointerListener = null;
      chartCrosshair = null;
      hoverPoint = null;
    }

    function ensureNode() {
      if (node?.isConnected) return node;
      node = documentRef.createElement("section");
      node.id = "options-premium-history";
      node.setAttribute("aria-label", "Option premium history");
      node.innerHTML = `<header class="options-premium-history__header">
        <div class="options-premium-history__identity"></div>
        <div class="options-premium-history__modes" role="group" aria-label="Premium history view">
          <button type="button" data-mode="LINES">LINES</button>
        </div>
        <div class="options-premium-history__focus" role="group" aria-label="Emphasized option side">
          <button type="button" data-right="CALL">CALL</button><button type="button" data-right="PUT">PUT</button>
        </div>
        <button type="button" class="options-premium-history__close" aria-label="Close premium history">×</button>
      </header><div class="options-premium-history__context"></div>
      <div class="options-premium-history__status" role="status" aria-live="polite"></div>
      <canvas class="options-premium-history__canvas" tabindex="0" aria-label="Call and Put premium history chart"></canvas>
      <div class="options-premium-history__tooltip" hidden></div>`;
      host.append(node);
      canvas = node.querySelector("canvas");
      bindDocumentPointer();
      canvas.addEventListener("pointermove", (event) => {
        chartCrosshair = null;
        const points = premiumTimelinePoints(latestState?.view?.points);
        const bounds = canvas.getBoundingClientRect();
        if (!points.length || !bounds.width) return;
        const xOf = independentTimeAxis(points, bounds.width)?.xOf;
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

    function drawTimeAxis(context, axis, height, color) {
      if (!axis) return;
      const lineY = height - 25;
      context.save();
      context.strokeStyle = color;
      context.fillStyle = color;
      context.lineWidth = 1;
      context.font = "11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      context.beginPath();
      context.moveTo(axis.left, lineY);
      context.lineTo(axis.right, lineY);
      context.stroke();
      axis.ticks.forEach((tick, index) => {
        context.beginPath();
        context.moveTo(tick.x, lineY);
        context.lineTo(tick.x, lineY + 4);
        context.stroke();
        context.textAlign = index === 0 ? "left" : index === axis.ticks.length - 1 ? "right" : "center";
        context.textBaseline = "bottom";
        context.fillText(tick.label, tick.x, height - 3);
      });
      context.restore();
    }

    function paint(state) {
      latestState = state;
      if (state.status === "closed") {
        unbindDocumentPointer();
        node?.remove();
        node = null;
        canvas = null;
        return;
      }
      const element = ensureNode();
      const selection = state.selection || {};
      element.querySelector(".options-premium-history__identity").textContent = `${formatNumber(selection.strike, 0)} · ${selection.expiry || "—"} · ${selection.interval || "—"}`;
      element.querySelectorAll("[data-mode]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.mode === state.mode)));
      element.querySelectorAll("[data-right]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.right === state.focusRight)));
      const status = element.querySelector(".options-premium-history__status");
      status.textContent = state.status === "loading" ? "LOADING CONTRACT HISTORY"
        : state.status === "stale" ? `STALE · ${state.error || "REFRESH FAILED"}`
          : state.status === "unavailable" ? state.error || "CONTRACT HISTORY UNAVAILABLE"
            : state.timeAxis ? "" : "INDEPENDENT VIEW · MOVE TRADINGVIEW CROSSHAIR TO SYNCHRONIZE";
      const allPoints = premiumTimelinePoints(state.view?.points);
      const plotRect = state.timeAxis?.plotRect;
      const synchronizedWidth = Number(plotRect?.right) - Number(plotRect?.left);
      const syncAxis = synchronizedTimeAxis(state.timeAxis, synchronizedWidth);
      if (syncAxis) {
        element.style.left = `${Math.max(0, Number(plotRect.left))}px`;
        element.style.right = `${Math.max(0, Number(root.innerWidth || plotRect.right) - Number(plotRect.right))}px`;
      } else {
        element.style.left = "12px";
        element.style.right = "96px";
      }
      const points = syncAxis ? clipPoints(allPoints, { from: syncAxis.from, to: syncAxis.to }) : allPoints;
      const last = chartCrosshair ? chartCrosshair.point : hoverPoint || points.at(-1);
      const activeTime = chartCrosshair ? chartCrosshair.time : last?.time;
      const activeTimeText = activeTimeLabel(activeTime);
      const assumptions = state.view?.assumptions;
      element.querySelector(".options-premium-history__context").textContent = chartCrosshair && !last
        ? `${activeTimeText} · GAP · NO PREMIUM CANDLE`
        : last
        ? `${activeTimeText} · UNDERLYING ${formatNumber(last.underlying?.close)} · DIST ${formatNumber(last.distance)} · DTE ${formatNumber(last.dteDays, 1)} · C ${formatNumber(last.call?.close)} · P ${formatNumber(last.put?.close)} · C+P ${formatNumber(last.combinedClose)} · ESTIMATED IV C ${formatNumber(last.callIv?.value == null ? null : last.callIv.value * 100)}% P ${formatNumber(last.putIv?.value == null ? null : last.putIv.value * 100)}%${assumptions ? ` · ${assumptions.model} r ${formatNumber(assumptions.rate * 100)}% q ${formatNumber(assumptions.carry * 100)}%` : ""}`
        : emptyHistoryContext(state);
      canvas.hidden = !allPoints.length;
      const width = Math.max(320, Math.floor(syncAxis ? synchronizedWidth : element.clientWidth || 640));
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
      const axis = syncAxis || independentTimeAxis(points, width);
      const xOf = axis?.xOf;
      const plotHeight = height - 28;
      drawLine(context, points, (point) => Number(point.call?.close), xOf, width, plotHeight, state.focusRight !== "CALL");
      drawLine(context, points, (point) => Number(point.put?.close), xOf, width, plotHeight, state.focusRight !== "PUT");
      drawTimeAxis(context, axis, height, computed.getPropertyValue("--theme-ink-dim") || computed.color);
      if (xOf) {
        for (const trade of (state.view?.trades || [])) {
          if (trade.timestamp < axis.from || trade.timestamp > axis.to) continue;
          const x = xOf(trade.timestamp);
          context.fillStyle = trade.direction === "BUY"
            ? computed.getPropertyValue("--ladder-buy")
            : computed.getPropertyValue("--ladder-sell");
          context.fillRect(x - 2, plotHeight - 14, 4, 12);
        }
        if (hoverPoint || chartCrosshair) {
          const x = chartCrosshair ? chartCrosshair.localX : xOf(hoverPoint.time);
          context.strokeStyle = computed.getPropertyValue("--theme-line-2") || computed.color;
          context.setLineDash([2, 3]);
          context.beginPath();
          context.moveTo(x, 0);
          context.lineTo(x, plotHeight);
          context.stroke();
          context.setLineDash([]);
          const tooltip = element.querySelector(".options-premium-history__tooltip");
          tooltip.hidden = false;
          tooltip.style.left = `${Math.max(4, Math.min(width - 180, x + 8))}px`;
          tooltip.style.top = "76px";
          tooltip.textContent = hoverPoint
            ? `${activeTimeText} · C ${formatNumber(hoverPoint.call?.close)} · P ${formatNumber(hoverPoint.put?.close)}`
            : `${activeTimeText} · GAP · NO PREMIUM CANDLE`;
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

  const api = { activeTimeLabel, clipPoints, createDomRenderer, createPremiumHistoryPane, emptyHistoryContext, independentTimeAxis, premiumTimelinePoints, rendererDescriptor, selectionKey, strikeTouchMarkers, synchronizedCrosshair, synchronizedTimeAxis, timeXMapper, underlyingTouchesStrike };
  root.OptionsPremiumHistoryPane = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
