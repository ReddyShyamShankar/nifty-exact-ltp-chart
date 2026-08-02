# Options Ladder — Screenshot Defect Regression Pack

## Scope

Seventy independent regression cases derived from user screenshot reviews. Pack distinguishes visual presentation, interaction behavior, product rules, runtime stability, financial rules, design-system consistency, and requirement interpretation.

## Shared Test Data

- **TD-CHART-LIGHT:** TradingView NIFTY chart, supported expiry, `uiTheme=light`, 1440×900.
- **TD-CHART-DARK:** Same chart with `uiTheme=dark`.
- **TD-AXIS-DENSE:** Visible right-axis labels every 10 points; contracts every 50 points.
- **TD-AXIS-MEDIUM:** Visible right-axis labels every 100 points.
- **TD-AXIS-WIDE:** Visible right-axis labels every 200 points.
- **TD-STRATEGIES-3:** Three active strategies for same instrument and exact expiry.
- **TD-STRATEGY-MIXED:** Strategies with different instruments or expiries.
- **TD-ARCHIVED:** One active and two archived strategies with historical versions.
- **TD-CHARGES:** Known charges for every leg.
- **TD-UNKNOWN-CHARGES:** At least one leg lacks complete charge evidence.

## Coverage Summary

| IDs | Error class | Cases |
|---|---|---:|
| TC_SUI_001–010 | UI errors | 10 |
| TC_SUX_001–010 | UX errors | 10 |
| TC_SPL_001–010 | Product-logic errors | 10 |
| TC_SRT_001–010 | Technical/runtime errors | 10 |
| TC_SBR_001–010 | Data/business-rule errors | 10 |
| TC_SDS_001–010 | Design-system errors | 10 |
| TC_SRI_001–010 | Requirement-interpretation errors | 10 |

---

## UI Errors

### TC_SUI_001 — Hide ladder rows until coordinates commit
**Description / Module:** Prevent orphan strip at top-left / Ladder renderer.  
**Type:** Regression · Negative. **Priority / Severity:** Critical / High. **Traceability:** Screenshot top-left placement defect.  
**Preconditions:** TD-CHART-LIGHT; fresh extension initialization.  
**Steps:** 1. Start render before axis placement. 2. Inspect new row visibility. 3. Complete placement.  
**Test Data:** One row at strike 24,300.  
**Expected Results:** Row stays hidden until finite `top` and `right` exist; row never appears at `(0,0)`.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Automation candidate.

### TC_SUI_002 — Keep every ladder row in one column
**Description / Module:** Prevent alternating two-column ladder / Ladder layout.  
**Type:** Regression · UAT. **Priority / Severity:** Critical / High. **Traceability:** Approved single-column rule.  
**Preconditions:** TD-AXIS-DENSE.  
**Steps:** 1. Refresh ladder. 2. Record every row’s right edge.  
**Test Data:** At least 20 visible contracts.  
**Expected Results:** Every row uses lane `0` and same right edge; no second column appears.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Automated geometry.

### TC_SUI_003 — Draw financial rail below cards and rows
**Description / Module:** Prevent dotted line crossing text / Layering.  
**Type:** Regression · Usability. **Priority / Severity:** High / High. **Traceability:** Screenshot dashed-line defect.  
**Preconditions:** Break-even rail crosses ladder row and expanded card.  
**Steps:** 1. Read z-index values. 2. Inspect crossing pixels.  
**Test Data:** Strategy BE at visible ladder strike.  
**Expected Results:** Rail layer is below ladder row and strategy card; text remains unobstructed.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** CSS contract.

### TC_SUI_004 — Prevent expanded strategy-card overlap
**Description / Module:** Verify variable-height packing / Strategy chart.  
**Type:** Boundary · Regression. **Priority / Severity:** Critical / High. **Traceability:** Screenshot card-collision defect.  
**Preconditions:** Two nearby strategies; first has one leg plus disclosure.  
**Steps:** 1. Expand first card. 2. Measure both rectangles.  
**Test Data:** Heights 78 px and 24 px; gap 6 px.  
**Expected Results:** Rectangles do not intersect; connectors preserve exact rail coordinates.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Automated geometry.

### TC_SUI_005 — Keep warning text readable on warning surfaces
**Description / Module:** Prevent brown-on-black or black-on-brown contrast failure / Theme.  
**Type:** Non-Functional · Accessibility. **Priority / Severity:** High / High. **Traceability:** User white-text correction.  
**Preconditions:** Light and dark themes.  
**Steps:** 1. Inspect warning/disclosure text. 2. Calculate contrast ratio.  
**Test Data:** Approved warning tokens.  
**Expected Results:** Text uses approved readable ink; ratio is at least 4.5:1.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Contrast automation.

### TC_SUI_006 — Keep ATM badge black with white text
**Description / Module:** Preserve ATM membership badge visibility / Ladder row.  
**Type:** Regression · Usability. **Priority / Severity:** High / Medium. **Traceability:** ATM P1 badge screenshot.  
**Preconditions:** ATM row with one position badge.  
**Steps:** 1. Refresh in light mode. 2. Toggle dark mode. 3. Inspect badge.  
**Test Data:** ATM strike 24,300; badge `P1`.  
**Expected Results:** ATM badge uses black fill and white text in both themes; row uses theme-specific ATM color.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Token contract.

