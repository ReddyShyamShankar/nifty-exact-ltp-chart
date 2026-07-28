"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const sidePanel = require("./side-panel.js");

function fakeChrome(seedTabs = []) {
  const calls = [];
  const listeners = {};
  const session = {};
  const tabsById = new Map(seedTabs.map((tab) => [tab.id, tab]));
  return {
    calls,
    listeners,
    session,
    runtime: {
      onInstalled: { addListener(fn) { listeners.installed = fn; } },
      onStartup: { addListener(fn) { listeners.startup = fn; } }
    },
    tabs: {
      onCreated: { addListener(fn) { listeners.created = fn; } },
      onUpdated: { addListener(fn) { listeners.updated = fn; } },
      onActivated: { addListener(fn) { listeners.activated = fn; } },
      async query() { return [...tabsById.values()]; },
      async get(tabId) { return tabsById.get(tabId); }
    },
    sidePanel: {
      async setPanelBehavior(value) { calls.push(["behavior", value]); },
      async setOptions(value) { calls.push(["options", value]); },
      async close(value) { calls.push(["close", value]); }
    },
    action: {
      async enable(tabId) { calls.push(["enable", tabId]); },
      async disable(tabId) { calls.push(["disable", tabId]); }
    },
    storage: {
      session: {
        async get(key) { return { [key]: session[key] }; },
        async set(values) { Object.assign(session, values); calls.push(["session", values]); }
      }
    }
  };
}

test("accepts only exact HTTPS TradingView hosts", () => {
  assert.equal(sidePanel.isTradingViewUrl("https://www.tradingview.com/chart/one"), true);
  assert.equal(sidePanel.isTradingViewUrl("https://tradingview.com/chart/two"), true);
  for (const value of [
    "http://www.tradingview.com/chart/one",
    "https://tradingview.com.attacker.example/chart/one",
    "https://www.tradingview.com.evil.example/",
    "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html",
    "not a url",
    null
  ]) assert.equal(sidePanel.isTradingViewUrl(value), false);
});

test("configures panel and action only on an exact TradingView tab", async () => {
  const chromeApi = fakeChrome();
  const controller = sidePanel.createController(chromeApi);
  await controller.configureTab({ id: 7, url: "https://www.tradingview.com/chart/one" });
  await controller.configureTab({ id: 8, url: "https://example.com/" });
  assert.deepEqual(chromeApi.calls, [
    ["options", { tabId: 7, path: "popup.html", enabled: true }],
    ["enable", 7],
    ["options", { tabId: 8, enabled: false }],
    ["disable", 8]
  ]);
});

test("tab activation closes previous panel and persists new active tab", async () => {
  const chromeApi = fakeChrome([{ id: 12, windowId: 3, url: "https://www.tradingview.com/chart/two" }]);
  chromeApi.session.niftySidePanelActiveTabs = { "3": 11 };
  const controller = sidePanel.createController(chromeApi);
  await controller.handleActivated({ tabId: 12, windowId: 3 });
  assert.deepEqual(chromeApi.calls.slice(0, 3), [
    ["close", { tabId: 11 }],
    ["session", { niftySidePanelActiveTabs: { "3": 12 } }],
    ["options", { tabId: 12, path: "popup.html", enabled: true }]
  ]);
});

test("first activation and same-tab activation never close a panel", async () => {
  const chromeApi = fakeChrome([{ id: 12, windowId: 3, url: "https://www.tradingview.com/chart/two" }]);
  const controller = sidePanel.createController(chromeApi);
  await controller.handleActivated({ tabId: 12, windowId: 3 });
  await controller.handleActivated({ tabId: 12, windowId: 3 });
  assert.equal(chromeApi.calls.some(([kind]) => kind === "close"), false);
});

test("initialize sets click behavior and configures existing tabs without opening panel", async () => {
  const chromeApi = fakeChrome([
    { id: 1, windowId: 1, active: true, url: "https://www.tradingview.com/chart/one" },
    { id: 2, windowId: 1, active: false, url: "https://example.com/" }
  ]);
  const controller = sidePanel.createController(chromeApi);
  await controller.initialize();
  assert.deepEqual(chromeApi.calls[0], ["behavior", { openPanelOnActionClick: true }]);
  assert.equal(chromeApi.calls.some(([kind]) => kind === "open"), false);
  assert.deepEqual(chromeApi.session.niftySidePanelActiveTabs, { "1": 1 });
});

test("install registers lifecycle listeners and never opens or fetches", async () => {
  const chromeApi = fakeChrome();
  sidePanel.install(chromeApi);
  await new Promise((resolve) => setImmediate(resolve));
  for (const name of ["installed", "startup", "created", "updated", "activated"]) {
    assert.equal(typeof chromeApi.listeners[name], "function");
  }
  const forbidden = new Set(["open", "fetch", "seller-refresh", "positions", "trades", "chain"]);
  assert.equal(chromeApi.calls.some(([kind]) => forbidden.has(kind)), false);
});

test("created and URL-updated listeners configure only supplied tabs", async () => {
  const chromeApi = fakeChrome();
  sidePanel.install(chromeApi);
  await new Promise((resolve) => setImmediate(resolve));
  chromeApi.calls.length = 0;
  chromeApi.listeners.created({ id: 20, url: "https://www.tradingview.com/chart/new" });
  chromeApi.listeners.updated(21, { title: "ignored" }, { id: 21, url: "https://example.com/" });
  chromeApi.listeners.updated(22, { url: "https://example.com/" }, { id: 22, url: "https://example.com/" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(chromeApi.calls, [
    ["options", { tabId: 20, path: "popup.html", enabled: true }],
    ["enable", 20],
    ["options", { tabId: 22, enabled: false }],
    ["disable", 22]
  ]);
});

test("expected close failures stay silent and unexpected failures are reported once", async () => {
  const chromeApi = fakeChrome([
    { id: 12, windowId: 3, url: "https://www.tradingview.com/chart/two" },
    { id: 13, windowId: 3, url: "https://www.tradingview.com/chart/three" },
    { id: 14, windowId: 3, url: "https://www.tradingview.com/chart/four" }
  ]);
  chromeApi.session.niftySidePanelActiveTabs = { "3": 11 };
  chromeApi.sidePanel.close = async () => { throw new Error("No active side panel"); };
  const reports = [];
  const controller = sidePanel.createController(chromeApi, { report: (message) => reports.push(message) });
  await controller.handleActivated({ tabId: 12, windowId: 3 });
  assert.deepEqual(reports, []);
  chromeApi.sidePanel.close = async () => { throw new Error("Unexpected close failure"); };
  await controller.handleActivated({ tabId: 13, windowId: 3 });
  await controller.handleActivated({ tabId: 14, windowId: 3 });
  assert.deepEqual(reports, ["NIFTY side panel: Unexpected close failure"]);
});
