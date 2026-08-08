# Chart Strategy Grouping and Versioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace one flat expiry plan with multiple user-owned option strategies, chart-native square selection, temporary combined preview, atomic merge/split/restore versions, and archived/expired ledger history.

**Architecture:** Preserve existing manual leg editor and payoff math, then add four focused modules: immutable strategy/version storage, charge-aware combined preview, chart selection/layout state, and side-panel management. `content.js` renders chart behavior from validated store state; service worker owns atomic mutations; `popup.js` delegates permanent management to a pure side-panel controller.

**Tech Stack:** Chrome Extension Manifest V3, vanilla JavaScript IIFEs/CommonJS exports, `chrome.storage.local`, DOM/CSS overlay, Node built-in `node:test`, existing TradingView native-axis map.

## Global Constraints

- Core logic must work for any supported optionable instrument; NIFTY is current test fixture only.
- One active leg ID belongs to one active strategy.
- Same contract/strike may occur in multiple distinct legs with different entry evidence.
- Strategy contains one instrument and one exact expiry.
- Chart label click opens positions/P&L; adjacent square controls preview. No strategy control uses double-click.
- Selected square uses existing Markup green. No circular dot and no new semantic color.
- Two or more selected strategies show combined rails only by default; Compare reveals originals.
- Break-even rails never move. Off-screen roots use truthful `↑`/`↓` edge markers. Colliding cards stack with connectors.
- Structural changes create immutable versions. Live quote changes do not.
- Merge archives source strategies only after atomic destination commit. Restore creates new version.
- Expired strategies move to Ledger History and remain fully viewable.
- Known charges affect payoff; missing charges display `EXCLUDING UNKNOWN CHARGES` and are never guessed.
- Refresh remains explicit/manual. Broker access remains read-only with zero order/write calls.
- Premium-increase alerts remain outside this plan.
- Candidate extension version is exactly `0.6.0`; minimum Chrome remains `141`; no runtime dependency is added.
- Existing uncommitted `axis-observer.js` and `axis-observer.test.cjs` changes must remain preserved and unstaged until their own commit.

---

## File Structure

### Create

- `extension-axis-ladder/strategy-store.js` — schema, migration, immutable versions, ownership, archive, expiry, merge/split/restore.
- `extension-axis-ladder/strategy-store.test.cjs` — model, migration, atomicity, history, and universal-instrument tests.
- `extension-axis-ladder/strategy-preview.js` — compatible selection, charge-aware payoff, preview state, labels.
- `extension-axis-ladder/strategy-preview.test.cjs` — combined economics, mismatch, missing-data, and Compare tests.
- `extension-axis-ladder/strategy-chart.js` — independent label/square actions, synchronized selection, edge markers, collision layout.
- `extension-axis-ladder/strategy-chart.test.cjs` — interaction and geometry tests.
- `extension-axis-ladder/strategy-panel.js` — pure permanent-management view model and mutation builders.
- `extension-axis-ladder/strategy-panel.test.cjs` — save destination, archive/history, split, restore, and expiry view tests.

### Modify

- `extension-axis-ladder/manifest.json` — load strategy modules before `content.js`; bump release version to `0.6.0`.
- `extension-axis-ladder/background.js` — atomic strategy mutation queue and manual-plan migration.
- `extension-axis-ladder/content.js` — ownership prompt, strategy rails, squares, preview, Compare, details, storage lifecycle.
- `extension-axis-ladder/overlay.css` — square, stacked cards/connectors, edge markers, preview/details UI in both themes.
- `extension-axis-ladder/popup.html` — strategy manager and Ledger History section.
- `extension-axis-ladder/popup.js` — bind side-panel controller and persist permanent operations.
- `extension-axis-ladder/popup.css` — existing ARB Desk tokens for strategy manager.
- `extension-axis-ladder/scaffold.test.cjs` — module order and release contract.
- `extension-axis-ladder/capture-contract.test.cjs` — background atomic mutations and migration.
- `extension-axis-ladder/content-contract.test.cjs` — full chart behavior.
- `extension-axis-ladder/popup-contract.test.cjs` — side-panel workflow.
- `extension-axis-ladder/README.md` — operator workflow and failure states.
- `README.md` — release summary and universal boundary.
- `memory/DECISIONS.md`, `memory/PROGRESS.md`, `memory/LATEST_SEED.md` — final approved behavior and checkpoint.

