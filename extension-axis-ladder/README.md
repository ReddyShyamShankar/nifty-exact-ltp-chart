# NIFTY Seller Safety Map + Exact Axis Ladder

Version 0.4.0 is a side-by-side, read-only NIFTY extension. Existing NIFTY Chain LTP Overlay v0.14.0 remains unchanged.

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
- Fetches no positions, current-day trades, or option-chain data until **REFRESH ALL** is pressed.
- Header **REFRESH ALL** stays immediately accessible when popup opens. One manual press makes at most one Zerodha positions call, one Zerodha current-day trades call, and one Upstox chain call.
- Popup contains no full option-chain table. Option numbers remain on the chart ladder.
- Manual refresh updates LTP values and recenters ATM when spot crosses the exact midpoint.
- Popup open, timeframe changes, zoom, and pan reuse accepted local evidence and request no positions, trades, or chain data.
- Upstream failures are not retried automatically.
- Runs only on the NIFTY underlying chart; other TradingView tabs stay inert.
- Preserves contract membership while zooming or panning; only screen positions change.

## Seller Safety Map

- Current-risk breakevens use the currently reviewed open positions and appear as solid mint lines.
- Whole-trade breakevens include explicitly assigned imported fill history and appear as dashed graphite lines.
- Profit and loss bands shade the payoff intervals between breakevens. Bands are factual payoff regions, not recommendations.
- **EXCLUDING CHARGES** means broker charges were unavailable and were not deducted.
- **HISTORY GAP** or **HISTORY INCOMPLETE** means imported fill evidence does not fully cover the strategy. The affected whole-trade map is withheld instead of estimated.
- A stale broker timestamp preserves the last accepted evidence in the popup but hides chart risk layers until a successful reviewed refresh replaces it.
- New or changed positions preserve the last accepted evidence and enter **REVIEW POSITION CHANGES**. They do not alter published risk until manually allocated and explicitly accepted.

## Workflow

1. Keep local NIFTY bridge running at `http://127.0.0.1:8787`.
2. Open a logged-in TradingView NIFTY chart and select the exact expiry.
3. Daily, press **CONNECT ZERODHA** and finish the Zerodha login, then press **REFRESH ALL** once.
4. On first use, perform the one-time Zerodha tradebook CSV import for historical fills.
5. Manually create or select the same-expiry strategy, allocate signed whole lots, review every changed position, and press **ACCEPT REVIEWED SNAPSHOT**.
6. If needed, expand **ADVANCED · PLACEMENT & HEALTH** and enable the chart ladder.

The popup opens with **REFRESH ALL** beside the extension title. Expiry changes wait for the next manual refresh. Timeframe changes rebuild placement from cached data. Zoom and pan only remap the same strikes and accepted risk evidence to new screen positions.

No Pine symbol injection, Pine calibrator, manual center strike, screenshot capture, or accessibility-tree read is required. A short Chrome debugger gesture auto-fits price scale when exact rows are outside viewport, then detaches immediately. Use **RETRY PLACEMENT** only when TradingView finishes a slow layout change and automatic placement did not recover.

## Security and limits

- Extension never stores Upstox token.
- Zerodha API secret and daily access token stay in the local bridge Keychain. They are never returned to or stored by the extension.
- Tradebook rows, manual allocations, reviewed snapshots, and timeline remain in `chrome.storage.local`; no cloud upload occurs.
- Seller Safety Map accepts only NFO NIFTY options allocated to one same-expiry strategy.
- Chrome debugger permission is used only for bounded trusted price-scale auto-fit; session detaches after every gesture.
- Unsupported timeframes, nonlinear scales, incomplete 13-strike ranges, or unobservable native ticks fail closed and hide rows.
- Broker integration is read-only. It can read positions and trades only: no-order placement, modification, cancellation, conversion, or exit is available.
- Existing v0.14.0 backup remains untouched.
