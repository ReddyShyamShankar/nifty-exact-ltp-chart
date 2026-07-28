"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const ledger = require("./seller-ledger.js");

const EXPIRY = "2026-08-25";
const CONTRACT = "NFO:NIFTY:2026-08-25:24100:CE";

function position(overrides = {}) {
  return {
    contractId: CONTRACT,
    tradingsymbol: "NIFTY26AUG24100CE",
    expiry: EXPIRY,
    exchange: "NFO",
    underlying: "NIFTY",
    strike: 24100,
    optionType: "CE",
    signedQuantity: -65,
    lotSize: 65,
    averagePrice: 358.8,
    lastPrice: 320,
    pnl: 2522,
    ...overrides
  };
}

function fill(overrides = {}) {
  return {
    id: "trade-1",
    contractId: CONTRACT,
    tradingsymbol: "NIFTY26AUG24100CE",
    underlying: "NIFTY",
    exchange: "NFO",
    expiry: EXPIRY,
    strike: 24100,
    optionType: "CE",
    transactionType: "SELL",
    quantity: 65,
    price: 358.8,
    timestamp: "2026-08-01T09:15:00+05:30",
    ...overrides
  };
}

function oneStrategy() {
  return ledger.createStrategy(ledger.emptyLedger(), {
    id: "s1", name: "August call sale", underlying: "NIFTY", expiry: EXPIRY
  });
}

function allocated() {
  let current = oneStrategy();
  current = ledger.reconcilePositions(current, [position()], { expiry: EXPIRY });
  return ledger.allocateLots(current, { strategyId: "s1", contractId: CONTRACT, signedLots: -1 });
}

function stage(current, trades = [fill()], stagedAt = "2026-08-02T09:00:00+05:30") {
  return ledger.stageTradebookImport(current, {
    trades,
    sourceKind: "ZERODHA_TRADEBOOK_CSV",
    batchFingerprint: "batch-1",
    stagedAt,
    scope: { underlying: "NIFTY", expiry: EXPIRY }
  });
}

test("creates immutable JSON-safe ledger with explicit evidence collections", () => {
  const empty = ledger.emptyLedger();
  const created = ledger.createStrategy(empty, {
    id: "s1", name: "August", underlying: "NIFTY", expiry: EXPIRY
  });

  assert.deepEqual(empty, {
    version: 1,
    strategies: [],
    brokerPositions: [],
    importedTrades: [],
    tradeEvidence: [],
    tradeReviews: [],
    fillAssignments: [],
    fillDispositions: [],
    importBatches: [],
    coverageDeclarations: [],
    historyCheckpoints: [],
    historyGaps: [],
    allocationRevisions: [],
    reviewChanges: [],
    audit: []
  });
  assert.equal(created.strategies[0].expiry, EXPIRY);
  assert.equal(empty.strategies.length, 0);
  assert.doesNotThrow(() => JSON.stringify(created));
});

test("current-day bridge trades stay immutable, unowned, deduplicated, and checkpointed", () => {
  const source = fill({ id: "daily-1" });
  const first = ledger.ingestBrokerTrades(oneStrategy(), {
    trades: [source], expiry: EXPIRY, observedAt: "2026-08-01T03:50:00.000Z"
  });
  source.price = 1;
  const repeated = ledger.ingestBrokerTrades(first, {
    trades: [fill({ id: "daily-1" })], expiry: EXPIRY, observedAt: "2026-08-01T03:50:00.000Z"
  });

  assert.equal(first.importedTrades[0].price, 358.8);
  assert.deepEqual(first.tradeReviews.map(({ fillId, remainingQuantity }) => ({ fillId, remainingQuantity })), [
    { fillId: "daily-1", remainingQuantity: 65 }
  ]);
  assert.deepEqual(first.strategies[0].fillIds, []);
  assert.equal(repeated.importedTrades.length, 1);
  assert.equal(repeated.tradeEvidence.length, 1);
  assert.equal(repeated.historyCheckpoints.length, 1);
  assert.throws(() => ledger.ingestBrokerTrades(first, {
    trades: [fill({ id: "daily-1", price: 1 })], expiry: EXPIRY, observedAt: "2026-08-01T03:51:00.000Z"
  }), /immutable|conflict/i);
});

test("position changes preserve accepted allocations and require exact signed whole lots", () => {
  const current = allocated();
  const reviewed = ledger.reconcilePositions(current, [position({ signedQuantity: -130 })], { expiry: EXPIRY });

  assert.equal(reviewed.reviewChanges.length, 1);
  assert.equal(reviewed.strategies[0].allocations[0].signedLots, -1);
  assert.equal(current.brokerPositions[0].signedQuantity, -65);
  assert.throws(() => ledger.allocateLots(reviewed, { strategyId: "s1", contractId: CONTRACT, signedLots: 1 }), /direction/i);
  assert.throws(() => ledger.allocateLots(reviewed, { strategyId: "s1", contractId: CONTRACT, signedLots: -1.5 }), /whole/i);
});

