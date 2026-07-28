"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const ledger = require("./seller-ledger.js");
const risk = require("./seller-risk.js");

const EXPIRY = "2026-08-25";

function contractId(expiry = EXPIRY, strike = 24100, optionType = "CE") {
  return `NFO:NIFTY:${expiry}:${strike}:${optionType}`;
}

function position({ expiry = EXPIRY, strike = 24100, optionType = "CE", quantity = -65, symbol = "NIFTY26AUG24100CE" } = {}) {
  return {
    contractId: contractId(expiry, strike, optionType),
    tradingsymbol: symbol,
    expiry,
    exchange: "NFO",
    underlying: "NIFTY",
    strike,
    optionType,
    signedQuantity: quantity,
    lotSize: 65,
    averagePrice: 100,
    lastPrice: 90,
    pnl: 650
  };
}

function fill(id, {
  expiry = EXPIRY,
  strike = 24100,
  optionType = "CE",
  symbol = "NIFTY26AUG24100CE",
  transactionType = "SELL",
  quantity = 65,
  price = 100,
  timestamp = "2026-08-01T09:15:00+05:30"
} = {}) {
  return {
    id,
    contractId: contractId(expiry, strike, optionType),
    tradingsymbol: symbol,
    underlying: "NIFTY",
    exchange: "NFO",
    expiry,
    strike,
    optionType,
    transactionType,
    quantity,
    price,
    timestamp
  };
}

function strategy(current, id, expiry = EXPIRY) {
  return ledger.createStrategy(current, { id, name: id, underlying: "NIFTY", expiry });
}

function stage(current, trades, fingerprint = "batch-1") {
  return ledger.stageTradebookImport(current, {
    trades,
    sourceKind: "ZERODHA_TRADEBOOK_CSV",
    batchFingerprint: fingerprint,
    stagedAt: "2026-08-02T09:00:00+05:30",
    scope: { underlying: "NIFTY", expiry: EXPIRY }
  });
}

function assign(current, fillId, quantity, strategyId) {
  return ledger.assignFillQuantity(current, {
    fillId,
    quantity,
    strategyId,
    disposition: "STRATEGY",
    confirmedAt: "2026-08-02T09:05:00+05:30"
  });
}

function leaveUnassigned(current, fillId, quantity) {
  return ledger.assignFillQuantity(current, {
    fillId,
    quantity,
    disposition: "UNASSIGNED",
    confirmedAt: "2026-08-02T09:05:00+05:30"
  });
}

function confirmCoverage(current, strategyId, fingerprint = "batch-1", from = "2026-08-01", to = "2026-08-01") {
  return ledger.confirmHistoryCoverage(current, {
    strategyId,
    batchFingerprint: fingerprint,
    from,
    to,
    checkpointIds: [],
    confirmedAt: "2026-08-02T09:10:00+05:30"
  });
}

function accept(current, strategyId, at = "2026-08-01T16:00:00+05:30") {
  return ledger.acceptSnapshot(current, { strategyId, snapshot: { at, candidateId: `${strategyId}-${at}` } });
}

test("canonical contract identity isolates same-strike weekly expiries and scoped refresh preserves September", () => {
  assert.equal(ledger.canonicalContractId("2026-08-04", 24100, "CE"), "NFO:NIFTY:2026-08-04:24100:CE");
  assert.notEqual(
    ledger.canonicalContractId("2026-08-04", 24100, "CE"),
    ledger.canonicalContractId("2026-08-11", 24100, "CE")
  );

  let current = ledger.emptyLedger();
  current = strategy(current, "aug", "2026-08-04");
  current = strategy(current, "sep", "2026-09-01");
  current = ledger.reconcilePositions(current, [position({
    expiry: "2026-09-01",
    symbol: "NIFTY2690124100CE"
  })], { expiry: "2026-09-01" });
  const septemberId = contractId("2026-09-01");
  current = ledger.allocateLots(current, { strategyId: "sep", contractId: septemberId, signedLots: -1 });
  current = ledger.reconcilePositions(current, [position({
    expiry: "2026-08-04",
    symbol: "NIFTY2680424100CE"
  })], { expiry: "2026-08-04" });

  assert.deepEqual(current.brokerPositions.map((item) => item.contractId).sort(), [
    contractId("2026-08-04"),
    septemberId
  ].sort());
  assert.equal(current.strategies.find((item) => item.id === "sep").allocations[0].contractId, septemberId);
  assert.notEqual(ledger.strategyRiskInput(current, "sep").status, "REVIEW_POSITION_CHANGES");
});

