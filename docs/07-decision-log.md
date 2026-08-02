# Decision Log

> **Universal product rule:** Build from instrument metadata, selected expiry, available option contracts, and TradingView axis evidence so same foundation can support any optionable pair, instrument, or index worldwide. NIFTY is current validation market, not core product rule.

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

## D006 — NIFTY monthly validation adapter

Status: accepted.

Current connected validation uses NIFTY monthly options. Core strategy, chart, and membership logic remains instrument-independent so later adapters supply their own identity, expiry, contract-step, currency, and lot-size evidence.

## D007 — Last traded price first

Status: accepted.

First release uses last traded price. Bid/ask and midpoint modes can come later.

## D008 — TradingView-axis-driven strike membership

Status: accepted.

Ladder intersects real option-contract strikes with numerical price labels visible on TradingView right axis. It has no fixed strike count and no timeframe-to-interval mapping. Zoom changes visible membership through changed axis evidence.

## D009 — Alerts required, information-only

Status: accepted.

Alerts are part of the product, but only report user-selected market events. They never recommend a trade or place an order.

## D010 — Phase 1 prototype uses manual option symbols

Status: implemented.

The first Pine prototype accepts manually entered call/put symbols for each ladder slot.

Reason: validate chart readability and label behavior before depending on exchange-specific automatic symbol construction.

## D011 — Minimal exact-axis right-edge LTP ladder

Status: implemented.

Ladder shows every axis-aligned real contract in one right-edge column using `C LTP | P LTP | STRIKE`. Nearest available real ATM contract uses theme-specific highlight styling. Historical strike lines and extra panels remain removed.

Reason: match TradingView price-axis behavior and user’s option-chain mental model without covering candles or controlling chart zoom.

## D012 — Manual contract selection rejected

Status: accepted.

Any workflow requiring user to maintain option symbols manually is rejected. Connected market adapter must discover contracts and prices for selected instrument and exact expiry.

## D013 — Test visible TradingView Chain overlay

Status: in progress.

Use NIFTY visible-chain evidence to validate browser-extension data access, LTP capture, contract discovery, and exact-axis placement. Validation market must not leak NIFTY-specific rules into core membership or strategy logic.

## D014 — Premium history owns its date/time scale

Status: accepted and implemented.

Premium-history pane maps timestamps containing real Call or Put premiums onto its own labelled axis. Underlying-only dates cannot widen that axis. TradingView timeframe selects candle interval, but TradingView canvas paint never gates or positions premium history.

Reason: live Chrome testing proved TradingView time-axis canvas interception can be absent after reload and stale after timeframe changes. Independent scale removes freeze risk, stale-coordinate risk, and `TIME AXIS UNAVAILABLE` dead state.

## D015 — TradingView crosshair is master; independent premium axis is fallback

Status: accepted and implemented.

While premium history is open, stable TradingView time-axis evidence controls pane's visible dates, horizontal plot bounds, and mirrored crosshair position. Exact nearby premium candle is shown for that timestamp; missing candle reports `GAP` instead of borrowing another value. If TradingView evidence is absent or unstable, D014 independent contract-life axis remains available and never freezes pane.

Reason: user's decision task requires candle and premium evidence at one shared point in time, while prior live testing proved synchronization cannot be allowed to become a loading dependency. On-demand observation provides synchronization without restoring debugger access, Auto-fit control, synthetic interaction, or page-wide idle overhead.

Supersedes D014 only as preferred active view; preserves D014 as reliability fallback.

## D016 — Premium history uses Lines only

Status: accepted and implemented.

Remove Split and Focus renderers. Keep Lines with both Call and Put histories visible. CALL and PUT controls select solid-line emphasis while other side stays dashed.

Reason: live visual trial approved Lines and rejected other two modes. One renderer removes unnecessary controls, code, and testing surface without removing Call/Put comparison.
