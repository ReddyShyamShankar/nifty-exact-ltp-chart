# NIFTY Exact-LTP Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a NIFTY-only, 1-hour, TradingView Advanced Charts page that renders live monthly Call/Put LTP labels exactly at their strike-price levels.

**Architecture:** A local Node data service owns Upstox contract discovery, option snapshots, live feed health, and NIFTY candles. A React application hosts TradingView Advanced Charts, receives normalized labels from the service, and creates locked priced drawings for the five strikes around ATM. Product controls live outside the chart widget in an application-owned drawer.

**Tech Stack:** TradingView Advanced Charts (approved private package), React, TypeScript, Vite, Vitest, Node.js HTTP service, Upstox Option Chain API, Upstox Market Data Feed V3, Geist / Geist Mono.

## Global Constraints

- NIFTY only, 1-hour chart only, monthly expiries only.
- Default to five strikes around ATM; support 5 / 9 / all from the drawer.
- Labels show real Call LTP, Strike, and Put LTP; no theoretical prices.
- ATM uses orange; other labels use dark grey.
- Markup design tokens are exact source of truth: `/Users/reddyshyamshankar/Documents/Code/Markup/styles.css`.
- All option labels must be exact price-coordinate drawings, locked against drag/delete.
- No browser automation, Pine Script integration, trading, strategies, alerts, weekly expiries, US markets, or historical option-premium replay.
- Display `STALE` on stream disconnect or 30 seconds without a complete chain snapshot during market hours; unchanged individual LTP is not stale.
- Never commit credentials, tokens, private Advanced Charts files, or Upstox secrets.

---

## File structure

| Path | Responsibility |
|---|---|
| `data-bridge/src/domain.js` | Shared NIFTY expiry, strike, chain, and feed-health rules. |
| `data-bridge/src/upstox-rest.js` | Contract, chain, and candle REST client. |
| `data-bridge/src/upstox-stream.js` | V3 feed probe and live visible-contract subscription manager. |
| `data-bridge/src/label-service.js` | Builds exact strike labels and handles ATM subscription swap. |
| `data-bridge/server.js` | HTTP/SSE boundary; no market rules. |
| `data-bridge/test/*.test.js` | Node tests for all market rules. |
| `app/src/types.ts` | Client-side API and chart types. |
| `app/src/api/client.ts` | Typed HTTP and SSE client. |
| `app/src/chart/createNiftyChart.ts` | Advanced Charts creation and 1-hour datafeed wiring. |
| `app/src/chart/optionDrawings.ts` | Creates, updates, and removes locked priced drawings. |
| `app/src/components/ChartShell.tsx` | Chart lifecycle and exact-label wiring. |
| `app/src/components/OptionsDrawer.tsx` | Expiry, strike-count, full-chain, and feed-state controls. |
| `app/src/App.tsx` | Application state ownership. |
| `app/src/styles/tokens.css` | Markup design tokens copied verbatim. |
| `app/src/styles/app.css` | Layout and component styling only. |
| `app/src/**/*.test.ts(x)` | Vitest unit and component tests. |

## Task 1: Prove external access before product work

**Files:**
- Create: `data-bridge/scripts/probe-v3-feed.js`
- Create: `data-bridge/test/feed-eligibility.test.js`
- Modify: `data-bridge/package.json`
- Modify: `data-bridge/README.md`

**Consumes:** `UPSTOX_ANALYTICS_TOKEN` or `UPSTOX_ACCESS_TOKEN` from process environment only.

**Produces:** `npm run probe:feed` exit status 0 only when ten NIFTY option instruments return decodable LTP ticks; otherwise a clear non-secret failure reason.

- [ ] **Step 1: Write failing eligibility test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { assessFeedProbe } from "../src/upstox-stream.js";

test("accepts a probe only after all visible contracts produce LTP", () => {
  assert.deepEqual(
    assessFeedProbe({ requested: 10, received: 10, decodable: true }),
    { ok: true, reason: "live feed ready" }
  );
});

