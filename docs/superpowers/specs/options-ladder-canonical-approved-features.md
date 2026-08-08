# Options Ladder — Canonical Approved Feature Specification

This is the single canonical Markdown specification for the approved Options Ladder feature work captured in this conversation.

Do not create separate addendum/spec Markdown files for these features. Future explicitly approved features should be added to this same file.

---

## 1. T43 strategy breakeven visibility states

### Persistent state

When nothing is clicked:

- Show only the existing checkbox + strategy tag, e.g. T43.
- Do not show the strategy breakeven price persistently.

Example:

`[checkbox] T43`

### When the associated saved strike/position is clicked

When the user clicks the saved strike/position associated with the strategy:

- Keep the checkbox + strategy tag.
- Add the strategy breakeven price beside it.

Example:

`[checkbox] T43 | 24,540`

The breakeven value shown must be the real strategy breakeven for that saved strategy.

### When T43 itself is clicked

- Open the existing T43 detail card.
- Do not create a new card.
- Do not redesign the existing card as part of this feature.

---

## 2. Dynamic premium difference beside the existing BE label

When the user clicks the associated saved strike/position, show the dynamic premium-point difference beside the existing chart BE label.

Existing example label:

`CALL BE 24,755 · SELL BELOW ↓`

Add the premium difference beside this existing label without redesigning the rest of the chart.

### Calculation

For a sold option:

`Premium difference = saved entry premium - current live premium`

Example:

- Saved entry premium: 440.00
- Current live Call premium: 654.85

Calculation:

`440.00 - 654.85 = -214.85 points`

Displayed result:

`-214.85 pts`

### Refresh behavior

- The value changes when the live premium changes.
- It must follow Options Ladder’s existing explicit manual-refresh boundary.
- Do not introduce automatic quote-refresh loops.

### UI boundary

- Keep the existing chart UI unchanged apart from this additional premium-difference evidence.
- Do not add percentages, new panels, new cards, or unrelated information.

---

## 3. Margin Required and Broker Funds

### A. Chart behavior

#### Persistent state

- Persistent strategy state remains only the checkbox + strategy tag, e.g. T43.
- Do not show margin persistently.

#### When the associated saved strike/position is clicked

Show:

`T43 | BE 24,540 | Margin ₹1.20L`

The exact values depend on the saved strategy and broker calculation.

#### Trade creation editor

- Do not show margin inside the Add/Save trade editor while constructing a new manual trade.

### B. Margin calculation basis

Margin must be based on:

- the strategy’s original saved trade configuration;
- the original saved premiums;
- the exact saved legs and quantities.

Do not use the current/live premium as the basis for this saved-strategy margin display.

### C. Multi-leg strategy margin

For a strategy with multiple legs:

- Show individual-leg margin information in the existing strategy detail card.
- Also show the broker-calculated combined Margin Required for the exact strategy basket.
- The combined value must capture broker hedge/margin benefits.
- Do not calculate combined margin by simply adding the standalone margins of each leg.

Illustrative example only:

- Sell CE leg margin: ₹4.5L
- Buy CE leg margin: ₹39K
- Broker-calculated combined strategy margin: ₹1.2L

These values are examples only and must not be hard-coded.

### D. T43 detail card

When T43 is clicked:

- Open the existing T43 detail card.
- Add individual-leg margin information.
- Add the final broker-calculated combined Margin Required.
- Do not redesign the card as part of this feature.

### E. Multiple strategies selected together

When multiple existing strategies such as T43 + T44 are selected:

- Calculate one broker-combined margin for all original saved legs across the selected strategies as one basket.
- Include cross-strategy hedge/margin benefits.
- Do not simply add each strategy’s standalone margin.

### F. Failure behavior

If broker margin evidence is unavailable or the broker margin API fails:

`Margin —`

Rules:

- Never estimate margin.
- Never invent a value.
- Preserve Options Ladder’s fail-closed behavior.

### G. Extension popup broker account summary

The extension popup should show exactly these three primary broker fund fields:

`Available Margin | Used Margin | Available Cash`

Rules:

- Values must come from the connected broker.
- Do not invent unavailable broker values.

### H. Existing product boundaries

Preserve:

- read-only broker integration;
- explicit manual-refresh behavior;
- no order placement capability.

---

## 4. Combined Strategy On-Chart Summary

### Purpose

When the user selects 2 or more existing strategies using the current strategy checkboxes, Options Ladder must calculate those selected strategies as one combined basket and surface the key combined-strategy evidence directly on the TradingView chart.

The existing side-console functionality remains unchanged.

### Trigger and selection behavior

- Trigger automatically as soon as 2+ strategies are selected.
- No extra Compare/Combine button is required.
- Recalculate whenever the selected strategy set changes.

Example:

From:

`T1 + T2 + T3`

To:

`T1 + T4 + T7 + T9`

The combined metrics must recalculate for the exact newly selected basket.

Rules:

- Use only the selected strategies.
- Use their saved strategy evidence.
- Do not guess strategy ownership.
- Do not include unselected strategies.

### On-chart combined metrics

Show:

- Breakeven(s)
- Max Profit
- Max Loss
- Win Rate
- Margin Required

### Breakeven behavior

- If the combined payoff has one breakeven, show one.
- If it has two, show both:
  - BE Low
  - BE High
- If the real payoff produces a different number of zero-crossings, use the real calculated result.
- Never invent a breakeven level.

The existing combined BE rails must remain physically positioned at their exact TradingView price levels.

### Max Profit

Show the real maximum profit for the exact combined selected basket.

### Max Loss

Show the real maximum loss for the exact combined selected basket.

If loss is truly unlimited, represent that truthfully, e.g.:

`-∞`

or an equivalent explicit unlimited-loss state.

### Win Rate

Show the win-rate value produced by the same strategy/payoff analysis logic already used by the existing side console.

### Margin Required

- Use the broker-calculated combined margin for all selected strategies as one basket.
- Include hedge and cross-strategy margin benefits.
- Do not add each strategy’s standalone margin.
- If broker margin evidence is unavailable or the margin API fails, show:

`Margin —`

- Never estimate margin.

### Calculation source

Wherever applicable:

- Reuse the same combined-strategy/payoff logic already available in the existing side console.
- Do not create a separate approximate payoff engine just for the chart.

### Chart presentation

Keep the current chart-native Options Ladder visual language.

Preserve:

- the existing right-side ladder;
- compact strategy tokens and checkboxes;
- chart-native BE rails;
- the TradingView canvas;
- current typography;
- current spacing;
- current visual language.

The basket-level metrics:

- Max Profit
- Max Loss
- Win Rate
- Margin Required

should be presented as a compact combined on-chart summary rather than attached individually to BE rails.

### Design approval boundary

The exact placement and styling of the combined summary is not locked yet.

Before implementation:

1. Codex must use the actual current Options Ladder chart-native UI as the visual baseline.
2. Codex must generate a proposed placement/mockup on top of the current design.
3. The user must visually approve the proposed placement before implementation.

Do not redesign Options Ladder into:

- a side-panel dashboard;
- a generic options analytics screen;
- a new full payoff dashboard on the chart.

### Scope boundary

This feature does not replace or redesign the existing side console.

Its purpose is to bring the most important combined-strategy evidence directly onto the TradingView chart so the selected basket can be understood without leaving the chart.

---

## Canonical documentation rule

This file is the single canonical Options Ladder feature specification for the approved items above.

Future exploratory discussion must not be added automatically.

Only content explicitly approved by the user for documentation should be appended or updated in this same file.
