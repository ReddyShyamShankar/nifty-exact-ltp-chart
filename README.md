# NIFTY Axis Ladder + Seller Safety Map

Version 0.4.0 is a read-only TradingView workflow for NIFTY options sellers. The Chrome extension places 13 exact Call/Put prices on TradingView’s native price axis and adds reviewed current-risk and whole-trade payoff boundaries. It never places, modifies, or exits an order.

## Data flow

```text
Zerodha positions + current-day fills ─┐
                                       ├─ local data bridge ─ extension review ─ TradingView
Upstox exact-expiry option chain ──────┘
Zerodha tradebook CSV ─ staged historical evidence ─ explicit quantity ownership
```

One press of **REFRESH ALL** makes at most one positions request, one trades request, and one option-chain request. Side-panel open, strategy switching, timeframe changes, zoom, and pan make no account or market request. A failed refresh immediately hides chart risk while keeping the last accepted evidence available in the side panel.

## Side-panel workflow

- Click the pinned NIFTY extension icon on a TradingView tab to open the full-height side panel.
- The side panel is TradingView-only and uses the same seller-safety UI as version 0.4.0.
- Switching tabs closes the panel. Click the NIFTY icon again when returning to a chart.
- Opening, closing, or resizing the panel makes no seller-refresh, positions, trades, or option-chain requests. Panel open retains the existing bridge-health, expiry-list, and Zerodha-status checks.
- Daily, use CONNECT ZERODHA, then press REFRESH ALL manually.

## Setup

1. Load [`extension-axis-ladder`](extension-axis-ladder) as an unpacked Chrome extension and copy its 32-character extension ID.
2. Persist its exact origin and install the bridge:

   ```bash
   bin/nifty-bridge extension-origin chrome-extension://<32-lowercase-id>
   bin/nifty-bridge setup
   bin/nifty-bridge zerodha-setup
   ```

3. Configure the Zerodha redirect as `http://127.0.0.1:8787/api/zerodha/callback`.
4. Open a logged-in TradingView NIFTY chart, connect Zerodha, and press **REFRESH ALL**.

The default origin remains the current packaged extension ID for existing installs. New or differently loaded extensions must run the explicit origin command; wildcard CORS is not supported.

## Evidence workflow

- Strategies are isolated by exact expiry date, including weekly expiries.
- Position lots require manual signed whole-lot allocation.
- CSV fills are staged first. Every fill quantity must be assigned explicitly, may be split between same-expiry strategies, and may leave an explicit unassigned remainder.
- Closed rolls, same-day round trips, and protection fills can be reviewed even when their contracts are no longer open.
- Historical coverage bounds are operator-confirmed. Successful zero-trade daily checkpoints extend contiguous coverage; missed dates become **HISTORY GAP** and are never inferred.
- The persistent strategy selector restores each strategy’s last accepted view without another refresh. Current stale, session, review, and refresh-failure gates still apply.

See the [extension workflow](extension-axis-ladder/README.md) and [bridge setup](data-bridge/README.md). The original Pine-sync extension remains a separate backup and is not part of this workflow.
