# Premium History Pane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Build read-only premium-history pane for exact option strike and expiry, synchronized with TradingView, with temporary LINES, SPLIT, and FOCUS renderers.

**Architecture:** Local bridge resolves provider contract keys, loads/caches Call, Put, and underlying candles, and returns provider-neutral envelope. Extension builds immutable view model, calculates labelled estimated IV, maps cached points with stable TradingView time-axis evidence, then renders any mode without another request.

**Tech Stack:** Chrome Extension Manifest V3, plain JavaScript UMD modules, Canvas 2D, local Node.js bridge, Upstox Historical Candle Data V3, Node.js node:test.

## Global Constraints

- Architecture supports any optionable instrument; NIFTY is current connector and UAT case only.
- Identity: instrument + exact expiry + strike + option right.
- Call and Put display together for full available contract life, clipped to TradingView visible dates.
- TradingView timeframe controls premium interval. No timeframe-specific strike rule.
- Rightmost strike-number click opens history. Existing row click/double-click remain unchanged.
- LINES default; SPLIT and FOCUS temporary. All modes consume one view model/cache.
- Opening history may fetch. Pan, zoom, hover, and mode switch make zero requests.
- No debugger permission, Auto-fit mutation, synthetic drag, order endpoint, or retry loop.
- Missing candles remain gaps. Never zero-fill, forward-fill, or invent expired history.
- Label always ESTIMATED IV; model and assumptions visible.
- ARB Desk light/dark tokens only. Profit/loss colors retain meanings.
- Preserve unrelated dirty-worktree edits.

## File map

- Create data-bridge/history-cache.js, option-history.js, and tests: cache, identity, provider normalization.
- Modify data-bridge/server.js/server.test.js/README.md: contract keys and /api/option-history.
- Create premium-history-model.js/test: join, DTE, distance, combined premium, markers, clipping.
- Create estimated-iv.js/test: model adapter, bounds, solver, assumption metadata.
- Create time-axis-observer.js/test: TradingView time-label observation and calibration.
- Create premium-history-pane.js/test: controller and LINES/SPLIT/FOCUS renderers.
- Modify manifest.json, background.js, content.js, manual-ui.js/test, overlay.css, contract/theme/performance/screenshot tests, READMEs.

---

### Task 1: Exact identity and history cache

**Files:**
- Create: data-bridge/history-cache.js
- Create: data-bridge/history-cache.test.js
- Create: data-bridge/option-history.js
- Create: data-bridge/option-history.test.js

**Interfaces:**
- Consumes: provider keys and { instrumentKey, expiry, strike, interval, from, to }.
- Produces: normalizeContractRef, historyCacheKey, providerInterval, normalizeProviderCandles, createHistoryCache, createOptionHistoryLoader.

- [ ] **Step 1: Write failing tests**

~~~js
test("identity requires exact expiry strike and provider keys", () => {
  assert.equal(api.normalizeContractRef({ expiry: "2026-08-25", strike: 24400 }), null);
  assert.equal(api.normalizeContractRef({
    provider: "upstox", underlyingKey: "NSE_INDEX|Nifty 50",
    expiry: "2026-08-25", strike: 24400,
    callInstrumentKey: "NSE_FO|C", putInstrumentKey: "NSE_FO|P"
  }).strike, 24400);
});

test("identical range loads once while in flight", async () => {
  let loads = 0;
  const cache = createHistoryCache();
  const load = () => { loads += 1; return Promise.resolve([{ time: "2026-08-01T09:15:00+05:30" }]); };
  await Promise.all([cache.get("key", load), cache.get("key", load)]);
  assert.equal(loads, 1);
});
~~~

Also test failed promise eviction, different-expiry key isolation, supported intervals, ascending candles, OHLC validation, non-negative volume/OI, gaps, and zero-substitution rejection.

- [ ] **Step 2: Run and confirm missing-module failure**

Run: node --test data-bridge/history-cache.test.js data-bridge/option-history.test.js

- [ ] **Step 3: Implement exact public mappings**

~~~js
export function historyCacheKey(request) {
  return [request.provider, request.underlyingKey, request.expiry, request.strike,
    request.interval, request.from, request.to].join("|");
}
export function providerInterval(timeframe) {
  return ({ "1m": ["minutes", 1], "5m": ["minutes", 5], "15m": ["minutes", 15],
    "1h": ["hours", 1], "4h": ["hours", 4], "1D": ["days", 1],
    "1W": ["weeks", 1], "1M": ["months", 1] })[timeframe] || null;
}
~~~

