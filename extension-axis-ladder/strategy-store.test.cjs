const test = require("node:test");
const assert = require("node:assert/strict");
const store = require("./strategy-store.js");

const NOW = "2026-07-31T10:00:00.000Z";
const LATER = "2026-08-10T10:00:00.000Z";

function createCommand(id, strategyId, label, expiry = "2026-08-25") {
  return {
    id,
    type: "CREATE_STRATEGY",
    strategyId,
    versionId: `${strategyId}-v1`,
    label,
    instrumentKey: "NSE_INDEX|NIFTY",
    underlying: "NIFTY",
    expiry
  };
}

function leg(id, premium = 100, createdAt = NOW, overrides = {}) {
  return {
    id,
    source: "MANUAL",
    instrumentKey: "NSE_INDEX|NIFTY",
    underlying: "NIFTY",
    expiry: "2026-08-25",
    strike: 24000,
    optionType: "PUT",
    direction: "SELL",
    lots: 1,
    premium,
    callSnapshot: 400,
    putSnapshot: premium,
    charges: [{ kind: "BROKERAGE", amount: 20 }],
    chargesComplete: true,
    createdAt,
    updatedAt: createdAt,
    ...overrides
  };
}

function addCommand(id, strategyId, entry, versionId = `${strategyId}-${id}`) {
  return { id, type: "ADD_LEG", strategyId, versionId, leg: entry };
}

function seededTwoStrategies() {
  let book = store.emptyBook();
  book = store.applyCommand(book, createCommand("create-1", "s1", "T1"), NOW);
  book = store.applyCommand(book, addCommand("add-1", "s1", leg("leg-1")), NOW);
  book = store.applyCommand(book, createCommand("create-2", "s2", "T2"), NOW);
  book = store.applyCommand(book, addCommand("add-2", "s2", leg("leg-2", 120, LATER)), LATER);
  return book;
}

test("distinct same-contract entries remain separate legs with immutable evidence", () => {
  let book = store.emptyBook();
  book = store.applyCommand(book, createCommand("create", "s1", "T1"), NOW);
  book = store.applyCommand(book, addCommand("first", "s1", leg("leg-1", 100, NOW)), NOW);
  book = store.applyCommand(book, addCommand("second", "s1", leg("leg-2", 125, LATER)), LATER);

  assert.deepEqual(store.legsForStrategy(book, "s1").map((item) => ({
    id: item.id,
    premium: item.premium,
    createdAt: item.createdAt
  })), [
    { id: "leg-1", premium: 100, createdAt: NOW },
    { id: "leg-2", premium: 125, createdAt: LATER }
  ]);
});

test("one leg identity cannot belong to two active strategies", () => {
  const book = seededTwoStrategies();
  assert.throws(
    () => store.applyCommand(book, addCommand("duplicate", "s2", leg("leg-1"), "s2-v3"), LATER),
    /already belongs to active strategy/i
  );
});

test("duplicate command id is idempotent", () => {
  const command = createCommand("same-command", "s1", "T1");
  const once = store.applyCommand(store.emptyBook(), command, NOW);
  assert.deepEqual(store.applyCommand(once, command, LATER), once);
});

test("merge creates destination version before archiving both sources", () => {
  const before = seededTwoStrategies();
  const after = store.applyCommand(before, {
    id: "merge-1",
    type: "MERGE_STRATEGIES",
    sourceStrategyIds: ["s1", "s2"],
    destination: { mode: "CREATE_NEW", strategyId: "s3", label: "T3" },
    versionId: "s3-v1"
  }, LATER);

  assert.equal(store.strategyById(after, "s1").status, "ARCHIVED");
  assert.equal(store.strategyById(after, "s2").status, "ARCHIVED");
  assert.equal(store.strategyById(after, "s3").status, "ACTIVE");
  assert.deepEqual(store.legsForStrategy(after, "s3").map((item) => item.id), ["leg-1", "leg-2"]);
  assert.deepEqual(after.versions["s3-v1"].sourceStrategyIds, ["s1", "s2"]);
  assert.deepEqual(store.legsForStrategy(before, "s1").map((item) => item.id), ["leg-1"]);
});