---

### Task 1: Immutable Universal Strategy Store

**Files:**
- Create: `extension-axis-ladder/strategy-store.js`
- Create: `extension-axis-ladder/strategy-store.test.cjs`

**Interfaces:**
- Produces `STORAGE_KEY = "strategyBook"`, `emptyBook()`, `normalizeBook(input)`, `migrateManualPlans(store, options)`, `activeStrategies(book, instrumentKey, expiry)`, `strategyById(book, id)`, `legsForStrategy(book, id, versionId?)`, `applyCommand(book, command, now)`.
- `applyCommand` accepts `CREATE_STRATEGY`, `ADD_LEG`, `EDIT_LEG`, `REMOVE_LEG`, `MERGE_STRATEGIES`, `SPLIT_STRATEGY`, `RESTORE_VERSION`, `ARCHIVE_STRATEGY`, `EXPIRE_DUE`, and one-time `MIGRATE_LEGACY_PLAN`.
- Book shape: `{ version: 1, nextSequence, legs, strategies, versions, quarantine, appliedCommands }`.

- [ ] **Step 1: Write failing store and migration tests**

```js
test("distinct same-contract legs keep unique ownership", () => {
  let book = store.emptyBook();
  book = store.applyCommand(book, create("cmd-1", "T1"), NOW);
  book = store.applyCommand(book, add("cmd-2", "strategy-1", leg("leg-1", 100, NOW)), NOW);
  book = store.applyCommand(book, add("cmd-3", "strategy-1", leg("leg-2", 120, LATER)), LATER);
  assert.deepEqual(store.legsForStrategy(book, "strategy-1").map(x => x.id), ["leg-1", "leg-2"]);
});

test("one leg id cannot join two active strategies", () => {
  const seeded = twoStrategiesWithOwnedLeg();
  assert.throws(() => store.applyCommand(seeded, add("cmd-x", "strategy-2", leg("leg-1")), NOW), /already belongs/i);
});

test("merge archives sources only after destination version exists", () => {
  const merged = store.applyCommand(twoStrategies(), mergeCommand(), NOW);
  assert.equal(store.strategyById(merged, "strategy-1").status, "ARCHIVED");
  assert.equal(store.strategyById(merged, "strategy-2").status, "ARCHIVED");
  assert.equal(store.strategyById(merged, "strategy-3").status, "ACTIVE");
  assert.ok(merged.versions[store.strategyById(merged, "strategy-3").currentVersionId]);
});

test("same command id is idempotent", () => {
  const once = store.applyCommand(store.emptyBook(), create("same", "T1"), NOW);
  assert.deepEqual(store.applyCommand(once, create("same", "T1"), NOW), once);
});
```

- [ ] **Step 2: Run focused tests; verify module missing**

Run: `node --test extension-axis-ladder/strategy-store.test.cjs`  
Expected: FAIL with `Cannot find module './strategy-store.js'`.

- [ ] **Step 3: Implement schema, immutable commands, and migration**

Use clone-on-write normalization. Validate universal identity with non-empty `instrumentKey`, `underlying`, ISO expiry/timestamps, finite positive strike/lots, finite non-negative premium/charges. Command handler first checks `appliedCommands[command.id]`, validates full candidate, then returns candidate; thrown error returns no partial state.

```js
function applyCommand(input, command, now = new Date().toISOString()) {
  const book = normalizeBook(input);
  if (book.appliedCommands[command.id]) return book;
  const next = clone(book);
  COMMANDS[command.type](next, command, now);
  assertOwnership(next);
  next.appliedCommands[command.id] = now;
  return normalizeBook(next);
}
```

