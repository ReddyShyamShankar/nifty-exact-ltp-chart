# Data Architecture

## Core distinction

The indicator has two different jobs:

1. Draw and calculate on the chart.
2. Obtain option-chain data for specific expiries and strikes.

TradingView Pine Script can request data from additional symbols, but requests consume platform resources. Current official Pine documentation states that scripts have a limit on unique `request.*()` calls: 40 on most plans and 64 on Ultimate. Pine v6 supports dynamic requests, but required datasets still need to be available during historical execution. See [TradingView limitations](https://www.tradingview.com/pine-script-docs/writing/limitations/) and [dynamic requests](https://www.tradingview.com/pine-script-docs/language/declaration-statements/).

## Data paths to evaluate

### Path A — Pine-only, fixed symbol inputs

User enters option symbols or a small fixed set of strikes. Pine requests each symbol and draws values.

Pros: stays inside TradingView; simple deployment.

Costs: limited strike count; symbol formatting varies; expiry/strike discovery is not automatic.

Best use: first proof of visualization. First release scope uses NIFTY monthly contracts and last traded price only.

### Path B — Pine with generated symbol strings

Pine builds option ticker identifiers from exchange, expiry, strike, and call/put inputs, then requests them dynamically.

Pros: better user workflow; fewer manual symbol fields.

Costs: depends on TradingView ticker naming and available option data; request limits still apply; historical availability must be validated.

Best use: second prototype after symbol format is proven.

### Path C — external option-chain service plus TradingView bridge

External service discovers expiries/strikes and supplies normalized data. TradingView receives data only if a supported integration path exists; otherwise chart-side use may require a separate companion app.

Pros: strongest chain discovery and normalization.

Costs: credentials, hosting, market-data rights, latency, and integration complexity.

Best use: production-grade chain discovery if Pine-only cannot meet requirements.

## Normalized option record

```text
underlying
expiry
strike
right: CALL | PUT
bid
ask
last
previous_close
volume
open_interest
implied_volatility
timestamp
data_status
source
```

## Calculation rules

- Use bid/ask or last price according to explicit mode.
- First release uses last traded price only.
- Mark every result as estimated when using last price or delayed data.
- P&L = `(current premium - entry premium) × signed quantity × lot size`.
- Long quantity positive; short quantity negative.
- Strategy P&L is sum of leg P&Ls.
- Break-even must be computed from leg structure and labeled as expiry break-even unless an earlier-date model is explicitly used.

## Failure states

- Symbol not found.
- Expiry unavailable.
- Premium delayed.
- Bid or ask missing.
- Request limit reached.
- Different timestamps across legs.
- Lot size unknown.

Each failure state needs visible status text and must not default to zero.
# Automatic data pivot — July 24, 2026

Final path: local Upstox bridge → chart extension. Upstox official Option Chain endpoint accepts `current_month` and returns call/put LTP plus NIFTY spot. This removes TradingView Options-panel clicks and automatically rolls monthly expiry.

TradingView Chain reader remains a temporary fallback only, not final data source.
