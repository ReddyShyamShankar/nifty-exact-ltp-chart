# NIFTY Chain LTP Overlay — v0.14.0

Same-window TradingView extension with one-click Pine-input synchronization.

It reads local NIFTY data bridge every two seconds. Bridge requests Upstox option-chain data for selected monthly expiry.

## Daily workflow

1. Complete `bin/nifty-bridge setup` once. The bridge then runs automatically.
2. Open normal logged-in Chrome and TradingView NIFTY chart.
3. Keep `NIFTY Monthly LTP Ladder` indicator on chart.
4. Click NIFTY extension icon, choose expiry, then click **SYNC PINE INPUTS**.

Extension automatically opens indicator Settings, calculates nearest 100-point ATM from live NIFTY spot, fills all ten exact option symbols, and presses **Ok**. No manual center entry or second Chrome profile is needed.

Keyboard shortcut `Control+Shift+Y` opens extension popup on macOS.

## Result

Pine receives Call and Put contracts for five strikes:

- Strike -2
- Strike -1
- Center
- Strike +1
- Strike +2

Spacing is 100 points. At spot 23,767.45, sync writes center 23,800 and strikes 23,600 / 23,700 / 23,800 / 23,900 / 24,000.

TradingView then supplies live LTP values to Pine. Chart labels show:

```text
C Call-LTP | P Put-LTP
```

Labels stay beside TradingView's right price scale. ATM stays on its exact price. When weekly or monthly chart scaling compresses 100-point strikes, other rows spread apart to prevent overlap and use small connector brackets back to exact strike coordinates. Placement retries while TradingView finishes timeframe re-scaling.

## Security and limits

- Extension does not store Upstox token.
- Token remains in local bridge process only.
- Chrome debugger permission is attached only during sync and detached afterward.
- TradingView UI changes can require selector maintenance.
- Expiry sync explicitly opens TradingView's expiry menu and selects the date chosen in the extension.
- Sync recalculates center from live spot and updates contracts; it does not place orders.
