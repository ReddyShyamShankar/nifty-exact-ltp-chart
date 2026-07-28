# Seller Safety Map — Approved Design

Date: 2026-07-28
Status: implemented and final-review hardened in version 0.4.0

## Goal

Turn the existing NIFTY chart ladder into a chart-first risk tool for an options seller. Import real Zerodha positions instead of requiring strategy re-entry, combine them with existing Upstox option data, and show both current open-position risk and whole-trade risk directly on TradingView.

The product explains what changed after an adjustment. It does not recommend, place, modify, or exit trades.

## User and primary job

The user trades NIFTY options through Zerodha and reads TradingView charts as the primary decision surface. Option buying is intended for protection. Current friction comes from:

- manually rebuilding live positions in a separate strategy tool
- manually drawing breakeven levels on TradingView
- seeing breakevens move after an adjustment without understanding why
- confusing premium collection with protection
- switching among Zerodha, an option-chain tool, a payoff tool, and TradingView

The primary job is:

> Press one Refresh button, import real positions, and see truthful risk boundaries and a plain explanation on the chart workflow already in use.

## Preserve current ladder behavior

Seller Safety Map extends the independent `NIFTY Axis LTP Ladder`. Existing exact-axis behavior remains:

- thirteen exact Call / Put / Strike rows on TradingView
- selected-expiry Upstox LTP data
- exact right-axis placement through supported timeframe, zoom, pan, and inverse-scale changes
- one manual option-data refresh
- no option-chain requests during timeframe changes
- NIFTY-only activation

The original Pine-sync extension v0.14.0 remains disabled and untouched as backup.

## Version-one scope

- Broker: Zerodha only.
- Underlying: NIFTY only.
- Position source: Zerodha Kite Connect Personal account APIs.
- Market-data source: existing Upstox bridge and option-chain response.
- Refresh model: one explicit **REFRESH ALL** press.
- Strategy ownership: manual groups with lot-level allocation.
- History source: staged Zerodha tradebook CSV evidence plus read-only current-day trade capture and immutable daily checkpoints.
- Chart output: current-risk and whole-trade breakevens, profit/loss bands, and compact risk states.
- Popup output: broker status, risk summary, explanation, position legs, and timeline.
- Storage: local machine only.
- Execution: read-only; no order placement.

## Final hardening invariants

- Every canonical option identity contains the exact `YYYY-MM-DD` expiry. Weekly contracts on different dates never share an identity, and old month-only persisted identities fail closed for review.
- CSV import only stages source evidence. It never assigns rows to the selected strategy and never infers historical coverage through the import date or today.
- Every fill requires an explicit quantity disposition. A fill may be split across same-expiry strategies; any remainder must be explicitly left unassigned.
- Same-expiry closed rolls, same-day round trips, opened/closed adjustments, and protection fills remain reviewable even when their contracts are no longer open.
- Whole-trade publication requires operator-confirmed coverage bounds plus explicit checkpoint identities. Successful zero-trade days are immutable checkpoints; missing intervals become `HISTORY GAP` and are never inferred.
- Accepted evidence and chart views are stored per strategy. The always-visible strategy selector restores same- or different-expiry views without a refresh while current stale, session, review, and refresh-failure gates remain active.
- Any failed **REFRESH ALL** result immediately publishes non-renderable `REFRESH_FAILED` chart state. The popup keeps last accepted evidence, but the chart receives no 15-minute grace period after a known failure.
- Accepted normalized positions, lot allocations, owned fill quantities, evidence versions, and checkpoints are immutable diff inputs for factual “why moved” explanations.

## Core terminology

### Current open-position risk

Expiry payoff produced only by currently open, assigned Zerodha lots and their open-position entry economics. It answers:

> If only my currently open legs remain and expire, where does this position profit or lose?

Current-risk lines use solid styling.

### Whole-trade risk

Expiry payoff of current open legs plus realized cash flows, booked gains or losses, and available charges from the strategy's full history. It answers:

> Including earlier entries, exits, and adjustments, where does the complete trade journey profit or lose?

Whole-trade lines use dashed styling.

### Live P&L

Zerodha mark-to-market P&L at latest imported position state. Live P&L is not called a breakeven and is not substituted for expiry payoff.

### Strategy group

A user-owned collection of signed NIFTY option lots for one expiry. Version one does not combine different underlyings or expiries in one strategy group.

## Daily workflow

### Morning authorization

1. User completes one official Zerodha login authorization.
2. Local bridge exchanges the request token on the backend.
3. Zerodha access token remains local and expires at 6:00 AM the next day under Zerodha's official retail authentication rules.
4. Popup shows `ZERODHA CONNECTED · TODAY` or `RECONNECT ZERODHA`.