test("restore creates new current version without changing historical version", () => {
  let book = seededTwoStrategies();
  book = store.applyCommand(book, addCommand("add-3", "s1", leg("leg-3", 90), "s1-v3"), LATER);
  const restored = store.applyCommand(book, {
    id: "restore-1",
    type: "RESTORE_VERSION",
    strategyId: "s1",
    restoreVersionId: "s1-add-1",
    versionId: "s1-v4"
  }, LATER);

  assert.equal(store.strategyById(restored, "s1").currentVersionId, "s1-v4");
  assert.deepEqual(restored.versions["s1-v4"].legIds, ["leg-1"]);
  assert.deepEqual(restored.versions["s1-v3"].legIds, ["leg-1", "leg-3"]);
});

test("expired active strategy moves to ledger history and remains inspectable", () => {
  const book = seededTwoStrategies();
  const expired = store.applyCommand(book, {
    id: "expire-1",
    type: "EXPIRE_DUE",
    asOfDate: "2026-08-26"
  }, "2026-08-26T00:00:00.000Z");

  assert.deepEqual(store.activeStrategies(expired, "NSE_INDEX|NIFTY", "2026-08-25"), []);
  assert.equal(store.strategyById(expired, "s1").status, "EXPIRED");
  assert.deepEqual(store.legsForStrategy(expired, "s1").map((item) => item.id), ["leg-1"]);
});

test("last selection restores only an active strategy in exact instrument and expiry context", () => {
  const book = seededTwoStrategies();
  const key = store.contextKey("NSE_INDEX|NIFTY", "2026-08-25");
  assert.equal(key, '["NSE_INDEX|NIFTY","2026-08-25"]');
  assert.equal(store.resolveLastSelected(book, { [key]: "s2" }, "NSE_INDEX|NIFTY", "2026-08-25").id, "s2");
  assert.equal(store.resolveLastSelected(book, { [key]: "missing" }, "NSE_INDEX|NIFTY", "2026-08-25").id, "s1");

  const expired = store.applyCommand(book, {
    id: "expire-for-restore", type: "EXPIRE_DUE", asOfDate: "2026-08-26"
  }, "2026-08-26T00:00:00.000Z");
  assert.equal(store.resolveLastSelected(expired, { [key]: "s2" }, "NSE_INDEX|NIFTY", "2026-08-25"), null);
  assert.equal(store.resolveLastSelected(book, { [key]: "s2" }, "CME|ES", "2026-08-25"), null);
});

test("legacy manual plans migrate once without rewriting captured entries", () => {
  const legacy = {
    version: 1,
    plans: {
      "2026-08-25": {
        entries: [{
          id: "legacy-leg",
          underlying: "NIFTY",
          expiry: "2026-08-25",
          strike: 24100,
          optionType: "CALL",
          direction: "SELL",
          lots: 2,
          premium: 358,
          callSnapshot: 358,
          putSnapshot: 315.45,
          createdAt: NOW,
          updatedAt: NOW
        }]
      }
    }
  };
  const once = store.migrateManualPlans(store.emptyBook(), legacy, {
    instrumentKey: "NSE_INDEX|NIFTY",
    underlying: "NIFTY",
    at: NOW
  });
  const twice = store.migrateManualPlans(once, legacy, {
    instrumentKey: "NSE_INDEX|NIFTY",
    underlying: "NIFTY",
    at: LATER
  });

  const [strategy] = store.activeStrategies(once, "NSE_INDEX|NIFTY", "2026-08-25");
  assert.equal(strategy.label, "T1");
  assert.deepEqual(store.legsForStrategy(once, strategy.id).map((item) => ({
    id: item.id,
    premium: item.premium,
    chargesComplete: item.chargesComplete
  })), [{ id: "legacy-leg", premium: 358, chargesComplete: false }]);
  assert.deepEqual(twice, once);
});

test("non-NIFTY decimal instrument identity remains valid", () => {
  let book = store.emptyBook();
  book = store.applyCommand(book, {
    ...createCommand("create-eur", "eur-s1", "T1", "2026-09-18"),
    instrumentKey: "EUREX|OESX",
    underlying: "EURO STOXX 50"
  }, NOW);
  book = store.applyCommand(book, addCommand("add-eur", "eur-s1", leg("eur-leg", 12.5, NOW, {
    instrumentKey: "EUREX|OESX",
    underlying: "EURO STOXX 50",
    expiry: "2026-09-18",
    strike: 4250.5,
    callSnapshot: 12.5,
    putSnapshot: 11.75
  }), "eur-s1-v2"), NOW);

  assert.equal(store.legsForStrategy(book, "eur-s1")[0].strike, 4250.5);
});

