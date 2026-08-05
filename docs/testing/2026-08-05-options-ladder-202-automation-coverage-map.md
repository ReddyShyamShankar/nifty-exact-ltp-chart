# Options Ladder — 202 Workflow Automation Coverage Map

**Audit date:** 2026-08-05
**Workflow source:** `docs/testing/2026-08-05-options-ladder-202-e2e-workflows.md`
**Scope:** Current versioned test files in `extension-axis-ladder/` and `data-bridge/`
**Product files changed:** none

## Classification rules

- `FULL`: one automated test drives complete workflow from user action through final visible result. A pure function, DOM fragment, source-string contract, or mocked subflow does not qualify.
- `PARTIAL`: one or more automated tests cover meaningful pieces, but no complete real-browser journey exists.
- `LIVE-ONLY`: no versioned automated assertion covers required behavior; live Chrome execution is only current evidence route.
- `BLOCKED-EXTERNAL`: complete proof requires real external broker authorization/data. Mocked contract coverage is listed but cannot prove live journey.

## Result

| Bucket | Count |
|---|---:|
| FULL | 0 |
| PARTIAL | 196 |
| LIVE-ONLY | 3 |
| BLOCKED-EXTERNAL | 3 |
| **Total** | **202** |

No workflow qualifies as `FULL`: repository contains no versioned full-browser end-to-end script. Existing tests are valuable lower-level evidence, but cannot prove complete user journeys on TradingView.

### Workflows with no automated evidence

- `WF-MAN-EDIT-007` — unique saved manual entry double-click should open SAVE/REMOVE. Live session already observed failure.
- `WF-POS-014` — outside-click dismissal of an open position-group flyout has no dedicated assertion.
- `WF-SELL-002` — blank strategy-name rejection has no dedicated assertion.

### External proof blockers

- `WF-BRK-001` — real Zerodha authorization launch.
- `WF-BRK-002` — real Zerodha callback/token exchange and connected state.
- `WF-BRK-003` — one real coordinated positions/trades/chain refresh.

## 1. Extension shell, popup, panel, theme

| Workflow | Bucket | Exact automated evidence |
|---|---|---|
| WF-SHL-001 | PARTIAL | `extension-axis-ladder/popup-contract.test.cjs` — “popup keeps chart toggle and refresh immediate, preserves approved glyph, and removes redundant branding” |
| WF-SHL-002 | PARTIAL | `extension-axis-ladder/action-popup.test.cjs` — “popup describes TradingView-axis membership without fixed strike count” |
| WF-SHL-003 | PARTIAL | `extension-axis-ladder/action-popup.test.cjs` — “refresh action gives immediate feedback and refreshes only active TradingView ladder” |
| WF-SHL-004 | PARTIAL | `extension-axis-ladder/action-popup.test.cjs` — “failed refresh stays in popup and explains failure” |
| WF-SHL-005 | PARTIAL | `extension-axis-ladder/action-popup.test.cjs` — “open side panel action opens controls for active TradingView tab then closes popup” |
| WF-SHL-006 | PARTIAL | `extension-axis-ladder/action-popup.test.cjs` — “unsupported tabs disable both popup actions” |
| WF-SHL-007 | PARTIAL | `extension-axis-ladder/side-panel.test.cjs` — “accepts only exact HTTPS TradingView hosts” |
| WF-SHL-008 | PARTIAL | `extension-axis-ladder/side-panel.test.cjs` — “tab activation closes previous panel and persists new active tab” |
| WF-SHL-009 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “stop clears selected rows and re-enable restores one listener set” |
| WF-SHL-010 | PARTIAL | `extension-axis-ladder/theme.test.cjs` — “one stored theme updates surface, icon, accessible label, and all listeners” |

## 2. Ladder, strikes, axis, zoom/pan

