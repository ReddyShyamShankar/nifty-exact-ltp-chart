# Manual Chart Strategy Builder — Final Fix Report

Date: 2026-07-29
Baseline: `fd6a352369136054daddd1a0f2effa02d8c14307`
Release version: `0.5.0`

## Outcome

All seven Important and all four Minor final-review findings are fixed with regression coverage.

## Important findings closed

1. Cross-tab lost updates
   - `background.js` now owns one serialized `MUTATE_MANUAL_PLANS` queue.
   - Every operation rereads authoritative local storage, applies one upsert/remove, and writes the resulting store.
   - Content scripts no longer write the whole manual-plan store.
   - Concurrent two-context add/add, save/add, and remove/add contracts pass.

2. Malformed-record recovery
   - Invalid entries and malformed plan containers move into a lossless `quarantine` collection.
   - Valid add/save/remove mutations preserve quarantine.
   - The chart status exposes `MANUAL ENTRY NEEDS REVIEW` with the invalid count.

3. Selected-side snapshot rule
   - Only the selected Call/Put snapshot is required.
   - A stored unavailable opposite snapshot remains `null`, displays as `—`, and is not backfilled from a later live quote.

4. Pending-save rendering
   - Successful pending mutations rerender saved counts, faces, and plan rails after Close, outside click, or `Escape`.
   - Page lifecycle, navigation, disabled-state, expiry, and concealment guards still block stale visual restoration.

5. Refresh reset
   - Manual editor and active entry face clear before refresh work begins.
   - Success, network failure, overlapping-request abort, and placement-failure paths are covered.
   - Captured entries remain immutable; refresh only changes live values.

6. Accessible editor structure
   - The editor is a positioned sibling of the ARIA row button.
   - The row is temporarily removed from the accessibility/focus path while its sibling editor is active, then restored on close.
   - Interactive controls are no longer nested inside the row button.

7. Live premium validation
   - Premium preview uses the `input` event and updates without replacing the editor or losing focus/selection.
   - Add/Save is disabled for invalid drafts.
   - Compact validation status and selected Buy/Sell + Call/Put visual/ARIA state are present.

## Minor findings closed

- Manual plan rails use existing graphite/black/white tokens; violet was removed.
- Selected direction and option side remain visible and available through `aria-pressed` and accessible labels.
- Expiries and timestamps require real ISO calendar/time values, including leap-day and timezone-bound checks.
- Added zero-at-strike-knot, Escape/reset active-face, full malformed-input, and unavailable-snapshot regressions.

## Safety and product boundaries

- Manual plans remain separate from broker positions, orders, tradebooks, and seller-safety evidence.
- No broker write, order placement, modification, cancellation, conversion, or exit API was added.
- Manual mutations write only extension-local manual-plan storage.
- Version remains exactly `0.5.0`.
- New manual UI styling uses only existing approved semantic and neutral tokens.

## Verification

- Focused:
  - `node --test extension-axis-ladder/manual-plan.test.cjs extension-axis-ladder/manual-payoff.test.cjs extension-axis-ladder/manual-interaction.test.cjs extension-axis-ladder/manual-ui.test.cjs extension-axis-ladder/capture-contract.test.cjs extension-axis-ladder/content-contract.test.cjs extension-axis-ladder/scaffold.test.cjs`
  - Result: `229/229` passed.
- Full suite:
  - `node --test extension-axis-ladder/*.test.cjs data-bridge/*.test.js`
  - Sandboxed run: `432` passed and `11` localhost integration tests were blocked by `listen EPERM`.
  - Permitted localhost rerun: `443/443` passed.
- Syntax checks passed for `background.js`, `content.js`, `manual-plan.js`, and `manual-ui.js`.
- `git diff --check` passed.
- Manual production files contain no broker order-operation surface.

## Files changed

- Runtime: `extension-axis-ladder/background.js`, `content.js`, `manual-plan.js`, `manual-ui.js`, `overlay.css`
- Regression tests: `capture-contract.test.cjs`, `content-contract.test.cjs`, `manual-plan.test.cjs`, `manual-ui.test.cjs`, `manual-payoff.test.cjs`, `manual-interaction.test.cjs`, `scaffold.test.cjs`
- Operator docs: `README.md`, `extension-axis-ladder/README.md`
- This report

## Remaining concern

Browser acceptance was **NOT RUN**. Automated contracts cover the behavior, including two-context mutation races, but no live unpacked-extension or TradingView browser-pass claim is made.
