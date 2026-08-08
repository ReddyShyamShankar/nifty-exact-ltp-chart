# Manual Chart Strategy Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an expiry-keyed manual NIFTY options plan directly on TradingView, with in-row add/edit controls, immutable entry snapshots, row flipping, and exact combined expiry break-even rails.

**Architecture:** Add four browser/CommonJS modules with narrow responsibilities: immutable manual-plan storage, exact expiry-payoff math, single-vs-double-click interaction state, and manual row/editor UI. `content.js` composes those modules with current cached ladder rows and validated TradingView axis mapping; no broker, refresh, or seller-ledger path owns manual plan data.

**Tech Stack:** Chrome Extension Manifest V3, plain JavaScript IIFEs/CommonJS exports, `chrome.storage.local`, DOM/CSS overlay, Node built-in `node:test`, existing TradingView native-axis capture.

## Global Constraints

- NIFTY only; every manual plan is keyed by one exact expiry.
- Manual plan starts empty and changes only after explicit Add, Save, or Remove.
- No Zerodha position import, tradebook allocation, order placement, automatic option refresh, full option-chain table, bottom tray, Greeks, probability, margin, or recommendations.
- Live option numbers continue changing only after existing explicit manual refresh.
- Live row stays black `#111315`; ATM live row uses markup orange `#ff9f0a`; Buy entry uses markup green `#34d399`; Sell entry uses markup red `#f87171`.
- No new semantic color. Existing selected/editor yellow `#facc15` remains transient only.
- Single click without saved entries keeps existing independent Call/Put break-even rails.
- Single click with saved entries flips entry snapshots; double click opens exact-row editor and must cancel single-click behavior.
- Combined payoff solver returns every exact zero crossing. It must not sample pixels or hide extra roots.
- Saved snapshots never change during live refresh, timeframe change, zoom, pan, reload, or side-panel activity.
- Minimum Chrome version stays `141`; no runtime dependency is added.
- Pre-existing `.superpowers/brainstorm/` remains untracked and must never be staged.

---

## File Structure

### Create

- `extension-axis-ladder/manual-plan.js` — validate, normalize, group, upsert, and remove expiry-keyed manual entries.
- `extension-axis-ladder/manual-plan.test.cjs` — immutable store, malformed-data, grouping, and snapshot tests.
- `extension-axis-ladder/manual-payoff.js` — option-leg payoff, exact piecewise zero crossings, and plan break-even labels.
- `extension-axis-ladder/manual-payoff.test.cjs` — formula, approved-example, extra-root, and flat-payoff tests.
- `extension-axis-ladder/manual-interaction.js` — delayed single-click, cancelled double-click, face cycling, and transient reset.
- `extension-axis-ladder/manual-interaction.test.cjs` — deterministic fake-timer interaction tests.
- `extension-axis-ladder/manual-ui.js` — draft state, entry conversion, row-face DOM, count dot, and compact inline editor.
- `extension-axis-ladder/manual-ui.test.cjs` — draft validation, live/entry face, editor structure, and accessibility tests.

### Modify

- `extension-axis-ladder/manifest.json` — load four modules before `content.js`; bump candidate version to `0.5.0`.
- `extension-axis-ladder/content.js` — compose storage, rows, editor, interaction, preview, and combined rails.
- `extension-axis-ladder/overlay.css` — exact token states, count dot, editor, entry face, and neutral plan rails.
- `extension-axis-ladder/content-contract.test.cjs` — browser lifecycle, storage, rendering, refresh, and native-axis integration.
- `extension-axis-ladder/scaffold.test.cjs` — script order and `0.5.0` release contract.
- `extension-axis-ladder/README.md` — manual builder workflow and financial meaning.
- `README.md` — candidate summary and manual-builder boundary.

---

### Task 1: Immutable Manual Plan Store

**Files:**
- Create: `extension-axis-ladder/manual-plan.js`
- Create: `extension-axis-ladder/manual-plan.test.cjs`

**Interfaces:**
- Produces: `STORAGE_KEY`, `emptyStore()`, `normalizeEntry(input)`, `normalizeStore(input)`, `entriesFor(store, expiry)`, `upsertEntry(store, entry)`, `removeEntry(store, expiry, entryId)`, `groupByStrike(entries)`.
- Entry shape: `{ id, underlying, expiry, strike, optionType, direction, lots, premium, callSnapshot, putSnapshot, createdAt, updatedAt }`.
- Store shape: `{ version: 1, plans: { [expiry]: { entries: ManualEntry[] } } }`.

- [ ] **Step 1: Write failing immutable-store tests**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const plan = require("./manual-plan.js");

const callEntry = {
  id: "entry-1", underlying: "NIFTY", expiry: "2026-08-25",
  strike: 24100, optionType: "CALL", direction: "SELL", lots: 2,
  premium: 358, callSnapshot: 358, putSnapshot: 315.45,
  createdAt: "2026-07-29T10:00:00.000Z", updatedAt: "2026-07-29T10:00:00.000Z"
};

