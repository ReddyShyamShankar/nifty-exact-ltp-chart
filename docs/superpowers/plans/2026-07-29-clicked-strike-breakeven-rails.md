# Clicked-Strike Break-Even Rails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add click-only, exact-axis Call and Put single-leg expiry break-even rails to existing thirteen-row NIFTY ladder.

**Architecture:** New UMD module owns pure break-even calculations, off-screen projection, and ephemeral selection state. Existing content script adds row interaction and DOM rendering, reusing validated TradingView price-to-y map already used by ladder. Manual refresh and outside interaction clear selection before any new prices can appear.

**Tech Stack:** Chrome Extension Manifest V3, plain JavaScript, HTML/CSS, Node.js `node:test`.

## Global Constraints

- Work stays on `codex/timeframe-axis-ladder`; branch remains unmerged and unpushed for user testing.
- Nothing appears until explicit ladder-row click.
- Call break-even is `strike + Call premium`; Put break-even is `strike - Put premium`.
- Display nearest whole NIFTY point.
- Labels are `CALL BE <value> · SELL BELOW ↓` and `PUT BE <value> · SELL ABOVE ↑`.
- No row expansion, safe-zone shading, automatic selection, combined-strategy calculation, or persisted selection.
- Any outside click, `Escape`, manual refresh, expiry invalidation, or extension stop clears selection.
- Missing, non-numeric, or negative premium fails closed with `OPTION PRICE UNAVAILABLE`.
- Invalid native-axis map conceals rails; never guess coordinates.
- Existing original v0.14.0 extension remains untouched.

---

## File map

- Create `extension-axis-ladder/breakeven-rails.js`: pure calculation, projection, labels, selection controller.
- Create `extension-axis-ladder/breakeven-rails.test.cjs`: calculation, rounding, invalid input, projection, and selection tests.
- Modify `extension-axis-ladder/manifest.json`: load module before `content.js`.
- Modify `extension-axis-ladder/content.js`: row semantics, event lifecycle, selection snapshot, rail DOM, placement, clearing.
- Modify `extension-axis-ladder/content-contract.test.cjs`: browser integration and CSS/source contracts.
- Modify `extension-axis-ladder/overlay.css`: selected states, clickable rows, rails, labels, edge markers.
- Modify `extension-axis-ladder/README.md`: click and dismissal workflow.

---

### Task 1: Pure break-even and selection model

**Files:**
- Create: `extension-axis-ladder/breakeven-rails.js`
- Create: `extension-axis-ladder/breakeven-rails.test.cjs`

**Interfaces:**
- Consumes: `{ strike, call, put }` row snapshot; validated `toY(price)`; `{ top, bottom }` plot bounds.
- Produces: `calculate(row)`, `project(level, toY, plotRect)`, `createSelectionController(onChange)`.

- [ ] **Step 1: Write failing calculation and projection tests**

Create `breakeven-rails.test.cjs`:

```js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const api = require("./breakeven-rails.js");

test("calculates rounded independent single-leg expiry break-evens", () => {
  assert.deepEqual(api.calculate({ strike: 24300, call: 219.20, put: 402 }), {
    strike: 24300,
    call: { kind: "call", exact: 24519.2, rounded: 24519, label: "CALL BE 24,519 · SELL BELOW ↓" },
    put: { kind: "put", exact: 23898, rounded: 23898, label: "PUT BE 23,898 · SELL ABOVE ↑" }
  });
});

test("rejects missing non-numeric and negative premiums without zero substitution", () => {
  for (const invalid of [null, undefined, "", "x", NaN, Infinity, -0.05]) {
    assert.equal(api.calculate({ strike: 24300, call: invalid, put: 402 }), null);
    assert.equal(api.calculate({ strike: 24300, call: 219.2, put: invalid }), null);
  }
  assert.equal(api.calculate({ strike: 24300, call: 0, put: 0 }).call.rounded, 24300);
});

test("projects exact rails and truthful top or bottom markers", () => {
  const toY = (price) => 500 - (price - 24000) / 2;
  const bounds = { top: 100, bottom: 700 };
  assert.deepEqual(api.project({ exact: 24519.2 }, toY, bounds), { mode: "line", y: 240.4 });
  assert.deepEqual(api.project({ exact: 25000 }, toY, bounds), { mode: "edge", edge: "top", y: 100 });
  assert.deepEqual(api.project({ exact: 23000 }, toY, bounds), { mode: "edge", edge: "bottom", y: 700 });
});
```