test("CSV evidence stages unowned, supports quantity splits, and leaves explicit remainder unassigned", () => {
  let current = ledger.emptyLedger();
  current = strategy(current, "s1");
  current = strategy(current, "s2");
  current = ledger.reconcilePositions(current, [position({ quantity: -130 })], { expiry: EXPIRY });
  current = ledger.allocateLots(current, { strategyId: "s1", contractId: contractId(), signedLots: -1 });
  current = ledger.allocateLots(current, { strategyId: "s2", contractId: contractId(), signedLots: -1 });
  current = stage(current, [fill("split-fill", { quantity: 195 })]);

  assert.deepEqual(current.fillAssignments, []);
  assert.deepEqual(current.tradeReviews.map(({ fillId, remainingQuantity }) => ({ fillId, remainingQuantity })), [
    { fillId: "split-fill", remainingQuantity: 195 }
  ]);

  current = assign(current, "split-fill", 65, "s1");
  current = assign(current, "split-fill", 65, "s2");
  current = leaveUnassigned(current, "split-fill", 65);
  current = confirmCoverage(current, "s1");
  current = confirmCoverage(current, "s2");
  current = accept(current, "s1");
  current = accept(current, "s2");

  assert.deepEqual(current.fillAssignments.map(({ fillId, strategyId, quantity }) => ({ fillId, strategyId, quantity })), [
    { fillId: "split-fill", strategyId: "s1", quantity: 65 },
    { fillId: "split-fill", strategyId: "s2", quantity: 65 }
  ]);
  assert.deepEqual(current.fillDispositions.map(({ fillId, disposition, quantity }) => ({ fillId, disposition, quantity })), [
    { fillId: "split-fill", disposition: "UNASSIGNED", quantity: 65 }
  ]);
  assert.deepEqual(current.tradeReviews, []);
  assert.equal(ledger.strategyRiskInput(current, "s1").status, "OK");
  assert.equal(ledger.strategyRiskInput(current, "s2").status, "OK");
});

test("explicit ownership admits closed same-expiry roll contracts without treating them as open positions", () => {
  let current = strategy(ledger.emptyLedger(), "s1");
  current = ledger.reconcilePositions(current, [position()], { expiry: EXPIRY });
  current = ledger.allocateLots(current, { strategyId: "s1", contractId: contractId(), signedLots: -1 });
  const closedId = contractId(EXPIRY, 24000, "CE");
  current = stage(current, [
    fill("open", { price: 100 }),
    fill("roll-open", { strike: 24000, symbol: "NIFTY26AUG24000CE", price: 80 }),
    fill("roll-close", { strike: 24000, symbol: "NIFTY26AUG24000CE", transactionType: "BUY", price: 40, timestamp: "2026-08-01T10:15:00+05:30" })
  ]);
  current = assign(current, "open", 65, "s1");
  current = assign(current, "roll-open", 65, "s1");
  current = assign(current, "roll-close", 65, "s1");
  current = confirmCoverage(current, "s1");
  current = accept(current, "s1");

  const input = ledger.strategyRiskInput(current, "s1");
  assert.equal(input.status, "OK");
  assert.deepEqual(input.fills.map((item) => item.id), ["open", "roll-open", "roll-close"]);
  assert.equal(input.openLegs.some((leg) => leg.id === closedId), false);
});

