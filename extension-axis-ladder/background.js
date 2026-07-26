"use strict";

importScripts("overlay-utils.js");

const attachedTabs = new Set();
const debuggerTabs = new Set();
const debuggerAttachTails = new Map();
const activeCaptureTabs = new Set();
const captureLeaseTails = new Map();
const DEBUGGER_VERSION = "1.3";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function hasDebugger(tabId) {
  return debuggerTabs.has(tabId) || attachedTabs.has(tabId);
}

async function attachDebugger(tabId) {
  if (hasDebugger(tabId)) return;
  const inFlight = debuggerAttachTails.get(tabId);
  if (inFlight) return inFlight;
  const attach = chrome.debugger.attach({ tabId }, DEBUGGER_VERSION).then(() => {
    debuggerTabs.add(tabId);
  });
  debuggerAttachTails.set(tabId, attach);
  try {
    await attach;
  } finally {
    if (debuggerAttachTails.get(tabId) === attach) debuggerAttachTails.delete(tabId);
  }
}

async function detachDebugger(tabId) {
  if (!debuggerTabs.has(tabId)) return;
  debuggerTabs.delete(tabId);
  try {
    await chrome.debugger.detach({ tabId });
  } catch {
    // Tab may have closed or detached itself.
  }
}

async function ensureAttached(tabId) {
  if (attachedTabs.has(tabId)) return;
  await attachDebugger(tabId);
  attachedTabs.add(tabId);
}

async function send(tabId, method, params = {}) {
  await ensureAttached(tabId);
  return chrome.debugger.sendCommand({ tabId }, method, params);
}

async function click(tabId, x, y) {
  await send(tabId, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await pause(140);
  await send(tabId, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    buttons: 1,
    clickCount: 1
  });
  await send(tabId, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    buttons: 0,
    clickCount: 1
  });
}

async function doubleClick(tabId, x, y) {
  await send(tabId, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await pause(140);
  for (const clickCount of [1, 2]) {
    await send(tabId, "Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      buttons: 1,
      clickCount
    });
    await send(tabId, "Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: "left",
      buttons: 0,
      clickCount
    });
    await pause(80);
  }
}

async function replaceText(tabId, text) {
  await send(tabId, "Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "a",
    code: "KeyA",
    windowsVirtualKeyCode: 65,
    nativeVirtualKeyCode: 0,
    modifiers: 4
  });
  await send(tabId, "Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "a",
    code: "KeyA",
    windowsVirtualKeyCode: 65,
    nativeVirtualKeyCode: 0,
    modifiers: 4
  });
  await send(tabId, "Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Backspace",
    code: "Backspace",
    windowsVirtualKeyCode: 8,
    nativeVirtualKeyCode: 51
  });
  await send(tabId, "Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Backspace",
    code: "Backspace",
    windowsVirtualKeyCode: 8,
    nativeVirtualKeyCode: 51
  });
  await send(tabId, "Input.insertText", { text });
}

async function replaceFieldText(tabId, x, y, text) {
  await doubleClick(tabId, x, y);
  await pause(100);
  await send(tabId, "Input.insertText", { text });
}

async function detach(tabId) {
  if (!attachedTabs.has(tabId)) return;
  attachedTabs.delete(tabId);
  if (!activeCaptureTabs.has(tabId)) await detachDebugger(tabId);
}

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
  return type === "CAPTURE_AXIS_SCALE" || type === "CAPTURE_PINE_ANCHORS";
}

function withCaptureLease(tabId, callback) {
  const previous = captureLeaseTails.get(tabId) || Promise.resolve();
  const run = previous.catch(() => undefined).then(callback);
  const tail = run.then(() => undefined, () => undefined);
  captureLeaseTails.set(tabId, tail);
  return run.finally(() => {
    if (captureLeaseTails.get(tabId) === tail) captureLeaseTails.delete(tabId);
  });
}

async function withTemporaryAxisDebugger(tabId, callback) {
  return withCaptureLease(tabId, async () => {
    const attachedHere = !hasDebugger(tabId);
    let accessibilityEnabled = false;
    activeCaptureTabs.add(tabId);
    try {
      if (attachedHere) await attachDebugger(tabId);
      const sendCommand = (method, params = {}) => chrome.debugger.sendCommand({ tabId }, method, params);
      await sendCommand("Accessibility.enable");
      accessibilityEnabled = true;
      return await callback(sendCommand);
    } finally {
      if (accessibilityEnabled) {
        try { await chrome.debugger.sendCommand({ tabId }, "Accessibility.disable"); } catch {}
      }
      activeCaptureTabs.delete(tabId);
      if (attachedHere && !attachedTabs.has(tabId)) await detachDebugger(tabId);
    }
  });
}