- [ ] **Step 2: Write failing ephemeral-selection tests**

Append:

```js
test("selection replaces exact snapshot and clear removes it", () => {
  const changes = [];
  const controller = api.createSelectionController((value) => changes.push(value));
  const first = { strike: 24300, call: 219.2, put: 402 };
  const second = { strike: 24250, call: 245.5, put: 375 };
  assert.equal(controller.select(first), true);
  assert.deepEqual(controller.current(), first);
  assert.equal(controller.select(second), true);
  assert.deepEqual(controller.current(), second);
  controller.clear();
  assert.equal(controller.current(), null);
  assert.deepEqual(changes, [first, second, null]);
});

test("invalid selection reports failure and keeps no snapshot", () => {
  const controller = api.createSelectionController(() => {});
  assert.equal(controller.select({ strike: 24300, call: null, put: 402 }), false);
  assert.equal(controller.current(), null);
});
```

- [ ] **Step 3: Run focused tests and verify missing module failure**

Run:

```bash
node --test extension-axis-ladder/breakeven-rails.test.cjs
```

Expected: FAIL with `Cannot find module './breakeven-rails.js'`.

- [ ] **Step 4: Implement minimal pure module**

Create UMD module exporting exact interfaces:

```js
(function (root) {
  "use strict";

  function finiteNonNegative(value) {
    if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
  }

  function formatPoint(value) {
    return Math.round(value).toLocaleString("en-IN");
  }

  function calculate(row) {
    const strike = finiteNonNegative(row?.strike);
    const callPremium = finiteNonNegative(row?.call);
    const putPremium = finiteNonNegative(row?.put);
    if (strike === null || callPremium === null || putPremium === null) return null;
    const callExact = strike + callPremium;
    const putExact = strike - putPremium;
    if (putExact < 0) return null;
    return {
      strike,
      call: { kind: "call", exact: callExact, rounded: Math.round(callExact), label: `CALL BE ${formatPoint(callExact)} · SELL BELOW ↓` },
      put: { kind: "put", exact: putExact, rounded: Math.round(putExact), label: `PUT BE ${formatPoint(putExact)} · SELL ABOVE ↑` }
    };
  }

  function project(level, toY, plotRect) {
    const y = Number(typeof toY === "function" ? toY(level?.exact) : NaN);
    const top = Number(plotRect?.top);
    const bottom = Number(plotRect?.bottom);
    if (![y, top, bottom].every(Number.isFinite) || bottom <= top) return null;
    if (y < top) return { mode: "edge", edge: "top", y: top };
    if (y > bottom) return { mode: "edge", edge: "bottom", y: bottom };
    return { mode: "line", y };
  }

  function createSelectionController(onChange = () => {}) {
    let selected = null;
    return {
      clear() { if (selected !== null) { selected = null; onChange(null); } },
      current() { return selected; },
      select(row) {
        if (!calculate(row)) { selected = null; onChange(null); return false; }
        selected = { strike: Number(row.strike), call: Number(row.call), put: Number(row.put) };
        onChange(selected);
        return true;
      }
    };
  }

  const api = { calculate, createSelectionController, project };
  root.NiftyBreakEvenRails = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
node --test extension-axis-ladder/breakeven-rails.test.cjs
```

Expected: all tests PASS.

- [ ] **Step 6: Commit pure model**

```bash
git add extension-axis-ladder/breakeven-rails.js extension-axis-ladder/breakeven-rails.test.cjs
git commit -m "feat: add clicked-strike break-even model"
```

---

### Task 2: Click-only selection lifecycle

