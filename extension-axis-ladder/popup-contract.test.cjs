"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const read = (name) => fs.readFileSync(path.join(__dirname, name), "utf8");

test("popup keeps refresh immediate, preserves approved glyph, and removes full-chain UI", () => {
  const html = read("popup.html");
  const js = read("popup.js");

  assert.ok(html.indexOf('id="refresh-all"') < html.indexOf('id="risk-summary"'), "REFRESH ALL precedes risk content");
  assert.match(html, /class="header-refresh mono" id="refresh-all"/);
  assert.match(html, /class="refresh-glyph"/);
  assert.doesNotMatch(html, /class="refresh-icon"/);
  assert.match(html, />REFRESH ALL</);
  assert.match(html, /id="advanced-panel" hidden/);
  assert.match(html, /ADVANCED · PLACEMENT &amp; HEALTH/);
  assert.match(html, /RETRY PLACEMENT/);
  assert.doesNotMatch(html, /OPEN FULL CHAIN|id="chain-panel"|id="chain"/);
  assert.doesNotMatch(js, /innerHTML/);
});

test("popup loads pure seller scripts before browser orchestration", () => {
  const html = read("popup.html");
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]);

  assert.deepEqual(scripts, ["seller-risk.js", "seller-ledger.js", "tradebook-csv.js", "popup-view.js", "popup.js"]);
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
      brokerPositions: [], importedTrades: [], fillAssignments: [], importBatches: [], historyGaps: [],
      allocationRevisions: [], reviewChanges: [], audit: []
    },
    sellerSafetyPending: null,
    sellerSafetyView: {
      version: 1, candidateId, acceptedAt, canPublish: true,
      priority: { kind: "risk", label: "CURRENT RISK" },
      currentRisk: { lower: "23,900.00", upper: "24,300.00" },
      wholeTrade: { lower: "23,875.00", upper: "24,325.00", status: "EXCLUDING CHARGES" },
      livePnl: "+₹750.00", maxProfit: "+₹14,300.00", maxLoss: "UNBOUNDED",
      whyMoved: [], warning: "MAXIMUM LOSS IS UNBOUNDED", legs: [], timeline: [], reviewChanges: [],
      broker: { kind: "connected", label: "ZERODHA CONNECTED · TODAY", action: null },
      expiry: "2026-08-25", daysToExpiry: 24, spot: "24,120.00"
    }
  };
}

