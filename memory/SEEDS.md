# SEEDS — checkpoint history, append-only

## Checkpoint #001 — 2026-07-24T18:30:00+05:30

### Changed since previous seed
- First startup seed created; no prior seed existed.
- Public GitHub repository created and all current project files published.
- Local Git origin configured; local working tree verified clean.

## STATE

NIFTY Exact LTP Chart design, implementation plan, prototype indicator, Chrome extension, and supporting documents are saved locally and published in `ReddyShyamShankar/nifty-exact-ltp-chart`.
Repository contents match, though local has one root commit and GitHub has connector-created commits. No deployable product exists yet; implementation waits data and chart-library access gates.

## NEXT_LINE

Prove Upstox WebSocket market-data access, then confirm TradingView Advanced Charts license/access before beginning controlled-chart implementation.

## MEMORY_KEY

Exact price-level Call/Strike/Put LTP labels require chart we control: Upstox -> own data service -> TradingView Advanced Charts.

## OPEN_QUESTIONS
- Does user's Upstox analytics token receive market-data WebSocket updates?
- Does user have TradingView Advanced Charts access and public-release license approval?
- What is final product name and logo?

## Checkpoint #002 — 2026-07-26

### Changed since previous seed
- Adopted working Pine-plus-extension V1 instead of controlled-chart path.
- Added Keychain-backed persistent bridge and automatic macOS startup.
- Fixed exact-expiry and exact-symbol browser synchronization.
- Verified all 18 expiries at bridge level and two non-adjacent expiries end to end in TradingView.

## STATE

Working V1 uses Chrome extension v0.11.6 in user's normal logged-in Chrome window. Persistent Upstox bridge starts automatically, all 18 offered expiries return chains, and one sync fills ten exact Pine Call/Put symbols. Browser E2E passed for 4 Aug 2026 and 29 Sep 2026.

## NEXT_LINE

Daily use: open NIFTY chart, select any offered expiry, and press SYNC PINE INPUTS. Bridge starts automatically; reload extension only after code updates.

## MEMORY_KEY

Working path is Upstox option chain -> Keychain-backed persistent bridge -> same-window Chrome extension -> exact TradingView Pine input symbols -> live five-strike Call/Put labels.

## OPEN_QUESTIONS
- Should center strike auto-follow ATM or remain user-controlled?
- What is final product name and logo?

## Checkpoint #003 — 2026-07-26

### Changed since previous seed
- Updated extension to v0.12.0.
- Replaced 50-point ladder with five rows 100 points apart.
- Center now derives from live NIFTY spot during sync; no manual center typing.
- Verified 4 Aug and 18 Aug 2026 end to end, then restored and saved 18 Aug layout.

## STATE

Same-window extension calculates nearest 100-point ATM, writes center and interval, then fills ten exact Pine contracts. At spot 23,767.45, verified rows are 23,600 / 23,700 / 23,800 / 23,900 / 24,000.

## NEXT_LINE

Daily use: open NIFTY chart, select any liquid offered expiry, and press SYNC PINE INPUTS. Center and 100-point spacing are automatic.

## MEMORY_KEY

Five visible strike rows now cover 400 points using 100-point spacing; ten contracts remain five Calls plus five Puts.

## OPEN_QUESTIONS
- Should extension auto-run when ATM crosses next 100-point boundary, or keep explicit sync button?
- What is final product name and logo?

## Checkpoint #004 — 2026-07-27T09:38:15+05:30

### Changed since previous seed
- Built separate NIFTY Axis LTP Ladder v0.3.8 without deleting or modifying original Pine-sync backup.
- Expanded ladder from five rows to thirteen exact contracts: six below ATM, ATM, and six above.
- Replaced Pine label placement with direct TradingView native right-axis coordinate anchoring.
- Hardened timeframe-change auto-fit and native-axis capture against invalid, sparse, or stale TradingView canvas markers.
- Passed 124/124 tests and live 4-hour, Monthly, inverse-scale, zoom, and timeframe-return checks.

## STATE

NIFTY Axis LTP Ladder v0.3.8 is loaded in Chrome from `.worktrees/timeframe-axis-ladder/extension-axis-ladder`; original NIFTY Chain LTP Overlay v0.14.0 remains disabled and untouched as backup. New extension displays thirteen exact Call/Put rows at TradingView native right-axis price coordinates and follows timeframe, zoom, and inverse-scale transforms. Live verification passed on 4-hour and Monthly charts, including return from Monthly to 4-hour.

## NEXT_LINE

Use Axis Ladder v0.3.8 across live-market timeframes and report visual or loading feedback; keep original v0.14.0 disabled until final product choice.

## MEMORY_KEY

Current candidate is independent Axis Ladder v0.3.8: Upstox chain -> thirteen exact strikes -> TradingView native axis capture -> same right-axis coordinates through timeframe, zoom, and inverse-scale changes; original Pine-sync v0.14.0 stays as backup.

## OPEN_QUESTIONS
- Should Axis Ladder become primary product after live-market trial, or should original Pine-sync flow remain primary?
- Should ATM and thirteen-strike membership update automatically at each 100-point crossing?
- What is final product name and logo?

## Checkpoint #005 — 2026-07-30T11:09:53+05:30

### Changed since previous seed
- Advanced independent Axis Ladder from v0.3.8 to Options Ladder v0.5.0 on `codex/timeframe-axis-ladder`.
- Replaced popup-first workflow with a light TradingView-only side panel and explicit manual refresh.
- Added read-only Zerodha evidence foundation, but deferred live-position chart workflow until a later phase.
- Added clicked-strike single-leg break-even rails and a double-click in-place manual strategy builder.
- Added separate Call/Put entries, side-specific lot badges, entry snapshots, full-width plan rails, and individual-position P&L flips.
- Passed 450/450 tests, verified current build in Chrome, and pushed both active branches to GitHub.

## STATE
Options Ladder v0.5.0 is loaded from `.worktrees/timeframe-axis-ladder/extension-axis-ladder` and remains isolated on `codex/timeframe-axis-ladder` for user testing. Manual refresh, side panel, exact-axis ladder, clicked-strike break-evens, manual what-if positions, side-specific lot badges, full-width plan rails, and individual-position P&L flips are implemented. GitHub holds both `codex/timeframe-axis-ladder` and `codex/timeframe-axis-ladder-base`; full suite passes 450/450.

## NEXT_LINE
Create a separate worktree/branch for the next approved UI change; keep `codex/timeframe-axis-ladder` unchanged as the tested checkpoint until user accepts it.

## MEMORY_KEY
Options Ladder v0.5.0 manual-first checkpoint: explicit refresh, TradingView side panel, exact-axis 13-row ladder, clicked-strike BE rails, double-click plan editor, C/P lot badges, and individual P&L flips; live positions deferred.

## OPEN_QUESTIONS
- Which UI correction should start in the next isolated thread?
- Does the 0.00 option-LTP state reproduce after a healthy bridge refresh, and should zero upstream quotes fail closed visibly?
- When should live Zerodha positions graduate from deferred foundation to chart-visible workflow?
- When should `codex/timeframe-axis-ladder` merge into the primary branch after user testing?