No credential is exposed to TradingView, extension page scripts, chat, logs, or cloud storage. Zerodha retail authentication has no standard long-lived refresh token, so daily authorization is an explicit product constraint.

### Refresh All

One **REFRESH ALL** press performs one coordinated refresh:

1. Validate Zerodha session.
2. Fetch Zerodha net positions once.
3. Fetch Zerodha current-day executed trades once, read-only.
4. Fetch selected-expiry Upstox option chain once.
5. Compare broker quantities with accepted strategy allocations.
6. Require review for new, removed, or changed quantities.
7. Recalculate accepted current-risk and whole-trade payoff maps.
8. Compare current accepted snapshot with prior accepted snapshot.
9. Generate deterministic “Why did it move?” facts.
10. Update popup and TradingView overlay together.

Opening popup, changing TradingView timeframe, zooming, or panning creates no broker or option-chain request.

## Manual strategy grouping

Zerodha reports net positions by contract, not strategy intent. Seller Safety Map never guesses which strategy owns a leg.

### Allocation rules

- User assigns whole lots, not arbitrary contract quantities.
- Same contract may be split among multiple strategies by lot count.
- Sum of allocated signed lots for a contract must equal accepted Zerodha net lots before all account positions are considered reconciled.
- Allocation cannot reverse broker direction. Short broker lots cannot be assigned as long lots, or vice versa.
- Strategy group contains one underlying and one expiry.
- Unallocated quantity remains in **Review changes**.
- Closed strategy retains timeline and imported history after net assigned quantity reaches zero.

### Change-review rule

New or changed Zerodha quantities never silently alter an existing strategy. They enter **Review changes** and require lot allocation.

While a strategy has a broker/allocation mismatch:

- hide affected strategy breakeven lines and profit/loss bands
- show `REVIEW POSITION CHANGES`
- preserve prior accepted snapshot in local history
- do not label prior risk map as current

This prevents a stale strategy map from appearing valid after a real trade changes account risk.

## Historical tradebook import

Whole-trade calculations for positions opened before installation require one-time Zerodha tradebook CSV import.

### Import behavior

- CSV stays on local machine.
- Import parses NIFTY option fills, trade identifiers, timestamps, direction, quantity, price, expiry, option type, and strike when present.
- Duplicate trades are ignored by stable trade identifier and validated content fingerprint.
- Imported trades are never automatically assigned. Matching contract or selected strategy is not ownership evidence.
- Product filters only rows proven outside the selected account, NIFTY underlying, exchange, or exact expiry. Ambiguous rows reject the batch.
- User confirms an exact positive quantity for each strategy assignment or unassigned disposition. The same fill can be split across strategies until its entire quantity has an explicit disposition.
- Reviewed same-expiry contracts can be closed at import time; open-position membership is not required for historical ownership.
- User confirms exact coverage bounds and referenced daily checkpoints after quantity review. Import never extends coverage to today by itself.
- Imported history becomes immutable source evidence; corrections create an audit event instead of rewriting original rows silently.
- After import, read-only current-day Zerodha trades captured by Refresh extend timeline with exact executed quantities and prices.
- A position change first seen after its trade date cannot be reconstructed truthfully from a net-position snapshot. Mark that interval `HISTORY GAP` and require an updated tradebook CSV before showing whole-trade risk again.

If brokerage, taxes, and charges are not present in imported source, popup and chart state `EXCLUDING CHARGES`. Product never fabricates charges.

## Risk calculation model

Risk engine uses signed cash flows and piecewise-linear expiry intrinsic value.

For an underlying expiry price `S`:

- Call intrinsic value: `max(S - strike, 0)`
- Put intrinsic value: `max(strike - S, 0)`
- Buy cash flow is negative.
- Sell cash flow is positive.
- Open expiry settlement applies signed quantity, lot size, and intrinsic value.
- Whole-trade payoff adds all assigned historical cash flows and known charges.

### Breakevens and bands

- Calculate every zero crossing of payoff across strike intervals.
- Common two-root structures use `LOWER BE` and `UPPER BE` labels.
- Structures with more than two roots use `BE 1`, `BE 2`, and so on.
- Shade every profitable interval, not only one assumed central range.
- Shade losing outer or inner intervals with restrained danger treatment.
- Detect bounded or unbounded right tail from final payoff slope.
- Evaluate downside at valid non-negative underlying prices; do not describe downside as mathematically below zero.
- Max profit and max loss are expiry values and are separately labeled from live P&L.

### Current versus whole-trade calculations