### TC_SUI_007 — Keep Compare and Clear visibly button-like
**Description / Module:** Prevent actions blending into preview bar / Preview UI.  
**Type:** Usability · Regression. **Priority / Severity:** Medium / Medium. **Traceability:** Compare/Clear screenshot.  
**Preconditions:** Two strategies selected.  
**Steps:** 1. Open preview bar. 2. Inspect action boundaries and focus states.  
**Test Data:** TD-STRATEGIES-3.  
**Expected Results:** Compare and Clear have distinct borders, padding, labels, hover/focus states, and separate hit targets.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** DOM/CSS check.

### TC_SUI_008 — Never render blank white chooser buttons
**Description / Module:** Prevent empty action controls / Save chooser.  
**Type:** Negative · Regression. **Priority / Severity:** High / High. **Traceability:** Blank white controls screenshot.  
**Preconditions:** Two compatible strategies selected.  
**Steps:** 1. Click Save. 2. Read every chooser option.  
**Test Data:** Create-new plus two merge destinations.  
**Expected Results:** Every visible button has non-empty text and accessible name; no empty white rectangle appears.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** DOM contract.

### TC_SUI_009 — Show Remove only for persisted editable leg
**Description / Module:** Prevent inconsistent action row / Leg editor.  
**Type:** Functional · Regression. **Priority / Severity:** High / Medium. **Traceability:** Remove present/absent screenshots.  
**Preconditions:** One unsaved draft and one persisted leg.  
**Steps:** 1. Open draft editor. 2. Open persisted-leg editor.  
**Test Data:** Same strike, different entry state.  
**Expected Results:** Draft shows Add; persisted leg shows Save and Remove; states never mix.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Editor-state contract.

### TC_SUI_010 — Keep combined label text white on black
**Description / Module:** Correct combined-BE label readability / Strategy chart.  
**Type:** Regression · Accessibility. **Priority / Severity:** High / Medium. **Traceability:** Brown-text-on-black screenshot.  
**Preconditions:** Two selected compatible strategies.  
**Steps:** 1. Build preview. 2. Inspect `COMBINED BE` label.  
**Test Data:** Combined root 24,433.  
**Expected Results:** Label surface uses plan black/dark surface and readable plan ink; warning color may mark border, not reduce text contrast.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Token automation.

---

## UX Errors

### TC_SUX_001 — Extension icon opens refresh popup, not side panel
**Description / Module:** Preserve fast refresh workflow / Chrome action.  
**Type:** UAT · Integration. **Priority / Severity:** Critical / High. **Traceability:** User refresh-only request.  
**Preconditions:** Supported TradingView tab focused.  
**Steps:** 1. Click Options Ladder toolbar icon once.  
**Test Data:** Active chart.  
**Expected Results:** Compact popup opens with Refresh Ladder and Open Controls; side panel stays closed.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Live Chrome.

### TC_SUX_002 — Open side panel only through Open Controls
**Description / Module:** Separate refresh from management / Chrome action.  
**Type:** Functional · UAT. **Priority / Severity:** High / High. **Traceability:** Approved popup workflow.  
**Preconditions:** Action popup open.  
**Steps:** 1. Click Open Controls.  
**Test Data:** Supported TradingView tab.  
**Expected Results:** Side panel opens exactly once; popup closes; ladder remains on chart.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Live Chrome.

### TC_SUX_003 — Collapse strategy details on outside click
**Description / Module:** Restore chart space automatically / Strategy card.  
**Type:** Usability · Regression. **Priority / Severity:** High / Medium. **Traceability:** Expanded-card screenshot.  
**Preconditions:** Strategy card expanded.  
**Steps:** 1. Click empty chart area outside card.  
**Test Data:** One strategy with two legs.  
**Expected Results:** Card returns to collapsed height; strategy, rails, and preview membership remain unchanged.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Interaction test.

### TC_SUX_004 — Separate label click from square selection
**Description / Module:** Prevent P&L-open and preview-selection duplication / Strategy rail.  
**Type:** Functional · Regression. **Priority / Severity:** Critical / High. **Traceability:** B UX correction.  
**Preconditions:** One visible strategy label and adjacent square.  
**Steps:** 1. Click label. 2. Reset. 3. Click square.  
**Test Data:** Strategy T1.  
**Expected Results:** Label opens positions/P&L only; square toggles preview membership only.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Controller test.

### TC_SUX_005 — Synchronize every square for same strategy
**Description / Module:** Keep multi-root strategy selection coherent / Strategy rail.  
**Type:** Integration · Usability. **Priority / Severity:** High / High. **Traceability:** Multiple-BE selector rule.  
**Preconditions:** One strategy has upper and lower break-even rails.  
**Steps:** 1. Click square beside upper rail. 2. Inspect lower rail square.  
**Test Data:** Strategy T1 with two roots.  
**Expected Results:** Both squares show selected state; second click on either clears both.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** DOM synchronization.

### TC_SUX_006 — Allow exactly one leg type per editor selection
**Description / Module:** Prevent simultaneous Call Buy/Put Buy/Call Sell/Put Sell state / Leg editor.  
**Type:** Functional · Negative. **Priority / Severity:** Critical / High. **Traceability:** Four-choice correction.  
**Preconditions:** New-leg editor open.  
**Steps:** 1. Select Buy Call. 2. Select Sell Put.  
**Test Data:** Strike 24,300.  
**Expected Results:** Only latest choice remains active; action cannot represent multiple leg types at once.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Editor controller.