**Files:**
- Modify: `extension-axis-ladder/manifest.json`
- Modify: `extension-axis-ladder/content.js`
- Modify: `extension-axis-ladder/content-contract.test.cjs`
- Modify: `extension-axis-ladder/overlay.css`

**Interfaces:**
- Consumes: `NiftyBreakEvenRails.createSelectionController(onChange)` and current exact membership rows.
- Produces: clickable row semantics, one selected snapshot, `clearBreakEvenSelection()`, and event teardown in `stop()`.

- [ ] **Step 1: Add failing manifest and source-contract tests**

Append to `content-contract.test.cjs`:

```js
test("breakeven module loads before content and selection remains explicit", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "manifest.json"), "utf8"));
  const scripts = manifest.content_scripts.find((entry) => entry.js.includes("content.js")).js;
  assert.ok(scripts.indexOf("breakeven-rails.js") < scripts.indexOf("content.js"));

  const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  assert.match(source, /NiftyBreakEvenRails/);
  assert.match(source, /role", "button"/);
  assert.match(source, /aria-selected/);
  assert.match(source, /clearBreakEvenSelection/);
  assert.doesNotMatch(source, /autoSelectBreakEven|persistedBreakEven/);
});

test("rows alone accept input while fullscreen overlay remains pointer-transparent", () => {
  const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");
  assert.match(css, /#nifty-axis-ladder\s*\{[\s\S]*?pointer-events:\s*none/);
  assert.match(css, /\.nifty-axis-ladder__row\s*\{[\s\S]*?pointer-events:\s*auto/);
});
```

- [ ] **Step 2: Run tests and verify failure**

```bash
node --test extension-axis-ladder/content-contract.test.cjs
```

Expected: FAIL because module is absent from manifest and rows are pointer-transparent.

- [ ] **Step 3: Wire module and exact row semantics**

Update manifest content-script order:

```json
"js": ["expiry-utils.js", "ladder-utils.js", "overlay-utils.js", "timeframe-ladder.js", "risk-overlay.js", "seller-view-identity.js", "breakeven-rails.js", "content.js"]
```

In `content.js`, resolve module beside existing APIs:

```js
const breakEvenApi = root.NiftyBreakEvenRails
  || (typeof module !== "undefined" && module.exports ? require("./breakeven-rails.js") : null);
```

When creating each row:

```js
element.setAttribute("role", "button");
element.setAttribute("tabindex", "0");
element.setAttribute("aria-selected", "false");
```

After every render, toggle `is-selected` and `aria-selected` from current selection strike. Selected ATM keeps `is-atm` and receives `is-selected` simultaneously.

- [ ] **Step 4: Add event lifecycle with outside dismissal**

Create one controller after browser-only return boundary:

```js
let breakEvenSelection = breakEvenApi.createSelectionController(() => renderBreakEvenSelection());

function clearBreakEvenSelection() {
  breakEvenSelection.clear();
  clearBreakEvenRails();
  rootNode().querySelectorAll(".nifty-axis-ladder__row").forEach((row) => {
    row.classList.remove("is-selected");
    row.setAttribute("aria-selected", "false");
  });
}
```

Install named listeners in `start()` and remove them in `stop()`:

```js
function handleDocumentPointerDown(event) {
  const row = event.target?.closest?.(".nifty-axis-ladder__row");
  if (!row) clearBreakEvenSelection();
}

function handleLadderClick(event) {
  const rowElement = event.target?.closest?.(".nifty-axis-ladder__row");
  if (!rowElement) return;
  const strike = Number(rowElement.dataset.strike);
  const snapshot = controller?.membership()?.rows.find((row) => row.strike === strike);
  if (!breakEvenSelection.select(snapshot)) showStatus("OPTION PRICE UNAVAILABLE");
}

function handleDocumentKeyDown(event) {
  if (event.key === "Escape") clearBreakEvenSelection();
  if (!["Enter", " "].includes(event.key)) return;
  const row = event.target?.closest?.(".nifty-axis-ladder__row");
  if (row) { event.preventDefault(); handleLadderClick(event); }
}
```

