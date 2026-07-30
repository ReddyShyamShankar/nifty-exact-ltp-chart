"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const content = require("./content.js");
const ledgerApi = require("./seller-ledger.js");
const popupView = require("./popup-view.js");
const risk = require("./seller-risk.js");
const riskOverlay = require("./risk-overlay.js");
const tradebook = require("./tradebook-csv.js");
const viewIdentity = require("./seller-view-identity.js");
const manifest = require("./manifest.json");

const EXTENSION_ORIGIN = "chrome-extension://hjgknhdbplfoeldaalpidhkahnfldjem";
const EXPIRY = "2026-08-25";
const ACCEPTED_AT = "2026-08-01T03:50:00.000Z";
const PLOT = { left: 100, top: 20, right: 900, bottom: 700 };
const RISK_LAYOUT = { labelRight: 643 };

function rawPosition(tradingsymbol, quantity, averagePrice, lastPrice, pnl, exchange = "NFO") {
  return {
    exchange,
    tradingsymbol,
    quantity,
    average_price: averagePrice,
    last_price: lastPrice,
    pnl
  };
}

function rawTrade(id, tradingsymbol, quantity, price, transactionType = "SELL") {
  return {
    trade_id: id,
    order_id: `order-${id}`,
    exchange: "NFO",
    tradingsymbol,
    transaction_type: transactionType,
    quantity,
    average_price: price,
    fill_timestamp: "2026-08-01 09:15:00"
  };
}

function upstreamFixture() {
  return {
    positions: {
      status: "success",
      data: {
        net: [
          rawPosition("NIFTY26AUG24100CE", -130, 358.8, 320, 5044),
          rawPosition("NIFTY26AUG24100PE", -65, 315.45, 300, 1004.25),
          rawPosition("NIFTY26AUG22500PE", -65, 77.8, 70, 507),
          rawPosition("BANKNIFTY26AUG55000CE", -65, 100, 90, 650),
          rawPosition("NIFTY26AUG24200CE", 0, 100, 90, 0)
        ]
      }
    },
    trades: {
      status: "success",
      data: [
        rawTrade("today-call", "NIFTY26AUG24100CE", 130, 358.8),
        rawTrade("today-put", "NIFTY26AUG24100PE", 65, 315.45),
        rawTrade("today-low-put", "NIFTY26AUG22500PE", 65, 77.8),
        { ...rawTrade("ignored-bank", "BANKNIFTY26AUG55000CE", 65, 100) }
      ]
    },
    chain: {
      source: "Upstox",
      expiry: EXPIRY,
      spot: 24120,
      rows: Array.from({ length: 13 }, (_, index) => ({
        strike: 23800 + index * 50,
        call: 200 - index,
        put: 100 + index
      }))
    }
  };
}