test("broker snapshot creates one live strategy with exact position legs", () => {
  const book = store.applyCommand(store.emptyBook(), {
    id: "broker-sync-1",
    type: "SYNC_BROKER_POSITIONS",
    strategyId: "broker:NSE_DLY:NIFTY:2026-08-25",
    versionId: "broker-version-1",
    snapshotId: "snapshot-1",
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
      signedQuantity: -130,
      lotSize: 65,
      averagePrice: 183,
      lastPrice: 70.85,
      pnl: 14580
    }, {
      contractId: "NFO:NIFTY:2026-08-25:25000:CE",
      tradingsymbol: "NIFTY26AUG25000CE",
      exchange: "NFO",
      underlying: "NIFTY",
      expiry: "2026-08-25",
      strike: 25000,
      optionType: "CE",
      signedQuantity: 65,
      lotSize: 65,
      averagePrice: 67,
      lastPrice: 72,
      pnl: 325
    }]
  }, NOW);

  const [strategy] = store.activeStrategies(book, "NSE_DLY:NIFTY", "2026-08-25");
  assert.equal(strategy.id, "broker:NSE_DLY:NIFTY:2026-08-25");
  assert.equal(strategy.label, "BROKER · AUG 25");
  assert.deepEqual(store.legsForStrategy(book, strategy.id).map((item) => ({
    source: item.source,
    optionType: item.optionType,
    direction: item.direction,
    lots: item.lots,
    premium: item.premium,
    live: item.optionType === "CALL" ? item.callSnapshot : item.putSnapshot,
    brokerPnl: item.brokerPnl
  })), [{
    source: "BROKER_POSITION", optionType: "PUT", direction: "SELL", lots: 2, premium: 183, live: 70.85,
    brokerPnl: 14580
  }, {
    source: "BROKER_POSITION", optionType: "CALL", direction: "BUY", lots: 1, premium: 67, live: 72,
    brokerPnl: 325
  }]);
});

test("flat broker snapshot archives live strategy while preserving its version", () => {
  const command = {
    id: "broker-sync-open",
    type: "SYNC_BROKER_POSITIONS",
    strategyId: "broker:NSE_DLY:NIFTY:2026-08-25",
    versionId: "broker-version-open",
    snapshotId: "snapshot-open",
    label: "BROKER · AUG 25",
    instrumentKey: "NSE_DLY:NIFTY",
    underlying: "NIFTY",
    expiry: "2026-08-25",
    positions: [{
      contractId: "NFO:NIFTY:2026-08-25:24000:PE", tradingsymbol: "NIFTY26AUG24000PE",
      exchange: "NFO", underlying: "NIFTY", expiry: "2026-08-25", strike: 24000,
      optionType: "PE", signedQuantity: -65, lotSize: 65, averagePrice: 183, lastPrice: 70.85, pnl: 7290
    }]
  };
  const open = store.applyCommand(store.emptyBook(), command, NOW);
  const flat = store.applyCommand(open, {
    ...command,
    id: "broker-sync-flat",
    versionId: "broker-version-flat",
    snapshotId: "snapshot-flat",
    positions: []
  }, LATER);

  const strategy = store.strategyById(flat, command.strategyId);
  assert.equal(strategy.status, store.ARCHIVED);
  assert.equal(strategy.archivedReason, "BROKER_FLAT");
  assert.deepEqual(store.legsForStrategy(flat, strategy.id).map((item) => item.id),
    store.legsForStrategy(open, strategy.id).map((item) => item.id));
});

test("broker snapshot rejects fractional lots atomically", () => {
  assert.throws(() => store.applyCommand(store.emptyBook(), {
    id: "broker-sync-invalid",
    type: "SYNC_BROKER_POSITIONS",
    strategyId: "broker:NSE_DLY:NIFTY:2026-08-25",
    versionId: "broker-version-invalid",
    snapshotId: "snapshot-invalid",
    label: "BROKER · AUG 25",
    instrumentKey: "NSE_DLY:NIFTY",
    underlying: "NIFTY",
    expiry: "2026-08-25",
    positions: [{
      contractId: "NFO:NIFTY:2026-08-25:24000:PE", tradingsymbol: "NIFTY26AUG24000PE",
      exchange: "NFO", underlying: "NIFTY", expiry: "2026-08-25", strike: 24000,
      optionType: "PE", signedQuantity: -1, lotSize: 65, averagePrice: 183, lastPrice: 70.85, pnl: 0
    }]
  }, NOW), /whole lots/i);
});
