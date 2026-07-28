# NIFTY TradingView Side Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 420×600 NIFTY extension popup with the same UI in a full-height, TradingView-only, tab-specific Chrome side panel that closes on every tab switch.

**Architecture:** Add one isolated `side-panel.js` controller responsible only for URL eligibility, Chrome Side Panel configuration, action availability, and per-window tab-switch closure. Keep `popup.html`, `popup.css`, and `popup.js` as the side-panel document so broker, review, storage, ladder, and risk behavior do not fork. Wire the controller into the existing background service worker without changing axis-capture code.

**Tech Stack:** Chrome Extension Manifest V3, Chrome `sidePanel`, `tabs`, `action`, and `storage.session` APIs, plain JavaScript, HTML/CSS, Node.js `node:test`.

## Global Constraints

- Chrome minimum version is `141` because tab-specific closure requires `chrome.sidePanel.close()`.
- Release version is `0.4.1` in both `extension-axis-ladder/manifest.json` and `data-bridge/package.json`.
- Side panel is enabled only for HTTPS URLs whose hostname is exactly `tradingview.com` or `www.tradingview.com`.
- Switching tabs closes the previous tab's panel. Returning to that tab never reopens it automatically.
- Existing visual tokens, markup order, cards, controls, disclosure sections, and copy stay unchanged.
- **REFRESH ALL** remains manual-only and sticky at the top.
- Panel lifecycle makes no seller-refresh, option-chain, Zerodha-position, or Zerodha-trade request.
- Existing `chrome.storage.local` keys and accepted evidence are not migrated, renamed, or cleared.
- Broker integration remains read-only; no order endpoint is added.
- Work stays on `codex/timeframe-axis-ladder`; branch remains unmerged and unpushed for user testing.

## File Structure

- Create `extension-axis-ladder/side-panel.js`: pure URL policy plus injected Chrome API controller and listener installer.
- Create `extension-axis-ladder/side-panel.test.cjs`: URL, tab configuration, tab-switch closure, session persistence, and listener tests.
- Modify `extension-axis-ladder/background.js`: import and install side-panel controller; leave axis functions untouched.
- Modify `extension-axis-ladder/capture-contract.test.cjs`: provide side-panel Chrome API stubs so background integration remains executable under Node.
- Modify `extension-axis-ladder/manifest.json`: Side Panel permission/path, tab-safe action state, popup removal, version, and Chrome floor.
- Modify `extension-axis-ladder/popup.css`: replace popup viewport limits with side-panel dimensions only.
- Modify `extension-axis-ladder/scaffold.test.cjs`: manifest contract and version assertions.
- Modify `extension-axis-ladder/seller-safety-integration.test.cjs`: release artifact, no-network-on-open, and preserved UI assertions.
- Modify `data-bridge/package.json`: keep bridge release version aligned at `0.4.1`.
- Modify `extension-axis-ladder/README.md` and `README.md`: side-panel workflow and lifecycle wording.

---

### Task 1: Build Isolated Side Panel Policy and Controller

**Files:**
- Create: `extension-axis-ladder/side-panel.js`
- Create: `extension-axis-ladder/side-panel.test.cjs`

**Interfaces:**
- Produces: `NiftySidePanel.isTradingViewUrl(value: unknown): boolean`
- Produces: `NiftySidePanel.createController(chromeApi, options?): SidePanelController`
- Produces: `NiftySidePanel.install(chromeApi, options?): SidePanelController`
- `SidePanelController.configureTab(tab): Promise<void>` sets per-tab panel and action state.
- `SidePanelController.handleActivated({tabId, windowId}): Promise<void>` closes previous tab, persists active tab, configures new tab.
- `SidePanelController.initialize(): Promise<void>` configures action-click behavior and all existing tabs.
- Stores one session object under `niftySidePanelActiveTabs`, keyed by Chrome window ID.

- [ ] **Step 1: Write failing URL-policy and controller tests**

Create `extension-axis-ladder/side-panel.test.cjs` with a deterministic fake Chrome API:

```js
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
```

- [ ] **Step 2: Run tests and verify missing module failure**

Run:

```bash
node --test extension-axis-ladder/side-panel.test.cjs
```

Expected: FAIL with `Cannot find module './side-panel.js'`.

- [ ] **Step 3: Implement minimal side-panel module**

Create `extension-axis-ladder/side-panel.js` with no broker or market-data dependency:

```js
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
        catch (error) { reportOnce(error); }
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
    const run = (operation) => Promise.resolve(operation).catch(controller.reportOnce);
    chromeApi.runtime.onInstalled.addListener(() => run(controller.initialize()));
    chromeApi.runtime.onStartup.addListener(() => run(controller.initialize()));
    chromeApi.tabs.onCreated.addListener((tab) => run(controller.configureTab(tab)));
    chromeApi.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
      if (changeInfo.url || changeInfo.status === "loading") run(controller.configureTab(tab));
    });
    chromeApi.tabs.onActivated.addListener((info) => run(controller.handleActivated(info)));
    run(controller.initialize());
    return controller;
  }

  return { ACTIVE_TABS_KEY, PANEL_PATH, createController, install, isTradingViewUrl };
});
```

- [ ] **Step 4: Add listener-registration and one-time error tests**

Append these exact tests:

```js
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

test("repeated identical close failures are reported once", async () => {
  const chromeApi = fakeChrome([
    { id: 12, windowId: 3, url: "https://www.tradingview.com/chart/two" },
    { id: 13, windowId: 3, url: "https://www.tradingview.com/chart/three" }
  ]);
  chromeApi.session.niftySidePanelActiveTabs = { "3": 11 };
  chromeApi.sidePanel.close = async () => { throw new Error("No active side panel"); };
  const reports = [];
  const controller = sidePanel.createController(chromeApi, { report: (message) => reports.push(message) });
  await controller.handleActivated({ tabId: 12, windowId: 3 });
  await controller.handleActivated({ tabId: 13, windowId: 3 });
  assert.deepEqual(reports, ["NIFTY side panel: No active side panel"]);
});
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
node --test extension-axis-ladder/side-panel.test.cjs
```

Expected: all side-panel tests PASS.

- [ ] **Step 6: Commit policy module**

```bash
git add extension-axis-ladder/side-panel.js extension-axis-ladder/side-panel.test.cjs
git commit -m "feat: add TradingView side panel controller"
```

---

### Task 2: Wire Controller Into Existing Background Service Worker

**Files:**
- Modify: `extension-axis-ladder/background.js:1-5`
- Modify: `extension-axis-ladder/capture-contract.test.cjs:7-27`

**Interfaces:**
- Consumes: `NiftySidePanel.install(chromeApi)` from Task 1.
- Preserves: every current axis-capture export and runtime-message response.
- Produces: service-worker listener wiring for install, startup, tab creation, tab URL update, and tab activation.

- [ ] **Step 1: Make background-loading test expect side-panel integration**

Update `loadBackground()` in `capture-contract.test.cjs` so its fake `chrome` includes `runtime.onInstalled`, `runtime.onStartup`, `tabs`, `sidePanel`, `action`, and `storage.session`. Record listener registration and Side Panel calls. Make `importScripts(...files)` load both dependencies:

```js
global.importScripts = (...files) => {
  for (const file of files) {
    if (file === "overlay-utils.js") global.NiftyOverlay = require("./overlay-utils.js");
    if (file === "side-panel.js") global.NiftySidePanel = require("./side-panel.js");
  }
};
```

Add this test:

```js
test("background installs tab-specific side panel without changing capture API", async () => {
  const { api, listeners, sidePanelCalls } = loadBackground();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(typeof listeners.installed, "function");
  assert.equal(typeof listeners.startup, "function");
  assert.equal(typeof listeners.created, "function");
  assert.equal(typeof listeners.updated, "function");
  assert.equal(typeof listeners.activated, "function");
  assert.deepEqual(sidePanelCalls[0], ["behavior", { openPanelOnActionClick: true }]);
  assert.equal(typeof api.captureAxisScale, "function");
  assert.equal(typeof api.fitAxisScale, "function");
});
```

- [ ] **Step 2: Run integration test and verify failure**

Run:

```bash
node --test extension-axis-ladder/capture-contract.test.cjs
```

Expected: FAIL because `background.js` does not import or install `side-panel.js`.

- [ ] **Step 3: Wire controller at service-worker startup**

Change only background bootstrap lines:

```js
importScripts("overlay-utils.js", "side-panel.js");

NiftySidePanel.install(chrome);
```

Do not move, rename, or rewrite axis-capture functions.

- [ ] **Step 4: Run background and side-panel tests**

Run:

```bash
node --test extension-axis-ladder/side-panel.test.cjs extension-axis-ladder/capture-contract.test.cjs
```