function domAttributes(node) {
  const attributes = {};
  for (let index = 0; index < (node?.attributes || []).length; index += 2) {
    attributes[node.attributes[index]] = node.attributes[index + 1];
  }
  return attributes;
}

function walkDom(node, visit) {
  if (!node) return;
  visit(node);
  for (const child of node.childNodes || []) walkDom(child, visit);
  for (const shadowRoot of node.shadowRoots || []) walkDom(shadowRoot, visit);
}

function canvasBackendIds(root) {
  const canvases = [];
  walkDom(root, (node) => {
    if (node.nodeName !== "CANVAS" || !node.backendNodeId) return;
    const attributes = domAttributes(node);
    const hint = `${attributes["aria-label"] || ""} ${attributes.class || ""} ${attributes.id || ""}`;
    canvases.push({
      backendNodeId: node.backendNodeId,
      preferred: /chart|pane|tradingview/i.test(hint)
    });
  });
  return canvases.sort((a, b) => Number(b.preferred) - Number(a.preferred));
}

function boxCenter(box) {
  if (!Array.isArray(box) || box.length < 8) return null;
  const xs = [box[0], box[2], box[4], box[6]].map(Number);
  const ys = [box[1], box[3], box[5], box[7]].map(Number);
  if (![...xs, ...ys].every(Number.isFinite)) return null;
  return {
    x: xs.reduce((sum, value) => sum + value, 0) / xs.length,
    y: ys.reduce((sum, value) => sum + value, 0) / ys.length
  };
}

function validAxisBox(center, message) {
  const viewportWidth = finiteNumber(message?.viewportWidth);
  const viewportHeight = finiteNumber(message?.viewportHeight);
  const plot = message?.plotRect;
  const left = finiteNumber(plot?.left);
  const top = finiteNumber(plot?.top);
  const right = finiteNumber(plot?.right);
  const bottom = finiteNumber(plot?.bottom);
  if (![center?.x, center?.y, viewportWidth, viewportHeight, left, top, right, bottom].every(Number.isFinite)) return false;
  if (viewportWidth <= 0 || viewportHeight <= 0 || right <= left || bottom <= top) return false;
  return center.x >= Math.max(0, right - 60)
    && center.x <= viewportWidth
    && center.y >= top
    && center.y <= Math.min(viewportHeight, bottom);
}

async function frontendBox(sendCommand, backendNodeId) {
  if (!Number.isInteger(backendNodeId) || backendNodeId <= 0) return null;
  try {
    const pushed = await sendCommand("DOM.pushNodesByBackendIdsToFrontend", { backendNodeIds: [backendNodeId] });
    const nodeId = pushed?.nodeIds?.[0];
    if (!Number.isInteger(nodeId)) return null;
    return (await sendCommand("DOM.getBoxModel", { nodeId })).model?.content || null;
  } catch {
    return null;
  }
}

