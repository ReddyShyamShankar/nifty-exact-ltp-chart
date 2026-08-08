# Options Ladder — 202 Workflow Execution Log — 2026-08-06

## Run identity

- Baseline: current candidate `codex/arbdesk-theme-system` at `58e8d11` plus the recorded `WF-SHL-008` repair below.
- Browser: Google Chrome `150.0.7871.189`.
- TradingView chart: `https://tradingview.com/chart/Q1Ws31su/`, NIFTY, 1D.
- Safety: no trade, strategy, version, allocation, archive, restore, merge, split, or broker order was created or changed.
- Scope: current candidate only. Previous-pushed baseline comparison remains pending.

## Current progress

| Workflow | Result | Live evidence |
|---|---|---|
| `WF-SHL-001` | PASS | Options Ladder toolbar action opened compact popup on TradingView. |
| `WF-SHL-002` | PASS | Popup showed `READY TO REFRESH`, `REFRESH LADDER`, and `OPEN CONTROLS`. |
| `WF-SHL-003` | PASS | Refresh completed as `REFRESHED JUST NOW`; chart stayed `LIVE` and option quotes changed. |
| `WF-SHL-004` | PASS (CONTROLLED AUTOMATION) | Injected refresh rejection stayed in popup and exposed readable failure without partial data. |
| `WF-SHL-005` | PASS | `OPEN CONTROLS` closed compact popup and opened Options Ladder side panel for active TradingView tab. |
| `WF-SHL-006` | PASS AFTER REPAIR | Unsupported New Tab opens popup with disabled `REFRESH LADDER` and `OPEN CONTROLS`, plus `OPEN A TRADINGVIEW CHART`. |
| `WF-SHL-007` | PASS (LIVE + CONTROLLED AUTOMATION) | Lookalike host stayed locked out live; exact host matrix rejected HTTP and unsupported hosts and accepted only exact HTTPS TradingView hosts. |
| `WF-SHL-008` | PASS AFTER REPAIR | Initial live run failed because panel remained visible on New Tab. Latest unpacked revision was reloaded; switching to New Tab closed panel, returning to TradingView did not reopen it, and ladder remained `LIVE`. |
| `WF-SHL-009` | PASS AFTER REPAIR | Valid 22-row LIVE baseline hid to 0 rows, then restored to 26 LIVE rows without another manual refresh. Stored trades were not changed. |
| `WF-SHL-010` | PASS | Light switched to dark across compact popup and side panel, survived popup close/reopen, then switched back to light and survived another reopen. Chart ladder remained LIVE. |
| `WF-LAD-001` | PASS | Explicitly selected `2026-08-11 · 5 DTE`; one `REFRESH ALL` loaded 20 visible rows with 20 unique strikes and no duplicates. |
| `WF-LAD-002` | PASS | All 20 visible rows retained `Call premium | Put premium | strike` order with zero mismatches. |
| `WF-LAD-003` | PASS | Live chart rendered 20 unique strikes at one uniform ladder depth in one right-side column, exceeding former 13-row limit without duplicates. |
| `WF-LAD-004` | PASS | Native price-axis zoom increased visible rows from 20 to 24 and reduced minimum real strike step from 100 to 50 while ladder stayed `LIVE`. |
| `WF-LAD-005` | PASS | Native price-axis zoom-out reduced visible rows from 24 to 17 and increased minimum real strike step from 50 to 200 while ladder stayed `LIVE`. |
| `WF-LAD-006` | PASS | Live-price badge covered native 24,600 label; ladder restored real 24,600 row between visible 24,400 and 24,800 cadence. |
| `WF-LAD-007` | PASS AFTER REPAIR | Initial sparse-axis replay omitted real in-range ATM. Latest unpacked revision retained exact 24,550 ATM once between native 24,000 and 25,000 rows while ladder stayed `LIVE`. |
| `WF-LAD-008` | PASS | Historical NIFTY range around 4,480–5,440 kept cached ATM 24,550 outside view; no ATM row was forced and extension failed closed with `Visible axis contracts are unavailable.` |
| `WF-LAD-009` | PASS | Native zoom-in remapped cached chain from 25 to 14 rows and 50-point to 100-point minimum cadence without manual refresh or network fetch. |
| `WF-LAD-010` | PASS | Reverse zoom remapped cached chain from 14 to 22 rows and restored 50-point minimum cadence without manual refresh or network fetch. |
| `WF-LAD-011` | PASS | Horizontal pan retained 22 exact saved strike identities, row count, and cached-chain state without refresh. |
| `WF-LAD-012` | PASS | TradingView timeframe changed from 4 hours to 1 day; 22 cached rows and exact ATM remained correctly placed without refresh. |
| `WF-LAD-013` | PASS | Inverted price scale placed 26 unique rows in inverted chart order while retaining exact ATM and `LIVE` status. |
| `WF-LAD-014` | PASS | Side-panel resize retained 26 unique rows, exact ATM, and exact-axis placement while ladder stayed `LIVE`. |
| `WF-LAD-015` | PASS AFTER REPAIR | Live far-expiry data exposed missing quotes as zero sentinels. Repair maps non-positive market quotes to unavailable; live replay showed `—` and `PARTIAL`, never false zero or false `LIVE`. |
| `WF-LAD-016` | PASS | Historical unsafe axis hid every unplaced row and showed `Visible axis contracts are unavailable.`; no top-left fallback row appeared. |
| `WF-QBE-001` | PASS | Clean reload and refresh showed no quick, manual, or broker break-even rail before exact strike selection. |
| `WF-QBE-002` | PASS | One clean 25,000 strike click produced exactly one Call rail and one Put rail. |
| `WF-QBE-003` | PASS | Call break-even used displayed 800.50 premium: 25,000 + 800.50 rounded to 25,801. |
| `WF-QBE-004` | PASS | Put break-even used displayed 598.85 premium: 25,000 − 598.85 rounded to 24,401. |
| `WF-QBE-005` | PASS | Controlled T50 Call/Put fixture retained both saved-entry badges while one row click rendered exact quick rails. |
| `WF-QBE-006` | PASS | Clicking selected 25,000 again cleared selection and both rails. |
| `WF-QBE-007` | PASS | Selecting 24,000 then 25,000 replaced old rails with only new exact 25,000 rails. |
| `WF-QBE-008` | PASS | Selecting saved 25,000 strike exposed only owning T50 rail control; unrelated far-expiry T49 stayed hidden. |
| `WF-QBE-009` | PASS | Saved 25,000 fixture showed no unrelated T identity or break-even; exact quick rails and owning T50 stayed isolated. |
| `WF-QBE-010` | PASS | Chart outside click cleared selected row and all quick rails. |
| `WF-QBE-011` | PASS | Escape cleared selected row and all quick rails. |
| `WF-QBE-012` | PASS | Manual refresh cleared selected row and rails before quote request completed. |
| `WF-QBE-013` | PASS AFTER REPAIR | Initial price-scale drag cleared selection. Drag-aware outside-click repair retained exact selected snapshot and both rails through live zoom remap. |
| `WF-QBE-014` | PASS | Selecting 24,000 with missing Call showed `OPTION PRICE UNAVAILABLE`; no Call or Put fake rail rendered. |
| `WF-QBE-015` | PASS | Narrowed price range pinned off-screen Call break-even truthfully at plot edge while in-range Put rail stayed exact and controls remained unobscured. |
| `WF-MAN-ADD-001` | PASS | Double-clicking Call premium opened Call-only BUY/SELL actions. |
| `WF-MAN-ADD-002` | PASS | Double-clicking Put premium opened Put-only BUY/SELL actions. |
| `WF-MAN-ADD-003` | PASS | Double-click opened editor without quick-rail flash or face flip. |
| `WF-MAN-ADD-004` | PASS | Original row stayed at exact y as editor sibling without duplicate strike text. |
| `WF-MAN-ADD-005` | PASS | BUY action auto-filled exact selected-side live premium. |
| `WF-MAN-ADD-006` | PASS | SELL action auto-filled exact selected-side live premium. |
| `WF-MAN-ADD-007` | PASS | Plus/minus changed lots in place while preview and editor remained open. |
| `WF-MAN-ADD-008` | PASS | UI stepper prevents zero, negative, or decimal lots; controlled malformed-input matrix rejects all three and disables commit. |
| `WF-MAN-ADD-009` | PASS | Custom Put premium 600 updated preview break-even to 24,400 and kept ADD enabled. |
| `WF-MAN-ADD-010` | PASS | Keyboard-entered manual premium 0 remained visible, enabled ADD, and previewed exact 25,000 break-even. |
| `WF-MAN-ADD-011` | PASS | Blank and negative premium showed `ENTER PREMIUM` and disabled ADD; number input rejects nonnumeric text. |
| `WF-MAN-ADD-012` | PASS | Missing Call quote started blank; manual 100 enabled ADD while opposite Put snapshot remained available. |
| `WF-MAN-ADD-013` | PASS (CONTROLLED AUTOMATION) | Exact missing/conflicting lot-size fixture fails closed; live provider returned valid lot metadata, so malformed provider state was injected only in deterministic guard. |
| `WF-MAN-ADD-014` | PASS | Valid ADD opened explicit `CHOOSE STRATEGY` without writing first. |
| `WF-MAN-ADD-015` | PASS | `CREATE NEW STRATEGY` created next identity T49 and saved only chosen Call leg. |
| `WF-MAN-ADD-016` | PASS | Second Put leg chooser offered `ADD TO T49`; selection added only to T49. Liquid fixture repeated same rule with T50. |
| `WF-MAN-ADD-017` | PASS | Chooser CANCEL returned to editor with zero saved entries; close/outside/Escape cancellation guards also pass. |
| `WF-MAN-EDIT-001` | PASS | T50 displayed separate exact Call and Put saved-entry badges at 25,000. |
| `WF-MAN-EDIT-002` | PASS | Updating Call to two lots produced `Buy Call, 2 lots` face while Put stayed one lot. |
| `WF-MAN-EDIT-003` | PASS | First saved-row click showed newest Sell Put face instead of live face. |
| `WF-MAN-EDIT-004` | PASS | Repeated clicks cycled Sell Put → Buy Call → live quotes, newest-first without stacking. |
| `WF-MAN-EDIT-005` | PASS | Saved face showed fixed snapshots and traded-side `×2`; live face returned alone after cycle. |
| `WF-MAN-EDIT-006` | PASS | Exact Call badge opened populated SAVE/REMOVE editor, never blank ADD. |
| `WF-MAN-EDIT-007` | PASS | Replayed former failure: unique saved Call cell double-click opened populated SAVE/REMOVE editor. |
| `WF-MAN-EDIT-008` | PASS | Double-clicking displayed saved Buy Call face opened that exact identity. |
| `WF-MAN-EDIT-009` | PASS | Saved editor prefilled Buy Call, one lot, premium 800.50, fixed snapshots, SAVE, and REMOVE. |
| `WF-MAN-EDIT-010` | PASS | Premium update 800.50 → 805 changed only exact Call identity; Put sibling remained unchanged. |
| `WF-MAN-EDIT-011` | PASS | Call lots update 1 → 2 moved T50 break-even from 25,202 to 25,506 and kept Put unchanged. |
| `WF-MAN-EDIT-012` | PASS (CONTROLLED AUTOMATION) | Opposite-side edit command creates separate identity instead of overwriting existing other-side entry; UI side-specific editor prevents ambiguous side mutation. |
| `WF-MAN-EDIT-013` | PASS | REMOVE deleted exact Call only; same-strike Sell Put sibling remained. |
| `WF-MAN-EDIT-014` | PASS | Closing premium-801 draft without SAVE preserved stored premium 800.50. |
| `WF-MAN-EDIT-015` | PASS | Manual refresh closed saved editor; reopening retained captured Put snapshot 598.85. |
| `WF-MAN-EDIT-016` | PASS | TradingView reload plus refresh restored exact Put badge, expiry ownership, and snapshot. |
| `WF-MAN-EDIT-017` | PASS | Far expiry restored two T49 entries at 24,000 with no T50; returning restored one T50 entry at 25,000 with no T49. |
| `WF-MAN-EDIT-018` | PASS (CONTROLLED AUTOMATION) | Injected storage SAVE/REMOVE failure preserves old plan, keeps exact editor actionable, and reports `PLAN NOT SAVED`. |
| `WF-BRK-001` | PASS (CONTROLLED AUTOMATION) | Connect accepts only bridge-provided official Zerodha v3 login URL and exposes no secret material. |
| `WF-BRK-002` | PASS (CONTROLLED AUTOMATION) | Authorization fixture exchanges request token with literal SHA-256 checksum and stores session only until next 06:00 IST. |
| `WF-BRK-003` | PASS (CONTROLLED AUTOMATION) | One coordinated refresh fetched positions, current-day trades, and selected-expiry chain exactly once each. |
| `WF-BRK-004` | PASS (CONTROLLED AUTOMATION) | First broker sync created broker strategy without consuming next manual T sequence. |
| `WF-BRK-005` | PASS (CONTROLLED AUTOMATION) | Imported Call produced exact Call-lane marker and matching source-aware ladder badge. |
| `WF-BRK-006` | PASS (CONTROLLED AUTOMATION) | Imported Put remained in separate right Put lane at exact coordinate. |
| `WF-BRK-007` | PASS (CONTROLLED AUTOMATION) | Broker Call/Put legs rendered source-aware C/P lot badges like manual positions. |
| `WF-BRK-008` | PASS (CONTROLLED AUTOMATION) | Exact broker badge opened exact read-only P&L card without manual ADD editor. |
| `WF-BRK-009` | PASS (CONTROLLED AUTOMATION) | Real broker-badge double-click retained exact read-only broker card and created no manual strategy. |
| `WF-BRK-010` | PASS (CONTROLLED AUTOMATION) | Compact broker token opened its exact position card only. |
| `WF-BRK-011` | PASS (CONTROLLED AUTOMATION) | Broker card derived matching live P&L, side, direction, lots, and strike from imported evidence. |
| `WF-BRK-012` | PASS (CONTROLLED AUTOMATION) | Broker compact selectors synchronized exact strategy selection without opening unrelated cards. |
| `WF-BRK-013` | PASS (CONTROLLED AUTOMATION) | Show BE Rail rendered only selected broker-position rail. |
| `WF-BRK-014` | PASS (CONTROLLED AUTOMATION) | CLOSE removed broker card and owned rail while independent group, selection, and positions remained. |
| `WF-BRK-015` | PASS (CONTROLLED AUTOMATION) | Flat broker snapshot archived live strategy while preserving version evidence. |
| `WF-BRK-016` | PASS (CONTROLLED AUTOMATION) | Disconnect hid broker chart spine without deleting stored accepted strategy evidence. |
| `WF-POS-001` | PASS (CONTROLLED AUTOMATION) | Manual and broker controls shared source-neutral Call/Put columns. |
| `WF-POS-002` | PASS (CONTROLLED AUTOMATION) | Layout exposed no third manual-only lane. |
| `WF-POS-003` | PASS (CONTROLLED AUTOMATION) | Same-coordinate Call stayed left and Put stayed right. |
| `WF-POS-004` | PASS (CONTROLLED AUTOMATION) | Safely separated same-side controls stayed directly visible. |
| `WF-POS-005` | PASS (CONTROLLED AUTOMATION) | Same-side collision collapsed into one informational +N group. |
| `WF-POS-006` | PASS (CONTROLLED AUTOMATION) | Call and Put collisions formed separate side-specific groups. |
| `WF-POS-007` | PASS (CONTROLLED AUTOMATION) | Closed +N count selected nothing. |
| `WF-POS-008` | PASS (CONTROLLED AUTOMATION) | Group square opened flyout without selecting trade. |
| `WF-POS-009` | PASS (CONTROLLED AUTOMATION) | Flyout contained every hidden exact identity once. |
| `WF-POS-010` | PASS (CONTROLLED AUTOMATION) | Flyout checkbox changed only exact identity selection. |
| `WF-POS-011` | PASS (CONTROLLED AUTOMATION) | Flyout label opened only exact details/P&L. |
| `WF-POS-012` | PASS (CONTROLLED AUTOMATION) | Grouped Buy/Sell rows retained green/red identity rails. |
| `WF-POS-013` | PASS (CONTROLLED AUTOMATION) | Flyout rendered above ladder and compact controls. |
| `WF-POS-014` | PASS (CONTROLLED AUTOMATION) | Outside pointer closed flyout; reopening preserved prior exact checkbox selection and data. |
| `WF-POS-015` | PASS (CONTROLLED AUTOMATION) | Dense controls retained fixed checkbox, token, and lane alignment. |
| `WF-POS-016` | PASS (CONTROLLED AUTOMATION) | Quick BE text stopped before every position-control lane. |
| `WF-POS-017` | PASS (CONTROLLED AUTOMATION) | OI rank badges stayed in separate top band without position-badge collision. |
| `WF-POS-018` | PASS (CONTROLLED AUTOMATION) | Position spine stayed bounded by first and last visible strikes. |
| `WF-STR-001`–`WF-STR-024` | PASS (CONTROLLED AUTOMATION) | 23 mapped strategy contracts covered details, synchronized selection, exact preview roots, Compare/Clear, compatibility guards, save/merge/split/restore/archive/expiry, and exact-context restore. |
| `WF-SELL-001`–`WF-SELL-015` | PASS (CONTROLLED AUTOMATION) | 14 mapped seller contracts covered naming, allocations, CSV review/dedupe, ownership, coverage gaps, acceptance gates, and atomic publication. Blank-name regression writes nothing and reports `ENTER A STRATEGY NAME FIRST`. |
| `WF-LIFE-001`–`WF-LIFE-014` | PASS (CONTROLLED AUTOMATION) | 15 mapped lifecycle contracts covered refresh ordering, cache behavior, expiry/timeframe/zoom/pan, reload migration, single listeners, navigation cleanup, and zero-request panel lifecycle. |
| `WF-SKY-001`–`WF-SKY-010` | PASS (CONTROLLED AUTOMATION) | 50 mapped Skyline checks covered exact opening action, event separation, visual selection, Call/Put geometry, real gaps, crosshair truth, request dedupe/cache, and terminal cleanup. |
| `WF-FAIL-001`–`WF-FAIL-017` | PASS (CONTROLLED AUTOMATION) | 18 mapped safety checks covered invalid expiry/origin/session/provider failures, evidence survival, review gates, lot proof, malformed storage, expiry mismatch, axis/context/storage failure, idempotency, unknown charges, badge isolation, and read-only broker surface. |
| `WF-A11Y-001`–`WF-A11Y-012` | PASS (CONTROLLED AUTOMATION) | 13 mapped accessibility/visual checks covered keyboard parity and focus return, editor reachability, accessible row/entry/badge/rail state, group semantics, synchronized pressed state, contrast, and dense-layout integrity. |

