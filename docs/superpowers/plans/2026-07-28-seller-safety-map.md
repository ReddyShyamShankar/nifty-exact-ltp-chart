# Seller Safety Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build read-only Zerodha position import, deterministic current/whole-trade risk calculations, popup risk workflow, and exact-axis TradingView breakeven layers without changing manual option-number refresh behavior.

**Architecture:** Keep financial math in browser-compatible pure modules shared by popup and Node tests. Local bridge owns Zerodha secrets, daily login, read-only positions/trades calls, and existing Upstox chain call. Popup owns local strategy ledger and explicit user allocations; content script receives accepted risk view through Chrome local storage and draws it with existing TradingView axis map.

**Tech Stack:** Chrome Extension Manifest V3, browser JavaScript, Node.js ESM bridge, Node built-in test runner, macOS Keychain via `/usr/bin/security`, native `fetch`, built-in `crypto`.

## Global Constraints

- Preserve `NIFTY Axis LTP Ladder` exact thirteen-row behavior and existing TradingView timeframe, zoom, pan, normal-scale, and inverted-scale placement.
- NIFTY only, Zerodha only, same-expiry strategy groups only.
- One explicit **REFRESH ALL** action may make at most one Zerodha positions request, one Zerodha current-day trades request, and one Upstox chain request.
- Popup opening, timeframe changes, zoom, and pan make no broker or option-chain requests.
- Zerodha integration is read-only: no order placement, modification, cancellation, conversion, or exit request.
- Zerodha API secret and access token stay in local bridge storage; extension receives neither.
- Tradebook, allocations, and timeline stay in `chrome.storage.local`; no cloud upload.
- Current-risk lines are solid mint. Whole-trade lines are dashed graphite. Incomplete or unreconciled data hides affected output instead of guessing.
- Current-risk and whole-trade calculations must not double-count open-leg premium.
- Full option-chain table is removed from popup; existing chart ladder remains option-number surface.
- Financial outputs are deterministic and test-derived. Explanations report facts, never recommendations.
- No background polling or automatic retries after upstream failure.
- Use Node built-ins only; add no runtime package dependency.
- Preserve unrelated user changes. Stage only files named by current task.

---

### Task 1: Deterministic Risk Engine and Change Explainer

**Files:**
- Create: `extension-axis-ladder/seller-risk.js`
- Create: `extension-axis-ladder/seller-risk.test.cjs`

**Interfaces:**
- Produces: `currentRiskMap({ legs, charges? })`, `wholeTradeRiskMap({ openLegs, fills, charges? })`, `payoffAt(mapInput, underlyingPrice)`, `explainRiskChange(previous, next)` on `globalThis.NiftySellerRisk` and `module.exports`.
- `legs`: `{ id, strike, optionType: "CE"|"PE", signedLots, lotSize, entryPrice }[]`; positive lots are long, negative lots are short.
- `fills`: `{ id, transactionType: "BUY"|"SELL", quantity, price }[]`; quantity is contracts, not lots.
- Risk result: `{ status, breakevens, bands, maxProfit, maxLoss, upsideUnbounded, downsideValue, cashBalance, segments }`.

- [ ] **Step 1: Write failing risk-engine tests**

Add literal, hand-derived cases:

```js
test("calculates user short-option fixture without double counting", () => {
  const result = risk.currentRiskMap({ legs: [
    { id: "c", strike: 24100, optionType: "CE", signedLots: -2, lotSize: 65, entryPrice: 358.80 },
    { id: "p", strike: 24100, optionType: "PE", signedLots: -1, lotSize: 65, entryPrice: 315.45 },
    { id: "lp", strike: 22500, optionType: "PE", signedLots: -1, lotSize: 65, entryPrice: 77.80 }
  ] });
  assert.deepEqual(result.breakevens.map((value) => Number(value.toFixed(3))), [22989.150, 24655.425]);
  assert.equal(result.maxProfit, 72205.25);
  assert.equal(result.maxLoss, -Infinity);
  assert.equal(result.upsideUnbounded, true);
});

test("whole trade counts imported open premiums once", () => {
  const result = risk.wholeTradeRiskMap({
    openLegs: [{ id: "c", strike: 24100, optionType: "CE", signedLots: -1, lotSize: 65, entryPrice: 999 }],
    fills: [{ id: "f", transactionType: "SELL", quantity: 65, price: 100 }],
    charges: 0
  });
  assert.deepEqual(result.breakevens, [24200]);
  assert.equal(result.cashBalance, 6500);
});
```

