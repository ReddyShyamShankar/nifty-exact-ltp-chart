# Timeframe-Aware Right-Axis Option Ladder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build separate Chrome extension showing thirteen live NIFTY `Call | Put | Strike` rows at exact TradingView right-axis coordinates, recalculating contracts only when timeframe changes and updating within two seconds without Pine symbol injection.

**Architecture:** Preserve extension v0.14.0 unchanged. Scaffold `extension-axis-ladder/` from proven capture and popup foundations. Lightweight Pine indicator supplies calibration anchors only; extension detects current grid interval from chart pixels, fetches one Upstox chain, freezes thirteen contracts per timeframe, and repositions exact-price rows during zoom or pan.

**Tech Stack:** Chrome Manifest V3, JavaScript, Node.js test runner, Pine Script v6, local Upstox bridge, TradingView screenshot capture.

## Global Constraints

- Preserve v0.14.0 and current Pine source as restorable backup.
- Build new extension separately from `extension/`.
- Show six strikes below ATM, ATM, and six above: thirteen total.
- Render `C 266.60 | P 388.70 | 26,000`, with strike nearest price scale.
- Exact price anchoring wins; no collision displacement.
- Timeframe change replaces contracts; zoom and pan preserve contracts.
- Support 15m, 1h, 4h, Daily, Weekly, Monthly, 3M, and 6M.
- No twenty-six-field Pine synchronization.
- Healthy-path target: thirteen labels within two seconds after scale settles.

---

### Task 1: Preserve v0.14.0 and scaffold independent extension

**Files:**
- Create: `backups/nifty-chain-ltp-overlay-v0.14.0.tar.gz`
- Create: `backups/nifty-chain-ltp-overlay-v0.14.0.sha256`
- Create: `extension-axis-ladder/` from `extension/`
- Modify: `extension-axis-ladder/manifest.json`
- Test: `extension-axis-ladder/scaffold.test.cjs`

**Interfaces:**
- Consumes: current extension and Pine source.
- Produces: independent extension `NIFTY Axis LTP Ladder`, version `0.1.0`.

- [ ] **Step 1: Create backup and checksum**

```bash
mkdir -p backups
tar -czf backups/nifty-chain-ltp-overlay-v0.14.0.tar.gz extension pine/nifty_monthly_strike_ladder.pine
shasum -a 256 backups/nifty-chain-ltp-overlay-v0.14.0.tar.gz > backups/nifty-chain-ltp-overlay-v0.14.0.sha256
```

- [ ] **Step 2: Copy extension foundation**

Run: `cp -R extension extension-axis-ladder`

- [ ] **Step 3: Write failing identity test**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const manifest = require("./manifest.json");
test("new extension has independent identity", () => {
  assert.equal(manifest.name, "NIFTY Axis LTP Ladder");
  assert.equal(manifest.version, "0.1.0");
});
```

- [ ] **Step 4: Run failing test**

Run: `node --test extension-axis-ladder/scaffold.test.cjs`  
Expected: FAIL against copied v0.14.0 manifest.

- [ ] **Step 5: Change manifest name, version, and description**

Keep permissions and script wiring. Set name `NIFTY Axis LTP Ladder`, version `0.1.0`, and description `Thirteen timeframe-aware NIFTY option LTP rows locked to TradingView price coordinates.`

- [ ] **Step 6: Verify and commit**

```bash
shasum -a 256 -c backups/nifty-chain-ltp-overlay-v0.14.0.sha256
node --test extension-axis-ladder/scaffold.test.cjs
git add backups extension-axis-ladder
git commit -m "chore: preserve v0.14 and scaffold axis ladder"
```

---

### Task 2: Build pure timeframe ladder selector

**Files:**
- Create: `extension-axis-ladder/timeframe-ladder.js`
- Create: `extension-axis-ladder/timeframe-ladder.test.cjs`
- Modify: `extension-axis-ladder/manifest.json`

**Interfaces:**
- Consumes: chart accessibility label, spot, detected interval, chain rows.
- Produces: `timeframeKey(label)`, `snapStrikeInterval(raw)`, `thirteenStrikes(spot, interval)`, `selectAvailable(rows, strikes)`.

- [ ] **Step 1: Write failing tests**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const api = require("./timeframe-ladder.js");

test("normalizes supported TradingView labels", () => {
  assert.equal(api.timeframeKey("Chart for NSE_DLY:NIFTY, 15 minutes"), "15m");
  assert.equal(api.timeframeKey("Chart for NSE_DLY:NIFTY, 1 hour"), "1h");
  assert.equal(api.timeframeKey("Chart for NSE_DLY:NIFTY, 4 hours"), "4h");
  assert.equal(api.timeframeKey("Chart for NSE_DLY:NIFTY, 1 day"), "1D");
  assert.equal(api.timeframeKey("Chart for NSE_DLY:NIFTY, 1 week"), "1W");
  assert.equal(api.timeframeKey("Chart for NSE_DLY:NIFTY, 1 month"), "1M");
  assert.equal(api.timeframeKey("Chart for NSE_DLY:NIFTY, 3 months"), "3M");
  assert.equal(api.timeframeKey("Chart for NSE_DLY:NIFTY, 6 months"), "6M");
});

test("snaps scale intervals to 50-point grid", () => {
  assert.equal(api.snapStrikeInterval(93), 100);
  assert.equal(api.snapStrikeInterval(238), 250);
  assert.equal(api.snapStrikeInterval(487), 500);
});

test("builds six below, ATM, and six above", () => {
  assert.deepEqual(api.thirteenStrikes(23767.45, 100), [23200,23300,23400,23500,23600,23700,23800,23900,24000,24100,24200,24300,24400]);
});
```

