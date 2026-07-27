# Timeframe-Aware Right-Axis Option Ladder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build separate Chrome extension showing thirteen live NIFTY `Call | Put | Strike` rows at exact TradingView right-axis coordinates. Use widest complete exact interval no greater than native tick interval, recenter ATM at exact midpoint through existing two-second chain refresh, and keep zoom/pan placement-only.

**Architecture:** Preserve v0.14.0 and existing backup unchanged. Main-world observer records TradingView's native numeric canvas tick draws. Background validates direct normal or inverted linear axis. Content script combines that map with full Upstox chain, selects exact thirteen-contract membership, refreshes quotes every two seconds, and redraws exact positions. No Chrome debugger, accessibility-tree read, screenshot analysis, OCR, Pine calibrator, or nearest-contract substitution.

**Tech Stack:** Chrome Manifest V3, JavaScript, Node.js test runner, local Upstox bridge, TradingView canvas text observation.

## Global constraints

- Do not modify, recreate, or delete v0.14.0 backup archive/checksum or old extension.
- Build only under independent `extension-axis-ladder/`.
- Show six strikes below ATM, ATM, six above: thirteen total.
- Render `C 266.60 | P 388.70 | 26,000`, strike nearest price scale.
- Exact contract at every requested strike. No nearest substitution.
- Interval is 50-point multiple and never exceeds native TradingView tick interval.
- Choose widest candidate with complete thirteen-strike exact range.
- Recenter at exact midpoint through same two-second chain response.
- Timeframe, expiry, and midpoint crossing may change membership.
- Zoom, pan, resize, and scale animation change positions only.
- Support normal and inverted linear scales.
- Fail closed on nonlinear scale, unsupported timeframe, or unavailable exact range.
- No `debugger` permission or DevTools Protocol.
- No accessibility tree, screenshot capture, OCR, or Pine calibration.
- Healthy-path target: thirteen labels within two seconds after scale settles.

---

### Task 1: Guard independent extension and untouched backup

**Files:**
- Verify only: `backups/nifty-chain-ltp-overlay-v0.14.0.tar.gz`
- Verify only: `backups/nifty-chain-ltp-overlay-v0.14.0.sha256`
- Modify: `extension-axis-ladder/manifest.json`
- Test: `extension-axis-ladder/scaffold.test.cjs`

**Interfaces:**
- Preserves: existing v0.14.0 backup bytes.
- Produces: independent `NIFTY Axis LTP Ladder`.

- [ ] **Step 1: Record backup checksum without writing backup**

Run:

```bash
shasum -a 256 -c backups/nifty-chain-ltp-overlay-v0.14.0.sha256
git diff --exit-code -- backups/
```

Expected: checksum passes and no backup diff.

- [ ] **Step 2: Write identity and permission contract**

Assert independent name/version and absence of `debugger` permission.

```js
assert.equal(manifest.name, "NIFTY Axis LTP Ladder");
assert.equal(manifest.permissions.includes("debugger"), false);
```

- [ ] **Step 3: Register direct main-world observer**

Load `axis-observer.js` at `document_start` with `"world": "MAIN"`. Load normal content bundle separately in isolated world. Keep only storage, active-tab, local bridge, and TradingView access needed by extension.

- [ ] **Step 4: Verify**

```bash
node --test extension-axis-ladder/scaffold.test.cjs
git diff --exit-code -- backups/
```

---

### Task 2: Observe native TradingView ticks directly from canvas

**Files:**
- Create: `extension-axis-ladder/axis-observer.js`
- Create: `extension-axis-ladder/axis-observer.test.cjs`

**Interfaces:**
- Consumes: TradingView canvas `fillText(text, x, y)` calls plus current transform.
- Produces: fresh `{price, y}` candidates in viewport coordinates.

- [ ] **Step 1: Write parser tests**

Accept plain numeric labels such as `24,000.00`, `23800`, and negative values. Reject OHLC strings, percentages, option row text, empty input, and nonfinite values.

- [ ] **Step 2: Write coordinate tests**

Given canvas backing size, CSS rectangle, current transform, text metrics, and viewport width:

- convert text baseline to visual tick center
- convert device coordinates to viewport coordinates
- retain candidates only near right edge
- preserve exact numeric price

- [ ] **Step 3: Implement main-world observer**

