# Task 4 implementation report

## Status

Hardened Task 4 axis calibration capture after commit `d2b06c1`. Scope remains `extension-axis-ladder/background.js` and its focused capture contract test.

## TDD evidence

### RED

Command:

```text
node --test extension-axis-ladder/capture-contract.test.cjs
```

Result: exit 1; original six contract tests failed against the pre-Task-4 background because the native-axis API, strict extractor, temporary debugger wrapper, and axis-scale capture were absent.

Hardening RED runs:

- Exit 1 with eight new failures: missing capture serialization, trusted/capture lease isolation, CSS-first Retina gap calibration, AX `{price,y}` matching, and screenshot-only legacy capture.
- Exit 1 with one further failure: a trusted session starting while capture attachment was in flight issued a second `chrome.debugger.attach`.

### GREEN

Command:

```text
node --test extension-axis-ladder/capture-contract.test.cjs
```

Result: exit 0; 13/13 focused capture contract tests passed.

## Implementation

- Added per-tab serialized capture leases and a shared in-flight attach promise. Capture and trusted sessions now retain separate ownership; neither can double-attach or detach the other.
- Reused one visible screenshot for Pine anchor bounds and neutral horizontal grid-row detection.
- Converted grid rows from device pixels to CSS pixels before applying `dominantGridGap()` CSS thresholds. Anchor coordinates convert separately at response time.
- Added strict full-string numeric parsing for native TradingView axis labels, including comma normalization and rejection of overlay text, dates, percentages, units, duplicates, and nonfinite values.
- Added short-lived debugger ownership: Accessibility is enabled for the capture, DOM is enabled for DOM-tree/box lookup, and only a debugger attach created by this capture is detached.
- Prefers Accessibility partial trees associated with chart-like canvas elements, then falls back to the full Accessibility tree when the preferred subtree is unavailable or insufficient.
- Preserves native AX `{price,y}` coordinates. Each candidate must uniquely match one screenshot grid row within tolerance; unrelated, ambiguous, reversed, duplicate, missing, and nonlinear mappings fail closed. No sorted-index pairing.
- Restored `CAPTURE_PINE_ANCHORS` as screenshot-anchor-only legacy capture. `CAPTURE_AXIS_SCALE` alone requires native axis calibration and fails closed.
- Preserved trusted debugger sessions and existing trusted input commands.

## Verification

```text
node --test extension-axis-ladder/capture-contract.test.cjs
13 passed, 0 failed

node --test extension-axis-ladder/*.test.cjs extension/*.test.cjs
47 passed, 0 failed

(cd data-bridge && npm test)
5 passed, 0 failed

node --check extension-axis-ladder/*.js extension/*.js data-bridge/*.js
exit 0

git diff --check
exit 0
```

## Concerns

- Runtime axis capture depends on TradingView exposing numeric right-axis labels with resolvable DOM boxes inside the supplied plot rectangle. Missing, unrelated, or ambiguous candidates fail closed so callers can retry instead of placing labels at guessed coordinates.
- Legacy Pine-anchor callers remain independent of the native accessibility surface and receive only `{ lower, upper }` from their screenshot capture.
