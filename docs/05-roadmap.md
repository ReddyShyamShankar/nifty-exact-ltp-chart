# Roadmap

## Phase 0 — product alignment

- Lock NIFTY-only market scope.
- Lock monthly-only expiry scope.
- Lock last traded price as first-release premium source.
- Confirm whether fixed manual symbols are acceptable for prototype.
- Compare strike-count presets for chart clutter.
- Approve first chart mockup.

Exit: one agreed visual target and known data assumptions.

## Phase 1 — strike ladder prototype

- Pine v6 indicator shell.
- Underlying chart context.
- Configurable expiry and strike inputs.
- Five-strike ladder.
- Call/put labels.
- Data-status display.

Exit: user can read strikes and premiums without opening another window.

## Phase 2 — premium behavior

- Premium change and percentage.
- ATM highlighting.
- ITM/OTM classification.
- Label collision handling.
- Timeframe testing.

Exit: user can see how option pricing is changing rapidly.

## Phase 2A — alerts

- Alert when selected strike is reached.
- Alert on premium threshold.
- Alert on premium percentage change.
- Include strike, call/put, monthly expiry, last price, and timestamp.
- Confirm no recommendation language.

Exit: user receives useful market-information alerts without leaving TradingView.

## Phase 3 — single strategy

- Leg input model.
- Entry/current premium.
- Net credit/debit.
- Estimated live P&L.
- Break-even lines.

Exit: one straddle or spread can be reconstructed on chart.

## Phase 4 — multiple strategies

- Strategy presets.
- Multiple colors.
- Compare strategy states.
- Risk summary.

Exit: chart supports the user’s real workflow from screenshots.

## Phase 5 — data quality and expansion

- Better symbol discovery.
- More expiries.
- Broker/data-source reconciliation.
- Alerts.
- Optional companion interface if Pine limits block chain discovery.
- US-market support after NIFTY workflow is stable.

## Verification per phase

- Visual test on 1m, 5m, 15m, 1h, daily.
- Current and historical bars.
- Missing-data test.
- Expiry rollover test.
- Manual calculation comparison.
- Performance and request-count check.