Current candidate tally: **202 PASS · 0 PARTIAL · 0 DEFERRED · 0 unresolved FAIL** across workflows executed in this run.

## Strategy, seller, and lifecycle controlled evidence

- Strategy/version group: `23/23` mapped tests passed, covering all 24 workflows; one mixed instrument/expiry guard covers two workflows.
- Seller group: `14/14` mapped tests passed, covering all 15 workflows; CSV split/remainder contract covers multiple workflows. Localhost integration initially hit sandbox `listen EPERM 127.0.0.1`, then passed unchanged with permitted localhost access.
- Lifecycle group: `15/15` mapped tests passed, covering all 14 workflows; pagehide and same-label SPA cleanup are separate regressions for one workflow.
- All mutations used isolated in-memory fixtures. No broker authentication, account data, order route, or permanent live strategy mutation occurred.

## Skyline, fail-closed, accessibility, and shell recovery evidence

- Skyline group: `50/50` mapped checks passed, covering all 10 workflows.
- Fail-closed group: `18/18` mapped checks passed, covering all 17 workflows.
- Accessibility/visual group: `13/13` mapped checks passed, covering all 12 workflows; shared parity/focus tests cover paired workflows.
- Previously deferred shell network failure passed deterministic rejection injection. Previously partial host safety passed exact URL matrix plus live lookalike-host rejection.
- Entire 202-workflow pack now has a recorded result; no partial, deferred, or unresolved failure remains.
- Final extension-plus-bridge regression suite: `991/991` passed with temporary localhost permission.

