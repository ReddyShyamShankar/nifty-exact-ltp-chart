# Canonical feature build — live Chrome evidence

## Feature 1 — strike-click strategy breakeven

- `feature-1-strike-click-no-duplicates.jpeg`: Chrome after clicking saved 25,200 strike. One persistent `T44 | 25,260` control; no duplicate T44 proxy; Call/Put quick BE rails remain singular.
- `feature-1-t44-detail-open.jpeg`: Chrome after clicking T44. Existing detail card opens with saved position/P&L evidence; no second detail card created.

Validation path: reload unpacked extension, reload TradingView, run explicit popup `REFRESH LADDER`, click saved strike, inspect visible chart, click T44, inspect existing detail card.

## Feature 2 — saved-minus-live seller premium difference

- `feature-2-buy-strike-seller-diff-guard.jpeg`: Chrome after clicking visible saved 25,000 BUY Call. Seller-only premium evidence is correctly omitted; Call/Put BE labels remain singular and unclipped.
- Current live dataset has SELL positions T48/T51 only as off-grid position markers, not clickable ladder strike rows. Positive sold-row rendering therefore remains browser-contract verified rather than falsely claimed as live-visible evidence.
- Contract evidence covers `440.00 - 654.85 = -214.85 pts`, matching-side-only display, explicit manual-refresh clear/re-click boundary, and zero automatic quote fetches during strike click or geometry retry.
