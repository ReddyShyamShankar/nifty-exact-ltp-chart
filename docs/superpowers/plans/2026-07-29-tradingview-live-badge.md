# TradingView LIVE Badge Styling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safely restyle TradingView's native compact status badge as full green `LIVE` or full red `OFFLINE`, both with white text.

**Architecture:** New isolated UMD decorator locates one exact status badge only inside semantically identified TradingView Publish control. It adds extension-owned classes without changing text or click behavior, observes TradingView rerenders, and fails silently when target is absent or ambiguous. Core ladder never depends on decorator.

**Tech Stack:** Chrome Extension Manifest V3, plain JavaScript/CSS, DOM `MutationObserver`, Node.js `node:test`.

## Global Constraints

- Work stays on `codex/timeframe-axis-ladder`; branch remains unmerged and unpushed for user testing.
- Restyle compact status badge only, not entire Publish control.
- `LIVE`: full green background, white text.
- `OFFLINE` or disconnected: full red background, white text.
- Preserve native text, dimensions, click behavior, and ownership.
- Never choose target by screen position.
- Missing or ambiguous badge leaves TradingView unchanged.
- Badge failure cannot affect ladder, manual refresh, broker data, or break-even rails.
- Existing original v0.14.0 extension remains untouched.

---

## File map

- Create `extension-axis-ladder/tradingview-live-badge.js`: target discovery, state mapping, class decoration, observer lifecycle.
- Create `extension-axis-ladder/tradingview-live-badge.test.cjs`: exact target, ambiguity, state change, and teardown tests.
- Modify `extension-axis-ladder/manifest.json`: load decorator before `content.js`; bump candidate version to `0.4.3` after both P0 features.
- Modify `extension-axis-ladder/content.js`: install and stop decorator independently from ladder controller.
- Modify `extension-axis-ladder/content-contract.test.cjs`: integration isolation and CSS contracts.
- Modify `extension-axis-ladder/overlay.css`: full green/red badge classes with white text.
- Modify `extension-axis-ladder/README.md`: note cosmetic TradingView-owned enhancement and fail-safe behavior.
- Modify `extension-axis-ladder/scaffold.test.cjs`: expected version and script order.

---

### Task 1: Safe badge decorator

**Files:**
- Create: `extension-axis-ladder/tradingview-live-badge.js`
- Create: `extension-axis-ladder/tradingview-live-badge.test.cjs`

**Interfaces:**
- Consumes: DOM root with `querySelectorAll`, `MutationObserver` constructor.
- Produces: `stateFor(text)`, `findBadge(document)`, `decorate(document)`, `install(document, MutationObserver)`.

- [ ] **Step 1: Write failing state and discovery tests**

Create `tradingview-live-badge.test.cjs` with minimal deterministic fixtures:

```js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const api = require("./tradingview-live-badge.js");

function badge(text) {
  return { textContent: text, classList: { values: new Set(), add(...v) { v.forEach((x) => this.values.add(x)); }, remove(...v) { v.forEach((x) => this.values.delete(x)); } } };
}

function control(text, badges) {
  return { textContent: text, querySelectorAll() { return badges; } };
}

function documentWith(controls) {
  return { querySelectorAll(selector) { return selector === 'button, [role="button"]' ? controls : []; } };
}

test("maps only exact supported status text", () => {
  assert.equal(api.stateFor(" LIVE "), "live");
  assert.equal(api.stateFor("OFFLINE"), "offline");
  assert.equal(api.stateFor("Disconnected"), "offline");
  assert.equal(api.stateFor("Publish"), null);
});

test("finds one exact badge only inside one Publish control", () => {
  const target = badge("LIVE");
  assert.equal(api.findBadge(documentWith([control("Publish LIVE", [target])])), target);
  assert.equal(api.findBadge(documentWith([control("Other LIVE", [target])])), null);
});

test("ambiguous Publish controls or status descendants fail closed", () => {
  const first = badge("LIVE");
  const second = badge("LIVE");
  assert.equal(api.findBadge(documentWith([
    control("Publish LIVE", [first]),
    control("Publish LIVE", [second])
  ])), null);
  assert.equal(api.findBadge(documentWith([control("Publish LIVE OFFLINE", [first, badge("OFFLINE")])])), null);
});
```

