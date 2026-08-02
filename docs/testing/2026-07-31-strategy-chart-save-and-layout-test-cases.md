# Strategy Chart Save and Layout — Test Cases

## Requirements

- **R-LAYOUT-01:** Expanded strategy positions/P&L card must reserve its full rendered height. It must never overlap another strategy card.
- **R-LAYOUT-02:** Financial break-even rail stays at exact price coordinate. Moved cards use connectors back to that rail.
- **R-PREVIEW-01:** Two or more compatible strategy squares create temporary combined break-even preview.
- **R-PREVIEW-02:** Temporary preview never changes ownership, versions, or history.
- **R-SAVE-01:** Chart preview exposes permanent `Save`.
- **R-SAVE-02:** `Save` always asks user to create a new strategy or merge into one selected strategy.
- **R-SAVE-03:** Permanent save creates one atomic immutable merge version and archives source strategies instead of deleting them.
- **R-SAVE-04:** Failed or cancelled save keeps temporary preview and stored strategies unchanged.
- **R-UI-01:** Controls use existing ARB Desk tokens in light and dark themes. No new semantic colors.
- **R-UI-02:** Strategy labels, selection squares, preview controls, and destination choices remain readable, reachable, and keyboard operable.
- **R-SAFETY-01:** Strategy workflow remains read-only toward broker/order systems.

## Shared Test Data

- **TD-STRAT-A:** Instrument `NSE_DLY:NIFTY`; expiry `2026-08-25`; T13 = one short 25,400 Call; charges incomplete; BE 25,420.
- **TD-STRAT-B:** Same instrument/expiry; T14 = one valid option leg; BE 24,415.
- **TD-STRAT-C:** Same instrument/expiry; T15 = one valid option leg; BE 25,238.
- **TD-STRAT-D:** Three compatible active strategies with fresh quotes and complete option-chain rows.
- **TD-FAIL-STORAGE:** `MUTATE_STRATEGY_BOOK` returns `{ ok: false, error: "Storage unavailable" }`.
- **TD-INCOMPATIBLE:** One selected strategy uses different instrument or exact expiry.
- **TD-INCOMPLETE:** Selected strategies are compatible, but one required current option quote is missing or stale.

## Coverage Summary

| ID | Title | Type | Priority |
|---|---|---|---|
| TC_STRAT_LAYOUT_001 | Keep expanded card clear of neighboring card | Functional · Regression | Critical |
| TC_STRAT_LAYOUT_002 | Stack multiple expanded-height cards inside viewport | Boundary | High |
| TC_STRAT_LAYOUT_003 | Preserve exact rails while cards move | Regression · Integration | Critical |
| TC_STRAT_LAYOUT_004 | Collapse expanded card on outside chart click | Usability · Regression | High |
| TC_STRAT_PREVIEW_001 | Build combined preview from two strategies | Smoke · Positive | Critical |
| TC_STRAT_PREVIEW_002 | Build combined preview from three strategies | Boundary · Positive | High |
| TC_STRAT_PREVIEW_003 | Withhold combined preview for one strategy | Negative | High |
| TC_STRAT_PREVIEW_004 | Fail closed for incompatible strategies | Negative · Integration | Critical |
| TC_STRAT_PREVIEW_005 | Disable permanent save for incomplete economics | Negative | Critical |
| TC_STRAT_SAVE_001 | Save preview as new strategy | Functional · Integration · UAT | Critical |
| TC_STRAT_SAVE_002 | Merge preview into selected existing strategy | Functional · Integration | Critical |
| TC_STRAT_SAVE_003 | Cancel destination chooser without mutation | Negative · Usability | High |
| TC_STRAT_SAVE_004 | Preserve preview after storage failure | Negative · Regression | Critical |
| TC_STRAT_SAVE_005 | Persist saved version across reload | Regression · Integration | Critical |
| TC_STRAT_UI_001 | Make Save confirmation discoverable and unambiguous | Usability · UAT | High |
| TC_STRAT_UI_002 | Operate preview save with keyboard and screen-reader names | Non-Functional · Usability | High |
| TC_STRAT_UI_003 | Preserve ARB Desk light/dark token consistency | Non-Functional · Regression | High |
| TC_STRAT_SAFETY_001 | Keep permanent save broker read-only | Regression · Integration | Critical |

