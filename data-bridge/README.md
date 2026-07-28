# NIFTY read-only data bridge

Local bridge between Zerodha positions/trades, Upstox NIFTY market data, and the chart extension. One explicit **REFRESH ALL** coordinates at most one positions request, one current-day trades request, and one option-chain request. It never polls broker account data and never retries a failed refresh automatically.

Upstox Analytics Token, Zerodha API secret, and Zerodha daily access token stay in the local process or macOS Keychain. Secret and token fields are never returned to the extension.

## Setup

Install or update the local bridge:

```bash
bin/nifty-bridge setup
```

Create a Zerodha developer app with this exact redirect URL:

```text
http://127.0.0.1:8787/api/zerodha/callback
```

Store the Zerodha API key and API secret in macOS Keychain:

```bash
bin/nifty-bridge zerodha-setup
```

The setup command uses hidden terminal input and does not print credentials.

Health check:

```bash
bin/nifty-bridge status
```

Endpoint:

```text
GET http://127.0.0.1:8787/api/health?live=1
GET http://127.0.0.1:8787/api/zerodha/status
GET http://127.0.0.1:8787/api/zerodha/login-url
GET http://127.0.0.1:8787/api/seller-refresh?expiry=YYYY-MM-DD
```

## Daily workflow

In the extension, press **CONNECT ZERODHA** and complete the official Zerodha login. Then press **REFRESH ALL** once. Zerodha daily access expires at 06:00 Asia/Kolkata; an expired session fails closed and requires reconnecting. Popup open, timeframe, zoom, and pan never call the positions, trades, or chain endpoints.

Historical fills do not come from the current-day trades endpoint. The extension stores current-day trades as immutable evidence, deduplicates them against the one-time Zerodha tradebook CSV import, and requires explicit strategy ownership review. Manually allocate fills and whole signed lots to one NIFTY strategy with the same expiry, then explicitly accept the snapshot before chart publication. **HISTORY GAP** evidence withholds the affected whole-trade map.

The coordinated refresh response contains the only chain snapshot used for that refresh. The extension persists those validated rows for the chart ladder, so content placement does not issue another option-chain request. Accepted risk expires locally at the earlier of 15 minutes after the broker timestamp or the Zerodha session deadline; that automatic hide makes no bridge request.

## Read-only guarantee

The Zerodha client exposes only `GET /portfolio/positions` and `GET /trades`. No-order placement, modification, cancellation, conversion, or exit endpoint exists. The bridge filters output to NFO NIFTY options matching the requested expiry and returns no API secret or access token.

Supported relative modes: `current_week`, `next_week`, `far_week`, `current_month`, `next_month`, `far_month`. Exact `YYYY-MM-DD` dates returned by `/api/nifty-expiries` are also supported.