- [ ] **Step 2: Write failing decoration and observer tests**

Append:

```js
test("decoration replaces only owned state classes and preserves text", () => {
  const target = badge("LIVE");
  const doc = documentWith([control("Publish LIVE", [target])]);
  assert.equal(api.decorate(doc), "live");
  assert.equal(target.textContent, "LIVE");
  assert.deepEqual([...target.classList.values].sort(), ["nifty-tv-status-badge", "is-live"]);
  target.textContent = "OFFLINE";
  assert.equal(api.decorate(doc), "offline");
  assert.deepEqual([...target.classList.values].sort(), ["is-offline", "nifty-tv-status-badge"]);
});

test("install decorates immediately, responds to rerender, and disconnects", () => {
  const target = badge("LIVE");
  const doc = documentWith([control("Publish LIVE", [target])]);
  let callback;
  let disconnected = false;
  class Observer {
    constructor(fn) { callback = fn; }
    observe() {}
    disconnect() { disconnected = true; }
  }
  const stop = api.install(doc, Observer);
  assert.equal(target.classList.values.has("is-live"), true);
  callback([]);
  stop();
  assert.equal(disconnected, true);
});
```

- [ ] **Step 3: Run focused tests and verify missing module failure**

```bash
node --test extension-axis-ladder/tradingview-live-badge.test.cjs
```

Expected: FAIL with `Cannot find module './tradingview-live-badge.js'`.

- [ ] **Step 4: Implement minimal fail-closed decorator**

Create UMD module:

```js
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
    observer.observe(documentRef.documentElement || documentRef, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }

  const api = { decorate, findBadge, install, stateFor };
  root.NiftyTradingViewLiveBadge = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
```

- [ ] **Step 5: Run focused tests**

```bash
node --test extension-axis-ladder/tradingview-live-badge.test.cjs
```

Expected: all tests PASS.

- [ ] **Step 6: Commit decorator**

```bash
git add extension-axis-ladder/tradingview-live-badge.js extension-axis-ladder/tradingview-live-badge.test.cjs
git commit -m "feat: add safe TradingView status decorator"
```

---

### Task 2: Integrate independent lifecycle and styles

**Files:**
- Modify: `extension-axis-ladder/manifest.json`
- Modify: `extension-axis-ladder/content.js`
- Modify: `extension-axis-ladder/content-contract.test.cjs`
- Modify: `extension-axis-ladder/overlay.css`

**Interfaces:**
- Consumes: `NiftyTradingViewLiveBadge.install(document, MutationObserver)`.
- Produces: one independent decorator lifecycle and full-color classes.

- [ ] **Step 1: Add failing integration and CSS contracts**

Append:

```js
test("TradingView status decorator loads before content and stays independent from ladder", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "manifest.json"), "utf8"));
  const scripts = manifest.content_scripts.find((entry) => entry.js.includes("content.js")).js;
  assert.ok(scripts.indexOf("tradingview-live-badge.js") < scripts.indexOf("content.js"));
  const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  assert.match(source, /NiftyTradingViewLiveBadge/);
  assert.match(source, /stopLiveBadgeDecorator/);
  assert.doesNotMatch(source, /if \(!.*LiveBadge.*\).*start\(/);
});

test("native status badge uses full green or red fill with white text", () => {
  const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");
  assert.match(css, /\.nifty-tv-status-badge\.is-live\s*\{[\s\S]*?background(?:-color)?:\s*#(?:16a34a|15803d)/i);
  assert.match(css, /\.nifty-tv-status-badge\.is-offline\s*\{[\s\S]*?background(?:-color)?:\s*#(?:dc2626|b91c1c)/i);
  assert.match(css, /\.nifty-tv-status-badge\s*\{[\s\S]*?color:\s*#fff/i);
});
```

- [ ] **Step 2: Run contract test and verify failure**

```bash
node --test extension-axis-ladder/content-contract.test.cjs
```

Expected: FAIL because manifest, lifecycle, and CSS are not integrated.

- [ ] **Step 3: Load and install decorator independently**

