# Options Ladder — 202 End-to-End User Workflows

**Status:** Authoritative scenario inventory; current-candidate execution in progress — see `2026-08-06-options-ladder-202-execution-log.md`
**Created:** 2026-08-05
**Rule:** These are complete user journeys, not unit assertions. Run every ID independently against both baselines and classify result as `SAME`, `INTENDED CHANGE`, or `REGRESSION`.

## Direct answer

- **Distinct workflows:** 202
- **Workflow categories:** 13
- **Existing automated checks:** 857 test blocks
- **Existing written test cases:** 188
- **Versioned full-browser end-to-end scripts found:** 0
- **Confirmed current failure before formal execution:** `WF-MAN-EDIT-007` — unique saved manual Put opens blank/new `ADD` flow instead of prefilled `SAVE` + `REMOVE`.
- **Total current regressions:** unknown until 202 × 2 baseline run completes. Any smaller claim would be invented.

## Version baselines

| Audit label | Public version | Exact state | Timestamp | Notes |
|---|---:|---|---|---|
| `PREVIOUS-PUSHED` | `0.6.0` | Git commit `1590670` | 2026-08-04 22:44:55 IST | Last clean pushed checkpoint before current repair sequence; final live reload proof was still pending |
| `CURRENT-COMMITTED` | `0.6.0` | Git commit `fc32ef1` | 2026-08-05 13:19:06 IST | Four local commits after stable; branch ahead of origin |
| `CURRENT-WORKTREE` | `0.6.0` | `fc32ef1` + 28 modified files; diff SHA-256 prefix `59e1e56d4c5a` | 2026-08-05 18:46:15 IST | Exact uncommitted candidate under audit |

Public version never changed despite major behavior changes. Git state is real version identity for this comparison.

## Change blast radius since `PREVIOUS-PUSHED`

| Measure | Count |
|---|---:|
| Modified files | 30 |
| Product/runtime files | 13 |
| Test files | 17 |
| Inserted lines | 4,839 |
| Removed/replaced lines | 725 |
| Deleted files | 0 |
| Commits after stable | 4 |
| Currently uncommitted files | 28 |
| High-impact workflow domains touched | 9 |

Touched domains: broker data/lot metadata; manual persistence/ownership; saved-entry interaction/editor; break-even selection/rails; chart lanes/grouping; position P&L/details; strategy math/reconciliation/versioning; popup refresh validation; visual stacking/layout.

## Coverage summary

| Category | Count |
|---|---:|
| Extension shell, popup, panel, theme | 10 |
| Ladder, strikes, axis, zoom/pan | 16 |
| Strike selection and break-even rails | 15 |
| Manual trade creation | 17 |
| Manual trade inspect/edit/remove | 18 |
| Broker connection/import/position actions | 16 |
| Shared Call/Put lanes and collision grouping | 18 |
| Strategy rails, selection, preview, versions | 24 |
| Seller evidence and review | 15 |
| Refresh, expiry, persistence, lifecycle | 14 |
| Premium Skyline | 10 |
| Fail-closed recovery and safety | 17 |
| Keyboard, accessibility, visual integrity | 12 |
| **Total** | **202** |

## Execution evidence required per workflow

Each workflow must record:

1. Exact baseline identity.
2. Preconditions and fixed test data.
3. Atomic user actions.
4. Expected visible result.
5. Actual result.
6. DOM/text assertions and browser console state.
7. Screenshot at decisive step.
8. `PASS`, `FAIL`, or `BLOCKED`.
9. Previous-versus-current classification: `SAME`, `INTENDED CHANGE`, or `REGRESSION`.

No unit-test success may substitute for browser execution.

## 1. Extension shell, popup, panel, theme — 10

- `WF-SHL-001` Open extension on TradingView → compact Options Ladder popup opens.
- `WF-SHL-002` Open popup → READY state, Refresh Ladder, and Open Controls appear without data mutation.
- `WF-SHL-003` Press Refresh Ladder → immediate refreshing state, chart values update, completion state appears.
- `WF-SHL-004` Refresh Ladder fails → popup shows readable failure and chart keeps prior safe state.
- `WF-SHL-005` Press Open Controls → side panel opens for active TradingView tab and compact popup closes.
- `WF-SHL-006` Open extension on unsupported tab → Refresh Ladder and Open Controls remain disabled.
- `WF-SHL-007` Visit lookalike, HTTP, localhost, or extension URL → side panel stays unavailable.
- `WF-SHL-008` Switch tabs while panel open → previous panel closes and never auto-reopens on return.
- `WF-SHL-009` Toggle Show ladder on chart off then on → chart layer hides/restores without deleting stored trades.
- `WF-SHL-010` Change dark/light theme → popup, side panel, and chart update together and choice survives reopen.

