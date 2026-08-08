# Options Ladder — Expanded 100-Case QA Pack

## Scope

Adds 100 independent cases beyond original 18-case strategy-chart pack. Covers UI/UX, ARB Desk tokens, accessibility, TradingView-axis ladder, combined preview, versioning, performance, resilience, broker safety, and Chrome lifecycle.

## Shared Test Data

- **TD-UI-LIGHT:** TradingView NIFTY chart, Options Ladder `0.6.0`, `uiTheme=light`, 1440×900 viewport.
- **TD-UI-DARK:** Same chart and viewport, `uiTheme=dark`.
- **TD-STRATEGIES-3:** Three active compatible strategies, exact same instrument/expiry, one leg each, fresh quotes.
- **TD-STRATEGY-LARGE:** One active strategy with 25 distinct captured legs and incomplete charges.
- **TD-AXIS-DENSE:** Stable native right-axis labels every 10 points; real contracts every 50 points.
- **TD-AXIS-WIDE:** Stable native right-axis labels every 200 points across 22,000–27,000.
- **TD-FAIL-STORAGE:** `MUTATE_STRATEGY_BOOK` rejects once with `Storage unavailable`.
- **TD-FAIL-CHAIN:** Manual refresh returns one chain/network failure and never retries.
- **TD-INCOMPATIBLE:** Two active strategies with different exact expiry or instrument key.
- **TD-PERF:** 10,000 break-even projections, 5,000 strategy cards, and 1,000 selector toggles.

## Coverage Summary

| IDs | Area | Cases | Main types |
|---|---|---:|---|
| TC_UI_001–010 | Layout and visual behavior | 10 | Functional · Usability · Regression |
| TC_TOKEN_001–010 | Color and design tokens | 10 | Non-Functional · Regression |
| TC_A11Y_001–010 | Keyboard and accessibility | 10 | Usability · Non-Functional |
| TC_AXIS_001–010 | TradingView-axis ladder | 10 | Functional · Boundary · Integration |
| TC_PREVIEW_001–010 | Combined strategy preview | 10 | Functional · Negative · UAT |
| TC_VERSION_001–010 | Save, merge, split, history | 10 | Integration · Regression · UAT |
| TC_PERF_001–010 | Performance and scale | 10 | Non-Functional · Boundary |
| TC_RESILIENCE_001–010 | Failure and recovery | 10 | Negative · Regression |
| TC_SAFETY_001–010 | Broker/security boundaries | 10 | Security · Integration · Critical |
| TC_LIFECYCLE_001–010 | Chrome and extension lifecycle | 10 | Smoke · Compatibility · Regression |

---

## UI and Layout

### TC_UI_001 — Keep collapsed strategy card at 24 px
**Description / Module:** Verify base strategy-card geometry / Chart UI. **Type:** Regression. **Priority / Severity:** High / Medium. **Traceability:** R-LAYOUT-01.  
**Preconditions / Data:** One active strategy; TD-UI-LIGHT.  
**Steps:** 1. Load ladder. 2. Measure `.nifty-strategy__card`.  
**Expected Results:** Height equals 24 px; label and square remain fully visible.  
**Actual Results / Status:** Automated PASS.  
**Notes:** `strategyCardHeight` and live Chrome geometry.

### TC_UI_002 — Expand one-leg strategy to full 78 px
**Description / Module:** Verify details and disclosure reserve height / Chart UI. **Type:** Functional · Regression. **Priority / Severity:** Critical / High. **Traceability:** R-LAYOUT-01.  
**Preconditions / Data:** One leg plus `EXCLUDING UNKNOWN CHARGES`.  
**Steps:** 1. Click strategy label. 2. Measure card.  
**Expected Results:** Height equals 78 px; label, leg, and disclosure do not clip.  
**Actual Results / Status:** Automated and live PASS.  
**Notes:** Live T20 evidence.

### TC_UI_003 — Expand 25-leg strategy without clipping
**Description / Module:** Verify large-card height scaling / Chart UI. **Type:** Boundary. **Priority / Severity:** High / High. **Traceability:** R-LAYOUT-01.  
**Preconditions / Data:** TD-STRATEGY-LARGE.  
**Steps:** 1. Open strategy label. 2. Read computed card height.  
**Expected Results:** Height equals 726 px; all 25 legs plus disclosure reserve space.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Expanded performance contract.

### TC_UI_004 — Prevent neighboring card overlap
**Description / Module:** Verify collision packing / Strategy layout. **Type:** Regression. **Priority / Severity:** Critical / High. **Traceability:** R-LAYOUT-01.  
**Preconditions / Data:** Expanded 78 px card beside 24 px card; 6 px gap.  
**Steps:** 1. Expand first card. 2. Compare both rectangles.  
**Expected Results:** Rectangle intersection is zero; minimum gap is 6 px.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Dynamic height contract.

### TC_UI_005 — Collapse card on outside click
**Description / Module:** Verify temporary detail inspection / Chart interaction. **Type:** Usability · Regression. **Priority / Severity:** High / Medium. **Traceability:** R-UI-02.  
**Preconditions / Data:** Expanded strategy card.  
**Steps:** 1. Click empty chart coordinate. 2. Re-measure card.  
**Expected Results:** Card returns to 24 px; strategy and selection state remain.  
**Actual Results / Status:** Automated and live PASS.  
**Notes:** Empty-chart click tested in Chrome.

### TC_UI_006 — Keep exact rail fixed while card moves
**Description / Module:** Verify financial coordinate truth / Strategy layout. **Type:** Integration · Regression. **Priority / Severity:** Critical / Critical. **Traceability:** R-LAYOUT-02.  
**Preconditions / Data:** Two close break-evens requiring card movement.  
**Steps:** 1. Record rail Y. 2. Expand one card. 3. Record rail Y again.  
**Expected Results:** Rail Y is unchanged; connector joins moved card to exact rail.  
**Actual Results / Status:** Automated PASS.  
**Notes:** `stackCards` never changes `railY`.

### TC_UI_007 — Keep dashed rail below ladder row and strategy card
**Description / Module:** Verify visual layer order / Chart UI. **Type:** Regression · Usability. **Priority / Severity:** High / Medium. **Traceability:** R-UI-01.  
**Preconditions / Data:** Rail crosses visible ladder row and card.  
**Steps:** 1. Read computed z-index values. 2. Inspect crossing.  
**Expected Results:** Rail=1, ladder row=2, card=3; dashed line never cuts card text.  
**Actual Results / Status:** Automated and live PASS.  
**Notes:** Layer contract.

### TC_UI_008 — Preserve one-column ladder
**Description / Module:** Verify ladder never creates second lane / Ladder layout. **Type:** Regression. **Priority / Severity:** Critical / High. **Traceability:** Axis-only single-column rule.  
**Preconditions / Data:** TD-AXIS-DENSE.  
**Steps:** 1. Zoom chart in. 2. Inspect every row X coordinate.  
**Expected Results:** All rows share one right-side lane; no alternating columns.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Existing dense-row regression.