Add `tradingview-live-badge.js` before `content.js` in manifest. Resolve API in `content.js`:

```js
const liveBadgeApi = root.NiftyTradingViewLiveBadge
  || (typeof module !== "undefined" && module.exports ? require("./tradingview-live-badge.js") : null);
```

Install once at browser-content startup, outside `settings.enabled` gate:

```js
let stopLiveBadgeDecorator = liveBadgeApi?.install?.(document, MutationObserver) || (() => {});
```

Do not tie decorator to ladder `start()` or `stop()`; extension content-script lifetime owns it. If existing lifecycle harness requires explicit teardown, expose one unload handler that calls `stopLiveBadgeDecorator()` without changing ladder state.

- [ ] **Step 4: Add full-color badge CSS**

```css
.nifty-tv-status-badge {
  color: #fff !important;
  border: 0 !important;
  border-radius: 3px !important;
  padding: 2px 5px !important;
  font-weight: 800 !important;
}

.nifty-tv-status-badge.is-live { background: #16a34a !important; }
.nifty-tv-status-badge.is-offline { background: #dc2626 !important; }
```

Do not assign width, height, position, pointer events, or click handler.

- [ ] **Step 5: Run focused integration tests**

```bash
node --test extension-axis-ladder/tradingview-live-badge.test.cjs extension-axis-ladder/content-contract.test.cjs
```

Expected: all tests PASS; badge fixtures preserve text and unrelated controls.

- [ ] **Step 6: Commit integration**

```bash
git add extension-axis-ladder/manifest.json extension-axis-ladder/content.js extension-axis-ladder/content-contract.test.cjs extension-axis-ladder/overlay.css
git commit -m "feat: color TradingView live status badge"
```

---

### Task 3: Version, docs, and complete verification

**Files:**
- Modify: `extension-axis-ladder/manifest.json`
- Modify: `extension-axis-ladder/scaffold.test.cjs`
- Modify: `extension-axis-ladder/README.md`
- Modify: `extension-axis-ladder/content-contract.test.cjs`

**Interfaces:**
- Consumes: completed break-even rails and LIVE badge decorator.
- Produces: candidate extension v0.4.3 with documented cosmetic risk and full regression proof.

- [ ] **Step 1: Add failing release and documentation assertions**

Update scaffold version expectation to `0.4.3`. Append documentation contract:

```js
test("operator guide treats TradingView badge styling as cosmetic and fail-safe", () => {
  const readme = fs.readFileSync(path.join(__dirname, "README.md"), "utf8");
  assert.match(readme, /LIVE[^\n]*green[^\n]*OFFLINE[^\n]*red/i);
  assert.match(readme, /TradingView-owned[^\n]*cosmetic/i);
  assert.match(readme, /badge[^\n]*cannot[^\n]*ladder/i);
});
```

- [ ] **Step 2: Run release contracts and verify failure**

```bash
node --test extension-axis-ladder/scaffold.test.cjs extension-axis-ladder/content-contract.test.cjs
```

Expected: FAIL on old version and missing operator text.

- [ ] **Step 3: Bump candidate version and document behavior**

Set manifest version to `0.4.3`. Add README section:

```markdown
## TradingView status badge

TradingView-owned compact status badge is cosmetic: LIVE receives full green fill; OFFLINE or disconnected receives full red fill; both use white text. If TradingView changes or removes exact badge DOM, decorator leaves page unchanged. Badge styling cannot block ladder, refresh, or break-even rails.
```

- [ ] **Step 4: Run complete verification**

```bash
node --check extension-axis-ladder/tradingview-live-badge.js
node --check extension-axis-ladder/breakeven-rails.js
node --check extension-axis-ladder/content.js
cd data-bridge && npm test
git diff --check
git status --short
```

Expected: syntax checks and full suite PASS; version contract is `0.4.3`; `.superpowers/brainstorm/` remains untracked and unstaged.

- [ ] **Step 5: Commit release candidate**

```bash
git add extension-axis-ladder/manifest.json extension-axis-ladder/scaffold.test.cjs extension-axis-ladder/README.md extension-axis-ladder/content-contract.test.cjs
git commit -m "chore: prepare Options Ladder 0.4.3"
```