| Workflow | Bucket | Exact automated evidence |
|---|---|---|
| WF-LAD-001 | PARTIAL | `extension-axis-ladder/popup-contract.test.cjs` — “REFRESH ALL persists validated chain rows for chart consumption without a second chain request” |
| WF-LAD-002 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “formats each visible row as Call, Put, then rightmost strike” |
| WF-LAD-003 | PARTIAL | `extension-axis-ladder/axis-driven-ladder.test.cjs` — “single-column layout has no artificial thirteen-row limit” |
| WF-LAD-004 | PARTIAL | `extension-axis-ladder/timeframe-ladder.test.cjs` — “native right-axis zoom alone controls row density” |
| WF-LAD-005 | PARTIAL | `extension-axis-ladder/timeframe-ladder.test.cjs` — “selects only native right-axis strikes while retaining ATM metadata” |
| WF-LAD-006 | PARTIAL | `extension-axis-ladder/timeframe-ladder.test.cjs` — “restores rounded TradingView grid slot hidden by live-price marker” |
| WF-LAD-007 | PARTIAL | `extension-axis-ladder/timeframe-ladder.test.cjs` — “pins real ATM strike when it sits inside visible TradingView range but between grid labels” |
| WF-LAD-008 | PARTIAL | `extension-axis-ladder/timeframe-ladder.test.cjs` — “does not pin ATM when its exact strike lies outside visible TradingView range” |
| WF-LAD-009 | PARTIAL | `extension-axis-ladder/axis-driven-ladder.test.cjs` — “zoom rebuilds axis-aligned membership from cached chain without network” |
| WF-LAD-010 | PARTIAL | `extension-axis-ladder/axis-driven-ladder.test.cjs` — “zoom rebuilds axis-aligned membership from cached chain without network” |
| WF-LAD-011 | PARTIAL | `extension-axis-ladder/seller-safety-integration.test.cjs` — “timeframe, zoom, pan, and storage redraw reuse one manual chain snapshot” |
| WF-LAD-012 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “timeframe changes rebuild from cached chain without another data request” |
| WF-LAD-013 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “controller rebuild succeeds and places exact contracts on an inverted TradingView scale” |
| WF-LAD-014 | PARTIAL | `extension-axis-ladder/axis-observer.test.cjs` — “observer projects canvas coordinates into CSS viewport coordinates” |
| WF-LAD-015 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “renders only genuine finite quotes and never coerces missing values to zero” |
| WF-LAD-016 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “render transaction never exposes an axis row before placement coordinates commit” |

## 3. Strike selection and break-even rails

| Workflow | Bucket | Exact automated evidence |
|---|---|---|
| WF-QBE-001 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “atomic save leaves break-even and T rails hidden until operator selects an exact strike face” |
| WF-QBE-002 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “clicked selection creates two rails across the full plot behind the label” |
| WF-QBE-003 | PARTIAL | `extension-axis-ladder/breakeven-rails.test.cjs` — “calculates rounded independent single-leg expiry break-evens” |
| WF-QBE-004 | PARTIAL | `extension-axis-ladder/breakeven-rails.test.cjs` — “calculates rounded independent single-leg expiry break-evens” |
| WF-QBE-005 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “saved-position face click keeps quick Call and Put break-even rails visible” |
| WF-QBE-006 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “clicking the selected row toggles its rails and selection off” |
| WF-QBE-007 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “switching valid rows removes old rails before the next asynchronous placement and never fetches quotes” |
| WF-QBE-008 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “selected strike shows quick BEs while each saved T checkbox owns its BE rail” |
| WF-QBE-009 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “same-strike broker face keeps two quick rails without leaking unrelated manual T controls” |
| WF-QBE-010 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “selected rows clear through outside input, Escape, dedicated refresh clear, and expiry change” |
| WF-QBE-011 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “selected rows clear through outside input, Escape, dedicated refresh clear, and expiry change” |
| WF-QBE-012 | PARTIAL | `extension-axis-ladder/popup-contract.test.cjs` — “real REFRESH ALL clears chart selection before successful or failed network refresh” |
| WF-QBE-013 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “generic timeframe rebuild failure preserves clicked snapshot and restores rails after axis recovery” |
| WF-QBE-014 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “invalid-price row stays selected, draws no rails, and reports unavailable without fetching” |
| WF-QBE-015 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “off-screen rails pin top and bottom markers to plot edges before lane-zero rows” |

## 4. Manual trade creation