### TC_SUX_007 — Ask destination before permanent combined save
**Description / Module:** Prevent accidental merge / Save workflow.  
**Type:** UAT · Safety. **Priority / Severity:** Critical / Critical. **Traceability:** Combined-BE confirmation question.  
**Preconditions:** Two compatible strategies selected.  
**Steps:** 1. Click Save. 2. Inspect chooser. 3. Cancel.  
**Test Data:** TD-STRATEGIES-3.  
**Expected Results:** Product asks Create New or Merge Into Existing; no permanent mutation occurs before explicit choice.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Mutation spy.

### TC_SUX_008 — Explain unavailable Remove state
**Description / Module:** Avoid unexplained missing action / Leg editor.  
**Type:** Usability · Negative. **Priority / Severity:** Medium / Medium. **Traceability:** Remove inconsistency question.  
**Preconditions:** Unsaved draft editor.  
**Steps:** 1. Open editor. 2. Inspect actions and accessible help.  
**Test Data:** New draft.  
**Expected Results:** Add appears; Remove does not; draft state is clear from action wording and no disabled mystery control appears.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Copy review.

### TC_SUX_009 — Hide archived strategies from active chart
**Description / Module:** Prevent stale T/C/P artifacts / Archive workflow.  
**Type:** Regression · UAT. **Priority / Severity:** Critical / High. **Traceability:** Archived-trade screenshots.  
**Preconditions:** TD-ARCHIVED.  
**Steps:** 1. Archive active strategy. 2. Refresh chart.  
**Test Data:** Strategy with Call and Put badges.  
**Expected Results:** Archived strategy rails, labels, selectors, and leg badges disappear from active chart; history remains accessible.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Store/render integration.

### TC_SUX_010 — Clear temporary combined preview without archiving
**Description / Module:** Distinguish temporary preview from permanent save / Preview bar.  
**Type:** Functional · UAT. **Priority / Severity:** High / High. **Traceability:** Temporary/permanent decision.  
**Preconditions:** Three strategies selected; preview visible.  
**Steps:** 1. Click Clear. 2. Inspect active strategies and history.  
**Test Data:** TD-STRATEGIES-3.  
**Expected Results:** Selection and combined rails clear; all source strategies remain active; history is unchanged.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Controller/store test.

---

## Product-Logic Errors

### TC_SPL_001 — Remove fixed thirteen-strike membership
**Description / Module:** Verify membership has no arbitrary count cap / Axis ladder.  
**Type:** Boundary · Regression. **Priority / Severity:** Critical / Critical. **Traceability:** “Remove 13 strikes forever.”  
**Preconditions:** Axis exposes 25 matching contract prices.  
**Steps:** 1. Build membership. 2. Count selected rows.  
**Test Data:** Twenty-five axis-aligned contracts.  
**Expected Results:** All 25 matching visible contracts are selected; no 13-row truncation occurs.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Core product contract.

### TC_SPL_002 — Ignore timeframe when choosing strike interval
**Description / Module:** Prevent 15m/50 and 1h/100 rule return / Axis ladder.  
**Type:** Regression · Integration. **Priority / Severity:** Critical / Critical. **Traceability:** Axis-only rule.  
**Preconditions:** Same right-axis labels across two timeframes.  
**Steps:** 1. Build on 15m. 2. Build on 4h. 3. Compare strikes.  
**Test Data:** TD-AXIS-MEDIUM.  
**Expected Results:** Both timeframes select identical strikes; timeframe only identifies chart state.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Controller test.

### TC_SPL_003 — Follow dense TradingView axis with market strike step
**Description / Module:** Align 10-point ticks to available 50-point NIFTY contracts / Membership.  
**Type:** Functional · Boundary. **Priority / Severity:** Critical / High. **Traceability:** Dense-axis example.  
**Preconditions:** TD-AXIS-DENSE.  
**Steps:** 1. Build stable axis grid. 2. Intersect with chain strikes.  
**Test Data:** 24,200–24,350 axis; 50-point contracts.  
**Expected Results:** 24,200, 24,250, 24,300, and 24,350 appear; no nonexistent 10-point contract appears.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Market metadata rule.

### TC_SPL_004 — Follow 100-point TradingView axis labels
**Description / Module:** Prevent missing middle strikes / Membership.  
**Type:** Functional · Regression. **Priority / Severity:** Critical / High. **Traceability:** Missing 24,500/24,400/24,200 screenshot.  
**Preconditions:** TD-AXIS-MEDIUM.  
**Steps:** 1. Build membership. 2. Compare with visible axis grid.  
**Test Data:** 23,800–24,600 in 100-point steps.  
**Expected Results:** Every available contract at each visible 100-point grid value appears, including middle strikes.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Axis intersection.

### TC_SPL_005 — Follow 200-point wide-axis labels
**Description / Module:** Reduce rows naturally when zoomed out / Membership.  
**Type:** Boundary · UAT. **Priority / Severity:** High / High. **Traceability:** 26,600/26,400 example.  
**Preconditions:** TD-AXIS-WIDE.  
**Steps:** 1. Zoom out. 2. Rebuild from cached chain.  
**Test Data:** Visible axis values 26,600 and 26,400.  
**Expected Results:** Only matching 200-point grid contracts appear between those labels; intermediate contracts stay hidden.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** No auto-fit.