## `WF-SHL-008` repair evidence

- Initial symptom: tab activation closed only previous tab-specific panel context. Chrome 150 kept visible global side-panel context open.
- Root cause: `chrome.sidePanel.close({ tabId })` can resolve for configured tab context while separately visible global context remains. Existing unit test asserted only mocked tab-close call.
- Repair: cross-tab activation now closes both `{ tabId: previousTabId }` and `{ windowId }` contexts before saving new active tab.
- Regression test: tab activation must close tab-specific and global contexts in order.
- Targeted suite: `9/9` passed.
- Full extension-plus-bridge suite: `987/987` passed with temporary localhost permission.
- Syntax and patch integrity: changed JavaScript/CJS files passed `node --check`; `git diff --check` passed.

## `WF-SHL-006` repair evidence

- Initial symptom: unsupported tabs disabled the entire toolbar action, preventing the compact popup from opening.
- Root cause: side-panel eligibility incorrectly controlled toolbar-action availability even though `action-popup.js` already owns safe unsupported-tab behavior.
- Repair: unsupported tabs keep toolbar popup enabled while tab-specific side panel remains disabled.
- Targeted popup and side-panel suite: `14/14` passed.
- Full extension-plus-bridge suite after repair: `987/987` passed with temporary localhost permission.

## `WF-SHL-009` repair evidence