Use capture-phase document pointer listener so chart click clears before TradingView handles chart input, while row target remains detectable. Add root click listener for selection. Do not stop propagation.

- [ ] **Step 5: Clear selection on manual refresh and lifecycle invalidation**

At start of `REFRESH_OPTION_NUMBERS` message branch, call `clearBreakEvenSelection()` before requesting fresh data. Also clear in `hideRows`, expiry change, NIFTY-chart invalidation, and `stop()`.

- [ ] **Step 6: Add selected-row CSS**

Add:

```css
.nifty-axis-ladder__row {
  pointer-events: auto;
  cursor: pointer;
}

.nifty-axis-ladder__row.is-selected:not(.is-atm) {
  outline: 2px solid var(--ladder-accent);
  outline-offset: 1px;
}

.nifty-axis-ladder__row.is-selected.is-atm {
  outline: 2px solid var(--ladder-ink);
  outline-offset: 2px;
}
```

- [ ] **Step 7: Run selection and regression tests**

```bash
node --test extension-axis-ladder/breakeven-rails.test.cjs extension-axis-ladder/content-contract.test.cjs extension-axis-ladder/scaffold.test.cjs
```

Expected: all tests PASS; no automatic fetch or selection test regresses.

- [ ] **Step 8: Commit selection lifecycle**

```bash
git add extension-axis-ladder/manifest.json extension-axis-ladder/content.js extension-axis-ladder/content-contract.test.cjs extension-axis-ladder/overlay.css
git commit -m "feat: select ladder strikes explicitly"
```

---

### Task 3: Exact rails and off-screen markers

**Files:**
- Modify: `extension-axis-ladder/content.js`
- Modify: `extension-axis-ladder/content-contract.test.cjs`
- Modify: `extension-axis-ladder/overlay.css`

**Interfaces:**
- Consumes: `breakEvenApi.calculate(selection)`, `breakEvenApi.project(level, toY, plotRect)`, current validated `toY`.
- Produces: `placeBreakEvenRails(toY, plotRect, labelRight)`, `clearBreakEvenRails()`, two exact line or edge-marker DOM elements.

- [ ] **Step 1: Add failing rail-rendering contracts**

Append:

```js
test("clicked strike rails use exact axis map, rounded seller labels, and no safe-zone fill", () => {
  const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");
  assert.match(source, /placeBreakEvenRails\(toY, rect, labelRight\)/);
  assert.match(source, /breakEvenApi\.calculate/);
  assert.match(source, /breakEvenApi\.project/);
  assert.match(css, /\.nifty-break-even__line\.is-call/);
  assert.match(css, /\.nifty-break-even__line\.is-put/);
  assert.match(css, /\.nifty-break-even__marker\.is-top/);
  assert.match(css, /\.nifty-break-even__marker\.is-bottom/);
  assert.doesNotMatch(css, /nifty-break-even__safe-zone/);
});
```

- [ ] **Step 2: Run focused contract and verify failure**

```bash
node --test extension-axis-ladder/content-contract.test.cjs
```

Expected: FAIL because rail renderer and CSS classes do not exist.

- [ ] **Step 3: Implement isolated rail root and clearing**

Add browser-only functions:

```js
function clearBreakEvenRails() {
  document.getElementById("nifty-break-even-rails")?.remove();
}

function breakEvenRoot() {
  let rails = document.getElementById("nifty-break-even-rails");
  if (!rails) {
    rails = document.createElement("div");
    rails.id = "nifty-break-even-rails";
    rootNode().append(rails);
  }
  return rails;
}
```

Renderer calculates current selection once, clears old DOM, and creates exactly two children. For `mode: "line"`, line spans plot `left` to `labelRight`. For `mode: "edge"`, marker sits at plot top or bottom and retains real rounded label. Never clamp price itself.

- [ ] **Step 4: Pass validated axis map through placement**

Change controller call and browser implementation:

```js
const rowPlacement = placeRows(positioned, membership, cachedAxisToY);
```

