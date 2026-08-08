# P0 final fix report — 2026-07-29

Branch: `codex/timeframe-axis-ladder`

Starting HEAD: `9ba9d7f`

## Outcome

All seven final-review findings closed in one coordinated fix wave.

1. Real **REFRESH ALL** now sends `CLEAR_BREAK_EVEN_SELECTION` to active chart and waits for chart-side handling before seller-refresh network work. Chart-message failure remains isolated and cannot block refresh. Success and rate-limit failure paths have ordering tests.
2. Generic placement/rebuild failures now remove transient visuals without deleting clicked-strike snapshot or unavailable feedback. Successful axis recovery restores selection and rails. Explicit outside click, Escape, manual refresh, expiry change, true navigation, and stop still clear.
3. Rail lines retain exact projected y coordinates. New bounded decoration layout moves only labels and offscreen markers, with deterministic Call-before-Put tie handling and 2-pixel separation.
4. TradingView badge discovery now requires one exact accessible `Publish` control identity after excluding its exact status leaf. `Publish idea LIVE`, `Republish LIVE`, missing status, and ambiguous exact controls fail closed; compact nested `Publish` + `LIVE` remains supported.
5. Selection clears on `pagehide` including BFCache entry, `popstate`, `hashchange`, Navigation API events, and detected SPA URL changes. Timeframe-only rebuilds preserve selection.
6. Ladder rows with `role="button"` now expose `aria-pressed`; invalid `aria-selected` usage removed.
7. Extension README declares current version `0.4.3`. Every `0.4.0` mention is explicit baseline wording.

## TDD evidence

Tests added before production edits. First focused run failed as intended: 117 passed, 26 failed. Failures covered missing popup clear message, absent stacking API, permissive badge targeting, stale ARIA attribute, missing navigation lifecycle, transient selection loss, and stale README version.

After implementation and test-fixture correction, focused suite passed 143/143.

## Verification

- Focused behavior suites: `node --test breakeven-rails.test.cjs tradingview-live-badge.test.cjs popup-contract.test.cjs content-contract.test.cjs` — 143 passed, 0 failed.
- Full extension + data-bridge suite: `npm test` from `data-bridge/`, with localhost permission for server tests — 336 passed, 0 failed.
- Sandbox-only full run was also attempted first; 12 server tests were blocked by `listen EPERM: operation not permitted 127.0.0.1`, then rerun with localhost permission.
- `node --check` passed for all eight changed JavaScript/test files.
- `git diff --check` passed.

## Files

- `extension-axis-ladder/popup.js`
- `extension-axis-ladder/popup-contract.test.cjs`
- `extension-axis-ladder/content.js`
- `extension-axis-ladder/content-contract.test.cjs`
- `extension-axis-ladder/breakeven-rails.js`
- `extension-axis-ladder/breakeven-rails.test.cjs`
- `extension-axis-ladder/overlay.css`
- `extension-axis-ladder/tradingview-live-badge.js`
- `extension-axis-ladder/tradingview-live-badge.test.cjs`
- `extension-axis-ladder/README.md`
- `.superpowers/sdd/2026-07-29-p0-final-fix-report.md`

No push or merge performed. Existing untracked `.superpowers/brainstorm/` preserved and excluded.
