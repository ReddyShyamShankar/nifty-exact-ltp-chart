# NIFTY Pine LTP Ladder

Live NIFTY Call and Put premiums inside existing TradingView Pine indicator.

## Working flow

```text
Upstox option-chain data
  -> local data bridge
  -> Chrome extension
  -> TradingView Pine Settings
  -> ten exact option symbols
  -> five live Call | Put labels on chart
```

Extension works in same normal logged-in Chrome window. User selects expiry and presses **SYNC PINE INPUTS** once. Extension calculates nearest 100-point ATM from live NIFTY spot, updates center and interval, selects same expiry inside TradingView, fills five Call and five Put contracts, and presses **Ok**.

One-time Mac setup:

```bash
bin/nifty-bridge setup
```

The token is saved in macOS Keychain. A LaunchAgent keeps the local bridge running after login and restarts it if it exits. Daily terminal startup is not required.

See [extension workflow](extension/README.md) and [data bridge setup](data-bridge/README.md).

## V1

- NIFTY only
- Five strikes, 100 points apart, around automatically calculated center
- Monthly expiry selected in extension
- Real Call and Put LTP from TradingView after contract sync
- No order placement