## 2. Ladder, strikes, axis, zoom/pan — 16

- `WF-LAD-001` Select expiry and explicitly refresh → exact-expiry option rows load once.
- `WF-LAD-002` Inspect row → order remains `Call premium | Put premium | strike`.
- `WF-LAD-003` Load many valid strikes → every safe axis intersection appears once in one right-side column.
- `WF-LAD-004` Zoom into dense axis → smaller real strike steps appear without invented contracts.
- `WF-LAD-005` Zoom out to sparse axis → fewer matching real strikes appear without fixed row count.
- `WF-LAD-006` Live-price marker covers grid label → missing rounded grid slot resolves from surrounding cadence.
- `WF-LAD-007` Real ATM lies inside view but off printed grid → one ATM reference remains visible.
- `WF-LAD-008` ATM lies outside visible range → no off-screen ATM row is forced into ladder.
- `WF-LAD-009` Zoom in after load → cached rows remap without option-chain request.
- `WF-LAD-010` Zoom out after load → cached rows remap without option-chain request.
- `WF-LAD-011` Pan chart → rows follow native axis without changing saved strike identity.
- `WF-LAD-012` Change timeframe → native-axis membership rebuilds without timeframe-based strike rules.
- `WF-LAD-013` Invert linear price scale → row order and exact price coordinates remain correct.
- `WF-LAD-014` Resize chart or side panel → rows remain attached to exact price coordinates.
- `WF-LAD-015` Call or Put quote is missing → corresponding value shows `—`, never zero.
- `WF-LAD-016` Native axis becomes unsafe/incomplete → unplaced rows hide instead of appearing top-left.

## 3. Strike selection and break-even rails — 15

- `WF-QBE-001` Open/reload with no strike selected → no quick, manual, or broker break-even rail appears.
- `WF-QBE-002` Single-click clean strike → exactly one Call BE and one Put BE appear.
- `WF-QBE-003` Select valid Call row → Call BE equals strike plus displayed Call premium.
- `WF-QBE-004` Select valid Put row → Put BE equals strike minus displayed Put premium.
- `WF-QBE-005` Click strike carrying C/P badges → badges remain and strike still activates correct rails.
- `WF-QBE-006` Click already-selected strike again → selection and associated rails clear.
- `WF-QBE-007` Click different strike → prior rails disappear and new strike rails replace them.
- `WF-QBE-008` Select one saved-trade strike → only that strike’s owning strategy rails appear; unrelated T IDs stay hidden.
- `WF-QBE-009` Select 24,500, for example → no T39/T40 or BE belonging to another strike appears.
- `WF-QBE-010` Click outside ladder → selection, rails, markers, and temporary feedback clear.
- `WF-QBE-011` Press Escape → same clean dismissal occurs.
- `WF-QBE-012` Press manual refresh → selection clears and remains clear until next strike click.
- `WF-QBE-013` Zoom, pan, resize, or timeframe-change after selection → same snapshot remaps without new selection.
- `WF-QBE-014` Selected-side price is missing/invalid → `OPTION PRICE UNAVAILABLE` appears and no fake rail renders.
- `WF-QBE-015` BE leaves viewport or lanes become crowded → truthful edge marker appears and text never covers Call/Put controls.

## 4. Manual trade creation — 17