test("rejects partial or undecodable market-feed responses", () => {
  assert.equal(assessFeedProbe({ requested: 10, received: 7, decodable: true }).ok, false);
  assert.equal(assessFeedProbe({ requested: 10, received: 10, decodable: false }).ok, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test data-bridge/test/feed-eligibility.test.js`

Expected: FAIL because `src/upstox-stream.js` does not exist.

- [ ] **Step 3: Implement pure probe assessment and V3 probe**

```js
export function assessFeedProbe({ requested, received, decodable }) {
  if (!decodable) return { ok: false, reason: "Upstox V3 feed message could not be decoded" };
  if (received !== requested) return { ok: false, reason: `received ${received}/${requested} visible contract ticks` };
  return { ok: true, reason: "live feed ready" };
}
```

Implement `probe-v3-feed.js` to: request ten exact instrument keys from a real monthly chain, authenticate to Upstox V3, subscribe in `ltpc` mode, decode the documented protobuf payload, collect one tick for every key, print only count/status, and exit. Read token only from environment.

- [ ] **Step 4: Add package scripts and test**

```json
{
  "scripts": {
    "start": "node server.js",
    "test": "node --test",
    "probe:feed": "node scripts/probe-v3-feed.js"
  }
}
```

Run: `npm test --prefix data-bridge`

Expected: PASS.

- [ ] **Step 5: Run authenticated proof without exposing token**

Run: `UPSTOX_ANALYTICS_TOKEN="$(pbpaste)" npm run probe:feed --prefix data-bridge`

Expected: `live feed ready` or a documented capability block. Never print token or token length.

- [ ] **Step 6: Commit**

Do not commit until repository initialization is explicitly approved. This workspace currently has no Git repository.

## Task 2: Extract reliable market-domain rules

**Files:**
- Create: `data-bridge/src/domain.js`
- Create: `data-bridge/test/domain.test.js`

**Consumes:** Upstox spot, strike rows, and expiry dates.

**Produces:** `nearestStrike`, `visibleStrikes`, `nextMonthlyExpiry`, `buildLabels`, and `feedHealth`.

- [ ] **Step 1: Write failing domain tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { nearestStrike, visibleStrikes, buildLabels, feedHealth } from "../src/domain.js";

const rows = [
  { strike: 23650, call: 218.5, put: 50.3 },
  { strike: 23700, call: 182.9, put: 64.4 },
  { strike: 23750, call: 152.1, put: 81.85 },
  { strike: 23800, call: 122.65, put: 102.8 },
  { strike: 23850, call: 97.6, put: 127.7 }
];

test("rounds NIFTY spot to the valid 50-point ATM strike", () => assert.equal(nearestStrike(23767.45), 23750));
test("selects five centered strikes", () => assert.deepEqual(visibleStrikes(rows, 23750, 5).map(x => x.strike), [23650, 23700, 23750, 23800, 23850]));
test("marks only ATM label orange", () => assert.equal(buildLabels(rows, 23750, 5).find(x => x.strike === 23750).tone, "atm"));
test("marks disconnected feed stale", () => assert.equal(feedHealth({ connected: false, lastSnapshotAt: Date.now() }).state, "stale"));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test data-bridge/test/domain.test.js`

Expected: FAIL because `src/domain.js` does not exist.

- [ ] **Step 3: Implement pure rules**

```js
export const STRIKE_STEP = 50;
export function nearestStrike(spot) { return Math.round(spot / STRIKE_STEP) * STRIKE_STEP; }
export function feedHealth({ connected, lastSnapshotAt, now = Date.now() }) {
  return !connected || now - lastSnapshotAt > 30_000
    ? { state: "stale" }
    : { state: "live" };
}
```

Implement remaining functions without HTTP, timers, or UI dependencies.

- [ ] **Step 4: Run tests**

Run: `npm test --prefix data-bridge`

Expected: PASS.

- [ ] **Step 5: Commit**

Do not commit until repository initialization is explicitly approved.

## Task 3: Refactor data bridge into snapshot and stream service

**Files:**
- Create: `data-bridge/src/upstox-rest.js`
- Create: `data-bridge/src/label-service.js`
- Modify: `data-bridge/server.js`
- Create: `data-bridge/test/label-service.test.js`

**Consumes:** Task 1 feed capability result and Task 2 domain functions.

**Produces:** `GET /api/nifty/state`, `GET /api/nifty/chain?expiry=YYYY-MM-DD`, and `GET /api/nifty/events` Server-Sent Events.

- [ ] **Step 1: Write failing label-service test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { LabelService } from "../src/label-service.js";

test("publishes ten contracts and five exact labels around ATM", async () => {
  const service = new LabelService({ contracts: async () => sampleRows });
  const state = await service.refresh({ expiry: "2026-08-25", spot: 23767.45, count: 5 });
  assert.equal(state.labels.length, 5);
  assert.equal(state.subscriptionKeys.length, 10);
  assert.equal(state.labels[2].strike, 23750);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test data-bridge/test/label-service.test.js`

Expected: FAIL because `LabelService` does not exist.

- [ ] **Step 3: Implement normalized service boundary**

```js
export class LabelService {
  constructor({ contracts, stream }) { this.contracts = contracts; this.stream = stream; }
  async refresh({ expiry, spot, count }) {
    const rows = await this.contracts(expiry);
    const atm = nearestStrike(spot);
    const labels = buildLabels(rows, atm, count);
    return { expiry, spot, atm, labels, subscriptionKeys: labels.flatMap(x => [x.callKey, x.putKey]) };
  }
}
```

Split existing `server.js` REST calls into `upstox-rest.js`. Add SSE only after Task 1 passes. If Task 1 fails, return snapshot state with `mode: "snapshot"`, `feed.state: "stale"`, and do not pretend it is live.

- [ ] **Step 4: Run tests and API smoke check**

Run: `npm test --prefix data-bridge && curl -sS http://127.0.0.1:8787/api/nifty/state`

Expected: tests PASS; JSON contains `spot`, `atm`, `labels`, `feed`, and `expiry`.

- [ ] **Step 5: Commit**

Do not commit until repository initialization is explicitly approved.

## Task 4: Create application shell and exact Markup theme

**Files:**
- Create: `app/package.json`
- Create: `app/vite.config.ts`
- Create: `app/src/main.tsx`
- Create: `app/src/App.tsx`
- Create: `app/src/components/ChartShell.tsx`
- Create: `app/src/styles/tokens.css`
- Create: `app/src/styles/app.css`
- Create: `app/src/App.test.tsx`

**Consumes:** `GET /api/nifty/state` response contract from Task 3.

**Produces:** local page shell with header, chart region, footer feed state, and closed options drawer.

- [ ] **Step 1: Write failing component test**

```tsx
import { render, screen } from "@testing-library/react";
import { App } from "./App";

test("renders NIFTY 1H shell with live source footer", () => {
  render(<App initialState={{ feed: { state: "live" }, expiry: "2026-08-25" }} />);
  expect(screen.getByText("NIFTY · 1H")).toBeInTheDocument();
  expect(screen.getByText(/UPSTOX/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix app -- App.test.tsx`

Expected: FAIL because application files do not exist.

- [ ] **Step 3: Scaffold Vite React TypeScript app**

Create `app/package.json` with React, TypeScript, Vite, Vitest, and Testing Library. Copy Markup token values exactly into `tokens.css`; do not copy unrelated Markup layout classes. Implement `App` with fixed `NIFTY · 1H`, monthly date display, feed footer, and drawer-open state.

- [ ] **Step 4: Run tests and local build**

Run: `npm test --prefix app -- App.test.tsx && npm run build --prefix app`

Expected: PASS and successful Vite production build.

- [ ] **Step 5: Commit**

Do not commit until repository initialization is explicitly approved.

## Task 5: Integrate TradingView Advanced Charts only after approval

**Files:**
- Create: `app/src/chart/createNiftyChart.ts`
- Create: `app/src/chart/tv-types.d.ts`
- Create: `app/src/chart/createNiftyChart.test.ts`
- Modify: `app/src/components/ChartShell.tsx`
- Modify: `app/README.md`

**Consumes:** official Advanced Charts package supplied through approved private repository; Task 3 candle/state APIs.

**Produces:** NIFTY 1-hour Advanced Charts widget with custom datafeed and no duplicate browser chart.

- [ ] **Step 1: Write failing chart configuration test**

```ts
import { chartOptions } from "./createNiftyChart";

test("locks product chart to NIFTY 1-hour candles", () => {
  expect(chartOptions({ datafeed: {} as never }).symbol).toBe("NIFTY");
  expect(chartOptions({ datafeed: {} as never }).interval).toBe("60");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix app -- createNiftyChart.test.ts`

Expected: FAIL because Advanced Charts integration is absent.

- [ ] **Step 3: Install only official approved package and implement datafeed**

Use only repository access approved by TradingView. Do not download third-party copies or commit `charting_library/`. Implement chart options with NIFTY and interval `60`; route `getBars` to data service candle endpoint and route realtime updates to current-bar updates. Keep attribution and required licence UI.

- [ ] **Step 4: Run tests and manual chart proof**

Run: `npm test --prefix app -- createNiftyChart.test.ts && npm run build --prefix app`

Expected: PASS. Manual: local page shows 1-hour NIFTY candles and chart pan/zoom works.

- [ ] **Step 5: Commit**

Do not commit until repository initialization is explicitly approved.

## Task 6: Draw exact LTP labels at strike coordinates

**Files:**
- Create: `app/src/chart/optionDrawings.ts`
- Create: `app/src/chart/optionDrawings.test.ts`
- Modify: `app/src/components/ChartShell.tsx`

**Consumes:** Task 3 normalized labels and Task 5 chart instance.

**Produces:** five locked Call / Strike / Put chart drawings at exact prices.

- [ ] **Step 1: Write failing drawing test**

```ts
import { vi } from "vitest";
import { applyOptionDrawings } from "./optionDrawings";

test("creates ATM drawing at exact 23750 price and locks it", async () => {
  const chart = { createShape: vi.fn().mockResolvedValue("atm") } as never;
  await applyOptionDrawings(chart, [{ strike: 23750, call: 152.1, put: 81.85, tone: "atm" }], 1_785_000_000);
  expect(chart.createShape).toHaveBeenCalledWith(
    { time: 1_785_000_000, price: 23750 },
    expect.objectContaining({ lock: true, disableSelection: true })
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix app -- optionDrawings.test.ts`

Expected: FAIL because `optionDrawings.ts` does not exist.

- [ ] **Step 3: Implement drawing lifecycle**

```ts
export async function applyOptionDrawings(chart, labels, time) {
  await clearOptionDrawings(chart);
  return Promise.all(labels.map(label => chart.createShape(
    { time, price: label.strike },
    { shape: "text", text: `CALL ${label.call ?? "N/A"} | ${label.strike.toLocaleString("en-IN")} | PUT ${label.put ?? "N/A"}`, lock: true, disableSelection: true, disableSave: true }
  )));
}
```

Keep entity IDs. Update text only for LTP changes; rebuild entity set only when strike set changes. Use orange overrides for `tone: "atm"` and dark-grey overrides otherwise.

- [ ] **Step 4: Run test and visual acceptance**

Run: `npm test --prefix app -- optionDrawings.test.ts`

Expected: PASS. Manual: price label at 23,800 remains aligned at 23,800 through pan and zoom.

- [ ] **Step 5: Commit**

Do not commit until repository initialization is explicitly approved.

## Task 7: Add options drawer and stale-state behavior

**Files:**
- Create: `app/src/components/OptionsDrawer.tsx`
- Create: `app/src/components/OptionsDrawer.test.tsx`
- Modify: `app/src/App.tsx`
- Modify: `app/src/styles/app.css`

**Consumes:** Task 3 state and chain API; Task 6 visible-label state.

**Produces:** application-owned drawer with monthly date, strike count, full chain, and explicit data status.

- [ ] **Step 1: Write failing drawer test**

```tsx
import { render, screen } from "@testing-library/react";
import { OptionsDrawer } from "./OptionsDrawer";

test("shows stale warning without replacing premium values", () => {
  render(<OptionsDrawer open state={{ feed: { state: "stale" }, rows: [{ strike: 23800, call: 423.4, put: 335.05 }] }} />);
  expect(screen.getByText("STALE")).toBeInTheDocument();
  expect(screen.getByText("423.40")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix app -- OptionsDrawer.test.tsx`

Expected: FAIL because component does not exist.

- [ ] **Step 3: Implement controls and data contract**

Implement exact monthly expiry selector, 5/9/all selector, and full `Call | Strike | Put` table. Fetch full chain only while drawer is open. Preserve last valid LTP. Render `LIVE`, `STALE`, `DISCONNECTED`, and `N/A` distinctly using Markup mint, amber, danger, and muted tokens.

- [ ] **Step 4: Run tests and browser acceptance**

Run: `npm test --prefix app -- OptionsDrawer.test.tsx && npm run build --prefix app`

Expected: PASS. Manual: opening drawer shows full chain; closing drawer stops full-chain refresh.

- [ ] **Step 5: Commit**

Do not commit until repository initialization is explicitly approved.

## Task 8: End-to-end proof and documentation

**Files:**
- Create: `app/e2e/nifty-exact-ltp.spec.ts`
- Modify: `README.md`
- Modify: `data-bridge/README.md`

**Consumes:** Tasks 1–7.

**Produces:** repeatable proof that live data, price labels, auto-ATM switching, monthly rollover selection, and stale-state behavior meet the approved design.

- [ ] **Step 1: Write end-to-end acceptance test**

```ts
test("shows five exact labels and marks ATM orange", async ({ page }) => {
  await page.goto("http://127.0.0.1:5173");
  await expect(page.getByText("23,750")).toBeVisible();
  await expect(page.getByTestId("atm-option-label")).toContainText("CALL");
  await expect(page.getByTestId("feed-state")).toHaveText("LIVE");
});
```

- [ ] **Step 2: Run test to verify it fails before E2E wiring**

Run: `npm run test:e2e --prefix app`

Expected: FAIL until local services and E2E test configuration exist.

- [ ] **Step 3: Add deterministic mock feed mode**

Add `NIFTY_FEED_MODE=mock` to data service. It returns fixed 23,750 ATM labels and a live feed state so E2E never needs real market credentials. Keep mock mode inaccessible in production configuration.

- [ ] **Step 4: Run full verification**

Run: `npm test --prefix data-bridge && npm test --prefix app && npm run build --prefix app && npm run test:e2e --prefix app`

Expected: all PASS.

- [ ] **Step 5: Manual production acceptance**

Compare five visible labels with Upstox Option Chain at one selected monthly expiry. Pan and zoom chart. Confirm labels stay at strike levels. Disconnect feed and confirm stale state preserves last LTP.

- [ ] **Step 6: Commit**

Do not commit until repository initialization is explicitly approved.

## Self-review

- Spec coverage: Tasks 1–3 cover data, contract discovery, ATM switching, rollover, and stale behavior. Tasks 4–7 cover exact Markup UI, chart, labels, and drawer. Task 8 covers mock, automated, and manual verification.
- Placeholder scan: no TBD/TODO/defer instructions. Advanced Charts access is an explicit external gate, not an implementation placeholder.
- Type consistency: data service emits `spot`, `atm`, `expiry`, `labels`, `rows`, and `feed`; client uses this same contract across shell, drawing manager, and drawer.
- Scope check: this plan delivers one independently testable MVP. Strategies, alerts, weekly expiries, US markets, logo, and historical option replay remain excluded.
