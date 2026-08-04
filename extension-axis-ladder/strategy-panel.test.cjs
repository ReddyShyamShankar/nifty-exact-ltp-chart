const test = require("node:test");
const assert = require("node:assert/strict");
const store = require("./strategy-store.js");
const panel = require("./strategy-panel.js");

const NOW = "2026-07-31T10:00:00.000Z";

function create(id, label, expiry = "2026-08-25") {
  return {
    id: `create-${id}`,
    type: "CREATE_STRATEGY",
    strategyId: id,
    versionId: `${id}-v1`,
    label,
    instrumentKey: "NSE_DLY:NIFTY",
    underlying: "NIFTY",
    expiry
  };
}

function book() {
  let value = store.emptyBook();
  value = store.applyCommand(value, create("s1", "T1"), NOW);
  value = store.applyCommand(value, create("s2", "T2"), NOW);
  return value;
}

function leg(id, overrides = {}) {
  return {
    id,
    source: "MANUAL",
    instrumentKey: "NSE_DLY:NIFTY",
    underlying: "NIFTY",
    expiry: "2026-08-25",
    strike: 24000,
    optionType: "PUT",
    direction: "SELL",
    lots: 2,
    premium: 183,
    callSnapshot: 711.1,
    putSnapshot: 70.85,
    charges: [],
    chargesComplete: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides
  };
}

test("save always requires create-new or explicit destination", () => {
  assert.deepEqual(panel.saveChoices(book(), ["s1", "s2"]).map((item) => item.kind), ["CREATE_NEW", "MERGE_INTO"]);
  assert.throws(() => panel.commandForSave({ selectedIds: ["s1", "s2"] }), /destination/i);
});

test("save builder creates explicit new or existing merge command", () => {
  assert.deepEqual(panel.commandForSave({
    commandId: "merge-command",
    versionId: "s3-v1",
    selectedIds: ["s1", "s2"],
    destination: { mode: "CREATE_NEW", strategyId: "s3", label: "T3" }
  }), {
    id: "merge-command",
    type: "MERGE_STRATEGIES",
    sourceStrategyIds: ["s1", "s2"],
    destination: { mode: "CREATE_NEW", strategyId: "s3", label: "T3" },
    versionId: "s3-v1"
  });
  assert.equal(panel.commandForSave({
    commandId: "merge-existing", versionId: "s1-v2", selectedIds: ["s1", "s2"],
    destination: { mode: "EXISTING", strategyId: "s1" }
  }).destination.mode, "EXISTING");
});

test("split and restore builders require explicit immutable identities", () => {
  assert.deepEqual(panel.commandForSplit({
    commandId: "split", sourceStrategyId: "s1", sourceVersionId: "s1-v2",
    legIds: ["leg-1"], destination: { mode: "CREATE_NEW", strategyId: "s3", label: "T3" },
    destinationVersionId: "s3-v1"
  }), {
    id: "split", type: "SPLIT_STRATEGY", sourceStrategyId: "s1", sourceVersionId: "s1-v2",
    legIds: ["leg-1"], destination: { mode: "CREATE_NEW", strategyId: "s3", label: "T3" },
    destinationVersionId: "s3-v1"
  });
  assert.deepEqual(panel.commandForRestore({
    commandId: "restore", strategyId: "s1", restoreVersionId: "s1-v1", versionId: "s1-v3"
  }), {
    id: "restore", type: "RESTORE_VERSION", strategyId: "s1",
    restoreVersionId: "s1-v1", versionId: "s1-v3"
  });
  assert.throws(() => panel.commandForSplit({ sourceStrategyId: "s1", legIds: [] }), /leg/i);
});

test("history includes merged-source and expired strategies", () => {
  let value = book();
  value = store.applyCommand(value, {
    id: "merge", type: "MERGE_STRATEGIES", sourceStrategyIds: ["s1", "s2"],
    destination: { mode: "CREATE_NEW", strategyId: "s3", label: "T3" }, versionId: "s3-v1"
  }, NOW);
  value = store.applyCommand(value, create("old", "T4", "2026-07-30"), NOW);
  value = store.applyCommand(value, { id: "expire", type: "EXPIRE_DUE", asOfDate: "2026-07-31" }, NOW);
  assert.deepEqual(panel.historyRows(value).map((item) => item.status).sort(), ["ARCHIVED", "ARCHIVED", "EXPIRED"]);
});

