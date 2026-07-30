"use strict";

importScripts("overlay-utils.js", "side-panel.js", "manual-plan.js", "strategy-store.js");

NiftySidePanel.install(chrome);

const manualPlanApi = globalThis.NiftyManualPlan;
const strategyStoreApi = globalThis.OptionsStrategyStore;
const MANUAL_PLAN_MUTATION = "MUTATE_MANUAL_PLANS";
const STRATEGY_BOOK_MUTATION = "MUTATE_STRATEGY_BOOK";
const STRATEGY_BOOK_MIGRATION = "MIGRATE_MANUAL_PLANS";
const CHAIN_FETCH = "FETCH_NIFTY_CHAIN";
const BRIDGE_API = "http://127.0.0.1:8787";
let manualPlanMutationTail = Promise.resolve();
let strategyMutationTail = Promise.resolve();

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

function isManualPlanMutationMessage(type) {
  return type === MANUAL_PLAN_MUTATION;
}

function isChainFetchMessage(type) {
  return type === CHAIN_FETCH;
}

function isStrategyMutationMessage(type) {
  return type === STRATEGY_BOOK_MUTATION;
}

function isStrategyMigrationMessage(type) {
  return type === STRATEGY_BOOK_MIGRATION;
}

function isTradingViewSender(sender) {
  if (!sender?.tab?.id || typeof sender.url !== "string") return false;
  try {
    const url = new URL(sender.url);
    return url.protocol === "https:"
      && ["tradingview.com", "www.tradingview.com"].includes(url.hostname);
  } catch {
    return false;
  }
}

function isExtensionSender(sender) {
  if (typeof sender?.url !== "string" || typeof chrome?.runtime?.id !== "string") return false;
  try {
    const url = new URL(sender.url);
    return sender.id === chrome.runtime.id
      && url.protocol === "chrome-extension:"
      && url.hostname === chrome.runtime.id;
  } catch {
    return false;
  }
}

async function fetchNiftyChain(expiry, fetchImpl = globalThis.fetch) {
  if (!manualPlanApi.isIsoDate(expiry)) throw new Error("Select one exact NIFTY expiry first.");
  const response = await fetchImpl(
    `${BRIDGE_API}/api/nifty-chain?expiry=${encodeURIComponent(expiry)}`,
    { cache: "no-store" }
  );
  const chain = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(chain.error || "Option chain unavailable.");
  return chain;
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
    const rawStore = stored && Object.hasOwn(stored, manualPlanApi.STORAGE_KEY)
      ? stored[manualPlanApi.STORAGE_KEY]
      : manualPlanApi.emptyStore();
    const next = applyManualPlanMutation(
      rawStore,
      mutation
    );
    await chrome.storage.local.set({ [manualPlanApi.STORAGE_KEY]: next });
    return next;
  };
  const result = manualPlanMutationTail.then(commit, commit);
  manualPlanMutationTail = result.catch(() => {});
  return result;
}

function enqueueStrategyCommit(commit) {
  const write = async () => {
    const stored = await chrome.storage.local.get([
      strategyStoreApi.STORAGE_KEY,
      manualPlanApi.STORAGE_KEY
    ]);
    const rawBook = stored && Object.hasOwn(stored, strategyStoreApi.STORAGE_KEY)
      ? stored[strategyStoreApi.STORAGE_KEY]
      : strategyStoreApi.emptyBook();
    const next = commit(rawBook, stored?.[manualPlanApi.STORAGE_KEY]);
    await chrome.storage.local.set({ [strategyStoreApi.STORAGE_KEY]: next });
    return next;
  };
  const result = strategyMutationTail.then(write, write);
  strategyMutationTail = result.catch(() => {});
  return result;
}

function enqueueStrategyMutation(command) {
  return enqueueStrategyCommit((book) => strategyStoreApi.applyCommand(book, command));
}

function enqueueStrategyMigration({ instrumentKey, underlying, at }) {
  const timestamp = typeof at === "string" && at ? at : new Date().toISOString();
  return enqueueStrategyCommit((book, manualPlans) => strategyStoreApi.migrateManualPlans(
    book,
    manualPlans,
    { instrumentKey, underlying, at: timestamp }
  ));
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
  const chainFetch = isChainFetchMessage(message?.type);
  const strategyMutation = isStrategyMutationMessage(message?.type);
  const strategyMigration = isStrategyMigrationMessage(message?.type);
  if (!isCaptureMessage(message?.type) && !manualMutation && !chainFetch
    && !strategyMutation && !strategyMigration) return;
  const trustedStrategySender = (strategyMutation || strategyMigration) && isExtensionSender(sender);
  if (!isTradingViewSender(sender) && !trustedStrategySender) {
    sendResponse({
      ok: false,
      error: chainFetch
        ? "Option-chain refresh is limited to TradingView tabs."
        : strategyMutation || strategyMigration
        ? "Strategy mutations are limited to TradingView tabs."
        : manualMutation
        ? "Manual plan mutations are limited to TradingView tabs."
        : "Axis capture is limited to TradingView tabs."
    });
    return chainFetch || strategyMutation || strategyMigration || undefined;
  }
  const operation = chainFetch
    ? fetchNiftyChain(message.expiry).then((chain) => ({ ok: true, chain }))
    : strategyMutation
    ? enqueueStrategyMutation(message.command)
      .then((strategyBook) => ({ ok: true, strategyBook }))
    : strategyMigration
    ? enqueueStrategyMigration(message)
      .then((strategyBook) => ({ ok: true, strategyBook }))
    : manualMutation
    ? enqueueManualPlanMutation(message.mutation)
      .then((manualPlans) => ({ ok: true, manualPlans }))
    : captureAxisScale(sender, message);
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
    enqueueManualPlanMutation,
    extractAxisPrices,
    fetchNiftyChain,
    isCaptureMessage,
    isChainFetchMessage,
    isManualPlanMutationMessage,
    isolateAxisCandidates,
    isStrategyMigrationMessage,
    isStrategyMutationMessage,
    enqueueStrategyMigration,
    enqueueStrategyMutation
  };
}