### TC_UI_009 — Keep ATM row visually dominant without changing geometry
**Description / Module:** Verify ATM emphasis / Ladder UI. **Type:** Functional · Usability. **Priority / Severity:** High / Medium. **Traceability:** ATM theme rule.  
**Preconditions / Data:** Real ATM contract inside visible range.  
**Steps:** 1. Refresh ladder. 2. Compare ATM and non-ATM rows.  
**Expected Results:** ATM uses theme-specific fill/text; row remains same dimensions and column.  
**Actual Results / Status:** Automated PASS.  
**Notes:** ATM metadata and styling contracts.

### TC_UI_010 — Keep preview bar compact at chart top
**Description / Module:** Verify preview action hierarchy / Combined UI. **Type:** Usability · UAT. **Priority / Severity:** Medium / Medium. **Traceability:** R-PREVIEW-01.  
**Preconditions / Data:** Two selected compatible strategies.  
**Steps:** 1. Select both squares. 2. Inspect preview bar.  
**Expected Results:** Summary, Compare, Save, Clear appear in one compact row; chart remains usable.  
**Actual Results / Status:** Automated PASS; live multi-select not executed.  
**Notes:** DOM contract.

---

## Colors and Tokens

### TC_TOKEN_001 — Meet dark primary text contrast
**Description / Module:** Validate readable dark plan surface / Theme. **Type:** Non-Functional. **Priority / Severity:** Critical / High. **Traceability:** R-UI-01.  
**Preconditions / Data:** Surface `#111113`, ink `#f4f4f5`.  
**Steps:** 1. Calculate WCAG contrast.  
**Expected Results:** Ratio is at least 4.5:1.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Executable contrast test.

### TC_TOKEN_002 — Meet light primary text contrast
**Description / Module:** Validate readable light plan surface / Theme. **Type:** Non-Functional. **Priority / Severity:** Critical / High. **Traceability:** R-UI-01.  
**Preconditions / Data:** Surface `#ffffff`, ink `#18181b`.  
**Steps:** 1. Calculate WCAG contrast.  
**Expected Results:** Ratio is at least 4.5:1.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Executable contrast test.

### TC_TOKEN_003 — Meet dark ATM contrast
**Description / Module:** Validate dark ATM fill/text / Theme. **Type:** Non-Functional. **Priority / Severity:** High / High. **Traceability:** ATM dark rule.  
**Preconditions / Data:** Fill `#fbbf24`, ink `#18181b`.  
**Steps:** 1. Calculate WCAG contrast.  
**Expected Results:** Ratio is at least 4.5:1.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Orange remains dark-mode only.

### TC_TOKEN_004 — Meet light ATM contrast
**Description / Module:** Validate light ATM fill/text / Theme. **Type:** Non-Functional. **Priority / Severity:** High / High. **Traceability:** ATM light rule.  
**Preconditions / Data:** Fill `#b45309`, ink `#ffffff`.  
**Steps:** 1. Calculate WCAG contrast.  
**Expected Results:** Ratio is at least 4.5:1.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Brown with white text.

### TC_TOKEN_005 — Keep dark profit contrast readable
**Description / Module:** Validate profit color / P&L tokens. **Type:** Non-Functional · Regression. **Priority / Severity:** High / High. **Traceability:** Fixed P&L semantics.  
**Preconditions / Data:** Surface `#111113`, profit `#34d399`.  
**Steps:** 1. Calculate contrast.  
**Expected Results:** Ratio is at least 4.5:1.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Same meaning in both modes.

### TC_TOKEN_006 — Keep dark loss contrast readable
**Description / Module:** Validate loss color / P&L tokens. **Type:** Non-Functional · Regression. **Priority / Severity:** High / High. **Traceability:** Fixed P&L semantics.  
**Preconditions / Data:** Surface `#111113`, loss `#f87171`.  
**Steps:** 1. Calculate contrast.  
**Expected Results:** Ratio is at least 4.5:1.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Red always means loss.

### TC_TOKEN_007 — Keep light profit contrast readable
**Description / Module:** Validate light profit token / P&L tokens. **Type:** Non-Functional · Regression. **Priority / Severity:** High / High. **Traceability:** Fixed P&L semantics.  
**Preconditions / Data:** Surface `#ffffff`, profit `#066647`.  
**Steps:** 1. Calculate contrast.  
**Expected Results:** Ratio is at least 4.5:1.  
**Actual Results / Status:** Automated PASS.  
**Notes:** No mode-dependent meaning change.

### TC_TOKEN_008 — Keep light loss contrast readable
**Description / Module:** Validate light loss token / P&L tokens. **Type:** Non-Functional · Regression. **Priority / Severity:** High / High. **Traceability:** Fixed P&L semantics.  
**Preconditions / Data:** Surface `#ffffff`, loss `#dc2626`.  
**Steps:** 1. Calculate contrast.  
**Expected Results:** Ratio is at least 4.5:1.  
**Actual Results / Status:** Automated PASS.  
**Notes:** No brown substitution for loss.

### TC_TOKEN_009 — Reject colors outside ARB Desk palette
**Description / Module:** Prevent accidental color drift / Theme system. **Type:** Regression. **Priority / Severity:** High / Medium. **Traceability:** Locked ARB Desk palette.  
**Preconditions / Data:** All UI CSS files.  
**Steps:** 1. Extract color literals. 2. Compare to approved palette.  
**Expected Results:** No unapproved hex/RGB token appears.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Existing locked-palette test.

### TC_TOKEN_010 — Reuse plan tokens in Save chooser
**Description / Module:** Verify component consistency / Combined Save UI. **Type:** Regression · Usability. **Priority / Severity:** High / Medium. **Traceability:** R-UI-01.  
**Preconditions / Data:** Save chooser open.  
**Steps:** 1. Inspect chooser CSS.  
**Expected Results:** Surface=`--plan-surface`, border=`--plan-line`, ink=`--plan-ink`; no raw new color.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Expanded token contract.

---

## Accessibility and Keyboard

### TC_A11Y_001 — Expose selector as named button
**Description / Module:** Verify screen-reader discoverability / Strategy square. **Type:** Usability · Non-Functional. **Priority / Severity:** Critical / High. **Traceability:** R-UI-02.  
**Preconditions / Data:** T20 unselected.  
**Steps:** 1. Inspect accessibility tree.  
**Expected Results:** Button name states `T20 not selected for combined preview`.  
**Actual Results / Status:** Automated and live PASS.  
**Notes:** Chrome accessibility tree verified.

