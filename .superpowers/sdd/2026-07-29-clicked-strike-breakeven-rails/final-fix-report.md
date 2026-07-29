# Final clicked-strike break-even fix report

## Scope

- Cleared existing rails synchronously when switching ladder rows, before asynchronous axis placement completes.
- Retained an invalid-price row as selected, rendered no rails, and displayed exactly `OPTION PRICE UNAVAILABLE`.
- Restored the prior operational status when outside click, Escape, manual refresh, or selected-row toggle clears unavailable feedback. Expiry change clears selection and continues to show its normal `MANUAL REFRESH REQUIRED` status.
- Preserved cached-only row clicks: selecting, switching, invalid-price selection, and toggle do not fetch option quotes.
- Preserved selected-row toggle and all existing clear lifecycle paths. No LIVE badge work was changed.

## TDD evidence

RED command:

```bash
node --test extension-axis-ladder/breakeven-rails.test.cjs extension-axis-ladder/content-contract.test.cjs
```

Initial targeted failures proved the missing behaviors: invalid row snapshot was cleared, prior rails remained during valid-row switch, selected-row toggle was absent, invalid rows were not highlighted, and unavailable feedback did not restore normal status.

GREEN command:

```bash
node --test extension-axis-ladder/breakeven-rails.test.cjs extension-axis-ladder/content-contract.test.cjs
```

Result: 91 passing, 0 failing.

## Final verification

```bash
node --check extension-axis-ladder/breakeven-rails.js
node --check extension-axis-ladder/content.js
git diff --check
cd data-bridge && npm test
```

Result: syntax and whitespace checks passed; full suite passed 315/315 with localhost-enabled integration tests.