- `WF-MAN-ADD-001` Double-click Call premium cell → anchored ADD editor offers BUY CALL and SELL CALL only.
- `WF-MAN-ADD-002` Double-click Put premium cell → anchored ADD editor offers BUY PUT and SELL PUT only.
- `WF-MAN-ADD-003` Double-click row → pending single-click action cancels; no quick-rail flash or face flip occurs.
- `WF-MAN-ADD-004` Editor opens → original row hides at same y-coordinate and strike is not duplicated.
- `WF-MAN-ADD-005` Choose BUY action → correct live-side premium auto-fills.
- `WF-MAN-ADD-006` Choose SELL action → correct live-side premium auto-fills.
- `WF-MAN-ADD-007` Increase/decrease lots → preview recalculates while editor remains open.
- `WF-MAN-ADD-008` Enter zero, negative, or decimal lots → ADD stays disabled.
- `WF-MAN-ADD-009` Replace live premium with valid custom premium → preview uses custom value.
- `WF-MAN-ADD-010` Enter premium `0` → valid zero premium is accepted.
- `WF-MAN-ADD-011` Enter blank, negative, or nonnumeric premium → `ENTER PREMIUM` appears and ADD stays disabled.
- `WF-MAN-ADD-012` Selected quote is unavailable → premium starts blank; valid manual value permits save while opposite snapshot stays `—`.
- `WF-MAN-ADD-013` Exact expiry lot size is unavailable/conflicting → commit stays blocked instead of guessing quantity.
- `WF-MAN-ADD-014` Press ADD with valid draft → explicit CHOOSE STRATEGY decision opens.
- `WF-MAN-ADD-015` Choose Create New → next manual T identity is created and saved leg belongs to it.
- `WF-MAN-ADD-016` Choose existing compatible strategy → leg joins only selected destination.
- `WF-MAN-ADD-017` Cancel chooser, close editor, click outside, or press Escape → no trade or strategy is created.

## 5. Manual trade inspect/edit/remove — 18

- `WF-MAN-EDIT-001` Save manual Call and Put at same strike → separate C and P badges appear.
- `WF-MAN-EDIT-002` Save multiple same-side lots → side badge shows correct aggregate lots.
- `WF-MAN-EDIT-003` Single-click saved row → newest saved face replaces live face.
- `WF-MAN-EDIT-004` Repeatedly click multi-entry row → entries cycle newest-first, then return to live.
- `WF-MAN-EDIT-005` View saved face → fixed snapshots and traded-side `×lots` appear; live and saved faces never stack.
- `WF-MAN-EDIT-006` Click exact manual C/P badge → saved editor opens with SAVE and REMOVE, never blank ADD.
- `WF-MAN-EDIT-007` Double-click option cell where exactly one matching manual entry exists → that entry opens with SAVE/REMOVE. **Current observed: FAIL.**
- `WF-MAN-EDIT-008` Double-click currently displayed saved face → exact displayed identity opens for editing.
- `WF-MAN-EDIT-009` Open saved editor → side, direction, lots, premium, and immutable snapshots are prefilled.
- `WF-MAN-EDIT-010` Change saved premium and press SAVE → only exact entry updates.
- `WF-MAN-EDIT-011` Change saved lots and press SAVE → correct strategy break-evens move.
- `WF-MAN-EDIT-012` Change saved entry to opposite option side → new position is created rather than overwriting other-side identity.
- `WF-MAN-EDIT-013` Press REMOVE → only exact saved entry disappears; same-strike siblings remain.
- `WF-MAN-EDIT-014` Close saved editor without SAVE → stored entry remains unchanged.
- `WF-MAN-EDIT-015` Refresh live numbers → editor closes, live quotes change, captured entry snapshot does not.
- `WF-MAN-EDIT-016` Reload extension/TradingView → manual entries, badges, T identity, and snapshots restore.
- `WF-MAN-EDIT-017` Switch expiry and return → exact-expiry manual plans remain isolated and restore correctly.
- `WF-MAN-EDIT-018` Storage write fails during SAVE/REMOVE → old plan survives, editor remains actionable, `PLAN NOT SAVED` appears.

## 6. Broker connection/import/position actions — 16

