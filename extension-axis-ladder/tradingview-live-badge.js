(function (root) {
  "use strict";

  const OWNED = ["nifty-tv-status-badge", "is-live", "is-offline"];
  let lastOwnedTarget = null;

  function stateFor(text) {
    const value = String(text || "").trim().toUpperCase();
    if (value === "LIVE") return "live";
    if (value === "OFFLINE" || value === "DISCONNECTED") return "offline";
    return null;
  }

  function normalizedIdentity(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toUpperCase();
  }

  function publishIdentity(control, statusLeaf) {
    const ariaLabel = control.getAttribute?.("aria-label");
    if (ariaLabel !== null && ariaLabel !== undefined && String(ariaLabel).trim()) {
      return normalizedIdentity(ariaLabel);
    }
    const statusText = String(statusLeaf?.textContent || "");
    const controlText = String(control?.textContent || "");
    const offset = controlText.toUpperCase().indexOf(statusText.toUpperCase());
    if (offset < 0) return normalizedIdentity(controlText);
    return normalizedIdentity(controlText.slice(0, offset) + controlText.slice(offset + statusText.length));
  }

  function findBadge(documentRef) {
    const matches = [...documentRef.querySelectorAll('button, [role="button"]')].flatMap((control) => {
      const candidates = [...control.querySelectorAll("*")].filter((node) =>
        stateFor(node.textContent)
        && ![...(node.children || [])].some((child) => stateFor(child.textContent))
      );
      if (candidates.length !== 1 || publishIdentity(control, candidates[0]) !== "PUBLISH") return [];
      return [candidates[0]];
    });
    return matches.length === 1 ? matches[0] : null;
  }

  function decorate(documentRef) {
    if (lastOwnedTarget) lastOwnedTarget.classList.remove(...OWNED);
    lastOwnedTarget = null;

    const target = findBadge(documentRef);
    if (!target) return null;
    const state = stateFor(target.textContent);
    if (!state) return null;
    target.classList.remove(...OWNED);
    target.classList.add("nifty-tv-status-badge", `is-${state}`);
    lastOwnedTarget = target;
    return state;
  }

  function install(documentRef, Observer = root.MutationObserver) {
    decorate(documentRef);
    if (typeof Observer !== "function") return () => {};
    let active = true;
    const observer = new Observer(() => {
      if (active) decorate(documentRef);
    });
    observer.observe(documentRef.documentElement || documentRef, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => {
      active = false;
      observer.disconnect();
    };
  }

  const api = { decorate, findBadge, install, stateFor };
  root.NiftyTradingViewLiveBadge = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