Current open-position map uses accepted open lots and their current entry basis. A contract wholly assigned to one strategy may use Zerodha's broker-reported net average price. If the same contract is split across strategies, exact open-fill allocation is required; the product never silently prorates one broker average across groups.

Whole-trade map uses:

- assigned imported tradebook fills
- locally tracked accepted adjustment events
- realized cash flows
- currently open expiry settlement
- known charges

Whole-trade accounting uses one normalized fill ledger. Open-leg premiums already present as fills are not added again from the broker position average; current open legs contribute only their future expiry settlement. This prevents double-counting premium.

If exact entry allocation is unavailable, affected solid current-risk output stays hidden with `ENTRY HISTORY INCOMPLETE`. If earlier realized history is incomplete but current entry allocation is valid, solid current-risk map may display while dashed whole-trade map stays hidden with `HISTORY INCOMPLETE`.

## User-example acceptance fixture

Example open position:

- Short 2 lots NIFTY 24,100 Call at 358.80
- Short 1 lot NIFTY 24,100 Put at 315.45
- Short 1 lot NIFTY 22,500 Put at 77.80
- NIFTY lot size 65
- Same expiry

Before charges, total open credit is:

`2 × 358.80 + 315.45 + 77.80 = 1,110.85 points`

Expected current open-position outputs before charges:

- upper breakeven: `24,100 + 1,110.85 / 2 = 24,655.425`
- lower breakeven: `24,100 - 1,110.85 = 22,989.15`
- maximum profit at 24,100: `1,110.85 × 65 = ₹72,205.25`
- upside maximum loss: unlimited because two short Calls create negative right-tail slope

Platform values may differ by documented charges and rounding. Test must explain that short 22,500 Put adds premium and downside exposure; it is not protection. Below 22,500, both short Puts lose as NIFTY falls.

Whole-trade example outputs depend on imported fills and charges and must never use remembered or mockup numbers as source data.

## “Why did it move?” engine

Explanation compares two accepted strategy snapshots. It reports facts, not advice.

Supported facts include:

- net premium or debit change
- changed lot count by leg
- changed upside or downside tail slope
- each breakeven movement in points
- profit-band expansion or contraction
- max-profit change
- max-loss change or newly unbounded risk
- bought protection added or removed
- short option added, explicitly described as added exposure rather than protection

When multiple legs change together, show combined result first and per-leg contributions afterward. Explanations use deterministic payoff differences; no generative model decides financial calculations.

## TradingView chart design

Chart remains primary visual surface.

### Visible chart elements

- Existing thirteen-row exact option ladder.
- Solid mint current open-position breakeven lines.
- Dashed graphite whole-trade breakeven lines.
- Restrained translucent profit and loss bands.
- Compact labels attached to TradingView right-axis coordinates.
- Small stale, history-incomplete, or review-required state when needed.

### Chart exclusions

- No large explanation panel covering candles.
- No position table on chart.
- No full option chain on chart beyond existing ladder.
- No order controls.
- No automatic strategy recommendation.

Popup strategy selector determines which strategy map appears. Selected strategy expiry also drives ladder expiry. When no strategy is selected, existing expiry selection remains available for ladder-only use.

The selector stays visible outside review state. Each strategy keeps its own accepted evidence and chart view; switching does not destroy another strategy or issue a refresh.

## Extension popup design

Popup keeps approved Trading Desk Lite tokens and immediate Refresh placement.

Top-to-bottom hierarchy:

1. Brand and **REFRESH ALL**.
2. Zerodha daily connection status.
3. NIFTY spot, selected strategy, expiry, DTE, and open-leg count.
4. Current open-risk breakevens and whole-trade breakevens.
5. Live P&L, max profit, and max loss.
6. “Why did it move?” explanation.
7. High-priority risk warning.
8. Collapsed **POSITION LEGS**.
9. Collapsed **WHOLE-TRADE TIMELINE**.
10. Data-source and freshness footer.

Full option-chain table is removed from popup because existing chart ladder owns that job.

## Components and boundaries

### Zerodha authorization adapter

Owns official login redirect, backend token exchange, daily expiry state, and local credential storage. Exposes only connected/disconnected status and read-only position retrieval to risk workflow.

### Zerodha position adapter

Normalizes net option positions into signed lots with instrument, expiry, strike, type, average price, last price, and broker P&L. It does not infer strategy ownership.

### Zerodha trade adapter

Fetches and normalizes read-only current-day executed trades once per Refresh. It supplies exact fill evidence for local timeline continuation and never calls an order placement, modification, cancellation, or exit endpoint.

### Tradebook importer

Parses, validates, deduplicates, and preserves historical source rows. It does not calculate strategy risk or silently assign trades.

