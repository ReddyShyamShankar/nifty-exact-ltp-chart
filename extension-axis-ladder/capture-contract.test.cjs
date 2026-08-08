"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const manualPlan = require("./manual-plan.js");
const strategyStore = require("./strategy-store.js");
const sellerLedger = require("./seller-ledger.js");
const marginEvidence = require("./margin-evidence.js");

function loadBackground({
  manualPlans = manualPlan.emptyStore(),
  strategyBook = strategyStore.emptyBook(),
  fetchImpl = global.fetch,
  failStrategyWrite = false
} = {}) {
  const listeners = {};
  const sidePanelCalls = [];
  const session = {};
  const local = {
    [manualPlan.STORAGE_KEY]: manualPlans,
    [strategyStore.STORAGE_KEY]: strategyBook
  };
  const manualWrites = [];
  const strategyWrites = [];
  const storageWrites = [];
  global.chrome = {
    runtime: {
      id: "options-ladder-test",
      onMessage: { addListener(listener) { listeners.message = listener; } },
      onInstalled: { addListener(listener) { listeners.installed = listener; } },
      onStartup: { addListener(listener) { listeners.startup = listener; } }
    },
    tabs: {
      onCreated: { addListener(listener) { listeners.created = listener; } },
      onUpdated: { addListener(listener) { listeners.updated = listener; } },
      onActivated: { addListener(listener) { listeners.activated = listener; } },
      async query() { return []; },
      async get() { return undefined; },
      async sendMessage() { return { ok: true }; }
    },
    sidePanel: {
      async setPanelBehavior(value) { sidePanelCalls.push(["behavior", value]); },
      async setOptions(value) { sidePanelCalls.push(["options", value]); },
      async close(value) { sidePanelCalls.push(["close", value]); },
      async open(value) { sidePanelCalls.push(["open", value]); }
    },
    action: {
      onClicked: { addListener(listener) { listeners.action = listener; } },
      async enable() {},
      async disable() {},
      async setBadgeText() {},
      async setBadgeBackgroundColor() {},
      async setTitle() {}
    },
    contextMenus: {
      onClicked: { addListener(listener) { listeners.menu = listener; } },
      async remove() {},
      create() {}
    },
    storage: {
      session: {
        async get(key) { return { [key]: session[key] }; },
        async set(values) { Object.assign(session, values); }
      },
      local: {
        async get(key) {
          if (typeof key === "string") return { [key]: local[key] };
          return { ...key, ...local };
        },
        async set(values) {
          if (failStrategyWrite && Object.hasOwn(values, strategyStore.STORAGE_KEY)) {
            throw new Error("strategy storage unavailable");
          }
          Object.assign(local, values);
          storageWrites.push(structuredClone(values));
          if (Object.hasOwn(values, manualPlan.STORAGE_KEY)) manualWrites.push(values[manualPlan.STORAGE_KEY]);
          if (Object.hasOwn(values, strategyStore.STORAGE_KEY)) strategyWrites.push(values[strategyStore.STORAGE_KEY]);
        }
      }
    }
  };
  global.importScripts = (...files) => {
    for (const file of files) {
      if (file === "overlay-utils.js") global.NiftyOverlay = require("./overlay-utils.js");
      if (file === "side-panel.js") global.NiftySidePanel = require("./side-panel.js");
      if (file === "manual-plan.js") global.NiftyManualPlan = manualPlan;
      if (file === "strategy-store.js") global.OptionsStrategyStore = strategyStore;
      if (file === "seller-ledger.js") global.NiftySellerLedger = sellerLedger;
      if (file === "margin-evidence.js") global.OptionsMarginEvidence = marginEvidence;
    }
  };
  global.fetch = fetchImpl;
  const filename = path.join(__dirname, "background.js");
  delete require.cache[filename];
  return { api: require(filename), listeners, sidePanelCalls, local, manualWrites, strategyWrites, storageWrites };
}

test("exports native-axis capture and single-writer manual mutation API", () => {
  const { api } = loadBackground();
  assert.deepEqual(Object.keys(api).sort(), [
    "applyManualPlanMutation", "applyManualStrategyMutation", "axisPairsFromCandidates", "captureAxisScale",
    "enqueueManualPlanMutation", "enqueueManualStrategyMutation", "enqueueStrategyMigration", "enqueueStrategyMutation",
    "extractAxisPrices", "fetchNiftyChain", "fetchOptionHistory", "isBrokerRefreshMessage",
    "isCaptureMessage", "isChainFetchMessage", "isHistoryFetchMessage", "isManualPlanMutationMessage",
    "isManualStrategyMutationMessage", "isStrategyMigrationMessage", "isStrategyMutationMessage", "isolateAxisCandidates",
    "manualEntryMatchesLeg", "refreshBrokerSnapshot"
  ]);
  assert.equal(api.isCaptureMessage("CAPTURE_AXIS_SCALE"), true);
  assert.equal(api.isCaptureMessage("CAPTURE_PINE_ANCHORS"), false);
  assert.equal(api.isManualPlanMutationMessage("MUTATE_MANUAL_PLANS"), true);
  assert.equal(api.isManualStrategyMutationMessage("MUTATE_MANUAL_STRATEGY"), true);
  assert.equal(api.isChainFetchMessage("FETCH_NIFTY_CHAIN"), true);
  assert.equal(api.isHistoryFetchMessage("FETCH_OPTION_HISTORY"), true);
  assert.equal(api.isStrategyMutationMessage("MUTATE_STRATEGY_BOOK"), true);
  assert.equal(api.isStrategyMigrationMessage("MIGRATE_MANUAL_PLANS"), true);
  assert.equal(api.isBrokerRefreshMessage("REFRESH_BROKER_SNAPSHOT"), true);
});

test("normal extension refresh persists broker strategy, review snapshot, chain, and margin evidence", async () => {
  const updatedAt = "2026-08-08T12:00:00.000Z";
  const expiry = "2026-08-25";
  const position = {
    contractId: `NFO:NIFTY:${expiry}:24400:PE`, tradingsymbol: "NIFTY26AUG24400PE",
    exchange: "NFO", underlying: "NIFTY", expiry, strike: 24400, optionType: "PE",
    signedQuantity: 65, lotSize: 65, averagePrice: 137, lastPrice: 137, pnl: 0
  };
  const h = loadBackground({
    fetchImpl: async (url) => {
      if (String(url).includes("/api/seller-refresh")) return {
        ok: true,
        async json() { return {
          updatedAt, positions: [position], trades: [],
          chain: { expiry, spot: 24570.65, lotSize: 65, rows: [{ strike: 24400, call: null, put: 137 }] }
        }; }
      };
      if (String(url).includes("/api/zerodha/margins")) return {
        ok: true,
        async json() { return {
          updatedAt, funds: { availableMargin: 100000, usedMargin: 20000, availableCash: 80000 }, baskets: []
        }; }
      };
      throw new Error(`Unexpected URL ${url}`);
    }
  });
  Object.assign(h.local, {
    expiry,
    sellerSafetyLedger: sellerLedger.emptyLedger(),
    sellerSafetyChainsByExpiry: {}
  });

  const result = await h.api.refreshBrokerSnapshot([]);
  assert.equal(result.ok, true);
  assert.equal(h.local.sellerSafetyChain.expiry, expiry);
  assert.equal(h.local.sellerSafetyPending.positionCount, 1);
  assert.equal(h.local.sellerSafetyLedger.brokerPositions.length, 1);
  assert.equal(strategyStore.activeStrategies(h.local.strategyBook, "BROKER:NFO:NIFTY", expiry).length, 1);
  assert.equal(h.local.brokerMarginEvidence.funds.availableCash, 80000);
});

function createStrategyCommand(id, strategyId) {
  return {
    id,
    type: "CREATE_STRATEGY",
    strategyId,
    versionId: `${strategyId}-v1`,
    label: strategyId.toUpperCase(),
    instrumentKey: "NSE_INDEX|NIFTY",
    underlying: "NIFTY",
    expiry: "2026-08-25"
  };
}

function sendStrategyMessage(listeners, tabId, message, url = `https://www.tradingview.com/chart/tab-${tabId}/`) {
  return new Promise((resolve) => {
    const handled = listeners.message(message, { tab: { id: tabId }, url }, resolve);
    assert.equal(handled, true);
  });
}

test("strategy mutation accepts TradingView and rejects foreign senders", async () => {
  const h = loadBackground();
  const accepted = await sendStrategyMessage(h.listeners, 1, {
    type: "MUTATE_STRATEGY_BOOK", command: createStrategyCommand("create-1", "s1")
  });
  assert.equal(accepted.ok, true);
  assert.equal(strategyStore.strategyById(h.local.strategyBook, "s1").label, "T1");

  const rejected = await new Promise((resolve) => {
    h.listeners.message(
      { type: "MUTATE_STRATEGY_BOOK", command: createStrategyCommand("create-2", "s2") },
      { tab: { id: 2 }, url: "https://example.com/" },
      resolve
    );
  });
  assert.deepEqual(rejected, { ok: false, error: "Strategy mutations are limited to TradingView tabs." });
  assert.equal(strategyStore.strategyById(h.local.strategyBook, "s2"), null);
});