### TC_A11Y_002 — Toggle selector with Space
**Description / Module:** Verify keyboard parity / Strategy square. **Type:** Usability. **Priority / Severity:** Critical / High. **Traceability:** R-UI-02.  
**Preconditions / Data:** Selector focused.  
**Steps:** 1. Press Space.  
**Expected Results:** `aria-pressed` changes exactly once; no label expansion occurs.  
**Actual Results / Status:** Automated and live PASS.  
**Notes:** Live Chrome Space test.

### TC_A11Y_003 — Toggle selector with Enter
**Description / Module:** Verify keyboard parity / Strategy square. **Type:** Usability. **Priority / Severity:** High / High. **Traceability:** R-UI-02.  
**Preconditions / Data:** Selector focused.  
**Steps:** 1. Press Enter.  
**Expected Results:** Selection changes once; preview count updates when threshold reached.  
**Actual Results / Status:** Automated PASS.  
**Notes:** DOM keyboard contract.

### TC_A11Y_004 — Keep label click separate from square selection
**Description / Module:** Prevent duplicated interaction / Strategy card. **Type:** Regression · Usability. **Priority / Severity:** Critical / High. **Traceability:** Approved B UX.  
**Preconditions / Data:** Unselected collapsed card.  
**Steps:** 1. Click label.  
**Expected Results:** Details open; selection square stays unselected.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Existing chart-controller test.

### TC_A11Y_005 — Name Save chooser as dialog
**Description / Module:** Verify chooser semantics / Save UI. **Type:** Non-Functional. **Priority / Severity:** High / Medium. **Traceability:** R-UI-02.  
**Preconditions / Data:** Two selected strategies; Save clicked.  
**Steps:** 1. Inspect chooser role/name.  
**Expected Results:** Role=`dialog`; accessible name=`Save combined strategy`.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Added accessibility contract.

### TC_A11Y_006 — Focus first Save destination
**Description / Module:** Verify predictable focus entry / Save UI. **Type:** Usability. **Priority / Severity:** High / Medium. **Traceability:** R-UI-02.  
**Preconditions / Data:** Save chooser closed.  
**Steps:** 1. Activate Save by keyboard.  
**Expected Results:** `CREATE NEW STRATEGY` receives focus.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Focus contract.

### TC_A11Y_007 — Cancel chooser with Escape
**Description / Module:** Verify keyboard escape route / Save UI. **Type:** Negative · Usability. **Priority / Severity:** High / Medium. **Traceability:** R-SAVE-04.  
**Preconditions / Data:** Save chooser open.  
**Steps:** 1. Press Escape.  
**Expected Results:** Chooser closes; preview remains; no mutation occurs.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Escape contract.

### TC_A11Y_008 — Return focus to Save after cancel
**Description / Module:** Verify focus recovery / Save UI. **Type:** Usability. **Priority / Severity:** Medium / Medium. **Traceability:** R-UI-02.  
**Preconditions / Data:** Chooser open from Save.  
**Steps:** 1. Activate Cancel.  
**Expected Results:** Focus returns to Save button.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Cancel and Escape share close routine.

### TC_A11Y_009 — Show visible focus indicator
**Description / Module:** Verify keyboard focus visibility / Preview controls. **Type:** Non-Functional · Usability. **Priority / Severity:** High / Medium. **Traceability:** R-UI-02.  
**Preconditions / Data:** Keyboard focus on Compare, Save, Clear, or chooser option.  
**Steps:** 1. Tab through controls.  
**Expected Results:** 2 px `--plan-ink` outline appears with 1 px offset.  
**Actual Results / Status:** Automated PASS.  
**Notes:** CSS focus-visible contract.

### TC_A11Y_010 — Announce Save status politely
**Description / Module:** Verify non-interruptive status feedback / Save UI. **Type:** Non-Functional. **Priority / Severity:** Medium / Medium. **Traceability:** R-UI-02.  
**Preconditions / Data:** Save starts or fails.  
**Steps:** 1. Inspect summary live-region setting. 2. Trigger save failure.  
**Expected Results:** Summary uses `aria-live=polite`; failure text remains visible.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Screen-reader announcement contract.

---

## TradingView Axis and Ladder

### TC_AXIS_001 — Use native right-axis labels as density source
**Description / Module:** Verify single source of truth / Ladder membership. **Type:** Functional · Integration. **Priority / Severity:** Critical / Critical. **Traceability:** Global axis-first decision.  
**Preconditions / Data:** TD-AXIS-DENSE.  
**Steps:** 1. Capture stable axis. 2. Build membership.  
**Expected Results:** Displayed rows derive from visible native labels and real contracts only.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Native-axis membership tests.

### TC_AXIS_002 — Ignore timeframe-specific strike tables
**Description / Module:** Verify one rule across timeframes / Ladder membership. **Type:** Regression. **Priority / Severity:** Critical / Critical. **Traceability:** No 15m/1h strike-spacing rule.  
**Preconditions / Data:** Same axis geometry on 15m and 4h.  
**Steps:** 1. Capture 15m membership. 2. Capture 4h membership.  
**Expected Results:** Membership is identical when axis labels are identical.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Timeframe-independent contract.

### TC_AXIS_003 — Show 50-point real contracts on dense axis
**Description / Module:** Verify market strike lattice / Ladder membership. **Type:** Functional. **Priority / Severity:** Critical / High. **Traceability:** Market contracts remain fixed.  
**Preconditions / Data:** TD-AXIS-DENSE; contracts every 50.  
**Steps:** 1. Build rows from 10-point labels.  
**Expected Results:** Rows appear at real 50-point contracts; fake 10-point strikes never appear.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Real-contract filtering.

### TC_AXIS_004 — Skip intermediate strikes on wide axis
**Description / Module:** Verify zoom-out snap / Ladder membership. **Type:** Boundary · UAT. **Priority / Severity:** Critical / High. **Traceability:** Axis-aligned snap rule.  
**Preconditions / Data:** TD-AXIS-WIDE.  
**Steps:** 1. Zoom out. 2. Refresh placement.  
**Expected Results:** Rows align to wide visible grid; intermediate contracts are omitted from display, not deleted from chain.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Native zoom controls density.

### TC_AXIS_005 — Restore grid slot hidden by live-price marker
**Description / Module:** Verify obscured-label inference / Axis capture. **Type:** Regression · Integration. **Priority / Severity:** High / High. **Traceability:** Rounded live-box rule.  
**Preconditions / Data:** Live price box covers one expected native label.  
**Steps:** 1. Capture neighboring labels and live marker. 2. Build membership.  
**Expected Results:** Missing rounded grid slot is restored; marker value does not distort grid.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Existing marker regression.

