"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const popupView = require("./popup-view.js");

function acceptedLedger() {
  return {
    version: 1,
    strategies: [{
      id: "aug-seller",
      name: "August seller",
      underlying: "NIFTY",
      expiry: "2026-08-25",
      allocations: [
        { contractId: "NFO:NIFTY26AUG24100CE", signedLots: -1 },
        { contractId: "NFO:NIFTY26AUG24100PE", signedLots: -1 }
      ],
      fillIds: ["fill-call", "fill-put"],
      snapshots: [{
        candidateId: "candidate-accepted",
        at: "2026-08-01T08:45:00+05:30",
        currentMap: { breakevens: [23850, 24350], maxProfit: 15000, maxLoss: "UNBOUNDED", upsideUnbounded: true },
        wholeTradeMap: { breakevens: [23825, 24375], maxProfit: 17000, maxLoss: "UNBOUNDED", upsideUnbounded: true }
      }],
      historyComplete: true
    }],
    brokerPositions: [
      {
        contractId: "NFO:NIFTY26AUG24100CE", tradingsymbol: "NIFTY26AUG24100CE",
        exchange: "NFO", underlying: "NIFTY", expiry: "2026-08-25", strike: 24100,
        optionType: "CE", signedQuantity: -65, lotSize: 65, averagePrice: 100,
        lastPrice: 84.6, pnl: 1000
      },
      {
        contractId: "NFO:NIFTY26AUG24100PE", tradingsymbol: "NIFTY26AUG24100PE",
        exchange: "NFO", underlying: "NIFTY", expiry: "2026-08-25", strike: 24100,
        optionType: "PE", signedQuantity: -65, lotSize: 65, averagePrice: 120,
        lastPrice: 123.85, pnl: -250
      }
    ],
    importedTrades: [
      {
        id: "fill-call", contractId: "NFO:NIFTY26AUG24100CE", tradingsymbol: "NIFTY26AUG24100CE",
        underlying: "NIFTY", exchange: "NFO", expiry: "2026-08-25", strike: 24100,
        optionType: "CE", transactionType: "SELL", quantity: 65, price: 110,
        timestamp: "2026-08-01T09:15:00+05:30", importBatchFingerprint: "batch-aug"
      },
      {
        id: "fill-put", contractId: "NFO:NIFTY26AUG24100PE", tradingsymbol: "NIFTY26AUG24100PE",
        underlying: "NIFTY", exchange: "NFO", expiry: "2026-08-25", strike: 24100,
        optionType: "PE", transactionType: "SELL", quantity: 65, price: 130,
        timestamp: "2026-08-01T09:16:00+05:30", importBatchFingerprint: "batch-aug"
      }
    ],
    fillAssignments: [
      { fillId: "fill-call", strategyId: "aug-seller" },
      { fillId: "fill-put", strategyId: "aug-seller" }
    ],
    importBatches: [{
      sourceKind: "ZERODHA_TRADEBOOK_CSV", fingerprint: "batch-aug",
      coverage: { from: "2026-08-01", to: "2026-08-25" },
      acceptedAt: "2026-08-01T09:20:00+05:30", confirmedAt: "2026-08-01T09:20:00+05:30"
    }],
    historyGaps: [],
    allocationRevisions: [],
    reviewChanges: [],
    audit: []
  };
}

function build(ledger = acceptedLedger(), overrides = {}) {
  return popupView.buildView({
    ledger,
    selectedStrategyId: "aug-seller",
    brokerStatus: { configured: true, connected: true, expiresAt: "2026-08-02T00:30:00.000Z" },
    chain: {
      candidateId: "candidate-accepted", expiry: "2026-08-25", daysToExpiry: 24,
      spot: 24120, updatedAt: "2026-08-01T09:20:00+05:30"
    },
    now: "2026-08-01T09:25:00+05:30",
    ...overrides
  });
}