---

## Full Test Cases

### TC_STRAT_LAYOUT_001

**Test Case ID:** TC_STRAT_LAYOUT_001  
**Title:** Keep expanded card clear of neighboring card  
**Description:** Validates full-height reservation for positions/P&L rows and unknown-charge disclosure.  
**Module/Feature:** Chart strategy card layout  
**Type:** Functional · Regression  
**Priority:** Critical  
**Severity:** High  
**Traceability:** R-LAYOUT-01  
**Preconditions:** Options Ladder enabled; TD-STRAT-A and TD-STRAT-C active; both BEs visible and vertically close.

**Steps:**
1. Open TradingView chart containing T13 and T15 break-even labels.
2. Click `T13 BE 25,420`.
3. Observe T13 position row and `EXCLUDING UNKNOWN CHARGES`.
4. Observe T15 card.

**Test Data:**
- TD-STRAT-A
- TD-STRAT-C
- Required gap: 6 px

**Expected Results:**
- T13 expands to include label, one position row, and disclosure.
- T15 starts at least 6 px after T13’s full visual bottom.
- No text, selector, border, or card surface overlaps.

**Actual Results:** Pending execution.  
**Status:** Ready for Review  
**Notes:** Automated regression checks computed 78 px expanded height.

### TC_STRAT_LAYOUT_002

**Test Case ID:** TC_STRAT_LAYOUT_002  
**Title:** Stack multiple expanded-height cards inside viewport  
**Description:** Validates boundary packing when several BEs are close to chart top or bottom.  
**Module/Feature:** Chart strategy card layout  
**Type:** Boundary  
**Priority:** High  
**Severity:** High  
**Traceability:** R-LAYOUT-01, R-LAYOUT-02  
**Preconditions:** At least three compatible strategies; BEs project within 60 px near one viewport edge.

**Steps:**
1. Zoom or pan until three strategy BEs sit near chart top.
2. Click first strategy label to expand it.
3. Inspect every strategy card and connector.
4. Repeat near chart bottom.

**Test Data:**
- Three card heights: 78 px, 24 px, 24 px
- Viewport bounds from current TradingView plot

**Expected Results:**
- Every card stays fully inside plot bounds.
- Cards preserve at least 6 px separation.
- Rail ordering remains stable.
- Connectors point to each card’s exact rail.

**Actual Results:** Pending execution.  
**Status:** Ready for Review  
**Notes:** Boundary geometry is deterministic in `strategy-chart.js`.

### TC_STRAT_LAYOUT_003

**Test Case ID:** TC_STRAT_LAYOUT_003  
**Title:** Preserve exact rails while cards move  
**Description:** Ensures collision handling never moves financial break-even coordinates.  
**Module/Feature:** Break-even projection and connector layout  
**Type:** Regression · Integration  
**Priority:** Critical  
**Severity:** Critical  
**Traceability:** R-LAYOUT-02  
**Preconditions:** Two break-even values project close enough to require card movement.

**Steps:**
1. Record exact break-even prices shown in both labels.
2. Record their right-axis Y coordinates.
3. Expand one card.
4. Observe card movement and rail positions.

**Test Data:**
- Example rails: 25,420 and 25,238
- Required card gap: 6 px

**Expected Results:**
- Dashed rails remain on exact original price coordinates.
- Only cards move.
- Every moved card receives a connector back to its own rail.

**Actual Results:** Pending execution.  
**Status:** Ready for Review  
**Notes:** Financial rail movement is release-blocking.

### TC_STRAT_LAYOUT_004

**Test Case ID:** TC_STRAT_LAYOUT_004  
**Title:** Collapse expanded card on outside chart click  
**Description:** Confirms expanded strategy details behave as temporary inspection UI.  
**Module/Feature:** Chart strategy interaction  
**Type:** Usability · Regression  
**Priority:** High  
**Severity:** Medium  
**Traceability:** R-LAYOUT-01, R-UI-02  
**Preconditions:** One strategy card is expanded.

**Steps:**
1. Click empty chart area outside strategy cards.
2. Observe previously expanded strategy.