### TC_AXIS_006 — Ignore distorted live-price marker
**Description / Module:** Prevent marker from changing snap interval / Axis capture. **Type:** Negative · Regression. **Priority / Severity:** High / High. **Traceability:** Native-grid dominance.  
**Preconditions / Data:** Marker conflicts with neighboring grid gaps.  
**Steps:** 1. Capture axis and marker.  
**Expected Results:** Native grid wins; marker is excluded from interval calculation.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Marker-conflict test.

### TC_AXIS_007 — Keep exact real ATM inside visible range
**Description / Module:** Verify ATM pinning / Ladder membership. **Type:** Functional. **Priority / Severity:** High / High. **Traceability:** ATM remains highlighted.  
**Preconditions / Data:** ATM contract lies between displayed grid labels but inside visible price range.  
**Steps:** 1. Build membership.  
**Expected Results:** Real ATM row is included once and highlighted.  
**Actual Results / Status:** Automated PASS.  
**Notes:** ATM pin test.

### TC_AXIS_008 — Do not pin off-screen ATM
**Description / Module:** Prevent hidden contract injection / Ladder membership. **Type:** Negative. **Priority / Severity:** High / High. **Traceability:** Visible-axis boundary.  
**Preconditions / Data:** Exact ATM is outside visible price range.  
**Steps:** 1. Build membership.  
**Expected Results:** ATM row is not displayed; no edge-clamped fake row appears.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Off-screen ATM test.

### TC_AXIS_009 — Support decimal strikes on non-NIFTY market
**Description / Module:** Verify global-market architecture / Ladder membership. **Type:** Integration · Boundary. **Priority / Severity:** Critical / High. **Traceability:** Any pair/index design.  
**Preconditions / Data:** Instrument with real decimal strikes and stable decimal axis.  
**Steps:** 1. Load chain. 2. Build membership.  
**Expected Results:** Exact decimal contracts display; NIFTY 50-point assumptions do not leak.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Non-NIFTY decimal contract test.

### TC_AXIS_010 — Remove artificial row cap
**Description / Module:** Verify unlimited visible membership / Ladder UI. **Type:** Boundary · Regression. **Priority / Severity:** Critical / High. **Traceability:** Delete 13-strike rule forever.  
**Preconditions / Data:** Axis exposes more than 13 real contract slots.  
**Steps:** 1. Build membership. 2. Count rows.  
**Expected Results:** Every axis-aligned real strike displays; no `13 STRIKES OUTSIDE` warning exists.  
**Actual Results / Status:** Automated PASS.  
**Notes:** No-cap regression.

---

## Combined Preview

### TC_PREVIEW_001 — Withhold combined preview for one strategy
**Description / Module:** Prevent fake combined economics / Preview. **Type:** Negative. **Priority / Severity:** High / High. **Traceability:** R-PREVIEW-01.  
**Preconditions / Data:** One active strategy selected.  
**Steps:** 1. Select one square.  
**Expected Results:** Square fills; combined preview and Save bar stay absent.  
**Actual Results / Status:** Automated and live PASS.  
**Notes:** One-selection threshold.

### TC_PREVIEW_002 — Build preview from two compatible strategies
**Description / Module:** Verify primary preview path / Preview. **Type:** Smoke · Functional. **Priority / Severity:** Critical / Critical. **Traceability:** R-PREVIEW-01.  
**Preconditions / Data:** First two records from TD-STRATEGIES-3.  
**Steps:** 1. Select first square. 2. Select second square.  
**Expected Results:** `2 SELECTED` appears; combined roots use both strategies exactly once.  
**Actual Results / Status:** Automated PASS; live blocked by one active strategy.  
**Notes:** Integration harness.

### TC_PREVIEW_003 — Build preview from three strategies
**Description / Module:** Verify no two-strategy cap / Preview. **Type:** Boundary · Functional. **Priority / Severity:** High / High. **Traceability:** R-PREVIEW-01.  
**Preconditions / Data:** TD-STRATEGIES-3.  
**Steps:** 1. Select all three squares.  
**Expected Results:** `3 SELECTED`; all three remain selected; all unique legs participate.  
**Actual Results / Status:** Automated PASS; live blocked by one active strategy.  
**Notes:** Multi-selection contract.

### TC_PREVIEW_004 — Deduplicate repeated strategy identity
**Description / Module:** Prevent duplicate economics / Preview. **Type:** Negative · Regression. **Priority / Severity:** Critical / Critical. **Traceability:** R-PREVIEW-02.  
**Preconditions / Data:** Selected IDs `[s1,s1,s2]`.  
**Steps:** 1. Normalize selection.  
**Expected Results:** Effective order is `[s1,s2]`; s1 legs count once.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Expanded selection test.

### TC_PREVIEW_005 — Reject mixed instrument preview
**Description / Module:** Prevent cross-market economics / Preview. **Type:** Negative · Integration. **Priority / Severity:** Critical / Critical. **Traceability:** Instrument isolation.  
**Preconditions / Data:** TD-INCOMPATIBLE with different instruments.  
**Steps:** 1. Select both strategies.  
**Expected Results:** Status=`INCOMPATIBLE`; no combined roots or Save action.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Existing compatibility test.

### TC_PREVIEW_006 — Reject mixed expiry preview
**Description / Module:** Prevent cross-expiry economics / Preview. **Type:** Negative · Integration. **Priority / Severity:** Critical / Critical. **Traceability:** Exact-expiry isolation.  
**Preconditions / Data:** TD-INCOMPATIBLE with different exact expiries.  
**Steps:** 1. Select both strategies.  
**Expected Results:** Status=`INCOMPATIBLE`; selection remains visible for correction.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Existing expiry test.

### TC_PREVIEW_007 — Block stale-quote preview
**Description / Module:** Prevent stale economics / Preview. **Type:** Negative · Safety. **Priority / Severity:** Critical / Critical. **Traceability:** Seller safety.  
**Preconditions / Data:** Quote age exceeds configured maximum.  
**Steps:** 1. Select two strategies.  
**Expected Results:** Status=`INCOMPLETE`; disclosure=`LIVE QUOTES STALE · REFRESH REQUIRED`; Save disabled.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Staleness test.

### TC_PREVIEW_008 — Block missing-quote preview
**Description / Module:** Prevent partial economics / Preview. **Type:** Negative. **Priority / Severity:** Critical / Critical. **Traceability:** Seller safety.  
**Preconditions / Data:** One selected leg has no finite positive current quote.  
**Steps:** 1. Select two strategies.  
**Expected Results:** Missing leg is listed; roots and current P&L are withheld; selection remains.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Missing-quote test.

### TC_PREVIEW_009 — Preserve exact roots while rounding labels
**Description / Module:** Separate economics from display / Preview. **Type:** Regression. **Priority / Severity:** Critical / Critical. **Traceability:** Exact-rail rule.  
**Preconditions / Data:** Roots `24433.49` and `25001.51`.  
**Steps:** 1. Build display levels.  
**Expected Results:** Exact values remain unchanged; labels show `24,433` and `25,002`.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Expanded precision test.