- `WF-BRK-001` Press Connect Zerodha → only bridge-provided official Zerodha login URL opens.
- `WF-BRK-002` Complete authorization → connected status appears and one coordinated refresh starts.
- `WF-BRK-003` Press REFRESH ALL → positions, current-day trades, and selected-expiry chain each fetch once.
- `WF-BRK-004` Import first broker snapshot → broker strategy appears without consuming next manual T number.
- `WF-BRK-005` Import Call position → compact Call token appears in left Call lane at exact strike.
- `WF-BRK-006` Import Put position → compact Put token appears in right Put lane at exact strike.
- `WF-BRK-007` Imported broker legs → corresponding source-aware C/P ladder badges appear.
- `WF-BRK-008` Click exact broker badge → exact broker details/P&L open; manual ADD editor does not.
- `WF-BRK-009` Double-click matching broker badge/owned position → broker details open; no new manual T strategy appears.
- `WF-BRK-010` Click compact C/P token → exact position card opens, not another position.
- `WF-BRK-011` Inspect broker card → live P&L, side, direction, lots, and strike match imported evidence.
- `WF-BRK-012` Click broker checkbox → exact broker strategy selection toggles and all matching selectors synchronize.
- `WF-BRK-013` Select broker strike then use Show BE Rail → only selected broker position rail appears.
- `WF-BRK-014` Press CLOSE on broker card → card and owned rail close; unrelated group, selection, and positions remain.
- `WF-BRK-015` Refresh to flat broker snapshot → live broker strategy archives while version/evidence remains.
- `WF-BRK-016` Broker disconnects or evidence expires → broker chart visuals hide while accepted evidence remains reviewable.

## 7. Shared Call/Put lanes and collision grouping — 18

- `WF-POS-001` Load manual and broker positions together → both use same source-neutral Call and Put columns.
- `WF-POS-002` Inspect layout → no separate third “manual” column exists.
- `WF-POS-003` Call and Put share strike/y-coordinate → Call remains left, Put remains right.
- `WF-POS-004` Same-side controls have safe vertical separation → each remains directly visible.
- `WF-POS-005` Same-side controls collide → originals collapse into one `+N` group.
- `WF-POS-006` Call and Put collide at same y → two side-specific groups form; sides never merge.
- `WF-POS-007` Closed `+N` is visible → count is informational and selects nothing.
- `WF-POS-008` Click group’s square opener → flyout opens without selecting a trade.
- `WF-POS-009` Inspect flyout → every hidden exact identity appears once.
- `WF-POS-010` Click flyout row checkbox → only exact strategy/position selection changes.
- `WF-POS-011` Click flyout row label → only exact entry details/P&L open.
- `WF-POS-012` Mix Buy and Sell rows → green/red identity rails remain correct inside group.
- `WF-POS-013` Open group near ladder → flyout renders above rows and compact controls.
- `WF-POS-014` Click outside open group → group closes without deleting or deselecting trades.
- `WF-POS-015` Add many controls → checkboxes, tokens, and lane labels keep fixed alignment.
- `WF-POS-016` Show quick/strategy BE text → text ends before Call lane and never collides with controls.
- `WF-POS-017` Show C/P position badges plus OI badges → each stays in its own band without overlap.
- `WF-POS-018` Zoom/pan across first and last visible strikes → position spine stays bounded to visible ladder range.

## 8. Strategy rails, selection, preview, versions — 24

- `WF-STR-001` Click T label → that strategy’s positions/P&L open without changing selection.
- `WF-STR-002` Click adjacent square → whole strategy joins/leaves preview without opening details.
- `WF-STR-003` Same strategy has multiple visible controls → every square reflects one synchronized selected state.
- `WF-STR-004` No strike selected → saved manual and broker strategy rails remain hidden.
- `WF-STR-005` Activate saved manual face at selected strike → only owning T strategy identity and rails appear.
- `WF-STR-006` Activate broker position at selected strike → broker identity appears; unrelated T39/T40 identities do not.
- `WF-STR-007` Select one strategy → no combined preview is created.
- `WF-STR-008` Select two compatible strategies → combined exact break-even rails appear.
- `WF-STR-009` Select three or more compatible strategies → all selected identities contribute once.
- `WF-STR-010` Combined payoff has multiple roots → every exact root appears.
- `WF-STR-011` Press Compare during combined preview → original selected-strategy rails reappear beside combined rails.
- `WF-STR-012` Turn Compare off → original rails hide while combined rails remain.
- `WF-STR-013` Press Clear/Cancel → temporary preview disappears without storage mutation.
- `WF-STR-014` Attempt mixed-instrument preview → economics remain withheld with clear error.
- `WF-STR-015` Attempt mixed-expiry preview → economics remain withheld with clear error.
- `WF-STR-016` Selected strategy has stale/missing quote → combined economics remain withheld.
- `WF-STR-017` Press SAVE PREVIEW → named destination chooser requires explicit decision.
- `WF-STR-018` Save preview as new strategy → one new permanent active strategy/version appears.
- `WF-STR-019` Merge preview into existing strategy → destination gets new version and sources archive.
- `WF-STR-020` Select legs then Split Selected Legs → new strategy receives only selected identities.
- `WF-STR-021` Restore historical version → new current version is created; old history remains immutable.
- `WF-STR-022` Archive active strategy → chart source disappears and Ledger History retains it.
- `WF-STR-023` Strategy reaches expiry → it moves from active list to Ledger History.
- `WF-STR-024` Reopen same instrument/exact expiry → last valid active strategy restores.