test("builds display-ready accepted current and whole-trade risk summary", () => {
  const view = build();

  assert.equal(view.canPublish, true);
  assert.equal(view.priority.label, "CURRENT RISK");
  assert.deepEqual(view.currentRisk, { lower: "23,880.00", upper: "24,320.00" });
  assert.deepEqual(view.wholeTrade, { lower: "23,860.00", upper: "24,340.00", status: "EXCLUDING CHARGES" });
  assert.equal(view.livePnl, "+₹750.00");
  assert.equal(view.maxProfit, "+₹14,300.00");
  assert.equal(view.maxLoss, "UNBOUNDED");
  assert.deepEqual(view.whyMoved, [
    "Lower breakeven moved 30.00 points higher.",
    "Upper breakeven moved 30.00 points lower.",
    "Maximum profit decreased by 700.00."
  ]);
  assert.match(view.warning, /unbounded/i);
  assert.deepEqual(view.legs.map((leg) => leg.label), ["-1 × 24,100 CE", "-1 × 24,100 PE"]);
  assert.equal(view.timeline.length, 1);
});

test("fails closed while any broker position still needs reviewed allocation", () => {
  const ledger = acceptedLedger();
  ledger.reviewChanges = [{
    contractId: "NFO:NIFTY26AUG24100CE",
    previousSignedQuantity: -65,
    signedQuantity: -130,
    allocatedQuantity: -65,
    position: { ...ledger.brokerPositions[0], signedQuantity: -130 }
  }];

  const view = build(ledger);

  assert.equal(view.canPublish, false);
  assert.equal(view.priority.label, "REVIEW POSITION CHANGES");
  assert.deepEqual(view.currentRisk, { lower: "—", upper: "—" });
  assert.deepEqual(view.wholeTrade, { lower: "—", upper: "—", status: "WITHHELD" });
  assert.equal(view.reviewChanges[0].availableLots, -1);
});

test("shows incomplete history without inventing whole-trade risk", () => {
  const ledger = acceptedLedger();
  ledger.strategies[0].fillIds = [];
  ledger.importedTrades = [];
  ledger.fillAssignments = [];
  ledger.importBatches = [];

  const view = build(ledger);

  assert.equal(view.canPublish, true);
  assert.equal(view.wholeTrade.status, "HISTORY INCOMPLETE");
  assert.equal(view.wholeTrade.lower, "—");
  assert.match(view.warning, /history incomplete/i);
});

test("withholds publication until candidate ID matches an accepted ledger snapshot", () => {
  const ledger = acceptedLedger();
  const missingId = acceptedLedger();
  delete missingId.strategies[0].snapshots[0].candidateId;

  const mismatch = build(ledger, {
    chain: {
      candidateId: "candidate-pending", expiry: "2026-08-25", daysToExpiry: 24,
      spot: 24120, updatedAt: "2026-08-01T09:20:00+05:30"
    }
  });
  const absent = build(missingId);

  for (const view of [mismatch, absent]) {
    assert.equal(view.canPublish, false);
    assert.equal(view.priority.label, "REVIEW POSITION CHANGES");
    assert.deepEqual(view.currentRisk, { lower: "—", upper: "—" });
  }
});

test("surfaces stale broker timestamp and disconnected auth action", () => {
  const stale = build(acceptedLedger(), {
    chain: {
      candidateId: "candidate-accepted", expiry: "2026-08-25", daysToExpiry: 24,
      spot: 24120, updatedAt: "2026-08-01T09:00:00+05:30"
    },
    now: "2026-08-01T09:31:00+05:30"
  });
  const disconnected = build(acceptedLedger(), {
    brokerStatus: { configured: true, connected: false, expiresAt: null }
  });
  const expired = build(acceptedLedger(), {
    brokerStatus: { configured: true, connected: true, expiresAt: "2026-08-01T03:00:00.000Z" }
  });

  assert.equal(stale.broker.kind, "stale");
  assert.match(stale.broker.label, /ZERODHA STALE/);
  assert.match(stale.broker.label, /09:00/);
  assert.deepEqual(disconnected.broker.action, { label: "CONNECT ZERODHA", kind: "connect" });
  assert.equal(expired.broker.kind, "auth");
  assert.match(expired.broker.label, /EXPIRED/);
});