async function close(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function startBridge(overrides = {}) {
  const { startServer } = await import("../data-bridge/server.js");
  const sessionStore = overrides.sessionStore || {
    status: async () => ({ configured: true, connected: true, expiresAt: "2026-08-02T00:30:00.000Z" }),
    loginUrl: async () => "https://kite.zerodha.com/connect/login?v=3&api_key=public-key",
    exchangeRequestToken: async () => ({ configured: true, connected: true, expiresAt: "2026-08-02T00:30:00.000Z" }),
    credentials: async () => ({ apiKey: "public-key", accessToken: "bridge-only-daily-token", onUnauthorized: async () => {} })
  };
  return startServer({
    host: "127.0.0.1",
    port: 0,
    sessionStore,
    zerodhaClientFactory: overrides.zerodhaClientFactory,
    chainLoader: overrides.chainLoader,
    expiryMetadata: () => ({ expiry: EXPIRY, weekly: false }),
    extensionOrigin: EXTENSION_ORIGIN,
    now: () => new Date(ACCEPTED_AT)
  });
}

function bridgeUrl(server, route) {
  return `http://127.0.0.1:${server.address().port}${route}`;
}

function extensionFetch(server, route) {
  return fetch(bridgeUrl(server, route), { headers: { Origin: EXTENSION_ORIGIN } });
}

function forbiddenCredentialKeys(value, trail = [], found = []) {
  if (!value || typeof value !== "object") return found;
  for (const [key, child] of Object.entries(value)) {
    const nextTrail = trail.concat(key);
    if (/token|secret|authorization|checksum/i.test(key)) found.push(nextTrail.join("."));
    forbiddenCredentialKeys(child, nextTrail, found);
  }
  return found;
}

function csvFixture() {
  return [
    "trade_id,order_id,exchange,tradingsymbol,transaction_type,quantity,average_price,fill_timestamp,expiry",
    "today-call,order-today-call,NFO,NIFTY26AUG24100CE,SELL,130,358.8,2026-08-01T09:15:00+05:30,2026-08-25",
    "today-put,order-today-put,NFO,NIFTY26AUG24100PE,SELL,65,315.45,2026-08-01T09:15:00+05:30,2026-08-25",
    "today-low-put,order-today-low-put,NFO,NIFTY26AUG22500PE,SELL,65,77.8,2026-08-01T09:15:00+05:30,2026-08-25"
  ].join("\n");
}

function fixedDate(iso) {
  const timestamp = Date.parse(iso);
  return class FixedDate extends Date {
    constructor(value) { super(typeof value === "undefined" ? timestamp : value); }
    static now() { return timestamp; }
  };
}

async function acceptThroughPopup(refreshPayload) {
  const runtime = popupRuntime({
    refreshResponse: { status: 200, payload: refreshPayload },
    dateImpl: fixedDate(ACCEPTED_AT)
  });
  await settle();
  await runtime.listeners.get("refresh-all:click")();
  runtime.nodeFor("strategy-name").value = "August seller";
  await runtime.listeners.get("create-strategy:click")();
  for (const input of runtime.nodes.get("allocation-list").querySelectorAll("[data-allocation-contract]")) {
    const position = refreshPayload.positions.find((candidate) => candidate.contractId === input.dataset.allocationContract);
    input.value = String(position.signedQuantity / position.lotSize);
  }
  await runtime.listeners.get("allocate-lots:click")();
  runtime.nodes.get("tradebook-csv").files = [{ name: "tradebook.csv", text: async () => csvFixture() }];
  await runtime.listeners.get("tradebook-csv:change")({ target: runtime.nodes.get("tradebook-csv") });
  const strategyId = runtime.storage.selectedStrategyId;
  const owners = runtime.nodes.get("trade-review-list").querySelectorAll("[data-trade-review-id]");
  const quantities = runtime.nodes.get("trade-review-list").querySelectorAll("[data-trade-review-quantity]");
  for (const owner of owners) owner.value = strategyId;
  for (const quantity of quantities) quantity.value = quantity.max;
  await runtime.listeners.get("assign-trades:click")();
  runtime.nodes.get("coverage-from").value = "2026-08-01";
  runtime.nodes.get("coverage-to").value = "2026-08-01";
  await runtime.listeners.get("confirm-coverage:click")();
  await runtime.listeners.get("accept-snapshot:click")();
  return runtime;
}

test("bridge payload flows through reviewed ledger, both risk maps, storage, and exact-axis layers", async (t) => {
  const fixture = upstreamFixture();
  const calls = { positions: 0, trades: 0, chain: 0 };
  const server = await startBridge({
    zerodhaClientFactory: () => ({
      getPositions: async () => { calls.positions += 1; return fixture.positions; },
      getTrades: async () => { calls.trades += 1; return fixture.trades; }
    }),
    chainLoader: async () => { calls.chain += 1; return fixture.chain; }
  });
  t.after(() => close(server));

  const response = await extensionFetch(server, `/api/seller-refresh?expiry=${EXPIRY}`);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(calls, { positions: 1, trades: 1, chain: 1 });
  assert.equal(payload.positions.length, 3);
  assert.equal(payload.trades.length, 3);
  assert.ok(payload.positions.every((position) => position.underlying === "NIFTY" && position.expiry === EXPIRY));
  assert.ok(payload.trades.every((fill) => fill.underlying === "NIFTY" && fill.expiry === EXPIRY));
  assert.deepEqual(forbiddenCredentialKeys(payload), []);
  assert.doesNotMatch(JSON.stringify(payload), /bridge-only-daily-token|api.?secret/i);

  const runtime = await acceptThroughPopup(payload);
  assert.equal(runtime.requests.filter((url) => url.includes("/api/seller-refresh")).length, 1);
  assert.equal(runtime.requests.filter((url) => url.includes("/api/nifty-chain")).length, 0);
  assert.equal(runtime.storage.sellerSafetyChain.rows.length, 13);
  assert.deepEqual(runtime.storage.sellerSafetyLedger.importedTrades.map((trade) => trade.id), [
    "today-call", "today-put", "today-low-put"
  ]);
  assert.deepEqual(runtime.storage.sellerSafetyLedger.strategies[0].fillIds, [
    "today-call", "today-put", "today-low-put"
  ]);
  assert.deepEqual(runtime.storage.sellerSafetyLedger.tradeReviews, []);
  assert.equal(runtime.storage.sellerSafetyLedger.reviewChanges.length, 0);
  assert.deepEqual(runtime.storage.sellerSafetyLedger.strategies[0].allocations.map((allocation) => allocation.signedLots), [-2, -1, -1]);
  assert.equal(runtime.storage.sellerSafetyView.canPublish, true);
  assert.deepEqual(runtime.storage.sellerSafetyChartView, runtime.storage.sellerSafetyView);

  const storedView = JSON.parse(JSON.stringify(runtime.storage.sellerSafetyView));
  assert.deepEqual(storedView.maps.current.breakevens, [22989.15, 24655.425]);
  assert.deepEqual(storedView.maps.wholeTrade.breakevens, [22989.15, 24655.425]);
  assert.deepEqual(forbiddenCredentialKeys(storedView), []);
  let renderedRows = [];
  let layers;
  let extraChainRequests = 0;
  const controller = content.createLadderController({
    expiry: EXPIRY,
    chainSnapshot: runtime.storage.sellerSafetyChain,
    riskView: runtime.storage.sellerSafetyChartView,
    fetchChain: async () => { extraChainRequests += 1; throw new Error("unexpected chain request"); },
    captureAxisScale: async () => ({
      ok: true,
      gridGapPx: 100,
      axisPairs: Array.from({ length: 31 }, (_, index) => ({
        price: 22000 + index * 100,
        y: 600 - index * 20
      }))
    }),
    renderRows: (rows) => { renderedRows = rows; },
    placeRows: () => ({ riskLayout: RISK_LAYOUT }),
    placeRisk: (view, toY) => {
      layers = riskOverlay.buildRiskLayers({
        ...view,
        activeStrategyId: view.strategyId,
        activeExpiry: EXPIRY
      }, toY, PLOT, RISK_LAYOUT);
      return true;
    }
  });
  t.after(() => controller.invalidate());
  assert.equal(await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour"), true);
  assert.deepEqual(renderedRows.map((row) => row.strike), [23800, 23900, 24000, 24100, 24200, 24300, 24400]);
  assert.equal(extraChainRequests, 0);

  assert.equal(layers.status, "OK");
  assert.equal(layers.lines.length, 4);
  assert.deepEqual(layers.lines.filter((line) => line.layer === "current").map(({ stroke, dash }) => ({ stroke, dash })), [
    { stroke: "mint", dash: "solid" },
    { stroke: "mint", dash: "solid" }
  ]);
  assert.deepEqual(layers.lines.filter((line) => line.layer === "whole-trade").map(({ stroke, dash }) => ({ stroke, dash })), [
    { stroke: "graphite", dash: "dashed" },
    { stroke: "graphite", dash: "dashed" }
  ]);
  for (const layer of ["current", "whole-trade"]) {
    const kinds = new Set(layers.bands.filter((band) => band.layer === layer).map((band) => band.kind));
    assert.equal(kinds.has("profit"), true);
    assert.equal(kinds.has("loss"), true);
  }
});

test("stale, changed-position, and missing-history states fail closed without erasing accepted evidence", async () => {
  const fixture = upstreamFixture();
  const refreshPayload = {
    updatedAt: ACCEPTED_AT,
    positions: [
      {
        contractId: "NFO:NIFTY:2026-08-25:24100:CE", tradingsymbol: "NIFTY26AUG24100CE", expiry: EXPIRY,
        exchange: "NFO", underlying: "NIFTY", strike: 24100, optionType: "CE",
        signedQuantity: -130, lotSize: 65, averagePrice: 358.8, lastPrice: 320, pnl: 5044
      },
      {
        contractId: "NFO:NIFTY:2026-08-25:24100:PE", tradingsymbol: "NIFTY26AUG24100PE", expiry: EXPIRY,
        exchange: "NFO", underlying: "NIFTY", strike: 24100, optionType: "PE",
        signedQuantity: -65, lotSize: 65, averagePrice: 315.45, lastPrice: 300, pnl: 1004.25
      },
      {
        contractId: "NFO:NIFTY:2026-08-25:22500:PE", tradingsymbol: "NIFTY26AUG22500PE", expiry: EXPIRY,
        exchange: "NFO", underlying: "NIFTY", strike: 22500, optionType: "PE",
        signedQuantity: -65, lotSize: 65, averagePrice: 77.8, lastPrice: 70, pnl: 507
      }
    ],
    trades: tradebook.parseTradebookCsv(csvFixture()).trades,
    chain: fixture.chain
  };
  const acceptedRuntime = await acceptThroughPopup(refreshPayload);
  const accepted = {
    ledger: acceptedRuntime.storage.sellerSafetyLedger,
    view: acceptedRuntime.storage.sellerSafetyView,
    chain: {
      candidateId: acceptedRuntime.storage.sellerSafetyView.candidateId,
      expiry: EXPIRY,
      daysToExpiry: 24,
      spot: refreshPayload.chain.spot,
      updatedAt: refreshPayload.updatedAt
    }
  };
  const evidence = JSON.parse(JSON.stringify(accepted.view));
  const strategyId = accepted.view.strategyId;

  const stale = popupView.buildView({
    ledger: accepted.ledger,
    selectedStrategyId: strategyId,
    brokerStatus: { configured: true, connected: true, expiresAt: "2026-08-02T00:30:00.000Z" },
    chain: { ...accepted.chain, updatedAt: "2026-08-01T03:20:00.000Z" },
    now: ACCEPTED_AT
  });
  assert.equal(stale.broker.kind, "stale");
  assert.deepEqual(stale.currentRisk, evidence.currentRisk);
  assert.deepEqual(riskOverlay.buildRiskLayers(stale, (price) => price, PLOT, RISK_LAYOUT), {
    status: "STALE", lines: [], bands: []
  });

  const changedPositions = accepted.ledger.brokerPositions.map((position, index) => (
    index === 0 ? { ...position, signedQuantity: -195 } : position
  ));
  const changedLedger = ledgerApi.reconcilePositions(accepted.ledger, changedPositions);
  const changed = popupView.buildView({
    ledger: changedLedger,
    selectedStrategyId: strategyId,
    brokerStatus: { configured: true, connected: true, expiresAt: "2026-08-02T00:30:00.000Z" },
    chain: accepted.chain,
    now: ACCEPTED_AT
  });
  assert.equal(changedLedger.strategies[0].allocations[0].signedLots, -2);
  assert.equal(changed.priority.label, "REVIEW POSITION CHANGES");
  assert.equal(changed.canPublish, false);
  assert.equal(changed.maps, null);
  assert.deepEqual(evidence.maps.current.breakevens, [22989.15, 24655.425]);

  const missingLedger = structuredClone(accepted.ledger);
  missingLedger.strategies[0].fillIds = [];
  missingLedger.importedTrades = [];
  missingLedger.fillAssignments = [];
  missingLedger.importBatches = [];
  const missing = popupView.buildView({
    ledger: missingLedger,
    selectedStrategyId: strategyId,
    brokerStatus: { configured: true, connected: true, expiresAt: "2026-08-02T00:30:00.000Z" },
    chain: accepted.chain,
    now: ACCEPTED_AT
  });
  assert.deepEqual(missing.currentRisk, evidence.currentRisk);
  assert.equal(missing.wholeTrade.status, "HISTORY INCOMPLETE");
  assert.equal(missing.wholeTrade.lower, "—");
  const partial = riskOverlay.buildRiskLayers(missing, (price) => 600 - (price - 22000) / 5, PLOT, RISK_LAYOUT);
  assert.equal(partial.status, "PARTIAL");
  assert.deepEqual([...new Set(partial.lines.map((line) => line.layer))], ["current"]);
});

function popupRuntime({ initialStorage = {}, refreshResponse, loginUrl, dateImpl = Date } = {}) {
  const listeners = new Map();
  const requests = [];
  const openedTabs = [];
  const nodes = new Map();

  function nodeFor(id = "", tagName = "div") {
    if (id && nodes.has(id)) return nodes.get(id);
    const node = {
      id,
      tagName: tagName.toUpperCase(),
      value: id === "expiry" ? EXPIRY : "",
      textContent: "",
      hidden: false,
      disabled: false,
      files: [],
      children: [],
      dataset: {},
      attributes: new Map([["aria-expanded", "false"]]),
      setAttribute(name, value) { this.attributes.set(name, String(value)); },
      getAttribute(name) { return this.attributes.get(name) || null; },
      removeAttribute(name) { this.attributes.delete(name); },
      addEventListener(type, listener) { listeners.set(`${id}:${type}`, listener); },
      replaceChildren(...children) { this.children = children; },
      append(...children) { this.children.push(...children); },
      querySelectorAll(selector) {
        const found = [];
        const visit = (candidate) => {
          if (selector === "[data-allocation-contract]" && candidate.dataset?.allocationContract) found.push(candidate);
          if (selector === "[data-trade-review-id]" && candidate.dataset?.tradeReviewId) found.push(candidate);
          if (selector === "[data-trade-review-quantity]" && candidate.dataset?.tradeReviewQuantity) found.push(candidate);
          (candidate.children || []).forEach(visit);
        };
        this.children.forEach(visit);
        return found;
      }
    };
    if (id) nodes.set(id, node);
    return node;
  }

  const storage = {
    enabled: false,
    expiry: EXPIRY,
    sellerSafetyLedger: null,
    selectedStrategyId: "",
    sellerSafetyView: null,
    sellerSafetyChartView: null,
    sellerSafetyPending: null,
    ...structuredClone(initialStorage)
  };
  const response = (status, payload) => ({
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload; }
  });
  const sandbox = {
    AbortController,
    NiftySellerRisk: risk,
    NiftySellerLedger: ledgerApi,
    NiftyTradebookCsv: tradebook,
    NiftySellerPopupView: popupView,
    NiftySellerViewIdentity: require("./seller-view-identity.js"),
    chrome: {
      storage: { local: {
        async get(defaults) { return { ...defaults, ...storage }; },
        async set(next) { Object.assign(storage, structuredClone(next)); }
      } },
      tabs: {
        async query() { return [{ id: 7, url: "https://www.tradingview.com/chart/test/" }]; },
        async sendMessage() { return { ok: true }; },
        async create(input) { openedTabs.push(input); }
      }
    },
    document: {
      querySelector(selector) { return nodeFor(selector.replace(/^#/, "")); },
      querySelectorAll(selector) {
        const container = selector === "[data-trade-review-id]" || selector === "[data-trade-review-quantity]"
          ? "trade-review-list" : "allocation-list";
        return nodeFor(container).querySelectorAll(selector);
      },
      createElement(tagName) { return nodeFor("", tagName); }
    },
    fetch: async (url) => {
      const request = String(url);
      requests.push(request);
      if (request.includes("/api/health")) return response(200, { status: "ok" });
      if (request.includes("/api/nifty-expiries")) return response(200, { expiries: [{ expiry: EXPIRY, daysToExpiry: 24 }] });
      if (request.includes("/api/zerodha/status")) return response(200, {
        configured: true, connected: true, expiresAt: "2026-08-02T00:30:00.000Z"
      });
      if (request.includes("/api/seller-refresh")) return response(
        refreshResponse?.status || 429,
        refreshResponse?.payload || { error: "Zerodha rate limit reached.", kind: "rate_limit" }
      );
      if (request.includes("/api/zerodha/login-url")) return response(200, {
        loginUrl: loginUrl || "https://kite.zerodha.com/connect/login?v=3&api_key=public-key"
      });
      return response(404, { error: "Unexpected request." });
    },
    Intl,
    console,
    Date: dateImpl,
    URL,
    setTimeout,
    clearTimeout,
    structuredClone
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "popup.js"), "utf8"), sandbox);
  return { listeners, nodeFor, nodes, openedTabs, requests, storage };
}

async function settle() {
  await new Promise(setImmediate);
  await new Promise(setImmediate);
  await new Promise(setImmediate);
}

test("popup-open and negative UI actions make no seller refresh, chain, position, or trade request", async () => {
  const runtime = popupRuntime();
  await settle();
  const upstreamRequests = () => runtime.requests.filter((url) => (
    /seller-refresh|nifty-chain|portfolio\/positions|\/trades/.test(url)
  ));
  assert.deepEqual(upstreamRequests(), []);

  for (const id of ["legs-toggle", "timeline-toggle", "advanced-toggle", "enabled"]) {
    await runtime.listeners.get(`${id}:click`)();
  }
  runtime.nodes.get("expiry").value = EXPIRY;
  await runtime.listeners.get("expiry:change")({ target: runtime.nodes.get("expiry") });
  assert.deepEqual(upstreamRequests(), []);
});

test("one explicit refresh preserves prior evidence on rate-limit failure and never retries", async () => {
  const lastEvidence = { version: 1, candidateId: "last-good", canPublish: true, acceptedAt: ACCEPTED_AT };
  const runtime = popupRuntime({ initialStorage: { sellerSafetyView: lastEvidence } });
  await settle();

  await runtime.listeners.get("refresh-all:click")();
  await settle();

  assert.equal(runtime.requests.filter((url) => url.includes("/api/seller-refresh")).length, 1);
  assert.deepEqual(runtime.storage.sellerSafetyView, lastEvidence);
  assert.equal(runtime.storage.sellerSafetyPending, null);
  assert.match(runtime.nodes.get("placement-status").textContent, /rate limit/i);
});

test("hostile bridge login URL is rejected without opening a tab", async () => {
  const runtime = popupRuntime({
    loginUrl: "https://kite.zerodha.com.attacker.example/connect/login?v=3&api_key=stolen"
  });
  await settle();

  await runtime.listeners.get("connect-zerodha:click")();

  assert.equal(runtime.requests.filter((url) => url.includes("/api/zerodha/login-url")).length, 1);
  assert.deepEqual(runtime.openedTabs, []);
  assert.match(runtime.nodes.get("placement-status").textContent, /invalid Zerodha login URL/i);
});

test("rate-limit and expired-Zerodha bridge failures are single-shot and expose no partial snapshot", async (t) => {
  const fixture = upstreamFixture();
  const calls = { positions: 0, trades: 0, chain: 0 };
  const limited = await startBridge({
    zerodhaClientFactory: () => ({
      getPositions: async () => {
        calls.positions += 1;
        throw Object.assign(new Error("Zerodha rate limit reached."), { status: 429, kind: "rate_limit" });
      },
      getTrades: async () => { calls.trades += 1; return fixture.trades; }
    }),
    chainLoader: async () => { calls.chain += 1; return fixture.chain; }
  });
  t.after(() => close(limited));
  const rateResponse = await extensionFetch(limited, `/api/seller-refresh?expiry=${EXPIRY}`);
  const ratePayload = await rateResponse.json();
  assert.equal(rateResponse.status, 429);
  assert.deepEqual(calls, { positions: 1, trades: 1, chain: 1 });
  assert.deepEqual(ratePayload, { error: "Zerodha rate limit reached.", kind: "rate_limit" });
  assert.equal(Object.hasOwn(ratePayload, "positions"), false);

  const expiredCalls = { credentials: 0, client: 0, chain: 0 };
  const expired = await startBridge({
    sessionStore: {
      status: async () => ({ configured: true, connected: false, expiresAt: null }),
      loginUrl: async () => "https://kite.zerodha.com/connect/login?v=3&api_key=public-key",
      exchangeRequestToken: async () => ({}),
      credentials: async () => {
        expiredCalls.credentials += 1;
        throw Object.assign(new Error("Connect Zerodha for today's session."), { status: 401, kind: "auth" });
      }
    },
    zerodhaClientFactory: () => { expiredCalls.client += 1; return {}; },
    chainLoader: async () => { expiredCalls.chain += 1; return fixture.chain; }
  });
  t.after(() => close(expired));
  const expiredResponse = await extensionFetch(expired, `/api/seller-refresh?expiry=${EXPIRY}`);
  const expiredPayload = await expiredResponse.json();
  assert.equal(expiredResponse.status, 401);
  assert.deepEqual(expiredCalls, { credentials: 1, client: 0, chain: 0 });
  assert.deepEqual(expiredPayload, { error: "Connect Zerodha for today's session.", kind: "auth" });
});

test("timeframe, zoom, pan, and storage redraw reuse one manual chain snapshot", async () => {
  let chainCalls = 0;
  let riskPlacements = 0;
  const chain = {
    spot: 23767.45,
    rows: Array.from({ length: 41 }, (_, index) => ({
      strike: 22900 + index * 50,
      call: 100 + index,
      put: 200 + index
    }))
  };
  const scale = {
    ok: true,
    gridGapPx: 20,
    axisPairs: [
      { price: 24000, y: 100 },
      { price: 23900, y: 120 },
      { price: 23800, y: 140 },
      { price: 23700, y: 160 }
    ]
  };
  const controller = content.createLadderController({
    expiry: EXPIRY,
    fetchChain: async () => { chainCalls += 1; return chain; },
    captureAxisScale: async () => scale,
    renderRows: () => {},
    placeRows: () => ({ riskLayout: RISK_LAYOUT }),
    placeRisk: () => { riskPlacements += 1; return true; }
  });

  await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour");
  const settings = { enabled: true, selectedStrategyId: "aug-seller", sellerSafetyView: null };
  const accepted = {
    version: viewIdentity.ACCEPTED_VIEW_VERSION,
    canPublish: true,
    strategyId: "aug-seller",
    expiry: EXPIRY,
    candidateId: "accepted-manual-chain",
    state: "ACCEPTED"
  };
  accepted.provenance = viewIdentity.acceptedProvenance(accepted);
  content.applyRiskStorageChanges({
    sellerSafetyView: { newValue: accepted }
  }, "local", settings, controller);
  await controller.place();
  await controller.place();
  await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 day");

  assert.equal(chainCalls, 1);
  assert.ok(riskPlacements >= 4);
});

test("Zerodha client surface is NIFTY-read-only and has no order operation", async () => {
  const { createZerodhaClient } = await import("../data-bridge/zerodha-client.js");
  const requests = [];
  const client = createZerodhaClient({
    apiKey: "public-key",
    accessToken: "daily-token",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        status: 200,
        async json() { return { status: "success", data: url.endsWith("/trades") ? [] : { net: [] } }; }
      };
    }
  });
  assert.deepEqual(Object.keys(client).sort(), ["getPositions", "getTrades"]);
  await client.getPositions();
  await client.getTrades();
  assert.deepEqual(requests.map((request) => request.url), [
    "https://api.kite.trade/portfolio/positions",
    "https://api.kite.trade/trades"
  ]);
  assert.ok(requests.every((request) => request.options.method === "GET" && request.options.body === undefined));
  assert.doesNotMatch(requests.map((request) => request.url).join(" "), /order|convert|cancel|modify|exit/i);
});

