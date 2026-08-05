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

## Checkpoint #006 — 2026-08-01T21:41:31+05:30

### Changed since previous seed
- Replaced fixed ladder membership with real selected-expiry strikes intersecting TradingView's stable visible axis grid, plus one real in-range ATM reference.
- Built and live-approved Premium Skyline: Call above selected strike, Put below, exact TradingView time synchronization, shared crosshair, real missing-data gaps, and no production lower pane.
- Added screen-pixel sample bounds, animation-frame coalescing, canvas reuse, and repeated-crosshair suppression to prevent Page Unresponsive regressions.
- User approved Option A spatial crosshair labels and committed exact design contract as `54d1493`; implementation remains pending.
- User plans separate thread for open-interest brainstorming while this thread continues Skyline label build.

## STATE
Options Ladder runs from `.worktrees/timeframe-axis-ladder/extension-axis-ladder` on `codex/arbdesk-theme-system`. Universal TradingView-axis ladder membership, pinned in-range real ATM, chart-native strategy work, and Premium Skyline are present in dirty active worktree; full extension suite passed after localhost permission. Premium Skyline live visual is approved, but wide crosshair paragraph tooltip still awaits approved Option A spatial-label implementation.

## NEXT_LINE
Implement Option A in `extension-axis-ladder/content.js`: date chip above crosshair, Call chip above Call sample, Put chip below Put sample, strike chip on baseline, edge-safe collisions, and compact missing-premium state; remove wide paragraph tooltip.

## MEMORY_KEY
Premium Skyline approved: Call above strike, Put below, exact TradingView time; next change is Option A spatial crosshair chips from committed spec `54d1493`.

## OPEN_QUESTIONS
- Does Option A pass live edge-collision and light/dark theme UAT after build?
- What exact decision should open-interest visualization help user make?
- Should open-interest work use separate branch/worktree before Skyline-label work merges?
- When should `codex/arbdesk-theme-system` merge into primary branch after user testing?

## Checkpoint #007 — 2026-08-05T00:08:00+05:30

### Changed since previous seed
- Implemented approved spatial Premium Skyline chips and continued into broker-to-strategy/chart integration.
- Imported read-only Zerodha positions as combined broker strategy plus individually selectable exact-strike C/P controls.
- Added strategy dashboard/cards, individual P&L cards, on-demand BE rails, broker connection gating, and reconnect restoration.
- Reserved separate manual, Call, Put, and ladder lanes; restored closed `+N` collision groups that select nothing until exact row choice.
- Fixed break-even-label clearance and C1/P1 top-layer ownership with class plus CSS `:has()` fallback.
- Added 120 focused visual/interaction evals; full bridge and extension suite passes 862/862 sequentially.
- Committed all changes as `1590670` and pushed `codex/arbdesk-theme-system` to GitHub.

## STATE
Options Ladder broker strategy integration is committed and pushed on `codex/arbdesk-theme-system` at `1590670`. Automated verification passes 862/862, including 120 focused layout evals for grouped selection, separate Call/Put lanes, break-even clearance, and position-badge layering. Latest P1 top-layer and BE-overlap fixes still need final live Chrome proof after reloading unpacked extension; current loaded TradingView page was confirmed to use older content revision.

## NEXT_LINE
Reload Options Ladder at `chrome://extensions`, enable ladder, then use Chrome MCP to assert zero rectangle overlaps, P1/C1 computed owner z-index 6, closed `+N` selects nothing, exact flyout selection works, zoom/pan remains aligned, and console has no Options Ladder errors.

## MEMORY_KEY
Broker strategy overlay checkpoint `1590670`: combined plus individual positions, separate manual/Call/Put/ladder lanes, closed `+N`, BE clearance, top-layer C/P badges; 862 tests pass, live reload verification pending.

## OPEN_QUESTIONS
- Does latest unpacked build pass live zero-overlap and P1/C1 top-layer checks after reload?
- Does grouped selector remain unambiguous through zoom, pan, and multiple same-side broker positions?
- When should `codex/arbdesk-theme-system` merge into primary branch after live UAT?