Migration creates one strategy for each legacy expiry, assigns every valid legacy entry a unique leg, preserves entry snapshots, and marks operation `MIGRATE_LEGACY_PLAN`. Use provided `instrumentKey`/`underlying` options; never hard-code membership logic around NIFTY.

- [ ] **Step 4: Run store tests**

Run: `node --test extension-axis-ladder/strategy-store.test.cjs`  
Expected: PASS.

- [ ] **Step 5: Commit store model**

```bash
git add extension-axis-ladder/strategy-store.js extension-axis-ladder/strategy-store.test.cjs
git commit -m "feat: add immutable strategy version store"
```

---

### Task 2: Charge-Aware Combined Preview

**Files:**
- Create: `extension-axis-ladder/strategy-preview.js`
- Create: `extension-axis-ladder/strategy-preview.test.cjs`
- Modify: `extension-axis-ladder/manual-payoff.js`
- Modify: `extension-axis-ladder/manual-payoff.test.cjs`

**Interfaces:**
- Consumes `strategy-store.js` and existing exact payoff solver.
- Produces `createSelection()`, `toggle(selection, strategyId)`, `buildPreview(book, selectedIds, quoteRows, options)`, `displayLevels(preview, prefix = "COMBINED BE")`.
- Preview shape: `{ status, selectedIds, instrumentKey, expiry, entries, knownCharges, chargesComplete, pnl, breakEvens, compare }`.

- [ ] **Step 1: Write failing charge, compatibility, and stale tests**

```js
test("known charges shift combined break-even", () => {
  const plain = preview.buildPreview(book({ charges: 0 }), ["s1", "s2"], quotes());
  const charged = preview.buildPreview(book({ charges: 100 }), ["s1", "s2"], quotes());
  assert.notDeepEqual(charged.breakEvens, plain.breakEvens);
  assert.equal(charged.knownCharges, 100);
});

test("mixed instrument or expiry fails closed", () => {
  assert.equal(preview.buildPreview(mixedBook(), ["s1", "s2"], quotes()).status, "INCOMPATIBLE");
});

test("missing required quote reports incomplete without false roots", () => {
  const result = preview.buildPreview(book(), ["s1", "s2"], []);
  assert.equal(result.status, "INCOMPLETE");
  assert.deepEqual(result.breakEvens, []);
});
```

- [ ] **Step 2: Run tests; verify failure**

Run: `node --test extension-axis-ladder/strategy-preview.test.cjs extension-axis-ladder/manual-payoff.test.cjs`  
Expected: new tests FAIL before implementation.

- [ ] **Step 3: Extend payoff math and implement preview**

Represent total known charges as fixed negative payoff cash flow, not fabricated premium. Preserve every exact zero crossing. `positionPnl` subtracts known charges once. Missing charges set `chargesComplete: false` and disclosure; missing current quote sets `INCOMPLETE` and no current P&L/roots publication.

```js
const netPayoffAt = (entries, price, charges = 0) => payoff.payoffAt(entries, price) - charges;
function buildPreview(book, ids, quoteRows, options = {}) {
  const strategies = ids.map(id => store.strategyById(book, id)).filter(Boolean);
  if (strategies.length < 2) return { status: "SELECT_MORE", selectedIds: ids, breakEvens: [] };
  if (!compatible(strategies)) return { status: "INCOMPATIBLE", selectedIds: ids, breakEvens: [] };
  return calculate(strategies, quoteRows, options);
}
```

- [ ] **Step 4: Run preview/payoff tests**

Run: `node --test extension-axis-ladder/strategy-preview.test.cjs extension-axis-ladder/manual-payoff.test.cjs`  
Expected: PASS.

- [ ] **Step 5: Commit preview engine**

```bash
git add extension-axis-ladder/strategy-preview.js extension-axis-ladder/strategy-preview.test.cjs extension-axis-ladder/manual-payoff.js extension-axis-ladder/manual-payoff.test.cjs
git commit -m "feat: calculate combined strategy previews"
```

---

### Task 3: Chart Selection and Break-Even Layout Module