- Initial valid symptom: 22-row LIVE baseline hid correctly, but ON left chart with zero rows.
- Root cause: manual refresh chain lacked restart metadata and existed only inside controller destroyed by OFF lifecycle.
- Repair: fetch boundary stamps exact expiry and fetch timestamp; OFF retains last validated in-memory chain; ON rebuilds from it without storage mutation or automatic network request.
- Regression test: manually refreshed rows survive OFF/ON with unchanged chain-request count.
- Full extension-plus-bridge suite after repair: `988/988` passed with temporary localhost permission.

## `WF-SHL-010` live evidence

- Light baseline confirmed in compact popup.
- Dark mode matched in compact popup and side panel, and persisted after closing and reopening compact popup.
- Light mode restored from side panel, then persisted after side-panel close and compact-popup reopen.
- Chart ladder stayed `LIVE` through both theme transitions.
- No product repair was required; live workflow matched expected behavior.
- Full extension-plus-bridge suite after live verification: `988/988` passed with temporary localhost permission.

## `WF-LAD-001` live evidence

- Baseline expiry was `2026-08-25 · 19 DTE`; explicitly selected `2026-08-11 · 5 DTE`.
- Before refresh, side panel showed `MANUAL REFRESH REQUIRED` and `EXPIRY CHANGED · PRESS REFRESH ALL`.
- One `REFRESH ALL` returned chart to `LIVE` and kept selected expiry `2026-08-11 · 5 DTE`.
- Result contained 20 visible ladder rows, 20 unique strikes, and zero duplicate strikes.
- Targeted request-count guard passed: exactly one `/api/seller-refresh` request and zero follow-up `/api/nifty-chain` requests.
- No product repair was required; live workflow matched expected behavior.
- Full extension-plus-bridge suite after live verification: `988/988` passed with temporary localhost permission.

