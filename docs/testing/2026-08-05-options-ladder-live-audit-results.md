# Options Ladder live audit — 2026-08-05

## Verdict

**Current build is not ready.**

Automated suites are green, but real Chrome testing found user-visible failures in manual editing, broker double-click, keyboard focus, grouped-position dismissal, side-panel resizing, and Premium Skyline error handling.

## Builds checked

| Build | Identity | Automated result | Live result |
|---|---|---:|---|
| Previous pushed checkpoint | `1590670` — 2026-08-04 22:44:55 IST | 862/862 pass in isolated archive | No complete live reload proof existed |
| Current working build | HEAD `fc32ef1e328c14ec133a3942d990f49ae97b0bfe`, dirty fingerprint `59e1e56d4c5a4c6bc848c19bcc7c48989acfb3aa1a56276379218bc4ce3726ab` | 971/971 pass | 42 live scenarios; failures below |

Current automated total:

- Extension and bridge: 958/958 pass.
- Legacy extension and Pine: 13/13 pass.
- Total: 971/971 pass.
- Initial localhost `EPERM` failures were sandbox restrictions. Same unchanged suite passed with localhost permission.

Workflow catalog:

- Total workflows: 202.
- Fully automated end-to-end: 0.
- Partially automated: 196.
- Live-only: 3.
- Blocked by external systems: 3.

This is why green unit tests did not prove live UI correctness.

## Live Chrome result count

| Result | Scenarios |
|---|---:|
| Pass | 24 |
| Pass, partial scope | 6 |
| Pass with warning | 1 |
| Fail | 9 |
| Requirement/test conflict | 1 |
| Correct data, unusable controls | 1 |
| **Total** | **42** |

## Confirmed blocking defects

| # | Workflow | Live result | What user sees | Cause found |
|---:|---|---|---|---|
| 1 | `WF-MAN-EDIT-006`, `WF-MAN-EDIT-008/009` | Fail | Saved manual trade opens with correct `SAVE` and `REMOVE`, but `+`, premium, `SAVE`, `REMOVE`, and close cannot be clicked. | Saved row is painted above editor. Row has high inline layer; editor layer is only 10. |
| 2 | `WF-MAN-EDIT-007` | Fail | Direct double-click on one saved manual trade opens blank `ADD`, not exact saved trade with `SAVE` and `REMOVE`. | Neutral double-click reads only currently cycled face. It never infers sole saved identity. |
| 3 | `WF-A11Y-005` | Fail | Shift+Enter opens editor, but Tab skips editor controls and moves through later ladder rows. | Focus stays on row after row becomes hidden. Editor never receives initial focus. |
| 4 | `WF-BRK-009` | Conflict/fail | Exact broker badge double-click leaves strike selected but opens no broker details. Ordinary broker-row double-click opens blank manual `ADD`. | Product requirement says broker details; existing automated test expects fresh manual editor for ordinary cell. Contract is contradictory. |
| 5 | `WF-POS-014` | Fail | `+4` / `+6` position group remains visible after verified outside chart click. | State clears, but stale group panel stays until asynchronous redraw succeeds. |
| 6 | `WF-LIFE-014` | Fail | Opening then closing side panel changed ladder from 16 visible strikes to 10 and removed one visible saved badge until chart scale was manually restored. | Resize/remap does not preserve prior ladder representation. |
| 7 | `WF-SKY-001/004` | Fail in current environment | Clicking strike number highlights row and draws guide, but Premium Skyline never appears; no error explains why. | Local history bridge at `127.0.0.1:8787` is offline. UI hides generic bridge/history failures, leaving misleading guide-only state. Existing tests mock this path. |
| 8 | `WF-POS-011` | Warning | Exact group label opens correct broker card, but clears prior exact checkbox selection. | Opening broker details resets strategy interaction state. Click roles are not independent. |

### Manual saved-trade evidence

- Direct 24,300 double-click opens blank `ADD`: [current-014-reported-24300-doubleclick-add-fail.png](evidence/2026-08-05-live-audit/current-014-reported-24300-doubleclick-add-fail.png)
- Exact 24,300 saved entry has `SAVE`/`REMOVE`, but right controls are covered: [current-015-reported-24300-save-remove-occluded-fail.png](evidence/2026-08-05-live-audit/current-015-reported-24300-save-remove-occluded-fail.png)
- Same neutral-double-click failure on another row: [current-003-neutral-doubleclick-opens-add-fail.png](evidence/2026-08-05-live-audit/current-003-neutral-doubleclick-opens-add-fail.png)

### Group, side-panel, and Skyline evidence

- Group outside-click failure: [current-012-group-outside-click-fail.png](evidence/2026-08-05-live-audit/current-012-group-outside-click-fail.png)
- Side-panel close leaves shortened ladder: [current-019-after-popup-controls.png](evidence/2026-08-05-live-audit/current-019-after-popup-controls.png)
- Skyline guide appears without Skyline or visible error: [current-020-skyline-guide-without-history-fail.png](evidence/2026-08-05-live-audit/current-020-skyline-guide-without-history-fail.png)

## Important workflows that passed live

