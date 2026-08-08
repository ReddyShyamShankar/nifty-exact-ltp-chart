# Strategy Chart UI Review — 2026-07-31

## Verdict

**PASS WITH LIVE-DATA LIMITATION — 23/24**

Code and automated UI contracts are release-ready. Live Chrome verified card geometry, outside-click collapse, square selection, keyboard toggle, light theme, and layer order. Live chart had only one active strategy, so multi-select Save chooser could not be exercised without changing user strategy history.

## Six-Pillar Scorecard

| Pillar | Score | Evidence | Remaining gap |
|---|---:|---|---|
| Visual hierarchy | 4/4 | Strategy label remains primary; position and charge disclosure appear only on inspection; combined action bar stays compact. | None found. |
| Layout and spacing | 4/4 | Expanded card measured 78 px and reserves full height; collapsed card measured 24 px; outside click collapses; 6 px collision gap has regression coverage. | Multi-card live geometry blocked by one active strategy. |
| Typography | 4/4 | Geist Mono, tabular numerals, existing ARB Desk sizing and weights retained. | None found. |
| Color and theme | 3/4 | No new semantic colors; locked ARB Desk variables; P/L colors remain mode-independent; light mode inspected live. | Dark mode not reproduced live in same multi-select state. Automated parity passes. |
| Interaction and feedback | 4/4 | Square selection stays separate from label expansion. Compare, Save, Clear are explicit. Save asks Create New vs Merge Into. Cancel and failure preserve preview. | None found. |
| Accessibility | 4/4 | Exact button names, `aria-pressed`, keyboard Space activation, named Save dialog, first-option focus, Escape cancel, focus return, visible focus ring, polite save status. | None found. |

## Bugs Fixed During Review

1. **Expanded card overlap**
   - Cause: every strategy card reserved fixed 28 px despite expanded content.
   - Fix: dynamic 24/51/78 px height from rendered detail rows and disclosure.

2. **Missing chart confirmation**
   - Cause: permanent merge confirmation existed only in side panel.
   - Fix: chart-native `Save` with explicit `CREATE NEW STRATEGY`, `MERGE INTO T<n>`, and `CANCEL`.

3. **Save chooser accessibility**
   - Cause: chooser had no dialog name, initial focus, Escape route, or focus return.
   - Fix: named dialog, first destination focus, Escape cancellation, Save-button focus return, visible focus ring, polite status announcement.

4. **Layer confusion**
   - Verified: financial rail z-index 1, strike row 2, strategy card 3. Dashed rail cannot visually cut through card surface.

## Release Gates

- Automated suite: must stay fully green.
- `git diff --check`: must stay clean.
- Chrome extension must be reloaded after source change.
- Business-owner UAT still required for real three-strategy `Save` because confirmation archives source strategies by design.

## Skill Fallback

Requested `gsd-ui-review` runner resources were absent from installed package path. Review used its six-pillar intent manually, backed by live Chrome measurements and automated UI contracts.
