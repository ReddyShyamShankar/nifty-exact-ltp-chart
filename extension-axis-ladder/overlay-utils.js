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

  const api = { findColorBounds, priceToY, spreadAroundAnchor };
  root.NiftyOverlay = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
