(function (root) {
  "use strict";

  const TRIAL_MODES = Object.freeze(["SKYLINE"]);

  function finite(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function optionalFinite(value) {
    return value === null || value === undefined || value === "" ? null : finite(value);
  }

  function normalizeOhlc(value) {
    if (!value) return null;
    const open = finite(value.open);
    const high = finite(value.high);
    const low = finite(value.low);
    const close = finite(value.close);
    if ([open, high, low, close].some((item) => item === null)) return null;
    return { open, high: Math.max(high, low), low: Math.min(high, low), close };
  }

  function visiblePremiumSamples(points, axis, minPixelGap = 3) {
    if (!axis || typeof axis.xOf !== "function") return [];
    const from = finite(axis.from);
    const to = finite(axis.to);
    if (from === null || to === null || from > to) return [];
    const gap = Math.max(0, finite(minPixelGap) ?? 3);
    const candidates = (Array.isArray(points) ? points : [])
      .filter((point) => {
        const time = finite(point?.time);
        return time !== null && time >= from && time <= to && (point.call || point.put);
      })
      .map((point) => ({ point, time: Number(point.time), x: Number(axis.xOf(point.time)) }))
      .filter((item) => Number.isFinite(item.x))
      .sort((left, right) => left.time - right.time);
    if (!candidates.length) return [];
    const selected = [candidates[0]];
    for (let index = 1; index < candidates.length - 1; index += 1) {
      if (candidates[index].x - selected.at(-1).x >= gap) selected.push(candidates[index]);
    }
    const last = candidates.at(-1);
    if (last.time !== selected.at(-1).time) {
      if (last.x - selected.at(-1).x < gap && selected.length > 1) selected[selected.length - 1] = last;
      else selected.push(last);
    }
    return selected.map(({ point, x }) => ({ ...point, x }));
  }

  function projectClose(ohlc, priceOf, toY) {
    const premium = finite(ohlc?.close);
    if (premium === null || typeof priceOf !== "function" || typeof toY !== "function") return null;
    const y = Number(toY(priceOf(premium)));
    return Number.isFinite(y) ? { premium, y } : null;
  }

  function skylineGeometry(points, strike, axis, toY, minPixelGap = 3) {
    const numericStrike = finite(strike);
    const anchorY = Number(typeof toY === "function" ? toY(numericStrike) : NaN);
    if (numericStrike === null || !Number.isFinite(anchorY)) return [];
    return visiblePremiumSamples(points, axis, minPixelGap).map((point) => ({
      time: Number(point.time),
      x: Number(point.x),
      anchorY,
      call: projectClose(point.call, (premium) => numericStrike + premium, toY),
      put: projectClose(point.put, (premium) => numericStrike - premium, toY)
    })).filter((sample) => sample.call || sample.put);
  }

  function skylineSegments(geometry, side) {
    if (side !== "call" && side !== "put") return [];
    const segments = [];
    let current = [];
    (Array.isArray(geometry) ? geometry : []).forEach((sample) => {
      const projected = sample?.[side];
      if (!projected || !Number.isFinite(Number(sample?.x)) || !Number.isFinite(Number(projected?.y))) {
        if (current.length) segments.push(current);
        current = [];
        return;
      }
      current.push({
        time: Number(sample.time),
        x: Number(sample.x),
        y: Number(projected.y),
        premium: Number(projected.premium),
        anchorY: Number(sample.anchorY)
      });
    });
    if (current.length) segments.push(current);
    return segments;
  }

  function skylineCrosshairSample(point, strike, toY) {
    const numericStrike = finite(strike);
    const anchorY = Number(typeof toY === "function" ? toY(numericStrike) : NaN);
    if (numericStrike === null || !Number.isFinite(anchorY) || !point) return null;
    return {
      time: Number(point.time),
      anchorY,
      call: projectClose(point.call, (premium) => numericStrike + premium, toY),
      put: projectClose(point.put, (premium) => numericStrike - premium, toY)
    };
  }

  function sameCrosshair(left, right) {
    if (!left && !right) return true;
    if (!left || !right) return false;
    return Number(left.time) === Number(right.time)
      && Number(left.clientX) === Number(right.clientX);
  }

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(Number(value), Number(minimum)), Math.max(Number(minimum), Number(maximum)));
  }

  function rectsOverlap(left, right, gap = 0) {
    if (!left || !right) return false;
    const spacing = Math.max(0, finite(gap) ?? 0);
    return !(left.x + left.width + spacing <= right.x
      || right.x + right.width + spacing <= left.x
      || left.y + left.height + spacing <= right.y
      || right.y + right.height + spacing <= left.y);
  }

  function boundedRect(centerX, y, width, height, plotWidth, plotHeight, edge) {
    const safeWidth = Math.max(1, Math.min(Number(width), plotWidth - edge * 2));
    const safeHeight = Math.max(1, Math.min(Number(height), plotHeight - edge * 2));
    return {
      x: clamp(Number(centerX) - safeWidth / 2, edge, plotWidth - edge - safeWidth),
      y: clamp(y, edge, plotHeight - edge - safeHeight),
      width: safeWidth,
      height: safeHeight
    };
  }

  function avoidHorizontalOverlap(rect, blockers, plotWidth, edge, gap, preferredDirection) {
    if (!blockers.some((blocker) => rectsOverlap(rect, blocker, gap))) return rect;
    const start = rect.x;
    const maximumShift = Math.ceil(plotWidth);
    for (let shift = 1; shift <= maximumShift; shift += 1) {
      const candidates = preferredDirection < 0
        ? [start - shift, start + shift]
        : [start + shift, start - shift];
      for (const x of candidates) {
        if (x < edge || x + rect.width > plotWidth - edge) continue;
        const candidate = { ...rect, x };
        if (!blockers.some((blocker) => rectsOverlap(candidate, blocker, gap))) return candidate;
      }
    }
    return rect;
  }

  function pointLabelRect({ pointX, pointY, width, height, side, plotWidth, plotHeight, edge, pointOffset }) {
    const numericY = optionalFinite(pointY);
    if (numericY === null) return null;
    const preferredY = side === "call" ? numericY - pointOffset - height : numericY + pointOffset;
    const flippedY = side === "call" ? numericY + pointOffset : numericY - pointOffset - height;
    const y = preferredY < edge || preferredY + height > plotHeight - edge ? flippedY : preferredY;
    return boundedRect(pointX, y, width, height, plotWidth, plotHeight, edge);
  }

  function missingLabelRect(strike, width, height, plotWidth, plotHeight, edge, gap) {
    const rightX = strike.x + strike.width + gap;
    if (rightX + width <= plotWidth - edge) {
      return boundedRect(rightX + width / 2, strike.y, width, height, plotWidth, plotHeight, edge);
    }
    return boundedRect(strike.x - gap - width / 2, strike.y, width, height, plotWidth, plotHeight, edge);
  }

  function spatialLabelLayout(options = {}) {
    const plotWidth = finite(options.plotWidth);
    const plotHeight = finite(options.plotHeight);
    const sampleX = finite(options.x);
    const anchorY = finite(options.anchorY);
    const height = Math.max(1, finite(options.height) ?? 24);
    const edge = Math.max(0, finite(options.edge) ?? 8);
    const collisionGap = Math.max(0, finite(options.collisionGap) ?? 4);
    const pointOffset = Math.max(0, finite(options.pointOffset) ?? 9);
    const widths = options.widths || {};
    if (plotWidth === null || plotHeight === null || sampleX === null || anchorY === null
      || plotWidth <= edge * 2 || plotHeight <= edge * 2) return null;

    const date = boundedRect(sampleX, edge, finite(widths.date) ?? 1, height, plotWidth, plotHeight, edge);
    const strike = boundedRect(sampleX, anchorY - height / 2,
      finite(widths.strike) ?? 1, height, plotWidth, plotHeight, edge);
    const callPointY = optionalFinite(options.callY);
    const putPointY = optionalFinite(options.putY);
    let call = pointLabelRect({
      pointX: sampleX, pointY: callPointY, width: finite(widths.call) ?? 1, height,
      side: "call", plotWidth, plotHeight, edge, pointOffset
    });
    if (call) call = avoidHorizontalOverlap(call, [date, strike], plotWidth, edge, collisionGap, 1);
    let put = pointLabelRect({
      pointX: sampleX, pointY: putPointY, width: finite(widths.put) ?? 1, height,
      side: "put", plotWidth, plotHeight, edge, pointOffset
    });
    if (put) put = avoidHorizontalOverlap(put, [date, strike, call].filter(Boolean),
      plotWidth, edge, collisionGap, -1);
    const missing = !call && !put
      ? missingLabelRect(strike, finite(widths.missing) ?? 1, height, plotWidth, plotHeight, edge, collisionGap)
      : null;
    return { sampleX, callPointY, putPointY, date, call, put, strike, missing };
  }

  const api = {
    TRIAL_MODES,
    normalizeOhlc,
    rectsOverlap,
    sameCrosshair,
    skylineCrosshairSample,
    skylineGeometry,
    skylineSegments,
    spatialLabelLayout,
    visiblePremiumSamples
  };
  root.OptionsPremiumChartTrials = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