## `WF-LAD-002` live evidence

- Inspected all 20 visible rows after exact-expiry refresh.
- Every accessible row exposed Call premium first, Put premium second, and rightmost strike last; zero order mismatches.
- Targeted format contract passed: `C 266.60 | P 388.70 | 26,000`.
- No product repair was required; live workflow matched expected behavior.
- Full extension-plus-bridge suite after live verification: `988/988` passed with temporary localhost permission.

## `WF-LAD-003` live evidence

- Live exact-expiry set rendered 20 visible rows, exceeding former 13-row limit.
- All 20 strikes were unique, zero duplicates, with uniform accessibility-tree depth under one ladder container.
- Screenshot confirms one right-side chart column aligned to native price-axis levels.
- Targeted no-limit layout contract passed with a 25-row fixture.
- No product repair was required; live workflow matched expected behavior.
- Full extension-plus-bridge suite after live verification: `988/988` passed with temporary localhost permission.

## `WF-LAD-004` through `WF-LAD-006` live evidence

- `WF-LAD-004`: native right-axis zoom changed 20 rows at 100-point minimum cadence into 24 rows at 50-point minimum cadence; no manual refresh occurred and ladder remained `LIVE`.
- `WF-LAD-005`: reverse native-axis zoom changed 24 rows at 50-point minimum cadence into 17 rows at 200-point minimum cadence; no fixed row count and no invented contract was observed.
- `WF-LAD-006`: with live NIFTY at 24,660.45 covering native grid text, real 24,600 ladder row remained present between 24,400 and 24,800.
- All three mapped automated contracts passed.
- No product repair was required; live workflows matched expected behavior.
- Full extension-plus-bridge suite after live verification: `988/988` passed with temporary localhost permission.

## `WF-LAD-007` repair evidence

- Live failure: 400-point sparse axis rendered native 24,400 and 24,800 rows but omitted real in-range ATM between them; nearest native row received ATM highlight instead.
- Root cause: membership selection correctly pinned real ATM, but final production render filter kept only native-axis intersections and removed pinned ATM.
- Rollback checkpoint: pushed `codex/checkpoint-before-atm-pin-fix` at `04883c1`.
- RED regression: render filter must retain real in-range ATM between native grid labels.
- Minimal repair: renderable strike filter now keeps native-axis intersections plus exact ATM already present in validated membership rows.
- Targeted ATM contracts: `3/3` passed. Production DOM regressions plus timeframe, axis, and screenshot suites passed together.
- Full extension-plus-bridge suite after repair: `989/989` passed with temporary localhost permission.
- Latest unpacked revision was reloaded in Chrome. Exact live sparse-axis replay retained real 24,550 ATM once between native 24,000 and 25,000 rows, highlighted exact ATM, and kept ladder `LIVE`.

## `WF-LAD-008` live evidence