Expected: all tests PASS; existing capture API key list remains unchanged.

- [ ] **Step 5: Run syntax checks**

```bash
node --check extension-axis-ladder/side-panel.js
node --check extension-axis-ladder/background.js
```

Expected: both commands exit `0`.

- [ ] **Step 6: Commit background integration**

```bash
git add extension-axis-ladder/background.js extension-axis-ladder/capture-contract.test.cjs
git commit -m "feat: wire tab-specific side panel lifecycle"
```

---

### Task 3: Convert Release Artifact From Popup to Same-UI Side Panel

**Files:**
- Modify: `extension-axis-ladder/manifest.json:1-38`
- Modify: `extension-axis-ladder/popup.css:20-37`
- Modify: `extension-axis-ladder/scaffold.test.cjs:7-25`
- Modify: `extension-axis-ladder/seller-safety-integration.test.cjs:701-712`
- Modify: `data-bridge/package.json:1-9`

**Interfaces:**
- Consumes: controller path `popup.html` from Task 1.
- Preserves: `popup.html` and `popup.js` unchanged.
- Produces: Manifest V3 side-panel artifact version `0.4.1` with Chrome 141 floor.

- [ ] **Step 1: Write failing manifest and visual-preservation assertions**

Change `scaffold.test.cjs` expectations:

```js
assert.equal(manifest.version, "0.4.1");
assert.equal(manifest.minimum_chrome_version, "141");
assert.equal(manifest.permissions.includes("sidePanel"), true);
assert.deepEqual(manifest.side_panel, { default_path: "popup.html" });
assert.equal(Object.hasOwn(manifest.action, "default_popup"), false);
assert.equal(Object.hasOwn(manifest.action, "default_state"), false);
```

Change the release-artifact test in `seller-safety-integration.test.cjs` to read `popup.css` and assert:

```js
assert.equal(manifest.version, "0.4.1");
assert.equal(bridgePackage.version, "0.4.1");
assert.match(css, /body\s*\{[\s\S]*width:\s*100%/);
assert.match(css, /body\s*\{[\s\S]*min-height:\s*100vh/);
assert.doesNotMatch(css, /max-height:\s*600px|width:\s*420px/);
assert.match(css, /\.topbar\s*\{[\s\S]*position:\s*sticky/);
assert.equal((html.match(/id="refresh-all"/g) || []).length, 1);
assert.doesNotMatch(html, /OPEN FULL CHAIN|id="chain-panel"|id="chain"|<table/i);
```

- [ ] **Step 2: Run artifact tests and verify failure**

Run:

```bash
node --test extension-axis-ladder/scaffold.test.cjs extension-axis-ladder/seller-safety-integration.test.cjs
```

Expected: FAIL on version, missing `sidePanel`, retained `default_popup`, and 420×600 CSS.

- [ ] **Step 3: Update manifest exactly**

Apply these manifest changes:

```json
{
  "manifest_version": 3,
  "minimum_chrome_version": "141",
  "name": "NIFTY Axis LTP Ladder",
  "version": "0.4.1",
  "permissions": ["storage", "activeTab", "debugger", "sidePanel"],
  "side_panel": { "default_path": "popup.html" },
  "action": {
    "default_title": "NIFTY Options",
    "default_icon": {
      "16": "icons/nifty-mark-16.png",
      "32": "icons/nifty-mark-32.png",
      "48": "icons/nifty-mark-48.png",
      "128": "icons/nifty-mark-128.png"
    }
  }
}
```

Keep existing description, host permissions, background, commands, icons, and content scripts unchanged. Remove only `action.default_popup`.

- [ ] **Step 4: Change only popup viewport CSS**

Replace current body sizing with:

```css
html, body { min-height: 100%; }
body {
  width: 100%;
  min-height: 100vh;
  margin: 0;
  overflow: auto;
  background: var(--bg);
  color: var(--ink);
  font: 14px/1.45 Geist, system-ui, -apple-system, sans-serif;
  letter-spacing: -0.005em;
  -webkit-font-smoothing: antialiased;
}
```

Do not change any rule after `.shell`; this prevents visual redesign.

- [ ] **Step 5: Align release versions**

Set `data-bridge/package.json` version to `0.4.1`. Do not change scripts or dependencies.

- [ ] **Step 6: Run artifact and popup-no-network tests**

Run:

```bash
node --test extension-axis-ladder/scaffold.test.cjs extension-axis-ladder/seller-safety-integration.test.cjs
```

