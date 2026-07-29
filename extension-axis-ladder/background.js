"use strict";

importScripts("overlay-utils.js", "side-panel.js", "manual-plan.js");

NiftySidePanel.install(chrome);

const manualPlanApi = globalThis.NiftyManualPlan;
const MANUAL_PLAN_MUTATION = "MUTATE_MANUAL_PLANS";
let manualPlanMutationTail = Promise.resolve();

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

function isFitMessage(type) {
  return type === "FIT_AXIS_SCALE";
}

function isManualPlanMutationMessage(type) {
  return type === MANUAL_PLAN_MUTATION;
}

function applyManualPlanMutation(store, mutation) {
  if (mutation?.type === "upsert") return manualPlanApi.upsertEntry(store, mutation.entry);
  if (mutation?.type === "remove"
    && manualPlanApi.isIsoDate(mutation.expiry)
    && typeof mutation.entryId === "string"
    && mutation.entryId) {
    return manualPlanApi.removeEntry(store, mutation.expiry, mutation.entryId);
  }
  throw new Error("Invalid manual plan mutation.");
}

function enqueueManualPlanMutation(mutation) {
  const commit = async () => {
    const stored = await chrome.storage.local.get(manualPlanApi.STORAGE_KEY);
    const next = applyManualPlanMutation(
      stored?.[manualPlanApi.STORAGE_KEY] || manualPlanApi.emptyStore(),
      mutation
    );
    await chrome.storage.local.set({ [manualPlanApi.STORAGE_KEY]: next });
    return next;
  };
  const result = manualPlanMutationTail.then(commit, commit);
  manualPlanMutationTail = result.catch(() => {});
  return result;
}

const fittingTabs = new Set();

async function dispatchScaleDrag(debuggee, x, startY, endY) {
  await chrome.debugger.sendCommand(debuggee, "Input.dispatchMouseEvent", {
    type: "mouseMoved", x, y: startY
  });
  await chrome.debugger.sendCommand(debuggee, "Input.dispatchMouseEvent", {
    type: "mousePressed", x, y: startY, button: "left", buttons: 1, clickCount: 1
  });
  const steps = 6;
  for (let step = 1; step <= steps; step += 1) {
    const y = startY + (endY - startY) * step / steps;
    await chrome.debugger.sendCommand(debuggee, "Input.dispatchMouseEvent", {
      type: "mouseMoved", x, y, button: "left", buttons: 1
    });
  }
  await chrome.debugger.sendCommand(debuggee, "Input.dispatchMouseEvent", {
    type: "mouseReleased", x, y: endY, button: "left", buttons: 0, clickCount: 1
  });
}

async function dispatchScaleDoubleClick(debuggee, x, y) {
  await chrome.debugger.sendCommand(debuggee, "Input.dispatchMouseEvent", {
    type: "mouseMoved", x, y
  });
  for (const clickCount of [1, 2]) {
    await chrome.debugger.sendCommand(debuggee, "Input.dispatchMouseEvent", {
      type: "mousePressed", x, y, button: "left", buttons: 1, clickCount
    });
    await chrome.debugger.sendCommand(debuggee, "Input.dispatchMouseEvent", {
      type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount
    });
  }
}