**Files:**
- Create: `extension-axis-ladder/strategy-chart.js`
- Create: `extension-axis-ladder/strategy-chart.test.cjs`

**Interfaces:**
- Produces `createController(options)`, `projectBreakEven(exact, axisMap)`, `stackCards(cards, options)`, `accessibleLabel(model)`.
- Controller callbacks: `onOpen(strategyId)`, `onSelection(selectedIds)`, `onCompare(boolean)`, `onClear()`.

- [ ] **Step 1: Write failing independent-action and geometry tests**

```js
test("label opens details without toggling selection", () => {
  const events = []; const c = chart.createController(spy(events));
  c.label("s1");
  assert.deepEqual(events, [["open", "s1"]]);
  assert.deepEqual(c.selected(), []);
});

test("any square synchronizes whole strategy selection", () => {
  const c = chart.createController(spy([]));
  c.square("s1");
  assert.equal(c.isSelected("s1"), true);
  c.square("s1");
  assert.equal(c.isSelected("s1"), false);
});

test("off-screen roots become truthful edge markers", () => {
  assert.deepEqual(chart.projectBreakEven(25420, map(23000, 25000)), { mode: "EDGE", edge: "TOP", arrow: "↑", exact: 25420 });
});

test("stacking moves cards but never rails", () => {
  const result = chart.stackCards([{ id:"a", railY:100, height:28 }, { id:"b", railY:108, height:28 }], { gap:6, minY:0, maxY:300 });
  assert.deepEqual(result.map(x => x.railY), [100, 108]);
  assert.ok(result[1].cardY - result[0].cardY >= 34);
});
```

- [ ] **Step 2: Run tests; verify failure**

Run: `node --test extension-axis-ladder/strategy-chart.test.cjs`  
Expected: FAIL before module exists.

- [ ] **Step 3: Implement controller, edge projection, and deterministic stacking**

Controller exposes separate methods for label and square; no timer or double-click path. `projectBreakEven` returns `RAIL`, `EDGE/TOP`, or `EDGE/BOTTOM`. `stackCards` sorts by railY, packs with minimum gap, shifts group inside plot bounds, and returns connector start/end while retaining immutable `railY`.

- [ ] **Step 4: Run chart module tests**

Run: `node --test extension-axis-ladder/strategy-chart.test.cjs`  
Expected: PASS.

- [ ] **Step 5: Commit chart module**

```bash
git add extension-axis-ladder/strategy-chart.js extension-axis-ladder/strategy-chart.test.cjs
git commit -m "feat: add chart strategy selection layout"
```

---

### Task 4: Atomic Service-Worker Strategy Mutations and Migration

**Files:**
- Modify: `extension-axis-ladder/manifest.json`
- Modify: `extension-axis-ladder/background.js`
- Modify: `extension-axis-ladder/capture-contract.test.cjs`
- Modify: `extension-axis-ladder/scaffold.test.cjs`

**Interfaces:**
- Message `MUTATE_STRATEGY_BOOK` with one command from Task 1.
- Message `MIGRATE_MANUAL_PLANS` with `{ instrumentKey, underlying }`.
- Response `{ ok: true, strategyBook }` or `{ ok: false, error }`.

- [ ] **Step 1: Add failing background contracts**

Test authorized TradingView sender, rejected foreign sender, serialized concurrent commands, idempotent duplicate command, storage failure preserving prior book, and one-time legacy migration.

```js
const [a, b] = await Promise.all([
  h.message({ type:"MUTATE_STRATEGY_BOOK", command:create("a") }),
  h.message({ type:"MUTATE_STRATEGY_BOOK", command:create("b") })
]);
assert.equal(a.ok && b.ok, true);
assert.equal(Object.keys(h.local.strategyBook.strategies).length, 2);
```

- [ ] **Step 2: Run focused background tests; verify failure**

Run: `node --test extension-axis-ladder/capture-contract.test.cjs extension-axis-ladder/scaffold.test.cjs`  
Expected: new strategy contracts FAIL.

- [ ] **Step 3: Load modules and implement queued atomic commit**

