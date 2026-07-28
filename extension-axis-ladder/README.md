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
- The validated chain rows from that coordinated response are saved locally and sent to the chart ladder; the chart does not make a second chain request.
- Popup contains no full option-chain table. Option numbers remain on the chart ladder.
- Manual refresh updates LTP values and recenters ATM when spot crosses the exact midpoint.
- Popup open, timeframe changes, zoom, and pan reuse accepted local evidence and request no positions, trades, or chain data.
- Upstream failures are not retried automatically.
- Any positions, trades, chain, session, rate-limit, or malformed-response failure becomes **STALE · REFRESH FAILED** immediately and hides every chart risk layer. The popup retains the last accepted operator evidence; there is no 15-minute grace period after a known failure.
- Runs only on the NIFTY underlying chart; other TradingView tabs stay inert.
- Preserves contract membership while zooming or panning; only screen positions change.

## Seller Safety Map

- Current-risk breakevens use the currently reviewed open positions and appear as solid mint lines.
- Whole-trade breakevens include explicitly assigned imported fill history and appear as dashed graphite lines.
- Profit and loss bands shade the payoff intervals between breakevens. Current-risk bands use solid shading; whole-trade profit and loss use visibly different directional hatch treatments. Bands are factual payoff regions, not recommendations.
- **EXCLUDING CHARGES** means broker charges were unavailable and were not deducted.
- **HISTORY GAP** or **HISTORY INCOMPLETE** means imported fill evidence does not fully cover the strategy. The affected whole-trade map is withheld instead of estimated.
- A stale broker timestamp preserves the last accepted evidence in the popup but hides chart risk layers until a successful reviewed refresh replaces it. The chart checks the 15-minute evidence deadline and Zerodha session expiry locally before every placement, automatically hiding at the earlier deadline without a network call. **REFRESH FAILED** immediately hides chart output as soon as a manual refresh fails.
- New or changed positions preserve the last accepted evidence for operator inspection and enter **REVIEW POSITION CHANGES**. A separate withheld chart state hides the old map until the new positions are manually allocated and explicitly accepted.
- A Zerodha tradebook CSV is staged as evidence only. Each per-fill quantity stays under **REVIEW TRADE OWNERSHIP** until the operator chooses a same-expiry strategy or explicitly leaves it unassigned. One fill can be split across multiple strategies by assigning part of its remaining quantity at a time. Import never assigns all rows to the selected strategy and never invents coverage through today.
- Explicitly reviewed closed rolls, same-day round trips, opened/closed adjustments, and protection fills remain valid same-expiry history even when that contract is no longer open. Unrelated same-contract fills left unassigned cannot cancel owned history or change whole-trade payoff.
- The operator confirms exact historical coverage bounds after every staged batch. Immutable successful daily checkpoints—including `trades=[]` days—extend only contiguous coverage. A missed interval becomes **HISTORY GAP**; no missing date is inferred.
- Current-day Zerodha trades are immutable and deduplicated against imported history. Every new quantity still needs an explicit disposition before acceptance.
- The always-visible strategy selector restores the accepted popup and chart view for each strategy without another refresh. Same-expiry and different-expiry strategies remain isolated; switching views does not delete another strategy’s accepted evidence.
- Weekly contracts keep their exact expiry date in canonical identity. Same strike/right contracts such as 04 Aug and 11 Aug never collide or merge with a monthly contract.
- **WHY IT MOVED** compares immutable accepted normalized inputs and reports factual lot, premium/debit, breakeven, band, protection, short-exposure, and per-leg contribution changes. It gives no advice.

## Workflow

1. Keep local NIFTY bridge running at `http://127.0.0.1:8787`.
2. Open a logged-in TradingView NIFTY chart and select the exact expiry.
3. Daily, press **CONNECT ZERODHA** and finish the Zerodha login, then press **REFRESH ALL** once.
4. Import the relevant Zerodha tradebook CSV. Review the import summary: proven rows from another account, index, exchange, or expiry are counted as ignored; ambiguous rows reject the batch.
5. For every staged or current-day fill, enter an explicit quantity and choose a same-expiry strategy or **Leave unassigned**. Repeat to split one fill across strategies.
6. Enter and confirm the operator-reviewed **coverage bounds**. Daily successful checkpoints can extend that baseline; a missing checkpoint creates **HISTORY GAP**.
7. Manually allocate changed whole lots, review the resulting map, and press **ACCEPT REVIEWED SNAPSHOT**.
8. Use the strategy selector to restore any accepted strategy without another refresh. If needed, expand **ADVANCED · PLACEMENT & HEALTH** and enable the chart ladder.

The popup opens with **REFRESH ALL** beside the extension title. Expiry changes wait for the next manual refresh. Timeframe changes rebuild placement from cached data. Zoom and pan only remap the same strikes and accepted risk evidence to new screen positions.

No Pine symbol injection, Pine calibrator, manual center strike, screenshot capture, or accessibility-tree read is required. A short Chrome debugger gesture auto-fits price scale when exact rows are outside viewport, then detaches immediately. Use **RETRY PLACEMENT** only when TradingView finishes a slow layout change and automatic placement did not recover.

## Security and limits

- Extension never stores Upstox token.
- Zerodha API secret and daily access token stay in the local bridge Keychain. They are never returned to or stored by the extension.
- Tradebook rows, manual allocations, reviewed snapshots, and timeline remain in `chrome.storage.local`; no cloud upload occurs.
- Seller Safety Map accepts only exact-expiry NFO NIFTY options. Old month-only stored identities fail closed for manual review and weekly identities are never merged.
- Chrome debugger permission is used only for bounded trusted price-scale auto-fit; session detaches after every gesture.
- Unsupported timeframes, nonlinear scales, incomplete 13-strike ranges, or unobservable native ticks fail closed and hide rows.
- Broker integration is read-only. It can read positions and trades only: no-order placement, modification, cancellation, conversion, or exit is available.
- Existing v0.14.0 backup remains untouched.