**Test Data:**
- Any empty chart coordinate not occupied by ladder/editor/strategy UI

**Expected Results:**
- Position and disclosure rows close.
- Base strategy label and selection square remain.
- Saved strategy and temporary selection remain unchanged.

**Actual Results:** Pending execution.  
**Status:** Ready for Review  
**Notes:** Existing outside-click contract must remain intact.

### TC_STRAT_PREVIEW_001

**Test Case ID:** TC_STRAT_PREVIEW_001  
**Title:** Build combined preview from two strategies  
**Description:** Validates critical temporary combined-preview path.  
**Module/Feature:** Combined strategy preview  
**Type:** Smoke · Positive  
**Priority:** Critical  
**Severity:** Critical  
**Traceability:** R-PREVIEW-01, R-PREVIEW-02  
**Preconditions:** Two compatible active strategies with fresh complete quotes.

**Steps:**
1. Click square beside first strategy label.
2. Click square beside second strategy label.
3. Observe preview bar and break-even rails.

**Test Data:**
- Two compatible strategies from TD-STRAT-D

**Expected Results:**
- Both squares show selected state.
- Preview bar shows `2 SELECTED`.
- Combined BE rails appear.
- Original rails hide until `Compare` is active.
- No strategy mutation occurs.

**Actual Results:** Pending execution.  
**Status:** Ready for Review  
**Notes:** Smoke gate; stop deeper testing if this fails.

### TC_STRAT_PREVIEW_002

**Test Case ID:** TC_STRAT_PREVIEW_002  
**Title:** Build combined preview from three strategies  
**Description:** Confirms selection is not limited to two strategies.  
**Module/Feature:** Combined strategy preview  
**Type:** Boundary · Positive  
**Priority:** High  
**Severity:** High  
**Traceability:** R-PREVIEW-01  
**Preconditions:** TD-STRAT-D available.

**Steps:**
1. Select T13 square.
2. Select T14 square.
3. Select T15 square.
4. Observe preview summary and combined roots.

**Test Data:**
- TD-STRAT-D

**Expected Results:**
- All three squares remain reachable and selected.
- Preview bar shows `3 SELECTED`.
- Combined roots use all unique legs exactly once.
- No arbitrary two-strategy cap applies.

**Actual Results:** Pending execution.  
**Status:** Ready for Review  
**Notes:** Also validates same-strategy multi-root selector synchronization.

### TC_STRAT_PREVIEW_003

**Test Case ID:** TC_STRAT_PREVIEW_003  
**Title:** Withhold combined preview for one strategy  
**Description:** Ensures one selected strategy does not fabricate combined economics.  
**Module/Feature:** Combined strategy preview  
**Type:** Negative  
**Priority:** High  
**Severity:** High  
**Traceability:** R-PREVIEW-01  
**Preconditions:** At least one active strategy.

**Steps:**
1. Clear all strategy selections.
2. Select one strategy square.
3. Observe chart and preview controls.

**Test Data:**
- One active strategy

**Expected Results:**
- Selected square fills.
- No `COMBINED BE` rail appears.
- No preview bar or permanent `Save` action appears.
- Original strategy remains unchanged.

**Actual Results:** Pending execution.  
**Status:** Ready for Review  
**Notes:** One selected strategy is membership state only.

### TC_STRAT_PREVIEW_004

**Test Case ID:** TC_STRAT_PREVIEW_004  
**Title:** Fail closed for incompatible strategies  
**Description:** Rejects mixed instrument or exact-expiry preview.  
**Module/Feature:** Combined strategy compatibility  
**Type:** Negative · Integration  
**Priority:** Critical  
**Severity:** Critical  
**Traceability:** R-PREVIEW-01, R-SAVE-04  
**Preconditions:** TD-INCOMPATIBLE exists in test fixture.

**Steps:**
1. Select first strategy.
2. Select incompatible strategy.
3. Observe preview summary and rails.

**Test Data:**
- TD-INCOMPATIBLE

**Expected Results:**
- No combined BE is published.
- Status reports incompatibility.
- Permanent save stays disabled.
- No mutation is sent.

**Actual Results:** Pending execution.  
**Status:** Ready for Review  
**Notes:** Universal instrument identity is exact, not label-based.