test("upsert keeps old store immutable and groups exact strikes", () => {
  const before = plan.emptyStore();
  const after = plan.upsertEntry(before, callEntry);
  assert.deepEqual(plan.entriesFor(before, "2026-08-25"), []);
  assert.deepEqual(plan.entriesFor(after, "2026-08-25"), [callEntry]);
  assert.deepEqual([...plan.groupByStrike(plan.entriesFor(after, "2026-08-25"))], [[24100, [callEntry]]]);
});

test("same id updates exact entry and preserves createdAt", () => {
  const stored = plan.upsertEntry(plan.emptyStore(), callEntry);
  const changed = plan.upsertEntry(stored, { ...callEntry, lots: 3, updatedAt: "2026-07-29T10:05:00.000Z" });
  assert.equal(plan.entriesFor(changed, callEntry.expiry)[0].lots, 3);
  assert.equal(plan.entriesFor(changed, callEntry.expiry)[0].createdAt, callEntry.createdAt);
});

test("invalid entries are excluded without guessing values", () => {
  const malformed = { version: 1, plans: { "2026-08-25": { entries: [{ ...callEntry, lots: 0 }, { ...callEntry, id: "bad", premium: "" }] } } };
  assert.deepEqual(plan.entriesFor(plan.normalizeStore(malformed), "2026-08-25"), []);
});