test("daily token is connected immediately before 06:00 IST and fails closed at the boundary", async () => {
  const { createZerodhaSessionStore } = await import("../data-bridge/zerodha-session.js");
  const services = { apiKey: "key", apiSecret: "secret", accessToken: "token" };
  const tokenRecord = JSON.stringify({
    accessToken: "daily-token",
    expiresAt: "2026-07-29T00:30:00.000Z"
  });
  function secrets() {
    const values = new Map([["key", "public-key"], ["secret", "private-secret"], ["token", tokenRecord]]);
    const deleted = [];
    return {
      deleted,
      readSecret: async (service) => values.get(service) || null,
      writeSecret: async (service, value) => values.set(service, value),
      deleteSecret: async (service) => { deleted.push(service); values.delete(service); }
    };
  }
  const beforeSecrets = secrets();
  const before = createZerodhaSessionStore({
    ...beforeSecrets,
    services,
    now: () => new Date("2026-07-29T00:29:59.999Z")
  });
  assert.deepEqual(await before.status(), {
    configured: true,
    connected: true,
    expiresAt: "2026-07-29T00:30:00.000Z"
  });
  assert.deepEqual(beforeSecrets.deleted, []);

  const atSecrets = secrets();
  const atBoundary = createZerodhaSessionStore({
    ...atSecrets,
    services,
    now: () => new Date("2026-07-29T00:30:00.000Z")
  });
  assert.deepEqual(await atBoundary.status(), { configured: true, connected: false, expiresAt: null });
  assert.deepEqual(atSecrets.deleted, ["token"]);
});