test("strategy mutation accepts own side panel and rejects spoofed extension sender", async () => {
  const h = loadBackground();
  const own = await new Promise((resolve) => {
    const handled = h.listeners.message(
      { type: "MUTATE_STRATEGY_BOOK", command: createStrategyCommand("create-side-panel", "panel") },
      {
        id: "options-ladder-test",
        url: "chrome-extension://options-ladder-test/popup.html"
      },
      resolve
    );
    assert.equal(handled, true);
  });
  assert.equal(own.ok, true);
  assert.equal(strategyStore.strategyById(h.local.strategyBook, "panel").label, "T1");

  const spoofed = await new Promise((resolve) => {
    h.listeners.message(
      { type: "MUTATE_STRATEGY_BOOK", command: createStrategyCommand("create-spoofed", "spoofed") },
      {
        id: "foreign-extension",
        url: "chrome-extension://foreign-extension/popup.html"
      },
      resolve
    );
  });
  assert.deepEqual(spoofed, { ok: false, error: "Strategy mutations are limited to TradingView tabs." });
  assert.equal(strategyStore.strategyById(h.local.strategyBook, "spoofed"), null);
});

test("strategy queue serializes concurrent commands without lost updates", async () => {
  const h = loadBackground();
  const [first, second] = await Promise.all([
    sendStrategyMessage(h.listeners, 1, {
      type: "MUTATE_STRATEGY_BOOK", command: createStrategyCommand("create-1", "s1")
    }),
    sendStrategyMessage(h.listeners, 2, {
      type: "MUTATE_STRATEGY_BOOK", command: createStrategyCommand("create-2", "s2")
    })
  ]);
  assert.equal(first.ok && second.ok, true);
  assert.deepEqual(strategyStore.activeStrategies(h.local.strategyBook).map((item) => item.id), ["s1", "s2"]);
  assert.equal(h.strategyWrites.length, 2);
});

test("strategy single writer allocates unique T labels for concurrent stale create commands", async () => {
  const h = loadBackground();
  const staleCreate = (id, strategyId) => ({
    ...createStrategyCommand(id, strategyId),
    label: "T1"
  });

  const responses = await Promise.all([
    sendStrategyMessage(h.listeners, 1, {
      type: "MUTATE_STRATEGY_BOOK",
      command: staleCreate("stale-create-1", "s1")
    }),
    sendStrategyMessage(h.listeners, 2, {
      type: "MUTATE_STRATEGY_BOOK",
      command: staleCreate("stale-create-2", "s2")
    })
  ]);

  assert.equal(responses.every((response) => response.ok), true);
  assert.deepEqual(strategyStore.activeStrategies(h.local.strategyBook)
    .map(({ id, label, sequence }) => ({ id, label, sequence })), [
    { id: "s1", label: "T1", sequence: 1 },
    { id: "s2", label: "T2", sequence: 2 }
  ]);
  assert.equal(h.local.strategyBook.nextSequence, 3);
});

test("strategy single writer also allocates unique T labels for concurrent combined-preview saves", async () => {
  let strategyBook = strategyStore.emptyBook();
  for (const strategyId of ["s1", "s2", "s3", "s4"]) {
    strategyBook = strategyStore.applyCommand(
      strategyBook,
      createStrategyCommand(`seed-${strategyId}`, strategyId),
      "2026-07-29T09:55:00.000Z"
    );
  }
  const h = loadBackground({ strategyBook });
  const staleMerge = (id, sourceStrategyIds, strategyId) => ({
    id,
    type: "MERGE_STRATEGIES",
    sourceStrategyIds,
    versionId: `${strategyId}-v1`,
    destination: { mode: "CREATE_NEW", strategyId, label: "T5" }
  });

  const responses = await Promise.all([
    sendStrategyMessage(h.listeners, 1, {
      type: "MUTATE_STRATEGY_BOOK",
      command: staleMerge("merge-first", ["s1", "s2"], "d1")
    }),
    sendStrategyMessage(h.listeners, 2, {
      type: "MUTATE_STRATEGY_BOOK",
      command: staleMerge("merge-second", ["s3", "s4"], "d2")
    })
  ]);

  assert.equal(responses.every((response) => response.ok), true);
  assert.deepEqual(strategyStore.activeStrategies(h.local.strategyBook)
    .map(({ id, label, sequence }) => ({ id, label, sequence })), [
    { id: "d1", label: "T5", sequence: 5 },
    { id: "d2", label: "T6", sequence: 6 }
  ]);
  assert.equal(h.local.strategyBook.nextSequence, 7);
});

test("duplicate strategy command remains idempotent through service worker", async () => {
  const h = loadBackground();
  const message = { type: "MUTATE_STRATEGY_BOOK", command: createStrategyCommand("same", "s1") };
  const first = await sendStrategyMessage(h.listeners, 1, message);
  const second = await sendStrategyMessage(h.listeners, 1, message);
  assert.deepEqual(second.strategyBook, first.strategyBook);
  assert.equal(strategyStore.activeStrategies(h.local.strategyBook).length, 1);
});

test("strategy storage failure returns error and preserves prior book", async () => {
  let initial = strategyStore.emptyBook();
  initial = strategyStore.applyCommand(initial, createStrategyCommand("initial", "existing"), "2026-07-31T10:00:00.000Z");
  const h = loadBackground({ strategyBook: initial, failStrategyWrite: true });
  const response = await sendStrategyMessage(h.listeners, 1, {
    type: "MUTATE_STRATEGY_BOOK", command: createStrategyCommand("new", "new-strategy")
  });
  assert.deepEqual(response, { ok: false, error: "strategy storage unavailable" });
  assert.deepEqual(h.local.strategyBook, initial);
  assert.equal(h.strategyWrites.length, 0);
});

test("legacy manual plans migrate once while legacy rollback data remains", async () => {
  const legacy = manualPlan.upsertEntry(manualPlan.emptyStore(), legacyManualEntry());
  const h = loadBackground({ manualPlans: legacy });
  const request = {
    type: "MIGRATE_MANUAL_PLANS",
    instrumentKey: "NSE_INDEX|NIFTY",
    underlying: "NIFTY",
    at: "2026-07-31T10:00:00.000Z"
  };
  const first = await sendStrategyMessage(h.listeners, 1, request);
  const second = await sendStrategyMessage(h.listeners, 1, request);
  assert.equal(first.ok && second.ok, true);
  assert.equal(strategyStore.activeStrategies(h.local.strategyBook).length, 1);
  assert.deepEqual(h.local.manualPlans, legacy);
  assert.equal(h.strategyWrites.length, 2);
});

test("migration atomically reconciles newer manual plan over stale same-ID strategy leg", async () => {
  const original = manualEntry({ premium: 100, callSnapshot: 100 });
  const initial = seededManualStrategy(original);
  const newer = manualEntry({
    strike: 24100,
    lots: 3,
    premium: 135,
    callSnapshot: 135,
    updatedAt: "2026-07-29T10:10:00.000Z"
  });
  initial.manualPlans = manualPlan.upsertEntry(manualPlan.emptyStore(), newer);
  const h = loadBackground(initial);
  const request = {
    type: "MIGRATE_MANUAL_PLANS",
    instrumentKey: "NSE_INDEX|NIFTY",
    underlying: "NIFTY",
    at: "2026-07-31T10:00:00.000Z"
  };

  const first = await sendStrategyMessage(h.listeners, 1, request);
  const firstStored = structuredClone(h.local);
  const second = await sendStrategyMessage(h.listeners, 1, request);
  const [saved] = manualPlan.entriesFor(h.local.manualPlans, newer.expiry);
  const activeLeg = strategyStore.legsForStrategy(h.local.strategyBook, "s1")[0];

  assert.equal(first.ok && second.ok, true);
  assert.notEqual(saved.id, original.id);
  assert.equal(saved.id, activeLeg.id);
  assert.deepEqual({ strike: activeLeg.strike, lots: activeLeg.lots, premium: activeLeg.premium }, {
    strike: 24100, lots: 3, premium: 135
  });
  assert.equal(h.local.strategyBook.legs[original.id].premium, 100, "old evidence remains");
  assert.equal(h.local.strategyBook.versions["seed-add-s1-version"].legIds.includes(original.id), true,
    "old version history remains");
  assert.deepEqual(h.local, firstStored, "second migration is idempotent");
  assert.equal(h.storageWrites.every((write) => Object.keys(write).sort().join(",") === "manualPlans,strategyBook"), true);
});

