# Task 4 Report: Draft State, Row Faces, and Compact Editor

## Status

Implemented and self-reviewed. Commit contains only Task 4 UI module, tests, and this report.

## Implementation

- Added immutable manual draft creation, action, lot, and premium transitions.
- Captures selected premium plus Call and Put snapshots; editing premium changes only selected side.
- Converts valid drafts into normalized NIFTY entries, preserving `createdAt` during edits and setting supplied `updatedAt`.
- Builds preview entries by replacing edited ID or appending new draft without mutating saved entries.
- Models exactly one live or saved row face, compact Call/Put/strike copy, direction classes, and saved-entry count.
- Renders safe DOM only through `textContent` and `replaceChildren`.
- Added compact editor: staged CALL/PUT menus with BUY/SELL choices, lot stepper, six-character premium input, ADD/SAVE, edit-only REMOVE, and close control. No visible strike or flip/refresh icon.
- No storage, network, browser API, or broker access.

## TDD evidence

- RED: `node --test extension-axis-ladder/manual-ui.test.cjs` failed first with `Cannot find module './manual-ui.js'`.
- GREEN: focused suite passes 8/8 tests.
- Narrow premium input received its own RED/GREEN cycle: test failed with `undefined !== 6`, then passed after setting `input.size = 6`.

## Verification

- `node --test extension-axis-ladder/manual-ui.test.cjs`: 8 passed, 0 failed.
- `node --check extension-axis-ladder/manual-ui.js`
- `node --check extension-axis-ladder/manual-ui.test.cjs`
- `git diff --check`
- `node --test extension-axis-ladder/*.test.cjs data-bridge/*.test.js`: 361 passed, 0 failed, under approved loopback permission.

## Self-review

- Owned scope only: UI module, UI tests, Task 4 report.
- `.superpowers/brainstorm/` remains untracked and unstaged.
- No integration or style changes; Task 5 composes this module later.

## Concerns

None. Full suite passed with loopback listener permission.

## Round 1/5 Fix

`rowModel` now filters entries by exact `liveRow.strike` before selecting active face and count. Foreign-strike entries cannot render a snapshot face or count dot on another row.

Added mixed-strike regression plus exact-strike fields to existing normalized-entry fixtures.

Commands/output:

```text
$ node --test extension-axis-ladder/manual-ui.test.cjs
# tests 9
# pass 9
# fail 0

$ node --check extension-axis-ladder/manual-ui.js
$ node --check extension-axis-ladder/manual-ui.test.cjs
$ git diff --check
```