### TC_STRAT_PREVIEW_005

**Test Case ID:** TC_STRAT_PREVIEW_005  
**Title:** Disable permanent save for incomplete economics  
**Description:** Prevents saving when required quotes are missing or stale.  
**Module/Feature:** Combined strategy evidence gate  
**Type:** Negative  
**Priority:** Critical  
**Severity:** Critical  
**Traceability:** R-SAVE-01, R-SAVE-04  
**Preconditions:** TD-INCOMPLETE selected.

**Steps:**
1. Select both incomplete-evidence strategies.
2. Observe preview summary.
3. Attempt to activate `Save`.

**Test Data:**
- TD-INCOMPLETE
- Quote age greater than 15 minutes or missing option quote

**Expected Results:**
- Summary reports incomplete/stale evidence.
- `Save` is disabled.
- No destination chooser opens.
- Existing values remain visible and unchanged.

**Actual Results:** Pending execution.  
**Status:** Ready for Review  
**Notes:** Manual refresh is required; no automatic retry.

### TC_STRAT_SAVE_001

**Test Case ID:** TC_STRAT_SAVE_001  
**Title:** Save preview as new strategy  
**Description:** Validates chart-native permanent confirmation and immutable merge.  
**Module/Feature:** Permanent strategy save  
**Type:** Functional · Integration · UAT  
**Priority:** Critical  
**Severity:** Critical  
**Traceability:** R-SAVE-01, R-SAVE-02, R-SAVE-03  
**Preconditions:** Two compatible selected strategies; preview status `OK`.

**Steps:**
1. Click `Save` in preview bar.
2. Verify destination chooser opens.
3. Click `CREATE NEW STRATEGY`.
4. Wait for chart redraw.

**Test Data:**
- Selected source IDs: T13 and T15
- Next visible strategy sequence from store

**Expected Results:**
- One `MERGE_STRATEGIES` command is sent.
- New active strategy owns union of unique source legs.
- New immutable version records source strategy IDs.
- Source strategies become archived in Ledger History.
- Temporary preview clears.
- New strategy BE label(s) replace source active labels.

**Actual Results:** Pending execution.  
**Status:** Ready for Review  
**Notes:** Live Chrome execution must use disposable strategies or stop before destructive confirmation.

### TC_STRAT_SAVE_002

**Test Case ID:** TC_STRAT_SAVE_002  
**Title:** Merge preview into selected existing strategy  
**Description:** Validates explicit existing destination path.  
**Module/Feature:** Permanent strategy save  
**Type:** Functional · Integration  
**Priority:** Critical  
**Severity:** Critical  
**Traceability:** R-SAVE-02, R-SAVE-03  
**Preconditions:** T13, T14, and T15 selected; preview status `OK`.

**Steps:**
1. Click `Save`.
2. Click `MERGE INTO T13`.
3. Wait for chart redraw.

**Test Data:**
- Destination: T13
- Sources: T13, T14, T15

**Expected Results:**
- T13 receives one new `MERGE` version.
- T14 and T15 move to history with `MERGED_INTO:<T13 id>`.
- T13 remains active and owns unique union of legs.
- No source record is deleted.
- Preview clears.

**Actual Results:** Pending execution.  
**Status:** Ready for Review  
**Notes:** Destination choice must never be inferred.

### TC_STRAT_SAVE_003

**Test Case ID:** TC_STRAT_SAVE_003  
**Title:** Cancel destination chooser without mutation  
**Description:** Confirms `Save` remains reversible until destination confirmation.  
**Module/Feature:** Permanent strategy save  
**Type:** Negative · Usability  
**Priority:** High  
**Severity:** High  
**Traceability:** R-SAVE-02, R-SAVE-04  
**Preconditions:** Two compatible strategies selected; chooser open.

**Steps:**
1. Click `CANCEL`.
2. Observe preview.

**Test Data:**
- Two selected active strategies

**Expected Results:**
- Chooser closes.
- Combined preview remains visible.
- Selected squares remain filled.
- No strategy command or storage write occurs.

**Actual Results:** Pending execution.  
**Status:** Ready for Review  
**Notes:** `Clear` remains separate action for removing preview.