Wrap `CanvasRenderingContext2D.prototype.fillText` once. Always call original draw. Batch candidate publication briefly, deduplicate by price and y, and publish timestamped candidate list through document attribute. Observer failure must never interrupt TradingView rendering.

- [ ] **Step 4: Verify**

```bash
node --check extension-axis-ladder/axis-observer.js
node --test extension-axis-ladder/axis-observer.test.cjs
```

---

### Task 3: Validate direct normal or inverted linear axis

**Files:**
- Modify: `extension-axis-ladder/background.js`
- Modify: `extension-axis-ladder/overlay-utils.js`
- Modify: `extension-axis-ladder/overlay-utils.test.cjs`
- Modify: `extension-axis-ladder/capture-contract.test.cjs`

**Interfaces:**
- Consumes: observed `{price, y}` canvas candidates.
- Produces: `{ok, axisPairs, axisPrices, gridRows, gridGapPx}`.

- [ ] **Step 1: Write source-contract tests**

Assert:

- `CAPTURE_AXIS_SCALE` accepts direct candidates
- no debugger attachment or DevTools Protocol
- no screenshot capture
- no accessibility-tree query
- no Pine-anchor message

- [ ] **Step 2: Write linear-fit tests**

Cover:

- normal scale: larger price maps toward smaller y
- inverted scale: larger price maps toward larger y
- unrelated numeric chart text rejected as outlier
- duplicate price/y rejected
- stale, missing, nonfinite, and nonlinear sets fail
- minimum three distinct accepted pairs

- [ ] **Step 3: Implement candidate validation**

Search candidate pairs for largest inlier set fitting one linear function. Preserve visual y order. Require distinct prices and rows, sufficient span, and bounded raster tolerance. Slope may be positive or negative but cannot be zero.

- [ ] **Step 4: Return native map only**

Background service worker validates already-observed coordinates. It must not attach debugger, capture screenshot, query accessibility tree, or infer coordinates from Upstox spot.

- [ ] **Step 5: Verify**

```bash
node --check extension-axis-ladder/background.js
node --test extension-axis-ladder/overlay-utils.test.cjs extension-axis-ladder/capture-contract.test.cjs
```

---

### Task 4: Select widest complete exact thirteen-contract interval

**Files:**
- Modify: `extension-axis-ladder/timeframe-ladder.js`
- Modify: `extension-axis-ladder/timeframe-ladder.test.cjs`

**Interfaces:**
- Produces: `timeframeKey(label)`, `floorStrikeInterval(raw)`, `thirteenStrikes(spot, interval)`, `selectExactThirteen(rows, spot, nativeInterval)`.

- [ ] **Step 1: Write timeframe tests**

Normalize 15m, 1h, 4h, 1D, 1W, 1M, 3M, and 6M labels. Reject unsupported labels.

- [ ] **Step 2: Write at-or-below interval tests**

```js
assert.equal(floorStrikeInterval(1), null);
assert.equal(floorStrikeInterval(49.99), null);
assert.equal(floorStrikeInterval(50), 50);
assert.equal(floorStrikeInterval(93), 50);
assert.equal(floorStrikeInterval(238), 200);
assert.equal(floorStrikeInterval(487), 450);
```

Never round above native interval.

- [ ] **Step 3: Write complete exact selection tests**

Build exact chain index by numeric strike. Starting from floored ceiling, test intervals downward by 50. For each candidate:

```text
center = nearest interval-aligned strike to spot
targets = center + (-6..6) × interval
```

Return first candidate only if every target exists exactly.

Tests:

- returns thirteen ordered rows
- widest complete candidate wins
- selected interval never exceeds native
- all selected strikes belong to chain
- one missing strike rejects candidate and tries next smaller interval
- no complete candidate returns `null`
- chain edge never clumps rows or substitutes neighbors

- [ ] **Step 4: Remove production nearest-selection path**

Production membership code must call exact selector only. Delete or leave unreachable any legacy nearest helper; tests must assert no production call. No test should describe nearest substitution as supported behavior.

- [ ] **Step 5: Verify**

```bash
node --check extension-axis-ladder/timeframe-ladder.js
node --test extension-axis-ladder/timeframe-ladder.test.cjs
```

---

### Task 5: Build exact membership and linear placement controller

**Files:**
- Modify: `extension-axis-ladder/content.js`
- Modify: `extension-axis-ladder/overlay.css`
- Modify: `extension-axis-ladder/content-contract.test.cjs`