## 9. Seller evidence and review — 15

- `WF-SELL-001` Enter valid name and Create → one exact-expiry seller strategy appears.
- `WF-SELL-002` Create with blank name → no strategy is created and clear instruction appears.
- `WF-SELL-003` Allocate broker change in signed whole lots → reviewed allocation records exact quantity.
- `WF-SELL-004` Split one broker contract across strategies → allocations may divide but must total broker quantity.
- `WF-SELL-005` Reverse direction or allocate across expiry → operation is rejected.
- `WF-SELL-006` Leave quantity unallocated → Review Position Changes remains and risk stays withheld.
- `WF-SELL-007` Import valid tradebook CSV → fills stage locally with no automatic owner.
- `WF-SELL-008` Re-import duplicate CSV → proven duplicates do not create extra fills.
- `WF-SELL-009` Import malformed/ambiguous CSV → row reasons appear and no partial history commits.
- `WF-SELL-010` Assign reviewed fill to strategy → exact fill quantity gains explicit owner.
- `WF-SELL-011` Mark fill remainder unassigned → explicit disposition is stored without guessed ownership.
- `WF-SELL-012` Confirm valid coverage bounds → exact referenced checkpoints attach to strategy.
- `WF-SELL-013` Coverage interval misses checkpoint → `HISTORY GAP` appears and whole-trade map stays hidden.
- `WF-SELL-014` Try accepting with pending position/trade review → acceptance is blocked.
- `WF-SELL-015` Accept fully reviewed snapshot → current/whole risk, P&L, timeline, and Why It Moved publish together.

## 10. Refresh, expiry, persistence, lifecycle — 14

- `WF-LIFE-001` Manual refresh succeeds → live values update while saved entry premiums/snapshots stay fixed.
- `WF-LIFE-002` Trigger concurrent/near-duplicate refreshes → one coherent latest result wins without request storm.
- `WF-LIFE-003` Refresh while selection/editor/preview is open → transient state clears, permanent strategies remain.
- `WF-LIFE-004` Refresh fails → prior ladder values remain, chart risk hides, accepted evidence stays in panel.
- `WF-LIFE-005` Older async refresh completes after newer refresh → stale result cannot overwrite current state.
- `WF-LIFE-006` Switch to expiry with cached accepted view → exact view restores without refresh.
- `WF-LIFE-007` Switch to expiry without cache → chart prompts explicit refresh and invents nothing.
- `WF-LIFE-008` Switch strategy across expiries → selected expiry, chain, evidence, and chart view stay matched.
- `WF-LIFE-009` Change timeframe → cached chain remaps with no broker/chain request.
- `WF-LIFE-010` Zoom or pan → cached chain remaps with no broker/chain request.
- `WF-LIFE-011` Reload TradingView/browser → permanent manual plans, strategies, versions, and accepted evidence restore.
- `WF-LIFE-012` Reload extension repeatedly → one overlay root/listener set exists; no duplicated rows/actions.
- `WF-LIFE-013` Navigate away or page hides → editor, selection, preview, flyouts, and Skyline clear safely.
- `WF-LIFE-014` Open/close/resize/focus side panel → no seller refresh, positions, trades, or chain request occurs.

## 11. Premium Skyline — 10