### TC_PREVIEW_010 — Toggle Compare independently
**Description / Module:** Verify comparison is not selection or save / Preview. **Type:** Functional · Usability. **Priority / Severity:** High / Medium. **Traceability:** Approved Compare UX.  
**Preconditions / Data:** Valid combined preview.  
**Steps:** 1. Activate Compare. 2. Deactivate Compare.  
**Expected Results:** Original rails appear/disappear; selected IDs, combined roots, and stored strategies remain unchanged.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Controller state test.

---

## Save, Versioning, and History

### TC_VERSION_001 — Require explicit Save destination
**Description / Module:** Prevent silent merge behavior / Versioning. **Type:** Negative · UAT. **Priority / Severity:** Critical / Critical. **Traceability:** R-SAVE-02.  
**Preconditions / Data:** Two selected compatible strategies.  
**Steps:** 1. Click Save.  
**Expected Results:** Chooser opens; no mutation occurs until Create New or Merge Into is chosen.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Chart Save contract.

### TC_VERSION_002 — Create new permanent strategy
**Description / Module:** Verify new-strategy merge / Versioning. **Type:** Functional · Integration. **Priority / Severity:** Critical / Critical. **Traceability:** R-SAVE-03.  
**Preconditions / Data:** TD-STRATEGIES-3; choose first two.  
**Steps:** 1. Click Save. 2. Choose `CREATE NEW STRATEGY`.  
**Expected Results:** One immutable destination version is created; both sources archive; preview clears.  
**Actual Results / Status:** Automated PASS; live not executed against real history.  
**Notes:** Storage integration harness.

### TC_VERSION_003 — Merge into selected existing strategy
**Description / Module:** Verify explicit destination merge / Versioning. **Type:** Functional · Integration. **Priority / Severity:** Critical / Critical. **Traceability:** R-SAVE-03.  
**Preconditions / Data:** Two selected strategies s1 and s2.  
**Steps:** 1. Click Save. 2. Choose `MERGE INTO T1`.  
**Expected Results:** T1 receives new version; source strategies archive after destination version commits.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Atomic merge test.

### TC_VERSION_004 — Cancel without mutation
**Description / Module:** Verify temporary preview remains temporary / Versioning. **Type:** Negative · Regression. **Priority / Severity:** Critical / High. **Traceability:** R-SAVE-04.  
**Preconditions / Data:** Save chooser open.  
**Steps:** 1. Click Cancel.  
**Expected Results:** Chooser closes; selection and preview remain; mutation count stays zero.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Cancel contract.

### TC_VERSION_005 — Preserve preview after storage failure
**Description / Module:** Verify recoverable error state / Versioning. **Type:** Negative · Regression. **Priority / Severity:** Critical / Critical. **Traceability:** R-SAVE-04.  
**Preconditions / Data:** TD-FAIL-STORAGE.  
**Steps:** 1. Choose a permanent destination.  
**Expected Results:** `SAVE FAILED · Storage unavailable`; choices re-enable; preview and sources remain unchanged.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Failure harness.

### TC_VERSION_006 — Deduplicate repeated source IDs in command
**Description / Module:** Prevent double ownership / Versioning. **Type:** Negative. **Priority / Severity:** Critical / Critical. **Traceability:** One leg/strategy ownership.  
**Preconditions / Data:** Selected IDs `[s1,s1,s2]`.  
**Steps:** 1. Build Save command.  
**Expected Results:** `sourceStrategyIds` equals `[s1,s2]`.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Expanded command test.

### TC_VERSION_007 — Reject blank destination identity
**Description / Module:** Prevent anonymous permanent versions / Versioning. **Type:** Negative. **Priority / Severity:** Critical / Critical. **Traceability:** Immutable identity rule.  
**Preconditions / Data:** Destination strategy ID empty.  
**Steps:** 1. Build Save command.  
**Expected Results:** Command throws `Save destination identity is invalid`; book is untouched.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Expanded validation test.

### TC_VERSION_008 — Split merged strategy through new version
**Description / Module:** Verify reversible grouping / Versioning. **Type:** Functional · Integration. **Priority / Severity:** High / High. **Traceability:** Approved split requirement.  
**Preconditions / Data:** Active merged strategy with two leg IDs.  
**Steps:** 1. Select one leg. 2. Choose explicit split destination.  
**Expected Results:** New source and destination versions preserve immutable prior version; one active owner per leg.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Split builder/store tests.

### TC_VERSION_009 — Restore historical version without rewriting history
**Description / Module:** Verify version control / History. **Type:** Regression · Integration. **Priority / Severity:** High / High. **Traceability:** Version restore rule.  
**Preconditions / Data:** Archived strategy with two versions.  
**Steps:** 1. Choose older version. 2. Restore.  
**Expected Results:** New current version is created; selected historical version remains byte-for-byte unchanged.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Restore tests.

### TC_VERSION_010 — Keep archived and expired strategies in ledger
**Description / Module:** Verify durable history / Ledger. **Type:** UAT · Regression. **Priority / Severity:** High / High. **Traceability:** Ledger-history decision.  
**Preconditions / Data:** One merged-source archive and one expired strategy.  
**Steps:** 1. Open history view.  
**Expected Results:** Both rows remain inspectable with reason, expiry, update time, and version count; neither appears on active chart.  
**Actual Results / Status:** Automated PASS.  
**Notes:** History/view-model tests.

---

## Performance and Scale

### TC_PERF_001 — Project 10,000 break-evens under 500 ms
**Description / Module:** Verify projection CPU budget / Strategy geometry. **Type:** Non-Functional · Performance. **Priority / Severity:** High / High. **Traceability:** Chart responsiveness.  
**Preconditions / Data:** TD-PERF; linear safe axis.  
**Steps:** 1. Project 10,000 prices. 2. Measure elapsed time.  
**Expected Results:** All results are non-hidden and total time is below 500 ms.  
**Actual Results / Status:** Automated PASS.  
**Notes:** New performance contract.

### TC_PERF_002 — Place 5,000 cards under 500 ms
**Description / Module:** Verify packing CPU budget / Strategy geometry. **Type:** Non-Functional · Performance. **Priority / Severity:** High / High. **Traceability:** Chart responsiveness.  
**Preconditions / Data:** TD-PERF; 150,000 px synthetic plot.  
**Steps:** 1. Stack 5,000 cards. 2. Measure elapsed time.  
**Expected Results:** 5,000 deterministic results return below 500 ms.  
**Actual Results / Status:** Automated PASS.  
**Notes:** New performance contract.

