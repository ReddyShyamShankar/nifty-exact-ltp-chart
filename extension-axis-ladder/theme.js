(function expose(root, factory) {
  "use strict";
  const api = factory();
  root.OptionsLadderTheme = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis, () => {
  "use strict";

  const STORAGE_KEY = "uiTheme";
  const DEFAULT_THEME = "dark";
  const THEMES = new Set(["dark", "light"]);

  function normalizeTheme(value) {
    return THEMES.has(value) ? value : DEFAULT_THEME;
  }

  function oppositeTheme(value) {
    return normalizeTheme(value) === "light" ? "dark" : "light";
  }

  function markPath() {
    return "icons/nifty-mark.svg";
  }

  function createController(chromeApi, documentApi) {
    const rootNode = documentApi.documentElement;
    const toggle = documentApi.getElementById("theme-toggle");
    const mark = documentApi.getElementById("popup-mark");
    let current = DEFAULT_THEME;

    function apply(value) {
      current = normalizeTheme(value);
      rootNode.dataset.theme = current;
      rootNode.style.colorScheme = current;
      if (toggle) {
        toggle.setAttribute("aria-pressed", String(current === "light"));
        toggle.setAttribute("aria-label", `Switch to ${oppositeTheme(current)} theme`);
        toggle.title = `Switch to ${oppositeTheme(current)} theme`;
      }
      if (mark) mark.src = markPath(current);
      return current;
    }

    async function initialize() {
      const stored = await chromeApi.storage.local.get({ [STORAGE_KEY]: DEFAULT_THEME });
      apply(stored[STORAGE_KEY]);
      return current;
    }

    async function toggleTheme() {
      const next = oppositeTheme(current);
      apply(next);
      await chromeApi.storage.local.set({ [STORAGE_KEY]: next });
      return next;
    }

    function handleStorageChange(changes, area) {
      if (area === "local" && changes[STORAGE_KEY]) apply(changes[STORAGE_KEY].newValue);
    }

    function install() {
      toggle?.addEventListener("click", () => { void toggleTheme(); });
      chromeApi.storage.onChanged.addListener(handleStorageChange);
      return initialize();
    }

    return { apply, initialize, install, toggleTheme, theme: () => current };
  }

  function install(chromeApi, documentApi) {
    const controller = createController(chromeApi, documentApi);
    void controller.install();
    return controller;
  }

  return { DEFAULT_THEME, STORAGE_KEY, createController, install, markPath, normalizeTheme, oppositeTheme };
});

if (typeof chrome !== "undefined" && typeof document !== "undefined") {
  globalThis.OptionsLadderTheme.install(chrome, document);
}