- [ ] **Step 2: Verify failure**

Run: `node --test extension-axis-ladder/timeframe-ladder.test.cjs`  
Expected: FAIL because module is missing.

- [ ] **Step 3: Implement pure selector**

`thirteenStrikes()` rounds spot to nearest selected interval and maps offsets `-6..6`. `snapStrikeInterval()` rounds positive input to nearest 50 with minimum 50. `selectAvailable()` maps exact numeric strikes only and never invents LTP.

- [ ] **Step 4: Load script before content.js**

```json
"js": ["expiry-utils.js", "ladder-utils.js", "overlay-utils.js", "timeframe-ladder.js", "content.js"]
```

- [ ] **Step 5: Verify and commit**

```bash
node --test extension-axis-ladder/timeframe-ladder.test.cjs
git add extension-axis-ladder/timeframe-ladder.js extension-axis-ladder/timeframe-ladder.test.cjs extension-axis-ladder/manifest.json
git commit -m "feat: add timeframe ladder selector"
```

---

### Task 3: Detect chart grid interval from screenshot pixels

**Files:**
- Modify: `extension-axis-ladder/overlay-utils.js`
- Modify: `extension-axis-ladder/overlay-utils.test.cjs`

**Interfaces:**
- Produces: `findHorizontalGridRows(data,width,height,region)`, `dominantGridGap(rows)`, `priceIntervalFromPixels(gap,lower,upper,lowerPrice,upperPrice)`.

- [ ] **Step 1: Add failing synthetic tests**

Create white image with neutral horizontal lines at y `20,70,120,170`. Assert rows match, dominant gap equals 50, and a 50-pixel gap across calibration `23000..24000` spanning 100 pixels equals 500 price points. Add noise and dotted-crosshair cases.

- [ ] **Step 2: Verify failure**

Run: `node --test extension-axis-ladder/overlay-utils.test.cjs`  
Expected: FAIL because grid functions are absent.

- [ ] **Step 3: Implement detection**

Use neutral-pixel rule:

```js
const neutral = alpha > 180
  && Math.max(red, green, blue) - Math.min(red, green, blue) <= 7
  && red >= 205 && red <= 245;
```

Sample each plot row every 4 pixels. Candidate ratio: at least `0.55`. Cluster adjacent y rows. `dominantGridGap()` returns rounded median for gaps `20..220` CSS pixels. Price interval uses absolute anchor pixel span divided by known price span.

- [ ] **Step 4: Verify and commit**

```bash
node --test extension-axis-ladder/overlay-utils.test.cjs
git add extension-axis-ladder/overlay-utils.js extension-axis-ladder/overlay-utils.test.cjs
git commit -m "feat: detect TradingView grid spacing"
```

---

### Task 4: Return axis calibration from background capture

**Files:**
- Modify: `extension-axis-ladder/background.js`
- Create: `extension-axis-ladder/capture-contract.test.cjs`

**Interfaces:**
- Consumes: `CAPTURE_AXIS_SCALE` with viewport and plot rectangle.
- Produces: `{ok, lower, upper, gridRows, gridGapPx}` in CSS pixels.

- [ ] **Step 1: Write failing source-contract test**

```js
const source = require("node:fs").readFileSync(require("node:path").join(__dirname,"background.js"),"utf8");
assert.match(source,/CAPTURE_AXIS_SCALE/);
assert.match(source,/gridRows/);
assert.match(source,/gridGapPx/);
```

- [ ] **Step 2: Verify failure**