test("unrelated same-contract round trip cannot create false ₹9,750 cash or 24,250 breakeven", () => {
  let current = strategy(ledger.emptyLedger(), "owned");
  current = ledger.reconcilePositions(current, [position()], { expiry: EXPIRY });
  current = ledger.allocateLots(current, { strategyId: "owned", contractId: contractId(), signedLots: -1 });
  current = stage(current, [
    fill("owned-open", { price: 100 }),
    fill("other-open", { price: 200, timestamp: "2026-08-01T10:00:00+05:30" }),
    fill("other-close", { transactionType: "BUY", price: 150, timestamp: "2026-08-01T10:05:00+05:30" })
  ]);
  current = assign(current, "owned-open", 65, "owned");
  current = leaveUnassigned(current, "other-open", 65);
  current = leaveUnassigned(current, "other-close", 65);
  current = confirmCoverage(current, "owned");
  current = accept(current, "owned");

  const input = ledger.strategyRiskInput(current, "owned");
  const map = risk.wholeTradeRiskMap({ openLegs: input.openLegs, fills: input.fills, history: input.history });
  assert.deepEqual(input.fills.map(({ id, quantity }) => ({ id, quantity })), [{ id: "owned-open", quantity: 65 }]);
  assert.equal(map.cashBalance, 6500);
  assert.deepEqual(map.breakevens, [24200]);
  assert.notEqual(map.cashBalance, 9750);
  assert.notDeepEqual(map.breakevens, [24250]);
});

test("whole-trade history stays closed until operator declares coverage bounds", () => {
  let current = strategy(ledger.emptyLedger(), "s1");
  current = ledger.reconcilePositions(current, [position()], { expiry: EXPIRY });
  current = ledger.allocateLots(current, { strategyId: "s1", contractId: contractId(), signedLots: -1 });
  current = stage(current, [fill("open")]);
  current = assign(current, "open", 65, "s1");
  current = accept(current, "s1");
  assert.equal(ledger.strategyRiskInput(current, "s1").status, "HISTORY_INCOMPLETE");

  current = confirmCoverage(current, "s1");
  assert.equal(ledger.strategyRiskInput(current, "s1").status, "OK");
});

test("successful zero-trade checkpoint extends coverage while a missed day becomes HISTORY_GAP", () => {
  function baseline() {
    let current = strategy(ledger.emptyLedger(), "s1");
    current = ledger.reconcilePositions(current, [position()], { expiry: EXPIRY });
    current = ledger.allocateLots(current, { strategyId: "s1", contractId: contractId(), signedLots: -1 });
    current = stage(current, [fill("open")]);
    current = assign(current, "open", 65, "s1");
    return confirmCoverage(current, "s1");
  }

  let contiguous = baseline();
  contiguous = ledger.ingestBrokerTrades(contiguous, {
    trades: [], expiry: EXPIRY, observedAt: "2026-08-02T16:00:00+05:30"
  });
  contiguous = accept(contiguous, "s1", "2026-08-02T16:01:00+05:30");
  assert.deepEqual(contiguous.historyCheckpoints.map(({ date, tradeIds }) => ({ date, tradeIds })), [
    { date: "2026-08-02", tradeIds: [] }
  ]);
  assert.equal(ledger.strategyRiskInput(contiguous, "s1").status, "OK");

  let missed = baseline();
  missed = ledger.ingestBrokerTrades(missed, {
    trades: [], expiry: EXPIRY, observedAt: "2026-08-03T16:00:00+05:30"
  });
  missed = accept(missed, "s1", "2026-08-03T16:01:00+05:30");
  assert.equal(ledger.strategyRiskInput(missed, "s1").status, "HISTORY_GAP");
  assert.equal(ledger.strategyRiskInput(missed, "s1").history.gap, true);
});

test("legacy month-only stored contract identity fails closed", () => {
  const current = strategy(ledger.emptyLedger(), "legacy");
  current.strategies[0].allocations.push({ contractId: "NFO:NIFTY26AUG24100CE", signedLots: -1 });
  assert.equal(ledger.strategyRiskInput(current, "legacy").status, "LEGACY_IDENTITY_REVIEW_REQUIRED");
});
