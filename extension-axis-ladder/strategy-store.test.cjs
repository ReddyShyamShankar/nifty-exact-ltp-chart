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

test("command batch is immutable and all-or-nothing before persistence", () => {
  const before = store.emptyBook();
  const commands = [
    createCommand("create-batch", "s1", "T1"),
    addCommand("add-invalid", "s1", { ...leg("leg-1"), lots: 0 })
  ];

  assert.throws(() => store.applyCommands(before, commands, NOW), /invalid/i);
  assert.deepEqual(before, store.emptyBook());
});

test("active owner lookup returns one exact owner and rejects corrupted duplicates", () => {
  const book = seededTwoStrategies();
  assert.equal(store.activeStrategyForLeg(book, "leg-1").id, "s1");
  assert.equal(store.activeStrategyForLeg(book, "missing"), null);

  const duplicated = structuredClone(book);
  duplicated.versions[duplicated.strategies.s2.currentVersionId].legIds.push("leg-1");
  assert.throws(() => store.activeStrategyForLeg(duplicated, "leg-1"), /multiple active strategies/i);
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

test("manual-plan reconciliation replaces stale same-ID leg while preserving immutable evidence", () => {
  const original = {
    version: 1,
    plans: {
      "2026-08-25": {
        entries: [{
          id: "legacy-leg",
          underlying: "NIFTY",
          expiry: "2026-08-25",
          strike: 24000,
          optionType: "CALL",
          direction: "SELL",
          lots: 1,
          lotSize: 25,
          premium: 100,
          callSnapshot: 100,
          putSnapshot: 300,
          createdAt: NOW,
          updatedAt: NOW
        }]
      }
    }
  };
  const migrated = store.migrateManualPlans(store.emptyBook(), original, {
    instrumentKey: "NSE_INDEX|NIFTY",
    underlying: "NIFTY",
    at: NOW
  });
  const newer = structuredClone(original);
  Object.assign(newer.plans["2026-08-25"].entries[0], {
    strike: 24100,
    lots: 3,
    premium: 135,
    callSnapshot: 135,
    updatedAt: LATER
  });

  const once = store.reconcileManualPlans(migrated, newer, {
    instrumentKey: "NSE_INDEX|NIFTY",
    underlying: "NIFTY",
    at: LATER
  });
  const twice = store.reconcileManualPlans(once.strategyBook, newer, {
    instrumentKey: "NSE_INDEX|NIFTY",
    underlying: "NIFTY",
    at: LATER
  });
  const replacementId = once.replacements[0].newId;
  const strategy = store.activeStrategyForLeg(once.strategyBook, replacementId);

  assert.notEqual(replacementId, "legacy-leg");
  assert.deepEqual(once.strategyBook.legs["legacy-leg"], migrated.legs["legacy-leg"],
    "old leg remains immutable evidence");
  assert.deepEqual(store.legsForStrategy(once.strategyBook, strategy.id).map((item) => ({
    id: item.id,
    strike: item.strike,
    lots: item.lots,
    premium: item.premium,
    updatedAt: item.updatedAt
  })), [{ id: replacementId, strike: 24100, lots: 3, premium: 135, updatedAt: LATER }]);
  assert.equal(once.strategyBook.versions[strategy.currentVersionId].operation, "RECONCILE_MANUAL_PLAN");
  assert.deepEqual(twice, once, "same reconciliation input is idempotent");
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
    lotSize: 10,
    callSnapshot: 12.5,
    putSnapshot: 11.75
  }), "eur-s1-v2"), NOW);

  assert.equal(store.legsForStrategy(book, "eur-s1")[0].strike, 4250.5);
});

test("legacy manual leg normalization keeps the prior 65-contract lot size", () => {
  assert.equal(store.normalizeLeg(leg("legacy-manual")).lotSize, 65);
});

test("legacy NIFTY broker legs without lot metadata migrate as readable 65-contract legs", () => {
  let book = store.applyCommand(store.emptyBook(), {
    ...createCommand("legacy-broker-create", "legacy-broker", "BROKER · AUG 25"),
    instrumentKey: "BROKER:NFO:NIFTY",
    underlying: "NIFTY"
  }, NOW);
  book = store.applyCommand(book, addCommand("legacy-broker-add", "legacy-broker", leg("legacy-broker-leg", 100, NOW, {
    source: "BROKER_POSITION",
    instrumentKey: "BROKER:NFO:NIFTY",
    underlying: "NIFTY",
    lotSize: 65
  })), NOW);
  const persistedBeforeLotSize = structuredClone(book);
  delete persistedBeforeLotSize.legs["legacy-broker-leg"].lotSize;

  const upgraded = store.normalizeBook(persistedBeforeLotSize);

  assert.equal(upgraded.legs["legacy-broker-leg"].lotSize, 65);
  assert.deepEqual(store.legsForStrategy(upgraded, "legacy-broker").map(({ id, source, lotSize }) => ({
    id, source, lotSize
  })), [{ id: "legacy-broker-leg", source: "BROKER_POSITION", lotSize: 65 }]);
  assert.equal(upgraded.quarantine.some((item) => item.kind === "LEG" && item.id === "legacy-broker-leg"), false);
});

