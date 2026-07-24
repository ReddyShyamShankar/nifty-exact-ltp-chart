# Decision Log

## D001 — Chart-first interface

Status: accepted.

The underlying TradingView chart remains primary. Option information appears as chart layers and compact labels.

Reason: user already reads charts well; moving to separate tables increases confusion.

## D002 — Strike ladder is first build target

Status: accepted.

First prototype shows selected strikes and call/put premiums before strategy calculations.

Reason: isolates the immediate learning need and gives fastest visual feedback.

## D003 — Separate visualization from data-discovery risk

Status: accepted.

Prototype must prove both chart readability and actual option-symbol/data availability. Do not assume automatic chain discovery is available just because chart drawing is possible.

Reason: platform request limits and symbol availability can determine architecture.

## D004 — No silent zero values

Status: accepted.

Missing, delayed, or unavailable data must show status instead of becoming zero.

Reason: zero premium or zero P&L can create a false trading decision.

## D005 — Fixed/manual symbols acceptable for first proof

Status: proposed; user confirmation needed.

Use a small manually configured set of option symbols if needed to validate visualization quickly. Revisit automatic symbol generation after visual prototype works.

Reason: lowest-risk way to test chart design before solving full chain discovery.

## D006 — NIFTY monthly first release

Status: accepted.

First release supports NIFTY monthly options only. US-market and weekly-expiry support come later.

## D007 — Last traded price first

Status: accepted.

First release uses last traded price. Bid/ask and midpoint modes can come later.

## D008 — Five-strike default with user-controlled expansion

Status: accepted.

Default ladder shows five total strikes. User can select more through a compact control, while anti-clutter rules protect chart readability.

## D009 — Alerts required, information-only

Status: accepted.

Alerts are part of the product, but only report user-selected market events. They never recommend a trade or place an order.

## D010 — Phase 1 prototype uses manual option symbols

Status: implemented.

The first Pine prototype accepts manually entered call/put symbols for each ladder slot.

Reason: validate chart readability and label behavior before depending on exchange-specific automatic symbol construction.

## D011 — Minimal right-edge LTP ladder

Status: implemented.

Prototype shows five NIFTY strikes, 50 points apart, with `C LTP | P LTP` in one right-edge label. Center strike is orange. Historical strike lines and extra panels are removed.

Reason: match user’s option-chain mental model without covering candles.

## D012 — Manual contract selection rejected

Status: accepted.

Any workflow requiring user to select option contracts or update monthly-expiry symbols is rejected. Final product must discover current monthly NIFTY strikes and prices automatically.

## D013 — Test visible TradingView Chain overlay

Status: in progress.

Build a browser-extension probe that reads only visible Options Chain text and confirms whether it can see LTP and strikes. This is a feasibility test before committing to extension architecture.
