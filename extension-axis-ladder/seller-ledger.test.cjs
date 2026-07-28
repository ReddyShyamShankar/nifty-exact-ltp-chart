"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const ledger = require("./seller-ledger.js");

function position(overrides = {}) {
  return {
    contractId: "NFO:NIFTY26AUG24100CE",
    tradingsymbol: "NIFTY26AUG24100CE",
    expiry: "2026-08-25",
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
    contractId: "NFO:NIFTY26AUG24100CE",
    tradingsymbol: "NIFTY26AUG24100CE",
    underlying: "NIFTY",
    expiry: "2026-08-25",
    strike: 24100,
    optionType: "CE",
    transactionType: "SELL",
    quantity: 65,
    price: 358.8,
    timestamp: "2026-08-01T09:15:00+05:30",
    ...overrides
  };
}

function oneStrategyLedger() {
  let current = ledger.emptyLedger();
  current = ledger.createStrategy(current, {
    id: "s1",
    name: "August call sale",
    underlying: "NIFTY",
    expiry: "2026-08-25"
  });
  return current;
}

test("creates versioned JSON-safe ledger without mutating previous value", () => {
  const empty = ledger.emptyLedger();
  const created = ledger.createStrategy(empty, {
    id: "s1",
    name: "August call sale",
    underlying: "NIFTY",
    expiry: "2026-08-25"
  });

  assert.deepEqual(JSON.parse(JSON.stringify(empty)), {
    version: 1,
    strategies: [],
    brokerPositions: [],
    importedTrades: [],
    reviewChanges: [],
    audit: []
  });
  assert.equal(created.strategies[0].expiry, "2026-08-25");
  assert.equal(created.strategies[0].underlying, "NIFTY");
  assert.equal(created.audit.at(-1).type, "STRATEGY_CREATED");
});

test("rejects strategy with a non-NIFTY underlying or missing expiry", () => {
  const empty = ledger.emptyLedger();
  assert.throws(() => ledger.createStrategy(empty, {
    id: "s1", name: "wrong", underlying: "BANKNIFTY", expiry: "2026-08-25"
  }), /NIFTY/i);
  assert.throws(() => ledger.createStrategy(empty, {
    id: "s1", name: "wrong", underlying: "NIFTY"
  }), /expiry/i);
});

test("changed broker quantity enters review without mutating accepted allocation", () => {
  let existingLedger = oneStrategyLedger();
  existingLedger = ledger.reconcilePositions(existingLedger, [position()]);
  existingLedger = ledger.allocateLots(existingLedger, {
    strategyId: "s1", contractId: "NFO:NIFTY26AUG24100CE", signedLots: -1
  });
  const reviewed = ledger.reconcilePositions(existingLedger, [position({ signedQuantity: -130 })]);

  assert.equal(reviewed.reviewChanges.length, 1);
  assert.equal(reviewed.strategies[0].allocations[0].signedLots, -1);
  assert.equal(existingLedger.brokerPositions[0].signedQuantity, -65);
  assert.equal(reviewed.audit.at(-1).type, "POSITION_REVIEW_REQUIRED");
});

test("rejects allocation that exceeds or reverses broker lots", () => {
  let reviewLedger = oneStrategyLedger();
  reviewLedger = ledger.reconcilePositions(reviewLedger, [position()]);

  assert.throws(() => ledger.allocateLots(reviewLedger, {
    strategyId: "s1", contractId: "NFO:NIFTY26AUG24100CE", signedLots: 1
  }), /direction|available/i);
  assert.throws(() => ledger.allocateLots(reviewLedger, {
    strategyId: "s1", contractId: "NFO:NIFTY26AUG24100CE", signedLots: -2
  }), /direction|available/i);
  assert.throws(() => ledger.allocateLots(reviewLedger, {
    strategyId: "s1", contractId: "NFO:NIFTY26AUG24100CE", signedLots: -1.5
  }), /whole/i);
});

test("rejects allocation of another expiry into a strategy", () => {
  let current = oneStrategyLedger();
  current = ledger.reconcilePositions(current, [position({
    contractId: "NFO:NIFTY02SEP24100CE",
    expiry: "2026-09-01"
  })]);

  assert.throws(() => ledger.allocateLots(current, {
    strategyId: "s1", contractId: "NFO:NIFTY02SEP24100CE", signedLots: -1
  }), /expiry/i);
});