test("v2 migration imports a missing manual leg even when v1 migration marker already exists", async () => {
  const strategyBook = strategyStore.emptyBook();
  strategyBook.appliedCommands["migration:manualPlans:v1:NSE_INDEX|NIFTY"] = "2026-07-30T10:00:00.000Z";
  const manualPlans = manualPlan.upsertEntry(manualPlan.emptyStore(), manualEntry());
  const h = loadBackground({ strategyBook, manualPlans });

  const response = await sendStrategyMessage(h.listeners, 1, {
    type: "MIGRATE_MANUAL_PLANS",
    instrumentKey: "NSE_INDEX|NIFTY",
    underlying: "NIFTY",
    at: "2026-07-31T10:00:00.000Z"
  });
  const [strategy] = strategyStore.activeStrategies(h.local.strategyBook, "NSE_INDEX|NIFTY", "2026-08-25");

  assert.equal(response.ok, true);
  assert.deepEqual(strategyStore.legsForStrategy(h.local.strategyBook, strategy.id).map((leg) => leg.id), ["entry-a"]);
  assert.deepEqual(manualPlan.entriesFor(h.local.manualPlans, "2026-08-25").map((entry) => entry.id), ["entry-a"]);
});

test("v2 migration reuses one active repair owner for two missing plans after legacy strategy archive", async () => {
  const legacySeed = manualPlan.upsertEntry(manualPlan.emptyStore(), manualEntry({ id: "archived-evidence" }));
  let strategyBook = strategyStore.migrateManualPlans(strategyStore.emptyBook(), legacySeed, {
    instrumentKey: "NSE_INDEX|NIFTY",
    underlying: "NIFTY",
    at: "2026-07-30T10:00:00.000Z"
  });
  strategyBook = strategyStore.applyCommand(strategyBook, {
    id: "archive-legacy-before-v2",
    type: "ARCHIVE_STRATEGY",
    strategyId: "legacy:NSE_INDEX|NIFTY:2026-08-25"
  }, "2026-07-30T10:05:00.000Z");
  let manualPlans = manualPlan.upsertEntry(manualPlan.emptyStore(), manualEntry({ id: "orphan-a" }));
  manualPlans = manualPlan.upsertEntry(manualPlans, manualEntry({
    id: "orphan-b",
    strike: 23800,
    premium: 120,
    callSnapshot: 120
  }));
  const h = loadBackground({ strategyBook, manualPlans });
  const request = {
    type: "MIGRATE_MANUAL_PLANS",
    instrumentKey: "NSE_INDEX|NIFTY",
    underlying: "NIFTY",
    at: "2026-07-31T10:00:00.000Z"
  };

  const first = await sendStrategyMessage(h.listeners, 1, request);
  const firstStored = structuredClone(h.local);
  const second = await sendStrategyMessage(h.listeners, 1, request);
  const repair = strategyStore.strategyById(h.local.strategyBook, "legacy-v2:NSE_INDEX|NIFTY:2026-08-25");

  assert.equal(first.ok && second.ok, true);
  assert.equal(repair.status, strategyStore.ACTIVE);
  assert.deepEqual(strategyStore.legsForStrategy(h.local.strategyBook, repair.id).map((leg) => leg.id), [
    "orphan-a", "orphan-b"
  ]);
  assert.equal(h.local.strategyBook.legs["archived-evidence"].source, "MANUAL");
  assert.deepEqual(h.local, firstStored, "later reconciliation remains idempotent");
});

test("v2 migration rehydrates manualPlans from an active manual strategy leg", async () => {
  const initial = seededManualStrategy();
  initial.manualPlans = manualPlan.emptyStore();
  const h = loadBackground(initial);

  const response = await sendStrategyMessage(h.listeners, 1, {
    type: "MIGRATE_MANUAL_PLANS",
    instrumentKey: "NSE_INDEX|NIFTY",
    underlying: "NIFTY",
    at: "2026-07-31T10:00:00.000Z"
  });

  assert.equal(response.ok, true);
  assert.deepEqual(manualPlan.entriesFor(h.local.manualPlans, "2026-08-25"), [manualEntry()]);
  assert.deepEqual(strategyStore.legsForStrategy(h.local.strategyBook, "s1").map((leg) => leg.id), ["entry-a"]);
});

test("v2 migration removes plan pointing only to inactive historical leg and preserves evidence", async () => {
  const initial = seededManualStrategy();
  initial.strategyBook = strategyStore.applyCommand(initial.strategyBook, {
    id: "failed-baseline-remove",
    type: "REMOVE_LEG",
    strategyId: "s1",
    versionId: "failed-baseline-remove-version",
    legId: "entry-a"
  }, "2026-07-29T10:05:00.000Z");
  const h = loadBackground(initial);

  const response = await sendStrategyMessage(h.listeners, 1, {
    type: "MIGRATE_MANUAL_PLANS",
    instrumentKey: "NSE_INDEX|NIFTY",
    underlying: "NIFTY",
    at: "2026-07-31T10:00:00.000Z"
  });

  assert.equal(response.ok, true);
  assert.deepEqual(manualPlan.entriesFor(h.local.manualPlans, "2026-08-25"), []);
  assert.equal(h.local.strategyBook.legs["entry-a"].premium, 119, "historical evidence remains immutable");
  assert.equal(h.local.strategyBook.versions["seed-add-s1-version"].legIds.includes("entry-a"), true);
});

test("v2 migration removes no-owner mismatched plan once while quarantining immutable evidence", async () => {
  const initial = seededManualStrategy();
  initial.manualPlans = manualPlan.upsertEntry(manualPlan.emptyStore(), manualEntry({
    strike: 24100,
    lots: 2,
    premium: 140,
    callSnapshot: 140,
    updatedAt: "2026-07-29T10:03:00.000Z"
  }));
  initial.strategyBook = strategyStore.applyCommand(initial.strategyBook, {
    id: "remove-before-plan-cleanup",
    type: "REMOVE_LEG",
    strategyId: "s1",
    versionId: "remove-before-plan-cleanup-version",
    legId: "entry-a"
  }, "2026-07-29T10:05:00.000Z");
  initial.strategyBook = strategyStore.applyCommand(initial.strategyBook, {
    id: "archive-before-plan-cleanup",
    type: "ARCHIVE_STRATEGY",
    strategyId: "s1"
  }, "2026-07-29T10:06:00.000Z");
  const h = loadBackground(initial);
  const request = {
    type: "MIGRATE_MANUAL_PLANS",
    instrumentKey: "NSE_INDEX|NIFTY",
    underlying: "NIFTY",
    at: "2026-07-31T10:00:00.000Z"
  };

  const first = await sendStrategyMessage(h.listeners, 1, request);
  const firstStored = structuredClone(h.local);
  const second = await sendStrategyMessage(h.listeners, 1, request);
  const quarantined = h.local.strategyBook.quarantine.filter((item) =>
    item.kind === "MANUAL_PLAN_MISMATCH" && item.id === "entry-a");

  assert.equal(first.ok && second.ok, true);
  assert.deepEqual(manualPlan.entriesFor(h.local.manualPlans, "2026-08-25"), []);
  assert.equal(quarantined.length, 1);
  assert.equal(h.local.strategyBook.legs["entry-a"].premium, 119, "historical leg evidence remains");
  assert.deepEqual(h.local, firstStored, "cleanup remains idempotent");
});

test("v2 migration archives partial-create empty manual ghost without touching broker or remove state", async () => {
  let strategyBook = strategyStore.applyCommand(
    strategyStore.emptyBook(),
    createStrategyCommand("partial-create-ghost", "manual-ghost"),
    "2026-07-29T09:55:00.000Z"
  );
  strategyBook = strategyStore.applyCommand(strategyBook, {
    ...createStrategyCommand("broker-empty-control", "broker:NSE_DLY:NIFTY:2026-08-25"),
    instrumentKey: "NSE_INDEX|NIFTY"
  }, "2026-07-29T09:56:00.000Z");
  strategyBook = strategyStore.applyCommand(strategyBook, createStrategyCommand(
    "remove-state-create", "remove-state"
  ), "2026-07-29T09:57:00.000Z");
  strategyBook = strategyStore.applyCommand(strategyBook, {
    id: "remove-state-add",
    type: "ADD_LEG",
    strategyId: "remove-state",
    versionId: "remove-state-add-version",
    leg: manualLeg(manualEntry({ id: "remove-state-leg" }))
  }, "2026-07-29T09:58:00.000Z");
  strategyBook = strategyStore.applyCommand(strategyBook, {
    id: "remove-state-empty",
    type: "REMOVE_LEG",
    strategyId: "remove-state",
    versionId: "remove-state-empty-version",
    legId: "remove-state-leg"
  }, "2026-07-29T09:59:00.000Z");
  const h = loadBackground({ strategyBook, manualPlans: manualPlan.emptyStore() });

  const response = await sendStrategyMessage(h.listeners, 1, {
    type: "MIGRATE_MANUAL_PLANS",
    instrumentKey: "NSE_INDEX|NIFTY",
    underlying: "NIFTY",
    at: "2026-07-31T10:00:00.000Z"
  });

  assert.equal(response.ok, true);
  assert.equal(strategyStore.strategyById(h.local.strategyBook, "manual-ghost").status, strategyStore.ARCHIVED);
  assert.equal(strategyStore.strategyById(h.local.strategyBook, "manual-ghost").archivedReason,
    "EMPTY_MANUAL_RECOVERY");
  assert.equal(strategyStore.strategyById(h.local.strategyBook,
    "broker:NSE_DLY:NIFTY:2026-08-25").status, strategyStore.ACTIVE);
  assert.equal(strategyStore.strategyById(h.local.strategyBook, "remove-state").status, strategyStore.ACTIVE);
});