```js
function placeRows(rows, membership, toY) {
  // existing row placement
  const labelRight = riskLabelLayout(laneZeroRows)?.labelRight ?? rect.right;
  placeBreakEvenRails(toY, rect, labelRight);
  return { riskLayout: { labelRight } };
}
```

If no selection exists, `placeBreakEvenRails` clears rail root and returns false. If `toY` or projection is invalid, conceal rails without clearing selection so bounded axis retries may restore them.

- [ ] **Step 5: Add chart-theme-independent rail CSS**

Add fixed, pointer-transparent classes:

```css
#nifty-break-even-rails { position: fixed; inset: 0; pointer-events: none; z-index: 1; }
.nifty-break-even__line { position: fixed; height: 0; border-top: 1px dashed; }
.nifty-break-even__line.is-call { border-color: #3b82f6; }
.nifty-break-even__line.is-put { border-color: #f59e0b; }
.nifty-break-even__label,
.nifty-break-even__marker { position: fixed; background: var(--ladder-surface); color: var(--ladder-ink); font: 10px/1.3 "Geist Mono", ui-monospace, monospace; white-space: nowrap; }
.nifty-break-even__marker.is-top { transform: translateY(0); }
.nifty-break-even__marker.is-bottom { transform: translateY(-100%); }
```

Add colored left edge or text accent so Call/Put remain distinguishable without relying on line color alone. Keep labels inside plot and left of lane-zero ladder rows.

- [ ] **Step 6: Run focused and full extension tests**

```bash
node --test extension-axis-ladder/breakeven-rails.test.cjs extension-axis-ladder/content-contract.test.cjs
cd data-bridge && npm test
```

Expected: focused tests PASS; full suite remains PASS.

- [ ] **Step 7: Commit rail rendering**

```bash
git add extension-axis-ladder/content.js extension-axis-ladder/content-contract.test.cjs extension-axis-ladder/overlay.css
git commit -m "feat: render clicked-strike break-even rails"
```

---

### Task 4: Operator documentation and final verification

**Files:**
- Modify: `extension-axis-ladder/README.md`
- Modify: `extension-axis-ladder/content-contract.test.cjs`

**Interfaces:**
- Consumes: completed row selection and rail behavior.
- Produces: tested operator instructions and release-ready break-even feature.

- [ ] **Step 1: Add failing documentation assertion**

Append:

```js
test("operator guide documents click-only single-leg break-even rails", () => {
  const readme = fs.readFileSync(path.join(__dirname, "README.md"), "utf8");
  assert.match(readme, /click[^\n]*strike[^\n]*CALL BE[^\n]*PUT BE/i);
  assert.match(readme, /outside click[^\n]*remove/i);
  assert.match(readme, /single-leg[^\n]*expiry break-even/i);
  assert.match(readme, /manual refresh[^\n]*click[^\n]*again/i);
});
```

- [ ] **Step 2: Run documentation test and verify failure**

```bash
node --test extension-axis-ladder/content-contract.test.cjs
```

Expected: FAIL because README lacks clicked-strike workflow.

- [ ] **Step 3: Document exact workflow and financial scope**

Add concise README section:

```markdown
## Clicked-strike break-evens

Click one ladder strike to show its independent single-leg Call and Put expiry break-evens on chart. CALL BE is strike plus displayed Call premium; PUT BE is strike minus displayed Put premium. Values are rounded to whole NIFTY points. Click anywhere outside ladder to remove both. Manual refresh removes them; click a strike again to calculate from refreshed numbers. These are not combined short-straddle break-evens.
```

- [ ] **Step 4: Run final verification**

```bash
node --check extension-axis-ladder/breakeven-rails.js
node --check extension-axis-ladder/content.js
cd data-bridge && npm test
git diff --check
git status --short
```

Expected: syntax checks and all tests PASS; diff check exits `0`; status contains only planned files plus pre-existing `.superpowers/brainstorm/` untracked directory, which must not be staged.

- [ ] **Step 5: Commit docs**

```bash
git add extension-axis-ladder/README.md extension-axis-ladder/content-contract.test.cjs
git commit -m "docs: explain clicked-strike break-even rails"
```

