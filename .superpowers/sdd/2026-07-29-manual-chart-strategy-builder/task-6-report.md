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
