# Task 6 Report — Combined Preview and Saved Break-Even Rails

## Status

Complete.

## Delivered

- Independent `#nifty-manual-plan-rails`; quick single-leg rails unchanged.
- Saved plans render every exact `PLAN BE` root through native-axis projection.
- Valid open drafts render `PREVIEW BE` roots without storage or quote fetching; cancel restores saved rails.
- Edge markers use existing projection and overlap layout. Empty, flat, and axis-failure paths clear visual rails without mutating plans.
- Flat plans report `PLAN PAYOFF FLAT`.
- Committed drafts replace preview labels with committed `PLAN BE` labels.

## Verification

- `node --test extension-axis-ladder/manual-payoff.test.cjs extension-axis-ladder/content-contract.test.cjs` — 140 passed.
- `node --check extension-axis-ladder/content.js` — passed.
- `git diff --check` — passed.
- `node --test extension-axis-ladder/*.test.cjs` — passed. Local test-server bind required sandbox escalation.

## Self-review

- Found and fixed stale `PREVIEW BE` labels after save; regression test added.
- Task 5 serialized storage and lifecycle guards retained.

## Concerns

None.

## Fix Round 1/5

### Findings resolved

- Outside click and Escape now remove preview state, clear stale visual rails, then re-place saved `PLAN BE` rails when native-axis placement succeeds. Failed placement leaves rails cleared.
- `pagehide`, SPA navigation, and runtime URL-reset paths now clear manual visual rails without touching saved entries or storage.
- Quick and manual rail placements now share one `layoutDecorations` pass. DOM roots and exact rail y values remain independent; only label y stacking changes.

### Added contracts

- Outside-click and Escape cancellation restore saved rails without storage writes.
- `pagehide` and same-label SPA navigation clear visuals while retaining both saved entries.
- Same/near quick and manual rail labels stack jointly; line y coordinates remain exact.

### Verification — exact commands and output

```text
$ node --test --test-reporter=spec extension-axis-ladder/manual-payoff.test.cjs extension-axis-ladder/content-contract.test.cjs
ℹ tests 145
ℹ pass 145
ℹ fail 0

$ node --check extension-axis-ladder/content.js
(exit 0; no output)

$ git diff --check
(exit 0; no output)

$ node --test --test-reporter=dot extension-axis-ladder/*.test.cjs
....................
....................
....................
....................
....................
....................
....................
....................
....................
....................
....................
....................
....................
....................
....................
....................
....................
....................
......
(exit 0)
```

## Fix Round 2/5

### Findings resolved

- Outside-click and Escape cancellation now leave manual rails cleared when the saved-plan native-axis placement fails; saved entries and storage remain unchanged.
- Lifecycle resets advance a monotonic visual-placement revision. `pagehide`, SPA navigation, and runtime URL reset invalidate every older in-flight rail placement before clearing visual roots.
- Rebuild, LTP refresh, direct placement, rail rendering, and failure cleanup carry the captured revision. Older completions cannot render or clear rails owned by a newer preview.
- Shared quick/manual decoration layout and exact rail y coordinates remain unchanged.

### Added contracts

- Invalid native-axis cancellation through both outside click and Escape clears preview visuals without storage writes.
- Delayed placements resolved after `pagehide` or same-label SPA navigation cannot redraw manual rails.
- A newer preview survives both a late cancelled placement and a late failed placement.

### Verification — exact commands and output

```text
$ node --test --test-reporter=spec extension-axis-ladder/manual-payoff.test.cjs extension-axis-ladder/content-contract.test.cjs
ℹ tests 151
ℹ pass 151
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1170.947375

$ node --check extension-axis-ladder/content.js
(exit 0; no output)

$ git diff --check
(exit 0; no output)

$ node --test --test-reporter=dot extension-axis-ladder/*.test.cjs
....................
....................
....................
....................
....................
....................
....................
....................
....................
....................
....................
....................
....................
....................
....................
....................
....................
....................
............
(exit 0)
```

### Self-review

- Revision checks cover both manual and quick rail roots while preserving independent DOM semantics.
- Task 5 serialized manual-plan storage queue remains unchanged.