| Workflow | Bucket | Exact automated evidence |
|---|---|---|
| WF-MAN-ADD-001 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “double-clicked premium side controls the two direct editor actions” |
| WF-MAN-ADD-002 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “double-clicked premium side controls the two direct editor actions” |
| WF-MAN-ADD-003 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “double click opens editor without quick rails or face flash” |
| WF-MAN-ADD-004 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “editor is an accessible sibling of the ARIA row and inside clicks do not dismiss it” |
| WF-MAN-ADD-005 | PARTIAL | `extension-axis-ladder/manual-ui.test.cjs` — “choosing Call Sell fills Call quote and preserves both snapshots” |
| WF-MAN-ADD-006 | PARTIAL | `extension-axis-ladder/manual-ui.test.cjs` — “choosing Call Sell fills Call quote and preserves both snapshots” |
| WF-MAN-ADD-007 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “valid draft previews changed lots without saving” |
| WF-MAN-ADD-008 | PARTIAL | `extension-axis-ladder/manual-ui.test.cjs` — “draft validation requires only selected snapshot and rejects malformed input matrix” |
| WF-MAN-ADD-009 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “premium input previews in place, preserves focus and selection, and drives compact validation” |
| WF-MAN-ADD-010 | PARTIAL | `extension-axis-ladder/manual-ui.test.cjs` — “draft validation requires only selected snapshot and rejects malformed input matrix” |
| WF-MAN-ADD-011 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “new editor disables Add until selected leg and premium are valid” |
| WF-MAN-ADD-012 | PARTIAL | `extension-axis-ladder/manual-ui.test.cjs` — “editing preserves unavailable opposite snapshot instead of backfilling live quote” |
| WF-MAN-ADD-013 | PARTIAL | `extension-axis-ladder/manual-ui.test.cjs` — “new manual creation fails closed without exact current-expiry lot metadata” |
| WF-MAN-ADD-014 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “new leg waits for explicit chart strategy ownership before any write” |
| WF-MAN-ADD-015 | PARTIAL | `extension-axis-ladder/capture-contract.test.cjs` — “atomic manual CREATE can create its chosen strategy without an empty partial save” |
| WF-MAN-ADD-016 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “strategy ownership choices always require explicit existing or new destination” |
| WF-MAN-ADD-017 | PARTIAL | `extension-axis-ladder/manual-interaction.test.cjs` — “outside and escape cancel timer and reset faces” |

## 5. Manual trade inspect/edit/remove

| Workflow | Bucket | Exact automated evidence |
|---|---|---|
| WF-MAN-EDIT-001 | PARTIAL | `extension-axis-ladder/manual-ui.test.cjs` — “row model exposes separate Call and Put lot badges for same-strike positions” |
| WF-MAN-EDIT-002 | PARTIAL | `extension-axis-ladder/manual-ui.test.cjs` — “lot badges preserve buy and sell direction instead of merging opposite positions” |
| WF-MAN-EDIT-003 | PARTIAL | `extension-axis-ladder/manual-interaction.test.cjs` — “saved entries cycle newest first then live” |
| WF-MAN-EDIT-004 | PARTIAL | `extension-axis-ladder/manual-interaction.test.cjs` — “saved entries cycle newest first then live” |
| WF-MAN-EDIT-005 | PARTIAL | `extension-axis-ladder/manual-ui.test.cjs` — “row model shows one face and exact compact copy” |
| WF-MAN-EDIT-006 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “clicking one-entry badge opens exact saved leg editor with remove control” |
| WF-MAN-EDIT-007 | LIVE-ONLY | No automated test. Live evidence: unique saved manual Put opened blank ADD flow instead of SAVE/REMOVE. |
| WF-MAN-EDIT-008 | PARTIAL | `extension-axis-ladder/manual-interaction.test.cjs` — “double click passes exact face to editor then clears cycle ownership” |
| WF-MAN-EDIT-009 | PARTIAL | `extension-axis-ladder/manual-ui.test.cjs` — “editor wires direct actions, lot stepper, premium, save, remove, and close” |
| WF-MAN-EDIT-010 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “manual edit replaces identity atomically, preserves created timestamp, and focuses exact row” |
| WF-MAN-EDIT-011 | PARTIAL | `extension-axis-ladder/manual-payoff.test.cjs` — “approved lot changes move combined break-evens” |
| WF-MAN-EDIT-012 | PARTIAL | `extension-axis-ladder/manual-ui.test.cjs` — “switching an edited Call entry to Put starts a second position instead of overwriting Call” |
| WF-MAN-EDIT-013 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “manual remove targets the active entry identity and focuses its exact row” |
| WF-MAN-EDIT-014 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “editor close control cancels draft and restores exact-row focus” |
| WF-MAN-EDIT-015 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “manual refresh preserves saved entry snapshot” |
| WF-MAN-EDIT-016 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “manual persistence crosses one atomic service-worker operation boundary” |
| WF-MAN-EDIT-017 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “expiry change invalidates old data and waits for manual refresh”; `extension-axis-ladder/manual-plan.test.cjs` — “remove deletes only exact id in exact expiry” |
| WF-MAN-EDIT-018 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “storage failure keeps exact editor draft open and old plan intact” |

