const test = require("node:test");
const assert = require("node:assert/strict");
const risk = require("./seller-risk.js");

function completeHistory() {
  return { complete: true, reconciled: true, duplicates: false, consistent: true };
}

test("calculates user short-option fixture without double counting", () => {
  const result = risk.currentRiskMap({ legs: [
    { id: "c", strike: 24100, optionType: "CE", signedLots: -2, lotSize: 65, entryPrice: 358.80 },
    { id: "p", strike: 24100, optionType: "PE", signedLots: -1, lotSize: 65, entryPrice: 315.45 },
    { id: "lp", strike: 22500, optionType: "PE", signedLots: -1, lotSize: 65, entryPrice: 77.80 }
  ] });
  assert.deepEqual(result.breakevens.map((value) => Number(value.toFixed(3))), [22989.150, 24655.425]);
  assert.equal(result.maxProfit, 72205.25);
  assert.equal(result.maxLoss, -Infinity);
  assert.equal(result.upsideUnbounded, true);
});

test("whole trade counts imported open premiums once", () => {
  const result = risk.wholeTradeRiskMap({
    openLegs: [{ id: "c", strike: 24100, optionType: "CE", signedLots: -1, lotSize: 65, entryPrice: 999 }],
    fills: [{ id: "f", transactionType: "SELL", quantity: 65, price: 100 }],
    history: completeHistory(),
    charges: 0
  });
  assert.deepEqual(result.breakevens, [24200]);
  assert.equal(result.cashBalance, 6500);
});

test("whole trade fails closed without complete reconciled history evidence", () => {
  const input = {
    openLegs: [{ id: "c", strike: 100, optionType: "CE", signedLots: -1, lotSize: 1, entryPrice: 999 }],
    fills: [{ id: "f", transactionType: "SELL", quantity: 1, price: 10 }],
    charges: 0
  };
  const incompleteInputs = [
    input,
    { ...input, history: { complete: false, reconciled: true, duplicates: false, consistent: true } },
    { ...input, history: { complete: true, reconciled: false, duplicates: false, consistent: true } },
    { ...input, history: { complete: true, reconciled: true, duplicates: true, consistent: true } },
    { ...input, history: { complete: true, reconciled: true, duplicates: false, consistent: false } },
    { ...input, fills: [], history: completeHistory() },
    { ...input, fills: [{ id: "f", transactionType: "SELL", quantity: 1, price: 10 }, { id: "f", transactionType: "BUY", quantity: 1, price: 5 }], history: completeHistory() }
  ];
  for (const wholeTradeInput of incompleteInputs) {
    const result = risk.wholeTradeRiskMap(wholeTradeInput);
    assert.deepEqual(result, {
      status: "HISTORY_INCOMPLETE",
      breakevens: [],
      bands: [],
      maxProfit: null,
      maxLoss: null,
      upsideUnbounded: false,
      downsideValue: null,
      cashBalance: null,
      segments: []
    });
  }
});

test("whole trade reports an explicit checkpoint gap instead of generic incompleteness", () => {
  const result = risk.wholeTradeRiskMap({
    openLegs: [{ id: "c", strike: 24100, optionType: "CE", signedLots: -1, lotSize: 65, entryPrice: 100 }],
    fills: [{ id: "owned", transactionType: "SELL", quantity: 65, price: 100 }],
    history: { complete: false, reconciled: true, duplicates: false, consistent: true, gap: true }
  });

  assert.equal(result.status, "HISTORY_GAP");
  assert.deepEqual(result.breakevens, []);
});

test("bought lower Put caps a short Put downside", () => {
  const result = risk.currentRiskMap({ legs: [
    { id: "short-put", strike: 100, optionType: "PE", signedLots: -1, lotSize: 1, entryPrice: 10 },
    { id: "long-put", strike: 90, optionType: "PE", signedLots: 1, lotSize: 1, entryPrice: 3 }
  ] });
  assert.deepEqual(result.breakevens, [93]);
  assert.equal(result.maxProfit, 7);
  assert.equal(result.maxLoss, -3);
  assert.equal(result.downsideValue, -3);
  assert.equal(result.upsideUnbounded, false);
});