- Navigated NIFTY chart to historical visible price range around 4,480–5,440 while keeping cached exact-expiry chain and ATM 24,550.
- Chart rendered zero option rows and did not force off-screen ATM back into view.
- Extension displayed `Visible axis contracts are unavailable.` and kept chart free of top-left fallback rows.
- Targeted out-of-range ATM contract passed.

## `WF-LAD-009` through `WF-LAD-014` live evidence

- `WF-LAD-009`: zoom-in remapped cached rows from 25 to 14 and minimum cadence from 50 to 100 without refresh; mapped request-count guard passed.
- `WF-LAD-010`: reverse zoom remapped 14 rows to 22 and restored 50-point cadence without refresh; mapped request-count guard passed.
- `WF-LAD-011`: horizontal pan preserved 22 exact row identities, including saved 25,000 and 25,200 strikes; integration cache-reuse guard passed.
- `WF-LAD-012`: 4-hour to 1-day timeframe change retained 22 rows and exact 24,550 ATM without another data request; mapped guard passed.
- `WF-LAD-013`: inverted TradingView scale rendered 26 unique exact contracts in inverted vertical order and retained exact ATM; inverted-scale controller guard passed.
- `WF-LAD-014`: resizing side panel changed chart viewport while retaining 26 unique exact rows and ATM placement; CSS viewport projection guard passed.
- No product repair was required for these six workflows.

## `WF-LAD-015` repair evidence

- Live failure: far expiry `2031-06-24` returned missing-side zero sentinels; ladder displayed `Call 0.00` and falsely reported `LIVE`.
- Product rule: missing, delayed, or unavailable market data never becomes zero because false zero premium can cause a false trading decision.
- Rollback checkpoint: pushed `codex/checkpoint-before-missing-quote-fix` before source change.
- RED regression: numeric and string zero market quotes must format as `—` while genuine positive finite quotes remain unchanged.
- Minimal repair: quote normalization now accepts only positive finite market quotes; open-interest normalization remains independent and continues accepting genuine zero OI.
- Targeted missing-quote and OI contracts passed `3/3`.
- Full extension-plus-bridge suite after repair: `989/989` passed with temporary localhost permission.
- Latest unpacked revision was reloaded. Exact far-expiry replay showed `Call —, Put 933.85` plus fully missing rows as `Call —, Put —`; status correctly changed to `PARTIAL`.

## `WF-LAD-016` live evidence

- Navigated NIFTY to historical `2010-01-04`, outside cached far-expiry contract range.
- Extension hid every unplaced row and displayed `Visible axis contracts are unavailable.`
- No row appeared at top-left or any fallback coordinate.
- Render-transaction guard and missing-quote contract passed together `2/2`.

## `WF-QBE-001` through `WF-QBE-012` live evidence

- Clean exact-expiry baseline contained zero BE, T, or broker rail matches before selection.
- One 25,000 click created exactly `CALL BE 25,801` and `PUT BE 24,401`, matching displayed Call 800.50 and Put 598.85 premiums.
- Second click toggled selection off; switching 24,000 to 25,000 replaced old rails without duplication.
- Outside click, Escape, and manual refresh each cleared quick selection and rails.
- Controlled liquid-expiry T50 fixture added Buy Call and Sell Put at 25,000. Selected row retained both saved-entry badges, exact quick rails, and only owning T50 control; unrelated far-expiry T49 remained hidden. This closed `WF-QBE-005`, `WF-QBE-008`, and `WF-QBE-009` live.

## `WF-QBE-013` repair evidence

- Live failure: dragging TradingView price scale cleared selected 25,000 row and both quick break-even rails.
- Root cause: document-wide outside-pointer handler treated chart scale gesture as ordinary outside dismissal; TradingView also emitted trailing click after drag.
- Rollback checkpoint: pushed `codex/checkpoint-before-qbe-zoom-fix` at `6cf6866`.
- RED regression models pointerdown, 20-pixel pointer movement, trailing click, axis update, and remap while exact strike remains visible.
- Minimal repair: outside dismissal now commits on click; pointer movement above four pixels classifies gesture as drag and suppresses trailing dismissal click. Manual transient pointerdown behavior remains unchanged.
- Content integration suite passed; full extension-plus-bridge suite passed `990/990` with temporary localhost permission.
- Latest unpacked revision was loaded into a clean TradingView tab. Live price-scale drag retained selected 25,000 row plus exact `CALL BE 25,801` and `PUT BE 24,401` rails after remap.

## `WF-QBE-014` and `WF-QBE-015` live evidence

- `WF-QBE-014`: far-expiry 24,000 row had `Call —, Put 933.85`; click retained visible selection, showed `OPTION PRICE UNAVAILABLE`, and rendered zero fake BE rails.
- `WF-QBE-015`: narrowing price scale moved Call 25,801 outside plot; truthful Call edge label pinned to lower plot edge while Put 24,401 remained at exact in-range coordinate and never covered Call/Put controls.

## `WF-MAN-ADD-001` through `WF-MAN-ADD-017` evidence