**Interfaces:**
- Consumes: exact chain response, timeframe label, direct native axis pairs, expiry/enabled state.
- Produces: thirteen exact rows plus frozen membership and replaceable placement map.

- [ ] **Step 1: Write source-contract tests**

Assert:

```js
assert.match(source, /selectExactThirteen/);
assert.match(source, /CAPTURE_AXIS_SCALE/);
assert.match(source, /C \$\{money\(row\.call\)\} \| P \$\{money\(row\.put\)\} \|/);
assert.doesNotMatch(source, /spreadAroundAnchor|SYNC_PINE_INPUTS/);
```

Also reject debugger, screenshot, accessibility-tree, Pine-sanity, and nearest-selection production paths.

- [ ] **Step 2: Separate membership from placement**

Membership stores:

```js
{
  timeframe,
  expiry,
  nativeInterval,
  interval,
  atm,
  strikes,
  rows
}
```

Placement stores current validated `price -> y` linear function separately. Changing placement map must not mutate membership.

- [ ] **Step 3: Stabilize native scale**

On initial enable, timeframe change, or expiry change:

1. fetch chain and first native scale in parallel
2. derive floored native interval
3. read native scale again after settle
4. require matching interval observations
5. run exact selector
6. commit membership only after all thirteen rows and y positions validate

Bounded retries: `0, 250, 650, 1200` ms. Failure hides rows rather than guessing.

- [ ] **Step 4: Support normal and inverted linear placement**

Build y function from accepted axis pairs:

```text
y = firstY + (price - firstPrice) × pixelSpan / priceSpan
```

Accept either slope sign. Reject nonlinear residuals. Render raw y without collision displacement.

- [ ] **Step 5: Render exact row text**

```js
node.textContent = `C ${money(row.call)} | P ${money(row.put)} | ${Number(row.strike).toLocaleString("en-IN")}`;
node.style.top = `${Math.round(rawY - height / 2)}px`;
```

ATM remains orange. Strike remains rightmost.

- [ ] **Step 6: Detect membership triggers**

- initial enable: rebuild
- timeframe change: rebuild after 250 ms debounce
- expiry change: abort stale requests, rebuild
- midpoint crossing: exact recenter through refresh path

- [ ] **Step 7: Keep zoom and pan placement-only**

Resize, wheel, pointer-up, and scale animation reread native ticks and replace only price-to-y map. Tests record membership object before and after each event and require identical timeframe, expiry, interval, ATM, strikes, and rows.

- [ ] **Step 8: Remove collision styles**

Delete leader brackets and spreading classes from new CSS. Keep exact right-edge pointer and compact row typography.

- [ ] **Step 9: Verify**

```bash
node --check extension-axis-ladder/content.js
node --test extension-axis-ladder/content-contract.test.cjs
```

---

### Task 6: Recenter ATM at exact midpoint on two-second refresh

**Files:**
- Modify: `extension-axis-ladder/content.js`
- Modify: `extension-axis-ladder/content-contract.test.cjs`

**Interfaces:**
- Consumes: current membership plus same chain response already fetched for LTP.
- Produces: refreshed quotes or new complete exact membership.

- [ ] **Step 1: Write midpoint boundary tests**

For ATM `23,800` and interval `100`:

- spot `23,750.01` through `23,849.99`: keep ATM `23,800`
- spot exactly `23,850`: recenter upward to `23,900`
- spot exactly `23,750`: recenter downward to `23,700`

Include multi-interval jump after delayed refresh.

- [ ] **Step 2: Prove no extra request**

One timer tick performs one chain request. Same response updates LTP and supplies spot/rows for recenter. Assert chain fetch count increases by one and axis capture count does not increase.

- [ ] **Step 3: Re-run exact selector**

At midpoint boundary, use cached native interval ceiling and refreshed exact chain:

- build candidate centered toward crossed side
- require all thirteen exact strikes
- commit only complete set
- update ATM styling
- place through cached linear map

If new complete set unavailable, keep last complete exact membership, refresh matching LTP, and surface pending/unavailable status. Never substitute.

- [ ] **Step 4: Run every two seconds**

Existing timer remains single source:

```js
setInterval(() => controller.refreshLtp(), 2000);
```

No separate recenter poll.

- [ ] **Step 5: Verify**

```bash
node --test extension-axis-ladder/content-contract.test.cjs
```

