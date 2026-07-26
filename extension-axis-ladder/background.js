"use strict";

importScripts("overlay-utils.js");

const attachedTabs = new Set();
const DEBUGGER_VERSION = "1.3";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function ensureAttached(tabId) {
  if (attachedTabs.has(tabId)) return;
  await chrome.debugger.attach({ tabId }, DEBUGGER_VERSION);
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
  try {
    await chrome.debugger.detach({ tabId });
  } catch {
    // Tab may have closed or detached itself.
  }
}

async function capturePineAnchors(sender, message) {
  const dataUrl = await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" });
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  const surface = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = surface.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const image = context.getImageData(0, 0, surface.width, surface.height);
  const scaleX = surface.width / Number(message.viewportWidth);
  const scaleY = surface.height / Number(message.viewportHeight);
  const source = message.plotRect;
  const region = {
    left: source.left * scaleX,
    top: source.top * scaleY,
    right: source.right * scaleX,
    bottom: source.bottom * scaleY
  };
  const lower = NiftyOverlay.findColorBounds(image.data, surface.width, surface.height, [255, 0, 254], region, 22);
  const upper = NiftyOverlay.findColorBounds(image.data, surface.width, surface.height, [0, 255, 254], region, 22);
  const toCss = (bounds) => bounds && ({
    left: bounds.minX / scaleX,
    right: (bounds.maxX + 1) / scaleX,
    top: bounds.minY / scaleY,
    bottom: (bounds.maxY + 1) / scaleY,
    x: bounds.x / scaleX,
    y: bounds.y / scaleY,
    count: bounds.count
  });
  return { lower: toCss(lower), upper: toCss(upper) };
}

chrome.debugger.onDetach.addListener(({ tabId }) => {
  if (tabId) attachedTabs.delete(tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  attachedTabs.delete(tabId);
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