### TC_SPL_006 — Include ATM only when real contract exists
**Description / Module:** Prevent random-price ATM / Membership.  
**Type:** Functional · Negative. **Priority / Severity:** Critical / Critical. **Traceability:** ATM clarification.  
**Preconditions:** Spot 24,296.60; available contracts every 50.  
**Steps:** 1. Resolve nearest available strike.  
**Test Data:** Contracts 24,250 and 24,300.  
**Expected Results:** ATM resolves to actual 24,300 contract; 24,296.60 is never labeled as strike.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Tie rule explicit.

### TC_SPL_007 — Keep ATM visible when inside visible axis range
**Description / Module:** Preserve unique ATM state during sparse zoom / Membership.  
**Type:** Regression · UAT. **Priority / Severity:** High / High. **Traceability:** Missing ATM report.  
**Preconditions:** Sparse axis grid surrounds ATM without exact ATM tick.  
**Steps:** 1. Build membership. 2. Inspect rows.  
**Test Data:** Axis 24,200 and 24,400; ATM contract 24,300.  
**Expected Results:** ATM 24,300 is added because it lies inside visible range and has real chain data.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Approved exception.

### TC_SPL_008 — Hide off-screen ladder strikes without warning
**Description / Module:** Remove “outside visible range—zoom out” product error / Ladder.  
**Type:** Regression · Usability. **Priority / Severity:** Critical / High. **Traceability:** Repeated zoom-out banner screenshot.  
**Preconditions:** Chain contains many off-screen strikes.  
**Steps:** 1. Refresh at current zoom.  
**Test Data:** Five visible and forty off-screen contracts.  
**Expected Results:** Visible matching strikes render; off-screen strikes stay hidden; no count warning or forced zoom appears.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Status-copy scan.

### TC_SPL_009 — Support any number of compatible strategy selections
**Description / Module:** Prevent two-strategy selection cap / Preview.  
**Type:** Boundary · Functional. **Priority / Severity:** High / High. **Traceability:** “Select all three” request.  
**Preconditions:** TD-STRATEGIES-3.  
**Steps:** 1. Select T1. 2. Select T2. 3. Select T3.  
**Test Data:** Three compatible strategies.  
**Expected Results:** All three remain selected; combined economics use all unique legs.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Selection model.

### TC_SPL_010 — Archive merge sources and preserve immutable history
**Description / Module:** Verify permanent merge semantics / Versioning.  
**Type:** Integration · UAT. **Priority / Severity:** Critical / Critical. **Traceability:** Accepted archive decision.  
**Preconditions:** Two active compatible source strategies.  
**Steps:** 1. Save combined preview into new strategy. 2. Inspect active list and history.  
**Test Data:** T1 + T2 → new destination.  
**Expected Results:** Destination becomes active; both sources become archived; every source version remains readable.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Atomic command.

---

## Technical/Runtime Errors

### TC_SRT_001 — Operate without Chrome debugger permission
**Description / Module:** Prevent “started debugging this browser” banner / Manifest.  
**Type:** Security · Regression. **Priority / Severity:** Critical / High. **Traceability:** Debugging-banner screenshots.  
**Preconditions:** Current unpacked extension.  
**Steps:** 1. Inspect manifest permissions. 2. Refresh ladder.  
**Test Data:** Supported chart.  
**Expected Results:** Manifest excludes `debugger`; refresh never starts browser debugging session.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Static plus live.

### TC_SRT_002 — Recover after extension context invalidation
**Description / Module:** Restore runtime after extension reload / Lifecycle.  
**Type:** Recovery · Regression. **Priority / Severity:** Critical / High. **Traceability:** Context-invalidated screenshot.  
**Preconditions:** TradingView open; extension reloaded from `chrome://extensions`.  
**Steps:** 1. Reload extension. 2. Reload chart. 3. Refresh ladder.  
**Test Data:** Current chain snapshot.  
**Expected Results:** Ladder returns once; no stale-context error remains; popup reports Ready.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Live Chrome.

### TC_SRT_003 — Maintain one owned root per overlay
**Description / Module:** Prevent duplicate ladders and rails / DOM lifecycle.  
**Type:** Regression · Integration. **Priority / Severity:** Critical / High. **Traceability:** Duplicate-root concern.  
**Preconditions:** Extension initialized.  
**Steps:** 1. Refresh three times. 2. Count owned roots.  
**Test Data:** Ladder, break-even, manual-plan, strategy, risk roots.  
**Expected Results:** Each root ID appears at most once; rows update in place.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** DOM count.

### TC_SRT_004 — Remove stale leg badges after archive
**Description / Module:** Prevent C1/P1/C3/P3 remnants / Renderer state.  
**Type:** Regression · Integration. **Priority / Severity:** Critical / High. **Traceability:** Stale badge screenshots.  
**Preconditions:** Active strategy owns displayed badges.  
**Steps:** 1. Archive strategy. 2. Trigger storage redraw.  
**Test Data:** Call and Put legs on visible strikes.  
**Expected Results:** Archived leg badges disappear; no detached badge element remains.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Render-state test.

### TC_SRT_005 — Reject non-finite placement coordinates
**Description / Module:** Prevent misplaced cards/rows / Projection.  
**Type:** Negative · Boundary. **Priority / Severity:** Critical / Critical. **Traceability:** Top-left and overlap defects.  
**Preconditions:** Axis converter returns `NaN`.  
**Steps:** 1. Project row and break-even.  
**Test Data:** `priceToY=NaN`.  
**Expected Results:** Projection hides element with unsafe-axis reason; no CSS `top: NaNpx` appears.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Fail-closed contract.

