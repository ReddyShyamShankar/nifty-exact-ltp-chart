"use strict";

(function expose(root, factory) {
  const api = factory();
  root.NiftySidePanel = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis, () => {
  const PANEL_PATH = "popup.html";
  const ACTIVE_TABS_KEY = "niftySidePanelActiveTabs";
  const HOSTS = new Set(["tradingview.com", "www.tradingview.com"]);

  function isTradingViewUrl(value) {
    if (typeof value !== "string") return false;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && HOSTS.has(url.hostname);
    } catch {
      return false;
    }
  }

  function createController(chromeApi, { report = console.warn } = {}) {
    const reported = new Set();
    let activationQueue = Promise.resolve();

    function isExpectedCloseError(error) {
      const message = error?.message || String(error);
      return /No active side panel|No tab with id|Invalid tab ID/i.test(message);
    }

    function reportOnce(error) {
      const message = error?.message || String(error);
      if (reported.has(message)) return;
      reported.add(message);
      report(`NIFTY side panel: ${message}`);
    }

    async function configureTab(tab) {
      const tabId = Number(tab?.id);
      if (!Number.isInteger(tabId) || tabId <= 0) return;
      if (isTradingViewUrl(tab?.url)) {
        await chromeApi.sidePanel.setOptions({ tabId, path: PANEL_PATH, enabled: true });
        await chromeApi.action.enable(tabId);
      } else {
        await chromeApi.sidePanel.setOptions({ tabId, enabled: false });
        await chromeApi.action.disable(tabId);
      }
    }

    async function activate({ tabId, windowId }) {
      const numericTabId = Number(tabId);
      const numericWindowId = Number(windowId);
      if (!Number.isInteger(numericTabId) || !Number.isInteger(numericWindowId)) return;
      const stored = await chromeApi.storage.session.get(ACTIVE_TABS_KEY);
      const activeTabs = { ...(stored?.[ACTIVE_TABS_KEY] || {}) };
      const previousTabId = Number(activeTabs[String(numericWindowId)]);
      if (Number.isInteger(previousTabId) && previousTabId > 0 && previousTabId !== numericTabId) {
        try { await chromeApi.sidePanel.close({ tabId: previousTabId }); }
        catch (error) { if (!isExpectedCloseError(error)) reportOnce(error); }
      }
      activeTabs[String(numericWindowId)] = numericTabId;
      await chromeApi.storage.session.set({ [ACTIVE_TABS_KEY]: activeTabs });
      await configureTab(await chromeApi.tabs.get(numericTabId));
    }

    function handleActivated(info) {
      activationQueue = activationQueue.then(() => activate(info), () => activate(info));
      return activationQueue;
    }

    async function initialize() {
      await chromeApi.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
      const tabs = await chromeApi.tabs.query({});
      await Promise.all(tabs.map(configureTab));
      const activeTabs = {};
      for (const tab of tabs) {
        if (tab.active && Number.isInteger(tab.windowId) && Number.isInteger(tab.id)) {
          activeTabs[String(tab.windowId)] = tab.id;
        }
      }
      await chromeApi.storage.session.set({ [ACTIVE_TABS_KEY]: activeTabs });
    }

    return { configureTab, handleActivated, initialize, reportOnce };
  }

  function install(chromeApi, options) {
    const controller = createController(chromeApi, options);
    let lifecycleQueue = Promise.resolve();
    const run = (operation) => {
      lifecycleQueue = lifecycleQueue.then(operation, operation).catch(controller.reportOnce);
      return lifecycleQueue;
    };
    chromeApi.runtime.onInstalled.addListener(() => run(() => controller.initialize()));
    chromeApi.runtime.onStartup.addListener(() => run(() => controller.initialize()));
    chromeApi.tabs.onCreated.addListener((tab) => run(() => controller.configureTab(tab)));
    chromeApi.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
      if (changeInfo.url || changeInfo.status === "loading") run(() => controller.configureTab(tab));
    });
    chromeApi.tabs.onActivated.addListener((info) => run(() => controller.handleActivated(info)));
    run(() => controller.initialize());
    return controller;
  }

  return { ACTIVE_TABS_KEY, PANEL_PATH, createController, install, isTradingViewUrl };
});
