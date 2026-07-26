# Task 4 implementation report

## Status

Implemented and committed Task 4 axis calibration capture in `extension-axis-ladder/background.js` with a focused capture contract test.

## TDD evidence

### RED

Command:

```text
node --test extension-axis-ladder/capture-contract.test.cjs
```

Result: exit 1; all six contract tests failed against the pre-Task-4 background because the native-axis API, strict extractor, temporary debugger wrapper, and axis-scale capture were absent.

### GREEN

Command:

```text
node --test extension-axis-ladder/capture-contract.test.cjs
```

Result: exit 0; 6/6 tests passed.

## Implementation

- Added `CAPTURE_AXIS_SCALE` and retained `CAPTURE_PINE_ANCHORS` as a compatibility alias.
- Reused one visible screenshot for Pine anchor bounds and neutral horizontal grid-row detection.
- Converted captured device-pixel rows, gaps, and anchor coordinates to CSS pixels exactly once.
- Added strict full-string numeric parsing for native TradingView axis labels, including comma normalization and rejection of overlay text, dates, percentages, units, duplicates, and nonfinite values.
- Added short-lived debugger ownership: Accessibility is enabled for the capture, DOM is enabled for DOM-tree/box lookup, and only a debugger attach created by this capture is detached.
- Prefers Accessibility partial trees associated with chart-like canvas elements, then falls back to the full Accessibility tree when the preferred subtree is unavailable or insufficient.
- Requires native axis prices and captured rows to form a monotonic linear pair; otherwise returns `{ ok: false, error }` without fabricated coordinates.
- Preserved trusted debugger sessions and existing trusted input commands.

## Verification

```text
node --test extension-axis-ladder/capture-contract.test.cjs
6 passed, 0 failed

node --test extension-axis-ladder/*.test.cjs
30 passed, 0 failed

node --check extension-axis-ladder/background.js
exit 0

git diff --check
exit 0
```

## Concerns

- Runtime success depends on TradingView exposing numeric right-axis labels in its Accessibility tree with resolvable DOM boxes inside the supplied plot rectangle. If that surface is temporarily absent, capture fails closed so the caller can retry instead of placing rows at guessed coordinates.
- The compatibility alias returns the new calibration payload, including the legacy `lower` and `upper` fields; callers that only consume those fields remain compatible.