### TC_SRT_006 — Preserve current values after option refresh failure
**Description / Module:** Prevent blank ladder on network error / Refresh.  
**Type:** Recovery · Negative. **Priority / Severity:** Critical / Critical. **Traceability:** “Existing numbers were kept” screenshot.  
**Preconditions:** Valid rendered chain; next fetch fails once.  
**Steps:** 1. Click Refresh Ladder. 2. Force fetch rejection.  
**Test Data:** Error `Option-number refresh failed`.  
**Expected Results:** Existing rows remain unchanged; explicit error appears; no partial overwrite occurs.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Transaction boundary.

### TC_SRT_007 — Avoid duplicate listener effects after reinitialization
**Description / Module:** Prevent double toggles and duplicate editors / Event lifecycle.  
**Type:** Regression · Performance. **Priority / Severity:** High / High. **Traceability:** Repeated extension reloads.  
**Preconditions:** Content initialization invoked twice.  
**Steps:** 1. Click one strategy square once. 2. Count selection callbacks.  
**Test Data:** Strategy T1.  
**Expected Results:** Selection changes exactly once; one editor/preview update occurs.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Listener ownership.

### TC_SRT_008 — Ignore stale asynchronous axis capture
**Description / Module:** Prevent old timeframe result overwriting new chart / Controller.  
**Type:** Concurrency · Regression. **Priority / Severity:** Critical / High. **Traceability:** Two-second disappearing behavior.  
**Preconditions:** First axis capture delayed; timeframe changes before completion.  
**Steps:** 1. Start first rebuild. 2. Change timeframe. 3. Complete first request.  
**Test Data:** Two generation IDs.  
**Expected Results:** Stale request cannot publish rows; newest generation owns DOM.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Race test.

### TC_SRT_009 — Rebuild from cached chain during zoom
**Description / Module:** Prevent unnecessary network refresh and flicker / Axis controller.  
**Type:** Performance · Integration. **Priority / Severity:** High / Medium. **Traceability:** Zoom behavior.  
**Preconditions:** Valid cached full chain.  
**Steps:** 1. Zoom chart. 2. Observe requests and rows.  
**Test Data:** TD-AXIS-MEDIUM then TD-AXIS-WIDE.  
**Expected Results:** Axis membership changes from cache; network request count remains unchanged.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Controller test.

### TC_SRT_010 — Keep permanent save atomic on storage rejection
**Description / Module:** Prevent half-archived strategy state / Persistence.  
**Type:** Negative · Integration. **Priority / Severity:** Critical / Critical. **Traceability:** Version-control safety.  
**Preconditions:** Storage mutation rejects once.  
**Steps:** 1. Choose permanent merge destination. 2. Force write failure.  
**Test Data:** Error `Storage unavailable`.  
**Expected Results:** Source strategies remain active; no destination/version is partially persisted; retry remains available.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Atomicity test.

---

## Data/Business-Rule Errors

### TC_SBR_001 — Calculate short Call break-even correctly
**Description / Module:** Validate seller Call economics / Payoff.  
**Type:** Functional · Positive. **Priority / Severity:** Critical / Critical. **Traceability:** Seller-only example.  
**Preconditions:** One short Call.  
**Steps:** 1. Calculate expiry break-even.  
**Test Data:** Strike 24,000; collected premium 100; no charges.  
**Expected Results:** Break-even equals 24,100.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Exact arithmetic.

### TC_SBR_002 — Calculate short Put break-even correctly
**Description / Module:** Validate seller Put economics / Payoff.  
**Type:** Functional · Positive. **Priority / Severity:** Critical / Critical. **Traceability:** Seller-only example.  
**Preconditions:** One short Put.  
**Steps:** 1. Calculate expiry break-even.  
**Test Data:** Strike 24,000; collected premium 100; no charges.  
**Expected Results:** Break-even equals 23,900.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Exact arithmetic.

### TC_SBR_003 — Return every combined break-even root
**Description / Module:** Prevent two-root assumption / Payoff engine.  
**Type:** Boundary · Functional. **Priority / Severity:** Critical / Critical. **Traceability:** Any-leg strategy builder.  
**Preconditions:** Multi-leg payoff with more than two zero crossings.  
**Steps:** 1. Combine unique legs. 2. Calculate roots.  
**Test Data:** Piecewise-linear three-root strategy fixture.  
**Expected Results:** Every exact zero crossing is returned in ascending order; none is sampled away.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Engine test.

### TC_SBR_004 — Deduct known charges from P&L and break-even
**Description / Module:** Include transaction costs / Combined preview.  
**Type:** Functional · Regression. **Priority / Severity:** Critical / Critical. **Traceability:** Charges accepted requirement.  
**Preconditions:** TD-CHARGES.  
**Steps:** 1. Build preview with charges. 2. Build same preview without charges.  
**Test Data:** ₹4 known total charges.  
**Expected Results:** Charged P&L is lower by ₹4; break-even roots shift by exact charge offset.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Business calculation.

### TC_SBR_005 — Disclose unknown charges without guessing
**Description / Module:** Preserve financial evidence honesty / Preview.  
**Type:** Negative · UAT. **Priority / Severity:** Critical / High. **Traceability:** `EXCLUDING UNKNOWN CHARGES`.  
**Preconditions:** TD-UNKNOWN-CHARGES.  
**Steps:** 1. Build preview.  
**Test Data:** One complete and one incomplete charge record.  
**Expected Results:** Known charges are included; disclosure appears exactly; missing amount is never estimated.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Evidence boundary.