### TC_PERF_003 — Keep 1,000 mixed-height cards separated
**Description / Module:** Verify scale geometry / Strategy packing. **Type:** Boundary · Performance. **Priority / Severity:** High / High. **Traceability:** R-LAYOUT-01.  
**Preconditions / Data:** 1,000 cards; every seventh card 78 px, others 24 px.  
**Steps:** 1. Stack cards. 2. Check every adjacent pair.  
**Expected Results:** Every pair preserves at least 6 px gap; ordering stays stable.  
**Actual Results / Status:** Automated PASS.  
**Notes:** New scale test.

### TC_PERF_004 — Toggle 1,000 selectors under 500 ms
**Description / Module:** Verify selection state performance / Preview controller. **Type:** Non-Functional · Performance. **Priority / Severity:** Medium / Medium. **Traceability:** Multi-strategy scalability.  
**Preconditions / Data:** IDs s0–s999.  
**Steps:** 1. Toggle all selectors on. 2. Measure time.  
**Expected Results:** 1,000 unique ordered IDs remain; elapsed time below 500 ms.  
**Actual Results / Status:** Automated PASS.  
**Notes:** New controller budget.

### TC_PERF_005 — Reuse cached chain during zoom
**Description / Module:** Prevent network work during layout changes / Ladder controller. **Type:** Performance · Integration. **Priority / Severity:** Critical / High. **Traceability:** Manual-refresh architecture.  
**Preconditions / Data:** Valid cached chain and new stable axis.  
**Steps:** 1. Zoom chart. 2. Capture request count.  
**Expected Results:** Membership rebuilds from cache; chain request count does not increase.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Existing zoom test.

### TC_PERF_006 — Reuse cached chain during timeframe change
**Description / Module:** Prevent duplicate fetch / Ladder controller. **Type:** Performance · Regression. **Priority / Severity:** Critical / High. **Traceability:** Axis-only rule.  
**Preconditions / Data:** Valid cached chain; timeframe changes with same instrument/expiry.  
**Steps:** 1. Change timeframe. 2. Capture request count.  
**Expected Results:** Axis recaptures; chain request count remains unchanged.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Existing timeframe-cache test.

### TC_PERF_007 — Read canvas geometry once per frame
**Description / Module:** Limit observer work / Axis observer. **Type:** Non-Functional · Performance. **Priority / Severity:** High / Medium. **Traceability:** Rendering efficiency.  
**Preconditions / Data:** Multiple axis text operations in one animation frame.  
**Steps:** 1. Publish repeated operations. 2. Count geometry reads.  
**Expected Results:** Canvas geometry is read once for that frame.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Axis-observer regression.

### TC_PERF_008 — Coalesce paint burst to latest complete axis
**Description / Module:** Prevent intermediate redraw churn / Axis observer. **Type:** Performance · Regression. **Priority / Severity:** High / High. **Traceability:** Stable-axis rule.  
**Preconditions / Data:** Animated zoom emits multiple incomplete then complete paints.  
**Steps:** 1. Feed paint burst. 2. Inspect published axis.  
**Expected Results:** Latest complete burst wins; stale ticks do not accumulate.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Paint-burst tests.

### TC_PERF_009 — Avoid automatic retry after refresh failure
**Description / Module:** Prevent request storms / Refresh lifecycle. **Type:** Negative · Performance. **Priority / Severity:** Critical / High. **Traceability:** Manual-only refresh.  
**Preconditions / Data:** TD-FAIL-CHAIN.  
**Steps:** 1. Click Refresh once. 2. Wait past retry windows.  
**Expected Results:** One request occurs; no automatic retry or debugger activation.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Single-shot failure test.

### TC_PERF_010 — Keep popup open free of data fetch
**Description / Module:** Prevent toolbar click side effects / Popup lifecycle. **Type:** Performance · Smoke. **Priority / Severity:** High / Medium. **Traceability:** Refresh-only action design.  
**Preconditions / Data:** Valid TradingView tab.  
**Steps:** 1. Open extension popup. 2. Inspect request counters.  
**Expected Results:** No chain, position, trade, or seller refresh request occurs until Refresh is clicked.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Negative UI action integration.

---

## Resilience and Recovery

### TC_RESILIENCE_001 — Keep prior rows after refresh failure
**Description / Module:** Verify fail-safe display / Ladder refresh. **Type:** Negative · Regression. **Priority / Severity:** Critical / High. **Traceability:** Preserve last valid data.  
**Preconditions / Data:** Valid rows already displayed; TD-FAIL-CHAIN.  
**Steps:** 1. Click Refresh.  
**Expected Results:** Failure message appears; prior option numbers remain; rows do not become zero/blank.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Existing refresh-failure test.

### TC_RESILIENCE_002 — Hide unplaced rows during render transaction
**Description / Module:** Prevent top-left flash / Ladder placement. **Type:** Regression. **Priority / Severity:** Critical / High. **Traceability:** Top-left strip fix.  
**Preconditions / Data:** Fresh render before coordinates resolve.  
**Steps:** 1. Start render. 2. Inspect row visibility before placement commit.  
**Expected Results:** No row becomes visible at default top-left coordinate.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Render-transaction regression.

### TC_RESILIENCE_003 — Fail closed on unsafe axis
**Description / Module:** Prevent wrong price placement / Strategy geometry. **Type:** Negative · Safety. **Priority / Severity:** Critical / Critical. **Traceability:** Exact-axis safety.  
**Preconditions / Data:** NaN price or inverted axis range.  
**Steps:** 1. Project break-even.  
**Expected Results:** Mode=`HIDDEN`, reason=`UNSAFE_AXIS`; no rail/card is drawn.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Expanded unsafe-axis test.

### TC_RESILIENCE_004 — Preserve latest rebuild against stale refresh
**Description / Module:** Prevent old async result overwrite / Ladder controller. **Type:** Concurrency · Regression. **Priority / Severity:** Critical / Critical. **Traceability:** Generation safety.  
**Preconditions / Data:** Old LTP refresh and newer rebuild overlap.  
**Steps:** 1. Start old refresh. 2. Complete rebuild. 3. Resolve old refresh.  
**Expected Results:** Old result is discarded; new membership and status remain.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Existing generation test.

### TC_RESILIENCE_005 — Abort hung refresh during rebuild
**Description / Module:** Recover from stalled request / Ladder controller. **Type:** Negative · Integration. **Priority / Severity:** High / High. **Traceability:** Request cancellation.  
**Preconditions / Data:** Refresh promise hangs.  
**Steps:** 1. Start refresh. 2. Trigger rebuild.  
**Expected Results:** Hung signal aborts; rebuild succeeds; later refresh can run.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Existing abort test.

### TC_RESILIENCE_006 — Ignore stale failed request status
**Description / Module:** Prevent false offline state / Ladder status. **Type:** Concurrency · Regression. **Priority / Severity:** High / High. **Traceability:** Status generation safety.  
**Preconditions / Data:** New rebuild reaches LIVE before old request rejects.  
**Steps:** 1. Complete rebuild. 2. Reject old request.  
**Expected Results:** Final status remains LIVE; stale failure cannot set STALE.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Existing stale-failure test.