---

### Task 7: Align popup and user documentation

**Files:**
- Modify: `extension-axis-ladder/popup.html`
- Modify: `extension-axis-ladder/popup.js`
- Modify: `extension-axis-ladder/popup.css`
- Modify: `extension-axis-ladder/README.md`
- Modify: `extension-axis-ladder/popup-contract.test.cjs`

**Interfaces:**
- Produces: enable toggle, expiry selector, exact automatic status, manual placement retry.

- [ ] **Step 1: Update automatic copy**

Display:

```text
AUTO · 13 STRIKES · EXACT AXIS
Widest complete interval. Zoom and pan move positions only.
```

Enabled summary states ATM recenters at exact interval midpoint.

- [ ] **Step 2: Keep placement retry narrow**

**RETRY PLACEMENT** rereads native ticks and updates positions only. It must not change contracts or request debugger access.

- [ ] **Step 3: Document behavior and limits**

README covers:

- six below + ATM + six above
- exact contracts only
- widest complete 50-point interval at or below native interval
- same two-second refresh for LTP and midpoint recenter
- zoom/pan positions only
- normal/inverted linear support
- nonlinear fail-closed behavior
- direct canvas tick observation
- no debugger, screenshot, accessibility tree, Pine calibrator, or old-backup changes

- [ ] **Step 4: Verify**

```bash
node --check extension-axis-ladder/popup.js
node --test extension-axis-ladder/popup-contract.test.cjs
```

---

### Task 8: Automated and live verification

**Files:**
- Do not modify backup files.
- Record evidence only in separately authorized memory/release files.

- [ ] **Step 1: Run automated gate**

```bash
node --check extension-axis-ladder/axis-observer.js
node --check extension-axis-ladder/background.js
node --check extension-axis-ladder/content.js
node --check extension-axis-ladder/popup.js
node --test extension-axis-ladder/*.test.cjs
npm test --prefix data-bridge
git diff --check
git diff --exit-code -- backups/
shasum -a 256 -c backups/nifty-chain-ltp-overlay-v0.14.0.sha256
```

- [ ] **Step 2: Load new extension separately**

Load `extension-axis-ladder/`. Keep old v0.14.0 installed but disabled during comparison. Do not alter old extension or backup.

- [ ] **Step 3: Verify every timeframe**

For `15m, 1h, 4h, D, W, M, 3M, 6M`:

- record observed native interval
- confirm selected interval is 50-point multiple at or below native
- confirm no wider eligible complete candidate exists
- confirm exactly thirteen rows when complete range exists
- confirm every strike exists exactly in selected-expiry chain
- confirm rightmost strike text and exact pointer y
- confirm under-two-second display after scale settles

- [ ] **Step 4: Verify normal and inverted scales**

Use same timeframe and chain:

- normal linear scale places all rows correctly
- inverted linear scale reverses y direction and keeps exact contracts
- logarithmic/nonlinear scale hides rows

- [ ] **Step 5: Verify midpoint recenter**

With deterministic mocked or live-observed boundary:

- one tick below midpoint keeps ATM
- exact midpoint moves ATM toward crossed side
- recenter uses one normal chain refresh
- no axis capture occurs solely for recenter
- incomplete next range never substitutes

- [ ] **Step 6: Verify zoom/pan invariant**

On 1h, Weekly, and Monthly, record membership before zoom and pan. Confirm same interval, ATM, thirteen strikes, and contracts afterward while y positions follow new axis map.

- [ ] **Step 7: Verify backup remains untouched**

```bash
git diff --exit-code -- backups/
shasum -a 256 -c backups/nifty-chain-ltp-overlay-v0.14.0.sha256
```

---

## Self-review

- Spec coverage: thirteen rows, exact membership, widest complete at-or-below interval, midpoint recenter, two-second refresh reuse, zoom/pan placement-only, normal/inverted linear scale, direct canvas observation, no debugger, and untouched backup each have implementation and verification steps.
- Failure rule: missing exact contract, invalid scale, or unavailable ticks fail closed; no nearest substitution.
- Membership rule: only initial enable, timeframe, expiry, and midpoint crossing may replace contracts.
- Placement rule: zoom, pan, resize, animation, and manual retry may change y positions only.
- Interface consistency: direct canvas candidates become validated axis pairs; exact selector receives native interval ceiling and full chain; controller keeps membership separate from placement map.
