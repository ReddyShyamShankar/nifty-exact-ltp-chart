# Product Requirements

> **Universal product rule:** Build from instrument metadata, selected expiry, available option contracts, and TradingView axis evidence so same foundation can support any optionable pair, instrument, or index worldwide. NIFTY is current validation market, not core product rule.

Priority: P0 required for first useful prototype; P1 next; P2 later.

## First-release scope lock

- Current validation instrument: NIFTY.
- Current validation expiry: monthly.
- Premium source: last traded price.
- Calls and puts: both visible.
- Display membership: real contracts aligned to price labels currently visible on TradingView right axis.
- ATM: nearest available real contract; retain only when its price belongs inside visible axis range.
- Timeframe: context only; never selects strike interval or strike count.
- Product behavior: informational only; no recommendations or order placement.

## P0 — strike and premium view

### Inputs

- Underlying symbol.
- Expiry.
- Available option-contract strikes for selected market and expiry.
- Numerical price labels currently visible on TradingView right axis.
- Current underlying spot for real-contract ATM identification.
- Call and put visibility.

Display every real option strike that aligns with current TradingView axis evidence. Dense axis labels may expose smaller contract steps; wider axis labels naturally expose fewer strikes. Product never imposes fixed strike count and never maps chart timeframe to strike interval.

### Chart output

- Horizontal line for each selected strike.
- Strike label on right side.
- Call premium beside call label.
- Put premium beside put label.
- Clear separation between underlying price scale and option-premium text.
- Current underlying price marker.
- Selected expiry and data timestamp.

### Acceptance

- Every visible axis-aligned real contract is represented once in one right-side ladder column.
- Same axis-membership rule works across every chart timeframe.
- Zoom changes membership only through changed TradingView axis evidence.
- Real ATM contract keeps unique theme-specific styling when visible.
- Missing or delayed option data is shown as unavailable, never silently treated as zero.
- Ladder never changes TradingView auto-fit, zoom, or price scale.
- Rows without safe finite coordinates remain hidden rather than appearing at default top-left position.

## P0 — premium movement

- Current premium.
- Change from prior bar.
- Change percentage.
- Optional color for rising/falling premium.
- Optional small call-versus-put premium comparison.

## P1 — strategy legs

Each leg needs:

- Call or put.
- Strike.
- Expiry.
- Long or short.
- Quantity.
- Entry price.
- Current price.
- Lot size.
- Multiplier.

Display:

- Leg marker at strike.
- Long/short visual state.
- Net debit or credit.
- Live estimated P&L.
- Strategy name supplied by user.

## P1 — break-even and risk levels

- Break-even lines.
- Current underlying price versus break-even distance.
- Maximum profit when finite.
- Maximum loss when finite.
- Unlimited-risk warning where relevant.
- Expiry payoff estimate.

## P1 — alerts

Alerts are required, but must remain informational.

Initial alert candidates:

- Selected strike premium crosses a user-defined level.
- Call or put premium changes by a user-defined percentage.
- Underlying reaches a selected strike.
- Data becomes unavailable or delayed.

Later:

- Break-even crossing.
- Strategy P&L threshold.
- Premium spread or call-versus-put relationship.

Alerts must identify symbol, expiry, strike, right, last traded price, and timestamp. No alert text may imply a trade recommendation.

## P2 — scenario and comparison tools

- Compare two saved strategies.
- What-if underlying price.
- What-if date or DTE.
- Payoff curve in a compact chart panel.
- Delta, theta, gamma, and vega when reliable inputs exist.

## Guardrails

- Every value must show its expiry context.
- Never mix premiums from different expiries without explicit labeling.
- Never show calculated P&L as broker-confirmed P&L.
- Show market-data timestamp when data may be delayed.
- Use lot size and quantity separately; avoid confusing “contracts” with “units.”