### TC_RESILIENCE_007 — Preserve preview on missing quotes
**Description / Module:** Keep user correction context / Combined preview. **Type:** Negative · Usability. **Priority / Severity:** High / Medium. **Traceability:** R-SAVE-04.  
**Preconditions / Data:** Two selected; one quote missing.  
**Steps:** 1. Build preview.  
**Expected Results:** Selection squares remain; incomplete reason displays; Save stays disabled.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Missing-quote behavior.

### TC_RESILIENCE_008 — Reject malformed stored strategy data safely
**Description / Module:** Prevent storage corruption propagation / Strategy store. **Type:** Negative · Security. **Priority / Severity:** Critical / Critical. **Traceability:** Storage normalization.  
**Preconditions / Data:** Malformed top-level storage plus one valid mutation.  
**Steps:** 1. Load book. 2. Apply valid command.  
**Expected Results:** Malformed evidence remains quarantined/preserved; valid state does not delete unrelated data.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Background queue tests.

### TC_RESILIENCE_009 — Keep duplicate command idempotent
**Description / Module:** Prevent repeated merge/add / Strategy store. **Type:** Regression · Concurrency. **Priority / Severity:** Critical / Critical. **Traceability:** Command idempotency.  
**Preconditions / Data:** Same command ID submitted twice.  
**Steps:** 1. Apply command. 2. Apply identical command again.  
**Expected Results:** Book changes once; no duplicate version, leg, or archive event.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Service-worker/store idempotency tests.

### TC_RESILIENCE_010 — Recover after extension reload
**Description / Module:** Verify content context replacement / Chrome lifecycle. **Type:** Smoke · Regression. **Priority / Severity:** High / High. **Traceability:** Build reload workflow.  
**Preconditions / Data:** Extension reloaded from `chrome://extensions`; TradingView tab open.  
**Steps:** 1. Reload TradingView tab. 2. Click Refresh Ladder.  
**Expected Results:** Root recreates once; rows and active strategies restore without duplicate overlays.  
**Actual Results / Status:** Live PASS.  
**Notes:** Final-build Chrome reload smoke.

---

## Broker and Security Safety

### TC_SAFETY_001 — Expose no broker order verbs in chart modules
**Description / Module:** Verify read-only architecture / Strategy UI. **Type:** Security · Regression. **Priority / Severity:** Critical / Critical. **Traceability:** R-SAFETY-01.  
**Preconditions / Data:** Strategy chart, preview, and panel source.  
**Steps:** 1. Scan exported code for order actions.  
**Expected Results:** No `placeOrder`, `modifyOrder`, `cancelOrder`, or `exitOrder`.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Expanded safety contract.

### TC_SAFETY_002 — Keep Save local to strategy storage
**Description / Module:** Verify permanent Save boundary / Versioning. **Type:** Security · Integration. **Priority / Severity:** Critical / Critical. **Traceability:** R-SAFETY-01.  
**Preconditions / Data:** Two disposable compatible strategies.  
**Steps:** 1. Save combined strategy. 2. Inspect runtime messages/network.  
**Expected Results:** One strategy-book mutation; zero broker or TradingView trade actions.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Integration harness.

### TC_SAFETY_003 — Reject foreign strategy mutation sender
**Description / Module:** Verify sender allowlist / Service worker. **Type:** Security · Negative. **Priority / Severity:** Critical / Critical. **Traceability:** Extension trust boundary.  
**Preconditions / Data:** Mutation from non-TradingView foreign origin.  
**Steps:** 1. Send mutation message.  
**Expected Results:** Request rejects before storage access; book remains unchanged.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Background sender tests.

### TC_SAFETY_004 — Reject spoofed extension sender
**Description / Module:** Verify own-panel identity / Service worker. **Type:** Security · Negative. **Priority / Severity:** Critical / Critical. **Traceability:** Extension trust boundary.  
**Preconditions / Data:** Sender claims extension origin but lacks exact validated context.  
**Steps:** 1. Send mutation message.  
**Expected Results:** Request rejects; no mutation.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Spoofed-sender test.

### TC_SAFETY_005 — Reject invalid expiry before upstream call
**Description / Module:** Prevent ambiguous market request / Bridge. **Type:** Security · Negative. **Priority / Severity:** Critical / Critical. **Traceability:** Exact-expiry rule.  
**Preconditions / Data:** Invalid/non-ISO expiry.  
**Steps:** 1. Request chain/refresh.  
**Expected Results:** Validation fails before positions, trades, or chain upstream call.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Bridge validation tests.

### TC_SAFETY_006 — Reject hostile login URL
**Description / Module:** Prevent arbitrary navigation / Broker bridge. **Type:** Security · Negative. **Priority / Severity:** Critical / Critical. **Traceability:** Login-host allowlist.  
**Preconditions / Data:** Login URL uses hostile domain.  
**Steps:** 1. Return URL from bridge.  
**Expected Results:** URL rejects; no browser tab opens.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Hostile URL test.

### TC_SAFETY_007 — Keep token out of public response
**Description / Module:** Prevent credential leakage / Broker bridge. **Type:** Security. **Priority / Severity:** Critical / Critical. **Traceability:** Credential boundary.  
**Preconditions / Data:** Successful Zerodha callback.  
**Steps:** 1. Inspect callback and status response.  
**Expected Results:** No access token, request token, checksum, or secret appears.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Bridge token tests.

### TC_SAFETY_008 — Fail closed on broker 401 without retry
**Description / Module:** Prevent stale credential reuse / Broker client. **Type:** Security · Negative. **Priority / Severity:** Critical / Critical. **Traceability:** Daily token safety.  
**Preconditions / Data:** Upstream returns 401.  
**Steps:** 1. Call read-only endpoint.  
**Expected Results:** Stale access token clears once; request fails; no automatic retry.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Zerodha client test.

### TC_SAFETY_009 — Preserve unknown-charge disclosure
**Description / Module:** Prevent invented economics / Strategy preview. **Type:** Safety · UAT. **Priority / Severity:** Critical / Critical. **Traceability:** Charges must affect BE.  
**Preconditions / Data:** One selected leg has incomplete charges.  
**Steps:** 1. Build preview.  
**Expected Results:** `EXCLUDING UNKNOWN CHARGES` appears; charges are never guessed as zero-complete.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Charges disclosure tests.

### TC_SAFETY_010 — Keep seller refresh read-only
**Description / Module:** Verify broker interface surface / Zerodha client. **Type:** Security · Integration. **Priority / Severity:** Critical / Critical. **Traceability:** Seller-only safety workflow.  
**Preconditions / Data:** Connected broker session.  
**Steps:** 1. Execute seller refresh. 2. Inspect client calls.  
**Expected Results:** Only positions, trades, and option-chain reads occur; no order operation exists.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Client-surface test.

