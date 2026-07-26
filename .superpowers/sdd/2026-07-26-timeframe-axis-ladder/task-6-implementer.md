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
