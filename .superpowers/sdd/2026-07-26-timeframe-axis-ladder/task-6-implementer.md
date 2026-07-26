# Task 6 implementation

Scope owned: `extension-axis-ladder/content.js`, `extension-axis-ladder/overlay.css`, and behavioral contract coverage.

State split:

- Rebuilds select and freeze thirteen contracts from timeframe, expiry, detected native-axis interval, and bridge spot.
- Refreshes replace Call/Put values only for frozen strikes.
- Placement always captures fresh native `axisPairs`, maps raw strike price to CSS y, and never spreads rows.

Safety:

- Unsupported timeframe and failed calibration remove rows and publish status.
- Generation plus `AbortController` discard stale rebuild results.
- New content script contains no trusted Pine-field automation or `SYNC_PINE_INPUTS` message handling.

## Remediation — `fix: harden ladder state transitions`

- Desired timeframe and expiry are now distinct from committed membership. An `A → B → A` transition aborts B and rebuilds A even when A remains the last committed membership.
- Every rebuild snapshots expiry and validates its generation before commit. Expiry changes during initial or timeframe work cannot record old contracts under the new expiry.
- Calibration requires two valid native-axis captures with the same snapped interval. Failed rebuilds use one bounded, non-overlapping `0/250/650/1200 ms` retry schedule; placement retries remain independent.
- Quote parsing rejects nullish, blank, boolean, and non-finite values in both frozen and refreshed rows, rendering `—` instead of a fabricated `0.00`.
- Sparse chains use deterministic, unique nearest-available strike selection. Membership contains 13 actual ordered contracts and ATM is the selected strike nearest spot.
- LTP refresh updates rendered quotes and reapplies cached exact positions without another debugger capture. Explicit placement still captures fresh scale data for zoom, pan, and resize.
- Stop now removes resize, wheel, and pointerup listeners; start binds each listener once.

Verification: focused controller/selector tests 21/21; `extension-axis-ladder` suite 54/54; repository suite 67/67; bridge suite 5/5; `node --check` for background, content, popup, and timeframe selector; `git diff --check`.
