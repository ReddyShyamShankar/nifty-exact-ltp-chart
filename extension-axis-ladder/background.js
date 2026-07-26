"use strict";

importScripts("overlay-utils.js");

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizedAxisText(value) {
  if (typeof value !== "string") return null;
  const text = value.replace(/[−–—]/g, "-").trim();
  if (!text || !/^-?(?:(?:\d{1,3}(?:,\d{3})+)|\d+)(?:\.\d+)?$/.test(text)) return null;
  const number = Number(text.replaceAll(",", ""));
  return Number.isFinite(number) && Math.abs(number) <= 100000000 ? number : null;
}

function axisText(node) {
  if (typeof node === "string") return node;
  if (node && typeof node === "object") {
    if (typeof node.name === "string") return node.name;
    if (node.name && typeof node.name.value === "string") return node.name.value;
    if (typeof node.value === "string") return node.value;
  }
  return null;
}

function extractAxisPrices(nodes) {
  if (!Array.isArray(nodes)) return [];
  const prices = [];
  const seen = new Set();
  for (const node of nodes) {
    const price = normalizedAxisText(axisText(node));
    if (price === null || seen.has(price)) continue;
    seen.add(price);
    prices.push(price);
  }
  return prices;
}

function isCaptureMessage(type) {
  return type === "CAPTURE_AXIS_SCALE";
}

function uniqueAxisCandidates(candidates) {
  const seen = new Set();
  return (candidates || []).filter((candidate) => {
    const key = `${candidate.price}:${candidate.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function axisPairsFromCandidates(candidates, tolerance = 1.5) {
  if (!Array.isArray(candidates) || candidates.length < 3) return null;
  const numericTolerance = finiteNumber(tolerance);
  if (numericTolerance === null || numericTolerance < 0) return null;
  const numericCandidates = uniqueAxisCandidates(candidates.map((candidate) => ({
    price: finiteNumber(candidate?.price),
    y: finiteNumber(candidate?.y)
  }))).filter((candidate) => candidate.price !== null && candidate.y !== null);
  if (numericCandidates.length < 3) return null;

  let best = [];
  let bestSpan = -1;
  for (let left = 0; left < numericCandidates.length - 1; left += 1) {
    for (let right = left + 1; right < numericCandidates.length; right += 1) {
      const first = numericCandidates[left];
      const second = numericCandidates[right];
      const pixelSpan = second.y - first.y;
      const priceSpan = second.price - first.price;
      if (pixelSpan === 0 || priceSpan === 0 || pixelSpan * priceSpan >= 0) continue;
      const pricePerPixel = priceSpan / pixelSpan;
      const allowedPriceError = Math.max(0.01, Math.abs(pricePerPixel) * numericTolerance);
      const inliers = numericCandidates.filter((pair) => {
        const expectedPrice = first.price + (pair.y - first.y) * pricePerPixel;
        return Math.abs(pair.price - expectedPrice) <= allowedPriceError;
      }).sort((a, b) => a.y - b.y);
      const distinct = inliers.filter((pair, index) => index === 0
        || Math.abs(pair.y - inliers[index - 1].y) > 0.25)
        .filter((pair, index, rows) => rows.findIndex((row) => row.price === pair.price) === index);
      const span = distinct.length > 1 ? distinct.at(-1).y - distinct[0].y : 0;
      if (distinct.length > best.length || (distinct.length === best.length && span > bestSpan)) {
        best = distinct;
        bestSpan = span;
      }
    }
  }
  return best.length >= 3 ? best : null;
}

function axisScaleError(message) {
  return { ok: false, error: message };
}

async function captureAxisScale(_sender, message) {
  const observedCandidates = Array.isArray(message?.axisCandidates) ? message.axisCandidates : [];
  const observedPairs = axisPairsFromCandidates(observedCandidates);
  const observedGap = observedPairs && NiftyOverlay.dominantGridGap(observedPairs.map((pair) => pair.y));
  if (!observedPairs || !Number.isFinite(observedGap) || observedGap <= 0) {
    return axisScaleError("Native axis ticks are still loading.");
  }
  return {
    ok: true,
    lower: null,
    upper: null,
    gridRows: observedPairs.map((pair) => pair.y),
    gridGapPx: observedGap,
    axisPrices: observedPairs.map((pair) => pair.price),
    axisPairs: observedPairs
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isCaptureMessage(message?.type)) return;
  if (!sender.tab?.id || !sender.url?.startsWith("https://www.tradingview.com/")) {
    sendResponse({ ok: false, error: "Axis capture is limited to TradingView tabs." });
    return;
  }
  captureAxisScale(sender, message)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    axisPairsFromCandidates,
    captureAxisScale,
    extractAxisPrices,
    isCaptureMessage
  };
}
