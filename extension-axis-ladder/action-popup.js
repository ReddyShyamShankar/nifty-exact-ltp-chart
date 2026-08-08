"use strict";

(function expose(root, factory) {
  const api = factory();
  root.NiftyActionPopup = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis, () => {
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

  function createController(chromeApi, documentApi, closePopup = () => globalThis.close?.()) {
    const refreshButton = documentApi.getElementById("refresh-ladder");
    const openButton = documentApi.getElementById("open-side-panel");
    const refreshLabel = documentApi.getElementById("refresh-label");
    const status = documentApi.getElementById("popup-status");

    function setStatus(text, tone = "") {
      status.textContent = text;
      status.dataset.tone = tone;
    }

    async function activeTradingViewTab() {
      const [tab] = await chromeApi.tabs.query({ active: true, currentWindow: true });
      const tabId = Number(tab?.id);
      return Number.isInteger(tabId) && tabId > 0 && isTradingViewUrl(tab?.url) ? tab : null;
    }

    async function initialize() {
      const tab = await activeTradingViewTab();
      const supported = Boolean(tab);
      refreshButton.disabled = !supported;
      openButton.disabled = !supported;
      if (!supported) setStatus("OPEN A TRADINGVIEW CHART", "error");
      return supported;
    }

    async function refreshLadder() {
      const tab = await activeTradingViewTab();
      if (!tab) {
        refreshButton.disabled = true;
        openButton.disabled = true;
        setStatus("OPEN A TRADINGVIEW CHART", "error");
        return false;
      }
      refreshButton.disabled = true;
      refreshLabel.textContent = "REFRESHING…";
      setStatus("READING BROKER + MARKET SNAPSHOT", "working");
      try {
        const preview = await chromeApi.tabs.sendMessage(tab.id, { type: "GET_STRATEGY_PREVIEW_STATE" });
        const selectedIds = Array.isArray(preview?.selectedIds)
          ? preview.selectedIds.filter((id) => typeof id === "string" && id)
          : [];
        const brokerResult = await chromeApi.runtime.sendMessage({
          type: "REFRESH_BROKER_SNAPSHOT",
          selectedIds
        });
        if (!brokerResult?.ok) throw new Error(brokerResult?.error || "Broker refresh failed");
        const result = await chromeApi.tabs.sendMessage(tab.id, {
          type: "REFRESH_OPTION_NUMBERS",
          expectedUpdatedAt: brokerResult.updatedAt || null
        });
        if (!result?.ok) throw new Error(result?.error || "Ladder refresh failed");
        setStatus("REFRESHED JUST NOW", "success");
        return true;
      } catch (error) {
        setStatus(error?.message || "Ladder refresh failed", "error");
        return false;
      } finally {
        refreshLabel.textContent = "REFRESH ALL";
        refreshButton.disabled = false;
      }
    }

    async function openSidePanel() {
      const tab = await activeTradingViewTab();
      if (!tab) {
        refreshButton.disabled = true;
        openButton.disabled = true;
        setStatus("OPEN A TRADINGVIEW CHART", "error");
        return false;
      }
      openButton.disabled = true;
      setStatus("OPENING CONTROLS…", "working");
      try {
        await chromeApi.sidePanel.open({ tabId: tab.id });
        closePopup();
        return true;
      } catch (error) {
        openButton.disabled = false;
        setStatus(error?.message || "Side panel could not open", "error");
        return false;
      }
    }

    function install() {
      refreshButton.addEventListener("click", () => refreshLadder());
      openButton.addEventListener("click", () => openSidePanel());
      initialize().catch((error) => setStatus(error?.message || "Popup unavailable", "error"));
    }

    return { activeTradingViewTab, initialize, install, openSidePanel, refreshLadder };
  }

  function install(chromeApi, documentApi, closePopup) {
    const controller = createController(chromeApi, documentApi, closePopup);
    controller.install();
    return controller;
  }

  return { createController, install, isTradingViewUrl };
});

if (typeof chrome !== "undefined" && typeof document !== "undefined") {
  globalThis.NiftyActionPopup.install(chrome, document, () => globalThis.close());
}
