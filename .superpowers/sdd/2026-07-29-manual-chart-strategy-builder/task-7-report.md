# Task 7 Report — Exact Tokens, Accessibility, Documentation, Release Verification

## Status

COMPLETE. Candidate ready for release commit.

Ownership was expanded on 2026-07-29 to include
`extension-axis-ladder/seller-safety-integration.test.cjs` for release metadata only.
The stale candidate title and manifest expectation changed from `0.4.3` to `0.5.0`.
No seller workflow behavior or unrelated assertion changed.

The previously blocked release gate is now green.

## Implemented

- Exact persistent row tokens:
  - live `#111315`
  - ATM `#ff9f0a`
  - Buy `#34d399`
  - Sell `#f87171`
  - transient selected/editor yellow remains `#facc15`
- Entry faces override ATM while flipped; Escape returns ATM to orange live state.
- Compact absolute-positioned editor expands left without changing row y-coordinate or connector.
- Neutral black/white count dot; traded cell uses `×lots` and stronger weight.
- No visible `SELL C`, `BUY C`, `SELL P`, `BUY P`, or flip icon.
- Live row accessible names include Call, Put, strike, and saved-entry count.
- Entry accessible names include direction, traded option type, lots, captured Call/Put values, strike, and cycle position.
- Premium input has `aria-label="Premium"`.
- Close control has `aria-label="Close editor"`.
- `Shift+Enter` opens editor on focused row.
- `Enter` and `Space` preserve single-click behavior.
- `Escape` cancels editor or returns entry face to live and restores exact-row focus.
- Close control restores exact-row focus.
- Manifest candidate version `0.5.0`; Chrome minimum remains `141`.
- Scaffold contract asserts exact final five-script suffix:
  `manual-plan.js`, `manual-payoff.js`, `manual-interaction.js`, `manual-ui.js`, `content.js`.
- Root and extension guides document manual workflow, exact colors, count meaning, entry cycling, exact combined expiry break-evens, refresh snapshot boundary, keyboard controls, and no broker import/order capability for manual plans.
- Existing read-only seller-safety baseline remains documented and unchanged.

## TDD evidence

RED:

```text
node --test --test-reporter=spec extension-axis-ladder/manual-ui.test.cjs extension-axis-ladder/content-contract.test.cjs extension-axis-ladder/scaffold.test.cjs
167 tests: 154 pass, 13 fail
```

Additional traded-cell RED:

```text
node --test --test-reporter=spec --test-name-pattern='renderRow emphasizes only traded snapshot cell|row model shows one face' extension-axis-ladder/manual-ui.test.cjs
2 tests: 0 pass, 2 fail
```

Focused GREEN:

```text
node --test extension-axis-ladder/manual-ui.test.cjs extension-axis-ladder/content-contract.test.cjs extension-axis-ladder/scaffold.test.cjs
168 tests: 168 pass
```

Final focused Task 7 GREEN, including the authorized release contract:

```text
node --test extension-axis-ladder/manual-ui.test.cjs extension-axis-ladder/content-contract.test.cjs extension-axis-ladder/scaffold.test.cjs extension-axis-ladder/seller-safety-integration.test.cjs
180 tests: 180 pass, 0 fail
```

The first final-focused run was sandboxed and its two localhost listener cases returned
`listen EPERM 127.0.0.1`. The same command was rerun with localhost permission and passed.

## Release verification

Syntax checks passed:

```text
node --check extension-axis-ladder/manual-plan.js
node --check extension-axis-ladder/manual-payoff.js
node --check extension-axis-ladder/manual-interaction.js
node --check extension-axis-ladder/manual-ui.js
node --check extension-axis-ladder/content.js
node --check extension-axis-ladder/seller-safety-integration.test.cjs
All six commands exited 0.
```

Diff check passed:

```text
git diff --check
```

Complete localhost-enabled suite:

```text
node --test extension-axis-ladder/*.test.cjs data-bridge/*.test.js
418 tests: 418 pass, 0 fail
```

Interim blocker, now resolved:

```text
release artifacts preserve the workflow in the side panel at version 0.4.3
Expected: 0.4.3
Actual:   0.5.0
```

The authorized release-only update now passes as:

```text
release artifacts preserve the workflow in the side panel at version 0.5.0
```

## Browser acceptance

NOT RUN.

Direct Chrome inspection found the cached NIFTY TradingView tab, but it still runs the previously loaded extension: ATM is mint and rows have no new accessible names. Candidate source changes require extension reload. Direct control cannot open `chrome://extensions`, so candidate acceptance could not start without user action. No account, broker, order, position, or tradebook state was changed.

## Self-review

- No broker position, tradebook, order, auto-refresh, bottom-tray, or recommendation production path changed.
- No runtime dependency added.
- Manual payoff and storage behavior remain covered by existing unit and content integration tests.
- Approved displayed break-even examples remain covered: `23,698 / 25,007` and `23,578 / 24,733`.
- Seller-safety integration diff contains only the test title and manifest version expectation change from `0.4.3` to `0.5.0`.
- `.superpowers/brainstorm/` remains untracked and unstaged.
- Assigned file diff passes whitespace validation.

## Release disposition

Candidate subject: `chore: prepare manual strategy builder 0.5.0`.

Browser checks remain NOT RUN. Automated release gates are green.
