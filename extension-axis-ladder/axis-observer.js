(function (root) {
  "use strict";

  const ATTRIBUTE = "data-nifty-axis-ticks";
  let frameGeometryCache = new WeakMap();
  let frameGeometryResetPending = false;

  function numericAxisText(value) {
    const text = String(value ?? "").replace(/[−–—]/g, "-").trim();
    if (!/^-?(?:(?:\d{1,3}(?:,\d{3})+)|\d+)(?:\.\d+)?$/.test(text)) return null;
    const price = Number(text.replaceAll(",", ""));
    return Number.isFinite(price) && Math.abs(price) <= 100000000 ? price : null;
  }

  function chartSourceLabel(canvas, canvasRect, documentRef = root.document) {
    const direct = typeof canvas?.getAttribute === "function" ? canvas.getAttribute("aria-label") : null;
    if (/^Chart for\b/.test(String(direct || ""))) return direct;
    if (!documentRef?.querySelectorAll) return null;
    const tolerance = 8;
    const matches = [...documentRef.querySelectorAll('canvas[aria-label^="Chart for"]')]
      .map((candidate) => {
        const rect = candidate?.getBoundingClientRect?.();
        const label = candidate?.getAttribute?.("aria-label");
        if (!rect || !/^Chart for\b/.test(String(label || ""))) return null;
        const verticalMatch = Math.abs(Number(rect.top) - canvasRect.top) <= tolerance
          && Math.abs(Number(rect.bottom) - canvasRect.bottom) <= tolerance;
        const boundaryDistance = Math.abs(Number(rect.right) - canvasRect.left);
        if (!verticalMatch || boundaryDistance > tolerance) return null;
        return { label, boundaryDistance };
      })
      .filter(Boolean)
      .sort((left, right) => left.boundaryDistance - right.boundaryDistance);
    return matches[0]?.label || null;
  }

  function resetFrameGeometryCache() {
    frameGeometryCache = new WeakMap();
    frameGeometryResetPending = false;
  }

  function canvasFrameGeometry(canvas) {
    if (!canvas?.getBoundingClientRect) return null;
    const cached = frameGeometryCache.get(canvas);
    if (cached) return cached;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height || !canvas.width || !canvas.height) return null;
    const canvasRect = {
      left: Number(rect.left),
      top: Number(rect.top),
      right: Number.isFinite(Number(rect.right)) ? Number(rect.right) : Number(rect.left) + Number(rect.width),
      bottom: Number.isFinite(Number(rect.bottom)) ? Number(rect.bottom) : Number(rect.top) + Number(rect.height)
    };
    if (![Number(rect.width), Number(rect.height), ...Object.values(canvasRect)].every(Number.isFinite)) return null;
    const geometry = { rect, canvasRect, sourceLabel: chartSourceLabel(canvas, canvasRect) };
    frameGeometryCache.set(canvas, geometry);
    if (!frameGeometryResetPending && typeof root.requestAnimationFrame === "function") {
      frameGeometryResetPending = true;
      root.requestAnimationFrame(resetFrameGeometryCache);
    }
    return geometry;
  }

  function projectedFill(context, text, x, y, _viewportWidth) {
    const price = numericAxisText(text);
    const canvas = context?.canvas;
    if (price === null) return null;
    const geometry = canvasFrameGeometry(canvas);
    if (!geometry) return null;
    const { rect, canvasRect, sourceLabel } = geometry;
    const transform = context.getTransform();
    const metrics = typeof context.measureText === "function" ? context.measureText(String(text)) : null;
    const ascent = Number(metrics?.actualBoundingBoxAscent);
    const descent = Number(metrics?.actualBoundingBoxDescent);
    const centerOffset = Number.isFinite(ascent) && Number.isFinite(descent) ? (ascent - descent) / 2 : 0;
    const deviceX = transform.a * Number(x) + transform.c * Number(y) + transform.e;
    const deviceY = transform.b * Number(x) + transform.d * (Number(y) - centerOffset) + transform.f;
    const screenX = rect.left + deviceX * rect.width / canvas.width;
    const screenY = rect.top + deviceY * rect.height / canvas.height;
    if (![screenX, screenY, ...Object.values(canvasRect)].every(Number.isFinite)) return null;
    return { price, x: screenX, y: screenY, sourceLabel, canvasRect };
  }

  function dominantLinearCandidates(candidates, tolerance = 1.5) {
    const numeric = (candidates || []).filter((candidate) => Number.isFinite(Number(candidate?.price))
      && Number.isFinite(Number(candidate?.y)));
    if (numeric.length < 3) return [];
    const steps = new Set();
    for (let left = 0; left < numeric.length - 1; left += 1) {
      for (let right = left + 1; right < numeric.length; right += 1) {
        const step = Math.abs(Number(numeric[right].price) - Number(numeric[left].price));
        if (step > 0.01) steps.add(Math.round(step * 100) / 100);
      }
    }
    let grid = [];
    let gridDensity = -1;
    let gridPriceCount = 0;
    for (const step of steps) {
      for (const anchor of numeric) {
        const slots = new Set();
        const aligned = [];
        for (const candidate of numeric) {
          const slot = (Number(candidate.price) - Number(anchor.price)) / step;
          const roundedSlot = Math.round(slot);
          if (Math.abs(slot - roundedSlot) > 0.0001) continue;
          slots.add(roundedSlot);
          aligned.push(candidate);
        }
        if (slots.size < 3) continue;
        const slotNumbers = [...slots];
        const density = slots.size / (Math.max(...slotNumbers) - Math.min(...slotNumbers) + 1);
        if (density > gridDensity + 0.0001
          || (Math.abs(density - gridDensity) <= 0.0001 && slots.size > gridPriceCount)) {
          grid = aligned;
          gridDensity = density;
          gridPriceCount = slots.size;
        }
      }
    }
    let best = [];
    let bestSpan = -1;
    for (let left = 0; left < grid.length - 1; left += 1) {
      for (let right = left + 1; right < grid.length; right += 1) {
        const first = grid[left];
        const second = grid[right];
        const pixelSpan = Number(second.y) - Number(first.y);
        const priceSpan = Number(second.price) - Number(first.price);
        if (pixelSpan === 0 || priceSpan === 0) continue;
        const pricePerPixel = priceSpan / pixelSpan;
        const allowedPriceError = Math.max(0.01, Math.abs(pricePerPixel) * tolerance);
        const inliers = grid.filter((candidate) => {
          const expected = Number(first.price) + (Number(candidate.y) - Number(first.y)) * pricePerPixel;
          return Math.abs(Number(candidate.price) - expected) <= allowedPriceError;
        }).sort((a, b) => Number(a.y) - Number(b.y))
          .filter((candidate, index, rows) => rows.findIndex((row) => Number(row.price) === Number(candidate.price)) === index);
        const span = inliers.length > 1 ? Number(inliers.at(-1).y) - Number(inliers[0].y) : 0;
        if (inliers.length > best.length || (inliers.length === best.length && span > bestSpan)) {
          best = inliers;
          bestSpan = span;
        }
      }
    }
    return best.length >= 3 ? best : [];
  }

  function latestAxisPaintBurst(candidates, frameGap = 8) {
    const numeric = (candidates || []).filter((candidate) => Number.isFinite(Number(candidate?.capturedAt)));
    if (numeric.length < 3) return candidates || [];
    const ordered = [...numeric].sort((left, right) => Number(left.capturedAt) - Number(right.capturedAt));
    const bursts = [];
    for (const candidate of ordered) {
      const burst = bursts.at(-1);
      if (!burst || Number(candidate.capturedAt) - Number(burst.at(-1).capturedAt) > frameGap) {
        bursts.push([candidate]);
      } else {
        burst.push(candidate);
      }
    }
    for (let index = bursts.length - 1; index >= 0; index -= 1) {
      const xOrdered = [...bursts[index]].sort((left, right) => Number(left.x) - Number(right.x));
      const xClusters = [];
      for (const candidate of xOrdered) {
        const cluster = xClusters.at(-1);
        if (!cluster || Math.abs(Number(candidate.x) - Number(cluster.at(-1).x)) > 8) xClusters.push([candidate]);
        else cluster.push(candidate);
      }
      const models = xClusters.map((cluster) => {
        const grid = dominantLinearCandidates(cluster);
        if (grid.length < 3) return null;
        const first = grid[0];
        const last = grid.at(-1);
        const pixelSpan = Number(last.y) - Number(first.y);
        const priceSpan = Number(last.price) - Number(first.price);
        if (!pixelSpan || !priceSpan) return null;
        return {
          first,
          pricePerPixel: priceSpan / pixelSpan,
          x: grid.reduce((total, candidate) => total + Number(candidate.x), 0) / grid.length
        };
      }).filter(Boolean);
      if (!models.length) continue;
      const compatibleEarlier = bursts.slice(0, index).flat().filter((candidate) => models.some((model) => {
        if (Math.abs(Number(candidate.x) - model.x) > 8) return false;
        if (String(candidate.sourceLabel || "") !== String(model.first.sourceLabel || "")) return false;
        const rect = candidate?.canvasRect;
        const modelRect = model.first?.canvasRect;
        if (rect && modelRect && ["left", "top", "right", "bottom"]
          .some((key) => Math.abs(Number(rect[key]) - Number(modelRect[key])) > 1)) return false;
        const expected = Number(model.first.price)
          + (Number(candidate.y) - Number(model.first.y)) * model.pricePerPixel;
        const allowedError = Math.max(0.01, Math.abs(model.pricePerPixel) * 1.5);
        return Math.abs(Number(candidate.price) - expected) <= allowedError;
      }));
      return [...compatibleEarlier, ...bursts[index]];
    }
    return candidates || [];
  }

  function observationEnvelope(candidates, previous = null, at = Date.now()) {
    const labeled = (candidates || []).filter((candidate) => /^Chart for\b/.test(String(candidate?.sourceLabel || "")));
    const sourceLabels = [...new Set(labeled.map((candidate) => candidate.sourceLabel))];
    const mergePrevious = sourceLabels.length === 1
      && sourceLabels[0] === previous?.sourceLabel
      && Array.isArray(previous?.candidates);
    const latestBurst = latestAxisPaintBurst(mergePrevious ? [...previous.candidates, ...labeled] : labeled);
    const unique = new Map();
    for (const candidate of latestBurst) {
      const rect = candidate?.canvasRect;
      const key = [candidate?.price, candidate?.x, candidate?.y, rect?.left, rect?.top, rect?.right, rect?.bottom]
        .map((value) => Math.round(Number(value) * 10))
        .join(":");
      unique.set(key, candidate);
    }
    const normalized = [...unique.values()];
    const labels = [...new Set(normalized.map((candidate) => candidate?.sourceLabel).filter(Boolean))];
    const sourceLabel = labels.length === 1 ? labels[0] : null;
    const xOrdered = [...normalized].sort((left, right) => Number(left.x) - Number(right.x));
    const xClusters = [];
    for (const candidate of xOrdered) {
      const cluster = xClusters.at(-1);
      if (!cluster || Math.abs(Number(candidate.x) - Number(cluster.at(-1).x)) > 8) xClusters.push([candidate]);
      else cluster.push(candidate);
    }
    const axisCluster = xClusters
      .filter((cluster) => cluster.length >= 3)
      .sort((left, right) => {
        const leftX = left.reduce((total, candidate) => total + Number(candidate.x), 0) / left.length;
        const rightX = right.reduce((total, candidate) => total + Number(candidate.x), 0) / right.length;
        return rightX - leftX;
      })[0] || [];
    const signature = dominantLinearCandidates(axisCluster)
      .map((candidate) => [candidate?.price, candidate?.x, candidate?.y]
        .map((value) => Math.round(Number(value) * 2) / 2).join(":"))
      .sort()
      .join("|");
    const hasAxisCluster = axisCluster.length >= 3;
    const stableCount = hasAxisCluster && previous?.sourceLabel === sourceLabel && previous?.signature === signature
      ? Number(previous.stableCount || 1) + 1
      : 1;
    return { at, sourceLabel, signature, stableCount, candidates: normalized };
  }

  function shouldPublishEnvelope(envelope, previous) {
    if (!envelope || envelope.candidates?.length < 3 || !envelope.signature) return false;
    if (!previous) return true;
    if (envelope.sourceLabel !== previous.sourceLabel || envelope.signature !== previous.signature) return true;
    return Number(previous.stableCount) < 2 && Number(envelope.stableCount) >= 2;
  }

  function confirmStableEnvelope(previous, at = Date.now()) {
    if (!previous?.signature || !Array.isArray(previous.candidates) || previous.candidates.length < 3) return null;
    return observationEnvelope(previous.candidates, previous, at);
  }

  function withoutCanvasCandidates(candidates, canvas) {
    return (candidates || []).filter((candidate) => candidate?.__canvas !== canvas);
  }

  const api = {
    chartSourceLabel,
    confirmStableEnvelope,
    dominantLinearCandidates,
    latestAxisPaintBurst,
    numericAxisText,
    observationEnvelope,
    projectedFill,
    resetFrameGeometryCache,
    shouldPublishEnvelope,
    withoutCanvasCandidates
  };
  root.NiftyAxisObserver = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  const prototype = root.CanvasRenderingContext2D?.prototype;
  if (!prototype || prototype.__niftyAxisObserver) return;
  prototype.__niftyAxisObserver = true;
  const originalFillText = prototype.fillText;
  const originalClearRect = prototype.clearRect;
  let pending = [];
  let publishTimer = null;
  let confirmTimer = null;
  let previousEnvelope = null;

  function publish() {
    publishTimer = null;
    const envelope = observationEnvelope(pending, previousEnvelope);
    pending = [];
    if (envelope.candidates.length < 2 || !document.documentElement) return;
    const shouldPublish = shouldPublishEnvelope(envelope, previousEnvelope);
    previousEnvelope = envelope;
    if (shouldPublish) document.documentElement.setAttribute(ATTRIBUTE, JSON.stringify(envelope));
    if (envelope.signature && envelope.stableCount < 2) {
      root.clearTimeout(confirmTimer);
      confirmTimer = root.setTimeout(() => {
        confirmTimer = null;
        if (pending.length || previousEnvelope !== envelope || !document.documentElement) return;
        const confirmed = confirmStableEnvelope(envelope);
        if (!confirmed || !shouldPublishEnvelope(confirmed, envelope)) return;
        previousEnvelope = confirmed;
        document.documentElement.setAttribute(ATTRIBUTE, JSON.stringify(confirmed));
      }, 120);
    }
  }

  prototype.fillText = function (text, x, y, ...rest) {
    try {
      const candidate = projectedFill(this, text, x, y, root.innerWidth);
      if (candidate) {
        candidate.capturedAt = Number(root.performance?.now?.()) || Date.now();
        Object.defineProperty(candidate, "__canvas", { value: this.canvas });
        root.clearTimeout(confirmTimer);
        confirmTimer = null;
        pending.push(candidate);
        root.clearTimeout(publishTimer);
        publishTimer = root.setTimeout(publish, 40);
      }
    } catch {
      // TradingView drawing must never be interrupted by observer diagnostics.
    }
    return originalFillText.call(this, text, x, y, ...rest);
  };

  prototype.clearRect = function (x, y, width, height, ...rest) {
    try {
      const canvas = this.canvas;
      if (canvas && Number(width) >= Number(canvas.width) * 0.75 && Number(height) >= Number(canvas.height) * 0.75) {
        pending = withoutCanvasCandidates(pending, canvas);
      }
    } catch {
      // TradingView drawing must never be interrupted by observer diagnostics.
    }
    return originalClearRect.call(this, x, y, width, height, ...rest);
  };
})(typeof self !== "undefined" ? self : globalThis);