Also cover bought Put downside cap, short Put downside exposure, zero/one/two/multiple roots, separated profit bands, right-tail bounded/unbounded state, `S >= 0`, charges once, invalid legs, and factual change explanations.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test extension-axis-ladder/seller-risk.test.cjs`

Expected: FAIL because `seller-risk.js` does not exist.

- [ ] **Step 3: Implement minimal pure risk engine**

Use piecewise-linear payoff over domain `S >= 0`. Derive intervals from sorted unique strikes plus right tail. Solve roots from each segment, deduplicate within `1e-7`, classify every interval by midpoint payoff, evaluate finite extrema at zero and strikes, and derive tail infinity from final slope. `wholeTradeRiskMap` uses fill cash balance plus open expiry settlement only; it must not add `entryPrice` cash flows again.

`explainRiskChange` returns facts shaped as:

```js
{
  breakevenMoves: [{ index: 0, from: 23000, to: 22900, points: -100 }],
  maxProfitChange: 6500,
  maxLossStateChanged: false,
  upsideTailChanged: true,
  facts: ["Upper breakeven moved 100.00 points lower."]
}
```

- [ ] **Step 4: Run focused and full tests**

Run: `node --test extension-axis-ladder/seller-risk.test.cjs`

Expected: all risk tests PASS, no warnings.

Run: `node --test extension-axis-ladder/*.test.cjs data-bridge/*.test.js`

Expected: full suite PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add extension-axis-ladder/seller-risk.js extension-axis-ladder/seller-risk.test.cjs
git commit -m "feat(risk): add deterministic seller payoff engine"
```

### Task 2: Local Strategy Ledger and Zerodha Tradebook Import

**Files:**
- Create: `extension-axis-ladder/seller-ledger.js`
- Create: `extension-axis-ladder/seller-ledger.test.cjs`
- Create: `extension-axis-ladder/tradebook-csv.js`
- Create: `extension-axis-ladder/tradebook-csv.test.cjs`

**Interfaces:**
- Produces from `NiftySellerLedger`: `emptyLedger()`, `createStrategy(ledger, input)`, exact-expiry `reconcilePositions(ledger, positions, { expiry })`, `allocateLots(ledger, input)`, `stageTradebookImport(ledger, input)`, `assignFillQuantity(ledger, input)`, `confirmHistoryCoverage(ledger, input)`, `acceptSnapshot(ledger, input)`, and `strategyRiskInput(ledger, strategyId)`.
- Produces from `NiftyTradebookCsv`: `parseTradebookCsv(text)`, `tradeFingerprint(trade)`.
- Position: `{ contractId, tradingsymbol, expiry, strike, optionType, signedQuantity, lotSize, averagePrice, lastPrice, pnl }`.
- Ledger is JSON-serializable, versioned, append-oriented, and immutable-by-return-value.

- [ ] **Step 1: Write failing ledger and CSV tests**

Cover:

```js
test("changed broker quantity enters review without mutating accepted allocation", () => {
  const reviewed = ledger.reconcilePositions(existingLedger, [{
    contractId: "NFO:NIFTY:2026-08-25:24100:CE", signedQuantity: -130, lotSize: 65,
    expiry: "2026-08-25", strike: 24100, optionType: "CE", averagePrice: 358.8
  }]);
  assert.equal(reviewed.reviewChanges.length, 1);
  assert.equal(reviewed.strategies[0].allocations[0].signedLots, -1);
});

test("rejects allocation that exceeds or reverses broker lots", () => {
  assert.throws(() => ledger.allocateLots(reviewLedger, {
    strategyId: "s1", contractId: "c1", signedLots: 2
  }), /direction|available/i);
});
```

CSV tests use quoted commas, BOM, mixed header casing, BUY/SELL normalization, NIFTY-only filtering, duplicate `trade_id`, content fingerprint fallback, malformed-row reasons, and no partial commit when invalid rows exist.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test extension-axis-ladder/seller-ledger.test.cjs extension-axis-ladder/tradebook-csv.test.cjs`

Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement ledger invariants and CSV parser**

Ledger schema:

```js
{
  version: 1,
  strategies: [{ id, name, underlying: "NIFTY", expiry, allocations: [], fillIds: [], snapshots: [] }],
  brokerPositions: [],
  importedTrades: [],
  reviewChanges: [],
  audit: []
}
```

Rules: whole lots only; one expiry per group; sum allocations cannot exceed signed broker lots; direction cannot reverse; ambiguous same-contract split requires explicit fill IDs; new or changed broker quantities remain review state until allocation; original imported rows remain immutable; duplicate IDs/fingerprints are ignored with summary; missing history emits `HISTORY_INCOMPLETE`; missing exact entry allocation emits `ENTRY_HISTORY_INCOMPLETE`.

- [ ] **Step 4: Run focused and full tests**

Run: `node --test extension-axis-ladder/seller-ledger.test.cjs extension-axis-ladder/tradebook-csv.test.cjs`

Expected: PASS.

Run: `node --test extension-axis-ladder/*.test.cjs data-bridge/*.test.js`

Expected: full suite PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add extension-axis-ladder/seller-ledger.js extension-axis-ladder/seller-ledger.test.cjs extension-axis-ladder/tradebook-csv.js extension-axis-ladder/tradebook-csv.test.cjs
git commit -m "feat(ledger): add local strategy history and tradebook import"
```

### Task 3: Read-Only Zerodha Bridge and Coordinated Refresh

**Files:**
- Create: `data-bridge/zerodha-client.js`
- Create: `data-bridge/zerodha-client.test.js`
- Create: `data-bridge/zerodha-session.js`
- Create: `data-bridge/zerodha-session.test.js`
- Create: `data-bridge/zerodha-normalize.js`
- Create: `data-bridge/zerodha-normalize.test.js`
- Modify: `data-bridge/server.js`
- Create: `data-bridge/server.test.js`
- Modify: `bin/nifty-bridge`
- Modify: `data-bridge/bridge-manager.cjs`

**Interfaces:**
- `createZerodhaClient({ apiKey, accessToken, fetchImpl })` exposes only `getPositions()` and `getTrades()`.
- `createZerodhaSessionStore({ readSecret, writeSecret, deleteSecret, now })` exposes `status()`, `loginUrl()`, `exchangeRequestToken(requestToken)`, `credentials()`.
- `normalizeNiftyPositions(payload, expiry)` and `normalizeNiftyTrades(payload, expiry)` produce extension contracts from official responses.
- Local HTTP endpoints: `GET /api/zerodha/status`, `GET /api/zerodha/login-url`, `GET /api/zerodha/callback`, `GET /api/seller-refresh?expiry=YYYY-MM-DD`.

- [ ] **Step 1: Write failing bridge tests**

Use injected fake fetch and secret store. Verify SHA-256 checksum input is exactly `api_key + request_token + api_secret`; auth header is exactly `token api_key:access_token`; only `GET /portfolio/positions` and `GET /trades` exist on client; 401 clears stale access token; callback never returns token; refresh endpoint calls positions, trades, and chain once each; invalid expiry fails before upstream calls; upstream failure returns one error and performs no retry.

Normalization fixtures must cover monthly `NIFTY26AUG24100CE`, weekly symbol matched through supplied expiry hint, NFO-only, NIFTY-only, zero net quantity removal, signed BUY/SELL trades, and lot-size divisibility.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test data-bridge/zerodha-*.test.js data-bridge/server.test.js`

Expected: FAIL because Zerodha modules and endpoints do not exist.

- [ ] **Step 3: Implement secure daily session and read-only client**

Use official flow:

```text
https://kite.zerodha.com/connect/login?v=3&api_key=<public-key>
POST https://api.kite.trade/session/token
GET  https://api.kite.trade/portfolio/positions
GET  https://api.kite.trade/trades
Authorization: token <api-key>:<access-token>
X-Kite-Version: 3
```

Store API key, API secret, and daily access token in separate macOS Keychain services. Extension receives status, normalized positions, normalized trades, and chain only. Access token expiry is next Asia/Kolkata 06:00 and must also fail closed on Zerodha 401.

`bin/nifty-bridge zerodha-setup` prompts for API key and API secret with hidden terminal input and never prints them. `bridge-manager.cjs` passes only Keychain service names into launch-agent environment.

- [ ] **Step 4: Implement coordinated refresh route**

`/api/seller-refresh` validates exact ISO expiry, performs one `Promise.all` over positions, trades, and existing `niftyChain(expiry)`, normalizes Zerodha results, and returns one coherent timestamped payload. It does not cache Zerodha account data across button presses and does not retry. Export request-handler/start functions so tests import server without binding port.

- [ ] **Step 5: Run focused and full tests**

Run: `node --test data-bridge/zerodha-*.test.js data-bridge/server.test.js`

Expected: PASS.

Run: `node --test extension-axis-ladder/*.test.cjs data-bridge/*.test.js`

Expected: full suite PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add data-bridge/zerodha-client.js data-bridge/zerodha-client.test.js data-bridge/zerodha-session.js data-bridge/zerodha-session.test.js data-bridge/zerodha-normalize.js data-bridge/zerodha-normalize.test.js data-bridge/server.js data-bridge/server.test.js bin/nifty-bridge data-bridge/bridge-manager.cjs
git commit -m "feat(bridge): add read-only Zerodha refresh"
```

### Task 4: Seller Safety Popup Workflow

**Files:**
- Modify: `extension-axis-ladder/popup.html`
- Modify: `extension-axis-ladder/popup.css`
- Modify: `extension-axis-ladder/popup.js`
- Modify: `extension-axis-ladder/popup-contract.test.cjs`
- Create: `extension-axis-ladder/popup-view.js`
- Create: `extension-axis-ladder/popup-view.test.cjs`
- Modify: `extension-axis-ladder/manifest.json`

**Interfaces:**
- `NiftySellerPopupView.buildView({ ledger, selectedStrategyId, brokerStatus, chain, now })` returns display-ready values and priority state.
- Popup persists `sellerSafetyLedger`, `selectedStrategyId`, and `sellerSafetyView` in `chrome.storage.local`.
- Popup sends one manual refresh request to `/api/seller-refresh?expiry=...` and no direct Upstox or Zerodha request.

- [ ] **Step 1: Write failing popup behavior tests**

Tests must prove:

- **REFRESH ALL** appears in header before risk content and remains visible without scrolling.
- No full-chain table or `OPEN FULL CHAIN` control remains.
- Popup initialization calls health, expiries, and Zerodha status only; it does not call seller refresh.
- One button press calls `/api/seller-refresh` once.
- New/changed positions render **REVIEW POSITION CHANGES** and do not publish current chart map.
- User can create one-expiry strategy, allocate whole signed lots, import CSV into selected strategy, and explicitly accept snapshot.
- Primary summary shows current lower/upper breakevens, whole-trade lower/upper breakevens, live P&L, max profit/loss, why-moved facts, warning, collapsed legs, and collapsed timeline.
- Missing history shows `HISTORY INCOMPLETE`; stale broker state shows timestamp; auth state shows **CONNECT ZERODHA**.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test extension-axis-ladder/popup-view.test.cjs extension-axis-ladder/popup-contract.test.cjs`

Expected: FAIL because popup view module and required workflow do not exist.

- [ ] **Step 3: Implement popup view model and interactions**

Keep 420-pixel Trading Desk Lite design tokens. Layout order:

```text
NIFTY OPTIONS                         REFRESH ALL
ZERODHA CONNECTED · TODAY             expiry / DTE
CURRENT RISK     lower BE / upper BE
WHOLE TRADE      lower BE / upper BE
LIVE P&L         MAX PROFIT / MAX LOSS
WHY IT MOVED
WARNING
POSITION LEGS ▸
WHOLE-TRADE TIMELINE ▸
ADVANCED · PLACEMENT & HEALTH ▸
```

The selected-strategy control remains visible outside review and restores each strategy’s accepted view. Review provides strategy-name input, per-contract available-lot input, **ALLOCATE LOTS**, CSV staging summary, explicit per-fill quantity/owner controls (including split and unassigned remainder), coverage bounds/checkpoint confirmation, and **ACCEPT REVIEWED SNAPSHOT**. Never auto-assign a fill or infer coverage. Connect button opens the bridge-provided official login URL in a new tab.

After accepted refresh, calculate maps through `NiftySellerRisk`, build explanation against prior accepted snapshot, save `sellerSafetyView`, and leave option-chain rows on chart only.

- [ ] **Step 4: Run focused and full tests**

Run: `node --test extension-axis-ladder/popup-view.test.cjs extension-axis-ladder/popup-contract.test.cjs`

Expected: PASS.

Run: `node --test extension-axis-ladder/*.test.cjs data-bridge/*.test.js`

Expected: full suite PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add extension-axis-ladder/popup.html extension-axis-ladder/popup.css extension-axis-ladder/popup.js extension-axis-ladder/popup-contract.test.cjs extension-axis-ladder/popup-view.js extension-axis-ladder/popup-view.test.cjs extension-axis-ladder/manifest.json
git commit -m "feat(popup): add Seller Safety Map workflow"
```

### Task 5: Exact-Axis TradingView Risk Renderer

**Files:**
- Create: `extension-axis-ladder/risk-overlay.js`
- Create: `extension-axis-ladder/risk-overlay.test.cjs`
- Modify: `extension-axis-ladder/content.js`
- Modify: `extension-axis-ladder/content-contract.test.cjs`
- Modify: `extension-axis-ladder/overlay.css`
- Modify: `extension-axis-ladder/manifest.json`

**Interfaces:**
- `NiftyRiskOverlay.buildRiskLayers(view, toY, plotRect)` returns lines and bands or `{ status, lines: [], bands: [] }` when placement must fail closed.
- Content reads `sellerSafetyView` from `chrome.storage.local`, listens for changes, and redraws from existing axis capture only.
- Risk view: `{ strategyId, expiry, acceptedAt, state, currentRisk, wholeTradeRisk, explanation }`.

- [ ] **Step 1: Write failing renderer tests**

Cover solid current and dashed whole-trade lines, exact y from supplied `toY`, labels for every root, multiple profitable intervals, clipped band geometry, inverted scales, stale/review/history states, strategy-expiry mismatch, non-finite roots, and no network calls during redraw.

Add content contract test proving `sellerSafetyView` storage changes trigger placement only and timeframe/zoom/pan still call no fetch.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test extension-axis-ladder/risk-overlay.test.cjs extension-axis-ladder/content-contract.test.cjs`

Expected: FAIL because renderer does not exist.

- [ ] **Step 3: Implement renderer and content integration**

Create separate `#nifty-seller-risk` root under fixed full-screen overlay. Draw bands behind lines and ladder rows. Use existing native-axis `axisPriceToY`; never derive y from viewport percentages. Current lines use solid mint, whole-trade lines dashed graphite. Labels remain compact near right axis without covering ladder tokens. `REVIEW POSITION CHANGES`, `STALE`, `ENTRY HISTORY INCOMPLETE`, and `HISTORY INCOMPLETE` suppress only affected layers.

Expose latest axis map through controller callback or placement dependency instead of duplicating axis capture. Timeframe, zoom, and pan remap current saved view only.

- [ ] **Step 4: Run focused and full tests**

Run: `node --test extension-axis-ladder/risk-overlay.test.cjs extension-axis-ladder/content-contract.test.cjs`

Expected: PASS.

Run: `node --test extension-axis-ladder/*.test.cjs data-bridge/*.test.js`

Expected: full suite PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add extension-axis-ladder/risk-overlay.js extension-axis-ladder/risk-overlay.test.cjs extension-axis-ladder/content.js extension-axis-ladder/content-contract.test.cjs extension-axis-ladder/overlay.css extension-axis-ladder/manifest.json
git commit -m "feat(chart): render exact-axis seller risk map"
```

### Task 6: End-to-End Contracts, Documentation, and Release Version

**Files:**
- Create: `extension-axis-ladder/seller-safety-integration.test.cjs`
- Modify: `extension-axis-ladder/scaffold.test.cjs`
- Modify: `extension-axis-ladder/manifest.json`
- Modify: `extension-axis-ladder/README.md`
- Modify: `data-bridge/README.md`

**Interfaces:**
- Final extension version: `0.4.0`.
- Final full-suite command: `node --test extension-axis-ladder/*.test.cjs data-bridge/*.test.js`.

- [ ] **Step 1: Write failing end-to-end contract tests**

Simulate one coherent bridge payload for user fixture, reconcile and allocate to one strategy, calculate current map, import fill history, calculate whole-trade map, save risk view, and build chart layers. Assert literal breakevens `22989.15` and `24655.425`, chart line count/style, no token fields in extension payload, no popup chain table, and one refresh path.

Add stale, changed-position, rate-limit, missing-history, and expired-Zerodha scenarios. Each must preserve last evidence while hiding or labeling affected output and must make no automatic retry.

- [ ] **Step 2: Run integration test and verify RED**

Run: `node --test extension-axis-ladder/seller-safety-integration.test.cjs`

Expected: FAIL until final contracts and version are wired.

- [ ] **Step 3: Complete release wiring and docs**

Bump manifest to `0.4.0`. Document:

- Zerodha developer app redirect URL: `http://127.0.0.1:8787/api/zerodha/callback`
- `bin/nifty-bridge zerodha-setup`
- daily **CONNECT ZERODHA** then one **REFRESH ALL**
- one-time historical tradebook CSV import
- manual strategy allocation and review
- solid current versus dashed whole-trade meaning
- `EXCLUDING CHARGES`, `HISTORY GAP`, and stale behavior
- read-only limits and no-order guarantee

- [ ] **Step 4: Run complete verification**

Run: `node --test extension-axis-ladder/*.test.cjs data-bridge/*.test.js`

Expected: all tests PASS, zero failures, zero warnings.

Run: `git diff --check`

Expected: no output.

Run: `node -e 'const m=require("./extension-axis-ladder/manifest.json"); if(m.version!=="0.4.0") process.exit(1)'`

Expected: exit 0.

- [ ] **Step 5: Commit Task 6**

```bash
git add extension-axis-ladder/seller-safety-integration.test.cjs extension-axis-ladder/scaffold.test.cjs extension-axis-ladder/manifest.json extension-axis-ladder/README.md data-bridge/README.md
git commit -m "chore: release Seller Safety Map v0.4.0"
```