Run: `node --test extension-axis-ladder/capture-contract.test.cjs`.

- [ ] **Step 3: Extend capture**

Reuse one screenshot for colored-anchor and horizontal-grid detection. Convert device-pixel y values and gap to CSS pixels. Keep old capture message as compatibility alias inside new extension.

- [ ] **Step 4: Verify and commit**

```bash
node --check extension-axis-ladder/background.js
node --test extension-axis-ladder/capture-contract.test.cjs
git add extension-axis-ladder/background.js extension-axis-ladder/capture-contract.test.cjs
git commit -m "feat: capture TradingView axis scale"
```

---

### Task 5: Add lightweight Pine calibrator

**Files:**
- Create: `pine/nifty_axis_calibrator.pine`
- Create: `pine/nifty_axis_calibrator.test.cjs`

**Interfaces:**
- Consumes: NIFTY close and timeframe.
- Produces: magenta lower anchor and cyan upper anchor; no option symbols.

- [ ] **Step 1: Write failing source test**

Assert indicator name `NIFTY Axis Calibrator`, colors `255, 0, 254` and `0, 255, 254`, and absence of `input.symbol` and `request.security`.

- [ ] **Step 2: Verify failure**

Run: `node --test pine/nifty_axis_calibrator.test.cjs`.

- [ ] **Step 3: Implement Pine v6 calibrator**

Center = current close rounded to nearest 50. Span table:

```pine
span = timeframe.isminutes and timeframe.multiplier <= 15 ? 300.0 :
       timeframe.isminutes and timeframe.multiplier <= 240 ? 600.0 :
       timeframe.isdaily ? 800.0 :
       timeframe.isweekly ? 2000.0 :
       timeframe.ismonthly and timeframe.multiplier == 1 ? 4000.0 : 7000.0
```

Draw last-bar lines at `center - span` and `center + span`. Extension masks lines after capture.

- [ ] **Step 4: Verify and commit**

```bash
node --test pine/nifty_axis_calibrator.test.cjs
git add pine/nifty_axis_calibrator.pine pine/nifty_axis_calibrator.test.cjs
git commit -m "feat: add Pine axis calibrator"
```

---

### Task 6: Build thirteen-row exact-price state machine

**Files:**
- Modify: `extension-axis-ladder/content.js`
- Modify: `extension-axis-ladder/overlay.css`
- Create: `extension-axis-ladder/content-contract.test.cjs`

**Interfaces:**
- Consumes: chain response, timeframe label, axis capture, expiry/enabled state.
- Produces: thirteen `.nifty-axis-ladder__row` elements; frozen membership until timeframe changes.

- [ ] **Step 1: Write failing source-contract tests**

```js
assert.match(source,/thirteenStrikes/);
assert.match(source,/CAPTURE_AXIS_SCALE/);
assert.match(source,/C \$\{money\(row\.call\)\} \| P \$\{money\(row\.put\)\} \|/);
assert.doesNotMatch(source,/spreadAroundAnchor/);
assert.doesNotMatch(source,/SYNC_PINE_INPUTS/);
```

- [ ] **Step 2: Verify failure**

Run: `node --test extension-axis-ladder/content-contract.test.cjs`.

- [ ] **Step 3: Separate membership from placement**

Use:

```js
let ladder = { timeframe:null, interval:null, atm:null, strikes:[], rows:[] };
```

`rebuildLadder()` runs only on initial load, timeframe change, or expiry change. It captures scale, derives snapped interval, builds thirteen strikes, maps chain rows, and freezes membership. `placeLabels()` runs during resize/zoom/pan and maps frozen strikes to new y coordinates without collision spread.

- [ ] **Step 4: Render row text and exact position**

```js
node.textContent = `C ${money(row.call)} | P ${money(row.put)} | ${Number(row.strike).toLocaleString("en-IN")}`;
node.style.top = `${Math.round(rawY - height / 2)}px`;
```

ATM remains orange. Strike remains row's rightmost value.

- [ ] **Step 5: Detect timeframe changes**

Observe chart canvas `aria-label`; debounce rebuild by 250 ms. Placement retries at `0,250,650,1200` ms. Zoom and pan call placement only.

- [ ] **Step 6: Refresh LTP without replacing contracts**

Every two seconds fetch current expiry chain, update rows matching existing frozen strikes, update text, and place again. Never recalculate interval during refresh.

- [ ] **Step 7: Remove old automation from new extension**

Delete trusted Pine field-selection functions and `SYNC_PINE_INPUTS` handler from new content script. Keep current `extension/content.js` untouched.