test("clears review only when broker lots are fully allocated and appends audit evidence", () => {
  let current = oneStrategyLedger();
  current = ledger.reconcilePositions(current, [position({ signedQuantity: -130 })]);
  current = ledger.allocateLots(current, {
    strategyId: "s1", contractId: "NFO:NIFTY26AUG24100CE", signedLots: -2
  });

  assert.deepEqual(current.reviewChanges, []);
  assert.equal(current.strategies[0].allocations[0].signedLots, -2);
  assert.equal(current.audit.at(-1).type, "ALLOCATION_ACCEPTED");
});

test("keeps imported fills immutable and summarizes duplicate IDs and fingerprints", () => {
  let current = oneStrategyLedger();
  current = ledger.reconcilePositions(current, [position()]);
  current = ledger.allocateLots(current, {
    strategyId: "s1", contractId: "NFO:NIFTY26AUG24100CE", signedLots: -1
  });
  const source = fill();
  current = ledger.assignFills(current, {
    strategyId: "s1", trades: [source], fillIds: ["trade-1"], complete: true
  });
  source.price = 1;
  const imported = current.importedTrades[0];
  const repeated = ledger.assignFills(current, {
    strategyId: "s1",
    trades: [fill(), fill({ id: "trade-2" })],
    fillIds: ["trade-1"],
    complete: true
  });

  assert.equal(imported.price, 358.8);
  assert.equal(repeated.importedTrades.length, 1);
  assert.deepEqual(repeated.audit.at(-1), {
    type: "IMPORT_SUMMARY",
    accepted: 0,
    duplicateIds: 1,
    duplicateFingerprints: 1
  });
});

test("requires explicit fill ownership when one broker contract is split across strategies", () => {
  let current = oneStrategyLedger();
  current = ledger.createStrategy(current, {
    id: "s2", name: "Second call sale", underlying: "NIFTY", expiry: "2026-08-25"
  });
  current = ledger.reconcilePositions(current, [position({ signedQuantity: -130 })]);
  current = ledger.allocateLots(current, {
    strategyId: "s1", contractId: "NFO:NIFTY26AUG24100CE", signedLots: -1
  });
  current = ledger.allocateLots(current, {
    strategyId: "s2", contractId: "NFO:NIFTY26AUG24100CE", signedLots: -1
  });
  const incomplete = ledger.strategyRiskInput(current, "s1");
  current = ledger.assignFills(current, {
    strategyId: "s1", trades: [fill()], fillIds: ["trade-1"], complete: true
  });
  const exact = ledger.strategyRiskInput(current, "s1");

  assert.equal(incomplete.status, "ENTRY_HISTORY_INCOMPLETE");
  assert.equal(incomplete.history.consistent, false);
  assert.equal(exact.status, "OK");
  assert.equal(exact.openLegs[0].entryPrice, 358.8);
  assert.deepEqual(exact.fills.map((trade) => trade.id), ["trade-1"]);
});

test("fails whole-trade evidence closed until complete assigned history exists", () => {
  let current = oneStrategyLedger();
  current = ledger.reconcilePositions(current, [position()]);
  current = ledger.allocateLots(current, {
    strategyId: "s1", contractId: "NFO:NIFTY26AUG24100CE", signedLots: -1
  });
  const noHistory = ledger.strategyRiskInput(current, "s1");
  current = ledger.assignFills(current, {
    strategyId: "s1", trades: [fill()], fillIds: ["trade-1"], complete: false
  });
  const incompleteHistory = ledger.strategyRiskInput(current, "s1");
  current = ledger.assignFills(current, {
    strategyId: "s1", trades: [], fillIds: [], complete: true
  });
  const completeHistory = ledger.strategyRiskInput(current, "s1");

  assert.equal(noHistory.status, "HISTORY_INCOMPLETE");
  assert.equal(noHistory.history.complete, false);
  assert.equal(incompleteHistory.status, "HISTORY_INCOMPLETE");
  assert.equal(completeHistory.status, "OK");
  assert.deepEqual(completeHistory.history, {
    complete: true, reconciled: true, duplicates: false, consistent: true
  });
});

test("appends snapshots without replacing prior accepted state", () => {
  let current = oneStrategyLedger();
  current = ledger.acceptSnapshot(current, {
    strategyId: "s1", snapshot: { at: "2026-08-01T09:15:00+05:30", status: "OK", breakevens: [24000] }
  });
  current = ledger.acceptSnapshot(current, {
    strategyId: "s1", snapshot: { at: "2026-08-01T09:20:00+05:30", status: "OK", breakevens: [24100] }
  });

  assert.equal(current.strategies[0].snapshots.length, 2);
  assert.deepEqual(current.strategies[0].snapshots[0].breakevens, [24000]);
  assert.equal(current.audit.at(-1).type, "SNAPSHOT_ACCEPTED");
});
