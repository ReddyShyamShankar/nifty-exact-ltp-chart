# Product Requirements

Priority: P0 required for first useful prototype; P1 next; P2 later.

## First-release scope lock

- Underlying: NIFTY.
- Expiry: monthly.
- Premium source: last traded price.
- Calls and puts: both visible.
- Default strike count: five total.
- Strike count: user-configurable after default.
- ATM center: automatic by default, manual override available.
- Product behavior: informational only; no recommendations or order placement.

## P0 — strike and premium view

### Inputs

- Underlying symbol.
- Expiry.
- Strike interval.
- Center strike or current-price anchoring.
- Number of strikes above and below center.
- Call and put visibility.

Strike count should offer a compact preset selector such as 3, 5, 7, 9, or 11 total. Default: 5. Exact maximum depends on verified symbol/request limits.

### Chart output

- Horizontal line for each selected strike.
- Strike label on right side.
- Call premium beside call label.
- Put premium beside put label.
- Clear separation between underlying price scale and option-premium text.
- Current underlying price marker.
- Selected expiry and data timestamp.

### Acceptance

- User can see at least ATM, two strikes above, and two strikes below.
- Labels remain readable on 1m, 5m, 15m, 1h, and daily charts.
- Missing or delayed option data is shown as unavailable, never silently treated as zero.
- Increasing strike count must not force labels to overlap the candle area.
- UI must preserve a clean chart at the default setting.

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
