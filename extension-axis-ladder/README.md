# NIFTY Exact Axis Ladder — independent test build

Side-by-side extension. Existing NIFTY Chain LTP Overlay v0.14.0 remains unchanged.

## What it does

- Shows 13 contracts: six below ATM, ATM, six above ATM.
- Row format: `C 266.60 | P 388.70 | 26,000`.
- Anchors every row to its exact TradingView right-axis price coordinate.
- Supports 15m, 1h, 4h, D, W, M, 3M, and 6M.
- Rebuilds contract membership only when timeframe or expiry changes.
- Preserves same contracts while zooming or panning; only screen position changes.
- Refreshes Upstox LTP values every two seconds without reopening TradingView settings.

## Workflow

1. Keep local NIFTY bridge running at `http://127.0.0.1:8787`.
2. Open logged-in TradingView NIFTY chart.
3. Open extension popup and enable ladder.
4. Select exact expiry.

Status reads `AUTO · 13 STRIKES · EXACT AXIS`. No Pine symbol injection or manual center strike is required. Use **RETRY PLACEMENT** only when TradingView finishes a slow layout change and automatic placement did not recover.

## Security and limits

- Extension never stores Upstox token.
- Token stays in local bridge process.
- Chrome debugger attaches only for short axis captures, then detaches.
- Unsupported timeframes fail closed and hide rows.
- Extension places no orders.
