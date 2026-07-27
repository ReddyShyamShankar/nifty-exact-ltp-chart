# NIFTY Exact Axis Ladder — independent test build

Side-by-side extension. Existing NIFTY Chain LTP Overlay v0.14.0 remains unchanged.

## What it does

- Shows 13 exact contracts: six below ATM, ATM, six above ATM.
- Row format: `C 266.60 | P 388.70 | 26,000`.
- Anchors every row to its exact TradingView right-axis price coordinate.
- Supports 15m, 1h, 4h, D, W, M, 3M, and 6M.
- Uses fixed timeframe spacing: 15m/1h = 50, 4h/D = 100, W = 250, M = 500, 3M = 1000, 6M = 2000.
- Reads TradingView's native right-axis ticks only to map exact strike prices to screen coordinates.
- Supports normal and inverted linear price scales. Nonlinear scales fail closed.
- Chooses requested timeframe spacing when 13 exact contracts exist. Otherwise falls down in 50-point steps to widest complete exact range.
- Uses only contracts at the requested strikes. Missing strikes never receive nearest-contract substitutions.
- Uses the two-second Upstox chain refresh for both LTP updates and automatic ATM recentering.
- Recenters when spot reaches the exact midpoint between the current ATM and the next interval center.
- Preserves contract membership while zooming or panning; only screen positions change.

## Workflow

1. Keep local NIFTY bridge running at `http://127.0.0.1:8787`.
2. Open logged-in TradingView NIFTY chart.
3. Open extension popup and enable ladder.
4. Select exact expiry.

Status reads `AUTO · 13 STRIKES · EXACT AXIS`. Timeframe or expiry changes rebuild membership. An exact midpoint crossing recenters it automatically. Zoom and pan only remap the same strikes to their new screen positions.

No Pine symbol injection, Pine calibrator, manual center strike, screenshot capture, or accessibility-tree read is required. A short Chrome debugger gesture auto-fits price scale when exact rows are outside viewport, then detaches immediately. Use **RETRY PLACEMENT** only when TradingView finishes a slow layout change and automatic placement did not recover.

## Security and limits

- Extension never stores Upstox token.
- Token stays in local bridge process.
- Chrome debugger permission is used only for bounded trusted price-scale auto-fit; session detaches after every gesture.
- Unsupported timeframes, nonlinear scales, incomplete 13-strike ranges, or unobservable native ticks fail closed and hide rows.
- Extension places no orders.
- Existing v0.14.0 backup remains untouched.