## 6. Broker connection/import/position actions

| Workflow | Bucket | Exact automated evidence |
|---|---|---|
| WF-BRK-001 | BLOCKED-EXTERNAL | Mock only: `data-bridge/zerodha-session.test.js` — “builds official v3 login URL and reports no secret material” |
| WF-BRK-002 | BLOCKED-EXTERNAL | Mock only: `data-bridge/zerodha-session.test.js` — “exchanges request token with literal SHA-256 checksum and stores token until next 06:00 IST” |
| WF-BRK-003 | BLOCKED-EXTERNAL | Mock only: `data-bridge/server.test.js` — “one seller refresh coordinates positions, trades, and chain exactly once” |
| WF-BRK-004 | PARTIAL | `extension-axis-ladder/strategy-store.test.cjs` — “broker sync does not consume manual T sequence” |
| WF-BRK-005 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “live broker strategy storage update adds exact Call marker and matching ladder badge” |
| WF-BRK-006 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “nearby broker Call and Put positions remain in separate type columns” |
| WF-BRK-007 | PARTIAL | `extension-axis-ladder/manual-ui.test.cjs` — “row model renders broker Call and Put lot badges like manual positions” |
| WF-BRK-008 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “document pointer capture plus broker badge click opens exact read-only card without clearing quick rails” |
| WF-BRK-009 | PARTIAL | Coverage conflict: `extension-axis-ladder/content-contract.test.cjs` — “ordinary cell double-click from broker face opens fresh manual editor”; badge click is covered separately, but required owned-position double-click journey is not. |
| WF-BRK-010 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “broker spine opens one compact P&L card and shows break-even rail only on request” |
| WF-BRK-011 | PARTIAL | `extension-axis-ladder/strategy-panel.test.cjs` — “broker strategy card derives open P&L from broker position evidence” |
| WF-BRK-012 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “broker spine compact selectors build combined preview without opening P&L cards” |
| WF-BRK-013 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “broker spine opens one compact P&L card and shows break-even rail only on request” |
| WF-BRK-014 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “broker card CLOSE preserves an independent open plus group and exact strategy selection” |
| WF-BRK-015 | PARTIAL | `extension-axis-ladder/strategy-store.test.cjs` — “flat broker snapshot archives live strategy while preserving its version” |
| WF-BRK-016 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “broker disconnect hides persisted broker position spine without deleting strategy book” |

## 7. Shared Call/Put lanes and collision grouping

| Workflow | Bucket | Exact automated evidence |
|---|---|---|
| WF-POS-001 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “manual and broker controls share columns by Call and Put type” |
| WF-POS-002 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “chart controls expose only source-neutral Call and Put columns” |
| WF-POS-003 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “nearby broker Call and Put positions remain in separate type columns” |
| WF-POS-004 | PARTIAL | `extension-axis-ladder/position-layout-100-evals.test.cjs` — “POS_CLEAR_076 keeps safely separated positions directly visible” |
| WF-POS-005 | PARTIAL | `extension-axis-ladder/position-layout-100-evals.test.cjs` — “POS_GROUP_041 collapses same-side vertical collisions into one informational count” |
| WF-POS-006 | PARTIAL | `extension-axis-ladder/position-layout-100-evals.test.cjs` — “POS_SIDE_061 never combines Call and Put collisions” |
| WF-POS-007 | PARTIAL | `extension-axis-ladder/position-layout-100-evals.test.cjs` — “POS_A11Y_097 closed plus count is informational and cannot be clicked” |
| WF-POS-008 | PARTIAL | `extension-axis-ladder/position-layout-100-evals.test.cjs` — “POS_A11Y_096 group opener exposes expansion only, never ambiguous selection” |
| WF-POS-009 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “same-side broker collisions restore closed plus group with nothing selected” |
| WF-POS-010 | PARTIAL | `extension-axis-ladder/position-layout-100-evals.test.cjs` — “POS_A11Y_098 exact flyout row owns explicit selection state” |
| WF-POS-011 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “overlapping Call strategy and off-grid Call tokens use restored position group without absorbing nearby Put” |
| WF-POS-012 | PARTIAL | `extension-axis-ladder/position-layout-100-evals.test.cjs` — “POS_COLOR_100 grouped rows preserve Buy green and Sell red identity rails” |
| WF-POS-013 | PARTIAL | `extension-axis-ladder/position-layout-100-evals.test.cjs` — “POS_LAYER_099 grouped flyout renders above ladder and compact controls” |
| WF-POS-014 | LIVE-ONLY | No dedicated automated test for outside-click dismissal of an open position-group flyout without selection/data mutation. |
| WF-POS-015 | PARTIAL | `extension-axis-ladder/position-layout-100-evals.test.cjs` — “POS_LAYOUT_001 reserves source-neutral Call and Put columns before ladder” |
| WF-POS-016 | PARTIAL | `extension-axis-ladder/position-layout-100-evals.test.cjs` — “BE_CLEAR_101 stops quick break-even text before every position-control lane” |
| WF-POS-017 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “OI rank badges use a separate top band and cannot collide with position badges” |
| WF-POS-018 | PARTIAL | `extension-axis-ladder/position-layout-100-evals.test.cjs` — “POS_SPINE_086 limits vertical spine to first and last visible ladder strikes” |

