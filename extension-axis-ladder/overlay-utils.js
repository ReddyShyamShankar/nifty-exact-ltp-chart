(function (root) {
  "use strict";

  function matchesColor(data, index, color, tolerance = 18) {
    return Math.abs(data[index] - color[0]) <= tolerance
      && Math.abs(data[index + 1] - color[1]) <= tolerance
      && Math.abs(data[index + 2] - color[2]) <= tolerance
      && data[index + 3] > 180;
  }

  function findColorBounds(data, width, height, color, region, tolerance = 18) {
    const left = Math.max(0, Math.floor(region?.left || 0));
    const top = Math.max(0, Math.floor(region?.top || 0));
    const right = Math.min(width, Math.ceil(region?.right || width));
    const bottom = Math.min(height, Math.ceil(region?.bottom || height));
    let minX = right, maxX = -1, minY = bottom, maxY = -1, count = 0;
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const index = (y * width + x) * 4;
        if (!matchesColor(data, index, color, tolerance)) continue;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        count += 1;
      }
    }
    if (count < 2) return null;
    return { minX, maxX, minY, maxY, count, x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  }

  function priceToY(lowerAnchor, upperAnchor, lowerPrice, upperPrice) {
    const priceSpan = Number(upperPrice) - Number(lowerPrice);
    const pixelSpan = Number(upperAnchor?.y) - Number(lowerAnchor?.y);
    if (!Number.isFinite(priceSpan) || !Number.isFinite(pixelSpan) || priceSpan <= 0 || pixelSpan >= -1) return null;
    const slope = pixelSpan / priceSpan;
    return (price) => Number(lowerAnchor.y) + (Number(price) - Number(lowerPrice)) * slope;
  }

  function boundedRegion(region, width, height) {
    const value = (name, fallback) => Number.isFinite(Number(region?.[name])) ? Number(region[name]) : fallback;
    return {
      left: Math.max(0, Math.floor(value("left", 0))),
      top: Math.max(0, Math.floor(value("top", 0))),
      right: Math.min(width, Math.ceil(value("right", width))),
      bottom: Math.min(height, Math.ceil(value("bottom", height)))
    };
  }

  function isNeutralGridPixel(data, index) {
    const red = data[index], green = data[index + 1], blue = data[index + 2], alpha = data[index + 3];
    return alpha > 180
      && Math.max(red, green, blue) - Math.min(red, green, blue) <= 7
      && red >= 205 && red <= 245;
  }

  function findHorizontalGridRows(data, width, height, region) {
    if (!data || !Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || data.length < width * height * 4) return [];
    const { left, top, right, bottom } = boundedRegion(region, width, height);
    if (right <= left || bottom <= top) return [];
    const candidates = [];
    for (let y = top; y < bottom; y += 1) {
      let samples = 0, neutralSamples = 0;
      for (let x = left; x < right; x += 4) {
        samples += 1;
        if (isNeutralGridPixel(data, (y * width + x) * 4)) neutralSamples += 1;
      }
      if (samples > 0 && neutralSamples / samples >= 0.55) candidates.push(y);
    }
    const rows = [];
    for (const y of candidates) {
      const previous = rows[rows.length - 1];
      if (!previous || y > previous.lastY + 1) rows.push({ firstY: y, lastY: y });
      else previous.lastY = y;
    }
    return rows.map(({ firstY, lastY }) => Math.round((firstY + lastY) / 2));
  }

  function dominantGridGap(rows) {
    if (!Array.isArray(rows)) return null;
    const sorted = rows.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    const gaps = [];
    for (let index = 1; index < sorted.length; index += 1) {
      const gap = sorted[index] - sorted[index - 1];
      if (gap >= 20 && gap <= 220) gaps.push(gap);
    }
    if (gaps.length === 0) return null;
    gaps.sort((a, b) => a - b);
    const middle = Math.floor(gaps.length / 2);
    const median = gaps.length % 2 === 0 ? (gaps[middle - 1] + gaps[middle]) / 2 : gaps[middle];
    return Math.round(median);
  }

  function strictFiniteNumber(value, allowCommas = false) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value !== "string") return null;
    const normalized = (allowCommas ? value.replaceAll(",", "") : value).trim();
    if (normalized === "") return null;
    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
  }

  function anchorY(anchor) {
    if (anchor !== null && typeof anchor === "object" && !Array.isArray(anchor)) {
      return strictFiniteNumber(anchor.y);
    }
    return strictFiniteNumber(anchor);
  }

  function priceIntervalFromPixels(gap, lower, upper, lowerPrice, upperPrice) {
    const pixelGap = strictFiniteNumber(gap);
    const lowerY = anchorY(lower);
    const upperY = anchorY(upper);
    const numericLowerPrice = strictFiniteNumber(lowerPrice, true);
    const numericUpperPrice = strictFiniteNumber(upperPrice, true);
    if ([pixelGap, lowerY, upperY, numericLowerPrice, numericUpperPrice].includes(null)) return null;
    const anchorSpan = Math.abs(upperY - lowerY);
    const priceSpan = Math.abs(numericUpperPrice - numericLowerPrice);
    if (pixelGap <= 0 || anchorSpan <= 0 || priceSpan <= 0) return null;
    return pixelGap * priceSpan / anchorSpan;
  }

  function normalizeAxisPrice(value) {
    return strictFiniteNumber(value, true);
  }

  function pairAxisPricesWithRows(prices, rows) {
    if (!Array.isArray(prices) || !Array.isArray(rows) || prices.length < 2 || prices.length !== rows.length) return null;
    const numericPrices = prices.map(normalizeAxisPrice);
    const numericRows = rows.map((row) => strictFiniteNumber(row));
    if (numericPrices.includes(null) || numericRows.includes(null)) return null;
    const sortedPrices = numericPrices.slice().sort((a, b) => b - a);
    const sortedRows = numericRows.slice().sort((a, b) => a - b);
    if (new Set(sortedPrices).size !== sortedPrices.length || new Set(sortedRows).size !== sortedRows.length) return null;
    const paired = sortedPrices.map((price, index) => ({ price, y: sortedRows[index] }));
    const lowest = paired[paired.length - 1];
    const highest = paired[0];
    const totalPriceSpan = highest.price - lowest.price;
    const totalPixelSpan = lowest.y - highest.y;
    if (totalPriceSpan <= 0 || totalPixelSpan <= 0) return null;
    for (const point of paired) {
      const expectedY = highest.y + (highest.price - point.price) * totalPixelSpan / totalPriceSpan;
      if (Math.abs(point.y - expectedY) > 1) return null;
    }
    return paired;
  }

  function spreadAroundAnchor(rawPositions, anchorIndex, minimumGap) {
    const positions = rawPositions.map(Number);
    const anchor = Number(anchorIndex);
    const gap = Number(minimumGap);
    if (!positions.every(Number.isFinite) || !Number.isInteger(anchor) || anchor < 0 || anchor >= positions.length || !Number.isFinite(gap) || gap < 0) return null;
    for (let index = anchor - 1; index >= 0; index -= 1) {
      positions[index] = Math.min(positions[index], positions[index + 1] - gap);
    }
    for (let index = anchor + 1; index < positions.length; index += 1) {
      positions[index] = Math.max(positions[index], positions[index - 1] + gap);
    }
    return positions;
  }

  const api = {
    findColorBounds,
    findHorizontalGridRows,
    dominantGridGap,
    priceIntervalFromPixels,
    pairAxisPricesWithRows,
    priceToY,
    spreadAroundAnchor
  };
  root.NiftyOverlay = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