test("archiving strategy removes its inactive manual trades while preserving ledger evidence", async () => {
  const legacy = manualPlan.upsertEntry(manualPlan.emptyStore(), legacyManualEntry());
  const h = loadBackground({ manualPlans: legacy });
  const migration = {
    type: "MIGRATE_MANUAL_PLANS",
    instrumentKey: "NSE_INDEX|NIFTY",
    underlying: "NIFTY",
    at: "2026-07-31T10:00:00.000Z"
  };
  await sendStrategyMessage(h.listeners, 1, migration);
  const strategyId = "legacy:NSE_INDEX|NIFTY:2026-08-25";

  const response = await sendStrategyMessage(h.listeners, 1, {
    type: "MUTATE_STRATEGY_BOOK",
    command: { id: "archive-legacy", type: "ARCHIVE_STRATEGY", strategyId }
  });

  assert.equal(response.ok, true);
  assert.equal(strategyStore.strategyById(h.local.strategyBook, strategyId).status, "ARCHIVED");
  assert.deepEqual(manualPlan.entriesFor(h.local.manualPlans, "2026-08-25"), []);
  assert.deepEqual(strategyStore.legsForStrategy(h.local.strategyBook, strategyId).map((item) => item.id), ["entry-a"]);
  assert.equal(h.manualWrites.length, 2, "migration and archive each update both stores atomically");
});

test("direct archive before migration preserves newer mismatched plan as immutable evidence", async () => {
  const initial = seededManualStrategy(manualEntry({ premium: 100, callSnapshot: 100 }));
  initial.manualPlans = manualPlan.upsertEntry(manualPlan.emptyStore(), manualEntry({
    strike: 24100,
    lots: 3,
    premium: 135,
    callSnapshot: 135,
    updatedAt: "2026-07-29T10:10:00.000Z"
  }));
  const h = loadBackground(initial);

  const response = await sendStrategyMessage(h.listeners, 1, {
    type: "MUTATE_STRATEGY_BOOK",
    command: { id: "archive-before-migration", type: "ARCHIVE_STRATEGY", strategyId: "s1" }
  });
  const newerEvidence = Object.values(h.local.strategyBook.legs).find((leg) =>
    leg.id !== "entry-a" && leg.strike === 24100 && leg.lots === 3 && leg.premium === 135);

  assert.equal(response.ok, true);
  assert.equal(strategyStore.strategyById(h.local.strategyBook, "s1").status, strategyStore.ARCHIVED);
  assert.deepEqual(manualPlan.entriesFor(h.local.manualPlans, "2026-08-25"), []);
  assert.equal(h.local.strategyBook.legs["entry-a"].premium, 100, "old evidence remains");
  assert.ok(newerEvidence, "newer plan is captured before archive cleanup");
  assert.equal(Object.values(h.local.strategyBook.versions).some((version) =>
    version.operation === "RECONCILE_MANUAL_PLAN" && version.legIds.includes(newerEvidence.id)), true);
  assert.equal(h.storageWrites.length, 1);
  assert.deepEqual(Object.keys(h.storageWrites[0]).sort(), ["manualPlans", "strategyBook"]);
});

test("background owns bridge chain fetch for TradingView content scripts", async () => {
  const requests = [];
  const chain = { expiry: "2026-08-25", lotSize: 25, spot: 24317.15, rows: [{ strike: 24300, call: 325, put: 263 }] };
  const { listeners } = loadBackground({
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      return { ok: true, async json() { return chain; } };
    }
  });
  const response = await new Promise((resolve) => {
    const handled = listeners.message(
      { type: "FETCH_NIFTY_CHAIN", expiry: "2026-08-25" },
      { tab: { id: 7 }, url: "https://www.tradingview.com/chart/test/" },
      resolve
    );
    assert.equal(handled, true);
  });

  assert.deepEqual(response, { ok: true, chain });
  assert.deepEqual(requests, [{
    url: "http://127.0.0.1:8787/api/nifty-chain?expiry=2026-08-25",
    options: { cache: "no-store" }
  }]);
});

test("background rejects a bridge chain without an exact positive integer lot size", async () => {
  for (const lotSize of [undefined, null, 0, 25.5, "25"]) {
    const chain = { expiry: "2026-08-25", spot: 24317.15, rows: [], ...(lotSize === undefined ? {} : { lotSize }) };
    const { listeners } = loadBackground({
      fetchImpl: async () => ({ ok: true, async json() { return chain; } })
    });
    const response = await new Promise((resolve) => {
      listeners.message(
        { type: "FETCH_NIFTY_CHAIN", expiry: "2026-08-25" },
        { tab: { id: 7 }, url: "https://www.tradingview.com/chart/test/" },
        resolve
      );
    });

    assert.equal(response.ok, false, String(lotSize));
    assert.match(response.error, /lot size.*positive integer/i);
  }
});

test("background rejects bridge quotes resolved for a different exact expiry", async () => {
  const { listeners } = loadBackground({
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return { expiry: "2026-09-01", lotSize: 25, spot: 24317.15, rows: [] };
      }
    })
  });
  const response = await new Promise((resolve) => {
    listeners.message(
      { type: "FETCH_NIFTY_CHAIN", expiry: "2026-08-25" },
      { tab: { id: 7 }, url: "https://www.tradingview.com/chart/test/" },
      resolve
    );
  });

  assert.equal(response.ok, false);
  assert.match(response.error, /expiry.*requested exact expiry/i);
});

test("background chain proxy rejects invalid expiry and non-TradingView callers before network", async () => {
  let requests = 0;
  const { listeners } = loadBackground({ fetchImpl: async () => { requests += 1; } });
  for (const [message, sender, expectedError] of [
    [
      { type: "FETCH_NIFTY_CHAIN", expiry: "current_month" },
      { tab: { id: 7 }, url: "https://www.tradingview.com/chart/test/" },
      "Select one exact NIFTY expiry first."
    ],
    [
      { type: "FETCH_NIFTY_CHAIN", expiry: "2026-08-25" },
      { tab: { id: 7 }, url: "https://example.com/" },
      "Option-chain refresh is limited to TradingView tabs."
    ]
  ]) {
    const response = await new Promise((resolve) => {
      const handled = listeners.message(message, sender, resolve);
      assert.equal(handled, true);
    });
    assert.deepEqual(response, { ok: false, error: expectedError });
  }
  assert.equal(requests, 0);
});

test("background history proxy sends one exact read-only request", async () => {
  const requests = [];
  const history = { version: 1, identity: { expiry: "2026-08-25", strike: 24400 }, call: {}, put: {}, underlying: {} };
  const { listeners } = loadBackground({
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      return { ok: true, async json() { return history; } };
    }
  });
  const response = await new Promise((resolve) => {
    const handled = listeners.message({
      type: "FETCH_OPTION_HISTORY",
      expiry: "2026-08-25",
      strike: 24400,
      interval: "4h",
      from: "2025-08-25",
      to: "2026-08-01"
    }, { tab: { id: 7 }, url: "https://www.tradingview.com/chart/test/" }, resolve);
    assert.equal(handled, true);
  });

  assert.deepEqual(response, { ok: true, history });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url,
    "http://127.0.0.1:8787/api/option-history?expiry=2026-08-25&strike=24400&interval=4h&from=2025-08-25&to=2026-08-01");
  assert.deepEqual(requests[0].options, { cache: "no-store" });
});

test("background history proxy rejects malformed and foreign requests without network", async () => {
  let requests = 0;
  const { listeners } = loadBackground({ fetchImpl: async () => { requests += 1; } });
  for (const [message, sender, expectedError] of [
    [
      { type: "FETCH_OPTION_HISTORY", expiry: "bad", strike: 24400, interval: "4h", from: "2025-08-25", to: "2026-08-01" },
      { tab: { id: 7 }, url: "https://www.tradingview.com/chart/test/" },
      "Premium history request is invalid."
    ],
    [
      { type: "FETCH_OPTION_HISTORY", expiry: "2026-08-25", strike: 24400, interval: "4h", from: "2025-08-25", to: "2026-08-01" },
      { tab: { id: 7 }, url: "https://example.com/" },
      "Option history is limited to TradingView tabs."
    ]
  ]) {
    const response = await new Promise((resolve) => {
      const handled = listeners.message(message, sender, resolve);
      assert.equal(handled, true);
    });
    assert.equal(response.ok, false);
    assert.equal(response.error, expectedError);
  }
  assert.equal(requests, 0);
});