test("standalone whole-trade bands render without blessing blocked current-risk evidence", () => {
  const layers = riskOverlay.buildRiskLayers({
    strategyId: "aug-seller",
    activeStrategyId: "aug-seller",
    expiry: EXPIRY,
    activeExpiry: EXPIRY,
    state: "ACCEPTED",
    currentRisk: { status: "ENTRY HISTORY INCOMPLETE", breakevens: [], bands: [] },
    wholeTradeRisk: {
      status: "OK",
      breakevens: [23100, 23200],
      bands: [
        { kind: "loss", from: 0, to: 23100 },
        { kind: "profit", from: 23100, to: 23200 },
        { kind: "loss", from: 23200, to: { unbounded: "right" } }
      ]
    }
  }, (price) => 500 - (price - 23000) * 2, PLOT, RISK_LAYOUT);

  assert.equal(layers.status, "PARTIAL");
  assert.deepEqual([...new Set(layers.lines.map((line) => line.layer))], ["whole-trade"]);
  assert.deepEqual(layers.bands.map(({ layer, kind }) => ({ layer, kind })), [
    { layer: "whole-trade", kind: "loss" },
    { layer: "whole-trade", kind: "profit" },
    { layer: "whole-trade", kind: "loss" }
  ]);
});

test("release artifacts preserve the workflow in the side panel at version 0.5.0", () => {
  const html = fs.readFileSync(path.join(__dirname, "popup.html"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "popup.css"), "utf8");
  const rootReadme = fs.readFileSync(path.join(__dirname, "../README.md"), "utf8");
  const bridgePackage = JSON.parse(fs.readFileSync(path.join(__dirname, "../data-bridge/package.json"), "utf8"));
  assert.equal(manifest.version, "0.5.0");
  assert.equal(bridgePackage.version, "0.4.1");
  assert.match(css, /body\s*\{[\s\S]*width:\s*100%/);
  assert.match(css, /body\s*\{[\s\S]*min-height:\s*100vh/);
  assert.doesNotMatch(css, /max-height:\s*600px|width:\s*420px/);
  assert.match(css, /\.topbar\s*\{[\s\S]*position:\s*sticky/);
  assert.equal((html.match(/id="refresh-all"/g) || []).length, 1);
  assert.doesNotMatch(html, /OPEN FULL CHAIN|id="chain-panel"|id="chain"|<table/i);
  assert.equal(bridgePackage.scripts.test, "node --test ../extension-axis-ladder/*.test.cjs ./*.test.js");
  assert.match(rootReadme, /NIFTY Axis Ladder[\s\S]*Seller Safety Map/i);
  assert.doesNotMatch(rootReadme, /SYNC PINE INPUTS|ten exact option symbols/i);
});

test("operator docs define setup, daily review, map semantics, stale behavior, and no-order limits", () => {
  const extensionReadme = fs.readFileSync(path.join(__dirname, "README.md"), "utf8");
  const rootReadme = fs.readFileSync(path.join(__dirname, "../README.md"), "utf8");
  const bridgeReadme = fs.readFileSync(path.join(__dirname, "../data-bridge/README.md"), "utf8");

  assert.match(bridgeReadme, /http:\/\/127\.0\.0\.1:8787\/api\/zerodha\/callback/);
  assert.match(bridgeReadme, /bin\/nifty-bridge zerodha-setup/);
  assert.match(bridgeReadme, /bin\/nifty-bridge extension-origin chrome-extension:\/\/<32-lowercase-id>/);
  assert.match(bridgeReadme, /exact-origin[\s\S]*no wildcard CORS/i);
  assert.match(extensionReadme, /daily[\s\S]*CONNECT ZERODHA[\s\S]*REFRESH ALL/i);
  assert.match(extensionReadme, /tradebook CSV[\s\S]*staged[\s\S]*per-fill quantity[\s\S]*split[\s\S]*unassigned/i);
  assert.match(extensionReadme, /coverage bounds[\s\S]*checkpoint/i);
  assert.match(extensionReadme, /weekly[\s\S]*exact expiry/i);
  assert.match(extensionReadme, /REFRESH FAILED[\s\S]*immediately[\s\S]*hides/i);
  assert.match(extensionReadme, /strategy selector[\s\S]*without another refresh/i);
  for (const readme of [rootReadme, extensionReadme]) {
    assert.match(readme, /click[\s\S]*Options Ladder icon[\s\S]*Refresh ladder[\s\S]*Open side panel/i);
    assert.match(readme, /full[- ]height[\s\S]*side panel/i);
    assert.match(readme, /side panel[\s\S]*TradingView-only/i);
    assert.match(readme, /same seller-safety UI[\s\S]*version 0\.4\.0/i);
    assert.match(readme, /switching tabs[\s\S]*closes/i);
    assert.match(readme, /opening,[\s\S]*closing,[\s\S]*resizing[\s\S]*no seller-refresh,[\s\S]*positions,[\s\S]*trades,[\s\S]*option-chain requests/i);
    assert.match(readme, /bridge-health,[\s\S]*expiry-list,[\s\S]*Zerodha-status[\s\S]*checks/i);
    assert.match(readme, /daily,[\s\S]*CONNECT ZERODHA,[\s\S]*REFRESH ALL manually/i);
  }
  assert.doesNotMatch(`${rootReadme}\n${extensionReadme}`, /popup opens|popup open/i);
  assert.match(extensionReadme, /manual[\s\S]*strategy[\s\S]*allocation[\s\S]*review/i);
  assert.match(extensionReadme, /current[\s\S]*solid/i);
  assert.match(extensionReadme, /whole-trade[\s\S]*dashed/i);
  assert.match(extensionReadme, /profit[\s\S]*loss[\s\S]*bands/i);
  assert.match(extensionReadme, /EXCLUDING CHARGES/);
  assert.match(extensionReadme, /HISTORY GAP/);
  assert.match(extensionReadme, /stale[\s\S]*(last|previous|accepted)[\s\S]*evidence/i);
  assert.match(`${extensionReadme}\n${bridgeReadme}`, /read-only[\s\S]*no[- ]order/i);
});