Import `strategy-store.js` after `manual-plan.js`. Add `strategy-store.js`, `strategy-preview.js`, and `strategy-chart.js` to content script order before `content.js`; set manifest version `0.6.0`. Use separate `strategyMutationTail`. Read current storage inside queued commit, apply pure command, write once, return normalized result. Migration writes strategy book only after full conversion succeeds and preserves legacy `manualPlans` for rollback.

- [ ] **Step 4: Run background/scaffold tests**

Run: `node --test extension-axis-ladder/capture-contract.test.cjs extension-axis-ladder/scaffold.test.cjs`  
Expected: PASS.

- [ ] **Step 5: Commit background integration**

```bash
git add extension-axis-ladder/manifest.json extension-axis-ladder/background.js extension-axis-ladder/capture-contract.test.cjs extension-axis-ladder/scaffold.test.cjs
git commit -m "feat: persist atomic strategy mutations"
```

---

### Task 5: Chart Ownership, Squares, Preview, Edge Markers, and Collisions

**Files:**
- Modify: `extension-axis-ladder/content.js`
- Modify: `extension-axis-ladder/overlay.css`
- Modify: `extension-axis-ladder/content-contract.test.cjs`

**Interfaces:**
- Consumes strategy store, preview, and chart modules.
- Emits `MUTATE_STRATEGY_BOOK` commands.
- Renders `#nifty-strategy-rails`, `.nifty-strategy__label`, `.nifty-strategy__selector`, `.nifty-strategy__connector`, `.nifty-strategy__edge`, `.nifty-strategy-preview`.

- [ ] **Step 1: Add failing chart contracts**

Cover:

- every new saved leg asks `ADD TO T1` or `CREATE NEW STRATEGY` before mutation;
- label click opens same-strategy P&L disclosure;
- square click only changes preview selection;
- all same-strategy squares synchronize;
- two selected strategies show combined rails and hide originals;
- Compare reveals originals;
- refresh/expiry/instrument/reload clears preview only;
- top/bottom edge markers retain label and square actions;
- overlapping cards stack with connector and exact rail coordinate;
- light/dark square uses existing tokens;
- existing ladder double-click editor still works.

- [ ] **Step 2: Run content tests; verify failure**

Run: `node --test extension-axis-ladder/content-contract.test.cjs`  
Expected: new strategy contracts FAIL.

- [ ] **Step 3: Integrate strategy state and ownership prompt**

Add `strategyBook` to defaults, migrate only when absent, and keep legacy plan readable until successful migration. Saving editor draft first opens compact ownership chooser anchored to editor. Only explicit choice sends command.

- [ ] **Step 4: Render exact strategy/preview layers**

Use chart module projection and stacking results. Rail stays at `railY`; card uses `cardY`; connector spans between them. Edge labels include exact price and arrow. Strategy details disclosure reuses existing black card and invariant green/red P&L tokens.

- [ ] **Step 5: Add CSS with existing variables only**

```css
.nifty-strategy__selector { width:16px; height:16px; border:2px solid var(--plan-surface); background:var(--chart-surface); }
.nifty-strategy__selector[aria-pressed="true"] { background:var(--pnl-profit); box-shadow:inset 0 0 0 2px var(--plan-surface); }
.nifty-strategy__connector { position:absolute; border-left:1px solid var(--ladder-line); }
```

No new hex color may appear outside existing token definitions.

- [ ] **Step 6: Run content tests**

Run: `node --test extension-axis-ladder/content-contract.test.cjs extension-axis-ladder/strategy-chart.test.cjs extension-axis-ladder/strategy-preview.test.cjs`  
Expected: PASS.

- [ ] **Step 7: Commit chart integration**

```bash
git add extension-axis-ladder/content.js extension-axis-ladder/overlay.css extension-axis-ladder/content-contract.test.cjs
git commit -m "feat: preview grouped strategies on chart"
```

---

### Task 6: Side-Panel Permanent Management and Ledger History