## Checkpoint #008 — 2026-08-05T23:22:10+05:30

### Changed since previous seed
- Moved from pushed checkpoint `1590670` with live reload still pending to dirty candidate `fc32ef1e328c` loaded and exercised in real Chrome.
- Repaired 15 areas covering exact manual/broker identity, shared Call/Put lanes, BE/T lifecycle, grouping, side-panel/Skyline lifecycle, unique concurrent T labels, universal lot sizing, and shared expiry metadata loads.
- Created 202-workflow inventory, automation coverage map, historical live audit, and current post-repair verification record.
- Fresh verification passed 986/986 automated checks, 30/30 changed-file syntax checks, patch integrity, zero tracked-file deletions, live bridge health, and exact 24,200 broker-to-manual click cycle.
- Preserved user data: no real trade was created, edited, removed, merged, split, archived, or submitted.

## STATE
Options Ladder active candidate lives in `.worktrees/timeframe-axis-ladder` on `codex/arbdesk-theme-system` at `fc32ef1e328c`, with dirty post-checkpoint repairs and audit documents. Latest unpacked build is loaded in Chrome; 986/986 tests pass, 30 changed JavaScript/CJS files parse, `git diff --check` passes, no tracked file is deleted, and local bridge is online with Upstox reachable. Critical 24,200 broker → manual T39 → live-selected BE → Escape-neutral workflow passed live without mutating real trades; full 202-workflow live audit remains incomplete.

## NEXT_LINE
Continue `docs/testing/2026-08-05-options-ladder-202-e2e-workflows.md` at next unverified non-destructive workflow using Computer Use; after each fix, rerun targeted tests, reload extension, and repeat exact live Chrome workflow before proceeding.

## MEMORY_KEY
Post-repair 986-green: shared Call/Put lanes, broker → manual T39 → live-selected BE cycle, Escape neutral; full 202 live audit pending.

## OPEN_QUESTIONS
- Which remaining non-destructive workflow should run next from 202-workflow catalog?
- Should destructive REMOVE, merge, split, restore, and archive flows run after snapshotting user storage?
- When should dirty `fc32ef1e328c` candidate be committed and pushed?
- When should real broker authorization and exact authenticated refresh fan-out be verified?

## Checkpoint #009 — 2026-08-05T23:31:42+05:30

### Changed since previous seed
- Committed feature repairs, tests, audit documents, and live evidence as `239ad4e`; pushed final feature verification metadata at `58e8d11` to `origin/codex/arbdesk-theme-system`.
- Committed and pushed checkpoint memory, complete ChatGPT context, and four visual reference files on `codex/timeframe-axis-ladder-base`.
- Verified both pushed remote heads against local commits and confirmed all four registered worktrees have no uncommitted files.
- Preserved pre-commit proof: 986/986 tests, 30/30 changed-file syntax checks, clean staged patches, and no credential matches beyond explicit test fixtures.

## STATE
All local project changes are committed and pushed. `codex/arbdesk-theme-system` is synchronized with GitHub at `58e8d11`, containing product repair commit `239ad4e`; `codex/timeframe-axis-ladder-base` contains checkpoint/context commits and will include this final memory state. All four registered worktrees are clean, while full 202-workflow live execution, authenticated broker fan-out, and snapshot-backed destructive workflows remain pending.

## NEXT_LINE
Continue `docs/testing/2026-08-05-options-ladder-202-e2e-workflows.md` at next unverified non-destructive workflow using Computer Use; after each fix, rerun targeted tests, reload extension, and repeat exact live Chrome workflow before proceeding.

## MEMORY_KEY
Both branches pushed; feature `58e8d11`, product repair `239ad4e`, 986-green broker → manual T39 → live-selected BE → Escape-neutral proof.

## OPEN_QUESTIONS
- Which remaining non-destructive workflow should run next from 202-workflow catalog?
- Should destructive REMOVE, merge, split, restore, and archive flows run after snapshotting user storage?
- When should real broker authorization and exact authenticated refresh fan-out be verified?
- When should `codex/arbdesk-theme-system` merge into primary branch?
