"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const content = require("./content.js");

const read = (name) => fs.readFileSync(path.join(__dirname, name), "utf8");

test("popup keeps chart toggle and refresh immediate, preserves approved glyph, and removes redundant branding", () => {
  const html = read("popup.html");
  const js = read("popup.js");

  assert.ok(html.indexOf('id="enabled"') < html.indexOf('id="refresh-all"'), "chart toggle precedes REFRESH ALL");
  assert.ok(html.indexOf('id="refresh-all"') < html.indexOf('id="risk-summary"'), "REFRESH ALL precedes risk content");
  assert.match(html, /class="header-refresh mono" id="refresh-all"/);
  assert.match(html, /class="refresh-glyph"/);
  assert.doesNotMatch(html, /class="refresh-icon"/);
  assert.match(html, />REFRESH ALL</);
  assert.doesNotMatch(html, />NIFTY OPTIONS</);
  assert.match(html, /TV axis contracts/);
  assert.doesNotMatch(html, /13 exact contracts/);
  assert.match(html, /id="coverage-from"/);
  assert.match(html, /id="coverage-to"/);
  assert.match(html, /id="confirm-coverage"/);
  assert.match(html, /id="advanced-panel" hidden/);
  assert.match(html, /ADVANCED · PLACEMENT &amp; HEALTH/);
  assert.match(html, /RETRY PLACEMENT/);
  assert.doesNotMatch(html, /OPEN FULL CHAIN|id="chain-panel"|id="chain"/);
  assert.doesNotMatch(js, /innerHTML/);
});

test("popup loads pure seller scripts before browser orchestration", () => {
  const html = read("popup.html");
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]);

  assert.deepEqual(scripts, [
    "theme.js", "seller-view-identity.js", "seller-risk.js", "seller-ledger.js", "tradebook-csv.js", "popup-view.js",
    "strategy-store.js", "strategy-panel.js", "popup.js"
  ]);
});

test("side panel exposes permanent strategy save, versions, split, restore, archive, and ledger history", () => {
  const html = read("popup.html");
  const js = read("popup.js");
  for (const id of [
    "strategy-manager", "strategy-preview-summary", "strategy-book-select", "strategy-save",
    "strategy-save-decision", "strategy-save-destination", "strategy-save-confirm",
    "strategy-versions", "strategy-split", "strategy-archive", "strategy-ledger-history"
  ]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /LEDGER HISTORY/);
  assert.match(js, /OptionsStrategyPanel\.commandForSave/);
  assert.match(js, /OptionsStrategyPanel\.commandForSplit/);
  assert.match(js, /OptionsStrategyPanel\.commandForRestore/);
  assert.match(js, /MUTATE_STRATEGY_BOOK/);
  assert.match(js, /GET_STRATEGY_PREVIEW_STATE/);
  assert.match(js, /CLEAR_STRATEGY_PREVIEW/);
  assert.match(js, /lastSelectedStrategyByContext/);
  assert.match(js, /OptionsStrategyStore\.resolveLastSelected/);
  assert.match(read("content.js"), /type:\s*"EXPIRE_DUE"/);
});

test("side panel exposes ladder and strategies as separate task views", () => {
  const html = read("popup.html");
  const js = read("popup.js");
  const css = read("popup.css");

  for (const id of [
    "panel-tab-ladder", "panel-tab-strategies", "ladder-view", "strategies-view",
    "strategy-dashboard", "new-strategy"
  ]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /role="tablist"/);
  assert.match(html, /MY STRATEGIES/);
  assert.match(js, /OptionsStrategyPanel\.dashboardModel/);
  assert.match(css, /--type-dashboard-title/);
  const section = css.slice(css.indexOf(".panel-tabs"));
  assert.doesNotMatch(section, /font-size:\s*\d/);
});

