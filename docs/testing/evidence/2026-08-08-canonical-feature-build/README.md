# Canonical feature build — live Chrome evidence

## Feature 1 — strike-click strategy breakeven

- `feature-1-strike-click-no-duplicates.jpeg`: Chrome after clicking saved 25,200 strike. One persistent `T44 | 25,260` control; no duplicate T44 proxy; Call/Put quick BE rails remain singular.
- `feature-1-t44-detail-open.jpeg`: Chrome after clicking T44. Existing detail card opens with saved position/P&L evidence; no second detail card created.

Validation path: reload unpacked extension, reload TradingView, run explicit popup `REFRESH LADDER`, click saved strike, inspect visible chart, click T44, inspect existing detail card.

## Feature 2 — saved-minus-live seller premium difference

- `feature-2-buy-strike-seller-diff-guard.jpeg`: Chrome after clicking visible saved 25,000 BUY Call. Seller-only premium evidence is correctly omitted; Call/Put BE labels remain singular and unclipped.
- Current live dataset has SELL positions T48/T51 only as off-grid position markers, not clickable ladder strike rows. Positive sold-row rendering therefore remains browser-contract verified rather than falsely claimed as live-visible evidence.
- Contract evidence covers `440.00 - 654.85 = -214.85 pts`, matching-side-only display, explicit manual-refresh clear/re-click boundary, and zero automatic quote fetches during strike click or geometry retry.

## Feature 3 — broker margin and funds

- `feature-3-margin-detail-no-duplicates.png`: live Chrome after saved-strike click and T44 click. Existing card contains individual-leg `MARGIN —` plus combined `MARGIN REQUIRED —`; disconnected broker fails closed. Expanded card contains every row, persistent T44 control is temporarily hidden while card is open, and quick BE labels retain visible clearance.
- `feature-3-broker-funds-three-fields.png`: live Chrome side panel shows exactly `AVAILABLE MARGIN`, `USED MARGIN`, and `AVAILABLE CASH`. Disconnected Zerodha displays `—` for all three without estimates.
- Contract evidence verifies original saved premiums/legs/quantities, exact NFO instrument resolution, broker hedge-aware `final.total`, selected-strategy combined basket requests, stale fingerprint rejection, manual-refresh-only calls, and absence of every order-placement route.

## Feature 4 — combined on-chart strategy summary

- `feature-4-combined-summary-no-duplicates.png`: live Chrome after selecting T48 + T51 directly from persistent chart checkboxes with no strike click. One compact summary shows real saved-basket `BE LOW 23,355`, `BE HIGH 25,045`, `MAX PROFIT +₹9,409`, and `MAX LOSS -∞`.
- `WIN RATE —` remains fail-closed because no current side-console win-rate evidence exists. `MARGIN REQUIRED —` remains fail-closed because Zerodha is disconnected. One missing live quote marks current P&L preview `INCOMPLETE` without hiding saved payoff evidence.
- Human-eye inspection found no clipping, overlapping card/ladder rows, duplicate strategy tokens, or duplicate summary. Live DOM count confirms one summary, two exact combined BE cards/rails, one visible T48 token, and one visible T51 token.
- Deselecting from two strategies to one removes summary immediately; explicit popup refresh remains only quote-refresh boundary.