async function fitAxisScale(sender, message) {
  const tabId = Number(sender?.tab?.id);
  const plot = normalizedRect(message?.plotRect);
  const viewportWidth = finiteNumber(message?.viewportWidth);
  const viewportHeight = finiteNumber(message?.viewportHeight);
  const attempt = Number(message?.attempt);
  const direction = message?.direction === "in" ? "in" : "out";
  if (!Number.isInteger(tabId) || tabId <= 0 || !plot || viewportWidth === null || viewportHeight === null) {
    return { ok: false, error: "Invalid price-scale fit request." };
  }
  if (fittingTabs.has(tabId)) return { ok: false, error: "Price-scale fit already running." };

  const x = Math.min(viewportWidth - 8, plot.right + 18);
  const startY = Math.max(plot.top + 24, plot.top + (plot.bottom - plot.top) * 0.50);
  const dragMagnitude = message?.timeframe === "1m" ? 96 : 48;
  const dragDelta = direction === "in" ? -dragMagnitude : dragMagnitude;
  const endY = Math.max(plot.top + 24, Math.min(plot.bottom - 24, startY + dragDelta));
  if (![x, startY, endY].every(Number.isFinite) || x <= plot.right || endY === startY) {
    return { ok: false, error: "TradingView price scale is unavailable." };
  }

  const debuggee = { tabId };
  fittingTabs.add(tabId);
  let attached = false;
  try {
    await chrome.debugger.attach(debuggee, "1.3");
    attached = true;
    if (!Number.isFinite(attempt) || attempt <= 1 || message?.direction === "reset") {
      await dispatchScaleDoubleClick(debuggee, x, startY);
    } else {
      await dispatchScaleDrag(debuggee, x, startY, endY);
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || "Trusted price-scale gesture failed." };
  } finally {
    if (attached) {
      try { await chrome.debugger.detach(debuggee); } catch { /* Tab may have closed. */ }
    }
    fittingTabs.delete(tabId);
  }
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

function normalizedRect(value) {
  const left = finiteNumber(value?.left);
  const top = finiteNumber(value?.top);
  const right = finiteNumber(value?.right);
  const bottom = finiteNumber(value?.bottom);
  if ([left, top, right, bottom].includes(null) || right <= left || bottom <= top) return null;
  return { left, top, right, bottom };
}

function xClusters(candidates, tolerance = 8) {
  const ordered = [...candidates].sort((a, b) => a.x - b.x);
  const clusters = [];
  for (const candidate of ordered) {
    const current = clusters.at(-1);
    if (!current || Math.abs(candidate.x - current.at(-1).x) > tolerance) clusters.push([candidate]);
    else current.push(candidate);
  }
  return clusters;
}

function regularAxisSequence(candidates, tolerance = 1.5) {
  if (!Array.isArray(candidates) || candidates.length < 3) return [];
  let best = [];
  let bestSpan = -1;
  for (let left = 0; left < candidates.length - 1; left += 1) {
    for (let right = left + 1; right < candidates.length; right += 1) {
      const gap = Math.abs(candidates[right].y - candidates[left].y);
      if (!Number.isFinite(gap) || gap <= tolerance * 2) continue;
      for (const anchor of candidates) {
        const slots = new Map();
        for (const candidate of candidates) {
          const slot = Math.round((candidate.y - anchor.y) / gap);
          const error = Math.abs(candidate.y - (anchor.y + slot * gap));
          if (error > tolerance) continue;
          const previous = slots.get(slot);
          if (!previous || error < previous.error) slots.set(slot, { candidate, error });
        }
        const sequence = [...slots.values()].map((entry) => entry.candidate).sort((a, b) => a.y - b.y);
        const span = sequence.length > 1 ? sequence.at(-1).y - sequence[0].y : 0;
        if (sequence.length > best.length || (sequence.length === best.length && span > bestSpan)) {
          best = sequence;
          bestSpan = span;
        }
      }
    }
  }
  return best.length >= 3 ? best : [];
}

function isolateAxisCandidates(candidates, plotRect, tolerance = 4) {
  const plot = normalizedRect(plotRect);
  if (!plot || !Array.isArray(candidates)) return null;
  const numericTolerance = finiteNumber(tolerance);
  if (numericTolerance === null || numericTolerance < 0) return null;
  const groups = new Map();
  for (const candidate of candidates) {
    const price = finiteNumber(candidate?.price);
    const x = finiteNumber(candidate?.x);
    const y = finiteNumber(candidate?.y);
    const canvasRect = normalizedRect(candidate?.canvasRect);
    if (price === null || x === null || y === null || !canvasRect) continue;
    const overlapsPlot = canvasRect.bottom > plot.top && canvasRect.top < plot.bottom;
    const touchesRightBoundary = canvasRect.left <= plot.right + numericTolerance
      && canvasRect.right >= plot.right - numericTolerance;
    const insidePlotHeight = y >= plot.top - numericTolerance && y <= plot.bottom + numericTolerance;
    const onRightScale = x >= plot.right - numericTolerance;
    const insideCanvas = x >= canvasRect.left - numericTolerance
      && x <= canvasRect.right + numericTolerance
      && y >= canvasRect.top - numericTolerance
      && y <= canvasRect.bottom + numericTolerance;
    if (!overlapsPlot || !touchesRightBoundary || !insidePlotHeight || !onRightScale || !insideCanvas) continue;
    const key = [canvasRect.left, canvasRect.top, canvasRect.right, canvasRect.bottom]
      .map((value) => Math.round(value * 10))
      .join(":");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ price, x, y, canvasRect });
  }

  const clusters = [];
  for (const group of groups.values()) {
    for (const cluster of xClusters(group)) {
      const averageX = cluster.reduce((total, candidate) => total + candidate.x, 0) / cluster.length;
      clusters.push({ cluster, distance: Math.abs(averageX - plot.right) });
    }
  }
  clusters.sort((a, b) => a.distance - b.distance);
  for (const { cluster } of clusters) {
    if (cluster.length < 3) continue;
    const dominantPairs = axisPairsFromCandidates(cluster);
    if (!dominantPairs) continue;
    return dominantPairs;
  }
  return null;
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

  let bestLinear = [];
  let bestLinearSpan = -1;
  for (let left = 0; left < numericCandidates.length - 1; left += 1) {
    for (let right = left + 1; right < numericCandidates.length; right += 1) {
      const first = numericCandidates[left];
      const second = numericCandidates[right];
      const pixelSpan = second.y - first.y;
      const priceSpan = second.price - first.price;
      if (pixelSpan === 0 || priceSpan === 0) continue;
      const pricePerPixel = priceSpan / pixelSpan;
      const allowedPriceError = Math.max(0.01, Math.abs(pricePerPixel) * numericTolerance);
      const inliers = numericCandidates.filter((pair) => {
        const expectedPrice = first.price + (pair.y - first.y) * pricePerPixel;
        return Math.abs(pair.price - expectedPrice) <= allowedPriceError;
      }).sort((a, b) => a.y - b.y);
      const span = inliers.length > 1 ? inliers.at(-1).y - inliers[0].y : 0;
      if (inliers.length > bestLinear.length || (inliers.length === bestLinear.length && span > bestLinearSpan)) {
        bestLinear = inliers;
        bestLinearSpan = span;
      }
    }
  }
  const best = regularAxisSequence(bestLinear, numericTolerance)
    .filter((pair, index, rows) => rows.findIndex((row) => row.price === pair.price) === index);
  return best.length >= 3 ? best : null;
}