test("allocation revisions retain complete before and after states", () => {
  let current = oneStrategy();
  current = ledger.reconcilePositions(current, [position({ signedQuantity: -130 })], { expiry: EXPIRY });
  current = ledger.allocateLots(current, { strategyId: "s1", contractId: CONTRACT, signedLots: -1 });
  current = ledger.allocateLots(current, { strategyId: "s1", contractId: CONTRACT, signedLots: -2 });
  current = ledger.allocateLots(current, { strategyId: "s1", contractId: CONTRACT, signedLots: 0 });

  assert.deepEqual(current.allocationRevisions.map(({ before, after }) => ({ before, after })), [
    { before: [], after: [{ contractId: CONTRACT, signedLots: -1 }] },
    { before: [{ contractId: CONTRACT, signedLots: -1 }], after: [{ contractId: CONTRACT, signedLots: -2 }] },
    { before: [{ contractId: CONTRACT, signedLots: -2 }], after: [] }
  ]);
});

test("identical staged batch re-import is idempotent independent of staging time", () => {
  const first = stage(allocated());
  const repeated = stage(first, [fill()], "2026-08-10T09:00:00+05:30");

  assert.equal(repeated.importBatches.length, 1);
  assert.equal(repeated.importedTrades.length, 1);
  assert.equal(repeated.tradeReviews.length, 1);
  assert.equal(repeated.importBatches[0].stagedAt, "2026-08-02T09:00:00+05:30");
  assert.throws(() => ledger.assignFills(repeated, {
    strategyId: "s1", trades: [fill()], fillIds: ["trade-1"]
  }), /explicit.*quantity/i);
});

test("exact expiry and identity validation reject cross-expiry and legacy allocations", () => {
  const current = oneStrategy();
  assert.throws(() => ledger.reconcilePositions(current, [position({
    contractId: "NFO:NIFTY:2026-09-01:24100:CE",
    tradingsymbol: "NIFTY2690124100CE",
    expiry: "2026-09-01"
  })], { expiry: EXPIRY }), /outside.*expiry/i);
  assert.throws(() => ledger.reconcilePositions(current, [position({
    contractId: "NFO:NIFTY26AUG24100CE"
  })], { expiry: EXPIRY }), /exact-expiry|identity/i);
});

test("persisted risk positions must still match canonical expiry, strike, and right", () => {
  const corrupted = allocated();
  corrupted.brokerPositions[0].strike = 24200;

  const input = ledger.strategyRiskInput(corrupted, "s1");

  assert.equal(input.status, "ENTRY_HISTORY_INCOMPLETE");
  assert.deepEqual(input.openLegs, []);
});

test("accepted snapshots persist immutable normalized positions, allocations, fills, and evidence versions", () => {
  let current = stage(allocated());
  current = ledger.assignFillQuantity(current, {
    fillId: "trade-1", strategyId: "s1", disposition: "STRATEGY", quantity: 65,
    confirmedAt: "2026-08-02T09:05:00+05:30"
  });
  current = ledger.confirmHistoryCoverage(current, {
    strategyId: "s1", batchFingerprint: "batch-1", from: "2026-08-01", to: "2026-08-01",
    checkpointIds: [], confirmedAt: "2026-08-02T09:10:00+05:30"
  });
  current = ledger.acceptSnapshot(current, {
    strategyId: "s1", snapshot: { at: "2026-08-01T16:00:00+05:30", candidateId: "candidate-1" }
  });

  const inputs = current.strategies[0].snapshots[0].normalizedInputs;
  assert.deepEqual(inputs.allocations, [{ contractId: CONTRACT, signedLots: -1 }]);
  assert.deepEqual(inputs.ownedFillQuantities.map(({ fillId, quantity }) => ({ fillId, quantity })), [
    { fillId: "trade-1", quantity: 65 }
  ]);
  assert.equal(inputs.positions[0].contractId, CONTRACT);
  assert.equal(inputs.evidence.fillAssignmentCount, 1);
  assert.equal(inputs.evidence.coverageDeclarationIds.length, 1);
});

test("explicit history gaps append audit evidence and suppress completeness", () => {
  let current = allocated();
  current = ledger.recordHistoryGap(current, {
    strategyId: "s1", from: "2026-08-02", to: "2026-08-02", reason: "missed checkpoint"
  });
  assert.equal(current.historyGaps.length, 1);
  assert.equal(current.audit.at(-1).type, "HISTORY_GAP_RECORDED");
  assert.notEqual(ledger.strategyRiskInput(current, "s1").status, "OK");
});