function popupHarness(initialStorage = {}, options = {}) {
  const listeners = new Map();
  const requests = [];
  const writes = [];
  const openedTabs = [];
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
    "review-panel", "strategy-name", "create-strategy", "selected-strategy", "allocation-list", "allocate-lots",
    "tradebook-csv", "import-summary", "accept-snapshot", "legs-toggle", "legs-panel", "legs-list",
    "timeline-toggle", "timeline-panel", "timeline-list", "advanced-toggle", "advanced-panel", "enabled",
    "retry-placement"
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
    ...initialStorage
  };
  const defaultRefreshPayload = {
    updatedAt: "2026-08-01T03:50:00.000Z",
    positions: [{
      contractId: "NFO:NIFTY26AUG24100CE", tradingsymbol: "NIFTY26AUG24100CE", exchange: "NFO",
      underlying: "NIFTY", expiry: "2026-08-25", strike: 24100, optionType: "CE",
      signedQuantity: -65, lotSize: 65, averagePrice: 100, lastPrice: 90, pnl: 650
    }],
    trades: [],
    chain: { expiry: "2026-08-25", spot: 24120, rows: [] }
  };
  const refreshPayloads = options.refreshPayloads || [options.refreshPayload || defaultRefreshPayload];
  let refreshIndex = 0;
  const sandbox = {
    AbortController,
    NiftySellerRisk: require("./seller-risk.js"),
    NiftySellerLedger: require("./seller-ledger.js"),
    NiftyTradebookCsv: require("./tradebook-csv.js"),
    NiftySellerPopupView: require("./popup-view.js"),
    chrome: {
      storage: { local: {
        async get(defaults) { return { ...defaults, ...storage }; },
        async set(next) { Object.assign(storage, next); writes.push(structuredClone(next)); }
      } },
      tabs: {
        async query() { return [{ id: 7, url: "https://www.tradingview.com/chart/test/" }]; },
        async sendMessage() { return { ok: true }; },
        async create(input) { openedTabs.push(input); }
      }
    },
    document: {
      querySelector(selector) { return nodes.get(selector.replace(/^#/, "")); },
      querySelectorAll(selector) { return nodes.get("allocation-list").querySelectorAll(selector); },
      createElement(tagName) { return makeNode("", tagName); }
    },
    fetch: async (url) => {
      requests.push(String(url));
      if (String(url).includes("/api/health")) return response({ status: "ok" });
      if (String(url).includes("/api/nifty-expiries")) return response({ expiries: [{ expiry: "2026-08-25", daysToExpiry: 24 }] });
      if (String(url).includes("/api/zerodha/status")) return response(options.brokerStatus || {
        configured: true, connected: true, expiresAt: "2026-08-02T00:30:00.000Z"
      });
      if (String(url).includes("/api/seller-refresh")) {
        const payload = refreshPayloads[Math.min(refreshIndex, refreshPayloads.length - 1)];
        refreshIndex += 1;
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
    structuredClone
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(read("popup.js"), sandbox);
  return { listeners, requests, writes, openedTabs, nodes, storage, created };
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
});

test("one primary press requests one coordinated refresh and withholds changed map", async () => {
  const harness = popupHarness({ sellerSafetyView: { canPublish: true, currentRisk: { lower: "old" } } });
  await settle();

  await harness.listeners.get("refresh-all:click")();

  assert.equal(harness.requests.filter((url) => url.includes("/api/seller-refresh?expiry=2026-08-25")).length, 1);
  assert.equal(harness.requests.filter((url) => /upstox|zerodha\/positions|zerodha\/trades/.test(url)).length, 0);
  assert.equal(harness.storage.sellerSafetyView, null);
  assert.ok(harness.storage.sellerSafetyPending, "validated refresh persists pending candidate");
  assert.equal(typeof harness.storage.sellerSafetyPending.candidateId, "string");
  assert.equal(harness.storage.sellerSafetyPending.chain.expiry, "2026-08-25");
  assert.equal(harness.nodes.get("priority-label").textContent, "REVIEW POSITION CHANGES");
  assert.equal(harness.nodes.get("review-panel").hidden, false);
});

test("malformed refresh clears old candidate and cannot be accepted", async () => {
  const valid = {
    updatedAt: "2026-08-01T03:50:00.000Z",
    positions: [{
      contractId: "NFO:NIFTY26AUG24100CE", tradingsymbol: "NIFTY26AUG24100CE", exchange: "NFO",
      underlying: "NIFTY", expiry: "2026-08-25", strike: 24100, optionType: "CE",
      signedQuantity: -65, lotSize: 65, averagePrice: 100, lastPrice: 90, pnl: 650
    }],
    trades: [],
    chain: { expiry: "2026-08-25", spot: 24120, rows: [] }
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

test("explicit strategy, whole-lot allocation, CSV import, and acceptance publish one reviewed snapshot", async () => {
  const harness = popupHarness();
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
  assert.match(harness.nodes.get("import-summary").textContent, /1 fill imported/i);
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

test("connect action opens only bridge-provided official login URL", async () => {
  const harness = popupHarness();
  await settle();

  await harness.listeners.get("connect-zerodha:click")();

  assert.equal(harness.openedTabs.length, 1);
  assert.equal(harness.openedTabs[0].url, "https://kite.zerodha.com/connect/login?v=3&api_key=public-key");
});