Expected: PASS, including `popup-open and negative UI actions make no seller refresh, chain, position, or trade request`.

- [ ] **Step 7: Commit release artifact migration**

```bash
git add extension-axis-ladder/manifest.json extension-axis-ladder/popup.css extension-axis-ladder/scaffold.test.cjs extension-axis-ladder/seller-safety-integration.test.cjs data-bridge/package.json
git commit -m "feat: move NIFTY workflow into Chrome side panel"
```

---

### Task 4: Update Operator Documentation and Verify Full Release

**Files:**
- Modify: `extension-axis-ladder/README.md:1-69`
- Modify: `README.md:1-41`
- Modify: `extension-axis-ladder/seller-safety-integration.test.cjs:714-735`

**Interfaces:**
- Documents: icon opens TradingView-only panel, panel closes on every tab switch, same UI, manual refresh, daily Zerodha connect.
- Preserves: existing setup, review, risk-map, stale, and read-only guarantees.

- [ ] **Step 1: Add failing documentation assertions**

Extend the operator-doc test with:

```js
assert.match(extensionReadme, /side panel[\s\S]*TradingView-only/i);
assert.match(extensionReadme, /switching tabs[\s\S]*closes/i);
assert.match(extensionReadme, /click[\s\S]*NIFTY[\s\S]*extension icon/i);
assert.match(extensionReadme, /full[- ]height[\s\S]*same (UI|design)/i);
assert.doesNotMatch(`${rootReadme}\n${extensionReadme}`, /popup opens|popup open/i);
```

- [ ] **Step 2: Run documentation test and verify failure**

Run:

```bash
node --test extension-axis-ladder/seller-safety-integration.test.cjs
```

Expected: FAIL because documentation still describes a popup.

- [ ] **Step 3: Update README workflow language**

Use these exact operator facts in both READMEs:

```markdown
- Click the pinned NIFTY extension icon on a TradingView tab to open the full-height side panel.
- The side panel is TradingView-only and uses the same seller-safety UI as version 0.4.0.
- Switching tabs closes the panel. Click the NIFTY icon again when returning to a chart.
- Opening, closing, or resizing the panel makes no broker or option-chain request.
- Daily, use CONNECT ZERODHA, then press REFRESH ALL manually.
```

Replace every user-facing `popup` reference with `side panel` where it names the visible UI. Do not rename internal storage or test fixture identifiers.

- [ ] **Step 4: Run complete automated release suite**

Run outside restricted sandbox because bridge tests bind temporary localhost ports:

```bash
cd data-bridge
npm test
```

Expected: all tests PASS; count is previous `279` plus new side-panel tests.

- [ ] **Step 5: Run static release checks**

```bash
node --check extension-axis-ladder/side-panel.js
node --check extension-axis-ladder/background.js
git diff --check
git status --short
```

Expected: syntax checks and diff check exit `0`; status lists only planned documentation/test changes before commit. `.superpowers/brainstorm/` remains untracked and must not be staged.

- [ ] **Step 6: Commit documentation**

```bash
git add README.md extension-axis-ladder/README.md extension-axis-ladder/seller-safety-integration.test.cjs
git commit -m "docs: explain TradingView side panel workflow"
```

- [ ] **Step 7: Reload and verify live Chrome behavior**

Use current unpacked directory:

```text
/Users/reddyshyamshankar/Documents/Code/Options Indicator/.worktrees/timeframe-axis-ladder/extension-axis-ladder
```

Verify in order:

1. Chrome Extensions card shows version `0.4.1`.
2. NIFTY icon is disabled on a non-TradingView tab.
3. NIFTY icon is enabled on `https://www.tradingview.com/chart/...`.
4. One icon click opens full-height panel with unchanged current UI.
5. Header and **REFRESH ALL** stay visible while scrolling.
6. Switching to another TradingView tab closes panel.
7. Returning to prior chart does not reopen panel.
8. Clicking icon reopens panel with saved strategy, expiry, review state, and accepted evidence.
9. Opening and switching panels produce no seller-refresh request.
10. One explicit **REFRESH ALL** produces one coordinated snapshot and updates thirteen chart rows.
11. Non-TradingView tabs remain inert.

- [ ] **Step 8: Record final branch state without merging or pushing**

```bash
git status --short
git log --oneline -6
```

Expected: clean tracked worktree; side-panel commits remain only on `codex/timeframe-axis-ladder`; original v0.14.0 backup remains untouched.