### Strategy allocation ledger

Stores manual lot ownership, strategy identity, imported fill assignments, accepted snapshots, and audit events. Ledger remains local and append-oriented.

### Risk engine

Pure deterministic calculation unit. Receives one reconciled strategy ledger and returns payoff segments, all breakevens, profit/loss bands, max profit/loss, and tail-risk states.

### Change explainer

Compares two risk-engine inputs and outputs deterministic plain-language facts. It never fetches data or performs financial calculations independently.

### Refresh coordinator

Enforces one user action, at most one Zerodha positions request, one Zerodha current-day trades request, and one Upstox chain request. Rejects stale responses and publishes one coherent result.

### TradingView risk renderer

Uses existing exact price-to-y map. Draws risk lines and bands without changing option membership or chain-refresh behavior.

### Popup controller

Owns connection state, strategy selection, disclosures, warning priority, and Refresh interaction. It does not calculate payoff.

## Data flow

```text
Morning Zerodha authorization
             |
             v
Local bridge credential state

User presses REFRESH ALL
             |
             v
Refresh coordinator
   |                 |                    |
   v                 v                    v
Zerodha positions  Zerodha day trades   Upstox chain/LTP
   |                 |                    |
   +-----------------+---------+----------+
              v
Strategy allocation reconciliation
              |
      accepted and complete?
         |             |
        yes            no
         |             |
         v             v
Risk engine       REVIEW CHANGES
         |
         v
Change explainer + local timeline
         |
         +-----------------------+
         |                       |
         v                       v
Extension popup         TradingView risk renderer
```

## Failure behavior

### Zerodha session expired

- Show **RECONNECT ZERODHA**.
- Do not call positions endpoint repeatedly.
- Keep last accepted map only with prominent `STALE · <timestamp>` state.
- Immediately publish non-renderable `STALE · REFRESH FAILED` to the chart; a known failure has no 15-minute grace period.
- Never report Refresh success.

### Zerodha positions unavailable

- Keep last accepted map marked stale.
- Preserve local strategy ledger.
- Immediately hide chart risk with `REFRESH_FAILED`.
- Do not update timeline.

### Zerodha current-day trades unavailable

- Do not record changed broker quantities as exact historical fills.
- Current-risk output may continue only when entry basis remains complete and reconciled.
- Hide whole-trade output for affected strategies with `HISTORY GAP` until trade evidence is imported or captured.

### Upstox request fails or rate-limits

- Keep prior option-ladder numbers.
- Keep accepted entry-based expiry map when position state is unchanged.
- Mark live P&L/quote-dependent fields stale and immediately hide all chart risk layers.
- Make no automatic retry storm.

### Broker quantities differ from allocations

- Hide affected strategy risk lines and bands.
- Show **REVIEW POSITION CHANGES**.
- Do not guess allocation.

### Invalid or duplicate tradebook CSV

- Reject malformed rows with row-level reason.
- Ignore proven duplicates.
- Commit no partial strategy history until user confirms valid import summary.

### Incomplete whole-trade history

- Show solid current-risk map when current positions reconcile.
- Hide dashed whole-trade map.
- Show `HISTORY INCOMPLETE`.

### TradingView axis unavailable

- Hide chart lines and bands.
- Keep popup calculations visible with placement warning.
- Reuse existing bounded placement retry; never guess y-coordinates.

## Security and privacy

- Zerodha integration stays read-only in version one.
- No order placement, modification, cancellation, or exit endpoint is called.
- Current-day trade retrieval is read-only and exists only to preserve exact fill history.
- Zerodha API secret and daily access token stay in local backend credential storage.
- Upstox token stays in local bridge process.
- Browser extension receives normalized data, never broker secrets.
- Tradebook CSV and strategy ledger never leave local machine.
- Logs redact tokens, account identifiers, and imported personal fields.
- No credential is pasted into chat.

## Verification

### Unit tests

- Current-open payoff for long and short Calls and Puts.
- User-example breakevens and max profit before charges.
- Unequal lot counts change payoff slopes correctly.
- Bought lower Put caps downside exposure.
- Short lower Put adds downside exposure and is never described as protection.
- Zero, one, two, and multiple breakeven roots.
- Multiple separated profit bands.
- Bounded and unbounded right-tail detection.
- Whole-trade realized cash flows shift breakevens correctly.
- Known charges affect whole-trade payoff once.
- Missing charges produce `EXCLUDING CHARGES`.
- Tradebook duplicate detection.
- Lot allocation cannot exceed or reverse Zerodha net position.
- Cross-expiry allocation is rejected.
- Incomplete history suppresses whole-trade output.
- Open-fill premiums are counted once when both positions and trade evidence exist.
- A same-contract split across strategies without exact fill allocation suppresses affected current-risk output.
- A position change discovered after its trade date creates `HISTORY GAP` instead of inferred fills.