**Files:**
- Create: `extension-axis-ladder/strategy-panel.js`
- Create: `extension-axis-ladder/strategy-panel.test.cjs`
- Modify: `extension-axis-ladder/popup.html`
- Modify: `extension-axis-ladder/popup.js`
- Modify: `extension-axis-ladder/popup.css`
- Modify: `extension-axis-ladder/popup-contract.test.cjs`

**Interfaces:**
- Produces `viewModel(book, activeContext)`, `saveChoices(book, selectedIds)`, `commandForSave(input)`, `commandForSplit(input)`, `commandForRestore(input)`, `historyRows(book)`.
- Side panel sends same atomic service-worker command interface as chart.

- [ ] **Step 1: Write failing pure panel tests**

```js
test("save always requires create-new or explicit destination", () => {
  assert.deepEqual(panel.saveChoices(book, ["s1", "s2"]).map(x => x.kind), ["CREATE_NEW", "MERGE_INTO"]);
  assert.throws(() => panel.commandForSave({ selectedIds:["s1","s2"] }), /destination/i);
});

test("history includes merged-source and expired strategies", () => {
  assert.deepEqual(panel.historyRows(historyBook()).map(x => x.status), ["ARCHIVED", "EXPIRED"]);
});
```

- [ ] **Step 2: Run panel tests; verify failure**

Run: `node --test extension-axis-ladder/strategy-panel.test.cjs`  
Expected: FAIL before module exists.

- [ ] **Step 3: Implement pure panel model and command builders**

Builders validate explicit destination, selected IDs, leg IDs, and version IDs before returning command. They never mutate store directly.

- [ ] **Step 4: Add ARB Desk side-panel UI**

Load `strategy-store.js` and `strategy-panel.js` from `popup.html` before `popup.js`. Add active-strategy selector, selected-preview summary, Save action, explicit Create New/Merge Into decision, version list, Split, Restore, Archive, and Ledger History. Reuse existing fonts, radii, borders, shadows, icons, light/dark tokens, and profit/loss colors. No new logo or extra color.

- [ ] **Step 5: Run panel contracts**

Run: `node --test extension-axis-ladder/strategy-panel.test.cjs extension-axis-ladder/popup-contract.test.cjs`  
Expected: PASS.

- [ ] **Step 6: Commit side-panel manager**

```bash
git add extension-axis-ladder/strategy-panel.js extension-axis-ladder/strategy-panel.test.cjs extension-axis-ladder/popup.html extension-axis-ladder/popup.js extension-axis-ladder/popup.css extension-axis-ladder/popup-contract.test.cjs
git commit -m "feat: manage strategy versions in side panel"
```

---

### Task 7: Expiry Lifecycle, Last Selection, and Failure Gates

**Files:**
- Modify: `extension-axis-ladder/strategy-store.js`
- Modify: `extension-axis-ladder/strategy-store.test.cjs`
- Modify: `extension-axis-ladder/content.js`
- Modify: `extension-axis-ladder/popup.js`
- Modify: `extension-axis-ladder/content-contract.test.cjs`
- Modify: `extension-axis-ladder/popup-contract.test.cjs`

**Interfaces:**
- Persist `lastSelectedStrategyByContext` keyed by `instrumentKey|expiry`.
- Dispatch `EXPIRE_DUE` after loading book and when exact expiry changes.

- [ ] **Step 1: Add failing lifecycle and failure tests**

Test automatic expiry to history, last active strategy restore, invalid raw evidence quarantine, stale quote disclosure, axis concealment without mutation, duplicate Save idempotency, and storage failure retaining preview/current version.

- [ ] **Step 2: Run lifecycle tests; verify failure**

Run: `node --test extension-axis-ladder/strategy-store.test.cjs extension-axis-ladder/content-contract.test.cjs extension-axis-ladder/popup-contract.test.cjs`  
Expected: new lifecycle tests FAIL.

- [ ] **Step 3: Implement lifecycle gates**

Expiry comparison uses exact ISO expiry date in exchange-local business context already used by expiry utilities. `EXPIRE_DUE` is idempotent. Last-selection pointer restores only active compatible strategy; otherwise first compatible active strategy or null.