test("short Put adds downside exposure instead of protection", () => {
  const result = risk.currentRiskMap({ legs: [
    { id: "short-put", strike: 100, optionType: "PE", signedLots: -1, lotSize: 1, entryPrice: 10 }
  ] });
  assert.deepEqual(result.breakevens, [90]);
  assert.equal(result.downsideValue, -90);
  assert.equal(result.maxLoss, -90);
  assert.equal(result.upsideUnbounded, false);
});

test("finds zero, one, two, and multiple distinct payoff roots", () => {
  const noRoots = risk.currentRiskMap({ legs: [
    { id: "expensive-put", strike: 100, optionType: "PE", signedLots: 1, lotSize: 1, entryPrice: 200 }
  ] });
  const oneRoot = risk.currentRiskMap({ legs: [
    { id: "long-call", strike: 100, optionType: "CE", signedLots: 1, lotSize: 1, entryPrice: 10 }
  ] });
  const twoRoots = risk.currentRiskMap({ legs: [
    { id: "short-call", strike: 100, optionType: "CE", signedLots: -1, lotSize: 1, entryPrice: 10 },
    { id: "short-put", strike: 100, optionType: "PE", signedLots: -1, lotSize: 1, entryPrice: 10 }
  ] });
  const multipleRoots = risk.currentRiskMap({ legs: [
    { id: "long-10", strike: 10, optionType: "CE", signedLots: 1, lotSize: 1, entryPrice: 5 },
    { id: "short-20", strike: 20, optionType: "CE", signedLots: -2, lotSize: 1, entryPrice: 0 },
    { id: "long-30", strike: 30, optionType: "CE", signedLots: 2, lotSize: 1, entryPrice: 0 }
  ] });
  assert.deepEqual(noRoots.breakevens, []);
  assert.deepEqual(oneRoot.breakevens, [110]);
  assert.deepEqual(twoRoots.breakevens, [80, 120]);
  assert.deepEqual(multipleRoots.breakevens, [15, 25, 35]);
});

test("keeps separate profitable bands and distinguishes bounded right-tail loss", () => {
  const multipleRoots = risk.currentRiskMap({ legs: [
    { id: "long-10", strike: 10, optionType: "CE", signedLots: 1, lotSize: 1, entryPrice: 5 },
    { id: "short-20", strike: 20, optionType: "CE", signedLots: -2, lotSize: 1, entryPrice: 0 },
    { id: "long-30", strike: 30, optionType: "CE", signedLots: 2, lotSize: 1, entryPrice: 0 }
  ] });
  const shortCall = risk.currentRiskMap({ legs: [
    { id: "short-call", strike: 100, optionType: "CE", signedLots: -1, lotSize: 1, entryPrice: 10 }
  ] });
  const longCall = risk.currentRiskMap({ legs: [
    { id: "long-call", strike: 100, optionType: "CE", signedLots: 1, lotSize: 1, entryPrice: 10 }
  ] });
  assert.deepEqual(multipleRoots.bands.filter((band) => band.kind === "profit"), [
    { kind: "profit", from: 15, to: 25 },
    { kind: "profit", from: 35, to: Infinity }
  ]);
  assert.equal(shortCall.upsideUnbounded, true);
  assert.equal(longCall.upsideUnbounded, false);
  assert.equal(longCall.maxProfit, Infinity);
});

test("rejects negative underlying prices", () => {
  const result = risk.currentRiskMap({ legs: [
    { id: "long-put", strike: 100, optionType: "PE", signedLots: 1, lotSize: 1, entryPrice: 10 }
  ] });
  assert.equal(risk.payoffAt(result, -0.01), null);
  assert.equal(risk.payoffAt(result, 0), 90);
});

test("applies known charges once", () => {
  const result = risk.wholeTradeRiskMap({
    openLegs: [{ id: "c", strike: 100, optionType: "CE", signedLots: -1, lotSize: 1, entryPrice: 999 }],
    fills: [{ id: "f", transactionType: "SELL", quantity: 1, price: 10 }],
    history: completeHistory(),
    charges: 2
  });
  assert.equal(result.cashBalance, 8);
  assert.deepEqual(result.breakevens, [108]);
  assert.equal(risk.payoffAt(result, 100), 8);
});

test("fails closed for invalid legs", () => {
  const result = risk.currentRiskMap({ legs: [
    { id: "bad", strike: 100, optionType: "XX", signedLots: -1, lotSize: 1, entryPrice: 10 }
  ] });
  assert.equal(result.status, "INVALID_INPUT");
  assert.deepEqual(result.breakevens, []);
  assert.equal(risk.payoffAt(result, 100), null);
});