## 8. Strategy rails, selection, preview, versions

| Workflow | Bucket | Exact automated evidence |
|---|---|---|
| WF-STR-001 | PARTIAL | `extension-axis-ladder/strategy-chart.test.cjs` — “label opens details without toggling selection” |
| WF-STR-002 | PARTIAL | `extension-axis-ladder/strategy-chart.test.cjs` — “any square synchronizes whole strategy selection” |
| WF-STR-003 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “production strategy rails open details, synchronize squares, preview combined roots, compare, and clear on refresh” |
| WF-STR-004 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “atomic save leaves break-even and T rails hidden until operator selects an exact strike face” |
| WF-STR-005 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “selected strike shows quick BEs while each saved T checkbox owns its BE rail” |
| WF-STR-006 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “same-strike broker face keeps two quick rails without leaking unrelated manual T controls” |
| WF-STR-007 | PARTIAL | `extension-axis-ladder/strategy-preview.test.cjs` — “preview requires at least two strategies” |
| WF-STR-008 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “production strategy rails open details, synchronize squares, preview combined roots, compare, and clear on refresh” |
| WF-STR-009 | PARTIAL | `extension-axis-ladder/screenshot-defect-regression.test.cjs` — “UX: preview selection supports three strategies and preserves order” |
| WF-STR-010 | PARTIAL | `extension-axis-ladder/manual-payoff.test.cjs` — “solver returns every root and detects fully flat payoff” |
| WF-STR-011 | PARTIAL | `extension-axis-ladder/strategy-chart.test.cjs` — “Compare and clear remain explicit independent actions” |
| WF-STR-012 | PARTIAL | `extension-axis-ladder/strategy-preview.test.cjs` — “square selection and Compare state update immutably” |
| WF-STR-013 | PARTIAL | `extension-axis-ladder/screenshot-defect-regression.test.cjs` — “UX: Clear resets preview without mutating strategy book” |
| WF-STR-014 | PARTIAL | `extension-axis-ladder/strategy-preview.test.cjs` — “mixed instrument or expiry selection is rejected” |
| WF-STR-015 | PARTIAL | `extension-axis-ladder/strategy-preview.test.cjs` — “mixed instrument or expiry selection is rejected” |
| WF-STR-016 | PARTIAL | `extension-axis-ladder/strategy-preview.test.cjs` — “missing live quote preserves selection but blocks economics”; “stale live quote timestamp preserves selection but blocks combined economics” |
| WF-STR-017 | PARTIAL | `extension-axis-ladder/strategy-panel.test.cjs` — “save always requires create-new or explicit destination” |
| WF-STR-018 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “combined preview saves permanently from chart after explicit destination choice” |
| WF-STR-019 | PARTIAL | `extension-axis-ladder/strategy-store.test.cjs` — “merge creates destination version before archiving both sources” |
| WF-STR-020 | PARTIAL | `extension-axis-ladder/strategy-panel.test.cjs` — “split and restore builders require explicit immutable identities” |
| WF-STR-021 | PARTIAL | `extension-axis-ladder/strategy-store.test.cjs` — “restore creates new current version without changing historical version” |
| WF-STR-022 | PARTIAL | `extension-axis-ladder/capture-contract.test.cjs` — “archiving strategy removes its inactive manual trades while preserving ledger evidence” |
| WF-STR-023 | PARTIAL | `extension-axis-ladder/strategy-store.test.cjs` — “expired active strategy moves to ledger history and remains inspectable” |
| WF-STR-024 | PARTIAL | `extension-axis-ladder/strategy-store.test.cjs` — “last selection restores only an active strategy in exact instrument and expiry context” |