### Contract and integration tests

- One **REFRESH ALL** sends at most one Zerodha positions request, one Zerodha current-day trades request, and one Upstox chain request.
- Popup open, timeframe change, zoom, and pan send no data request.
- Expired Zerodha session produces reconnect state without repeated calls.
- Upstox rate-limit response preserves last values and creates no automatic retry loop.
- Changed broker quantity creates review state and hides affected risk map.
- Accepted allocation creates one append-only timeline event.
- Stale asynchronous response cannot overwrite newer accepted snapshot.
- Risk engine remains independent from DOM and API clients.
- Extension never receives Zerodha API secret or access token.

### Browser and visual tests

- Solid current and dashed whole-trade lines match exact TradingView price coordinates.
- Profit/loss bands follow normal and inverted linear scales.
- Timeframe, zoom, and pan reposition lines without changing calculations.
- Existing thirteen option rows remain usable beside risk lines.
- Popup opens with **REFRESH ALL** immediately accessible.
- Popup fits 420-pixel Chrome extension width without scrolling before primary risk summary.
- Review-required and stale states cannot be mistaken for live state.
- Large explanation panels never cover chart candles.

### Manual acceptance

1. Authorize Zerodha once in morning.
2. Import historical Zerodha tradebook CSV.
3. Allocate user-example lots into strategy groups.
4. Press **REFRESH ALL**.
5. Confirm solid current-risk values match deterministic fixture before charges.
6. Confirm dashed whole-trade values match imported history.
7. Confirm chart lines match popup values and exact TradingView coordinates.
8. Add or remove one real Zerodha leg.
9. Press **REFRESH ALL**.
10. Confirm **REVIEW POSITION CHANGES** appears before any recalculation.
11. Allocate changed lot and confirm explanation names breakeven movement and risk change.

## Explicit exclusions

- No order placement or automated execution.
- No automatic adjustment, hedge, or trade recommendation.
- No background polling or periodic option-chain refresh.
- No full option chain inside extension popup.
- No full Greeks dashboard in version one.
- No broker other than Zerodha.
- No underlying other than NIFTY.
- No cross-expiry strategy groups.
- No cloud account, cloud sync, or remote tradebook upload.
- No automatic strategy grouping or historical ownership guessing.
- No fabricated charges, prices, fills, or breakevens.

## Deferred phase-two ideas

- Read-only “What if?” adjustment coach.
- Greeks and margin impact comparison.
- Breakeven proximity alerts.
- Bought-protection scenario comparison.
- Additional underlyings and brokers.
- Cross-expiry strategy groups.

## Rejected approaches

### Full seller cockpit first

Rejected because it duplicates existing tools, increases learning burden, and moves focus away from user's chart strength.

### Automatic strategy grouping

Rejected because Zerodha nets contracts and cannot reveal strategy intent. Wrong grouping creates wrong risk boundaries.

### Position-only breakeven presented as whole trade

Rejected because closed adjustments and realized P&L can materially move whole-trade breakevens.

### Automatic background refresh

Rejected because user requires manual option-number updates and prior request storms produced rate-limit failures.

### Broker order execution

Rejected for version one because primary need is understanding and monitoring risk, not automated action.

## Acceptance criteria

Version one succeeds when one daily Zerodha authorization and one **REFRESH ALL** press can import real NIFTY positions, reconcile manual lot-level strategy ownership, reuse Upstox option data, and render truthful current and whole-trade risk on TradingView without manual leg re-entry.

Current and whole-trade calculations must stay visually distinct. Changed positions must require review before recalculation. Incomplete data must be labeled or hidden, never guessed. User-example fixture must reproduce expected current breakevens and explain why an extra short Call narrows upside room while a short lower Put adds premium and downside exposure. No order endpoint, automatic recommendation, background request loop, cloud upload, or duplicate popup option chain may exist.

## Primary references

- Zerodha positions API: https://kite.trade/docs/connect/v3/portfolio/
- Zerodha orders and current-day trades API: https://kite.trade/docs/connect/v3/orders/
- Zerodha authentication: https://www.kite.trade/docs/connect/v3/user/
- Zerodha market quotes and instruments: https://kite.trade/docs/connect/v3/market-quotes/
- Upstox Put/Call option chain: https://upstox.com/developer/api-documentation/get-pc-option-chain/
- Options Industry Council short straddle: https://www.optionseducation.org/strategies/all-strategies/short-straddle