async function axisCandidates(sendCommand, nodes, message) {
  const candidates = [];
  for (const node of nodes || []) {
    const price = normalizedAxisText(axisText(node?.name ?? node));
    if (price === null || !node?.backendDOMNodeId) continue;
    const center = boxCenter(await frontendBox(sendCommand, node.backendDOMNodeId));
    if (!validAxisBox(center, message)) continue;
    candidates.push({ price, y: center.y });
  }
  return candidates;
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

function matchAxisCandidatesToGridRows(candidates, gridRows, tolerance = 3) {
  if (!Array.isArray(candidates) || !Array.isArray(gridRows) || candidates.length < 2 || candidates.length !== gridRows.length) return null;
  const numericTolerance = finiteNumber(tolerance);
  if (numericTolerance === null || numericTolerance < 0) return null;
  const rows = gridRows.map(finiteNumber);
  if (rows.includes(null) || new Set(rows).size !== rows.length) return null;
  const matches = new Map();
  for (const candidate of candidates) {
    const price = finiteNumber(candidate?.price);
    const y = finiteNumber(candidate?.y);
    if (price === null || y === null) return null;
    const nearby = rows.filter((row) => Math.abs(row - y) <= numericTolerance);
    if (nearby.length !== 1 || matches.has(nearby[0])) return null;
    matches.set(nearby[0], price);
  }
  if (matches.size !== rows.length) return null;
  const pairs = rows.map((y) => ({ price: matches.get(y), y })).sort((a, b) => a.y - b.y);
  if (new Set(pairs.map((pair) => pair.price)).size !== pairs.length) return null;
  const first = pairs[0];
  const last = pairs[pairs.length - 1];
  const pixelSpan = last.y - first.y;
  const priceSpan = last.price - first.price;
  if (pixelSpan <= 0 || priceSpan >= 0) return null;
  const pricePerPixel = priceSpan / pixelSpan;
  const allowedPriceError = Math.max(0.01, Math.abs(pricePerPixel) * Math.max(1, numericTolerance));
  for (const pair of pairs) {
    const expectedPrice = first.price + (pair.y - first.y) * pricePerPixel;
    if (Math.abs(pair.price - expectedPrice) > allowedPriceError) return null;
  }
  return pairs;
}

async function readNativeAxisPrices(tabId, message) {
  return withTemporaryAxisDebugger(tabId, async (sendCommand) => {
    await sendCommand("DOM.enable");
    try {
      const document = (await sendCommand("DOM.getDocument", { depth: -1, pierce: true })).root;
      const preferred = [];
      for (const canvas of canvasBackendIds(document)) {
        try {
          const partial = await sendCommand("Accessibility.getPartialAXTree", {
            backendDOMNodeId: canvas.backendNodeId,
            fetchRelatives: true
          });
          const found = await axisCandidates(sendCommand, partial?.nodes, message);
          if (found.length >= 2) preferred.push(...found);
        } catch {
          // A canvas may not expose an accessibility subtree; use the full tree below.
        }
      }
      const preferredCandidates = uniqueAxisCandidates(preferred);
      if (preferredCandidates.length >= 2) return preferredCandidates;

      const full = await sendCommand("Accessibility.getFullAXTree");
      const found = await axisCandidates(sendCommand, full?.nodes, message);
      return uniqueAxisCandidates(found);
    } finally {
      try { await sendCommand("DOM.disable"); } catch {}
    }
  });
}

function scaledCoordinate(value, scale) {
  const number = finiteNumber(value);
  const ratio = finiteNumber(scale);
  if (number === null || ratio === null || ratio <= 0) return null;
  return number / ratio;
}

function cssGridCalibration(deviceRows, scaleY) {
  if (!Array.isArray(deviceRows)) return null;
  const gridRows = deviceRows.map((row) => scaledCoordinate(row, scaleY));
  if (gridRows.some((row) => row === null)) return null;
  return { gridRows, gridGapPx: NiftyOverlay.dominantGridGap(gridRows) };
}

function toCssAnchor(anchor, scaleX, scaleY) {
  if (!anchor || typeof anchor !== "object" || Array.isArray(anchor)) return null;
  const result = {};
  for (const key of ["left", "right", "x"]) {
    if (anchor[key] !== undefined) {
      const value = scaledCoordinate(anchor[key], scaleX);
      if (value === null) return null;
      result[key] = value;
    }
  }
  for (const key of ["top", "bottom", "y"]) {
    if (anchor[key] !== undefined) {
      const value = scaledCoordinate(anchor[key], scaleY);
      if (value === null) return null;
      result[key] = value;
    }
  }
  if (anchor.count !== undefined) {
    const count = finiteNumber(anchor.count);
    if (count === null) return null;
    result.count = count;
  }
  return Object.keys(result).length ? result : null;
}

function axisScaleError(message) {
  return { ok: false, error: message };
}

async function captureScreenshot(sender, message) {
  const dataUrl = await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" });
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  const surface = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = surface.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const image = context.getImageData(0, 0, surface.width, surface.height);
  const viewportWidth = finiteNumber(message?.viewportWidth);
  const viewportHeight = finiteNumber(message?.viewportHeight);
  const source = message.plotRect;
  const sourceValues = [source?.left, source?.top, source?.right, source?.bottom];
  if (viewportWidth === null || viewportHeight === null || viewportWidth <= 0 || viewportHeight <= 0
    || sourceValues.some((value) => finiteNumber(value) === null)) {
    throw new Error("Viewport and plot rectangle are required for axis capture.");
  }
  const scaleX = surface.width / viewportWidth;
  const scaleY = surface.height / viewportHeight;
  const region = {
    left: source.left * scaleX,
    top: source.top * scaleY,
    right: source.right * scaleX,
    bottom: source.bottom * scaleY
  };
  const lower = NiftyOverlay.findColorBounds(image.data, surface.width, surface.height, [255, 0, 254], region, 22);
  const upper = NiftyOverlay.findColorBounds(image.data, surface.width, surface.height, [0, 255, 254], region, 22);
  const deviceGridRows = NiftyOverlay.findHorizontalGridRows(image.data, surface.width, surface.height, region);
  const gridCalibration = cssGridCalibration(deviceGridRows, scaleY);
  const toDevice = (bounds) => bounds && ({
    left: bounds.minX,
    right: bounds.maxX + 1,
    top: bounds.minY,
    bottom: bounds.maxY + 1,
    x: bounds.x,
    y: bounds.y,
    count: bounds.count
  });
  return {
    lower: toDevice(lower),
    upper: toDevice(upper),
    gridRows: gridCalibration?.gridRows || [],
    gridGapPx: gridCalibration?.gridGapPx ?? null,
    scaleX,
    scaleY
  };
}

async function capturePineAnchors(sender, message, dependencies = {}) {
  const capture = dependencies.captureScreenshot || captureScreenshot;
  const screenshot = await capture(sender, message);
  const scaleX = finiteNumber(screenshot?.scaleX);
  const scaleY = finiteNumber(screenshot?.scaleY);
  if (scaleX === null || scaleX <= 0 || scaleY === null || scaleY <= 0) {
    throw new Error("Screenshot scale is unavailable.");
  }
  return {
    lower: toCssAnchor(screenshot.lower, scaleX, scaleY),
    upper: toCssAnchor(screenshot.upper, scaleX, scaleY)
  };
}

async function captureAxisScale(sender, message, dependencies = {}) {
  const capture = dependencies.captureScreenshot || captureScreenshot;
  const readAxis = dependencies.readNativeAxisPrices || ((tabId, details) => readNativeAxisPrices(tabId, details));
  const screenshot = await capture(sender, message);
  const scaleX = finiteNumber(screenshot?.scaleX);
  const scaleY = finiteNumber(screenshot?.scaleY);
  if (scaleY === null || scaleY <= 0) return axisScaleError("Screenshot scale is unavailable.");

  const gridRows = Array.isArray(screenshot?.gridRows) ? screenshot.gridRows.map(finiteNumber) : [];
  if (gridRows.includes(null)) return axisScaleError("Grid rows are not reliable.");
  const gridGapPx = finiteNumber(screenshot?.gridGapPx);
  if (!Number.isFinite(gridGapPx) || gridGapPx <= 0) return axisScaleError("Grid spacing is not reliable.");

  const nativeCandidates = await readAxis(sender.tab.id, message);
  const axisPairs = matchAxisCandidatesToGridRows(nativeCandidates, gridRows);
  if (!axisPairs) return axisScaleError("Native axis labels and grid rows do not form a reliable calibration.");

  const lower = toCssAnchor(screenshot.lower, scaleX, scaleY);
  const upper = toCssAnchor(screenshot.upper, scaleX, scaleY);
  return { ok: true, lower, upper, gridRows, gridGapPx, axisPrices: axisPairs.map((pair) => pair.price), axisPairs };
}

chrome.debugger.onDetach.addListener(({ tabId }) => {
  if (!Number.isInteger(tabId)) return;
  attachedTabs.delete(tabId);
  debuggerTabs.delete(tabId);
  debuggerAttachTails.delete(tabId);
  activeCaptureTabs.delete(tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  attachedTabs.delete(tabId);
  debuggerTabs.delete(tabId);
  debuggerAttachTails.delete(tabId);
  activeCaptureTabs.delete(tabId);
  captureLeaseTails.delete(tabId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "CAPTURE_PINE_ANCHORS") {
    if (!sender.tab?.id || !sender.url?.startsWith("https://www.tradingview.com/")) {
      sendResponse({ ok: false, error: "Chart capture is limited to TradingView tabs." });
      return;
    }
    capturePineAnchors(sender, message)
      .then((anchors) => sendResponse({ ok: true, ...anchors }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "CAPTURE_AXIS_SCALE") {
    if (!sender.tab?.id || !sender.url?.startsWith("https://www.tradingview.com/")) {
      sendResponse({ ok: false, error: "Chart capture is limited to TradingView tabs." });
      return;
    }
    captureAxisScale(sender, message)
      .then((capture) => sendResponse(capture))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (!message?.type?.startsWith("TRUSTED_")) return;
  const tabId = sender.tab?.id;
  if (!tabId || !sender.url?.startsWith("https://www.tradingview.com/")) {
    sendResponse({ ok: false, error: "Trusted input is limited to active TradingView tabs." });
    return;
  }

  (async () => {
    if (message.type === "TRUSTED_SESSION_START") {
      await ensureAttached(tabId);
    } else if (message.type === "TRUSTED_CLICK") {
      await click(tabId, Number(message.x), Number(message.y));
    } else if (message.type === "TRUSTED_DOUBLE_CLICK") {
      await doubleClick(tabId, Number(message.x), Number(message.y));
    } else if (message.type === "TRUSTED_REPLACE_TEXT") {
      await replaceText(tabId, String(message.text || ""));
    } else if (message.type === "TRUSTED_REPLACE_FIELD") {
      await replaceFieldText(tabId, Number(message.x), Number(message.y), String(message.text || ""));
    } else if (message.type === "TRUSTED_SESSION_END") {
      await detach(tabId);
    } else {
      throw new Error(`Unknown trusted input command: ${message.type}`);
    }
    return { ok: true };
  })().then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    attachedTabs,
    captureAxisScale,
    capturePineAnchors,
    cssGridCalibration,
    detach,
    ensureAttached,
    extractAxisPrices,
    isCaptureMessage,
    matchAxisCandidatesToGridRows,
    readNativeAxisPrices,
    withTemporaryAxisDebugger
  };
}