## 9. Seller evidence and review

| Workflow | Bucket | Exact automated evidence |
|---|---|---|
| WF-SELL-001 | PARTIAL | `extension-axis-ladder/popup-contract.test.cjs` — “explicit strategy, whole-lot allocation, CSV import, and acceptance publish one reviewed snapshot” |
| WF-SELL-002 | LIVE-ONLY | No dedicated automated test for blank strategy-name rejection and visible instruction. |
| WF-SELL-003 | PARTIAL | `extension-axis-ladder/seller-ledger.test.cjs` — “position changes preserve accepted allocations and require exact signed whole lots” |
| WF-SELL-004 | PARTIAL | `extension-axis-ladder/seller-evidence-hardening.test.cjs` — “CSV evidence stages unowned, supports quantity splits, and leaves explicit remainder unassigned” |
| WF-SELL-005 | PARTIAL | `extension-axis-ladder/seller-ledger.test.cjs` — “exact expiry and identity validation reject cross-expiry and legacy allocations” |
| WF-SELL-006 | PARTIAL | `extension-axis-ladder/popup-view.test.cjs` — “fails closed while any broker position still needs reviewed allocation” |
| WF-SELL-007 | PARTIAL | `extension-axis-ladder/popup-contract.test.cjs` — “CSV import stays staged until explicit quantity dispositions and coverage confirmation” |
| WF-SELL-008 | PARTIAL | `extension-axis-ladder/tradebook-csv.test.cjs` — “ignores duplicate trade IDs and content fingerprints” |
| WF-SELL-009 | PARTIAL | `extension-axis-ladder/tradebook-csv.test.cjs` — “returns row-level reasons and no trades when any NIFTY row is malformed” |
| WF-SELL-010 | PARTIAL | `extension-axis-ladder/popup-contract.test.cjs` — “operator explicitly assigns post-import daily trade once and unknown trades remain review-required” |
| WF-SELL-011 | PARTIAL | `extension-axis-ladder/seller-evidence-hardening.test.cjs` — “CSV evidence stages unowned, supports quantity splits, and leaves explicit remainder unassigned” |
| WF-SELL-012 | PARTIAL | `extension-axis-ladder/seller-evidence-hardening.test.cjs` — “whole-trade history stays closed until operator declares coverage bounds” |
| WF-SELL-013 | PARTIAL | `extension-axis-ladder/seller-evidence-hardening.test.cjs` — “successful zero-trade checkpoint extends coverage while a missed day becomes HISTORY_GAP” |
| WF-SELL-014 | PARTIAL | `extension-axis-ladder/popup-view.test.cjs` — “fails closed while a current-day trade still needs explicit strategy ownership” |
| WF-SELL-015 | PARTIAL | `extension-axis-ladder/seller-safety-integration.test.cjs` — “bridge payload flows through reviewed ledger, both risk maps, storage, and exact-axis layers” |

## 10. Refresh, expiry, persistence, lifecycle