test("explains risk changes with deterministic factual movements", () => {
  const explanation = risk.explainRiskChange(
    { breakevens: [23000, 25000], maxProfit: 6500, maxLoss: -Infinity, upsideUnbounded: false },
    { breakevens: [22900, 25150], maxProfit: 13000, maxLoss: -Infinity, upsideUnbounded: true }
  );
  assert.deepEqual(explanation.breakevenMoves, [
    { index: 0, from: 23000, to: 22900, points: -100 },
    { index: 1, from: 25000, to: 25150, points: 150 }
  ]);
  assert.equal(explanation.maxProfitChange, 6500);
  assert.equal(explanation.maxLossStateChanged, false);
  assert.equal(explanation.upsideTailChanged, true);
  assert.deepEqual(explanation.facts, [
    "Lower breakeven moved 100.00 points lower.",
    "Upper breakeven moved 150.00 points higher.",
    "Maximum profit increased by 6500.00.",
    "Upside loss is now unbounded."
  ]);
});

test("explains normalized lot, premium, protection, exposure, band, and per-leg changes literally", () => {
  const previousLegs = [
    { id: "NFO:NIFTY:2026-08-25:24100:CE", strike: 24100, optionType: "CE", signedLots: -1, lotSize: 65, entryPrice: 100 },
    { id: "NFO:NIFTY:2026-08-25:24100:PE", strike: 24100, optionType: "PE", signedLots: -1, lotSize: 65, entryPrice: 120 }
  ];
  const nextLegs = [
    { id: "NFO:NIFTY:2026-08-25:23500:PE", strike: 23500, optionType: "PE", signedLots: 1, lotSize: 65, entryPrice: 20 },
    { id: "NFO:NIFTY:2026-08-25:24100:CE", strike: 24100, optionType: "CE", signedLots: -2, lotSize: 65, entryPrice: 105 },
    { id: "NFO:NIFTY:2026-08-25:24100:PE", strike: 24100, optionType: "PE", signedLots: -1, lotSize: 65, entryPrice: 115 }
  ];
  const normalizedInputs = (legs, version) => ({
    version: 1,
    strategyId: "seller",
    expiry: "2026-08-25",
    positions: legs.map((leg) => ({
      contractId: leg.id, expiry: "2026-08-25", strike: leg.strike, optionType: leg.optionType,
      signedQuantity: leg.signedLots * leg.lotSize, lotSize: leg.lotSize, averagePrice: leg.entryPrice
    })),
    allocations: legs.map((leg) => ({ contractId: leg.id, signedLots: leg.signedLots })),
    ownedFillQuantities: [],
    evidence: { allocationRevisionCount: version, fillAssignmentCount: 0, coverageDeclarationIds: [], checkpointIds: [] }
  });
  const previous = risk.currentRiskMap({ legs: previousLegs });
  const next = risk.currentRiskMap({ legs: nextLegs });

  const explanation = risk.explainRiskChange(previous, next, {
    previousInputs: normalizedInputs(previousLegs, 2),
    nextInputs: normalizedInputs(nextLegs, 5)
  });

  assert.deepEqual(explanation.facts, [
    "23,500 PE allocation changed from 0 lots to +1 lot.",
    "Bought 23,500 PE protection added: +1 lot.",
    "24,100 CE allocation changed from -1 lot to -2 lots.",
    "Short 24,100 CE exposure increased from 1 lot to 2 lots.",
    "23,500 PE premium/debit contribution changed from ₹0.00 to −₹1,300.00 (−₹1,300.00).",
    "24,100 CE premium/debit contribution changed from +₹6,500.00 to +₹13,650.00 (+₹7,150.00).",
    "24,100 PE premium/debit contribution changed from +₹7,800.00 to +₹7,475.00 (−₹325.00).",
    "Net premium/debit changed from +₹14,300.00 to +₹19,825.00 (+₹5,525.00).",
    "Lower breakeven moved 85.00 points lower.",
    "Upper breakeven moved 67.50 points lower.",
    "Profit/loss band boundaries changed.",
    "Maximum profit increased by 5525.00."
  ]);
  assert.doesNotMatch(explanation.facts.join(" "), /should|consider|recommend|advice/i);
});
