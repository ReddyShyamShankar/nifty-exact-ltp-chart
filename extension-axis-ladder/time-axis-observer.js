(function (root) {
  "use strict";
  const ATTRIBUTE = "data-options-time-axis";
  const SYNC_ATTRIBUTE = "data-options-time-sync";
  const MONTHS = new Map([["jan", 0], ["feb", 1], ["mar", 2], ["apr", 3], ["may", 4], ["jun", 5],
    ["jul", 6], ["aug", 7], ["sep", 8], ["oct", 9], ["nov", 10], ["dec", 11]]);

  function timeSyncEnabled(value) {
    return String(value || "").toLowerCase() === "on";
  }

  function parseTimeLabel(value, anchor = Date.now()) {
    const text = String(value || "").trim();
    if (!text) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      const parsed = Date.parse(`${text}T00:00:00.000Z`);
      return Number.isFinite(parsed) ? parsed : null;
    }
    const time = text.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    const monthDay = text.match(/^([A-Za-z]{3})\s+(\d{1,2})$/);
    const monthOnly = text.match(/^([A-Za-z]{3})$/);
    const monthOnlyIndex = MONTHS.get(monthOnly?.[1]?.toLowerCase());
    if (!time && !(monthDay && MONTHS.has(monthDay[1].toLowerCase())) && monthOnlyIndex === undefined) return null;
    const base = new Date(anchor);
    if (!Number.isFinite(base.getTime())) return null;
    if (time) return Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), Number(time[1]), Number(time[2]));
    if (monthDay && MONTHS.has(monthDay[1].toLowerCase())) {
      const parsed = Date.UTC(base.getUTCFullYear(), MONTHS.get(monthDay[1].toLowerCase()), Number(monthDay[2]));
      return Number.isFinite(parsed) ? parsed : null;
    }
    if (monthOnlyIndex !== undefined) {
      const candidates = [-1, 0, 1].map((offset) => Date.UTC(base.getUTCFullYear() + offset, monthOnlyIndex, 1));
      return candidates.reduce((nearest, candidate) =>
        Math.abs(candidate - anchor) < Math.abs(nearest - anchor) ? candidate : nearest);
    }
    return null;
  }

  function timeToX(pairs) {
    const rows = (Array.isArray(pairs) ? pairs : [])
      .map((pair) => ({ time: Number(pair?.time), x: Number(pair?.x) }))
      .filter((pair) => Number.isFinite(pair.time) && Number.isFinite(pair.x))
      .sort((left, right) => left.x - right.x);
    if (rows.length < 2) return null;
    for (let index = 1; index < rows.length; index += 1) {
      if (rows[index].x <= rows[index - 1].x || rows[index].time <= rows[index - 1].time) return null;
    }
    const first = rows[0];
    const last = rows.at(-1);
    const millisecondsPerPixel = (last.time - first.time) / (last.x - first.x);
    if (!Number.isFinite(millisecondsPerPixel) || millisecondsPerPixel <= 0) return null;
    return (time) => first.x + (Number(time) - first.time) / millisecondsPerPixel;
  }

  function chartSourceGeometry(rect, documentRef = root.document) {
    if (!rect || !documentRef?.querySelectorAll) return null;
    const matches = [...documentRef.querySelectorAll('canvas[aria-label^="Chart for"]')]
      .map((canvas) => ({ canvas, rect: canvas.getBoundingClientRect?.(), label: canvas.getAttribute?.("aria-label") }))
      .filter((item) => item.rect && /^Chart for\b/.test(String(item.label || "")))
      .filter((item) => Math.abs(Number(rect.top) - Number(item.rect.bottom)) <= 12
        && Math.abs(Number(rect.left) - Number(item.rect.left)) <= 12
        && Math.abs(Number(rect.right) - Number(item.rect.right)) <= 12)
      .sort((left, right) => Math.abs(Number(rect.top) - Number(left.rect.bottom))
        - Math.abs(Number(rect.top) - Number(right.rect.bottom)));
    const match = matches[0];
    return match ? { sourceLabel: match.label, plotRect: match.rect } : null;
  }

  function chartSourceLabel(rect, documentRef = root.document) {
    return chartSourceGeometry(rect, documentRef)?.sourceLabel || null;
  }

  function createFrameGeometryReader(rootRef = root) {
    let cache = new WeakMap();
    let resetPending = false;
    function reset() {
      cache = new WeakMap();
      resetPending = false;
    }
    return function readGeometry(canvas) {
      if (!canvas?.getBoundingClientRect) return null;
      if (cache.has(canvas)) return cache.get(canvas);
      const rect = canvas.getBoundingClientRect();
      const match = rect?.width && rect?.height && canvas.width && canvas.height
        ? chartSourceGeometry(rect, rootRef.document)
        : null;
      const geometry = match ? { rect, ...match } : null;
      cache.set(canvas, geometry);
      if (!resetPending && typeof rootRef.requestAnimationFrame === "function") {
        resetPending = true;
        rootRef.requestAnimationFrame(reset);
      }
      return geometry;
    };
  }

  function projectedTimeFill(context, text, x, y, readGeometry, anchor = Date.now()) {
    const time = parseTimeLabel(text, anchor);
    if (time === null) return null;
    const canvas = context?.canvas;
    const geometry = readGeometry?.(canvas);
    if (!geometry?.rect?.width || !canvas?.width) return null;
    const transform = context.getTransform();
    const deviceX = transform.a * Number(x) + transform.c * Number(y) + transform.e;
    const screenX = Number(geometry.rect.left) + deviceX * Number(geometry.rect.width) / Number(canvas.width);
    if (!Number.isFinite(screenX)) return null;
    return { time, x: screenX, sourceLabel: geometry.sourceLabel, plotRect: {
      left: geometry.plotRect.left,
      top: geometry.plotRect.top,
      right: geometry.plotRect.right,
      bottom: geometry.plotRect.bottom
    } };
  }

  function upsertBoundedCandidate(pending, candidate, maximum = 64) {
    if (!(pending instanceof Map) || !candidate) return pending;
    const limit = Math.max(1, Number(maximum) || 64);
    const key = `${candidate.sourceLabel || ""}:${Number(candidate.time)}:${Math.round(Number(candidate.x) * 2)}`;
    if (!pending.has(key) && pending.size >= limit) pending.delete(pending.keys().next().value);
    pending.set(key, candidate);
    return pending;
  }

  function signatureFor(candidates) {
    return (candidates || []).map((item) => `${Math.round(item.time / 60000)}:${Math.round(item.x * 2) / 2}`)
      .sort().join("|");
  }

  function observationEnvelope(candidates, previous = null, at = Date.now()) {
    const unique = new Map();
    for (const item of (candidates || [])) {
      const time = Number(item?.time);
      const x = Number(item?.x);
      if (!Number.isFinite(time) || !Number.isFinite(x)) continue;
      unique.set(`${time}:${Math.round(x * 2)}`, { ...item, time, x });
    }
    const pairs = [...unique.values()].sort((left, right) => left.x - right.x);
    const signature = timeToX(pairs) ? signatureFor(pairs) : "";
    const stableCount = signature && previous?.signature === signature ? Number(previous.stableCount || 1) + 1 : 1;
    return { at, signature, stableCount, pairs };
  }

  function shouldPublish(envelope) {
    return Boolean(envelope?.signature && envelope?.stableCount >= 2 && timeToX(envelope.pairs));
  }

  function confirmStableEnvelope(previous, at = Date.now()) {
    if (!previous?.signature || !Array.isArray(previous.pairs) || previous.pairs.length < 2) return null;
    return observationEnvelope(previous.pairs, previous, at);
  }

  const api = {
    chartSourceLabel,
    confirmStableEnvelope,
    createFrameGeometryReader,
    observationEnvelope,
    parseTimeLabel,
    projectedTimeFill,
    shouldPublish,
    timeSyncEnabled,
    timeToX,
    upsertBoundedCandidate
  };
  root.OptionsTimeAxisObserver = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  const prototype = root.CanvasRenderingContext2D?.prototype;
  if (!prototype || prototype.__optionsTimeAxisObserver) return;
  prototype.__optionsTimeAxisObserver = true;
  const originalFillText = prototype.fillText;
  const readGeometry = createFrameGeometryReader(root);
  let pending = new Map();
  let previous = null;
  let publishScheduled = false;
  let confirmTimer = null;
  let syncActive = timeSyncEnabled(root.document?.documentElement?.getAttribute?.(SYNC_ATTRIBUTE));
  let lastStable = null;

  function clearObservation() {
    pending = new Map();
    previous = null;
    publishScheduled = false;
    root.clearTimeout(confirmTimer);
    confirmTimer = null;
  }

  const syncObserver = root.MutationObserver && root.document?.documentElement
    ? new root.MutationObserver(() => {
      const next = timeSyncEnabled(root.document.documentElement.getAttribute(SYNC_ATTRIBUTE));
      if (next !== syncActive) {
        syncActive = next;
        clearObservation();
      }
      if (syncActive && lastStable && root.document?.documentElement) {
        root.document.documentElement.setAttribute(ATTRIBUTE, JSON.stringify(lastStable));
      }
    })
    : null;
  syncObserver?.observe(root.document.documentElement, { attributes: true, attributeFilter: [SYNC_ATTRIBUTE] });

  function publish() {
    publishScheduled = false;
    const envelope = observationEnvelope([...pending.values()], previous);
    pending = new Map();
    previous = envelope;
    if (shouldPublish(envelope)) {
      lastStable = envelope;
      if (syncActive && root.document?.documentElement) {
        root.document.documentElement.setAttribute(ATTRIBUTE, JSON.stringify(envelope));
      }
    }
    scheduleStableConfirmation(envelope);
  }

  function scheduleStableConfirmation(envelope) {
    if (!envelope?.signature || envelope.stableCount >= 2) return;
    root.clearTimeout(confirmTimer);
    confirmTimer = root.setTimeout(() => {
      confirmTimer = null;
      if (pending.size || previous !== envelope || !root.document?.documentElement) return;
      const confirmed = confirmStableEnvelope(envelope);
      if (!confirmed || !shouldPublish(confirmed)) return;
      previous = confirmed;
      lastStable = confirmed;
      if (syncActive) root.document.documentElement.setAttribute(ATTRIBUTE, JSON.stringify(confirmed));
    }, 120);
  }

  function schedulePublish() {
    if (publishScheduled) return;
    publishScheduled = true;
    if (typeof root.requestAnimationFrame === "function") root.requestAnimationFrame(publish);
    else root.setTimeout(publish, 16);
  }

  prototype.fillText = function (text, x, y, ...rest) {
    try {
      const candidate = projectedTimeFill(this, text, x, y, readGeometry);
      if (candidate) {
        root.clearTimeout(confirmTimer);
        confirmTimer = null;
        upsertBoundedCandidate(pending, candidate);
        schedulePublish();
      }
    } catch {
      // Time-axis diagnostics must never interrupt TradingView rendering.
    }
    return originalFillText.call(this, text, x, y, ...rest);
  };
})(typeof globalThis === "undefined" ? this : globalThis);
