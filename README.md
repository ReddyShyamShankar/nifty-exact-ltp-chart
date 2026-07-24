# NIFTY Exact LTP Chart

Controlled TradingView-style chart for understanding NIFTY options at exact strike-price levels.

## V1

- NIFTY only
- 1-hour candles
- Next monthly expiry with automatic rollover
- Five strikes around ATM by default
- Real Call LTP | Strike | Put LTP labels at their exact chart price levels
- Orange ATM label, dark surrounding labels
- Full options drawer with 5 / 9 / all nearby strikes

## Architecture

```text
Upstox option + candle data
  -> own market-data service
  -> TradingView Advanced Charts
  -> exact-price Call / Strike / Put labels
```

The prior Pine script and browser extension remain here as rejected feasibility prototypes. They cannot auto-discover option-chain contracts or place reliable price-pixel labels inside TradingView's native chart.

## Documents

- [Project brief](docs/01-project-brief.md) — purpose, users, scope, and success criteria.
- [Product requirements](docs/02-product-requirements.md) — feature priorities and acceptance tests.
- [Visualization spec](docs/03-visualization-spec.md) — proposed chart layout and visual language.
- [Data architecture](docs/04-data-architecture.md) — what data is needed, where it can come from, and platform constraints.
- [Roadmap](docs/05-roadmap.md) — staged build plan.
- [Open questions](docs/06-open-questions.md) — decisions needed before implementation.
- [Decision log](docs/07-decision-log.md) — durable project decisions.

## Working rule

Build exact live premiums first. Strategies, alerts, weekly expiries, US markets, positions, and orders come later.