| Workflow | Bucket | Exact automated evidence |
|---|---|---|
| WF-LIFE-001 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “manual refresh preserves saved entry snapshot” |
| WF-LIFE-002 | PARTIAL | `data-bridge/chain-cache.test.js` — “deduplicates concurrent and near-duplicate loads by key” |
| WF-LIFE-003 | PARTIAL | `extension-axis-ladder/popup-contract.test.cjs` — “real REFRESH ALL clears chart selection before successful or failed network refresh” |
| WF-LIFE-004 | PARTIAL | `extension-axis-ladder/popup-contract.test.cjs` — “failed REFRESH ALL immediately withholds chart while accepted evidence survives reopen” |
| WF-LIFE-005 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “production stale older refresh cannot overwrite a newer accepted refresh” |
| WF-LIFE-006 | PARTIAL | `extension-axis-ladder/popup-contract.test.cjs` — “strategy switch restores same-expiry and September accepted views without refresh or global destruction” |
| WF-LIFE-007 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “expiry change invalidates old data and waits for manual refresh” |
| WF-LIFE-008 | PARTIAL | `extension-axis-ladder/popup-contract.test.cjs` — “popup storage and content controller restore August to September cached view without requests” |
| WF-LIFE-009 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “timeframe changes rebuild from cached chain without another data request” |
| WF-LIFE-010 | PARTIAL | `extension-axis-ladder/seller-safety-integration.test.cjs` — “timeframe, zoom, pan, and storage redraw reuse one manual chain snapshot” |
| WF-LIFE-011 | PARTIAL | `extension-axis-ladder/strategy-store.test.cjs` — “legacy manual plans migrate once without rewriting captured entries” |
| WF-LIFE-012 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “stop clears selected rows and re-enable restores one listener set” |
| WF-LIFE-013 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “pagehide clears manual rail visuals without deleting saved entries”; “same-label SPA navigation clears manual rail visuals without deleting saved entries” |
| WF-LIFE-014 | PARTIAL | `extension-axis-ladder/seller-safety-integration.test.cjs` — “popup-open and negative UI actions make no seller refresh, chain, position, or trade request” |

## 11. Premium Skyline

| Workflow | Bucket | Exact automated evidence |
|---|---|---|
| WF-SKY-001 | PARTIAL | `extension-axis-ladder/premium-skyline-lifecycle.test.cjs` — “opening Premium Skyline preserves stable time-axis evidence for the first paint” |
| WF-SKY-002 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “strike-number history action does not replace row click or double-click behavior” |
| WF-SKY-003 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “strike-number history action does not replace row click or double-click behavior” |
| WF-SKY-004 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “premium history selection keeps strike baseline and removes strike-touch dots” |
| WF-SKY-005 | PARTIAL | `extension-axis-ladder/premium-chart-trials.test.cjs` — “SKYLINE maps exact Call close above strike and Put close below strike” |
| WF-SKY-006 | PARTIAL | `extension-axis-ladder/premium-history-model.test.cjs` — “missing side remains gap and is never forward-filled” |
| WF-SKY-007 | PARTIAL | `extension-axis-ladder/premium-chart-trials.test.cjs` — “spatial labels attach to date, Call, Put, and strike locations” |
| WF-SKY-008 | PARTIAL | `extension-axis-ladder/premium-history-pane.test.cjs` — “TradingView crosshair snaps to exact underlying candle and reports true missing premium” |
| WF-SKY-009 | PARTIAL | `extension-axis-ladder/premium-history-pane.test.cjs` — “concurrent identical opens deduplicate and cached reopen makes no request” |
| WF-SKY-010 | PARTIAL | `extension-axis-ladder/premium-skyline-lifecycle.test.cjs` — “outside chart pointerdown closes Premium Skyline with the other transient selections” |

## 12. Fail-closed recovery and safety

