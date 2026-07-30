"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const modulePath = path.join(__dirname, "action-popup.js");

function loadPopup() {
  assert.equal(fs.existsSync(modulePath), true, "action popup controller must exist");
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

function fakeNode() {
  const listeners = {};
  return {
    textContent: "",
    disabled: false,
    dataset: {},
    addEventListener(type, listener) { listeners[type] = listener; },
    dispatch(type) { return listeners[type]?.({ preventDefault() {} }); }
  };
}

function harness({ tab, response = { ok: true }, sendError = null } = {}) {
  const nodes = new Map([
    ["refresh-ladder", fakeNode()],
    ["open-side-panel", fakeNode()],
    ["refresh-label", fakeNode()],
    ["popup-status", fakeNode()]
  ]);
  const calls = [];
  let closed = false;
  const chromeApi = {
    tabs: {
      async query(value) {
        calls.push(["query", value]);
        return tab ? [tab] : [];
      },
      async sendMessage(tabId, message) {
        calls.push(["message", tabId, message]);
        if (sendError) throw sendError;
        return response;
      }
    },
    sidePanel: {
      async open(value) { calls.push(["open", value]); }
    }
  };
  const documentApi = { getElementById(id) { return nodes.get(id); } };
  const controller = loadPopup().createController(chromeApi, documentApi, () => { closed = true; });
  return { calls, controller, nodes, wasClosed: () => closed };
}

const tradingViewTab = { id: 7, url: "https://www.tradingview.com/chart/one" };

test("popup describes TradingView-axis membership without fixed strike count", () => {
  const html = fs.readFileSync(path.join(__dirname, "action-popup.html"), "utf8");
  assert.match(html, /TV AXIS · MANUAL REFRESH/);
  assert.doesNotMatch(html, /13 STRIKES/);
});

test("refresh action gives immediate feedback and refreshes only active TradingView ladder", async () => {
  const h = harness({ tab: tradingViewTab });

  assert.equal(await h.controller.refreshLadder(), true);
  assert.deepEqual(h.calls, [
    ["query", { active: true, currentWindow: true }],
    ["message", 7, { type: "REFRESH_OPTION_NUMBERS" }]
  ]);
  assert.equal(h.nodes.get("refresh-label").textContent, "REFRESH LADDER");
  assert.equal(h.nodes.get("popup-status").textContent, "REFRESHED JUST NOW");
  assert.equal(h.nodes.get("popup-status").dataset.tone, "success");
  assert.equal(h.nodes.get("refresh-ladder").disabled, false);
});

test("failed refresh stays in popup and explains failure", async () => {
  const h = harness({ tab: tradingViewTab, response: { ok: false, error: "Bridge unavailable" } });

  assert.equal(await h.controller.refreshLadder(), false);
  assert.equal(h.nodes.get("popup-status").textContent, "Bridge unavailable");
  assert.equal(h.nodes.get("popup-status").dataset.tone, "error");
  assert.equal(h.wasClosed(), false);
});

test("open side panel action opens controls for active TradingView tab then closes popup", async () => {
  const h = harness({ tab: tradingViewTab });

  assert.equal(await h.controller.openSidePanel(), true);
  assert.deepEqual(h.calls, [
    ["query", { active: true, currentWindow: true }],
    ["open", { tabId: 7 }]
  ]);
  assert.equal(h.wasClosed(), true);
});

test("unsupported tabs disable both popup actions", async () => {
  const h = harness({ tab: { id: 9, url: "https://example.com/" } });

  assert.equal(await h.controller.initialize(), false);
  assert.equal(h.nodes.get("refresh-ladder").disabled, true);
  assert.equal(h.nodes.get("open-side-panel").disabled, true);
  assert.equal(h.nodes.get("popup-status").textContent, "OPEN A TRADINGVIEW CHART");
});