- [ ] **Step 8: Remove collision styles**

Delete leader brackets and spreading classes from new CSS. Keep exact right-edge pointer and compact row typography.

- [ ] **Step 9: Verify and commit**

```bash
node --check extension-axis-ladder/content.js
node --test extension-axis-ladder/*.test.cjs
git add extension-axis-ladder/content.js extension-axis-ladder/overlay.css extension-axis-ladder/content-contract.test.cjs
git commit -m "feat: render thirteen exact axis rows"
```

---

### Task 7: Replace Sync UI with automatic ladder status

**Files:**
- Modify: `extension-axis-ladder/popup.html`
- Modify: `extension-axis-ladder/popup.js`
- Modify: `extension-axis-ladder/popup.css`
- Modify: `extension-axis-ladder/README.md`
- Create: `extension-axis-ladder/popup-contract.test.cjs`

**Interfaces:**
- Produces: enabled toggle, expiry selector, automatic status, retry placement; no Pine Sync button.

- [ ] **Step 1: Write failing contract test**

Assert popup lacks `SYNC PINE INPUTS`, contains `13 STRIKES`, and popup JS never sends `SYNC_PINE_INPUTS`.

- [ ] **Step 2: Verify failure**

Run: `node --test extension-axis-ladder/popup-contract.test.cjs`.

- [ ] **Step 3: Implement automatic UI**

Keep enabled toggle and expiry selector. Replace Sync area with:

```text
AUTO · 13 STRIKES · EXACT AXIS
Timeframe chooses contracts. Zoom preserves them.
```

Keep `RETRY PLACEMENT` for recoverable capture failure. Remove visible-count selector.

- [ ] **Step 4: Document and verify**

```bash
node --check extension-axis-ladder/popup.js
node --test extension-axis-ladder/*.test.cjs
git add extension-axis-ladder/popup.html extension-axis-ladder/popup.js extension-axis-ladder/popup.css extension-axis-ladder/README.md extension-axis-ladder/popup-contract.test.cjs
git commit -m "feat: add automatic axis ladder controls"
```

---

### Task 8: Install and verify live

**Files:**
- Modify: `memory/PROGRESS.md`
- Modify: `memory/DECISIONS.md`
- Modify: `memory/LATEST_SEED.md`

**Interfaces:**
- Consumes: new extension, calibrator, TradingView account, bridge.
- Produces: live evidence for all supported timeframes and backup proof.

- [ ] **Step 1: Run automated gate**

```bash
node --check extension-axis-ladder/background.js
node --check extension-axis-ladder/content.js
node --check extension-axis-ladder/popup.js
node --test extension-axis-ladder/*.test.cjs
npm test --prefix data-bridge
git diff --check
```

- [ ] **Step 2: Load new extension separately**

Load `extension-axis-ladder/`. Keep old v0.14.0 installed but disabled during comparison. Request user only if Chrome blocks protected extension-management action.

- [ ] **Step 3: Add Pine calibrator separately**

Add `pine/nifty_axis_calibrator.pine` through TradingView Pine Editor. Keep original indicator saved.

- [ ] **Step 4: Verify every timeframe**

For `15m,1h,4h,D,W,M,3M,6M`, confirm thirteen rows, symmetric ATM set, rightmost strike copy, exact pointer y, selected-expiry LTP match, and under-two-second update after scale settles.

- [ ] **Step 5: Verify zoom/pan invariants**

On 1h, Weekly, and Monthly, record strike list before zoom and pan. Confirm same list afterward while y coordinates follow exact price mapping.

- [ ] **Step 6: Verify backup**

```bash
shasum -a 256 -c backups/nifty-chain-ltp-overlay-v0.14.0.sha256
tar -tzf backups/nifty-chain-ltp-overlay-v0.14.0.tar.gz | head
```

- [ ] **Step 7: Update memory and commit**

Append verification result and new architecture decision. Update seed with active new extension path/version and backup path.

```bash
git add memory/PROGRESS.md memory/DECISIONS.md memory/LATEST_SEED.md
git commit -m "docs: record axis ladder verification"
```

---

## Self-review

- Spec coverage: backup, thirteen rows, exact anchoring, timeframe replacement, zoom preservation, direct data path, supported intervals, failure behavior, and live verification all have tasks.
- Placeholder scan: no TBD, TODO, or undefined implementation step.
- Interface consistency: `timeframeKey`, `snapStrikeInterval`, `thirteenStrikes`, `selectAvailable`, `findHorizontalGridRows`, `dominantGridGap`, and `priceIntervalFromPixels` keep identical names across producers and consumers.