### TC_SBR_006 — Preserve entry premium while live premium changes
**Description / Module:** Separate immutable trade evidence from refreshed quote / Leg model.  
**Type:** Regression · Integration. **Priority / Severity:** Critical / Critical. **Traceability:** Live-market trade explanation.  
**Preconditions:** Saved leg at premium 100; current quote 150.  
**Steps:** 1. Refresh live quotes. 2. Read stored leg and current P&L.  
**Test Data:** One short option.  
**Expected Results:** Stored entry premium stays 100; live quote becomes 150; P&L reflects change without rewriting entry.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Snapshot immutability.

### TC_SBR_007 — Allow same contract as separate later leg
**Description / Module:** Support repeated strike entries without identity collision / Strategy store.  
**Type:** Functional · Boundary. **Priority / Severity:** High / High. **Traceability:** Same 24,000 strike ten days later.  
**Preconditions:** Existing 24,000 Put leg remains active.  
**Steps:** 1. Add another 24,000 Put with new ID and timestamp.  
**Test Data:** Different premium, time, and leg ID.  
**Expected Results:** Both legs persist independently; lots and economics remain separate.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Identity rule.

### TC_SBR_008 — Prevent one leg identity owning two active strategies
**Description / Module:** Enforce unique ownership / Strategy store.  
**Type:** Negative · Integrity. **Priority / Severity:** Critical / Critical. **Traceability:** Accepted ownership rule.  
**Preconditions:** Leg `leg-1` belongs to active T1.  
**Steps:** 1. Add `leg-1` to active T2.  
**Test Data:** Same stable leg ID.  
**Expected Results:** Command rejects with ownership error; both strategy versions remain unchanged.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Integrity test.

### TC_SBR_009 — Reject mixed instrument or expiry preview
**Description / Module:** Prevent false combined economics / Preview.  
**Type:** Negative · Safety. **Priority / Severity:** Critical / Critical. **Traceability:** Explicit compatibility rule.  
**Preconditions:** TD-STRATEGY-MIXED.  
**Steps:** 1. Select both strategies.  
**Test Data:** NIFTY August plus NIFTY September or another instrument.  
**Expected Results:** Preview status is incompatible; no combined P&L or break-even appears.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Fail closed.

### TC_SBR_010 — Keep 50% premium alert marked not implemented
**Description / Module:** Prevent false claim for next-phase alert / Product boundary.  
**Type:** Requirement · Negative. **Priority / Severity:** High / High. **Traceability:** Approved next connected phase.  
**Preconditions:** Current 0.6.0 build.  
**Steps:** 1. Review implemented notification/background monitoring paths. 2. Review design scope.  
**Test Data:** Entry premium 100; live premium 150.  
**Expected Results:** Current build does not claim automatic 50% alert support; specification marks it next phase.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Scope honesty, not feature pass.

---

## Design-System Errors

### TC_SDS_001 — Preserve original Options Ladder logo
**Description / Module:** Prevent unrequested brand replacement / Extension surfaces.  
**Type:** Regression · Brand. **Priority / Severity:** High / High. **Traceability:** Logo correction.  
**Preconditions:** Popup, side panel, extension manager.  
**Steps:** 1. Hash bundled mark assets. 2. Inspect rendered source.  
**Test Data:** Approved `nifty-mark` hashes.  
**Expected Results:** Original mark remains unchanged in both themes and every extension surface.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Hash test.

### TC_SDS_002 — Use only approved ARB Desk colors
**Description / Module:** Prevent palette drift / CSS.  
**Type:** Regression · Non-Functional. **Priority / Severity:** Critical / High. **Traceability:** No-extra-colors rule.  
**Preconditions:** All extension CSS.  
**Steps:** 1. Extract color literals. 2. Compare with approved palette.  
**Test Data:** Locked dark/light/accent/danger/warning set.  
**Expected Results:** No unapproved color literal or gradient exists.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Static audit.

### TC_SDS_003 — Use Geist typography consistently
**Description / Module:** Prevent font drift / Extension UI.  
**Type:** Regression · Brand. **Priority / Severity:** High / Medium. **Traceability:** Markup consistency.  
**Preconditions:** Popup, panel, chart overlays.  
**Steps:** 1. Inspect font declarations and bundled assets.  
**Test Data:** Geist and Geist Mono files.  
**Expected Results:** Approved Geist families load locally; no Inter/Segoe substitution enters UI CSS.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Static audit.

### TC_SDS_004 — Keep square preview selectors
**Description / Module:** Prevent circular-dot regression / Strategy chart.  
**Type:** Regression · Usability. **Priority / Severity:** High / Medium. **Traceability:** Approved square option.  
**Preconditions:** Visible strategy break-even.  
**Steps:** 1. Inspect selector geometry.  
**Test Data:** Unselected and selected states.  
**Expected Results:** Selector is 16×16 px with 2 px radius; no circular dot treatment appears.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** CSS geometry.

### TC_SDS_005 — Synchronize one theme across all surfaces
**Description / Module:** Prevent popup/panel/chart mismatch / Theme controller.  
**Type:** Integration · Regression. **Priority / Severity:** Critical / High. **Traceability:** Single-toggle rule.  
**Preconditions:** Popup, side panel, chart open.  
**Steps:** 1. Toggle theme once. 2. Inspect all surfaces.  
**Test Data:** Light then dark.  
**Expected Results:** Every surface uses same stored theme; toggle accessible name changes correctly.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Live Chrome.