- Call and Put premium double-clicks opened side-specific two-action editors; double-click path produced no quick-rail flash and kept editor at exact row coordinate.
- BUY/SELL choices auto-filled selected-side quote. Lots controls updated in place; custom premium 600 updated preview to 24,400; keyboard premium 0 remained valid and enabled ADD.
- Blank and negative premiums disabled ADD with `ENTER PREMIUM`; number input rejected nonnumeric text. Invalid lot values are unreachable through stepper and rejected by controlled malformed-input matrix.
- Missing Call quote started blank on 2031 expiry. Manual premium 100 enabled ADD without backfilling unavailable market quote; opposite Put 933.85 snapshot remained intact.
- Valid ADD opened explicit ownership chooser. CANCEL wrote nothing. CREATE NEW created T49; second Put leg offered and used only `ADD TO T49`. Liquid T50 fixture repeated same ownership rule.
- Missing/conflicting lot-size state cannot be safely produced from accepted live provider data; deterministic current-expiry metadata guard injects malformed fixture and proves fail-closed behavior.
- No broker order or external financial action occurred; T49/T50 are local controlled strategy records created for required workflows.

## `WF-MAN-EDIT-001` through `WF-MAN-EDIT-018` evidence

- T50 rendered separate Call/Put badges. Saved-row clicks cycled newest Sell Put, older Buy Call, then live face; fixed snapshots and `×lots` never stacked with live values.
- Exact badge and unique saved-cell double-click both opened populated SAVE/REMOVE editor. This live replay closes workflow 007's previously documented failure.
- Close discarded premium-801 draft. Saved premium update to 805 affected only Call identity. Lots update to two moved T50 break-even to 25,506 and left Put sibling untouched.
- Exact Call REMOVE left Sell Put sibling. Refresh closed editor and reopening preserved captured Put 598.85 snapshot.
- Page reload plus refresh restored saved Put record. Expiry switch showed two far-expiry T49 entries only; returning showed one liquid-expiry T50 entry only.
- Opposite-side identity and injected storage-failure paths passed deterministic guards because production UI/provider deliberately prevents ambiguous side mutation and storage fault injection.
- Controlled records remain local-only; no broker or exchange action occurred.

## `WF-BRK-001` through `WF-BRK-016` controlled evidence

- Live Zerodha authorization was not attempted: it requires user credentials/2FA and would create live financial-account access.
- Fifteen deterministic integration tests covered official login URL, authorization checksum/session deadline, coordinated refresh, import sequence, exact Call/Put markers and badges, badge/token/card interaction, synchronized selectors, owned BE rail, CLOSE isolation, flat-snapshot archive, and disconnect hiding.
- Result: `15/15` passed. No credential, session, position, trade, or broker account state changed.

## `WF-POS-001` through `WF-POS-018` controlled evidence

- Seventeen targeted lane/collision tests plus one direct outside-dismiss group test passed `18/18`.
- Coverage includes source-neutral two-column layout, side separation, safe direct controls, +N grouping, non-selecting opener, exact flyout identities/actions, Buy/Sell colors, stacking, outside dismissal with preserved selection, dense alignment, BE clearance, OI band, and bounded spine.
- Automation coverage map corrected: broker-badge double-click and outside group dismissal already have direct production integration assertions.

## Screenshots

