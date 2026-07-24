# Project Brief

## Problem

Options information is split across chart, option chain, broker positions, and payoff graph. This creates cognitive load even when chart reading is already strong.

## User outcome

While looking at one TradingView chart, user should understand:

1. Which option strikes exist around current price.
2. Current call and put premium at each selected strike.
3. How premiums are changing.
4. Which strategy legs are open.
5. Where strategy break-even levels sit.
6. How current price movement changes estimated strategy P&L.

## Product principle

Chart is primary interface. Tables and panels support chart reading; they do not replace it.

## Initial market context

- Underlying: NIFTY only for first release.
- Expiry: monthly only for first release.
- Pricing: last traded price only for first release.
- Instrument style: index options.
- User examples: calls, puts, straddles, spreads, short and long legs, expiry-specific positions. Strategy support comes later.
- Currency and lot size: configurable; do not hard-code from screenshots.

## Out of scope for first version

- Automated order placement.
- Broker login or account synchronization.
- Trade recommendations.
- Guaranteed real-time valuation.
- Full option-chain heatmap across every strike and expiry.
- US-market support. Revisit after NIFTY foundation works.

## Success test

Given an underlying chart and one expiry, user can identify selected strikes, call/put premium, position direction, net entry credit/debit, and break-even levels without opening a separate option-chain or payoff window.

For first release, “information only” means no trade recommendation, no buy/sell signal, and no order placement. Alerts may notify about user-selected market events; alerts do not recommend trades.