- [ ] **Step 4: Run lifecycle tests**

Run: `node --test extension-axis-ladder/strategy-store.test.cjs extension-axis-ladder/content-contract.test.cjs extension-axis-ladder/popup-contract.test.cjs`  
Expected: PASS.

- [ ] **Step 5: Commit lifecycle**

```bash
git add extension-axis-ladder/strategy-store.js extension-axis-ladder/strategy-store.test.cjs extension-axis-ladder/content.js extension-axis-ladder/popup.js extension-axis-ladder/content-contract.test.cjs extension-axis-ladder/popup-contract.test.cjs
git commit -m "feat: preserve strategy lifecycle and history"
```

---

### Task 8: Documentation, Full Regression, Chrome End-to-End, and Checkpoint

**Files:**
- Modify: `extension-axis-ladder/README.md`
- Modify: `README.md`
- Modify: `memory/DECISIONS.md`
- Modify: `memory/PROGRESS.md`
- Modify: `memory/LATEST_SEED.md`

- [ ] **Step 1: Update operator documentation**

Document label versus square actions, ownership prompt, temporary Preview/Compare, permanent Save choices, off-screen arrows, collision connectors, version history, Ledger History, charge disclosure, manual refresh, and zero-order boundary.

- [ ] **Step 2: Run focused new suites**

Run:

```bash
node --test extension-axis-ladder/strategy-store.test.cjs extension-axis-ladder/strategy-preview.test.cjs extension-axis-ladder/strategy-chart.test.cjs extension-axis-ladder/strategy-panel.test.cjs
```

Expected: PASS.

- [ ] **Step 3: Run full extension and bridge suite**

Run:

```bash
node --test extension-axis-ladder/*.test.cjs data-bridge/*.test.js
```

Expected: all tests PASS with zero skipped unexpected failures.

- [ ] **Step 4: Run static checks**

Run:

```bash
node --check extension-axis-ladder/strategy-store.js
node --check extension-axis-ladder/strategy-preview.js
node --check extension-axis-ladder/strategy-chart.js
node --check extension-axis-ladder/strategy-panel.js
node --check extension-axis-ladder/content.js
node --check extension-axis-ladder/popup.js
git diff --check
```

Expected: zero output and exit code 0.

- [ ] **Step 5: Reload extension and run Chrome end-to-end**

Verify on live TradingView:

1. Existing ladder follows axis at fine and coarse zoom.
2. Existing row double-click editor still opens.
3. New leg asks strategy ownership.
4. Build T1/T2 with mixed option structures.
5. Label opens correct strategy P&L; square only selects preview.
6. Select T1/T2; combined rails replace originals; Compare restores originals.
7. Zoom root outside range; `↑`/`↓` marker keeps both actions.
8. Force close roots; cards stack and connectors return to exact rails.
9. Save as new strategy; source strategies archive and history remains visible.
10. Restore old version through new current version.
11. Reload page; last active strategy restores.
12. Verify light/dark tokens, unchanged logo, invariant profit/loss colors.
13. Inspect extension errors and console; no runtime error.
14. Confirm no broker write/order request exists.

- [ ] **Step 6: Record memory checkpoint**

Append one numbered decision and progress entry. Set `LATEST_SEED.md` state, next line, memory key, and remaining open questions. Preserve first universal-product rule.

- [ ] **Step 7: Commit final docs/checkpoint**

```bash
git add extension-axis-ladder/README.md README.md memory/DECISIONS.md memory/PROGRESS.md memory/LATEST_SEED.md
git commit -m "docs: ship chart strategy grouping workflow"
```

- [ ] **Step 8: Final clean-state audit**

Run:

```bash
git status --short
git log -8 --oneline
```

Expected: only previously preserved axis-observer changes remain if not committed separately; every strategy feature file is committed.

- [ ] **Step 9: Shutdown gate**

Only after Steps 2–8 succeed: request operating-system shutdown. If any build, test, Chrome, commit, or memory step fails, do not shut down.
