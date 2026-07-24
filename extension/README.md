# NIFTY Chain LTP Overlay — v0.5

Automatic-data prototype.

It first reads local NIFTY data bridge every two seconds. Bridge requests Upstox `current_month` option chain, which rolls monthly expiry automatically. Chart dropdown switches to `next_month` or `far_month` without opening TradingView Options. It does not scan TradingView, read private network traffic, account information, browser cookies, or hidden application state.

## What success means

With bridge connected, overlay shows:

```text
Call LTP C | Strike | P Put LTP
```

It selects five 50-point rows around spot and highlights ATM. Labels sit inside chart, on right edge, in price-ladder style.

## What failure means

If local bridge is not configured, it falls back to visible Options Chain data only when Chain is open. This fallback is temporary visual testing only.

## Important limitation

True automatic mode depends on approved broker market data. The extension does not store broker credentials.