- `WF-SKY-001` Click rightmost strike number → exact-expiry Premium Skyline opens.
- `WF-SKY-002` Click non-strike portion of row → quick BE behavior runs; Skyline does not open.
- `WF-SKY-003` Double-click non-strike option cell → manual editor opens; Skyline does not.
- `WF-SKY-004` Open Skyline → selected row and passive strike guide become visually distinct.
- `WF-SKY-005` Inspect projection → Call closes map above strike and Put closes below strike.
- `WF-SKY-006` Option candle is missing → real line gap appears; no forward-fill occurs.
- `WF-SKY-007` Move crosshair → exact timestamp, Call, Put, and strike chips attach to matching sample.
- `WF-SKY-008` Underlying candle has no option candle → `NO PREMIUM CANDLE` appears without borrowed timestamp/value.
- `WF-SKY-009` Zoom/pan/reopen cached strike → no request; uncached timeframe interval requests once.
- `WF-SKY-010` Click outside, close, navigate, or change instrument/expiry → Skyline, guide, highlight, and transient cache selection clear.

## 12. Fail-closed recovery and safety — 17

- `WF-FAIL-001` Select malformed/inexact expiry → request is rejected before upstream call.
- `WF-FAIL-002` Local bridge is stopped/origin-rejected → readable disconnected state appears without partial data.
- `WF-FAIL-003` Zerodha session expires → Reconnect appears and no repeated positions call occurs.
- `WF-FAIL-004` Zerodha positions request fails → chart risk hides and prior ledger survives.
- `WF-FAIL-005` Current-day trades request fails → affected whole-trade history hides rather than inferring fills.
- `WF-FAIL-006` Upstox rate-limits/fails → prior ladder survives, chart risk hides, no automatic retry storm starts.
- `WF-FAIL-007` Broker quantity changes → Review Position Changes appears before recalculation/publication.
- `WF-FAIL-008` Authoritative lot-size proof is missing/conflicting → refresh/import fails instead of guessing lots.
- `WF-FAIL-009` Stored manual entry is malformed → it enters recovery review and is excluded from payoff.
- `WF-FAIL-010` Cached strategy/evidence expiry differs from active expiry → chart rejects it without request.
- `WF-FAIL-011` TradingView axis becomes unavailable → chart layers hide while panel calculations remain reviewable.
- `WF-FAIL-012` Permanent storage mutation fails → prior version and preview remain intact.
- `WF-FAIL-013` Same mutation command is delivered twice → only one trade/version change occurs.
- `WF-FAIL-014` Extension context invalidates → user sees reload instruction instead of silent broken controls.
- `WF-FAIL-015` Charges are unavailable → `EXCLUDING UNKNOWN CHARGES` appears and no amount is fabricated.
- `WF-FAIL-016` TradingView LIVE/OFFLINE badge cannot be identified safely → page remains unchanged and ladder still works.
- `WF-FAIL-017` Inspect all broker/chart controls and network calls → no order, modify, cancel, convert, or exit capability exists.

## 13. Keyboard, accessibility, visual integrity — 12

- `WF-A11Y-001` Focus ladder row and press Enter → same single-click selection/cycle behavior runs.
- `WF-A11Y-002` Focus ladder row and press Space → same single-click behavior runs.
- `WF-A11Y-003` Focus ladder row and press Shift+Enter → correct inline editor opens.
- `WF-A11Y-004` Press Escape in editor/selection → transient state closes and focus returns to same strike.
- `WF-A11Y-005` Tab through editor → action buttons, lot control, premium, ADD/SAVE/REMOVE, and close are reachable.
- `WF-A11Y-006` Read live row with assistive technology → Call, Put, strike, and saved-entry count are announced.
- `WF-A11Y-007` Read saved face → direction, option side, lots, snapshots, strike, and cycle position are announced.
- `WF-A11Y-008` Read manual/broker badges → source and exact edit/details action are unambiguous.
- `WF-A11Y-009` Toggle strategy/position checkbox → `aria-pressed` matches visible selected state.
- `WF-A11Y-010` Open grouped controls → opener reports `aria-expanded`; each flyout row owns explicit selector.
- `WF-A11Y-011` Read rail/edge marker → exact type, value, direction, and off-screen state are announced without color dependence.
- `WF-A11Y-012` Test dark/light themes, narrow panel, browser zoom, dense rows, and long numbers → contrast stays readable and controls/text never overlap.

## Next stage

Convert these 202 scenarios into full cases with fixed data, atomic steps, expected results, two-baseline result columns, and evidence links. Run critical smoke workflows first. Any failure blocks “all good” claim and becomes one isolated fix with its own regression case.
