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