test("leg normalization rejects malformed explicit lot sizes", () => {
  for (const lotSize of [0, -1, 1.5, "25"]) {
    assert.equal(store.normalizeLeg(leg(`bad-lot-${lotSize}`, 100, NOW, { lotSize })), null);
  }
  assert.equal(store.normalizeLeg(leg("unknown-legacy-broker-lot", 100, NOW, {
    source: "BROKER_POSITION",
    instrumentKey: "BROKER:NFO:BANKNIFTY",
    underlying: "BANKNIFTY"
  })), null, "the NIFTY migration fallback must not invent another instrument's lot size");
  assert.equal(store.normalizeLeg(leg("unknown-legacy-manual-lot", 100, NOW, {
    source: "MANUAL",
    instrumentKey: "NSE_INDEX|BANKNIFTY",
    underlying: "BANKNIFTY"
  })), null, "legacy manual fallback must not invent NIFTY's lot size for another instrument");
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
      signedQuantity: 50,
      lotSize: 25,
      averagePrice: 183,
      lastPrice: 70.85,
      pnl: -5607.5
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
    lotSize: item.lotSize,
    premium: item.premium,
    live: item.optionType === "CALL" ? item.callSnapshot : item.putSnapshot,
    brokerPnl: item.brokerPnl
  })), [{
    source: "BROKER_POSITION", optionType: "PUT", direction: "BUY", lots: 2, lotSize: 25,
    premium: 183, live: 70.85,
    brokerPnl: -5607.5
  }, {
    source: "BROKER_POSITION", optionType: "CALL", direction: "BUY", lots: 1, lotSize: 65,
    premium: 67, live: 72,
    brokerPnl: 325
  }]);
});

test("broker sync does not consume manual T sequence", () => {
  const brokerCommand = {
    id: "broker-sequence-sync",
    type: "SYNC_BROKER_POSITIONS",
    strategyId: "upstox-position-book:NIFTY:2026-08-25",
    versionId: "broker-sequence-version",
    snapshotId: "broker-sequence-snapshot",
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
      signedQuantity: -25,
      lotSize: 25,
      averagePrice: 183,
      lastPrice: 70.85,
      pnl: 2803.75
    }]
  };
  const brokerBook = store.applyCommand(store.emptyBook(), brokerCommand, NOW);
  const manualBook = store.applyCommand(brokerBook, createCommand("manual-after-broker", "manual-1", undefined), LATER);

  assert.equal(brokerBook.nextSequence, 1);
  assert.equal(store.strategyById(manualBook, "manual-1").sequence, 1);
  assert.equal(store.strategyById(manualBook, "manual-1").label, "T1");
  assert.equal(manualBook.nextSequence, 2);
});

test("normalization repairs broker-only sequence inflation without renumbering manual strategies", () => {
  let book = store.applyCommand(store.emptyBook(), createCommand("manual-first", "manual-1", "T1"), NOW);
  book = store.applyCommand(book, {
    id: "broker-after-manual",
    type: "SYNC_BROKER_POSITIONS",
    strategyId: "broker:NSE_DLY:NIFTY:2026-08-25",
    versionId: "broker-after-manual-version",
    snapshotId: "broker-after-manual-snapshot",
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
      signedQuantity: -25,
      lotSize: 25,
      averagePrice: 183,
      lastPrice: 70.85,
      pnl: 2803.75
    }]
  }, LATER);
  const inflated = structuredClone(book);
  inflated.nextSequence = 99;
  inflated.strategies["broker:NSE_DLY:NIFTY:2026-08-25"].sequence = 98;

  const repaired = store.normalizeBook(inflated);

  assert.equal(repaired.nextSequence, 2);
  assert.equal(repaired.strategies["manual-1"].sequence, 1);
  assert.equal(repaired.strategies["broker:NSE_DLY:NIFTY:2026-08-25"].sequence, 98,
    "broker display order remains evidence; only manual allocator is repaired");
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