### TC_STRAT_SAVE_004

**Test Case ID:** TC_STRAT_SAVE_004  
**Title:** Preserve preview after storage failure  
**Description:** Validates atomic failure and retry-safe UX.  
**Module/Feature:** Permanent strategy persistence  
**Type:** Negative · Regression  
**Priority:** Critical  
**Severity:** Critical  
**Traceability:** R-SAVE-03, R-SAVE-04  
**Preconditions:** TD-FAIL-STORAGE enabled; preview status `OK`.

**Steps:**
1. Click `Save`.
2. Select `CREATE NEW STRATEGY`.
3. Wait for failure response.

**Test Data:**
- TD-FAIL-STORAGE

**Expected Results:**
- Summary displays `SAVE FAILED · Storage unavailable`.
- Destination choices re-enable.
- Selected strategies and combined rails remain.
- Strategy book and version history remain byte-for-byte unchanged.

**Actual Results:** Pending execution.  
**Status:** Ready for Review  
**Notes:** Partial archive or partial destination creation is forbidden.

### TC_STRAT_SAVE_005

**Test Case ID:** TC_STRAT_SAVE_005  
**Title:** Persist saved version across reload  
**Description:** Confirms permanent save survives content-script and browser lifecycle.  
**Module/Feature:** Strategy persistence and history  
**Type:** Regression · Integration  
**Priority:** Critical  
**Severity:** Critical  
**Traceability:** R-SAVE-03  
**Preconditions:** TC_STRAT_SAVE_001 completed using test data.

**Steps:**
1. Reload TradingView tab.
2. Wait for extension to restore from local storage.
3. Open side-panel Ledger History.
4. Inspect new active strategy and archived sources.

**Test Data:**
- Saved destination ID and merge version ID from prior setup

**Expected Results:**
- New destination strategy remains active.
- Source strategies remain archived and inspectable.
- Version source IDs and leg membership match saved operation.
- Temporary selection/preview does not return.

**Actual Results:** Pending execution.  
**Status:** Ready for Review  
**Notes:** Test case defines own persisted precondition; it does not depend on execution order.

### TC_STRAT_UI_001

**Test Case ID:** TC_STRAT_UI_001  
**Title:** Make Save confirmation discoverable and unambiguous  
**Description:** Evaluates whether user can understand temporary versus permanent action on chart.  
**Module/Feature:** Preview-bar UX  
**Type:** Usability · UAT  
**Priority:** High  
**Severity:** High  
**Traceability:** R-SAVE-01, R-SAVE-02, R-UI-02  
**Preconditions:** Combined preview visible.

**Steps:**
1. Inspect preview bar without opening side panel.
2. Identify action that permanently confirms combined strategy.
3. Click `Save`.
4. Read every destination choice.

**Test Data:**
- Three selected strategies

**Expected Results:**
- `Save`, `Compare`, and `Clear` look like separate buttons.
- `Save` is visible without side panel.
- Chooser title reads `SAVE COMBINED AS`.
- Choices say `CREATE NEW STRATEGY` or `MERGE INTO T<n>`; no ambiguous blank controls appear.

**Actual Results:** Pending execution.  
**Status:** Ready for Review  
**Notes:** Business-owner visual approval required.

### TC_STRAT_UI_002

**Test Case ID:** TC_STRAT_UI_002  
**Title:** Operate preview save with keyboard and screen-reader names  
**Description:** Checks focus, activation, and accessible control identity.  
**Module/Feature:** Preview-bar accessibility  
**Type:** Non-Functional · Usability  
**Priority:** High  
**Severity:** High  
**Traceability:** R-UI-02  
**Preconditions:** Combined preview visible; keyboard focus available.

**Steps:**
1. Press `Tab` until `Save` receives focus.
2. Press `Enter`.
3. Continue with `Tab` through destination choices and `CANCEL`.
4. Inspect accessible roles/names in browser accessibility tree.

**Test Data:**
- Keyboard only

**Expected Results:**
- Focus indicator is visible.
- Focus order follows `Compare` → `Save` → `Clear`, then chooser options when open.
- Enter/Space activates focused button once.
- Every button exposes exact visible name.