function axisScaleError(message) {
  return { ok: false, error: message };
}

async function captureAxisScale(_sender, message) {
  const observedCandidates = Array.isArray(message?.axisCandidates) ? message.axisCandidates : [];
  const isolatedCandidates = isolateAxisCandidates(observedCandidates, message?.plotRect);
  const observedPairs = axisPairsFromCandidates(isolatedCandidates);
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
  const manualMutation = isManualPlanMutationMessage(message?.type);
  if (!isCaptureMessage(message?.type) && !isFitMessage(message?.type) && !manualMutation) return;
  if (!sender.tab?.id || !sender.url?.startsWith("https://www.tradingview.com/")) {
    sendResponse({
      ok: false,
      error: manualMutation
        ? "Manual plan mutations are limited to TradingView tabs."
        : "Axis capture is limited to TradingView tabs."
    });
    return;
  }
  const operation = manualMutation
    ? enqueueManualPlanMutation(message.mutation)
      .then((manualPlans) => ({ ok: true, manualPlans }))
    : isFitMessage(message?.type) ? fitAxisScale(sender, message) : captureAxisScale(sender, message);
  operation
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    applyManualPlanMutation,
    axisPairsFromCandidates,
    captureAxisScale,
    dispatchScaleDrag,
    enqueueManualPlanMutation,
    extractAxisPrices,
    fitAxisScale,
    isCaptureMessage,
    isFitMessage,
    isManualPlanMutationMessage,
    isolateAxisCandidates
  };
}
