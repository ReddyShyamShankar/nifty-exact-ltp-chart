# SEEDS — checkpoint history, append-only

## Checkpoint #001 — 2026-07-24T18:30:00+05:30

### Changed since previous seed
- First startup seed created; no prior seed existed.
- Public GitHub repository created and all current project files published.
- Local Git origin configured; local working tree verified clean.

## STATE

NIFTY Exact LTP Chart design, implementation plan, prototype indicator, Chrome extension, and supporting documents are saved locally and published in `ReddyShyamShankar/nifty-exact-ltp-chart`.
Repository contents match, though local has one root commit and GitHub has connector-created commits. No deployable product exists yet; implementation waits data and chart-library access gates.

## NEXT_LINE

Prove Upstox WebSocket market-data access, then confirm TradingView Advanced Charts license/access before beginning controlled-chart implementation.

## MEMORY_KEY

Exact price-level Call/Strike/Put LTP labels require chart we control: Upstox -> own data service -> TradingView Advanced Charts.

## OPEN_QUESTIONS
- Does user's Upstox analytics token receive market-data WebSocket updates?
- Does user have TradingView Advanced Charts access and public-release license approval?
- What is final product name and logo?

## Checkpoint #002 — 2026-07-26

### Changed since previous seed
- Adopted working Pine-plus-extension V1 instead of controlled-chart path.
- Added Keychain-backed persistent bridge and automatic macOS startup.
- Fixed exact-expiry and exact-symbol browser synchronization.
- Verified all 18 expiries at bridge level and two non-adjacent expiries end to end in TradingView.

## STATE

Working V1 uses Chrome extension v0.11.6 in user's normal logged-in Chrome window. Persistent Upstox bridge starts automatically, all 18 offered expiries return chains, and one sync fills ten exact Pine Call/Put symbols. Browser E2E passed for 4 Aug 2026 and 29 Sep 2026.

## NEXT_LINE

Daily use: open NIFTY chart, select any offered expiry, and press SYNC PINE INPUTS. Bridge starts automatically; reload extension only after code updates.

## MEMORY_KEY

Working path is Upstox option chain -> Keychain-backed persistent bridge -> same-window Chrome extension -> exact TradingView Pine input symbols -> live five-strike Call/Put labels.

## OPEN_QUESTIONS
- Should center strike auto-follow ATM or remain user-controlled?
- What is final product name and logo?

## Checkpoint #003 — 2026-07-26

### Changed since previous seed
- Updated extension to v0.12.0.
- Replaced 50-point ladder with five rows 100 points apart.
- Center now derives from live NIFTY spot during sync; no manual center typing.
- Verified 4 Aug and 18 Aug 2026 end to end, then restored and saved 18 Aug layout.

## STATE

Same-window extension calculates nearest 100-point ATM, writes center and interval, then fills ten exact Pine contracts. At spot 23,767.45, verified rows are 23,600 / 23,700 / 23,800 / 23,900 / 24,000.

## NEXT_LINE

Daily use: open NIFTY chart, select any liquid offered expiry, and press SYNC PINE INPUTS. Center and 100-point spacing are automatic.

## MEMORY_KEY

Five visible strike rows now cover 400 points using 100-point spacing; ten contracts remain five Calls plus five Puts.

## OPEN_QUESTIONS
- Should extension auto-run when ATM crosses next 100-point boundary, or keep explicit sync button?
- What is final product name and logo?
