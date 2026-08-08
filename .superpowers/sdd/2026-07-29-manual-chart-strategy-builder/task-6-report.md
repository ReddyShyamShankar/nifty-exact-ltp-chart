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

## Fix Round 3/5

### Findings resolved

- LTP refresh no longer advances the rail visual revision. Accepted quote data is governed only by generation, expiry, membership, and refresh-request ownership.
- A fresh-axis placement retains ownership of rail coordinates while consuming refreshed quotes if the refresh resolves first.
- A refresh resolving after a fresh-axis placement reuses that committed visual revision and cached axis without invalidating it.
- Concurrent refreshes now supersede earlier fetches through the existing refresh revision and abort guard; stale responses return failure without changing current quotes.
- Lifecycle revision checks remain active: a refresh may repaint only with its current revision or a still-current committed placement revision.

### Added production-hook contracts

- Placement → refresh → newer-axis resolution keeps fresh quote cells and commits rails at the newer y coordinate.
- Refresh → newer placement → refresh resolution keeps fresh quote cells while rails remain at the newer y coordinate.
- A delayed older refresh cannot overwrite a newer accepted refresh; older runtime response reports `ok: false`.

### Verification — exact commands and output

```text
$ node --test --test-reporter=spec extension-axis-ladder/manual-payoff.test.cjs extension-axis-ladder/content-contract.test.cjs
ℹ tests 154
ℹ pass 154
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1120.53675

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
...............
(exit 0)
```

### Self-review

- Visual revision ownership stays with axis/rebuild placement. LTP data ownership stays with refresh revision.
- Task 5 manual-plan persistence and all shared quick/manual rail layout behavior remain untouched.

## Fix Round 4/5

### Finding resolved

- An accepted refresh crossing the exact 23,775 midpoint now keeps its recentered 23,800 ATM membership while an already-started newer-axis placement finishes.
- Placement freshness no longer treats membership identity as immutable inside one lifecycle generation. A current placement applies its captured axis to the latest accepted `current` membership.
- Independent rebuild, timeframe, expiry, lifecycle, newer-placement, and newer-preview invalidation remain enforced by generation, requested identity, placement revision, and visual revision guards.
- Stale refresh ownership remains independently enforced by refresh revision and abort guards.

### Added production-hook contract

- Newer-axis placement starts, refresh resolves at spot 23,775, ATM recenters from 23,750 to 23,800, and the placement then resolves.
- The contract verifies fresh 23,800 quotes (`C 777.00`, `P 888.00`), removal of obsolete 23,450 membership, addition of 24,100 membership, retained 23,800 ATM styling, successful placement response, and manual rails at the newer-axis y coordinate (`326.2px`).

### TDD evidence — exact commands and output

```text
$ node --test --test-reporter=spec --test-name-pattern='production retry placement applies its newer axis to refresh-recentered membership' extension-axis-ladder/content-contract.test.cjs
✖ production retry placement applies its newer axis to refresh-recentered membership (79.551667ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 389.538375

AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
false !== true
at extension-axis-ladder/content-contract.test.cjs:2777:10

$ node --test --test-reporter=spec --test-name-pattern='production retry placement applies its newer axis to refresh-recentered membership' extension-axis-ladder/content-contract.test.cjs
✔ production retry placement applies its newer axis to refresh-recentered membership (81.692292ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 411.489083
```

### Verification — exact commands and output

```text
$ node --test --test-reporter=spec --test-name-pattern='production retry placement applies|newest placement capture wins|placement started during rebuild|same-timeframe expiry change blocks|a rebuild generation discards|production stale older refresh|older cancelled placement|older failed placement|delayed placement started before' extension-axis-ladder/content-contract.test.cjs
✔ newest placement capture wins when older capture resolves last
✔ placement started during rebuild cannot overwrite newly committed axis map
✔ same-timeframe expiry change blocks stale placement and waits for manual refresh
✔ a rebuild generation discards a stale in-flight LTP refresh
✔ delayed placement started before pagehide cannot redraw manual rails after reset
✔ delayed placement started before same-label SPA navigation cannot redraw manual rails after reset
✔ older cancelled placement cannot clear newer preview rails after it completes
✔ older failed placement cannot clear newer preview rails
✔ production retry placement applies its newer axis to refresh-recentered membership
✔ production stale older refresh cannot overwrite a newer accepted refresh
ℹ tests 10
ℹ pass 10
ℹ fail 0

$ node --test --test-reporter=spec extension-axis-ladder/manual-payoff.test.cjs extension-axis-ladder/content-contract.test.cjs
ℹ tests 155
ℹ pass 155
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 974.742833

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
................
(exit 0; local 127.0.0.1 test-server bind approved after sandbox-only EPERM)
```

### Self-review

- Removing membership revision from placement ownership is intentionally narrow: membership changes without a generation change come only from an accepted refresh, and placement already renders `current`.
- Existing lifecycle guards prevent old membership from surviving timeframe, expiry, rebuild, stop, pagehide, or SPA invalidation.
- Task 5 persistence, quick/manual shared layout, and prior stale-refresh/newer-preview protections remain unchanged.

### Concerns

None.