test("strategy manager reuses ARB Desk tokens without extra colors", () => {
  const css = read("popup.css");
  const section = css.slice(css.indexOf(".strategy-manager"));
  assert.match(section, /var\(--panel\)/);
  assert.match(section, /var\(--line/);
  assert.match(section, /var\(--accent\)/);
  assert.doesNotMatch(section, /#[0-9a-f]{3,8}\b/i);
});

test("side panel uses exact ARB Desk dark and light controls with matching native field scheme", () => {
  const css = read("popup.css");
  const themeCss = read("theme.css");

  assert.match(themeCss, /--bg:\s*#0a0a0a/);
  assert.match(themeCss, /--panel:\s*#111113/);
  assert.match(themeCss, /:root\[data-theme="light"\][\s\S]*?--bg:\s*#fafafa/);
  assert.match(themeCss, /:root\[data-theme="light"\][\s\S]*?--panel:\s*#ffffff/);
  assert.match(css, /select, input \{ color-scheme: dark; \}/);
  assert.match(css, /:root\[data-theme="light"\] select,[\s\S]*?color-scheme: light/);
});

test("content still accepts exact-axis placement retry", () => {
  const source = read("content.js");
  assert.match(source, /RETRY_LABEL_PLACEMENT/);
  assert.match(source, /controller\.place\(\)/);
});

function fixedDate(iso) {
  const timestamp = Date.parse(iso);
  return class FixedDate extends Date {
    constructor(value) { super(typeof value === "undefined" ? timestamp : value); }
    static now() { return timestamp; }
  };
}

function acceptedStorage({ acceptedAt = "2026-08-01T09:00:00+05:30", candidateId = "candidate-stored" } = {}) {
  const view = {
    version: 2, candidateId, acceptedAt, canPublish: true,
    priority: { kind: "risk", label: "CURRENT RISK" },
    currentRisk: { lower: "23,900.00", upper: "24,300.00" },
    wholeTrade: { lower: "23,875.00", upper: "24,325.00", status: "EXCLUDING CHARGES" },
    livePnl: "+₹750.00", maxProfit: "+₹14,300.00", maxLoss: "UNBOUNDED",
    whyMoved: [], warning: "MAXIMUM LOSS IS UNBOUNDED", legs: [], timeline: [], reviewChanges: [], tradeReviews: [],
    broker: { kind: "connected", label: "ZERODHA CONNECTED · TODAY", action: null },
    strategyId: "stored-strategy", strategyName: "Stored seller",
    expiry: "2026-08-25", daysToExpiry: 24, spot: "24,120.00",
    brokerUpdatedAt: acceptedAt, brokerSessionExpiresAt: "2026-08-02T00:30:00.000Z",
    provenance: {
      version: 1,
      contractIdentity: "NIFTY_EXACT_EXPIRY_V1",
      strategyId: "stored-strategy",
      expiry: "2026-08-25",
      candidateId
    }
  };
  const chain = storedChain("2026-08-25", 24120);
  return {
    expiry: "2026-08-25",
    selectedStrategyId: "stored-strategy",
    sellerSafetyLedger: {
      version: 1,
      strategies: [{
        id: "stored-strategy", name: "Stored seller", underlying: "NIFTY", expiry: "2026-08-25",
        allocations: [], fillIds: [], historyComplete: false,
        snapshots: [{ at: acceptedAt, candidateId, currentMap: { breakevens: [23900, 24300] } }]
      }],
      brokerPositions: [], importedTrades: [], tradeEvidence: [], tradeReviews: [], fillAssignments: [], fillDispositions: [],
      importBatches: [], coverageDeclarations: [], historyCheckpoints: [], historyGaps: [],
      allocationRevisions: [], reviewChanges: [], audit: []
    },
    sellerSafetyPending: null,
    sellerSafetyView: view,
    sellerSafetyChartView: view,
    sellerSafetyViewsByStrategy: { "stored-strategy": view },
    sellerSafetyChartViewsByStrategy: { "stored-strategy": view },
    sellerSafetyChain: chain,
    sellerSafetyChainsByExpiry: { "2026-08-25": chain }
  };
}

function multiStrategyStorage() {
  const storage = acceptedStorage();
  const baseView = storage.sellerSafetyView;
  const sameExpiryView = {
    ...structuredClone(baseView),
    candidateId: "candidate-same-expiry",
    strategyId: "same-expiry",
    strategyName: "Same expiry",
    currentRisk: { lower: "23,800.00", upper: "24,400.00" },
    provenance: {
      ...baseView.provenance,
      strategyId: "same-expiry",
      candidateId: "candidate-same-expiry"
    }
  };
  const septemberView = {
    ...structuredClone(baseView),
    candidateId: "candidate-september",
    strategyId: "september",
    strategyName: "September",
    expiry: "2026-09-01",
    currentRisk: { lower: "23,700.00", upper: "24,500.00" },
    provenance: {
      ...baseView.provenance,
      strategyId: "september",
      expiry: "2026-09-01",
      candidateId: "candidate-september"
    }
  };
  storage.sellerSafetyLedger.strategies.push(
    {
      id: "same-expiry", name: "Same expiry", underlying: "NIFTY", expiry: "2026-08-25",
      allocations: [], fillIds: [], snapshots: [{ at: baseView.acceptedAt, candidateId: sameExpiryView.candidateId }]
    },
    {
      id: "september", name: "September", underlying: "NIFTY", expiry: "2026-09-01",
      allocations: [], fillIds: [], snapshots: [{ at: baseView.acceptedAt, candidateId: septemberView.candidateId }]
    }
  );
  storage.sellerSafetyViewsByStrategy = {
    "stored-strategy": baseView,
    "same-expiry": sameExpiryView,
    september: septemberView
  };
  storage.sellerSafetyChartViewsByStrategy = structuredClone(storage.sellerSafetyViewsByStrategy);
  const septemberChain = storedChain("2026-09-01", 24220);
  storage.sellerSafetyChainsByExpiry["2026-09-01"] = septemberChain;
  return storage;
}

function storedChain(expiry, spot) {
  const atm = Math.round(spot / 50) * 50;
  return {
    version: 1,
    updatedAt: "2026-08-01T09:00:00+05:30",
    expiry,
    lotSize: 65,
    spot,
    rows: Array.from({ length: 13 }, (_, index) => ({
      strike: atm - 300 + index * 50,
      call: 200 - index,
      put: 100 + index
    }))
  };
}

function dailyReviewStorage() {
  const sellerLedger = require("./seller-ledger.js");
  let value = sellerLedger.emptyLedger();
  value = sellerLedger.createStrategy(value, {
    id: "stored-strategy", name: "Stored seller", underlying: "NIFTY", expiry: "2026-08-25"
  });
  value = sellerLedger.reconcilePositions(value, [{
    contractId: "NFO:NIFTY:2026-08-25:24100:CE", tradingsymbol: "NIFTY26AUG24100CE", exchange: "NFO",
    underlying: "NIFTY", expiry: "2026-08-25", strike: 24100, optionType: "CE",
    signedQuantity: -65, lotSize: 65, averagePrice: 358.8, lastPrice: 320, pnl: 2522
  }]);
  value = sellerLedger.allocateLots(value, {
    strategyId: "stored-strategy", contractId: "NFO:NIFTY:2026-08-25:24100:CE", signedLots: -1
  });
  const openingTrade = {
    id: "opening", contractId: "NFO:NIFTY:2026-08-25:24100:CE", tradingsymbol: "NIFTY26AUG24100CE",
    underlying: "NIFTY", exchange: "NFO", expiry: "2026-08-25", strike: 24100, optionType: "CE",
    transactionType: "SELL", quantity: 130, price: 358.8, timestamp: "2026-08-01T09:15:00+05:30"
  };
  value = sellerLedger.stageTradebookImport(value, {
    sourceKind: "ZERODHA_TRADEBOOK_CSV",
    batchFingerprint: "baseline-once",
    stagedAt: "2026-08-01T16:00:00+05:30",
    scope: { underlying: "NIFTY", expiry: "2026-08-25" },
    trades: [{
      ...openingTrade
    }]
  });
  value = sellerLedger.assignFillQuantity(value, {
    fillId: "opening", strategyId: "stored-strategy", quantity: 130, disposition: "STRATEGY",
    confirmedAt: "2026-08-01T16:01:00+05:30"
  });
  value = sellerLedger.confirmHistoryCoverage(value, {
    strategyId: "stored-strategy", batchFingerprint: "baseline-once", from: "2026-08-01", to: "2026-08-01",
    checkpointIds: [], confirmedAt: "2026-08-01T16:02:00+05:30"
  });
  value = sellerLedger.acceptSnapshot(value, {
    strategyId: "stored-strategy", snapshot: { at: "2026-08-01T16:00:00+05:30", candidateId: "baseline" }
  });
  return {
    expiry: "2026-08-25",
    selectedStrategyId: "stored-strategy",
    sellerSafetyLedger: value,
    sellerSafetyView: null,
    sellerSafetyChartView: null,
    sellerSafetyPending: null
  };
}

function popupHarness(initialStorage = {}, options = {}) {
  const listeners = new Map();
  const globalListeners = new Map();
  const requests = [];
  const chartMessages = [];
  const refreshEvents = [];
  const writes = [];
  const openedTabs = [];
  const strategyMutationMessages = [];
  const created = [];

  function makeNode(id = "", tagName = "div") {
    const node = {
      id,
      tagName: tagName.toUpperCase(),
      value: id === "expiry" ? "2026-08-25" : "",
      textContent: "",
      className: "",
      disabled: false,
      hidden: ["review-panel", "legs-panel", "timeline-panel", "advanced-panel"].includes(id),
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
        const all = [];
        const visit = (candidate) => {
          if (selector === "[data-allocation-contract]" && candidate.dataset?.allocationContract) all.push(candidate);
          if (selector === "[data-trade-review-id]" && candidate.dataset?.tradeReviewId) all.push(candidate);
          if (selector === "[data-trade-review-quantity]" && candidate.dataset?.tradeReviewQuantity) all.push(candidate);
          (candidate.children || []).forEach(visit);
        };
        this.children.forEach(visit);
        return all;
      }
    };
    created.push(node);
    return node;
  }

  const ids = [
    "refresh-all", "refresh-label", "expiry", "expiry-hint", "broker-line", "connect-zerodha",
    "risk-summary", "priority-label", "current-lower", "current-upper", "whole-lower", "whole-upper",
    "whole-status", "live-pnl", "max-profit", "max-loss", "why-moved", "warning", "placement-status",
    "review-panel", "strategy-name", "create-strategy", "strategy-bar", "selected-strategy", "allocation-list", "allocate-lots",
    "trade-review-list", "assign-trades",
    "tradebook-csv", "import-summary", "coverage-from", "coverage-to", "confirm-coverage", "accept-snapshot", "legs-toggle", "legs-panel", "legs-list",
    "timeline-toggle", "timeline-panel", "timeline-list", "advanced-toggle", "advanced-panel", "enabled",
    "retry-placement", "panel-tab-ladder", "panel-tab-strategies", "ladder-view", "strategies-view",
    "strategy-dashboard", "new-strategy"
  ];
  const nodes = new Map(ids.map((id) => [id, makeNode(id, id === "expiry" || id === "selected-strategy" ? "select" : "div")]));
  const response = (payload, ok = true, status = 200) => ({ ok, status, json: async () => payload });
  const storage = {
    enabled: false,
    expiry: "2026-08-25",
    sellerSafetyLedger: null,
    selectedStrategyId: "",
    sellerSafetyView: null,
    sellerSafetyPending: null,
    strategyBook: require("./strategy-store.js").emptyBook(),
    sellerSafetyViewsByStrategy: {},
    sellerSafetyChartViewsByStrategy: {},
    brokerStrategyBootstrapVersion: 1,
    ...initialStorage
  };
  const defaultRefreshPayload = {
    updatedAt: "2026-08-01T03:50:00.000Z",
    positions: [{
      contractId: "NFO:NIFTY:2026-08-25:24100:CE", tradingsymbol: "NIFTY26AUG24100CE", exchange: "NFO",
      underlying: "NIFTY", expiry: "2026-08-25", strike: 24100, optionType: "CE",
      signedQuantity: -65, lotSize: 65, averagePrice: 100, lastPrice: 90, pnl: 650
    }],
    trades: [],
    chain: { expiry: "2026-08-25", lotSize: 65, spot: 24120, rows: [] }
  };
  const refreshPayloads = options.refreshPayloads || [options.refreshPayload || defaultRefreshPayload];
  let refreshIndex = 0;
  const brokerStatuses = options.brokerStatuses || [options.brokerStatus || {
    configured: true, connected: true, expiresAt: "2026-08-02T00:30:00.000Z"
  }];
  let brokerStatusIndex = 0;
  const sandbox = {
    AbortController,
    NiftySellerRisk: require("./seller-risk.js"),
    NiftySellerLedger: require("./seller-ledger.js"),
    NiftyTradebookCsv: require("./tradebook-csv.js"),
    NiftySellerPopupView: require("./popup-view.js"),
    NiftySellerViewIdentity: require("./seller-view-identity.js"),
    chrome: {
      runtime: {
        async sendMessage(message) {
          if (message?.type !== "MUTATE_STRATEGY_BOOK") return { ok: false, error: "unexpected message" };
          strategyMutationMessages.push(structuredClone(message.command));
          storage.strategyBook = require("./strategy-store.js").applyCommand(storage.strategyBook, message.command);
          const responseBook = structuredClone(storage.strategyBook);
          if (typeof options.concurrentStrategyBook === "function") {
            storage.strategyBook = options.concurrentStrategyBook(structuredClone(responseBook));
          }
          return { ok: true, strategyBook: responseBook };
        }
      },
      storage: { local: {
        async get(defaults) { return { ...defaults, ...storage }; },
        async set(next) { Object.assign(storage, next); writes.push(structuredClone(next)); }
      } },
      tabs: {
        async query() { return [{ id: 7, url: "https://www.tradingview.com/chart/test/" }]; },
        async sendMessage(tabId, message) {
          chartMessages.push({ tabId, message: structuredClone(message) });
          refreshEvents.push(`message:${message?.type || "unknown"}`);
          if (options.messageError) throw options.messageError;
          if (message?.type === "GET_STRATEGY_PREVIEW_STATE") return {
            ok: true,
            selectedIds: [],
            compare: false,
            instrumentKey: "NSE_DLY:NIFTY",
            underlying: "NIFTY",
            expiry: "2026-08-25",
            timeZone: "Asia/Kolkata"
          };
          return { ok: true };
        },
        async create(input) { openedTabs.push(input); }
      }
    },
    document: {
      querySelector(selector) { return nodes.get(selector.replace(/^#/, "")); },
      querySelectorAll(selector) {
        const container = selector === "[data-trade-review-id]" || selector === "[data-trade-review-quantity]"
          ? "trade-review-list" : "allocation-list";
        return nodes.get(container).querySelectorAll(selector);
      },
      createElement(tagName) { return makeNode("", tagName); }
    },
    fetch: async (url) => {
      requests.push(String(url));
      if (String(url).includes("/api/health")) return response({ status: "ok" });
      if (String(url).includes("/api/nifty-expiries")) return response({ expiries: options.expiries || [{ expiry: "2026-08-25", daysToExpiry: 24 }] });
      if (String(url).includes("/api/zerodha/status")) {
        const status = brokerStatuses[Math.min(brokerStatusIndex, brokerStatuses.length - 1)];
        brokerStatusIndex += 1;
        return response(status);
      }
      if (String(url).includes("/api/seller-refresh")) {
        refreshEvents.push("network:seller-refresh");
        const payload = refreshPayloads[Math.min(refreshIndex, refreshPayloads.length - 1)];
        refreshIndex += 1;
        if (payload?.__httpError) return response({ error: payload.error, kind: payload.kind }, false, payload.status || 502);
        return response(payload);
      }
      if (String(url).includes("/api/zerodha/login-url")) return response({ loginUrl: "https://kite.zerodha.com/connect/login?v=3&api_key=public-key" });
      return response({ error: "unexpected request" }, false, 404);
    },
    Intl,
    console,
    Date: options.Date || Date,
    URL,
    setTimeout,
    clearTimeout,
    structuredClone,
    addEventListener(type, listener) { globalListeners.set(type, listener); }
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(read("popup.js"), sandbox);
  return { listeners, globalListeners, requests, chartMessages, refreshEvents, writes, openedTabs, nodes, storage, created,
    strategyMutationMessages };
}

async function settle() {
  await new Promise(setImmediate);
  await new Promise(setImmediate);
  await new Promise(setImmediate);
}

test("initialization reads health, expiries, and Zerodha status without seller refresh", async () => {
  const harness = popupHarness();
  await settle();

  assert.equal(harness.requests.filter((url) => url.includes("/api/health")).length, 1);
  assert.equal(harness.requests.filter((url) => url.includes("/api/nifty-expiries")).length, 1);
  assert.equal(harness.requests.filter((url) => url.includes("/api/zerodha/status")).length, 1);
  assert.equal(harness.requests.filter((url) => url.includes("/api/seller-refresh")).length, 0);
  assert.equal(harness.storage.brokerConnection.connected, true);
  assert.equal(harness.storage.brokerConnection.expiresAt, "2026-08-02T00:30:00.000Z");
});

test("connected broker bootstraps missing strategy without manual refresh", async () => {
  const harness = popupHarness({ brokerStrategyBootstrapVersion: 0 });
  await settle();
  await settle();

  assert.equal(harness.requests.filter((url) => url.includes("/api/seller-refresh")).length, 1);
  assert.equal(harness.strategyMutationMessages.length, 1);
  assert.equal(harness.strategyMutationMessages[0].type, "SYNC_BROKER_POSITIONS");
  assert.equal(harness.storage.brokerStrategyBootstrapVersion, 1);
});

test("popup never re-persists a strategy mutation response over a newer background book", async () => {
  const harness = popupHarness({ brokerStrategyBootstrapVersion: 0 }, {
    concurrentStrategyBook(responseBook) {
      return { ...responseBook, nextSequence: 99 };
    }
  });
  await settle();
  await settle();

  assert.equal(harness.strategyMutationMessages.length, 1);
  assert.equal(harness.storage.strategyBook.nextSequence, 99,
    "the background's newer B2 book must survive the popup receiving stale B1");
  assert.equal(harness.writes.some((write) => Object.hasOwn(write, "strategyBook")), false,
    "background-owned strategy mutations must not be written back by the popup");
  assert.equal(harness.writes.some((write) => Object.hasOwn(write, "manualTradePlans")), false,
    "popup strategy mutation responses must not re-persist either versioned store");
});

test("strategies tab switches task view without mixing ladder controls into dashboard", async () => {
  const harness = popupHarness();
  await settle();

  await harness.listeners.get("panel-tab-strategies:click")();
  assert.equal(harness.nodes.get("strategies-view").hidden, false);
  assert.equal(harness.nodes.get("ladder-view").hidden, true);
  assert.equal(harness.nodes.get("panel-tab-strategies").getAttribute("aria-selected"), "true");
  assert.equal(harness.nodes.get("panel-tab-ladder").getAttribute("aria-selected"), "false");
});

test("strategy selector stays hidden until at least one strategy exists", async () => {
  const empty = popupHarness();
  await settle();
  assert.equal(empty.nodes.get("strategy-bar").hidden, true);

  const populated = popupHarness(acceptedStorage());
  await settle();
  assert.equal(populated.nodes.get("strategy-bar").hidden, false);
});

test("blank risk card stays hidden until a strategy exists", async () => {
  const empty = popupHarness();
  await settle();
  assert.equal(empty.nodes.get("risk-summary").hidden, true);

  const populated = popupHarness(acceptedStorage());
  await settle();
  assert.equal(populated.nodes.get("risk-summary").hidden, false);
});

test("one primary press requests one coordinated refresh and withholds changed map", async () => {
  const evidence = { canPublish: true, currentRisk: { lower: "old" } };
  const harness = popupHarness({ sellerSafetyView: evidence, sellerSafetyChartView: evidence });
  await settle();

  await harness.listeners.get("refresh-all:click")();

  assert.equal(harness.requests.filter((url) => url.includes("/api/seller-refresh?expiry=2026-08-25")).length, 1);
  assert.equal(harness.requests.filter((url) => /upstox|zerodha\/positions|zerodha\/trades/.test(url)).length, 0);
  assert.deepEqual(structuredClone(harness.storage.sellerSafetyView), evidence);
  assert.equal(harness.storage.sellerSafetyChartView.canPublish, false);
  assert.equal(harness.storage.sellerSafetyChartView.priority.label, "REVIEW POSITION CHANGES");
  assert.ok(harness.storage.sellerSafetyPending, "validated refresh persists pending candidate");
  assert.equal(typeof harness.storage.sellerSafetyPending.candidateId, "string");
  assert.equal(harness.storage.sellerSafetyPending.chain.expiry, "2026-08-25");
  assert.equal(harness.nodes.get("priority-label").textContent, "REVIEW POSITION CHANGES");
  assert.equal(harness.nodes.get("review-panel").hidden, false);
  assert.equal(harness.strategyMutationMessages.length, 1);
  assert.equal(harness.strategyMutationMessages[0].type, "SYNC_BROKER_POSITIONS");
  assert.equal(harness.strategyMutationMessages[0].instrumentKey, "BROKER:NFO:NIFTY");
  assert.deepEqual(harness.strategyMutationMessages[0].positions, harness.storage.sellerSafetyLedger.reviewChanges
    .map((change) => change.position));
});

test("real REFRESH ALL clears chart selection before successful or failed network refresh", async () => {
  const cases = [
    {},
    { refreshPayload: { __httpError: true, status: 429, kind: "rate_limit", error: "Upstream rate limit." } }
  ];

  for (const options of cases) {
    const harness = popupHarness(acceptedStorage(), options);
    await settle();
    await harness.listeners.get("refresh-all:click")();

    const expectedMessages = [{
      tabId: 7,
      message: { type: "CLEAR_BREAK_EVEN_SELECTION" }
    }];
    const expectedEvents = [
      "message:CLEAR_BREAK_EVEN_SELECTION",
      "network:seller-refresh"
    ];
    assert.deepEqual(harness.chartMessages, expectedMessages);
    assert.deepEqual(harness.refreshEvents, expectedEvents);
  }
});

test("chart-clear delivery failure stays isolated from seller refresh", async () => {
  const harness = popupHarness({}, { messageError: new Error("content script unavailable") });
  await settle();

  await harness.listeners.get("refresh-all:click")();

  assert.equal(harness.requests.filter((url) => url.includes("/api/seller-refresh")).length, 1);
  assert.deepEqual(harness.refreshEvents, [
    "message:CLEAR_BREAK_EVEN_SELECTION",
    "network:seller-refresh"
  ]);
});

test("changed-position refresh preserves accepted evidence across popup reopen while chart publication is withheld", async () => {
  const first = popupHarness(acceptedStorage());
  await settle();

  await first.listeners.get("refresh-all:click")();

  assert.equal(first.storage.sellerSafetyView.currentRisk.lower, "23,900.00");
  assert.equal(first.storage.sellerSafetyChartView.canPublish, false);
  assert.equal(first.nodes.get("current-lower").textContent, "23,900.00");
  assert.equal(first.nodes.get("priority-label").textContent, "REVIEW POSITION CHANGES");
  assert.equal(first.nodes.get("review-panel").hidden, false);

  const reopened = popupHarness(structuredClone(first.storage));
  await settle();

  assert.equal(reopened.storage.sellerSafetyView.currentRisk.lower, "23,900.00");
  assert.equal(reopened.storage.sellerSafetyChartView.canPublish, false);
  assert.equal(reopened.nodes.get("current-lower").textContent, "23,900.00");
  assert.equal(reopened.nodes.get("priority-label").textContent, "REVIEW POSITION CHANGES");
});

test("legacy accepted view preserves operator evidence but migrates chart publication on init and reopen", async () => {
  const initial = acceptedStorage();
  const legacy = structuredClone(initial.sellerSafetyView);
  legacy.version = 1;
  delete legacy.provenance;
  initial.sellerSafetyView = legacy;
  initial.sellerSafetyChartView = legacy;
  initial.sellerSafetyViewsByStrategy = { "stored-strategy": legacy };
  initial.sellerSafetyChartViewsByStrategy = { "stored-strategy": legacy };

  const first = popupHarness(initial);
  await settle();

  assert.deepEqual(structuredClone(first.storage.sellerSafetyView), legacy,
    "operator evidence survives identity migration");
  assert.deepEqual(structuredClone(first.storage.sellerSafetyViewsByStrategy["stored-strategy"]), legacy);
  assert.equal(first.storage.sellerSafetyChartView.canPublish, false);
  assert.equal(first.storage.sellerSafetyChartView.state, "LEGACY_IDENTITY_REVIEW_REQUIRED");
  assert.equal(first.storage.sellerSafetyChartViewsByStrategy["stored-strategy"].state,
    "LEGACY_IDENTITY_REVIEW_REQUIRED");
  assert.equal(first.nodes.get("current-lower").textContent, "23,900.00");
  assert.equal(first.nodes.get("priority-label").textContent, "LEGACY IDENTITY REVIEW REQUIRED");

  const reopened = popupHarness(structuredClone(first.storage));
  await settle();
  assert.deepEqual(structuredClone(reopened.storage.sellerSafetyView), legacy);
  assert.equal(reopened.storage.sellerSafetyChartView.state, "LEGACY_IDENTITY_REVIEW_REQUIRED");
  assert.equal(reopened.nodes.get("priority-label").textContent, "LEGACY IDENTITY REVIEW REQUIRED");
});

test("content load independently gates an unversioned accepted chart and places zero risk layers", async () => {
  const legacy = structuredClone(acceptedStorage().sellerSafetyView);
  legacy.version = 1;
  delete legacy.provenance;
  assert.equal(typeof content.normalizeStoredRiskViews, "function");
  const normalized = content.normalizeStoredRiskViews({
    sellerSafetyView: legacy,
    sellerSafetyChartView: legacy
  });
  assert.deepEqual(normalized.sellerSafetyView, legacy);
  assert.equal(normalized.sellerSafetyChartView.state, "LEGACY_IDENTITY_REVIEW_REQUIRED");
  assert.equal(normalized.sellerSafetyChartView.canPublish, false);

  let placements = 0;
  let requests = 0;
  const controller = content.createLadderController({
    expiry: "2026-08-25",
    now: () => Date.parse("2026-08-01T09:05:00+05:30"),
    chainSnapshot: storedChain("2026-08-25", 24120),
    riskView: legacy,
    fetchChain: async () => { requests += 1; throw new Error("network forbidden"); },
    captureAxisScale: async () => ({
      ok: true,
      gridGapPx: 20,
      observationSignature: "stable",
      axisPairs: [{ price: 24400, y: 100 }, { price: 23800, y: 220 }]
    }),
    renderRows: () => {},
    placeRows: () => ({ riskLayout: { labelRight: 640 } }),
    placeRisk: () => { placements += 1; return true; }
  });
  assert.equal(await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour"), true);
  assert.equal(requests, 0);
  assert.equal(placements, 0);
  controller.invalidate();
});

test("failed REFRESH ALL immediately withholds chart while accepted evidence survives reopen", async () => {
  const initial = acceptedStorage();
  const harness = popupHarness(initial, {
    refreshPayload: { __httpError: true, status: 429, kind: "rate_limit", error: "Upstream rate limit." }
  });
  await settle();

  await harness.listeners.get("refresh-all:click")();

  assert.equal(harness.requests.filter((url) => url.includes("/api/seller-refresh")).length, 1);
  assert.equal(harness.storage.sellerSafetyView.candidateId, "candidate-stored");
  assert.equal(harness.storage.sellerSafetyViewsByStrategy["stored-strategy"].candidateId, "candidate-stored");
  assert.equal(harness.storage.sellerSafetyChartView.canPublish, false);
  assert.equal(harness.storage.sellerSafetyChartView.state, "REFRESH_FAILED");
  assert.equal(harness.storage.sellerSafetyChartView.priority.label, "STALE · REFRESH FAILED");
  assert.equal(harness.storage.sellerSafetyPending, null);

  const reopened = popupHarness(structuredClone(harness.storage));
  await settle();
  assert.equal(reopened.nodes.get("current-lower").textContent, "23,900.00");
  assert.equal(reopened.storage.sellerSafetyChartView.state, "REFRESH_FAILED");
});

test("strategy switch restores same-expiry and September accepted views without refresh or global destruction", async () => {
  const initial = multiStrategyStorage();
  const options = {
    expiries: [
      { expiry: "2026-08-25", daysToExpiry: 24 },
      { expiry: "2026-09-01", daysToExpiry: 31 }
    ]
  };
  const harness = popupHarness(initial, { ...options, Date: fixedDate("2026-08-01T09:05:00+05:30") });
  await settle();

  const selector = harness.nodes.get("selected-strategy");
  assert.equal(selector.children.length, 4, "selector lists all strategies plus placeholder");
  await harness.listeners.get("selected-strategy:change")({ target: { value: "same-expiry" } });
  assert.equal(harness.storage.sellerSafetyView.candidateId, "candidate-same-expiry");
  assert.equal(harness.nodes.get("current-lower").textContent, "23,800.00");

  await harness.listeners.get("selected-strategy:change")({ target: { value: "september" } });
  assert.equal(harness.storage.expiry, "2026-09-01");
  assert.equal(harness.storage.sellerSafetyView.candidateId, "candidate-september");
  assert.equal(harness.storage.sellerSafetyChartView.candidateId, "candidate-september");
  assert.equal(Object.keys(harness.storage.sellerSafetyViewsByStrategy).length, 3);
  assert.equal(harness.requests.filter((url) => url.includes("/api/seller-refresh")).length, 0);

  const reopened = popupHarness(structuredClone(harness.storage), { ...options, Date: fixedDate("2026-08-01T09:05:00+05:30") });
  await settle();
  assert.equal(reopened.nodes.get("current-lower").textContent, "23,700.00");
  assert.equal(reopened.storage.sellerSafetyViewsByStrategy["stored-strategy"].candidateId, "candidate-stored");
});

test("popup storage and content controller restore August to September cached view without requests", async () => {
  const initial = multiStrategyStorage();
  const august = storedChain("2026-08-25", 24120);
  const september = storedChain("2026-09-01", 24220);
  initial.sellerSafetyChain = august;
  initial.sellerSafetyChainsByExpiry = {
    "2026-08-25": august,
    "2026-09-01": september
  };
  const harness = popupHarness(initial, {
    Date: fixedDate("2026-08-01T09:05:00+05:30"),
    expiries: [
      { expiry: "2026-08-25", daysToExpiry: 24 },
      { expiry: "2026-09-01", daysToExpiry: 31 }
    ]
  });
  await settle();

  await harness.listeners.get("selected-strategy:change")({ target: { value: "september" } });
  assert.equal(harness.storage.sellerSafetyChain.expiry, "2026-09-01");
  assert.equal(harness.storage.sellerSafetyChartView.candidateId, "candidate-september");
  assert.equal(harness.requests.filter((url) => /seller-refresh|nifty-chain/.test(url)).length, 0);

  let requests = 0;
  const placements = [];
  const controller = content.createLadderController({
    expiry: "2026-08-25",
    chainSnapshot: august,
    chainSnapshotsByExpiry: harness.storage.sellerSafetyChainsByExpiry,
    riskView: initial.sellerSafetyChartView,
    now: () => Date.parse("2026-08-01T09:05:00+05:30"),
    fetchChain: async () => { requests += 1; throw new Error("network forbidden"); },
    captureAxisScale: async () => ({
      ok: true,
      gridGapPx: 20,
      observationSignature: "stable",
      axisPairs: [{ price: 24500, y: 100 }, { price: 23800, y: 240 }]
    }),
    renderRows: () => {},
    placeRows: () => ({ riskLayout: { labelRight: 640 } }),
    placeRisk: (view) => { placements.push(view.candidateId); return true; }
  });
  assert.equal(await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour"), true);
  assert.equal(await controller.setExpiry("2026-09-01"), true,
    "validated exact-expiry cache is available after expiry switch");
  controller.setRiskView(harness.storage.sellerSafetyChartView);
  assert.equal(await controller.rebuild("1h"), true);
  assert.equal(controller.chain().expiry, "2026-09-01");
  assert.equal(placements.at(-1), "candidate-september");
  assert.equal(requests, 0);
  controller.invalidate();
});

test("content controller rejects a valid snapshot for the wrong active expiry without a request", () => {
  let requests = 0;
  const controller = content.createLadderController({
    expiry: "2026-08-25",
    now: () => Date.parse("2026-08-01T09:05:00+05:30"),
    fetchChain: async () => { requests += 1; return storedChain("2026-08-25", 24120); }
  });

  assert.equal(controller.setChainSnapshot(storedChain("2026-09-01", 24220)), false);
  assert.equal(controller.hasCachedChain(), false);
  assert.equal(requests, 0);
  controller.invalidate();
});

test("popup withholds a stale different-expiry cache without a request", async () => {
  const initial = multiStrategyStorage();
  initial.sellerSafetyChainsByExpiry["2026-09-01"].updatedAt = "2026-08-01T08:00:00+05:30";
  const harness = popupHarness(initial, {
    Date: fixedDate("2026-08-01T09:05:00+05:30"),
    expiries: [
      { expiry: "2026-08-25", daysToExpiry: 24 },
      { expiry: "2026-09-01", daysToExpiry: 31 }
    ]
  });
  await settle();

  await harness.listeners.get("selected-strategy:change")({ target: { value: "september" } });
  assert.equal(harness.storage.sellerSafetyChain, null);
  assert.equal(harness.storage.sellerSafetyChartView, null);
  assert.equal(harness.requests.filter((url) => /seller-refresh|nifty-chain/.test(url)).length, 0);
});

test("CSV import stays staged until explicit quantity dispositions and coverage confirmation", async () => {
  const harness = popupHarness({}, { Date: fixedDate("2026-08-02T09:00:00+05:30") });
  await settle();
  await harness.listeners.get("refresh-all:click")();
  harness.nodes.get("strategy-name").value = "August seller";
  await harness.listeners.get("create-strategy:click")();
  const allocation = harness.nodes.get("allocation-list").querySelectorAll("[data-allocation-contract]")[0];
  allocation.value = "-1";
  await harness.listeners.get("allocate-lots:click")();

  const csvText = "trade_id,order_id,exchange,tradingsymbol,transaction_type,quantity,average_price,fill_timestamp,expiry\n" +
    "owned,order-1,NFO,NIFTY26AUG24100CE,SELL,65,100,2026-08-01T09:15:00+05:30,2026-08-25\n";
  harness.nodes.get("tradebook-csv").files = [{ name: "tradebook.csv", text: async () => csvText }];
  await harness.listeners.get("tradebook-csv:change")({ target: harness.nodes.get("tradebook-csv") });

  assert.equal(harness.storage.sellerSafetyLedger.importedTrades.length, 1);
  assert.equal(harness.storage.sellerSafetyLedger.fillAssignments.length, 0);
  assert.equal(harness.storage.sellerSafetyLedger.coverageDeclarations.length, 0);
  assert.equal(harness.storage.sellerSafetyLedger.tradeReviews[0].remainingQuantity, 65);

  const owner = harness.nodes.get("trade-review-list").querySelectorAll("[data-trade-review-id]")[0];
  const quantity = harness.nodes.get("trade-review-list").querySelectorAll("[data-trade-review-quantity]")[0];
  owner.value = harness.storage.selectedStrategyId;
  quantity.value = "65";
  await harness.listeners.get("assign-trades:click")();
  assert.equal(harness.storage.sellerSafetyLedger.fillAssignments[0].quantity, 65);
  assert.equal(harness.storage.sellerSafetyLedger.coverageDeclarations.length, 0);

  harness.nodes.get("coverage-from").value = "2026-08-01";
  harness.nodes.get("coverage-to").value = "2026-08-01";
  await harness.listeners.get("confirm-coverage:click")();
  assert.equal(harness.storage.sellerSafetyLedger.coverageDeclarations.length, 1);
});

test("REFRESH ALL persists validated chain rows for chart consumption without a second chain request", async () => {
  const rows = Array.from({ length: 13 }, (_, index) => ({
    strike: 23800 + index * 50,
    call: 200 - index,
    put: 100 + index
  }));
  const harness = popupHarness({}, {
    refreshPayload: {
      updatedAt: "2026-08-01T03:50:00.000Z",
      positions: [],
      trades: [],
      chain: { expiry: "2026-08-25", lotSize: 25, spot: 24120, rows }
    }
  });
  await settle();

  await harness.listeners.get("refresh-all:click")();

  assert.deepEqual(structuredClone(harness.storage.sellerSafetyChain), {
    version: 1,
    updatedAt: "2026-08-01T03:50:00.000Z",
    expiry: "2026-08-25",
    lotSize: 25,
    spot: 24120,
    rows
  });
  assert.equal(harness.requests.filter((url) => url.includes("/api/seller-refresh")).length, 1);
  assert.equal(harness.requests.filter((url) => url.includes("/api/nifty-chain")).length, 0);
});

test("REFRESH ALL rejects a chain snapshot with no authoritative lot-size metadata", async () => {
  const rows = Array.from({ length: 13 }, (_, index) => ({
    strike: 23800 + index * 50,
    call: 200 - index,
    put: 100 + index
  }));
  const harness = popupHarness({}, {
    refreshPayload: {
      updatedAt: "2026-08-01T03:50:00.000Z",
      positions: [],
      trades: [],
      chain: { expiry: "2026-08-25", spot: 24120, rows }
    }
  });
  await settle();

  await harness.listeners.get("refresh-all:click")();

  assert.equal(harness.storage.sellerSafetyChain, null);
  assert.equal(harness.storage.sellerSafetyPending, null);
  assert.match(harness.nodes.get("placement-status").textContent, /invalid seller refresh snapshot/i);
});

test("REFRESH ALL persists and deduplicates current-day trade IDs without silently assigning ownership", async () => {
  const bridgeTrade = {
    id: "bridge-trade-1", contractId: "NFO:NIFTY:2026-08-25:24100:CE", tradingsymbol: "NIFTY26AUG24100CE",
    underlying: "NIFTY", exchange: "NFO", expiry: "2026-08-25", strike: 24100, optionType: "CE",
    transactionType: "SELL", quantity: 65, price: 110, timestamp: "2026-08-01T09:15:00+05:30"
  };
  const payload = {
    updatedAt: "2026-08-01T03:50:00.000Z",
    positions: [{
      contractId: "NFO:NIFTY:2026-08-25:24100:CE", tradingsymbol: "NIFTY26AUG24100CE", exchange: "NFO",
      underlying: "NIFTY", expiry: "2026-08-25", strike: 24100, optionType: "CE",
      signedQuantity: -65, lotSize: 65, averagePrice: 100, lastPrice: 90, pnl: 650
    }],
    trades: [bridgeTrade],
    chain: { expiry: "2026-08-25", lotSize: 65, spot: 24120, rows: [] }
  };
  const harness = popupHarness({}, { refreshPayloads: [payload, payload] });
  await settle();

  await harness.listeners.get("refresh-all:click")();
  await harness.listeners.get("refresh-all:click")();

  assert.deepEqual(harness.storage.sellerSafetyLedger.importedTrades.map((trade) => trade.id), ["bridge-trade-1"]);
  assert.deepEqual(harness.storage.sellerSafetyLedger.tradeReviews.map((review) => review.fillId), ["bridge-trade-1"]);
  assert.equal(harness.storage.sellerSafetyLedger.fillAssignments.length, 0);
  assert.equal(harness.storage.sellerSafetyLedger.strategies.length, 0);
  assert.match(harness.nodes.get("placement-status").textContent, /TRADE OWNERSHIP.*REVIEW/i);
  assert.equal(harness.requests.filter((url) => url.includes("/api/seller-refresh")).length, 2);
});

test("operator explicitly assigns post-import daily trade once and unknown trades remain review-required", async () => {
  const daily = {
    id: "daily-reduction", contractId: "NFO:NIFTY:2026-08-25:24100:CE", tradingsymbol: "NIFTY26AUG24100CE",
    underlying: "NIFTY", exchange: "NFO", expiry: "2026-08-25", strike: 24100, optionType: "CE",
    transactionType: "BUY", quantity: 65, price: 340, timestamp: "2026-08-02T09:15:00+05:30"
  };
  const basePayload = {
    updatedAt: "2026-08-02T03:50:00.000Z",
    positions: [{
      contractId: "NFO:NIFTY:2026-08-25:24100:CE", tradingsymbol: "NIFTY26AUG24100CE", exchange: "NFO",
      underlying: "NIFTY", expiry: "2026-08-25", strike: 24100, optionType: "CE",
      signedQuantity: -65, lotSize: 65, averagePrice: 358.8, lastPrice: 320, pnl: 2522
    }],
    trades: [daily],
    chain: { expiry: "2026-08-25", lotSize: 65, spot: 24120, rows: [] }
  };
  const first = popupHarness(dailyReviewStorage(), {
    Date: fixedDate("2026-08-02T10:00:00+05:30"), refreshPayload: basePayload
  });
  await settle();
  await first.listeners.get("refresh-all:click")();

  assert.deepEqual(first.storage.sellerSafetyLedger.strategies[0].fillIds, ["opening"]);
  assert.deepEqual(first.storage.sellerSafetyLedger.tradeReviews.map((review) => review.fillId), ["daily-reduction"]);
  assert.equal(first.storage.sellerSafetyLedger.importBatches.length, 1);
  assert.equal(first.requests.filter((url) => url.includes("/api/seller-refresh")).length, 1);
  const owner = first.nodes.get("trade-review-list").querySelectorAll("[data-trade-review-id]")[0];
  assert.ok(owner, "daily trade renders an explicit owner control");
  assert.equal(owner.value, "", "popup cannot preselect or automatically allocate an owner");

  owner.value = "stored-strategy";
  const ownedQuantity = first.nodes.get("trade-review-list").querySelectorAll("[data-trade-review-quantity]")[0];
  ownedQuantity.value = "65";
  await first.listeners.get("assign-trades:click")();
  assert.deepEqual(first.storage.sellerSafetyLedger.tradeReviews, []);
  assert.deepEqual(first.storage.sellerSafetyLedger.strategies[0].fillIds, ["opening", "daily-reduction"]);
  assert.equal(first.storage.sellerSafetyLedger.importBatches.length, 1);
  assert.equal(first.requests.filter((url) => url.includes("/api/seller-refresh")).length, 1,
    "ownership action is local and makes no request");

  await first.listeners.get("accept-snapshot:click")();
  assert.equal(first.storage.sellerSafetyView.canPublish, true);
  assert.equal(first.storage.sellerSafetyView.wholeTrade.status, "EXCLUDING CHARGES");
  assert.equal(first.storage.sellerSafetyLedger.strategies[0].snapshots.length, 2);

  const unknown = {
    ...daily,
    id: "unknown-daily",
    transactionType: "SELL",
    timestamp: "2026-08-02T11:00:00+05:30"
  };
  const reopened = popupHarness(structuredClone(first.storage), {
    Date: fixedDate("2026-08-02T11:05:00+05:30"),
    refreshPayloads: [basePayload, { ...basePayload, updatedAt: "2026-08-02T05:35:00.000Z", trades: [daily, unknown] }]
  });
  await settle();
  await reopened.listeners.get("refresh-all:click")();
  assert.equal(reopened.storage.sellerSafetyLedger.importedTrades.length, 2);
  assert.deepEqual(reopened.storage.sellerSafetyLedger.tradeReviews, []);
  assert.deepEqual(reopened.storage.sellerSafetyLedger.strategies[0].fillIds, ["opening", "daily-reduction"]);

  await reopened.listeners.get("refresh-all:click")();
  assert.equal(reopened.storage.sellerSafetyLedger.importedTrades.length, 3);
  assert.deepEqual(reopened.storage.sellerSafetyLedger.tradeReviews.map((review) => review.fillId), ["unknown-daily"]);
  assert.deepEqual(reopened.storage.sellerSafetyLedger.strategies[0].fillIds, ["opening", "daily-reduction"]);
  assert.equal(reopened.requests.filter((url) => url.includes("/api/seller-refresh")).length, 2);
  assert.equal(reopened.requests.filter((url) => url.includes("/api/nifty-chain")).length, 0);
});

test("malformed refresh clears old candidate and cannot be accepted", async () => {
  const valid = {
    updatedAt: "2026-08-01T03:50:00.000Z",
    positions: [{
      contractId: "NFO:NIFTY:2026-08-25:24100:CE", tradingsymbol: "NIFTY26AUG24100CE", exchange: "NFO",
      underlying: "NIFTY", expiry: "2026-08-25", strike: 24100, optionType: "CE",
      signedQuantity: -65, lotSize: 65, averagePrice: 100, lastPrice: 90, pnl: 650
    }],
    trades: [],
    chain: { expiry: "2026-08-25", lotSize: 65, spot: 24120, rows: [] }
  };
  const malformed = { ...valid, trades: { not: "an array" } };
  const harness = popupHarness({}, { refreshPayloads: [valid, malformed] });
  await settle();
  await harness.listeners.get("refresh-all:click")();
  harness.nodes.get("strategy-name").value = "August seller";
  await harness.listeners.get("create-strategy:click")();
  const input = harness.nodes.get("allocation-list").querySelectorAll("[data-allocation-contract]")[0];
  input.value = "-1";
  await harness.listeners.get("allocate-lots:click")();

  await harness.listeners.get("refresh-all:click")();
  await harness.listeners.get("accept-snapshot:click")();

  assert.equal(harness.storage.sellerSafetyPending, null);
  assert.equal(harness.storage.sellerSafetyChartView.state, "REFRESH_FAILED");
  assert.equal(harness.storage.sellerSafetyChartView.canPublish, false);
  assert.equal(harness.storage.sellerSafetyLedger.strategies[0].snapshots.length, 0);
  assert.match(harness.nodes.get("placement-status").textContent, /PRESS REFRESH ALL/);
});

test("allocated pending review survives popup close and still withholds publication", async () => {
  const first = popupHarness();
  await settle();
  await first.listeners.get("refresh-all:click")();
  first.nodes.get("strategy-name").value = "August seller";
  await first.listeners.get("create-strategy:click")();
  const input = first.nodes.get("allocation-list").querySelectorAll("[data-allocation-contract]")[0];
  input.value = "-1";
  await first.listeners.get("allocate-lots:click")();
  assert.ok(first.storage.sellerSafetyPending, "allocation keeps pending candidate persisted");
  const candidateId = first.storage.sellerSafetyPending.candidateId;

  const reopened = popupHarness(structuredClone(first.storage));
  await settle();

  assert.equal(reopened.storage.sellerSafetyPending.candidateId, candidateId);
  assert.equal(reopened.storage.sellerSafetyView, null);
  assert.equal(reopened.nodes.get("priority-label").textContent, "REVIEW POSITION CHANGES");
  assert.equal(reopened.nodes.get("review-panel").hidden, false);
  assert.equal(reopened.nodes.get("current-lower").textContent, "—");
});

test("blank seller strategy name is rejected with a clear instruction and no write", async () => {
  const harness = popupHarness();
  await settle();
  const writesBefore = harness.writes.length;

  harness.nodes.get("strategy-name").value = "   ";
  await harness.listeners.get("create-strategy:click")();

  assert.equal(harness.storage.sellerSafetyLedger, null);
  assert.equal(harness.storage.selectedStrategyId, "");
  assert.equal(harness.writes.length, writesBefore);
  assert.equal(harness.nodes.get("placement-status").textContent, "ENTER A STRATEGY NAME FIRST");
});

test("explicit strategy, whole-lot allocation, CSV import, and acceptance publish one reviewed snapshot", async () => {
  const harness = popupHarness({}, { Date: fixedDate("2026-08-01T09:30:00+05:30") });
  await settle();
  await harness.listeners.get("refresh-all:click")();

  harness.nodes.get("strategy-name").value = "August seller";
  await harness.listeners.get("create-strategy:click")();
  const allocationInput = harness.nodes.get("allocation-list").querySelectorAll("[data-allocation-contract]")[0];
  assert.ok(allocationInput, "review renders per-contract allocation input");
  allocationInput.value = "-1";
  await harness.listeners.get("allocate-lots:click")();

  const csvText = "trade_id,order_id,exchange,tradingsymbol,transaction_type,quantity,average_price,fill_timestamp,expiry\n" +
    "fill-1,order-1,NFO,NIFTY26AUG24100CE,SELL,65,110,2026-08-01T09:15:00+05:30,2026-08-25\n";
  harness.nodes.get("tradebook-csv").files = [{ name: "tradebook.csv", text: async () => csvText }];
  await harness.listeners.get("tradebook-csv:change")({ target: harness.nodes.get("tradebook-csv") });
  const owner = harness.nodes.get("trade-review-list").querySelectorAll("[data-trade-review-id]")[0];
  const quantity = harness.nodes.get("trade-review-list").querySelectorAll("[data-trade-review-quantity]")[0];
  owner.value = harness.storage.selectedStrategyId;
  quantity.value = "65";
  await harness.listeners.get("assign-trades:click")();
  harness.nodes.get("coverage-from").value = "2026-08-01";
  harness.nodes.get("coverage-to").value = "2026-08-01";
  await harness.listeners.get("confirm-coverage:click")();
  await harness.listeners.get("accept-snapshot:click")();

  assert.equal(harness.storage.sellerSafetyLedger.strategies.length, 1);
  assert.equal(harness.storage.sellerSafetyLedger.strategies[0].allocations[0].signedLots, -1);
  assert.deepEqual(harness.storage.sellerSafetyLedger.strategies[0].fillIds, ["fill-1"]);
  assert.equal(harness.storage.sellerSafetyLedger.strategies[0].snapshots.length, 1);
  assert.equal(harness.storage.selectedStrategyId, harness.storage.sellerSafetyLedger.strategies[0].id);
  assert.equal(harness.storage.sellerSafetyView.canPublish, true);
  assert.equal(harness.storage.sellerSafetyPending, null);
  assert.equal(typeof harness.storage.sellerSafetyView.candidateId, "string");
  assert.equal(typeof harness.storage.sellerSafetyLedger.strategies[0].snapshots[0].candidateId, "string");
  assert.equal(harness.storage.sellerSafetyView.candidateId, harness.storage.sellerSafetyLedger.strategies[0].snapshots[0].candidateId);
  assert.equal(harness.storage.sellerSafetyView.currentRisk.lower, "24,200.00");
  assert.equal(harness.storage.sellerSafetyView.wholeTrade.lower, "24,210.00");
  assert.equal(harness.storage.sellerSafetyView.wholeTrade.status, "EXCLUDING CHARGES");
  assert.match(harness.nodes.get("import-summary").textContent, /1 fill staged/i);
});

test("stored accepted numbers survive while stale broker label is rebuilt", async () => {
  const harness = popupHarness(acceptedStorage(), {
    Date: fixedDate("2026-08-01T09:31:00+05:30"),
    brokerStatus: { configured: true, connected: true, expiresAt: "2026-08-01T06:00:00.000Z" }
  });
  await settle();

  assert.equal(harness.nodes.get("current-lower").textContent, "23,900.00");
  assert.match(harness.nodes.get("broker-line").textContent, /ZERODHA STALE/);
  assert.doesNotMatch(harness.nodes.get("broker-line").textContent, /CONNECTED · TODAY/);
});

test("stored accepted numbers survive while disconnected broker action is rebuilt", async () => {
  const storage = acceptedStorage({ acceptedAt: "2026-08-01T09:25:00+05:30" });
  const harness = popupHarness(storage, {
    Date: fixedDate("2026-08-01T09:30:00+05:30"),
    brokerStatus: { configured: true, connected: false, expiresAt: null }
  });
  await settle();

  assert.equal(harness.nodes.get("current-lower").textContent, "23,900.00");
  assert.match(harness.nodes.get("broker-line").textContent, /DISCONNECTED/);
  assert.equal(harness.nodes.get("connect-zerodha").hidden, false);
});

test("panel focus rechecks broker status after connection completed outside panel", async () => {
  const harness = popupHarness(acceptedStorage(), {
    brokerStatuses: [
      { configured: true, connected: false, expiresAt: null },
      { configured: true, connected: true, expiresAt: "2027-08-04T00:30:00.000Z" }
    ]
  });
  await settle();

  assert.match(harness.nodes.get("broker-line").textContent, /DISCONNECTED/);

  await harness.globalListeners.get("focus")();

  assert.doesNotMatch(harness.nodes.get("broker-line").textContent, /DISCONNECTED/);
  assert.equal(harness.nodes.get("connect-zerodha").hidden, true);
  assert.equal(harness.storage.brokerConnection.connected, true);
  assert.equal(harness.storage.brokerConnection.expiresAt, "2027-08-04T00:30:00.000Z");
  assert.equal(harness.requests.filter((url) => url.includes("/api/zerodha/status")).length, 2);
  assert.equal(harness.requests.filter((url) => url.includes("/api/seller-refresh")).length, 0);
});

test("connect action opens only bridge-provided official login URL", async () => {
  const harness = popupHarness();
  await settle();

  await harness.listeners.get("connect-zerodha:click")();

  assert.equal(harness.openedTabs.length, 1);
  assert.equal(harness.openedTabs[0].url, "https://kite.zerodha.com/connect/login?v=3&api_key=public-key");
  assert.equal(harness.storage.brokerConnectPending, true);
});

test("successful explicit broker connection performs one coordinated strategy refresh", async () => {
  const harness = popupHarness({ brokerConnectPending: true });
  await settle();
  await settle();

  assert.equal(harness.storage.brokerConnectPending, false);
  assert.equal(harness.requests.filter((url) => url.includes("/api/seller-refresh")).length, 1);
  assert.equal(harness.strategyMutationMessages.length, 1);
  assert.equal(harness.strategyMutationMessages[0].type, "SYNC_BROKER_POSITIONS");
});