| Workflow | Bucket | Exact automated evidence |
|---|---|---|
| WF-FAIL-001 | PARTIAL | `data-bridge/server.test.js` — “invalid exact ISO expiry fails before every upstream call” |
| WF-FAIL-002 | PARTIAL | `data-bridge/server.test.js` — “rejects adversarial and origin-less browser access before account data is read”; `extension-axis-ladder/popup-view.test.cjs` — “surfaces stale broker timestamp and disconnected auth action” |
| WF-FAIL-003 | PARTIAL | `extension-axis-ladder/seller-safety-integration.test.cjs` — “rate-limit and expired-Zerodha bridge failures are single-shot and expose no partial snapshot” |
| WF-FAIL-004 | PARTIAL | `extension-axis-ladder/seller-safety-integration.test.cjs` — “stale, changed-position, and missing-history states fail closed without erasing accepted evidence” |
| WF-FAIL-005 | PARTIAL | `extension-axis-ladder/popup-view.test.cjs` — “shows incomplete history without inventing whole-trade risk” |
| WF-FAIL-006 | PARTIAL | `extension-axis-ladder/seller-safety-integration.test.cjs` — “one explicit refresh preserves prior evidence on rate-limit failure and never retries” |
| WF-FAIL-007 | PARTIAL | `extension-axis-ladder/popup-contract.test.cjs` — “changed-position refresh preserves accepted evidence across popup reopen while chart publication is withheld” |
| WF-FAIL-008 | PARTIAL | `data-bridge/server.test.js` — “seller refresh fails closed when expiry metadata has no exact lot size” |
| WF-FAIL-009 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “malformed stored records stay recoverable and expose compact review count after valid mutation” |
| WF-FAIL-010 | PARTIAL | `extension-axis-ladder/popup-contract.test.cjs` — “content controller rejects a valid snapshot for the wrong active expiry without a request” |
| WF-FAIL-011 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “axis failure conceals manual rails without deleting plan” |
| WF-FAIL-012 | PARTIAL | `extension-axis-ladder/capture-contract.test.cjs` — “strategy storage failure returns error and preserves prior book” |
| WF-FAIL-013 | PARTIAL | `extension-axis-ladder/capture-contract.test.cjs` — “duplicate strategy command remains idempotent through service worker” |
| WF-FAIL-014 | PARTIAL | `extension-axis-ladder/premium-skyline-lifecycle.test.cjs` — “invalidated premium-history runtime tells the user to reload TradingView” |
| WF-FAIL-015 | PARTIAL | `extension-axis-ladder/strategy-preview.test.cjs` — “unknown charges are disclosed, never guessed” |
| WF-FAIL-016 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “live badge installs once outside ladder state, isolates failure, and stops on unload” |
| WF-FAIL-017 | PARTIAL | `extension-axis-ladder/seller-safety-integration.test.cjs` — “Zerodha client surface is NIFTY-read-only and has no order operation” |

## 13. Keyboard, accessibility, visual integrity

| Workflow | Bucket | Exact automated evidence |
|---|---|---|
| WF-A11Y-001 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “Enter and Space cycle saved faces newest-first while Escape returns live” |
| WF-A11Y-002 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “Enter and Space cycle saved faces newest-first while Escape returns live” |
| WF-A11Y-003 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “Shift+Enter opens exact-row editor and Escape cancels it with row focus restored” |
| WF-A11Y-004 | PARTIAL | `extension-axis-ladder/content-contract.test.cjs` — “Shift+Enter opens exact-row editor and Escape cancels it with row focus restored” |
| WF-A11Y-005 | PARTIAL | `extension-axis-ladder/manual-ui.test.cjs` — “editor wires direct actions, lot stepper, premium, save, remove, and close” |
| WF-A11Y-006 | PARTIAL | `extension-axis-ladder/manual-ui.test.cjs` — “row model shows one face and exact compact copy” |
| WF-A11Y-007 | PARTIAL | `extension-axis-ladder/manual-ui.test.cjs` — “entry accessible name reports exact position in newest-first cycle” |
| WF-A11Y-008 | PARTIAL | `extension-axis-ladder/manual-ui.test.cjs` — “manual and broker positions at same strike remain separate badges” |
| WF-A11Y-009 | PARTIAL | `extension-axis-ladder/strategy-chart.test.cjs` — “any square synchronizes whole strategy selection” |
| WF-A11Y-010 | PARTIAL | `extension-axis-ladder/position-layout-100-evals.test.cjs` — “POS_A11Y_096 group opener exposes expansion only, never ambiguous selection”; “POS_A11Y_098 exact flyout row owns explicit selection state” |
| WF-A11Y-011 | PARTIAL | `extension-axis-ladder/strategy-chart.test.cjs` — “accessible labels expose identity, exact price, edge direction, and action” |
| WF-A11Y-012 | PARTIAL | `extension-axis-ladder/expanded-ui-performance.test.cjs` — “dark plan text contrast exceeds WCAG AA”; “light plan text contrast exceeds WCAG AA”; `extension-axis-ladder/content-contract.test.cjs` — “dense and coincident rows never expand beyond one column” |

## Audit conclusion

Automated suite supplies broad component evidence, but **0/202 complete journeys are automated**. Highest-risk gaps:

1. `WF-MAN-EDIT-007`: no test and already failed live.
2. `WF-BRK-009`: existing automated assertion encodes potentially conflicting ordinary-cell double-click behavior.
3. `WF-POS-014`: no test for outside-click dismissal of an open position-group flyout.
4. `WF-SELL-002`: no test for blank-name rejection.
5. `WF-BRK-001..003`: mocked contracts cannot replace real Zerodha authorization and coordinated live refresh.
6. Every geometry/overlap workflow still requires live TradingView screenshots and measured DOM rectangles before release.