normalizeProviderCandles returns ascending frozen finite OHLC rows. Invalid provider rows become gap metadata, never zero candles.

- [ ] **Step 4: Implement coordinated loader**

createOptionHistoryLoader({ fetchCandles, cache, now }) validates ref/interval then loads callInstrumentKey, putInstrumentKey, underlyingKey using Promise.all. Return frozen { version:1, identity, interval, from, to, call, put, underlying, updatedAt }. No internal retry.

- [ ] **Step 5: Test and commit**

~~~bash
node --test data-bridge/history-cache.test.js data-bridge/option-history.test.js
git add data-bridge/history-cache.js data-bridge/history-cache.test.js data-bridge/option-history.js data-bridge/option-history.test.js
git commit -m "feat: add option history data model"
~~~

---

### Task 2: Bridge keys and read-only endpoint

**Files:**
- Modify: data-bridge/server.js
- Modify: data-bridge/server.test.js
- Modify: data-bridge/README.md

**Interfaces:**
- Consumes: Task 1 createOptionHistoryLoader.
- Produces: chain callInstrumentKey/putInstrumentKey and GET /api/option-history.

- [ ] **Step 1: Add failing tests**

~~~js
test("chain retains exact provider keys", () => {
  const row = formatChainFixture()[0];
  assert.equal(row.callInstrumentKey, "NSE_FO|C");
  assert.equal(row.putInstrumentKey, "NSE_FO|P");
});
test("invalid history request fails before provider call", async () => {
  const response = await extensionFetch(server,
    "/api/option-history?expiry=bad&strike=24400&interval=4h");
  assert.equal(response.status, 400);
  assert.equal(historyLoads, 0);
});
~~~

- [ ] **Step 2: Verify failure**

Run: node --test data-bridge/server.test.js --test-name-pattern="provider keys|history request"

- [ ] **Step 3: Retain keys and expose route**

Chain rows add callInstrumentKey and putInstrumentKey from provider. Route requires exact ISO expiry/from/to, positive strike, supported interval, from <= to. Resolve exact strike from exact-expiry chain. Reject missing/mismatched keys.

Upstox URL builder:

~~~js
function historicalCandleUrl(key, interval, to, from) {
  return UPSTOX_CANDLES_URL + "/" + encodeURIComponent(key) + "/" +
    interval[0] + "/" + interval[1] + "/" + to + "/" + from;
}
~~~

Never log/return bearer token, authorization header, or credential-bearing provider content.

- [ ] **Step 4: Run bridge suite and commit**

