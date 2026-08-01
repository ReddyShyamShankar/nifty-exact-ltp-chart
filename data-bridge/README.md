# NIFTY read-only data bridge

Local bridge between Zerodha positions/trades, Upstox NIFTY market data, and the chart extension. One explicit **REFRESH ALL** coordinates at most one positions request, one current-day trades request, and one option-chain request. It never polls broker account data and never retries a failed refresh automatically.

Upstox Analytics Token, Zerodha API secret, and Zerodha daily access token stay in the local process or macOS Keychain. Secret and token fields are never returned to the extension.

## Setup

After loading the unpacked extension, copy its ID from `chrome://extensions` and persist its exact origin:

```bash
bin/nifty-bridge extension-origin chrome-extension://<32-lowercase-id>
```

The command validates exactly `chrome-extension://` plus 32 lowercase `a`–`p` characters, stores it in `~/.config/nifty-options-bridge/config.json` with mode `0600`, and reinstalls the LaunchAgent with `NIFTY_EXTENSION_ORIGIN`. `NIFTY_EXTENSION_ORIGIN` remains an explicit environment override. Existing installs may use the tested packaged default ID, but a new Chrome profile or unpacked-extension path must run this command. Account and public API responses use exact-origin CORS; there is no wildcard CORS.

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
GET http://127.0.0.1:8787/api/option-history?expiry=YYYY-MM-DD&strike=24400&interval=4h&from=YYYY-MM-DD&to=YYYY-MM-DD
```

`/api/option-history` is read-only exact-contract history. Bridge resolves Call and Put provider keys from selected expiry chain, then coordinates Call, Put, and underlying candles through one deduplicated cache. Long minute and hourly ranges are split into provider-safe date chunks inside that single user-requested load. Missing candles remain gaps. Failed history requests do not retry automatically.

## Daily workflow

In the extension, press **CONNECT ZERODHA** and complete the official Zerodha login. Then press **REFRESH ALL** once. Zerodha daily access expires at 06:00 Asia/Kolkata; an expired session fails closed and requires reconnecting. Popup open, timeframe, zoom, and pan never call the positions, trades, or chain endpoints.

Historical fills do not come from the current-day trades endpoint. A Zerodha tradebook CSV is staged first and does not assign ownership or coverage. Every fill needs an explicit quantity disposition: assign part or all to a same-expiry strategy, split one fill across strategies, or explicitly leave the remainder unassigned. Closed same-expiry rolls and round trips can be reviewed even when no position remains open. Then confirm exact operator-reviewed coverage bounds. The bridge stores immutable successful daily checkpoints even when `trades=[]`; only contiguous checkpoints extend coverage, while a missed date becomes **HISTORY GAP**.

The extension stores later current-day trades as immutable evidence and deduplicates repeated refreshes. Manually allocate whole signed position lots, resolve every fill quantity, confirm coverage, and explicitly accept the snapshot before chart publication. Whole-trade risk remains withheld when coverage or quantity ownership is incomplete.

The coordinated refresh response contains the only chain snapshot used for that refresh. The extension persists those validated rows for the chart ladder, so content placement does not issue another option-chain request. Any failed manual refresh—including rate limit, expired session, positions, trades, chain, or malformed response—immediately publishes a non-renderable **STALE · REFRESH FAILED** state while retaining the last accepted popup evidence. A successful accepted view also expires locally at the earlier of 15 minutes after its broker timestamp or the Zerodha session deadline; either hide makes no bridge request.

## Read-only guarantee

The Zerodha client exposes only `GET /portfolio/positions` and `GET /trades`. No-order placement, modification, cancellation, conversion, or exit endpoint exists. The bridge filters output to NFO NIFTY options matching the requested exact expiry and returns no API secret or access token. Canonical IDs include `YYYY-MM-DD`; weekly contracts with the same strike/right on different dates never collide.

Supported relative modes: `current_week`, `next_week`, `far_week`, `current_month`, `next_month`, `far_month`. Exact `YYYY-MM-DD` dates returned by `/api/nifty-expiries` are also supported.