test("view model exposes active versions and history without mutating book", () => {
  const value = book();
  const before = structuredClone(value);
  const result = panel.viewModel(value, { instrumentKey: "NSE_DLY:NIFTY", expiry: "2026-08-25" });
  assert.deepEqual(result.active.map((item) => item.label), ["T1", "T2"]);
  assert.equal(result.active[0].versions.length, 1);
  assert.deepEqual(result.history, []);
  assert.deepEqual(value, before);
});

test("dashboard model groups strategies and derives compact cards from real legs", () => {
  let value = book();
  value = store.applyCommand(value, {
    id: "add-s1", type: "ADD_LEG", strategyId: "s1", versionId: "s1-v2", leg: leg("leg-1")
  }, NOW);
  value = store.applyCommand(value, {
    id: "add-s2", type: "ADD_LEG", strategyId: "s2", versionId: "s2-v2",
    leg: leg("leg-2", { optionType: "CALL", direction: "BUY", strike: 25000, premium: 79, callSnapshot: 38.25 })
  }, NOW);

  const result = panel.dashboardModel(value, {
    expandedStrategyId: "s1",
    acceptedViewsByStrategy: {
      s1: {
        livePnl: "+₹14,580.00",
        currentRisk: { lower: "23,817.00", upper: "—" },
        maxProfit: "+₹23,790.00",
        maxLoss: "UNBOUNDED"
      }
    }
  });

  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].underlying, "NIFTY");
  assert.equal(result.groups[0].count, 2);
  assert.deepEqual(result.groups[0].cards.map((card) => card.title), ["SHORT PUT · AUG 25", "LONG CALL · AUG 25"]);
  assert.deepEqual(result.groups[0].cards[0].metrics, {
    pnl: "+₹14,580.00", breakEven: "23,817.00", maxProfit: "+₹23,790.00", maxLoss: "UNBOUNDED"
  });
  assert.equal(result.groups[0].cards[0].expanded, true);
  assert.deepEqual(result.groups[0].cards[0].legs[0], {
    id: "leg-1", optionType: "P", strike: "24,000", direction: "SELL", lots: 2,
    entry: "₹183.00", live: "₹70.85"
  });
});

test("dashboard model keeps unavailable risk values honest and history collapsed", () => {
  let value = book();
  value = store.applyCommand(value, { id: "archive-s2", type: "ARCHIVE_STRATEGY", strategyId: "s2" }, NOW);
  const result = panel.dashboardModel(value);

  assert.deepEqual(result.groups[0].cards[0].metrics, {
    pnl: "—", breakEven: "—", maxProfit: "—", maxLoss: "—"
  });
  assert.equal(result.history[0].status, "ARCHIVED");
  assert.equal(result.history[0].expanded, false);
});

test("broker strategy card derives open P&L from broker position evidence", () => {
  const value = store.applyCommand(store.emptyBook(), {
    id: "broker-sync-panel",
    type: "SYNC_BROKER_POSITIONS",
    strategyId: "broker:BROKER:NFO:NIFTY:2026-08-25",
    versionId: "broker-panel-v1",
    snapshotId: "broker-panel-snapshot",
    label: "BROKER · AUG 25",
    instrumentKey: "BROKER:NFO:NIFTY",
    underlying: "NIFTY",
    expiry: "2026-08-25",
    positions: [{
      contractId: "NFO:NIFTY:2026-08-25:24000:PE", tradingsymbol: "NIFTY26AUG24000PE",
      exchange: "NFO", underlying: "NIFTY", expiry: "2026-08-25", strike: 24000,
      optionType: "PE", signedQuantity: -130, lotSize: 65, averagePrice: 183, lastPrice: 70.85, pnl: 14580
    }]
  }, NOW);

  const [card] = panel.dashboardModel(value).groups[0].cards;
  assert.equal(card.metrics.pnl, "+₹14,580.00");
});