test("background ignores synthetic price-scale gesture requests", () => {
  const { listeners } = loadBackground();
  let responses = 0;
  const handled = listeners.message(
    { type: "FIT_AXIS_SCALE" },
    { tab: { id: 7 }, url: "https://www.tradingview.com/chart/test/" },
    () => { responses += 1; }
  );

  assert.equal(handled, undefined);
  assert.equal(responses, 0);
});

function manualEntry(overrides = {}) {
  return {
    id: "entry-a",
    underlying: "NIFTY",
    expiry: "2026-08-25",
    strike: 23750,
    optionType: "CALL",
    direction: "SELL",
    lots: 1,
    lotSize: 25,
    premium: 119,
    callSnapshot: 119,
    putSnapshot: null,
    createdAt: "2026-07-29T10:00:00.000Z",
    updatedAt: "2026-07-29T10:00:00.000Z",
    ...overrides
  };
}

function legacyManualEntry(overrides = {}) {
  const { lotSize: _omitted, ...entry } = manualEntry(overrides);
  return entry;
}

test("legacy manual lot matching uses 65 only for NIFTY", () => {
  const { api } = loadBackground();
  const legacyNifty = legacyManualEntry();
  assert.equal(api.manualEntryMatchesLeg(legacyNifty, { ...legacyNifty, lotSize: 65 }), true);

  const unknownNonNifty = legacyManualEntry({ underlying: "BANKNIFTY" });
  assert.equal(api.manualEntryMatchesLeg(unknownNonNifty, { ...unknownNonNifty, lotSize: 65 }), false);
});

function sendManualMutation(listeners, tabId, mutation) {
  return new Promise((resolve) => {
    const handled = listeners.message(
      { type: "MUTATE_MANUAL_PLANS", mutation },
      { tab: { id: tabId }, url: `https://www.tradingview.com/chart/tab-${tabId}/` },
      resolve
    );
    assert.equal(handled, true);
  });
}

function sendManualStrategyMutation(listeners, tabId, mutation) {
  return new Promise((resolve) => {
    const handled = listeners.message(
      { type: "MUTATE_MANUAL_STRATEGY", mutation },
      { tab: { id: tabId }, url: `https://www.tradingview.com/chart/tab-${tabId}/` },
      resolve
    );
    assert.equal(handled, true);
  });
}

function manualLeg(entry, overrides = {}) {
  return {
    ...entry,
    source: "MANUAL",
    instrumentKey: "NSE_INDEX|NIFTY",
    charges: [],
    chargesComplete: false,
    ...overrides
  };
}

function seededManualStrategy(entry = manualEntry(), strategyId = "s1") {
  let strategyBook = strategyStore.applyCommand(
    strategyStore.emptyBook(),
    createStrategyCommand(`seed-create-${strategyId}`, strategyId),
    "2026-07-29T09:55:00.000Z"
  );
  strategyBook = strategyStore.applyCommand(strategyBook, {
    id: `seed-add-${strategyId}`,
    type: "ADD_LEG",
    strategyId,
    versionId: `seed-add-${strategyId}-version`,
    leg: manualLeg(entry)
  }, entry.createdAt);
  return {
    manualPlans: manualPlan.upsertEntry(manualPlan.emptyStore(), entry),
    strategyBook
  };
}

test("atomic manual CREATE writes one matching entry and leg in one storage commit", async () => {
  const emptyStrategy = strategyStore.applyCommand(
    strategyStore.emptyBook(),
    createStrategyCommand("seed-empty", "s1"),
    "2026-07-29T09:55:00.000Z"
  );
  const h = loadBackground({ strategyBook: emptyStrategy });
  const entry = manualEntry();

  const response = await sendManualStrategyMutation(h.listeners, 1, {
    id: "atomic-create-existing",
    type: "CREATE",
    entry,
    strategy: { mode: "EXISTING", strategyId: "s1" }
  });

  assert.equal(response.ok, true);
  assert.deepEqual(manualPlan.entriesFor(response.manualPlans, entry.expiry), [entry]);
  assert.deepEqual(strategyStore.legsForStrategy(response.strategyBook, "s1").map((leg) => leg.id), [entry.id]);
  assert.equal(strategyStore.legsForStrategy(response.strategyBook, "s1")[0].lotSize, 25);
  assert.deepEqual(response.manualPlans, h.local.manualPlans);
  assert.deepEqual(response.strategyBook, h.local.strategyBook);
  assert.equal(h.storageWrites.length, 1);
  assert.deepEqual(Object.keys(h.storageWrites[0]).sort(), ["manualPlans", "strategyBook"]);
});

test("atomic manual CREATE can create its chosen strategy without an empty partial save", async () => {
  const h = loadBackground();
  const entry = manualEntry();

  const response = await sendManualStrategyMutation(h.listeners, 1, {
    id: "atomic-create-new",
    type: "CREATE",
    entry,
    strategy: {
      mode: "CREATE_NEW",
      strategyId: "s1",
      label: "T1",
      instrumentKey: "NSE_INDEX|NIFTY",
      underlying: "NIFTY"
    }
  });

  assert.equal(response.ok, true);
  assert.equal(strategyStore.strategyById(h.local.strategyBook, "s1").status, strategyStore.ACTIVE);
  assert.deepEqual(strategyStore.legsForStrategy(h.local.strategyBook, "s1").map((leg) => leg.id), [entry.id]);
  assert.deepEqual(manualPlan.entriesFor(h.local.manualPlans, entry.expiry), [entry]);
  assert.equal(h.storageWrites.length, 1);
});

test("atomic manual CREATE fails closed when the new entry omits lot size", async () => {
  const strategyBook = strategyStore.applyCommand(
    strategyStore.emptyBook(),
    createStrategyCommand("seed-empty-no-lot", "s1"),
    "2026-07-29T09:55:00.000Z"
  );
  const h = loadBackground({ strategyBook });

  const response = await sendManualStrategyMutation(h.listeners, 1, {
    id: "atomic-create-no-lot",
    type: "CREATE",
    entry: legacyManualEntry(),
    strategy: { mode: "EXISTING", strategyId: "s1" }
  });

  assert.equal(response.ok, false);
  assert.match(response.error, /lot size.*positive integer/i);
  assert.equal(h.storageWrites.length, 0);
});

test("atomic manual EDIT replaces active identity while retaining immutable ledger evidence", async () => {
  const initial = seededManualStrategy();
  const h = loadBackground(initial);
  const replacement = manualEntry({
    id: "entry-b",
    lots: 3,
    updatedAt: "2026-07-29T10:05:00.000Z"
  });

  const response = await sendManualStrategyMutation(h.listeners, 1, {
    id: "atomic-edit",
    type: "EDIT",
    entryId: "entry-a",
    entry: replacement
  });

  assert.equal(response.ok, true);
  assert.deepEqual(manualPlan.entriesFor(h.local.manualPlans, replacement.expiry), [replacement]);
  assert.deepEqual(strategyStore.legsForStrategy(h.local.strategyBook, "s1").map((leg) => leg.id), ["entry-b"]);
  assert.equal(h.local.strategyBook.legs["entry-a"].lots, 1, "old evidence remains immutable");
  assert.equal(h.local.strategyBook.legs["entry-b"].lots, 3);
  assert.equal(h.local.strategyBook.legs["entry-b"].lotSize, 25);
  assert.equal(h.local.strategyBook.versions["manual:atomic-edit:version"].operation, "EDIT");
  assert.equal(h.storageWrites.length, 1);
});

test("atomic manual EDIT upgrades a legacy 65-fallback entry to exact current lot size", async () => {
  const legacy = legacyManualEntry();
  const initial = seededManualStrategy(legacy);
  const h = loadBackground(initial);
  const replacement = manualEntry({ id: "entry-b", updatedAt: "2026-07-29T10:05:00.000Z" });

  const response = await sendManualStrategyMutation(h.listeners, 1, {
    id: "atomic-edit-legacy-lot",
    type: "EDIT",
    entryId: legacy.id,
    entry: replacement
  });

  assert.equal(response.ok, true);
  assert.equal(manualPlan.entriesFor(response.manualPlans, replacement.expiry)[0].lotSize, 25);
  assert.equal(response.strategyBook.legs[replacement.id].lotSize, 25);
});