| Workflow area | Verified live behavior |
|---|---|
| Neutral state | LIVE ladder, one root, no selected strike, no quick/manual/broker BE rails. |
| Clean-strike BE | 23,800 produced exactly `CALL BE 24,676` and `PUT BE 23,758`; math matched premiums. Second click cleared both. |
| Strike isolation | Selecting 24,500 showed only its two BEs. No unrelated T39/T40 or saved-strategy rail leaked in. |
| Strike switching | Selecting 23,800 after 24,500 removed every prior BE and displayed only 23,800 BEs. |
| Saved badges | Clicking strikes preserved C/P badges. Badges did not become a separate manual column. |
| Shared position layout | Exactly two position columns: Call at x=1258.5 and Put at x=1317.5. Manual and broker identities share these columns; no third source column. |
| Broker card | Exact 24,600 Put compact opened only `P1 · 24,600 · BUY · LIVE P&L +₹653`. Strategy identity matched marker. |
| Broker BE rail | `SHOW BE RAIL` produced one rail owned by exact broker strategy. Unrelated saved rails stayed hidden. |
| Broker close | `CLOSE` removed only broker card/owned rail. Other positions, markers, selection, and quick BEs remained. |
| T header spacing | Selected T39 header used checkbox, token, divider, and BE text in fixed slots. Center-hit scan found no collision. |
| Dense position scan | 20 rows, 11 position controls, strategy header, and quick labels had zero unexpected center collisions. |
| Grouping | Call `+4` and Put `+6` remained separate. Flyout listed exact identities. Selecting one checkbox selected exactly one identity. |
| Chart zoom | Zoom-out/zoom-in remapped cached chain, grouped positions correctly, then restored exact 20-row membership. |
| Timeframe | 1D → 4H → 1D stayed LIVE. Strike membership and saved identity sets restored. No selection or BE leak. |
| Popup refresh | `READY TO REFRESH` → `REFRESHED JUST NOW`; chart returned LIVE. |
| Open Controls | Popup closed and side panel opened with Strategies, Active Strategy T39, Refresh All, Strategy Versions, and Ledger History. |
| Theme | Light → dark updated popup and chart, survived popup reopen, then restored light. Side-panel theme was not repeated because side-panel resize already caused defect #6. |
| Browser zoom | 100% → 90% kept LIVE. All 47 visible interactive controls were unobstructed. Returned to 100%. |
| Keyboard | Enter selected/cleared quick BEs. Shift+Enter opened correct Call editor. Escape closed editor and restored row. Initial Tab focus still fails as defect #3. |
| Skyline separation | Non-strike click ran quick BE only. Non-strike double-click opened manual editor only. Outside click cleared Skyline guide/highlight. |

Pass evidence:

- Clean-strike two-BE behavior: [current-007-clean-strike-two-be-pass.png](evidence/2026-08-05-live-audit/current-007-clean-strike-two-be-pass.png)
- Manual face owns only its T rail: [current-008-manual-face-owning-t39-only-pass.png](evidence/2026-08-05-live-audit/current-008-manual-face-owning-t39-only-pass.png)
- Fixed T39 header slots: [current-009-t39-fixed-slots-no-overlap-pass.png](evidence/2026-08-05-live-audit/current-009-t39-fixed-slots-no-overlap-pass.png)
- Exact Call/Put grouping and selection: [current-010-call-put-groups-exact-selection-pass.png](evidence/2026-08-05-live-audit/current-010-call-put-groups-exact-selection-pass.png)
- Zoom membership restore: [current-013-zoom-out-in-restores-membership-pass.png](evidence/2026-08-05-live-audit/current-013-zoom-out-in-restores-membership-pass.png)
- Broker card and owned rail: [current-004-broker-badge-exact-card-pass.png](evidence/2026-08-05-live-audit/current-004-broker-badge-exact-card-pass.png), [current-005-broker-owned-rail-pass.png](evidence/2026-08-05-live-audit/current-005-broker-owned-rail-pass.png)

## Previous checkpoint versus current build

Source forensics show old checkpoint was not a clean behavior baseline:

- Neutral double-click with one manual trade was already broken in `1590670`; both versions pass `null` identity and create `ADD`.
- Shift+Enter focus was already broken in `1590670`; neither version transfers focus into editor.
- Saved-editor layering was already vulnerable. Current uncommitted CSS raises editor from layer 4 to 10, but live saved row still paints above it because row receives much higher inline layer.
- Group flyout handling changed, but current outside-click still leaves stale visible DOM.

Conclusion: not every defect was introduced today. Current build still contains them, and previous green 862-test suite did not exercise these exact live paths.

## What remains unproven

- Previous `1590670` was tested automatically in isolation, not loaded live into Chrome. Loading it would replace current extension and needs a separate controlled comparison.
- `REFRESH ALL` exact network fan-out needs authenticated broker tracing: one positions request, one trades request, one selected-expiry chain request.
- Repeated extension reloads were not run multiple times. One user reload plus one root/unique identity check passed partially.
- Destructive workflows were not run: remove saved entry, merge, split, restore, archive. They require storage snapshot/restore first.
- Premium Skyline success path cannot run until local bridge is online and authenticated. Current failure UX remains defective because it shows no reason.

## Code-integrity proof for this audit

- No product source file was edited during live audit.
- `git diff --diff-filter=D --name-status` returned empty: no tracked file is deleted.
- `git diff --check` passed.
- Audit added only workflow documents and screenshot evidence.

## Final browser state

- TradingView: 1D.
- Browser zoom: 100%.
- Ladder theme: light.
- Ladder: LIVE.
- Rows: exact 23,000–24,900 at 100-point spacing, 20 rows.
- Overlay roots: 1.
- Selected strikes: 0.
- BE rails: 0.
- Editors: 0.
- Broker cards: 0.
- Skyline/guide: closed.
- Side panel and extension popup: closed.

Final restored-state evidence: [current-021-final-neutral-restored.png](evidence/2026-08-05-live-audit/current-021-final-neutral-restored.png)

## Recommended fix order

1. Saved manual editor layering and direct saved-entry double-click.
2. Keyboard focus entry.
3. Broker double-click contract decision, then implementation and one end-to-end test.
4. Group outside-click immediate DOM collapse.
5. Side-panel resize/remap preservation.
6. Skyline visible loading/error states, then bridge-backed end-to-end test.
7. Group-label selection independence.
