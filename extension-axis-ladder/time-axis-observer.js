(function (root) {
  "use strict";
  const ATTRIBUTE = "data-options-time-axis";
  const MONTHS = new Map([["jan", 0], ["feb", 1], ["mar", 2], ["apr", 3], ["may", 4], ["jun", 5],
    ["jul", 6], ["aug", 7], ["sep", 8], ["oct", 9], ["nov", 10], ["dec", 11]]);

  function parseTimeLabel(value, anchor = Date.now()) {
    const text = String(value || "").trim();
    if (!text) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      const parsed = Date.parse(`${text}T00:00:00.000Z`);
      return Number.isFinite(parsed) ? parsed : null;
    }
    const base = new Date(anchor);
    if (!Number.isFinite(base.getTime())) return null;
    const time = text.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if (time) return Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), Number(time[1]), Number(time[2]));
    const monthDay = text.match(/^([A-Za-z]{3})\s+(\d{1,2})$/);
    if (monthDay && MONTHS.has(monthDay[1].toLowerCase())) {
      const parsed = Date.UTC(base.getUTCFullYear(), MONTHS.get(monthDay[1].toLowerCase()), Number(monthDay[2]));
      return Number.isFinite(parsed) ? parsed : null;
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

  function chartSourceLabel(rect, documentRef = root.document) {
    if (!rect || !documentRef?.querySelectorAll) return null;
    const matches = [...documentRef.querySelectorAll('canvas[aria-label^="Chart for"]')]
      .map((canvas) => ({ canvas, rect: canvas.getBoundingClientRect?.(), label: canvas.getAttribute?.("aria-label") }))
      .filter((item) => item.rect && /^Chart for\b/.test(String(item.label || "")))
      .filter((item) => Math.abs(Number(rect.top) - Number(item.rect.bottom)) <= 12
        && Math.abs(Number(rect.left) - Number(item.rect.left)) <= 12
        && Math.abs(Number(rect.right) - Number(item.rect.right)) <= 12)
      .sort((left, right) => Math.abs(Number(rect.top) - Number(left.rect.bottom))
        - Math.abs(Number(rect.top) - Number(right.rect.bottom)));
    return matches[0]?.label || null;
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

  const api = { chartSourceLabel, observationEnvelope, parseTimeLabel, shouldPublish, timeToX };
  root.OptionsTimeAxisObserver = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  const prototype = root.CanvasRenderingContext2D?.prototype;
  if (!prototype || prototype.__optionsTimeAxisObserver) return;
  prototype.__optionsTimeAxisObserver = true;
  const originalFillText = prototype.fillText;
  let pending = [];
  let previous = null;
  let timer = null;

  function publish() {
    timer = null;
    const envelope = observationEnvelope(pending, previous);
    pending = [];
    previous = envelope;
    if (!shouldPublish(envelope) || !root.document?.documentElement) return;
    root.document.documentElement.setAttribute(ATTRIBUTE, JSON.stringify(envelope));
  }

  prototype.fillText = function (text, x, y, ...rest) {
    try {
      const canvas = this.canvas;
      const rect = canvas?.getBoundingClientRect?.();
      const time = parseTimeLabel(text);
      const sourceLabel = rect && chartSourceLabel(rect);
      if (time !== null && sourceLabel && rect?.width && canvas?.width) {
        const transform = this.getTransform();
        const deviceX = transform.a * Number(x) + transform.c * Number(y) + transform.e;
        const screenX = Number(rect.left) + deviceX * Number(rect.width) / Number(canvas.width);
        const chart = [...root.document.querySelectorAll('canvas[aria-label^="Chart for"]')]
          .find((candidate) => candidate.getAttribute("aria-label") === sourceLabel);
        const plotRect = chart?.getBoundingClientRect?.();
        if (Number.isFinite(screenX) && plotRect) {
          pending.push({ time, x: screenX, sourceLabel, plotRect: {
            left: plotRect.left, top: plotRect.top, right: plotRect.right, bottom: plotRect.bottom
          } });
          root.clearTimeout(timer);
          timer = root.setTimeout(publish, 80);
        }
      }
    } catch {
      // Time-axis diagnostics must never interrupt TradingView rendering.
    }
    return originalFillText.call(this, text, x, y, ...rest);
  };
})(typeof globalThis === "undefined" ? this : globalThis);