test("atomic manual EDIT repairs stale plan/leg mismatch before applying user edit", async () => {
  const entry = manualEntry();
  const initial = seededManualStrategy(entry);
  initial.manualPlans = manualPlan.upsertEntry(manualPlan.emptyStore(), manualEntry({
    strike: 24100,
    lots: 2,
    premium: 140,
    callSnapshot: 140,
    updatedAt: "2026-07-29T10:03:00.000Z"
  }));
  const h = loadBackground(initial);

  const response = await sendManualStrategyMutation(h.listeners, 1, {
    id: "atomic-edit-conflicting-lot",
    type: "EDIT",
    entryId: entry.id,
    entry: manualEntry({ id: "entry-b", updatedAt: "2026-07-29T10:05:00.000Z" })
  });

  assert.equal(response.ok, true);
  assert.deepEqual(strategyStore.legsForStrategy(h.local.strategyBook, "s1").map((leg) => leg.id), ["entry-b"]);
  assert.equal(h.local.strategyBook.legs[entry.id].premium, 119, "original leg evidence remains");
  assert.equal(Object.values(h.local.strategyBook.legs).some((leg) => leg.id !== entry.id
    && leg.id !== "entry-b" && leg.premium === 140 && leg.strike === 24100), true,
  "reconciled plan evidence remains before user edit");
  assert.equal(h.storageWrites.length, 1);
});

test("atomic manual REMOVE repairs stale plan/leg mismatch before deleting active entry", async () => {
  const entry = manualEntry();
  const initial = seededManualStrategy(entry);
  initial.manualPlans = manualPlan.upsertEntry(manualPlan.emptyStore(), manualEntry({
    strike: 24100,
    lots: 2,
    premium: 140,
    callSnapshot: 140,
    updatedAt: "2026-07-29T10:03:00.000Z"
  }));
  const h = loadBackground(initial);

  const response = await sendManualStrategyMutation(h.listeners, 1, {
    id: "atomic-remove-stale-plan",
    type: "REMOVE",
    entryId: entry.id
  });

  assert.equal(response.ok, true);
  assert.deepEqual(manualPlan.entriesFor(h.local.manualPlans, entry.expiry), []);
  assert.equal(strategyStore.strategyById(h.local.strategyBook, "s1").status, strategyStore.ARCHIVED);
  assert.equal(h.local.strategyBook.legs[entry.id].premium, 119, "original leg evidence remains");
  assert.equal(Object.values(h.local.strategyBook.legs).some((leg) => leg.id !== entry.id
    && leg.premium === 140 && leg.strike === 24100), true, "reconciled plan evidence remains");
  assert.equal(h.storageWrites.length, 1);
});

test("atomic manual REMOVE retires active ownership and archives an empty strategy", async () => {
  const initial = seededManualStrategy();
  const h = loadBackground(initial);

  const response = await sendManualStrategyMutation(h.listeners, 1, {
    id: "atomic-remove",
    type: "REMOVE",
    entryId: "entry-a"
  });

  assert.equal(response.ok, true);
  assert.deepEqual(manualPlan.entriesFor(h.local.manualPlans, "2026-08-25"), []);
  assert.equal(strategyStore.strategyById(h.local.strategyBook, "s1").status, strategyStore.ARCHIVED);
  assert.equal(h.local.strategyBook.legs["entry-a"].source, "MANUAL", "ledger evidence remains");
  assert.equal(h.storageWrites.length, 1);
});

test("edit then restore atomically restores manual plan identity for later edit and remove", async () => {
  const initial = seededManualStrategy();
  const h = loadBackground(initial);
  const edited = manualEntry({
    id: "entry-b",
    strike: 24100,
    premium: 135,
    callSnapshot: 135,
    updatedAt: "2026-07-29T10:05:00.000Z"
  });
  const firstEdit = await sendManualStrategyMutation(h.listeners, 1, {
    id: "edit-before-restore",
    type: "EDIT",
    entryId: "entry-a",
    entry: edited
  });
  assert.equal(firstEdit.ok, true);

  const restore = await sendStrategyMessage(h.listeners, 1, {
    type: "MUTATE_STRATEGY_BOOK",
    command: {
      id: "restore-original-entry",
      type: "RESTORE_VERSION",
      strategyId: "s1",
      restoreVersionId: "seed-add-s1-version",
      versionId: "restore-original-entry-version"
    }
  });
  const plansAfterRestore = manualPlan.entriesFor(h.local.manualPlans, "2026-08-25");

  assert.equal(restore.ok, true);
  assert.deepEqual(strategyStore.legsForStrategy(h.local.strategyBook, "s1").map((leg) => leg.id), ["entry-a"]);
  assert.deepEqual(plansAfterRestore.map((entry) => entry.id), ["entry-a"]);
  assert.equal(h.storageWrites.length, 2);
  assert.deepEqual(Object.keys(h.storageWrites[1]).sort(), ["manualPlans", "strategyBook"]);

  const secondEdit = await sendManualStrategyMutation(h.listeners, 1, {
    id: "edit-after-restore",
    type: "EDIT",
    entryId: "entry-a",
    entry: manualEntry({ id: "entry-c", updatedAt: "2026-07-29T10:15:00.000Z" })
  });
  assert.equal(secondEdit.ok, true);
  assert.deepEqual(manualPlan.entriesFor(h.local.manualPlans, "2026-08-25").map((entry) => entry.id), ["entry-c"]);

  const remove = await sendManualStrategyMutation(h.listeners, 1, {
    id: "remove-after-restore-edit",
    type: "REMOVE",
    entryId: "entry-c"
  });
  assert.equal(remove.ok, true);
  assert.deepEqual(manualPlan.entriesFor(h.local.manualPlans, "2026-08-25"), []);
});

test("direct restore before migration preserves newer mismatch before restoring historical state", async () => {
  const initial = seededManualStrategy(manualEntry({ premium: 100, callSnapshot: 100 }));
  initial.manualPlans = manualPlan.upsertEntry(manualPlan.emptyStore(), manualEntry({
    strike: 24100,
    lots: 3,
    premium: 135,
    callSnapshot: 135,
    updatedAt: "2026-07-29T10:10:00.000Z"
  }));
  const h = loadBackground(initial);

  const response = await sendStrategyMessage(h.listeners, 1, {
    type: "MUTATE_STRATEGY_BOOK",
    command: {
      id: "restore-before-migration",
      type: "RESTORE_VERSION",
      strategyId: "s1",
      restoreVersionId: "seed-add-s1-version",
      versionId: "restore-before-migration-version"
    }
  });
  const [restoredPlan] = manualPlan.entriesFor(h.local.manualPlans, "2026-08-25");
  const newerEvidence = Object.values(h.local.strategyBook.legs).find((leg) =>
    leg.id !== "entry-a" && leg.strike === 24100 && leg.lots === 3 && leg.premium === 135);

  assert.equal(response.ok, true);
  assert.deepEqual(strategyStore.legsForStrategy(h.local.strategyBook, "s1").map((leg) => leg.id), ["entry-a"]);
  assert.deepEqual({ id: restoredPlan.id, strike: restoredPlan.strike, lots: restoredPlan.lots,
    premium: restoredPlan.premium }, { id: "entry-a", strike: 23750, lots: 1, premium: 100 });
  assert.ok(newerEvidence, "newer plan becomes immutable historical evidence before restore");
  assert.equal(Object.values(h.local.strategyBook.versions).some((version) =>
    version.operation === "RECONCILE_MANUAL_PLAN" && version.legIds.includes(newerEvidence.id)), true);
  assert.equal(h.storageWrites.length, 1);
  assert.deepEqual(Object.keys(h.storageWrites[0]).sort(), ["manualPlans", "strategyBook"]);
});

test("atomic manual storage rejection leaves both stores byte-for-byte unchanged", async () => {
  const strategyBook = strategyStore.applyCommand(
    strategyStore.emptyBook(),
    createStrategyCommand("seed-empty", "s1"),
    "2026-07-29T09:55:00.000Z"
  );
  const manualPlans = manualPlan.emptyStore();
  const h = loadBackground({ strategyBook, manualPlans, failStrategyWrite: true });

  const response = await sendManualStrategyMutation(h.listeners, 1, {
    id: "atomic-failure",
    type: "CREATE",
    entry: manualEntry(),
    strategy: { mode: "EXISTING", strategyId: "s1" }
  });

  assert.deepEqual(response, { ok: false, error: "strategy storage unavailable" });
  assert.deepEqual(h.local.strategyBook, strategyBook);
  assert.deepEqual(h.local.manualPlans, manualPlans);
  assert.equal(h.storageWrites.length, 0);
  assert.equal(h.manualWrites.length, 0);
  assert.equal(h.strategyWrites.length, 0);
});

test("invalid atomic manual mutation performs no partial write", async () => {
  const initial = seededManualStrategy();
  const h = loadBackground(initial);

  const response = await sendManualStrategyMutation(h.listeners, 1, {
    id: "atomic-invalid-edit",
    type: "EDIT",
    entryId: "entry-a",
    entry: manualEntry({ lots: 0 })
  });

  assert.equal(response.ok, false);
  assert.match(response.error, /invalid/i);
  assert.deepEqual(h.local, {
    manualPlans: initial.manualPlans,
    strategyBook: initial.strategyBook
  });
  assert.equal(h.storageWrites.length, 0);
});