---

## Chrome and Extension Lifecycle

### TC_LIFECYCLE_001 — Open popup without opening side panel
**Description / Module:** Verify toolbar action / Chrome popup. **Type:** Smoke · Usability. **Priority / Severity:** High / Medium. **Traceability:** Refresh-first toolbar UX.  
**Preconditions / Data:** Active TradingView tab.  
**Steps:** 1. Click Options Ladder icon.  
**Expected Results:** Popup opens; side panel remains closed; Refresh and Open Controls are separate.  
**Actual Results / Status:** Automated and live PASS.  
**Notes:** Popup behavior.

### TC_LIFECYCLE_002 — Refresh only active TradingView tab
**Description / Module:** Prevent cross-tab update / Chrome popup. **Type:** Integration. **Priority / Severity:** Critical / High. **Traceability:** Active-tab scope.  
**Preconditions / Data:** Two TradingView tabs.  
**Steps:** 1. Focus first tab. 2. Click Refresh Ladder.  
**Expected Results:** Only focused tab receives refresh message; other tab state remains.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Popup scope test.

### TC_LIFECYCLE_003 — Disable actions on unsupported tab
**Description / Module:** Verify tab compatibility guard / Chrome popup. **Type:** Negative · Smoke. **Priority / Severity:** High / High. **Traceability:** TradingView-only activation.  
**Preconditions / Data:** Active tab is `https://example.com`.  
**Steps:** 1. Open popup.  
**Expected Results:** Refresh and Open Controls disabled; unsupported status displayed.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Unsupported-tab test.

### TC_LIFECYCLE_004 — Open controls only on exact TradingView host
**Description / Module:** Verify host allowlist / Side panel. **Type:** Security · Integration. **Priority / Severity:** Critical / Critical. **Traceability:** Exact host rule.  
**Preconditions / Data:** `https://www.tradingview.com/...` and lookalike host.  
**Steps:** 1. Trigger Open Controls on each.  
**Expected Results:** Exact HTTPS TradingView opens panel; lookalike never configures panel.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Side-panel host tests.

### TC_LIFECYCLE_005 — Preserve original Options Ladder logo
**Description / Module:** Prevent brand regression / Extension UI. **Type:** Regression · UAT. **Priority / Severity:** High / Medium. **Traceability:** Original-logo decision.  
**Preconditions / Data:** Popup and extension manager.  
**Steps:** 1. Inspect mark path and bundled asset.  
**Expected Results:** `icons/nifty-mark.svg` remains; theme change does not replace logo.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Brand asset test.

### TC_LIFECYCLE_006 — Synchronize one theme across popup panel and chart
**Description / Module:** Verify shared theme state / Theme controller. **Type:** Integration · Regression. **Priority / Severity:** High / High. **Traceability:** Single-toggle rule.  
**Preconditions / Data:** Popup, side panel, and chart open.  
**Steps:** 1. Toggle theme once. 2. Inspect all surfaces.  
**Expected Results:** All three use stored light/dark value; accessible toggle label updates.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Theme controller tests.

### TC_LIFECYCLE_007 — Default invalid theme to dark
**Description / Module:** Verify theme normalization / Theme controller. **Type:** Negative · Regression. **Priority / Severity:** Medium / Medium. **Traceability:** Stable dark default.  
**Preconditions / Data:** Stored theme=`sepia`.  
**Steps:** 1. Initialize controller.  
**Expected Results:** Applied and persisted behavior resolves to dark; no third theme appears.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Theme normalization test.

### TC_LIFECYCLE_008 — Avoid obsolete debugger permission
**Description / Module:** Verify no browser-debugging dependency / Manifest. **Type:** Security · Regression. **Priority / Severity:** Critical / High. **Traceability:** Remove debugger-based auto-fit.  
**Preconditions / Data:** Current manifest.  
**Steps:** 1. Inspect permissions and background messages.  
**Expected Results:** No debugger permission or synthetic price-scale gesture path is active.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Manifest/background tests.

### TC_LIFECYCLE_009 — Load strategy dependencies before content
**Description / Module:** Prevent missing Save UI / Manifest. **Type:** Smoke · Regression. **Priority / Severity:** Critical / High. **Traceability:** Strategy-panel dependency.  
**Preconditions / Data:** Current manifest content-script array.  
**Steps:** 1. Inspect script order.  
**Expected Results:** `strategy-panel.js` loads before `content.js`.  
**Actual Results / Status:** Automated PASS.  
**Notes:** Expanded manifest test.

### TC_LIFECYCLE_010 — Reinitialize without duplicate roots
**Description / Module:** Prevent duplicate overlays after reload / Content lifecycle. **Type:** Regression · Compatibility. **Priority / Severity:** High / High. **Traceability:** Extension reload stability.  
**Preconditions / Data:** Existing TradingView chart; extension reloaded.  
**Steps:** 1. Reload chart. 2. Refresh Ladder twice. 3. Count owned roots.  
**Expected Results:** One ladder root, one strategy-rail root, one risk root; rows update in place.  
**Actual Results / Status:** Automated and live PASS.  
**Notes:** Lifecycle harness and Chrome smoke.

---

## Execution Tiers

- **Every commit:** TC_UI_001, TC_UI_004, TC_TOKEN_001–004, TC_A11Y_001–007, TC_AXIS_001, TC_AXIS_010, TC_PREVIEW_001–002, TC_VERSION_001–005, TC_PERF_001–004, TC_RESILIENCE_001–003, TC_SAFETY_001–004, TC_LIFECYCLE_001–003.
- **Every pull request:** all 100 automated/contract cases.
- **Release candidate:** all 100 plus live light/dark captures, real three-strategy UAT, and broker-connected read-only smoke.

## Execution Summary

- **Cases added:** 100.
- **Executable tests added:** 31 explicit UI/token/performance/safety contracts.
- **Existing automated evidence reused:** exact matching tests from worktree-wide suite.
- **Fresh full-suite result:** 578 passed, 0 failed, 0 skipped in 2.73 seconds.
- **Performance contract results:** 10,000 axis projections, 5,000 card placements, 1,000 mixed-height collision passes, and 1,000 preview toggles each completed below the 500 ms ceiling.
- **Live Chrome result:** popup rendered in light and dark modes; toggle accessible name changed correctly; ARB Desk surface, ink, warning, profit, and loss rules remained readable; original light mode restored after test.
- **Live recovery result:** stale `"Extension context invalidated"` state cleared after extension and chart reload; ladder returned without duplicate roots.
- **Live execution limits:** real three-strategy permanent Save remains excluded because it archives user strategy history. Use disposable QA storage for release UAT.