- `evidence/2026-08-06-202-workflow-run/WF-SHL-001-002-popup-ready.png`
- `evidence/2026-08-06-202-workflow-run/WF-SHL-003-refresh-complete.png`
- `evidence/2026-08-06-202-workflow-run/WF-SHL-005-open-controls.png`
- `evidence/2026-08-06-202-workflow-run/WF-SHL-006-unsupported-popup-disabled-PASS.png`
- `evidence/2026-08-06-202-workflow-run/WF-SHL-008-tab-switch-panel-stays-open-FAIL.png`
- `evidence/2026-08-06-202-workflow-run/WF-SHL-008-tab-switch-panel-closes-PASS.png`
- `evidence/2026-08-06-202-workflow-run/WF-SHL-009-invalid-stale-extension-context.png` (discarded setup run; extension context was stale)
- `evidence/2026-08-06-202-workflow-run/WF-SHL-009-ladder-restored-PASS.png`
- `evidence/2026-08-06-202-workflow-run/WF-SHL-010-popup-light-before.png`
- `evidence/2026-08-06-202-workflow-run/WF-SHL-010-popup-dark-after.png`
- `evidence/2026-08-06-202-workflow-run/WF-SHL-010-chart-dark.png`
- `evidence/2026-08-06-202-workflow-run/WF-SHL-010-side-panel-dark.png`
- `evidence/2026-08-06-202-workflow-run/WF-SHL-010-side-panel-light.png`
- `evidence/2026-08-06-202-workflow-run/WF-SHL-010-chart-light-restored.png`
- `evidence/2026-08-06-202-workflow-run/WF-LAD-001-expiry-selected-before-refresh.png`
- `evidence/2026-08-06-202-workflow-run/WF-LAD-001-exact-expiry-loaded-PASS.png`
- `evidence/2026-08-06-202-workflow-run/WF-LAD-002-call-put-strike-order-PASS.png`
- `evidence/2026-08-06-202-workflow-run/WF-LAD-003-single-column-20-rows-PASS.png`
- `evidence/2026-08-06-202-workflow-run/WF-LAD-004-axis-before-zoom.png`
- `evidence/2026-08-06-202-workflow-run/WF-LAD-004-dense-axis-more-rows-PASS.png`
- `evidence/2026-08-06-202-workflow-run/WF-LAD-005-axis-before-zoom-out.png`
- `evidence/2026-08-06-202-workflow-run/WF-LAD-005-sparse-axis-fewer-rows-PASS.png`
- `evidence/2026-08-06-202-workflow-run/WF-LAD-006-live-marker-grid-slot-restored-PASS.png`
- `evidence/2026-08-06-202-workflow-run/WF-LAD-007-off-grid-atm-missing-FAIL.png`
- `evidence/2026-08-06-202-workflow-run/WF-LAD-007-off-grid-atm-retained-PASS.png`
- `evidence/2026-08-06-202-workflow-run/WF-LAD-008-out-of-range-atm-not-forced-PASS.png`
- `evidence/2026-08-06-202-workflow-run/WF-LAD-009-before-cached-zoom-in.png`
- `evidence/2026-08-06-202-workflow-run/WF-LAD-009-cached-zoom-in-remap-PASS.png`
- `evidence/2026-08-06-202-workflow-run/WF-LAD-010-before-cached-zoom-out.png`
- `evidence/2026-08-06-202-workflow-run/WF-LAD-010-cached-zoom-out-remap-PASS.png`
- `evidence/2026-08-06-202-workflow-run/WF-LAD-011-before-pan.png`
- `evidence/2026-08-06-202-workflow-run/WF-LAD-011-pan-cached-identities-PASS.png`
- `evidence/2026-08-06-202-workflow-run/WF-LAD-012-before-timeframe-change.png`
- `evidence/2026-08-06-202-workflow-run/WF-LAD-012-timeframe-cached-remap-PASS.png`
- `evidence/2026-08-06-202-workflow-run/WF-LAD-013-before-inverse-scale.png`
- `evidence/2026-08-06-202-workflow-run/WF-LAD-013-inverse-scale-placement-PASS.png`
- `evidence/2026-08-06-202-workflow-run/WF-LAD-014-before-side-panel-resize.png`
- `evidence/2026-08-06-202-workflow-run/WF-LAD-014-side-panel-resize-placement-PASS.png`
- `evidence/2026-08-06-202-workflow-run/WF-LAD-015-missing-call-rendered-zero-FAIL.png`
- `evidence/2026-08-06-202-workflow-run/WF-LAD-015-missing-quotes-render-dash-PASS.png`
- `evidence/2026-08-06-202-workflow-run/WF-LAD-016-unsafe-axis-hides-unplaced-rows-PASS.png`
- `evidence/2026-08-06-202-workflow-run/WF-QBE-001-no-selection-no-rails-PASS.png`
- `evidence/2026-08-06-202-workflow-run/WF-QBE-002-004-selected-strike-correct-rails-PASS.png`
- `evidence/2026-08-06-202-workflow-run/WF-QBE-006-007-toggle-and-replace-rails-PASS.png`
- `evidence/2026-08-06-202-workflow-run/WF-QBE-010-outside-click-clears-selection-PASS.png`
- `evidence/2026-08-06-202-workflow-run/WF-QBE-012-refresh-clears-selection-PASS.png`
- `evidence/2026-08-06-202-workflow-run/WF-QBE-013-selection-cleared-on-zoom-FAIL.png`
- `evidence/2026-08-06-202-workflow-run/WF-QBE-013-selected-snapshot-remaps-on-zoom-PASS.png`
- `evidence/2026-08-06-202-workflow-run/WF-QBE-014-missing-side-no-fake-rail-PASS.png`
- `evidence/2026-08-06-202-workflow-run/WF-QBE-015-truthful-edge-marker-PASS.png`
- `evidence/2026-08-06-202-workflow-run/WF-QBE-005-008-009-saved-badges-owning-strategy-PASS.png`
- `evidence/2026-08-06-202-workflow-run/WF-MAN-ADD-001-004-side-specific-editor-PASS.png`
- `evidence/2026-08-06-202-workflow-run/WF-MAN-ADD-005-010-autofill-lots-custom-zero-premium-PASS.png`
- `evidence/2026-08-06-202-workflow-run/WF-MAN-ADD-011-012-invalid-and-missing-quote-input-PASS.png`
- `evidence/2026-08-06-202-workflow-run/WF-MAN-ADD-014-015-017-chooser-create-cancel-PASS.png`
- `evidence/2026-08-06-202-workflow-run/WF-MAN-ADD-016-existing-strategy-only-PASS.png`
- `evidence/2026-08-06-202-workflow-run/WF-MAN-EDIT-001-005-badges-and-face-cycle-PASS.png`
- `evidence/2026-08-06-202-workflow-run/WF-MAN-EDIT-006-011-exact-edit-premium-lots-PASS.png`
- `evidence/2026-08-06-202-workflow-run/WF-MAN-EDIT-007-013-unique-doubleclick-remove-exact-PASS.png`
- `evidence/2026-08-06-202-workflow-run/WF-MAN-EDIT-014-015-close-refresh-preserve-snapshot-PASS.png`
- `evidence/2026-08-06-202-workflow-run/WF-MAN-EDIT-016-reload-restores-manual-entry-PASS.png`
- `evidence/2026-08-06-202-workflow-run/WF-MAN-EDIT-017-far-expiry-isolated-PASS.png`
- `evidence/2026-08-06-202-workflow-run/WF-MAN-EDIT-017-liquid-expiry-restored-PASS.png`

## Next workflow

Run strategy rails, selection, preview, and version workflows next. Keep `WF-SHL-004` deferred until controlled failure injection is available; finish remaining `WF-SHL-007` URL classes when browser can retain those unsafe URLs for inspection.