test("shared queue preserves two concurrent atomic manual creates on one strategy", async () => {
  const strategyBook = strategyStore.applyCommand(
    strategyStore.emptyBook(),
    createStrategyCommand("seed-empty", "s1"),
    "2026-07-29T09:55:00.000Z"
  );
  const h = loadBackground({ strategyBook });

  const responses = await Promise.all([
    sendManualStrategyMutation(h.listeners, 1, {
      id: "atomic-first",
      type: "CREATE",
      entry: manualEntry(),
      strategy: { mode: "EXISTING", strategyId: "s1" }
    }),
    sendManualStrategyMutation(h.listeners, 2, {
      id: "atomic-second",
      type: "CREATE",
      entry: manualEntry({ id: "entry-b", strike: 23800, callSnapshot: 120 }),
      strategy: { mode: "EXISTING", strategyId: "s1" }
    })
  ]);

  assert.equal(responses.every((response) => response.ok), true);
  assert.deepEqual(manualPlan.entriesFor(h.local.manualPlans, "2026-08-25").map((entry) => entry.id), [
    "entry-a", "entry-b"
  ]);
  assert.deepEqual(strategyStore.legsForStrategy(h.local.strategyBook, "s1").map((leg) => leg.id), [
    "entry-a", "entry-b"
  ]);
  assert.equal(h.storageWrites.length, 2);
});

test("manual single writer allocates unique T labels for concurrent stale CREATE_NEW requests", async () => {
  const h = loadBackground();

  const responses = await Promise.all([
    sendManualStrategyMutation(h.listeners, 1, {
      id: "atomic-new-first",
      type: "CREATE",
      entry: manualEntry({ id: "entry-a" }),
      strategy: {
        mode: "CREATE_NEW",
        strategyId: "s1",
        label: "T1",
        instrumentKey: "NSE_INDEX|NIFTY",
        underlying: "NIFTY"
      }
    }),
    sendManualStrategyMutation(h.listeners, 2, {
      id: "atomic-new-second",
      type: "CREATE",
      entry: manualEntry({ id: "entry-b", strike: 23800, callSnapshot: 120 }),
      strategy: {
        mode: "CREATE_NEW",
        strategyId: "s2",
        label: "T1",
        instrumentKey: "NSE_INDEX|NIFTY",
        underlying: "NIFTY"
      }
    })
  ]);

  assert.equal(responses.every((response) => response.ok), true);
  assert.deepEqual(strategyStore.activeStrategies(h.local.strategyBook)
    .map(({ id, label, sequence }) => ({ id, label, sequence })), [
    { id: "s1", label: "T1", sequence: 1 },
    { id: "s2", label: "T2", sequence: 2 }
  ]);
  assert.equal(h.local.strategyBook.nextSequence, 3);
  assert.equal(h.storageWrites.length, 2);
});

test("shared queue preserves concurrent atomic manual and ordinary strategy mutations", async () => {
  const strategyBook = strategyStore.applyCommand(
    strategyStore.emptyBook(),
    createStrategyCommand("seed-empty", "s1"),
    "2026-07-29T09:55:00.000Z"
  );
  const h = loadBackground({ strategyBook });

  const [manualResponse, strategyResponse] = await Promise.all([
    sendManualStrategyMutation(h.listeners, 1, {
      id: "atomic-concurrent",
      type: "CREATE",
      entry: manualEntry(),
      strategy: { mode: "EXISTING", strategyId: "s1" }
    }),
    sendStrategyMessage(h.listeners, 2, {
      type: "MUTATE_STRATEGY_BOOK",
      command: createStrategyCommand("concurrent-strategy", "s2")
    })
  ]);

  assert.equal(manualResponse.ok && strategyResponse.ok, true);
  assert.deepEqual(strategyStore.activeStrategies(h.local.strategyBook).map((strategy) => strategy.id), ["s1", "s2"]);
  assert.deepEqual(strategyStore.legsForStrategy(h.local.strategyBook, "s1").map((leg) => leg.id), ["entry-a"]);
  assert.deepEqual(manualPlan.entriesFor(h.local.manualPlans, "2026-08-25").map((entry) => entry.id), ["entry-a"]);
});

test("atomic manual path refuses to edit broker position evidence", async () => {
  const command = {
    id: "broker-seed",
    type: "SYNC_BROKER_POSITIONS",
    strategyId: "broker:NSE_DLY:NIFTY:2026-08-25",
    versionId: "broker-version",
    snapshotId: "broker-snapshot",
    label: "BROKER · AUG 25",
    instrumentKey: "NSE_DLY:NIFTY",
    underlying: "NIFTY",
    expiry: "2026-08-25",
    positions: [{
      contractId: "NFO:NIFTY:2026-08-25:24000:PE",
      tradingsymbol: "NIFTY26AUG24000PE",
      exchange: "NFO",
      underlying: "NIFTY",
      expiry: "2026-08-25",
      strike: 24000,
      optionType: "PE",
      signedQuantity: -65,
      lotSize: 65,
      averagePrice: 183,
      lastPrice: 70.85,
      pnl: 7290
    }]
  };
  const strategyBook = strategyStore.applyCommand(strategyStore.emptyBook(), command, "2026-07-29T10:00:00.000Z");
  const brokerLegId = strategyStore.legsForStrategy(strategyBook, command.strategyId)[0].id;
  const h = loadBackground({ strategyBook });

  const response = await sendManualStrategyMutation(h.listeners, 1, {
    id: "broker-edit-attempt",
    type: "EDIT",
    entryId: brokerLegId,
    entry: manualEntry({ id: "fake-manual" })
  });

  assert.equal(response.ok, false);
  assert.match(response.error, /manual/i);
  assert.deepEqual(h.local.strategyBook, strategyBook);
  assert.deepEqual(h.local.manualPlans, manualPlan.emptyStore());
  assert.equal(h.storageWrites.length, 0);
});

test("deprecated split manual-plan route rejects every mutation without writing either store", async () => {
  const initial = seededManualStrategy();
  const h = loadBackground(initial);

  const responses = await Promise.all([
    sendManualMutation(h.listeners, 1, { type: "upsert", entry: manualEntry({ id: "entry-b" }) }),
    sendManualMutation(h.listeners, 2, { type: "remove", expiry: "2026-08-25", entryId: "entry-a" })
  ]);

  assert.equal(responses.every((response) => response.ok === false), true);
  for (const response of responses) assert.match(response.error, /deprecated.*atomic manual strategy/i);
  assert.deepEqual(h.local.manualPlans, initial.manualPlans);
  assert.deepEqual(h.local.strategyBook, initial.strategyBook);
  assert.equal(h.storageWrites.length, 0);
});

test("background installs tab-specific side panel without changing capture API", async () => {
  const { api, listeners, sidePanelCalls } = loadBackground();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(typeof listeners.installed, "function");
  assert.equal(typeof listeners.startup, "function");
  assert.equal(typeof listeners.created, "function");
  assert.equal(typeof listeners.updated, "function");
  assert.equal(typeof listeners.activated, "function");
  assert.deepEqual(sidePanelCalls[0], ["behavior", { openPanelOnActionClick: false }]);
  assert.equal(typeof api.captureAxisScale, "function");
});

test("native-axis extractor accepts only plain comma-formatted axis labels", () => {
  const { api } = loadBackground();
  const nodes = [
    { name: { value: "24,000.00" } },
    { name: { value: "23,800" } },
    { name: { value: "O 23,771.45 H 23,792.95" } },
    { name: { value: "-0.43%" } },
    { name: { value: "C 371.65 | P 298.45 | 23,800" } },
    { name: { value: "23,800" } }
  ];
  assert.deepEqual(api.extractAxisPrices(nodes), [24000, 23800]);
});

test("observed native ticks form a direct linear axis and ignore unrelated labels", () => {
  const { api } = loadBackground();
  assert.deepEqual(api.axisPairsFromCandidates([
    { price: 24100, y: 100 },
    { price: 24000, y: 140 },
    { price: 23900, y: 180 },
    { price: 23800, y: 220 },
    { price: 23787, y: 199 },
    { price: 46.18, y: 700 }
  ]), [
    { price: 24100, y: 100 },
    { price: 24000, y: 140 },
    { price: 23900, y: 180 },
    { price: 23800, y: 220 }
  ]);
});

test("observed native ticks also form a direct linear axis when TradingView scale is inverted", () => {
  const { api } = loadBackground();
  assert.deepEqual(api.axisPairsFromCandidates([
    { price: 23800, y: 100 },
    { price: 23900, y: 140 },
    { price: 24000, y: 180 },
    { price: 24100, y: 220 },
    { price: 23787, y: 199 },
    { price: 46.18, y: 700 }
  ]), [
    { price: 23800, y: 100 },
    { price: 23900, y: 140 },
    { price: 24000, y: 180 },
    { price: 24100, y: 220 }
  ]);
});