### TC_SDS_006 — Preserve profit/loss meaning across themes
**Description / Module:** Prevent semantic color reversal / P&L UI.  
**Type:** Regression · UAT. **Priority / Severity:** Critical / Critical. **Traceability:** Red/green correction.  
**Preconditions:** One profit and one loss in both themes.  
**Steps:** 1. Inspect light mode. 2. Inspect dark mode.  
**Test Data:** +₹5,450 and -₹11,758.  
**Expected Results:** Profit remains green and loss remains red in both themes; only token shade changes for contrast.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Semantic tokens.

### TC_SDS_007 — Keep theme-specific ATM colors
**Description / Module:** Prevent same orange in both modes / ATM row.  
**Type:** Regression · Brand. **Priority / Severity:** High / High. **Traceability:** ATM light/dark correction.  
**Preconditions:** ATM row visible.  
**Steps:** 1. Inspect light token. 2. Inspect dark token.  
**Test Data:** Light `#b45309`; dark `#fbbf24`.  
**Expected Results:** Light uses brown with white text; dark uses yellow/orange with dark text.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Contrast test.

### TC_SDS_008 — Keep border, radius, and shadow tokens consistent
**Description / Module:** Prevent component-style mismatch / UI system.  
**Type:** Regression · Visual. **Priority / Severity:** Medium / Medium. **Traceability:** Full token audit request.  
**Preconditions:** Cards, popup actions, chooser, ladder rows.  
**Steps:** 1. Inspect computed border/radius/shadow values.  
**Test Data:** Approved plan and ladder tokens.  
**Expected Results:** Components use shared line tokens, approved compact radii, and no unapproved shadows.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Static/live audit.

### TC_SDS_009 — Keep numeric text tabular and aligned
**Description / Module:** Prevent premium/strike jitter / Typography.  
**Type:** Non-Functional · Usability. **Priority / Severity:** Medium / Medium. **Traceability:** Exact-axis readability.  
**Preconditions:** Live values update.  
**Steps:** 1. Compare row widths before and after digit changes.  
**Test Data:** 9.95 → 10.05; 99.95 → 100.05.  
**Expected Results:** Numeric columns use tabular figures and remain visually aligned.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** CSS contract.

### TC_SDS_010 — Keep icon language consistent with Markup project
**Description / Module:** Prevent mixed icon families / Popup and controls.  
**Type:** Brand · UAT. **Priority / Severity:** Medium / Medium. **Traceability:** “10000% same consistency.”  
**Preconditions:** Popup and side panel controls visible.  
**Steps:** 1. Inventory icons. 2. Compare stroke/fill and approved assets.  
**Test Data:** Refresh, controls, theme, logo icons.  
**Expected Results:** Icons use approved project assets/style; no unrelated icon family or decorative color appears.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Manual visual gate.

---

## Requirement-Interpretation Errors

### TC_SRI_001 — Put universal-market rule first in approved design
**Description / Module:** Prevent NIFTY-only core architecture / Requirements.  
**Type:** Requirement · Regression. **Priority / Severity:** Critical / Critical. **Traceability:** Explicit universal-product instruction.  
**Preconditions:** Current grouping/versioning design.  
**Steps:** 1. Read first rule after document metadata.  
**Test Data:** Approved design document.  
**Expected Results:** Rule states any supported optionable pair, instrument, or index worldwide; NIFTY is only current test case.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Documentation contract.

### TC_SRI_002 — Remove superseded fixed-count requirements from active docs
**Description / Module:** Prevent old five/13-strike logic returning / Requirements.  
**Type:** Requirement · Negative. **Priority / Severity:** Critical / Critical. **Traceability:** Axis-only correction.  
**Preconditions:** Active project brief, requirements, decision log, current design.  
**Steps:** 1. Search active requirements for fixed strike counts.  
**Test Data:** `five`, `13`, `3/5/7/9/11`.  
**Expected Results:** Current active requirements clearly mark fixed-count logic superseded or remove it; no active conflict remains.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Drift audit.

### TC_SRI_003 — Remove superseded timeframe interval requirements
**Description / Module:** Prevent 15m/50, 1h/100, higher-timeframe mappings / Requirements.  
**Type:** Requirement · Negative. **Priority / Severity:** Critical / Critical. **Traceability:** Repeated timeframe clarification.  
**Preconditions:** All active specs and tests.  
**Steps:** 1. Search for timeframe-to-strike mappings.  
**Test Data:** `15m`, `1h`, `50`, `100`, `250`, `500`.  
**Expected Results:** No active requirement maps timeframe to interval; axis evidence remains sole display-density rule.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Drift audit.

### TC_SRI_004 — Preserve requested logo unless explicitly approved
**Description / Module:** Prevent unauthorized design scope expansion / Change control.  
**Type:** Requirement · Regression. **Priority / Severity:** High / High. **Traceability:** “I didn’t tell you to change logo.”  
**Preconditions:** Approved asset baseline.  
**Steps:** 1. Compare current hashes with baseline.  
**Test Data:** `nifty-mark` assets.  
**Expected Results:** Asset hashes match; any future change requires recorded approval.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Change-control gate.

### TC_SRI_005 — Preserve refresh-only primary extension action
**Description / Module:** Prevent side-panel toggle reinterpretation / Requirements.  
**Type:** Requirement · UAT. **Priority / Severity:** High / High. **Traceability:** Refresh workflow correction.  
**Preconditions:** Toolbar action configured.  
**Steps:** 1. Inspect manifest action. 2. Click icon.  
**Test Data:** Current popup.  
**Expected Results:** Primary action opens compact refresh popup; panel requires explicit Open Controls.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Manifest/live gate.

