# NIFTY Exact-LTP Chart — Approved Design

## Purpose

Build a standalone, TradingView-powered NIFTY chart page that shows real monthly option LTPs at their exact strike-price levels.

The product must solve both requirements together:

1. Call and Put premiums update automatically from live market data.
2. Each Call / Strike / Put label sits at the exact matching price level on the chart.

This replaces the attempted browser overlay and avoids manual Pine `input.symbol` selection. The existing Pine indicator remains unchanged as reference only.

## Version-one scope

- Underlying: NIFTY only.
- Candles: 1-hour timeframe only.
- Expiry: monthly only.
- Rollover: automatically select the next monthly expiry after the current monthly contract expires.
- Default strike display: five nearby strikes around ATM.
- Option data: real Call LTP and Put LTP.
- UI: clean chart by default; options drawer supplies expiry control, 5/9/all display choice, full chain, and feed state.
- Visual system: exact Markup tokens: black panels, mint status, mono typography, sharp borders, compact spacing.

## Explicit exclusions

- No order placement.
- No strategy builder, alerts, position import, weekly expiries, US markets, or historical option-premium replay.
- No automated interaction with TradingView website settings.
- No theoretical Black-Scholes pricing presented as live LTP.

## Architecture

```text
Upstox market data
        |
        v
Private data service
  - NIFTY 1H candles
  - monthly option contract discovery
  - Call/Put LTP stream
  - feed-health detection
        |
        v
TradingView Advanced Charts
  - NIFTY chart and native price scale
  - locked exact-price option labels
        |
        v
Application shell
  - expiry selector
  - strike-count selector
  - full option-chain drawer
  - feed-status display
```

The product owns the chart datafeed and drawing layer. It does not try to inject data into `tradingview.com` or into Pine Script.

## Exact-price label behavior

For each visible strike, draw one locked label at the strike price:

```text
CALL 423.40 | 23,800 | PUT 335.05
```

- ATM label uses orange.
- Other visible labels use dark grey.
- Labels use the chart's own priced drawing coordinate system, so panning and zooming preserve exact vertical placement.
- Labels update premium text only when a new LTP arrives.
- When spot crosses a 50-point strike boundary, recompute ATM, subscribe to the new five strikes, and redraw the visible label set without reloading the chart.

## Data behavior

1. Discover NIFTY monthly expiries and contracts.
2. Select active monthly expiry.
3. Determine ATM by rounding spot to the valid 50-point NIFTY strike grid.
4. Subscribe to five Call and five Put contracts around ATM.
5. Stream changed LTP values for the visible Call/Put contracts to the label manager.
6. Refresh the full-chain drawer from an option-chain snapshot only while the drawer is open.
7. On monthly expiry, switch to next monthly expiry automatically.

### Data-integrity rules

- Display last valid LTP only; never calculate or fabricate a replacement premium.
- Individual LTP may remain unchanged because no trade occurred; unchanged LTP alone is not stale.
- Show amber `STALE` when the stream disconnects, or when no complete option-chain snapshot arrives for 30 seconds during market hours.
- On feed recovery, clear stale state only after a valid snapshot or live tick arrives.
- If a contract is unavailable, show `N/A`, never zero.

## UI

### Default state

- Full-width NIFTY 1-hour candle chart.
- Five exact-price labels visible.
- Small top control area shows selected monthly expiry and chart status.
- Small footer shows source and freshness, for example: `LIVE · Upstox · last tick 0.4s`.

### Options drawer

The application shell owns this drawer; it is not injected into the Advanced Charts toolbar.

- Exact monthly expiry date.
- 5 / 9 / all visible-strikes choice.
- Full `Call | Strike | Put` option-chain table; refreshes only while open.
- Live, stale, disconnected, and unavailable data states.
- Reserved sections for future strategies and alerts.

## TradingView Advanced Charts constraints

- Requires approved access to TradingView's private Advanced Charts repository.
- Must retain TradingView attribution and follow licence terms.
- Public/private deployment terms must be confirmed with TradingView before release.
- Advanced Charts does not include market data; Upstox supplies all NIFTY candles and option data.
- Custom product UI is built around the chart; chart drawings anchor the exact-price labels.
- Pine Script is not used in this product.

## Pre-build proof gates

1. TradingView Advanced Charts access is granted.
2. Upstox account delivers live Call and Put LTP streaming for chosen NIFTY contracts.
3. A `23,800` label remains at the exact 23,800 price level through pan and zoom.
4. ATM move switches contract subscriptions without chart reload.
5. Rollover selects next monthly expiry correctly.
6. Feed failure produces visible stale state without false values.

## Verification

- Unit tests: strike selection, monthly rollover, stale-state thresholds, subscription replacement.
- Data tests: contract lookup maps each strike to the correct Call and Put instrument key.
- Integration tests: candle datafeed, LTP stream, label update, drawer chain consistency.
- Visual tests: exact price placement at multiple zoom levels; no label overlap for 5-strike view.
- Manual acceptance: compare displayed LTP against Upstox option chain for each visible strike.

## Deferred decisions

- Project name and logo.
- Weekly expiry support.
- All-strikes visual treatment at dense zoom levels.
- Strategy, alert, positions, and US-market modules.

## Sources

- TradingView Advanced Charts datafeed: https://www.tradingview.com/charting-library-docs/latest/connecting_data/
- TradingView drawings API: https://www.tradingview.com/charting-library-docs/latest/ui_elements/drawings/drawings-api/
- TradingView Advanced Charts access: https://www.tradingview.com/charting-library-docs/latest/quick-start/
- Upstox Market Data Feed V3: https://upstox.com/developer/api-documentation/v3/get-market-data-feed/
