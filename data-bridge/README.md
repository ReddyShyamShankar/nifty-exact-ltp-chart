# NIFTY automatic-data bridge

Local bridge between Upstox market data and chart extension. Manual extension refresh requests NIFTY option-chain data. Concurrent and near-duplicate requests share one Upstox response.

It reads `UPSTOX_ANALYTICS_TOKEN` from the current process when present. Normal Mac setup stores the read-only one-year Analytics Token in macOS Keychain and installs a LaunchAgent that keeps the bridge alive. Token is never written into this project or browser.

One-time setup:

```bash
bin/nifty-bridge setup
```

Health check:

```bash
bin/nifty-bridge status
```

Endpoint:

```text
GET http://127.0.0.1:8787/api/health?live=1
GET http://127.0.0.1:8787/api/nifty-chain?expiry=current_month
```

The root URL returns a small service-status JSON response. The extension polls the chain endpoint every two seconds while its exact-price chart is open. Each row also includes TradingView's NSE option ticker format, for browser automation that updates Pine `input.symbol` fields.

Supported relative modes: `current_week`, `next_week`, `far_week`, `current_month`, `next_month`, `far_month`. Exact `YYYY-MM-DD` dates returned by `/api/nifty-expiries` are also supported.
