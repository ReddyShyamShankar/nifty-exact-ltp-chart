# NIFTY automatic-data bridge

Local bridge between Upstox market data and chart extension. It requests NIFTY's `current_month` option chain, so monthly expiry changes automatically without contract selection or TradingView Options clicks.

It reads `UPSTOX_ANALYTICS_TOKEN` only from current terminal process. Token is never written into this project, extension, or browser. Upstox Analytics Token is read-only and valid for one year.

Endpoint:

```text
GET http://127.0.0.1:8787/api/nifty-chain?expiry=current_month
```

Supported expiry modes: `current_month`, `next_month`, `far_month`.