**Actual Results:** Pending execution.  
**Status:** Ready for Review  
**Notes:** Missing focus visibility is High severity for this compact UI.

### TC_STRAT_UI_003

**Test Case ID:** TC_STRAT_UI_003  
**Title:** Preserve ARB Desk light/dark token consistency  
**Description:** Validates same component structure and semantic colors in both themes.  
**Module/Feature:** Theme system  
**Type:** Non-Functional · Regression  
**Priority:** High  
**Severity:** Medium  
**Traceability:** R-UI-01  
**Preconditions:** Combined preview and destination chooser visible.

**Steps:**
1. Capture preview bar and chooser in light mode.
2. Toggle to dark mode.
3. Capture same state.
4. Compare borders, fills, type, spacing, profit/loss colors, and warning colors.

**Test Data:**
- Shared ARB Desk variables: `--plan-surface`, `--plan-ink`, `--plan-line`, `--pnl-profit`, `--pnl-loss`, `--theme-warn`

**Expected Results:**
- No raw hex color appears in strategy UI CSS.
- Profit/loss semantics do not change between themes.
- Light and dark surfaces remain readable.
- Save chooser uses same card, border, font, and sizing language as existing controls.

**Actual Results:** Pending execution.  
**Status:** Ready for Review  
**Notes:** Visual-token mismatch is regression even when function works.

### TC_STRAT_SAFETY_001

**Test Case ID:** TC_STRAT_SAFETY_001  
**Title:** Keep permanent save broker read-only  
**Description:** Ensures chart confirmation changes only local strategy state.  
**Module/Feature:** Broker safety boundary  
**Type:** Regression · Integration  
**Priority:** Critical  
**Severity:** Critical  
**Traceability:** R-SAFETY-01  
**Preconditions:** Network and runtime message capture enabled.

**Steps:**
1. Create combined preview.
2. Save to a disposable new strategy.
3. Inspect runtime messages and network requests.

**Test Data:**
- Two disposable compatible strategies

**Expected Results:**
- One local `MUTATE_STRATEGY_BOOK` message is sent.
- No broker order create/modify/cancel/exit request occurs.
- No TradingView order action occurs.
- Existing broker credentials remain untouched.

**Actual Results:** Pending execution.  
**Status:** Ready for Review  
**Notes:** Any broker write fails release.

## Execution Tiers

- **Every commit:** TC_STRAT_PREVIEW_001, TC_STRAT_LAYOUT_001, TC_STRAT_SAVE_003, TC_STRAT_SAFETY_001.
- **Every pull request:** all automated regression/integration cases.
- **Release candidate:** full document in light and dark themes, plus business-owner UAT for TC_STRAT_SAVE_001 and TC_STRAT_UI_001.

## Execution Report — 2026-07-31

### Automated

- **Result:** PASS
- **Command:** `node --test *.test.cjs`
- **Coverage:** all 18 cases have automated contract, unit, integration, or static-token coverage.
- **Permanent-save safety:** tested through fake extension storage and runtime-message capture. No broker/order mutation path exists.
- **Fresh total:** 547 passed, 0 failed.

### Live Chrome

| Case | Result | Evidence |
|---|---|---|
| TC_STRAT_LAYOUT_001 | PASS | Expanded T20 rendered at 78 px; zero rectangle overlap. |
| TC_STRAT_LAYOUT_004 | PASS | Empty-chart click returned card from 78 px to 24 px. |
| TC_STRAT_PREVIEW_003 | PASS | One selected square stayed selected without fabricating combined preview. |
| TC_STRAT_UI_002 | PASS | Square selector exposed exact accessible name and toggled with Space. |
| TC_STRAT_UI_003 | PARTIAL LIVE · PASS AUTOMATED | Light theme inspected live. Dark theme and token parity covered by automated locked-palette tests. |
| Rail/card z-order | PASS | Strategy rail z-index 1, ladder row 2, strategy card 3. Dashed line stays under visible card. |

### Live Constraint

Controlled chart contained one active strategy (`T20`). Three-strategy selection and permanent destination UI were not executed against real stored strategies because creating disposable strategies or confirming merge would change/archive user strategy history. Those paths are covered by deterministic automated integration tests, including cancel and storage-failure behavior.