~~~bash
node --test data-bridge/*.test.js
git add data-bridge/server.js data-bridge/server.test.js data-bridge/README.md
git commit -m "feat: expose read-only option history"
~~~

Expected: first load makes three candle calls; identical range uses cache; failure makes zero retries.

---

### Task 3: Immutable view model

**Files:**
- Create: extension-axis-ladder/premium-history-model.js
- Create: extension-axis-ladder/premium-history-model.test.cjs

**Interfaces:**
- Consumes: history envelope, expiry timestamp, trades, visible range.
- Produces: buildViewModel, clipToRange, nearestTimestamp.

- [ ] **Step 1: Write failing tests**

~~~js
test("exact join preserves repeated trades", () => {
  const view = api.buildViewModel(envelopeFixture(), {
    expiryAt: "2026-08-25T15:30:00+05:30",
    trades: [trade("a", 100), trade("b", 150)]
  });
  assert.equal(view.points[0].combinedClose, 550);
  assert.equal(view.points[0].distance, -8);
  assert.equal(view.trades.length, 2);
});
test("missing put stays gap", () => {
  const view = api.buildViewModel(envelopeWithPutGap(), options);
  assert.equal(view.points[1].put, null);
  assert.equal(view.points[1].combinedClose, null);
});
~~~

Also test order, DTE, expiry isolation, range clipping, exact Call+Put timestamp.

- [ ] **Step 2: Verify failure**

Run: node --test extension-axis-ladder/premium-history-model.test.cjs

- [ ] **Step 3: Implement point shape**

~~~js
{
  time, underlying: { open, high, low, close },
  call: candleOrNull, put: candleOrNull,
  distance, dteDays, combinedClose,
  callIv: null, putIv: null
}
~~~

Use exact timestamp map only. Trade marker keeps exact createdAt; interval projection remains separate metadata.

- [ ] **Step 4: Test and commit**

~~~bash
node --test extension-axis-ladder/premium-history-model.test.cjs
git add extension-axis-ladder/premium-history-model.js extension-axis-ladder/premium-history-model.test.cjs
git commit -m "feat: normalize premium history view data"
~~~

---

### Task 4: ESTIMATED IV engine

**Files:**
- Create: extension-axis-ladder/estimated-iv.js
- Create: extension-axis-ladder/estimated-iv.test.cjs
- Modify: extension-axis-ladder/premium-history-model.js
- Modify: extension-axis-ladder/premium-history-model.test.cjs

**Interfaces:**
- Consumes: option close, spot, strike, years, right, rate/carry/model metadata.
- Produces: estimateIv(input) returning { value, label, model, assumptionVersion, calculatedAt } or null.

- [ ] **Step 1: Write failing tests**

~~~js
test("recovers reference volatility", () => {
  const result = api.estimateIv({ right: "CALL", optionPrice: 10.4506, spot: 100,
    strike: 100, years: 1, rate: 0.05, carry: 0, model: "BLACK_SCHOLES",
    assumptionVersion: "trial-v1", calculatedAt: "2026-08-01T00:00:00Z" });
  assert.ok(Math.abs(result.value - 0.20) < 0.0001);
  assert.equal(result.label, "ESTIMATED IV");
});
test("impossible price returns unavailable", () => {
  assert.equal(api.estimateIv({ optionPrice: 200, spot: 100, strike: 100,
    years: 1, right: "CALL" }), null);
});
~~~

- [ ] **Step 2: Implement bounded solver**

Volatility [0.0001,5], maximum 100 iterations, price tolerance 1e-6, intrinsic/upper price bounds, bounded bisection, explicit model adapter. Missing metadata returns null; generic engine has no NIFTY fallback.

- [ ] **Step 3: Enrich view without mutating premium**

Calculate Call/Put independently. Failed IV stays null. Store assumption metadata for tooltip.

- [ ] **Step 4: Test and commit**

~~~bash
node --test extension-axis-ladder/estimated-iv.test.cjs extension-axis-ladder/premium-history-model.test.cjs
git add extension-axis-ladder/estimated-iv.js extension-axis-ladder/estimated-iv.test.cjs extension-axis-ladder/premium-history-model.js extension-axis-ladder/premium-history-model.test.cjs
git commit -m "feat: calculate labelled estimated iv"
~~~

---

### Task 5: Stable TradingView time-axis evidence

**Files:**
- Create: extension-axis-ladder/time-axis-observer.js
- Create: extension-axis-ladder/time-axis-observer.test.cjs
- Modify: extension-axis-ladder/manifest.json

**Interfaces:**
- Consumes: TradingView Canvas fillText, source timeframe, time-axis geometry.
- Produces: data-options-time-axis { at, sourceLabel, signature, stableCount, plotRect, pairs } and timeToX(pairs).

- [ ] **Step 1: Write failing tests**

~~~js
test("stable pairs map timestamp into x", () => {
  const toX = api.timeToX([
    { time: Date.parse("2026-07-30T09:15:00+05:30"), x: 100 },
    { time: Date.parse("2026-07-30T10:15:00+05:30"), x: 300 }
  ]);
  assert.equal(toX(Date.parse("2026-07-30T09:45:00+05:30")), 200);
});
test("non-monotonic evidence fails closed", () => {
  assert.equal(api.timeToX([{ time: 2, x: 100 }, { time: 1, x: 200 }]), null);
});
~~~

Also test intraday/day/month/year labels, rollover, pane isolation, resize, ambiguity, repeat stability.

- [ ] **Step 2: Implement MAIN-world observer**

Follow axis-observer.js: fillText wrapper in try/catch, per-frame geometry cache, chart-associated candidates only, repeated stable signature, full-repaint stale-candidate removal. Never interrupt TradingView.

- [ ] **Step 3: Load at document_start, test, commit**

~~~bash
node --test extension-axis-ladder/time-axis-observer.test.cjs extension-axis-ladder/axis-observer.test.cjs
git add extension-axis-ladder/time-axis-observer.js extension-axis-ladder/time-axis-observer.test.cjs extension-axis-ladder/manifest.json
git commit -m "feat: observe stable tradingview time axis"
~~~

No debugger permission added.

---

### Task 6: Pane controller and three renderers

**Files:**
- Create: extension-axis-ladder/premium-history-pane.js
- Create: extension-axis-ladder/premium-history-pane.test.cjs
- Modify: extension-axis-ladder/manifest.json
- Modify: extension-axis-ladder/overlay.css

**Interfaces:**
- Consumes: view model, timeToX, theme, loadHistory(selection, signal).
- Produces: createPremiumHistoryPane with open, close, setMode, setFocusRight, setTimeAxis, state, destroy.

- [ ] **Step 1: Write failing controller tests**

~~~js
test("mode switches reuse one load", async () => {
  let requests = 0;
  const pane = api.createPremiumHistoryPane({
    loadHistory: async () => { requests += 1; return view; }, rendererFactory
  });
  await pane.open(selection);
  pane.setMode("SPLIT");
  pane.setMode("FOCUS");
  pane.setMode("LINES");
  assert.equal(requests, 1);
});
test("new selection wins stale response", async () => {
  const first = pane.open(firstSelection);
  const second = pane.open(secondSelection);
  await Promise.all([first, second]);
  assert.equal(pane.state().selection.strike, secondSelection.strike);
});
~~~

- [ ] **Step 2: Implement state machine**

States: closed, loading, ready, stale, unavailable, time-axis-unavailable. open owns AbortController. close aborts/removes DOM. setMode uses cached view.

- [ ] **Step 3: Implement renderer interface**

~~~js
renderer.render({ canvas, view, viewport, theme, crosshair, focusRight });
renderer.hitTest({ x, y, view, viewport });
renderer.destroy();
~~~

LINES: solid neutral Call close, dashed neutral Put close. SPLIT: stacked OHLC panes. FOCUS: selected-side large candles plus opposite compact line. Shared tooltip always shows same timestamp, underlying OHLC, Call/Put OHLC, ESTIMATED IV, total, DTE, distance.

- [ ] **Step 4: Add token-only CSS and accessibility**

Use existing --theme-*, --pnl-*, --ladder-* only; no literal colors. Dock below plot bounds. aria-pressed modes, named Call/Put focus toggle, Escape close, arrow crosshair, live status, Canvas summary.

- [ ] **Step 5: Add 10,000-point viewport clipping test, then commit**

~~~bash
node --test extension-axis-ladder/premium-history-pane.test.cjs
git add extension-axis-ladder/premium-history-pane.js extension-axis-ladder/premium-history-pane.test.cjs extension-axis-ladder/manifest.json extension-axis-ladder/overlay.css
git commit -m "feat: add premium history trial renderers"
~~~

---

### Task 7: Background proxy and strike-face integration

**Files:**
- Modify: extension-axis-ladder/background.js
- Modify: extension-axis-ladder/content.js
- Modify: extension-axis-ladder/content-contract.test.cjs
- Modify: extension-axis-ladder/manual-ui.js
- Modify: extension-axis-ladder/manual-ui.test.cjs

**Interfaces:**
- Consumes: chain keys, exact expiry, timeframe, pane.
- Produces: FETCH_OPTION_HISTORY and .nifty-axis-ladder__strike-face.

- [ ] **Step 1: Add failing gesture tests**

~~~js
test("rightmost strike face opens history without stealing row gestures", () => {
  const source = read("content.js");
  assert.match(source, /nifty-axis-ladder__strike-face/);
  assert.match(source, /openPremiumHistory/);
  assert.match(source, /stopPropagation/);
});
test("renderer exposes named strike button", () => {
  const face = renderRowFixture(24400).querySelector(".nifty-axis-ladder__strike-face");
  assert.equal(face.textContent, "24,400");
  assert.equal(face.getAttribute("aria-label"), "Open 24,400 premium history");
});
~~~

- [ ] **Step 2: Add validated proxy**

FETCH_OPTION_HISTORY accepts TradingView sender plus { instrumentKey, expiry, strike, interval, from, to }. Use URLSearchParams and one cache:no-store request. Return stable error kind. No retry.

- [ ] **Step 3: Integrate strike face before row selection**

~~~js
const face = event.target?.closest?.(".nifty-axis-ladder__strike-face");
if (face) {
  event.preventDefault();
  event.stopPropagation();
  void openPremiumHistory(context);
  return;
}
~~~

Expiry/instrument/navigation closes pane. Theme redraws. Missing timeframe fetches once. Pan/zoom only remaps/redraws cached view.

- [ ] **Step 4: Join immutable markers**

Filter exact instrument/expiry/strike. Preserve every ID, timestamp, direction, quantity, fill. Never merge repeated same-strike trades. Legacy NIFTY data uses explicit connector adapter only.

- [ ] **Step 5: Test and commit**

~~~bash
node --test extension-axis-ladder/manual-ui.test.cjs extension-axis-ladder/content-contract.test.cjs extension-axis-ladder/premium-history-pane.test.cjs
git add extension-axis-ladder/background.js extension-axis-ladder/content.js extension-axis-ladder/content-contract.test.cjs extension-axis-ladder/manual-ui.js extension-axis-ladder/manual-ui.test.cjs
git commit -m "feat: open premium history from strike face"
~~~

---

### Task 8: Failure, design-system, and performance regression

**Files:**
- Modify: premium-history-pane.test.cjs, content-contract.test.cjs, theme.test.cjs, expanded-ui-performance.test.cjs, screenshot-defect-regression.test.cjs

**Interfaces:**
- Consumes: completed integration.
- Produces: status, color, cleanup, and request-boundary proof.

- [ ] **Step 1: Add exact failure matrix**

Assert CONTRACT HISTORY UNAVAILABLE, STALE · AUTH REQUIRED, STALE · REFRESH FAILED, CALL HISTORY UNAVAILABLE, PUT HISTORY UNAVAILABLE, TIME AXIS UNAVAILABLE, ESTIMATED IV —. Failures never hide ladder, rails, trades, break-even evidence.

- [ ] **Step 2: Instrument request boundaries**

Open makes one request. Crosshair, mode/focus switch, pan, zoom, theme, cached reopen make zero. Missing timeframe makes one. Concurrent identical opens deduplicate.

- [ ] **Step 3: Add design-token scan**

Reject hex, rgb(), hsl(), named red/green/orange inside pane CSS. Verify light/dark semantics, contrast, stable P&L, focus, Geist fonts, radii, spacing, borders, shadows.

- [ ] **Step 4: Add screenshot cases**

Three modes, 1280×720/1920×1080, light/dark, one-side missing, loading, stale, long labels, no trades, repeated trades, close, unsafe axis. Reject orphan top-left strip, overflow, overlap, blocked TradingView controls, two-column ladder.

- [ ] **Step 5: Test and commit**

~~~bash
node --test extension-axis-ladder/theme.test.cjs extension-axis-ladder/expanded-ui-performance.test.cjs extension-axis-ladder/screenshot-defect-regression.test.cjs extension-axis-ladder/content-contract.test.cjs extension-axis-ladder/premium-history-pane.test.cjs
git add extension-axis-ladder/premium-history-pane.test.cjs extension-axis-ladder/content-contract.test.cjs extension-axis-ladder/theme.test.cjs extension-axis-ladder/expanded-ui-performance.test.cjs extension-axis-ladder/screenshot-defect-regression.test.cjs
git commit -m "test: harden premium history experience"
~~~

---

### Task 9: Docs, full verification, Chrome UAT

**Files:**
- Modify: extension-axis-ladder/README.md
- Modify: README.md
- Test: extension-axis-ladder/*.test.cjs and data-bridge/*.test.js

**Interfaces:**
- Consumes: complete trial.
- Produces: operator workflow, green suite, real-browser renderer evidence.

- [ ] **Step 1: Document workflow**

Document strike-number click, exact identity, modes, crosshair, ESTIMATED IV assumptions, repeated markers, stale states, explicit refresh, no orders, later renderer deletion.

- [ ] **Step 2: Run syntax, diff, full suite**

~~~bash
node --check extension-axis-ladder/premium-history-model.js
node --check extension-axis-ladder/estimated-iv.js
node --check extension-axis-ladder/time-axis-observer.js
node --check extension-axis-ladder/premium-history-pane.js
node --check data-bridge/option-history.js
npm test --prefix data-bridge
git diff --check
~~~

Expected: all tests PASS; zero whitespace errors.

- [ ] **Step 3: Live Chrome UAT**

Reload extension; restart bridge; open TradingView underlying; select exact expiry; click 24,400 when available. Verify exact Call/Put, timeframe interval, pan/zoom zero request, crosshair alignment, repeated markers, three-mode value parity, light/dark parity, close cleanup, stale cache without retry.

- [ ] **Step 4: Capture comparable visuals**

Same contract, timestamp, viewport, theme in LINES/SPLIT/FOCUS. User tests all, selects winner.

- [ ] **Step 5: Commit docs**

~~~bash
git add README.md extension-axis-ladder/README.md
git commit -m "docs: explain premium history trial"
~~~

Winning-renderer follow-up deletes two rejected renderers, tests, and mode controls only after user confirmation.