test("remove deletes only exact id in exact expiry", () => {
  const second = { ...callEntry, id: "entry-2", strike: 24000, optionType: "PUT" };
  const stored = plan.upsertEntry(plan.upsertEntry(plan.emptyStore(), callEntry), second);
  assert.deepEqual(plan.entriesFor(plan.removeEntry(stored, callEntry.expiry, callEntry.id), callEntry.expiry), [second]);
});
```

- [ ] **Step 2: Run tests and verify missing-module failure**

Run: `node --test extension-axis-ladder/manual-plan.test.cjs`
Expected: FAIL with `Cannot find module './manual-plan.js'`.

- [ ] **Step 3: Implement validated immutable store**

Use existing IIFE/CommonJS module pattern. Validation must require exact strings and finite values; `callSnapshot` and `putSnapshot` may be `null`, but never become zero by coercion.

```js
(function (root) {
  "use strict";
  const STORAGE_KEY = "manualPlans";
  const VERSION = 1;
  const finite = (value) => value === null || value === undefined || value === "" || typeof value === "boolean"
    ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
  const snapshot = (value) => { const number = finite(value); return number !== null && number >= 0 ? number : null; };
  const emptyStore = () => ({ version: VERSION, plans: {} });

  function normalizeEntry(input) {
    const strike = finite(input?.strike);
    const lots = finite(input?.lots);
    const premium = finite(input?.premium);
    if (!input || typeof input.id !== "string" || !input.id || input.underlying !== "NIFTY"
      || typeof input.expiry !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.expiry)
      || !["CALL", "PUT"].includes(input.optionType) || !["BUY", "SELL"].includes(input.direction)
      || strike === null || strike <= 0 || lots === null || !Number.isInteger(lots) || lots <= 0
      || premium === null || premium < 0 || typeof input.createdAt !== "string" || typeof input.updatedAt !== "string") return null;
    return { id: input.id, underlying: "NIFTY", expiry: input.expiry, strike, optionType: input.optionType,
      direction: input.direction, lots, premium, callSnapshot: snapshot(input.callSnapshot),
      putSnapshot: snapshot(input.putSnapshot), createdAt: input.createdAt, updatedAt: input.updatedAt };
  }

  function normalizeStore(input) {
    const next = emptyStore();
    for (const [expiry, plan] of Object.entries(input?.plans || {})) {
      const entries = (Array.isArray(plan?.entries) ? plan.entries : []).map(normalizeEntry).filter(Boolean)
        .filter((entry) => entry.expiry === expiry);
      if (entries.length) next.plans[expiry] = { entries };
    }
    return next;
  }
  function entriesFor(store, expiry) { return normalizeStore(store).plans[expiry]?.entries || []; }
  function upsertEntry(store, input) {
    const entry = normalizeEntry(input); if (!entry) throw new Error("invalid manual entry");
    const next = normalizeStore(store); const current = entriesFor(next, entry.expiry);
    const prior = current.find((item) => item.id === entry.id);
    const saved = prior ? { ...entry, createdAt: prior.createdAt } : entry;
    next.plans[entry.expiry] = { entries: [...current.filter((item) => item.id !== entry.id), saved] };
    return next;
  }
  function removeEntry(store, expiry, entryId) {
    const next = normalizeStore(store); const remaining = entriesFor(next, expiry).filter((entry) => entry.id !== entryId);
    if (remaining.length) next.plans[expiry] = { entries: remaining }; else delete next.plans[expiry];
    return next;
  }
  function groupByStrike(entries) {
    const groups = new Map();
    entries.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
      .forEach((entry) => groups.set(entry.strike, [...(groups.get(entry.strike) || []), entry]));
    return groups;
  }
  const api = { STORAGE_KEY, emptyStore, normalizeEntry, normalizeStore, entriesFor, upsertEntry, removeEntry, groupByStrike };
  root.NiftyManualPlan = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
```

- [ ] **Step 4: Run model tests**

Run: `node --test extension-axis-ladder/manual-plan.test.cjs`
Expected: all tests PASS.

- [ ] **Step 5: Commit model**

```bash
git add extension-axis-ladder/manual-plan.js extension-axis-ladder/manual-plan.test.cjs
git commit -m "feat: add manual plan model"
```

---

### Task 2: Exact Combined Expiry Payoff

**Files:**
- Create: `extension-axis-ladder/manual-payoff.js`
- Create: `extension-axis-ladder/manual-payoff.test.cjs`

**Interfaces:**
- Consumes: normalized `ManualEntry[]` from Task 1.
- Produces: `legPayoff(entry, underlyingPrice)`, `payoffAt(entries, underlyingPrice)`, `breakEvens(entries)`, `levels(entries, prefix = "PLAN BE")`.
- `breakEvens` returns `{ status: "empty" | "ok" | "flat", points: number[] }`.

- [ ] **Step 1: Write failing formula and approved-example tests**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const payoff = require("./manual-payoff.js");

const leg = (overrides) => ({ id: "x", underlying: "NIFTY", expiry: "2026-08-25", strike: 24100,
  optionType: "CALL", direction: "SELL", lots: 1, premium: 358, ...overrides });

test("four option directions use exact expiry payoff", () => {
  assert.equal(payoff.legPayoff(leg({ optionType: "CALL", direction: "BUY" }), 24500), 42);
  assert.equal(payoff.legPayoff(leg({ optionType: "CALL", direction: "SELL" }), 24500), -42);
  assert.equal(payoff.legPayoff(leg({ optionType: "PUT", direction: "BUY", strike: 24000, premium: 183 }), 23500), 317);
  assert.equal(payoff.legPayoff(leg({ optionType: "PUT", direction: "SELL", strike: 24000, premium: 183 }), 23500), -317);
});

test("approved lot changes move combined break-evens", () => {
  const put = leg({ id: "p", strike: 24000, optionType: "PUT", direction: "SELL", lots: 3, premium: 183 });
  const oneCall = leg({ id: "c1", lots: 1 });
  const twoCalls = leg({ id: "c2", lots: 2 });
  assert.deepEqual(payoff.breakEvens([oneCall, put]).points.map(Math.round), [23698, 25007]);
  assert.deepEqual(payoff.breakEvens([twoCalls, put]).points.map(Math.round), [23578, 24733]);
});

test("solver returns every root and detects fully flat payoff", () => {
  const butterfly = [leg({ strike: 24000, optionType: "CALL", direction: "BUY", premium: 300 }),
    leg({ strike: 24100, optionType: "CALL", direction: "SELL", lots: 2, premium: 220 }),
    leg({ strike: 24200, optionType: "CALL", direction: "BUY", premium: 160 })];
  assert.deepEqual(payoff.breakEvens(butterfly).points.map(Math.round), [24020, 24180]);
  assert.equal(payoff.breakEvens([leg({ id: "a", direction: "BUY" }), leg({ id: "b", direction: "SELL" })]).status, "flat");
});
```

- [ ] **Step 2: Run tests and verify missing-module failure**

Run: `node --test extension-axis-ladder/manual-payoff.test.cjs`
Expected: FAIL with `Cannot find module './manual-payoff.js'`.

- [ ] **Step 3: Implement pure payoff and exact interval solver**

Calculate each leg continuously. Build sorted unique strike knots. For each interval `[left, right]`, derive line `m*S + b` from two payoff evaluations inside interval, solve `S = -b/m`, and accept root only inside interval. Add exact zero-valued knots, deduplicate within `1e-7`, and use two points above largest strike for upper tail. Detect all-zero net payoff before root search.

```js
function legPayoff(entry, underlyingPrice) {
  const s = Number(underlyingPrice), k = Number(entry.strike), premium = Number(entry.premium), lots = Number(entry.lots);
  const intrinsic = entry.optionType === "CALL" ? Math.max(s - k, 0) : Math.max(k - s, 0);
  return lots * (entry.direction === "BUY" ? intrinsic - premium : premium - intrinsic);
}
function payoffAt(entries, price) { return entries.reduce((sum, entry) => sum + legPayoff(entry, price), 0); }
function levels(entries, prefix = "PLAN BE") {
  const result = breakEvens(entries);
  return { ...result, levels: result.points.map((exact) => ({ kind: "plan", exact,
    rounded: Math.round(exact), label: `${prefix} ${Math.round(exact).toLocaleString("en-IN")}` })) };
}
```

- [ ] **Step 4: Run payoff tests**

Run: `node --test extension-axis-ladder/manual-payoff.test.cjs`
Expected: all tests PASS, including approved rounded boundaries.

- [ ] **Step 5: Commit payoff calculator**

```bash
git add extension-axis-ladder/manual-payoff.js extension-axis-ladder/manual-payoff.test.cjs
git commit -m "feat: calculate manual plan break-evens"
```

---

### Task 3: Single/Double Click and Face State

**Files:**
- Create: `extension-axis-ladder/manual-interaction.js`
- Create: `extension-axis-ladder/manual-interaction.test.cjs`

**Interfaces:**
- Produces: `createController({ delay, setTimer, clearTimer, onQuick, onFace, onEditor, onReset })`.
- Controller methods: `click(context)`, `doubleClick(context)`, `outside()`, `escape()`, `reset()`, `activeEntryId(strike)`.
- Context: `{ strike, entries, liveRow }`; entries arrive newest-first.

- [ ] **Step 1: Write failing deterministic timer tests**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const interaction = require("./manual-interaction.js");

function harness() {
  const timers = new Map(); let id = 0; const calls = [];
  const controller = interaction.createController({ delay: 240,
    setTimer(fn) { const key = ++id; timers.set(key, fn); return key; },
    clearTimer(key) { timers.delete(key); },
    onQuick(value) { calls.push(["quick", value.strike]); },
    onFace(value) { calls.push(["face", value.entryId]); },
    onEditor(value) { calls.push(["editor", value.entryId]); },
    onReset() { calls.push(["reset"]); }
  });
  return { controller, calls, flush() { for (const [key, fn] of [...timers]) { timers.delete(key); fn(); } }, timers };
}

test("double click cancels pending single click", () => {
  const h = harness(); const context = { strike: 24450, entries: [], liveRow: { strike: 24450 } };
  h.controller.click(context); h.controller.doubleClick(context); h.flush();
  assert.deepEqual(h.calls, [["editor", null]]);
});

test("saved entries cycle newest first then live", () => {
  const h = harness(); const context = { strike: 24450, entries: [{ id: "new" }, { id: "old" }] };
  h.controller.click(context); h.flush(); h.controller.click(context); h.flush(); h.controller.click(context); h.flush();
  assert.deepEqual(h.calls, [["face", "new"], ["face", "old"], ["face", null]]);
});

test("outside and escape cancel timer and reset faces", () => {
  const h = harness(); h.controller.click({ strike: 24450, entries: [] }); h.controller.outside(); h.flush();
  assert.deepEqual(h.calls, [["reset"]]);
});
```

- [ ] **Step 2: Run tests and verify missing-module failure**

Run: `node --test extension-axis-ladder/manual-interaction.test.cjs`
Expected: FAIL with missing module.

- [ ] **Step 3: Implement one pending timer and per-strike cycle index**

```js
(function (root) {
"use strict";
function createController(options) {
  let pending = null;
  const faces = new Map();
  function cancel() { if (pending !== null) options.clearTimer(pending); pending = null; }
  function click(context) {
    cancel();
    pending = options.setTimer(() => {
      pending = null;
      const entries = Array.isArray(context.entries) ? context.entries : [];
      if (!entries.length) return options.onQuick(context);
      const currentId = faces.get(context.strike) || null;
      const currentIndex = entries.findIndex((entry) => entry.id === currentId);
      const index = currentIndex + 1;
      const entry = entries[index] || null;
      if (entry) faces.set(context.strike, entry.id); else faces.delete(context.strike);
      options.onFace({ ...context, entryId: entry?.id || null });
    }, options.delay ?? 240);
  }
  function doubleClick(context) { cancel(); options.onEditor({ ...context, entryId: faces.get(context.strike) || null }); }
  function reset() { cancel(); faces.clear(); options.onReset(); }
  return { click, doubleClick, outside: reset, escape: reset, reset,
    activeEntryId(strike) { return faces.get(strike) || null; } };
}
const api = { createController };
root.NiftyManualInteraction = api;
if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
```

- [ ] **Step 4: Run interaction tests**

Run: `node --test extension-axis-ladder/manual-interaction.test.cjs`
Expected: all tests PASS.

- [ ] **Step 5: Commit interaction controller**

```bash
git add extension-axis-ladder/manual-interaction.js extension-axis-ladder/manual-interaction.test.cjs
git commit -m "feat: add manual ladder interaction state"
```

---

### Task 4: Draft State, Row Faces, and Compact Editor

**Files:**
- Create: `extension-axis-ladder/manual-ui.js`
- Create: `extension-axis-ladder/manual-ui.test.cjs`

**Interfaces:**
- Consumes: normalized entry shape from Task 1 and current live row `{ strike, call, put }`.
- Produces: `createDraft({ expiry, row, entry })`, `chooseAction(draft, optionType, direction)`, `setLots(draft, lots)`, `setPremium(draft, premium)`, `validateDraft(draft)`, `entryFromDraft(draft, { id, now })`, `previewEntries(saved, draft, identity)`, `rowModel(view)`, `editorModel(draft)`, `renderRow(document, element, view)`, `renderEditor(document, draft, handlers)`.
- `view`: `{ liveRow, isAtm, entries, activeEntryId }`.

- [ ] **Step 1: Write failing draft and presentation tests**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const ui = require("./manual-ui.js");

test("choosing Call Sell fills Call quote and preserves both snapshots", () => {
  const draft = ui.chooseAction(ui.createDraft({ expiry: "2026-08-25",
    row: { strike: 24450, call: 223.4, put: 409.8 } }), "CALL", "SELL");
  assert.equal(draft.premium, 223.4);
  assert.equal(draft.callSnapshot, 223.4);
  assert.equal(draft.putSnapshot, 409.8);
  assert.equal(ui.validateDraft(ui.setLots(draft, 2)).ok, true);
});

test("edited traded premium replaces only selected snapshot", () => {
  let draft = ui.chooseAction(ui.createDraft({ expiry: "2026-08-25",
    row: { strike: 24450, call: 223.4, put: 409.8 } }), "CALL", "SELL");
  draft = ui.setPremium(ui.setLots(draft, 2), 358);
  const entry = ui.entryFromDraft(draft, { id: "e1", now: "2026-07-29T10:00:00.000Z" });
  assert.deepEqual([entry.callSnapshot, entry.putSnapshot, entry.premium], [358, 409.8, 358]);
});

test("row model shows one face and exact compact copy", () => {
  const model = ui.rowModel({ liveRow: { strike: 24450, call: 223.4, put: 409.8 }, isAtm: false,
    entries: [{ id: "e1", direction: "SELL", optionType: "CALL", lots: 2, callSnapshot: 358, putSnapshot: 414.6 }], activeEntryId: "e1" });
  assert.deepEqual(model.columns, ["C 358.00 ×2", "P 414.60", "24,450"]);
  assert.equal(model.className, "is-manual-entry is-sell");
  assert.equal(model.count, 1);
  assert.equal(model.visibleFaceCount, 1);
});

test("editor model contains two staged menus and no strike or flip icon", () => {
  const model = ui.editorModel(ui.createDraft({ expiry: "2026-08-25", row: { strike: 24450, call: 223.4, put: 409.8 } }));
  assert.deepEqual(model.typeButtons, ["CALL", "PUT"]);
  assert.deepEqual(model.actions, ["BUY", "SELL"]);
  assert.equal(model.visibleStrike, null);
  assert.equal(model.flipIcon, null);
});
```

- [ ] **Step 2: Run tests and verify missing-module failure**

Run: `node --test extension-axis-ladder/manual-ui.test.cjs`
Expected: FAIL with missing module.

- [ ] **Step 3: Implement immutable draft transitions and row model**

`chooseAction` must refill premium from selected live quote. `setPremium` must update selected side snapshot only. `entryFromDraft` must preserve `createdAt` while editing and set `updatedAt` to supplied `now`.

```js
function rowModel({ liveRow, isAtm, entries = [], activeEntryId = null }) {
  const active = entries.find((entry) => entry.id === activeEntryId) || null;
  if (!active) return { columns: [`C ${money(liveRow.call)}`, `P ${money(liveRow.put)}`,
    Number(liveRow.strike).toLocaleString("en-IN")], className: isAtm ? "is-atm" : "", count: entries.length, visibleFaceCount: 1 };
  const call = `C ${money(active.callSnapshot)}${active.optionType === "CALL" ? ` ×${active.lots}` : ""}`;
  const put = `P ${money(active.putSnapshot)}${active.optionType === "PUT" ? ` ×${active.lots}` : ""}`;
  return { columns: [call, put, Number(active.strike).toLocaleString("en-IN")],
    className: `is-manual-entry is-${active.direction.toLowerCase()}`, count: entries.length, visibleFaceCount: 1 };
}
```

- [ ] **Step 4: Implement safe DOM rendering**

`renderRow` must replace children with three `.nifty-axis-ladder__cell` spans plus optional `.nifty-axis-ladder__count`. Use `textContent`; do not inject values through HTML. `renderEditor` must return a `.nifty-manual-editor` element with:

```text
CALL ▾ | PUT ▾ | − 1 + | 223.40 | ADD/SAVE | REMOVE(edit only) | ×
```

Each Call/Put menu reveals only two `BUY`/`SELL` choices. Wire handlers through passed callbacks; UI module must not access storage or option API.

- [ ] **Step 5: Run UI tests**

Run: `node --test extension-axis-ladder/manual-ui.test.cjs`
Expected: all tests PASS.

- [ ] **Step 6: Commit UI module**

```bash
git add extension-axis-ladder/manual-ui.js extension-axis-ladder/manual-ui.test.cjs
git commit -m "feat: add manual ladder editor UI"
```

---

### Task 5: Content Integration, Storage, and Lifecycle

**Files:**
- Modify: `extension-axis-ladder/manifest.json`
- Modify: `extension-axis-ladder/content.js:4-33, 847-925, 1207-1268, 1330-1425, 1447-1524`
- Modify: `extension-axis-ladder/content-contract.test.cjs`
- Modify: `extension-axis-ladder/scaffold.test.cjs`

**Interfaces:**
- Consumes: all Task 1–4 APIs.
- Produces: expiry-keyed persisted plan, in-row editor lifecycle, live/entry row state, and no-fetch manual interactions.
- Storage field: `manualPlans`, default `manualPlanApi.emptyStore()`.

- [ ] **Step 1: Write failing manifest and lifecycle contract tests**

Add explicit tests:

```js
test("manual modules load before content in dependency order", () => {
  const manifest = require("./manifest.json");
  const scripts = manifest.content_scripts.find((entry) => entry.js.includes("content.js")).js;
  for (const file of ["manual-plan.js", "manual-payoff.js", "manual-interaction.js", "manual-ui.js"])
    assert.ok(scripts.indexOf(file) < scripts.indexOf("content.js"));
});

test("manual refresh preserves saved entry snapshot", async () => {
  const h = createBreakEvenLifecycleHarness({ manualEntries: [{ id: "e1", strike: 24450,
    optionType: "CALL", direction: "SELL", lots: 2, premium: 358,
    callSnapshot: 358, putSnapshot: 414.6 }] });
  await h.refreshOptionNumbers({ call: 223.4, put: 409.8 });
  assert.equal(h.manualEntries()[0].callSnapshot, 358);
  assert.equal(h.manualEntries()[0].putSnapshot, 414.6);
});

test("double click opens editor without quick rails or face flash", async () => {
  const h = createBreakEvenLifecycleHarness(); await h.settle();
  h.doubleClick(24450); h.flushClickTimer();
  assert.ok(h.editor(24450));
  assert.equal(h.rails(), null);
  assert.equal(h.row(24450).classList.contains("is-manual-entry"), false);
});
```

Extend harness with deterministic methods:

```js
doubleClick(strike) {
  const root = document.getElementById("nifty-axis-ladder");
  root.dispatch("click", { target: this.row(strike) });
  root.dispatch("dblclick", { target: this.row(strike) });
}
flushClickTimer() {
  const timer = [...timers.entries()].find(([, entry]) => entry.delay === 240);
  if (timer) { timers.delete(timer[0]); timer[1].callback(); }
}
editor(strike) { return this.row(strike)?.querySelector(".nifty-manual-editor"); }
manualEntries() { return manualPlanApi.entriesFor(settings.manualPlans, settings.expiry); }
storageSetCalls() { return storageWrites.length; }
```

- [ ] **Step 2: Run focused contracts and verify failures**

Run: `node --test extension-axis-ladder/scaffold.test.cjs extension-axis-ladder/content-contract.test.cjs`
Expected: FAIL because modules, storage field, editor, and script order are absent.

- [ ] **Step 3: Wire module dependencies and storage default**

Resolve `NiftyManualPlan`, `NiftyManualPayoff`, `NiftyManualInteraction`, and `NiftyManualUi` using same browser/CommonJS fallback as existing modules. Move `DEFAULTS` below dependency resolution and set `manualPlans: manualPlanApi.emptyStore()`. Normalize loaded/stored values through `manualPlanApi.normalizeStore`.

Add manifest scripts before `content.js` in this exact order:

```json
"manual-plan.js",
"manual-payoff.js",
"manual-interaction.js",
"manual-ui.js",
"content.js"
```

- [ ] **Step 4: Add one persistence boundary**

```js
async function persistManualPlans(next) {
  const normalized = manualPlanApi.normalizeStore(next);
  await chrome.storage.local.set({ [manualPlanApi.STORAGE_KEY]: normalized });
  settings.manualPlans = normalized;
  renderManualRows();
  await controller?.place();
  return normalized;
}
```

Storage failure catches in editor commit path, keeps draft open, preserves old store, and sets `PLAN NOT SAVED`.

- [ ] **Step 5: Integrate row render and interaction controller**

Replace `element.textContent = formatRow(row)` with `manualUiApi.renderRow(...)`. Group active-expiry entries once per render. Add delegated `click` and `dblclick` listeners. `onQuick` calls current independent selection path; `onFace` rerenders only affected row then places; `onEditor` opens add/edit editor at row; reset returns all rows to live.

`hideRows`, `concealRows`, expiry change, URL change, timeframe change, `stop`, outside click, and `Escape` must call one `clearManualTransientState()` that closes editor and resets faces without touching storage.

- [ ] **Step 6: Wire editor Add/Save/Remove**

On Add/Save, convert valid draft through `entryFromDraft`, then `upsertEntry`, persist, close editor, and preserve keyboard focus on exact strike. On Remove, call `removeEntry`, persist, close editor, and preserve focus. New IDs use `crypto.randomUUID()`; timestamps use `new Date().toISOString()`.

- [ ] **Step 7: Run focused integration tests**

Run: `node --test extension-axis-ladder/manual-plan.test.cjs extension-axis-ladder/manual-interaction.test.cjs extension-axis-ladder/manual-ui.test.cjs extension-axis-ladder/scaffold.test.cjs extension-axis-ladder/content-contract.test.cjs`
Expected: all tests PASS; existing quick rails still pass unchanged for rows without saved entries.

- [ ] **Step 8: Commit integration**

```bash
git add extension-axis-ladder/manifest.json extension-axis-ladder/content.js extension-axis-ladder/content-contract.test.cjs extension-axis-ladder/scaffold.test.cjs
git commit -m "feat: integrate manual ladder positions"
```

---

### Task 6: Combined Preview and Saved Break-Even Rails

**Files:**
- Modify: `extension-axis-ladder/content.js:927-1004, 1207-1268`
- Modify: `extension-axis-ladder/overlay.css:39-124`
- Modify: `extension-axis-ladder/content-contract.test.cjs`

**Interfaces:**
- Consumes: `manualPayoffApi.levels(entries, prefix)` and existing `breakEvenApi.project/layoutDecorations`.
- Produces: `#nifty-manual-plan-rails`, saved `PLAN BE` lines, draft `PREVIEW BE` lines, and truthful edge markers.

- [ ] **Step 1: Write failing rail and preview tests**

```js
const approvedOneCallThreePuts = [
  { id: "call-entry", underlying: "NIFTY", expiry: "2026-08-25", strike: 24100,
    optionType: "CALL", direction: "SELL", lots: 1, premium: 358,
    callSnapshot: 358, putSnapshot: 315.45,
    createdAt: "2026-07-29T10:00:00.000Z", updatedAt: "2026-07-29T10:00:00.000Z" },
  { id: "put-entry", underlying: "NIFTY", expiry: "2026-08-25", strike: 24000,
    optionType: "PUT", direction: "SELL", lots: 3, premium: 183,
    callSnapshot: 411.15, putSnapshot: 183,
    createdAt: "2026-07-29T10:01:00.000Z", updatedAt: "2026-07-29T10:01:00.000Z" }
];
const approvedTwoLegPlan = approvedOneCallThreePuts;

test("saved manual plan draws every neutral break-even through native axis", async () => {
  const h = createBreakEvenLifecycleHarness({ manualEntries: approvedTwoLegPlan });
  await h.settle();
  const rails = h.manualRails();
  assert.deepEqual(rails.children.map((node) => node.textContent), ["PLAN BE 23,698", "PLAN BE 25,007"]);
  assert.equal(rails.children.every((node) => node.classList.contains("is-plan")), true);
});

test("valid draft previews changed lots without saving", async () => {
  const h = createBreakEvenLifecycleHarness({ manualEntries: approvedOneCallThreePuts });
  h.openEdit("call-entry"); h.setEditorLots(2);
  assert.deepEqual(h.manualRailLabels(), ["PREVIEW BE 23,578", "PREVIEW BE 24,733"]);
  assert.equal(h.storageSetCalls(), 0);
  h.cancelEditor();
  assert.deepEqual(h.manualRailLabels(), ["PLAN BE 23,698", "PLAN BE 25,007"]);
});

test("axis failure conceals manual rails without deleting plan", async () => {
  const h = createBreakEvenLifecycleHarness({ manualEntries: approvedTwoLegPlan });
  h.setProject(() => null); await h.retryPlacement();
  assert.equal(h.manualRails(), null);
  assert.equal(h.manualEntries().length, 2);
});
```

- [ ] **Step 2: Run content contract and verify missing-rail failures**

Run: `node --test extension-axis-ladder/content-contract.test.cjs`
Expected: new manual-rail tests FAIL; existing tests remain PASS.

- [ ] **Step 3: Add independent manual rail root and renderer**

Use separate `#nifty-manual-plan-rails`; never reuse or clear `#nifty-break-even-rails`. Active entries are saved plan unless valid draft exists, in which case `previewEntries` replaces edited entry or appends new draft.

```js
function manualLevels() {
  const saved = manualPlanApi.entriesFor(settings.manualPlans, settings.expiry);
  const preview = openDraft && manualUiApi.validateDraft(openDraft).ok
    ? manualUiApi.previewEntries(saved, openDraft, draftIdentity()) : saved;
  return manualPayoffApi.levels(preview, openDraft ? "PREVIEW BE" : "PLAN BE");
}
```

Project each level with existing `breakEvenApi.project`, resolve label overlap with `layoutDecorations`, and render all valid levels. `empty` clears manual rails; `flat` clears lines and sets `PLAN PAYOFF FLAT`.

- [ ] **Step 4: Place rails on every validated axis placement**

Call `placeManualPlanRails(toY, rect, labelRight)` beside current `placeBreakEvenRails`. Clear only visual manual rails on axis failure, row concealment, or stop. Never clear persisted plan from rendering failures.

- [ ] **Step 5: Run payoff and content tests**

Run: `node --test extension-axis-ladder/manual-payoff.test.cjs extension-axis-ladder/content-contract.test.cjs`
Expected: all tests PASS.

- [ ] **Step 6: Commit manual rails**

```bash
git add extension-axis-ladder/content.js extension-axis-ladder/overlay.css extension-axis-ladder/content-contract.test.cjs
git commit -m "feat: preview manual plan break-evens"
```

---

### Task 7: Exact Tokens, Accessibility, Documentation, and Release Verification

**Files:**
- Modify: `extension-axis-ladder/overlay.css:1-8, 126-204`
- Modify: `extension-axis-ladder/content-contract.test.cjs`
- Modify: `extension-axis-ladder/scaffold.test.cjs`
- Modify: `extension-axis-ladder/manifest.json`
- Modify: `extension-axis-ladder/README.md`
- Modify: `README.md`

**Interfaces:**
- Produces final visual/accessibility contract and candidate release `0.5.0`.

- [ ] **Step 1: Write failing exact-token and visible-copy tests**

```js
test("manual row states use exact markup tokens and no new semantic color", () => {
  const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");
  assert.match(css, /--ladder-atm:\s*#ff9f0a/);
  assert.match(css, /--ladder-buy:\s*#34d399/);
  assert.match(css, /--ladder-sell:\s*#f87171/);
  assert.match(css, /\.nifty-axis-ladder__row\.is-atm[\s\S]*?var\(--ladder-atm\)/);
  assert.match(css, /\.nifty-axis-ladder__row\.is-buy[\s\S]*?var\(--ladder-buy\)/);
  assert.match(css, /\.nifty-axis-ladder__row\.is-sell[\s\S]*?var\(--ladder-sell\)/);
});

test("entry faces contain no redundant trade words or icon", () => {
  const source = fs.readFileSync(path.join(__dirname, "manual-ui.js"), "utf8");
  assert.doesNotMatch(source, /SELL C|BUY C|SELL P|BUY P|↻/);
  assert.match(source, /×\$\{active\.lots\}/);
});
```

- [ ] **Step 2: Run contracts and verify token failures**

Run: `node --test extension-axis-ladder/content-contract.test.cjs extension-axis-ladder/scaffold.test.cjs`
Expected: FAIL until exact variables, row classes, accessible names, and `0.5.0` contract are present.

- [ ] **Step 3: Add final CSS states**

```css
#nifty-axis-ladder {
  --ladder-atm: #ff9f0a;
  --ladder-atm-ink: #1b1d22;
  --ladder-buy: #34d399;
  --ladder-buy-ink: #063d2d;
  --ladder-sell: #f87171;
  --ladder-sell-ink: #1b1d22;
}
.nifty-axis-ladder__row.is-atm { background: var(--ladder-atm); color: var(--ladder-atm-ink); }
.nifty-axis-ladder__row.is-manual-entry.is-buy { background: var(--ladder-buy); color: var(--ladder-buy-ink); }
.nifty-axis-ladder__row.is-manual-entry.is-sell { background: var(--ladder-sell); color: var(--ladder-sell-ink); }
```

Entry classes override ATM only while flipped. Returning to live restores orange ATM. Count dot uses black/white. Editor stays compact, extends left, and never changes y-coordinate or lane connector.

- [ ] **Step 4: Add accessible names and keyboard editor action**

Live accessible name includes Call, Put, strike, and saved-entry count. Entry accessible name adds direction, traded type, lots, snapshot values, and cycle position. Use `Shift+Enter` on focused row to open editor; `Enter` and `Space` retain single-click behavior; `Escape` cancels editor or returns live.

- [ ] **Step 5: Update release metadata and docs**

Set manifest version and scaffold expectation to `0.5.0`. Document:

- double click to add;
- Call/Put staged menu;
- lots and editable premium;
- count dot meaning;
- black live vs orange ATM vs green Buy vs red Sell;
- click-to-flip and multiple-entry cycle;
- exact combined expiry break-even meaning;
- manual refresh changes live values only;
- no broker import or order placement.

- [ ] **Step 6: Run syntax checks and complete suite**

```bash
node --check extension-axis-ladder/manual-plan.js
node --check extension-axis-ladder/manual-payoff.js
node --check extension-axis-ladder/manual-interaction.js
node --check extension-axis-ladder/manual-ui.js
node --check extension-axis-ladder/content.js
node --test extension-axis-ladder/*.test.cjs data-bridge/*.test.js
git diff --check
```

Expected: all checks PASS; existing broker/side-panel tests make no extra request; `.superpowers/brainstorm/` remains untracked.

- [ ] **Step 7: Run browser acceptance checks**

On NIFTY TradingView tab with cached option numbers:

1. Confirm ATM live row is exact orange and every other live row black.
2. Double-click one row; confirm compact editor replaces same row and no quick rails flash.
3. Add Sell Call 1 lot at 24,100 and Sell Put 3 lots at 24,000 using premiums 358 and 183; confirm `PLAN BE 23,698` and `PLAN BE 25,007`.
4. Edit Call lots from 1 to 2; confirm preview and saved rails become `23,578` and `24,733`.
5. Confirm count dots appear; black rows flip to exact red snapshots and back.
6. Add Buy entry; confirm exact green snapshot.
7. Refresh option numbers; confirm black values may change while entry snapshots stay fixed.
8. Change timeframe, zoom, pan, and reload; confirm plan and native-axis rails restore.
9. Remove exact entry; confirm count and combined rails update without affecting another strike.

- [ ] **Step 8: Commit candidate release**

```bash
git add README.md extension-axis-ladder/README.md extension-axis-ladder/manifest.json extension-axis-ladder/overlay.css extension-axis-ladder/content-contract.test.cjs extension-axis-ladder/scaffold.test.cjs
git commit -m "chore: prepare manual strategy builder 0.5.0"
```

---

## Final Review Gate

- [ ] Confirm every spec section maps to Tasks 1–7.
- [ ] Confirm no broker position, tradebook, order, auto-refresh, bottom-tray, or recommendation path changed.
- [ ] Confirm every new module has direct unit coverage plus content integration coverage.
- [ ] Confirm approved break-even examples pass exactly after display rounding.
- [ ] Confirm only exact markup orange, green, and red were introduced for new persistent row states.
- [ ] Confirm manual plan survives refresh/reload and fails closed on malformed storage or invalid axis.
- [ ] Confirm `.superpowers/brainstorm/` remains untracked and unstaged.
