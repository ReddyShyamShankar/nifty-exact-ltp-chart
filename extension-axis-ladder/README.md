# NIFTY Exact Axis Ladder — independent test build

Side-by-side extension. Existing NIFTY Chain LTP Overlay v0.14.0 remains unchanged.

## What it does

- Shows 13 exact contracts: six below ATM, ATM, six above ATM.
- Row format: `C 266.60 | P 388.70 | 26,000`.
- Anchors every row to its exact TradingView right-axis price coordinate.
- Supports 1m, 5m, 15m, 1h, 4h, D, W, M, 3M, and 6M.
- 1m uses stronger bounded price-scale fitting so all thirteen exact strikes remain visible.
- Uses fixed timeframe spacing: 1m/5m/15m/1h = 50, 4h/D = 100, W = 250, M = 500, 3M = 1000, 6M = 2000.
- Reads TradingView's native right-axis ticks only to map exact strike prices to screen coordinates.
- Supports normal and inverted linear price scales. Nonlinear scales fail closed.
- Chooses requested timeframe spacing when 13 exact contracts exist. Otherwise falls down in 50-point steps to widest complete exact range.
- Uses only contracts at the requested strikes. Missing strikes never receive nearest-contract substitutions.
- Fetches no option-chain data until **REFRESH OPTION NUMBERS** is pressed.
- Header Refresh stays immediately accessible when popup opens. One manual press makes one chain request; popup reuses same response returned by chart.
- Popup chain and placement controls stay collapsed until opened.
- Manual refresh updates LTP values and recenters ATM when spot crosses the exact midpoint.
- Timeframe changes reuse the last manually fetched chain and request no new Upstox data.
- Runs only on the NIFTY underlying chart; other TradingView tabs stay inert.
- Preserves contract membership while zooming or panning; only screen positions change.

## Workflow

1. Keep local NIFTY bridge running at `http://127.0.0.1:8787`.
2. Open logged-in TradingView NIFTY chart.
3. Open extension popup. If needed, expand **ADVANCED · PLACEMENT & HEALTH** and enable ladder.
4. Select exact expiry.
5. Press header **REFRESH** to load or update option numbers.

Popup opens with **REFRESH** beside the extension title. Full chain and placement controls stay collapsed. Timeframe changes rebuild placement from cached data. Expiry changes wait for the next manual refresh. Zoom and pan only remap the same strikes to their new screen positions.

No Pine symbol injection, Pine calibrator, manual center strike, screenshot capture, or accessibility-tree read is required. A short Chrome debugger gesture auto-fits price scale when exact rows are outside viewport, then detaches immediately. Use **RETRY PLACEMENT** only when TradingView finishes a slow layout change and automatic placement did not recover.

## Security and limits

- Extension never stores Upstox token.
- Token stays in local bridge process.
- Chrome debugger permission is used only for bounded trusted price-scale auto-fit; session detaches after every gesture.
- Unsupported timeframes, nonlinear scales, incomplete 13-strike ranges, or unobservable native ticks fail closed and hide rows.
- Extension places no orders.
- Existing v0.14.0 backup remains untouched.