### TC_SRI_006 — Preserve single four-choice leg selection
**Description / Module:** Prevent split dropdown reinterpretation / Requirements.  
**Type:** Requirement · UAT. **Priority / Severity:** Critical / High. **Traceability:** Choose Leg correction.  
**Preconditions:** New-leg editor.  
**Steps:** 1. Open leg choice. 2. Inspect options.  
**Test Data:** Buy Call, Buy Put, Sell Call, Sell Put.  
**Expected Results:** User chooses one complete leg action; UI never requires two independent selections that create invalid combinations.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Interaction gate.

### TC_SRI_007 — Preserve explicit ownership decision for every new leg
**Description / Module:** Prevent automatic strategy assignment / Requirements.  
**Type:** Requirement · Safety. **Priority / Severity:** Critical / Critical. **Traceability:** “I have to make that decision.”  
**Preconditions:** Saved new leg; compatible active strategies exist.  
**Steps:** 1. Click Add/Save. 2. Inspect ownership chooser.  
**Test Data:** Add to T1/T2 or Create New.  
**Expected Results:** Product asks every time; strike, timing, or matching contract never auto-selects destination.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Product safety.

### TC_SRI_008 — Preserve archive instead of delete
**Description / Module:** Prevent loss of historical trades / Requirements.  
**Type:** Requirement · Data integrity. **Priority / Severity:** Critical / Critical. **Traceability:** Accepted archive decision.  
**Preconditions:** Active strategy with versions.  
**Steps:** 1. Archive strategy. 2. Inspect history.  
**Test Data:** T1 with two versions.  
**Expected Results:** Active chart hides strategy; ledger history retains strategy, legs, versions, charges, and final economics.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** History gate.

### TC_SRI_009 — Preserve mode-independent P&L semantics
**Description / Module:** Prevent “same color” misunderstanding / Requirements.  
**Type:** Requirement · Regression. **Priority / Severity:** High / High. **Traceability:** Corrected red/green instruction.  
**Preconditions:** Light/dark themes.  
**Steps:** 1. Read semantic token contract. 2. Inspect both modes.  
**Test Data:** Positive and negative P&L.  
**Expected Results:** Green always means profit and red always means loss; accessible shades may differ by theme.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Semantic requirement.

### TC_SRI_010 — Keep unbuilt premium alert explicitly out of current scope
**Description / Module:** Prevent requirement claim exceeding implementation / Release scope.  
**Type:** Requirement · Release gate. **Priority / Severity:** High / High. **Traceability:** Premium alert brainstorm.  
**Preconditions:** Version 0.6.0 release documentation.  
**Steps:** 1. Review current-scope and next-phase lists.  
**Test Data:** 50% seller-premium alert.  
**Expected Results:** Current build does not claim alert works; next phase documents monitoring and notification dependencies.  
**Actual Results:** Pending execution. **Status:** Ready for Execution. **Notes:** Honest release boundary.

---

## Execution Policy

- **Every commit:** SUI 001–006, SUX 003–007, SPL 001–008, SRT 001–006, SBR 001–009, SDS 001–009, SRI 001–009.
- **Every pull request:** all automated cases plus static requirement-drift audit.
- **Release candidate:** all 70 cases, live Chrome light/dark captures, archive/history UAT with disposable data, and explicit user visual approval.

## Execution Results

Execution date: 2026-07-31. Case-body `Actual Results` fields remain reusable per-build templates; this section records current run.

| Layer | Result | Evidence |
|---|---:|---|
| Focused seven-category regression | **47 PASS · 0 FAIL · 0 TODO** | `node --test extension-axis-ladder/screenshot-defect-regression.test.cjs` |
| Complete project suite | **625 PASS · 0 FAIL · 0 TODO** | `node --test` with temporary local-port access for bridge integration tests |
| Live Chrome overlay ownership | **PASS** | One `#nifty-axis-ladder` root; theme `light`; no row exposed without `top` and `right` coordinates |
| Live Chrome extension-origin console errors | **PASS** | Zero warning/error entries originating from Options Ladder extension |
| Live populated-ladder visual UAT | **NOT RUN** | Current NIFTY tab had zero captured option-chain rows; density, populated cards, dark-mode screenshot, and zoom visual checks need a valid chain snapshot |
| Live toolbar popup interaction | **NOT RUN** | Browser security policy blocked direct `chrome-extension://` navigation; manifest, markup, labels, focus, and handler contracts passed automated tests |

### Fixed defects

1. **TC_SRI_002 — Requirement interpretation/document drift:** active brief, requirements, and decision log now state universal, TradingView-axis-driven membership with NIFTY as current validation market.
2. **TC_SPL_001 / TC_SRI_002 — Legacy fixed-count cleanup drift:** removed unused `labelCount: "5"` default and deleted unreferenced legacy `content 2.js` prototype.

### Classification note

TradingView emitted `NSE:NIFTY Symbol not found` warmup messages through the selected Pepperstone trading connection. These are TradingView/broker-adapter runtime messages, not Options Ladder extension errors.

Post-cleanup Chrome MCP follow-up could list open tabs but timed out while claiming the TradingView page. Chrome-running, browser-extension, and native-host diagnostics all passed. This transport timeout does not change prior live result and does not replace populated-chain UAT.
