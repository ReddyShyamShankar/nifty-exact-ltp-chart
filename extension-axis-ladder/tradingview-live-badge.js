(function (root) {
  "use strict";

  const OWNED = ["nifty-tv-status-badge", "is-live", "is-offline"];

  function stateFor(text) {
    const value = String(text || "").trim().toUpperCase();
    if (value === "LIVE") return "live";
    if (value === "OFFLINE" || value === "DISCONNECTED") return "offline";
    return null;
  }

  function findBadge(documentRef) {
    const controls = [...documentRef.querySelectorAll('button, [role="button"]')]
      .filter((node) => /\bpublish\b/i.test(String(node.textContent || "")));
    if (controls.length !== 1) return null;

    const candidates = [...controls[0].querySelectorAll("*")].filter((node) =>
      stateFor(node.textContent)
      && ![...(node.children || [])].some((child) => stateFor(child.textContent))
    );
    return candidates.length === 1 ? candidates[0] : null;
  }

  function decorate(documentRef) {
    const target = findBadge(documentRef);
    if (!target) return null;
    const state = stateFor(target.textContent);
    if (!state) return null;
    target.classList.remove(...OWNED);
    target.classList.add("nifty-tv-status-badge", `is-${state}`);
    return state;
  }

  function install(documentRef, Observer = root.MutationObserver) {
    decorate(documentRef);
    if (typeof Observer !== "function") return () => {};
    const observer = new Observer(() => decorate(documentRef));
    observer.observe(documentRef.documentElement || documentRef, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => observer.disconnect();
  }

  const api = { decorate, findBadge, install, stateFor };
  root.NiftyTradingViewLiveBadge = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