test("axis capture returns native coordinates without screenshot or debugger", async () => {
  const { api } = loadBackground();
  const canvasRect = { left: 0, top: 0, right: 1000, bottom: 600 };
  const result = await api.captureAxisScale({}, {
    plotRect: { left: 0, top: 0, right: 880, bottom: 600 },
    axisCandidates: [
      { price: 24200, x: 900, y: 80, canvasRect },
      { price: 24100, x: 900, y: 120, canvasRect },
      { price: 24000, x: 900, y: 160, canvasRect },
      { price: 23900, x: 900, y: 200, canvasRect }
    ]
  });
  assert.deepEqual(result, {
    ok: true,
    lower: null,
    upper: null,
    gridRows: [80, 120, 160, 200],
    gridGapPx: 40,
    axisPrices: [24200, 24100, 24000, 23900],
    axisPairs: [
      { price: 24200, y: 80 },
      { price: 24100, y: 120 },
      { price: 24000, y: 160 },
      { price: 23900, y: 200 }
    ]
  });
});

test("capture isolates main plot from a denser indicator pane", async () => {
  const { api } = loadBackground();
  const main = { left: 0, top: 0, right: 1000, bottom: 600 };
  const indicator = { left: 0, top: 600, right: 1000, bottom: 800 };
  const result = await api.captureAxisScale({}, {
    plotRect: { left: 0, top: 0, right: 880, bottom: 600 },
    axisCandidates: [
      { price: 24200, x: 900, y: 80, canvasRect: main },
      { price: 24100, x: 900, y: 120, canvasRect: main },
      { price: 24000, x: 900, y: 160, canvasRect: main },
      ...Array.from({ length: 8 }, (_, index) => ({
        price: 80 - index * 10,
        x: 900,
        y: 620 + index * 20,
        canvasRect: indicator
      }))
    ]
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.axisPrices, [24200, 24100, 24000]);
});

test("capture chooses nearest right-axis x cluster and ignores farther scale", async () => {
  const { api } = loadBackground();
  const canvasRect = { left: 0, top: 0, right: 1100, bottom: 600 };
  const result = await api.captureAxisScale({}, {
    plotRect: { left: 0, top: 0, right: 880, bottom: 600 },
    axisCandidates: [
      { price: 24200, x: 900, y: 80, canvasRect },
      { price: 24100, x: 900, y: 120, canvasRect },
      { price: 24000, x: 900, y: 160, canvasRect },
      { price: 5000, x: 1020, y: 60, canvasRect },
      { price: 4000, x: 1020, y: 120, canvasRect },
      { price: 3000, x: 1020, y: 180, canvasRect },
      { price: 2000, x: 1020, y: 240, canvasRect }
    ]
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.axisPrices, [24200, 24100, 24000]);
});

test("capture skips a nearer singleton price marker and uses the first complete axis cluster", async () => {
  const { api } = loadBackground();
  const canvasRect = { left: 0, top: 0, right: 1000, bottom: 600 };
  const result = await api.captureAxisScale({}, {
    plotRect: { left: 0, top: 0, right: 880, bottom: 600 },
    axisCandidates: [
      { price: 23787, x: 882, y: 199, canvasRect },
      { price: 24200, x: 900, y: 80, canvasRect },
      { price: 24100, x: 900, y: 120, canvasRect },
      { price: 24000, x: 900, y: 160, canvasRect },
      { price: 23900, x: 900, y: 200, canvasRect }
    ]
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.axisPrices, [24200, 24100, 24000, 23900]);
});

test("capture isolates an inverted main axis from unrelated scales", async () => {
  const { api } = loadBackground();
  const canvasRect = { left: 0, top: 0, right: 1000, bottom: 600 };
  const result = await api.captureAxisScale({}, {
    plotRect: { left: 0, top: 0, right: 880, bottom: 600 },
    axisCandidates: [
      { price: 24000, x: 900, y: 80, canvasRect },
      { price: 24100, x: 900, y: 120, canvasRect },
      { price: 24200, x: 900, y: 160, canvasRect },
      { price: 50, x: 1020, y: 80, canvasRect },
      { price: 40, x: 1020, y: 120, canvasRect },
      { price: 30, x: 1020, y: 160, canvasRect },
      { price: 20, x: 1020, y: 200, canvasRect }
    ]
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.axisPrices, [24000, 24100, 24200]);
});

test("capture fails closed when candidate geometry is missing", async () => {
  const { api } = loadBackground();
  assert.deepEqual(await api.captureAxisScale({}, {
    plotRect: { left: 0, top: 0, right: 880, bottom: 600 },
    axisCandidates: [
      { price: 24200, y: 80 },
      { price: 24100, y: 120 },
      { price: 24000, y: 160 }
    ]
  }), { ok: false, error: "Native axis ticks are still loading." });
});

test("capture rejects candidates outside their reported canvas bounds", async () => {
  const { api } = loadBackground();
  const canvasRect = { left: 0, top: 0, right: 1000, bottom: 600 };
  assert.deepEqual(await api.captureAxisScale({}, {
    plotRect: { left: 0, top: 0, right: 880, bottom: 600 },
    axisCandidates: [
      { price: 24200, x: 1200, y: 80, canvasRect },
      { price: 24100, x: 1200, y: 120, canvasRect },
      { price: 24000, x: 1200, y: 160, canvasRect }
    ]
  }), { ok: false, error: "Native axis ticks are still loading." });
});

test("capture keeps a sparse native line when moving markers conflict with its coordinates", async () => {
  const { api } = loadBackground();
  const canvasRect = { left: 0, top: 0, right: 1000, bottom: 600 };
  const base = {
    plotRect: { left: 0, top: 0, right: 880, bottom: 600 },
    axisCandidates: [
      { price: 24200, x: 900, y: 80, canvasRect },
      { price: 24100, x: 900, y: 120, canvasRect },
      { price: 24000, x: 900, y: 160, canvasRect }
    ]
  };
  const duplicatePrice = await api.captureAxisScale({}, {
    ...base,
    axisCandidates: [...base.axisCandidates, { price: 24200, x: 900, y: 200, canvasRect }]
  });
  assert.equal(duplicatePrice.ok, true);
  assert.deepEqual(duplicatePrice.axisPrices, [24200, 24100, 24000]);
  const duplicatePixel = await api.captureAxisScale({}, {
    ...base,
    axisCandidates: [...base.axisCandidates, { price: 23900, x: 900, y: 120, canvasRect }]
  });
  assert.equal(duplicatePixel.ok, true);
  assert.deepEqual(duplicatePixel.axisPrices, [24200, 24100, 24000]);
});

test("capture skips a nearer invalid marker cluster and uses a later valid native axis", async () => {
  const { api } = loadBackground();
  const canvasRect = { left: 0, top: 0, right: 1000, bottom: 600 };
  const result = await api.captureAxisScale({}, {
    plotRect: { left: 0, top: 0, right: 880, bottom: 600 },
    axisCandidates: [
      { price: 23787, x: 882, y: 90, canvasRect },
      { price: 24446.35, x: 882, y: 170, canvasRect },
      { price: 22991, x: 882, y: 260, canvasRect },
      { price: 24200, x: 900, y: 80, canvasRect },
      { price: 24100, x: 900, y: 120, canvasRect },
      { price: 24000, x: 900, y: 160, canvasRect },
      { price: 23900, x: 900, y: 200, canvasRect }
    ]
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.axisPrices, [24200, 24100, 24000, 23900]);
});

test("capture keeps dominant native grid when TradingView markers share axis canvas", async () => {
  const { api } = loadBackground();
  const canvasRect = { left: 1605, top: 42, right: 1679, bottom: 715 };
  const nativeTicks = Array.from({ length: 18 }, (_, index) => ({
    price: 24700 - index * 100,
    x: 1640,
    y: 45.53 + index * 37.72,
    canvasRect
  }));
  const result = await api.captureAxisScale({}, {
    plotRect: { left: 50, top: 42, right: 1605, bottom: 715 },
    axisCandidates: [
      ...nativeTicks,
      { price: 24446.35, x: 1640, y: 141, canvasRect },
      { price: 24100, x: 1640, y: 256, canvasRect },
      { price: 23787, x: 1640, y: 390, canvasRect },
      { price: 23744.4, x: 1640, y: 406, canvasRect },
      { price: 22991, x: 1640, y: 697.5, canvasRect }
    ]
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.axisPrices, nativeTicks.map((tick) => tick.price));
  assert.equal(result.gridGapPx, 38);
});

test("axis capture fails closed while native ticks are loading", async () => {
  const { api } = loadBackground();
  assert.deepEqual(await api.captureAxisScale({}, { axisCandidates: [] }), {
    ok: false,
    error: "Native axis ticks are still loading."
  });
});

test("message listener rejects non-TradingView callers", () => {
  const { listeners } = loadBackground();
  let response;
  const asyncResult = listeners.message(
    { type: "CAPTURE_AXIS_SCALE", axisCandidates: [] },
    { tab: { id: 7 }, url: "https://example.com/" },
    (value) => { response = value; }
  );
  assert.equal(asyncResult, undefined);
  assert.deepEqual(response, { ok: false, error: "Axis capture is limited to TradingView tabs." });
});
