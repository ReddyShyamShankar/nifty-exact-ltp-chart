(function (root) {
  "use strict";

  const ATTRIBUTE = "data-nifty-axis-ticks";

  function numericAxisText(value) {
    const text = String(value ?? "").replace(/[−–—]/g, "-").trim();
    if (!/^-?(?:(?:\d{1,3}(?:,\d{3})+)|\d+)(?:\.\d+)?$/.test(text)) return null;
    const price = Number(text.replaceAll(",", ""));
    return Number.isFinite(price) && Math.abs(price) <= 100000000 ? price : null;
  }

  function projectedFill(context, text, x, y, viewportWidth) {
    const price = numericAxisText(text);
    const canvas = context?.canvas;
    if (price === null || !canvas?.getBoundingClientRect) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height || !canvas.width || !canvas.height) return null;
    const transform = context.getTransform();
    const metrics = typeof context.measureText === "function" ? context.measureText(String(text)) : null;
    const ascent = Number(metrics?.actualBoundingBoxAscent);
    const descent = Number(metrics?.actualBoundingBoxDescent);
    const centerOffset = Number.isFinite(ascent) && Number.isFinite(descent) ? (ascent - descent) / 2 : 0;
    const deviceX = transform.a * Number(x) + transform.c * Number(y) + transform.e;
    const deviceY = transform.b * Number(x) + transform.d * (Number(y) - centerOffset) + transform.f;
    const screenX = rect.left + deviceX * rect.width / canvas.width;
    const screenY = rect.top + deviceY * rect.height / canvas.height;
    if (![screenX, screenY].every(Number.isFinite) || screenX < viewportWidth - 220) return null;
    return { price, y: screenY };
  }

  const api = { numericAxisText, projectedFill };
  root.NiftyAxisObserver = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  const prototype = root.CanvasRenderingContext2D?.prototype;
  if (!prototype || prototype.__niftyAxisObserver) return;
  prototype.__niftyAxisObserver = true;
  const originalFillText = prototype.fillText;
  let pending = [];
  let publishTimer = null;

  function publish() {
    publishTimer = null;
    const unique = new Map();
    for (const candidate of pending) {
      const key = `${candidate.price}:${Math.round(candidate.y * 10)}`;
      unique.set(key, candidate);
    }
    pending = [];
    const candidates = [...unique.values()];
    if (candidates.length < 2 || !document.documentElement) return;
    document.documentElement.setAttribute(ATTRIBUTE, JSON.stringify({ at: Date.now(), candidates }));
  }

  prototype.fillText = function (text, x, y, ...rest) {
    try {
      const candidate = projectedFill(this, text, x, y, root.innerWidth);
      if (candidate) {
        pending.push(candidate);
        if (publishTimer === null) publishTimer = root.setTimeout(publish, 40);
      }
    } catch {
      // TradingView drawing must never be interrupted by observer diagnostics.
    }
    return originalFillText.call(this, text, x, y, ...rest);
  };
})(typeof self !== "undefined" ? self : globalThis);
