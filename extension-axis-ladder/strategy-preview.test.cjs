const test = require("node:test");
const assert = require("node:assert/strict");
const store = require("./strategy-store.js");
const preview = require("./strategy-preview.js");

const NOW = "2026-07-31T10:00:00.000Z";

function leg(overrides) {
  return {
    id: "leg-1",
    source: "BROKER",
    instrumentKey: "NSE:NIFTY",
    underlying: "NIFTY",
    expiry: "2026-08-25",
    strike: 100,
    optionType: "CALL",
    direction: "SELL",
    lots: 1,
    lotSize: 1,
    premium: 10,
    callSnapshot: 10,
    putSnapshot: 10,
    charges: [{ kind: "BROKERAGE", amount: 2 }],
    chargesComplete: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides
  };
}

function command(book, input) {
  return store.applyCommand(book, input, NOW);
}

function twoStrategyBook(overrides = {}) {
  let book = store.emptyBook();
  book = command(book, {
    type: "CREATE_STRATEGY", id: "c1", strategyId: "s1", versionId: "v1",
    label: "T1", instrumentKey: "NSE:NIFTY", underlying: "NIFTY", expiry: "2026-08-25"
  });
  book = command(book, {
    type: "ADD_LEG", id: "a1", strategyId: "s1", versionId: "v2",
    leg: leg({ id: "call", ...overrides.call })
  });
  book = command(book, {
    type: "CREATE_STRATEGY", id: "c2", strategyId: "s2", versionId: "v3",
    label: "T2", instrumentKey: overrides.instrumentKey || "NSE:NIFTY",
    underlying: overrides.underlying || "NIFTY", expiry: overrides.expiry || "2026-08-25"
  });
  book = command(book, {
    type: "ADD_LEG", id: "a2", strategyId: "s2", versionId: "v4",
    leg: leg({
      id: "put", optionType: "PUT",
      instrumentKey: overrides.instrumentKey || "NSE:NIFTY",
      underlying: overrides.underlying || "NIFTY",
      expiry: overrides.expiry || "2026-08-25",
      ...overrides.put
    })
  });
  return book;
}

test("square selection and Compare state update immutably", () => {
  const initial = preview.createSelection();
  const one = preview.toggle(initial, "s1");
  const two = preview.toggle(one, "s2");
  const compared = preview.setCompare(two, true);
  assert.deepEqual(initial, { selectedIds: [], compare: false });
  assert.deepEqual(two, { selectedIds: ["s1", "s2"], compare: false });
  assert.deepEqual(preview.toggle(two, "s1").selectedIds, ["s2"]);
  assert.equal(compared.compare, true);
  assert.notEqual(compared, two);
});

test("preview requires at least two strategies", () => {
  const result = preview.buildPreview(twoStrategyBook(), ["s1"], [{ strike: 100, call: 8, put: 8 }], { lotSize: 1 });
  assert.equal(result.status, "SELECT_MORE");
  assert.deepEqual(result.breakEvens, []);
});

test("known charges shift combined break-evens and current P&L", () => {
  const result = preview.buildPreview(twoStrategyBook(), ["s1", "s2"], [{ strike: 100, call: 8, put: 8 }], { lotSize: 1 });
  assert.equal(result.status, "OK");
  assert.deepEqual(result.breakEvens, [84, 116]);
  assert.equal(result.currentPnl, 0);
  assert.equal(result.knownCharges, 4);
  assert.equal(result.chargesComplete, true);
  assert.equal(result.disclosure, null);
  assert.equal(result.maxProfit, 16);
  assert.equal(result.maxLoss, -Infinity);
  assert.equal(result.winRate, null, "win rate stays unavailable until side-console evidence exists");
});

test("preview uses each 25/50 contract size and subtracts charges as rupees", () => {
  const groups = [
    {
      id: "s1", instrumentKey: "NSE:NIFTY", expiry: "2026-08-25",
      entries: [leg({ id: "call-25", optionType: "CALL", lotSize: 25,
        charges: [{ kind: "BROKERAGE", amount: 20 }] })]
    },
    {
      id: "s2", instrumentKey: "NSE:NIFTY", expiry: "2026-08-25",
      entries: [leg({ id: "put-50", optionType: "PUT", lotSize: 50,
        charges: [{ kind: "BROKERAGE", amount: 30 }] })]
    }
  ];
  const result = preview.buildPreviewFromGroups(groups, [{ strike: 100, call: 8, put: 8 }], { lotSize: 1 });
  assert.equal(result.status, "OK");
  assert.ok(Math.abs(result.breakEvens[0] - 86) <= 1e-9);
  assert.ok(Math.abs(result.breakEvens[1] - 128) <= 1e-9);
  assert.equal(result.currentPnl, 100);
  assert.equal(result.knownCharges, 50);
});

test("preview supports mixed 25/50/65 leg quantities", () => {
  const groups = [
    {
      id: "s1", instrumentKey: "NSE:NIFTY", expiry: "2026-08-25",
      entries: [
        leg({ id: "call-25", optionType: "CALL", strike: 100, lotSize: 25, charges: [] }),
        leg({ id: "call-65", optionType: "CALL", direction: "BUY", strike: 110,
          premium: 2, lotSize: 65, charges: [] })
      ]
    },
    {
      id: "s2", instrumentKey: "NSE:NIFTY", expiry: "2026-08-25",
      entries: [leg({ id: "put-50", optionType: "PUT", strike: 100, lotSize: 50, charges: [] })]
    }
  ];
  const result = preview.buildPreviewFromGroups(groups, [
    { strike: 100, call: 8, put: 8 },
    { strike: 110, call: 3, put: 1 }
  ]);
  assert.equal(result.status, "OK");
  assert.equal(result.currentPnl, 215);
  assert.equal(result.breakEvens.length, 1);
  assert.ok(Math.abs(result.breakEvens[0] - 87.6) <= 1e-9);
});

test("preview keeps legacy manual fallback but cannot rescue missing broker lot size", () => {
  const legacyGroups = [
    {
      id: "s1", instrumentKey: "NSE:NIFTY", expiry: "2026-08-25",
      entries: [leg({ id: "legacy-call", source: "MANUAL", optionType: "CALL", lotSize: undefined, charges: [] })]
    },
    {
      id: "s2", instrumentKey: "NSE:NIFTY", expiry: "2026-08-25",
      entries: [leg({ id: "legacy-put", source: "MANUAL", optionType: "PUT", lotSize: undefined, charges: [] })]
    }
  ];
  const legacy = preview.buildPreviewFromGroups(legacyGroups, [{ strike: 100, call: 8, put: 8 }]);
  assert.equal(legacy.status, "OK");
  assert.equal(legacy.currentPnl, 260);
  assert.deepEqual(legacy.breakEvens, [80, 120]);

  const missingBroker = structuredClone(legacyGroups);
  missingBroker[1].entries[0].source = "BROKER_POSITION";
  const blocked = preview.buildPreviewFromGroups(missingBroker, [{ strike: 100, call: 8, put: 8 }], { lotSize: 65 });
  assert.equal(blocked.status, "INCOMPLETE");
  assert.equal(blocked.currentPnl, null);
  assert.deepEqual(blocked.breakEvens, []);
  assert.deepEqual(blocked.missingLotSizes, [{ legId: "legacy-put", source: "BROKER_POSITION" }]);
});

test("mixed instrument or expiry selection is rejected", () => {
  const book = twoStrategyBook({ instrumentKey: "CME:ES", underlying: "ES", expiry: "2026-09-18" });
  const result = preview.buildPreview(book, ["s1", "s2"], [{ strike: 100, call: 8, put: 8 }]);
  assert.equal(result.status, "INCOMPATIBLE");
  assert.deepEqual(result.breakEvens, []);
});

test("same underlying and expiry combine across legacy manual and broker instrument keys", () => {
  const book = twoStrategyBook({ instrumentKey: "BROKER:NFO:NIFTY", underlying: "NIFTY" });
  const result = preview.buildPreview(book, ["s1", "s2"], [{ strike: 100, call: 8, put: 8 }]);
  assert.equal(result.status, "OK");
  assert.equal(result.underlying, "NIFTY");
  assert.deepEqual(result.breakEvens, [84, 116]);
});

test("missing live quote preserves selection but blocks economics", () => {
  const result = preview.buildPreview(twoStrategyBook(), ["s1", "s2"], [{ strike: 100, call: 8, put: 0 }], { lotSize: 1 });
  assert.equal(result.status, "INCOMPLETE");
  assert.deepEqual(result.breakEvens, [84, 116], "saved-entry break-evens remain available without a live quote");
  assert.equal(result.currentPnl, null);
  assert.equal(result.maxProfit, 16);
  assert.equal(result.maxLoss, -Infinity);
  assert.deepEqual(result.missingQuotes, [{ legId: "put", strike: 100, optionType: "PUT" }]);
});

test("stale live quote timestamp preserves selection but blocks combined economics", () => {
  const result = preview.buildPreview(
    twoStrategyBook(),
    ["s1", "s2"],
    [{ strike: 100, call: 8, put: 8 }],
    {
      lotSize: 1,
      quoteUpdatedAt: "2026-07-31T09:00:00.000Z",
      now: "2026-07-31T10:00:00.000Z",
      maxQuoteAgeMs: 15 * 60 * 1000
    }
  );
  assert.equal(result.status, "INCOMPLETE");
  assert.deepEqual(result.selectedIds, ["s1", "s2"]);
  assert.equal(result.disclosure, "LIVE QUOTES STALE · REFRESH REQUIRED");
  assert.deepEqual(result.breakEvens, [84, 116], "manual refresh boundary blocks live P&L, not saved payoff evidence");
  assert.equal(result.maxProfit, 16);
  assert.equal(result.maxLoss, -Infinity);
});

test("unknown charges are disclosed, never guessed", () => {
  const book = twoStrategyBook({ put: { charges: [], chargesComplete: false } });
  const result = preview.buildPreview(book, ["s1", "s2"], [{ strike: 100, call: 8, put: 8 }], { lotSize: 1 });
  assert.equal(result.status, "OK");
  assert.equal(result.knownCharges, 2);
  assert.equal(result.chargesComplete, false);
  assert.equal(result.disclosure, "EXCLUDING UNKNOWN CHARGES");
});

test("display levels preserve exact values and format combined labels", () => {
  const result = preview.buildPreview(twoStrategyBook(), ["s1", "s2"], [{ strike: 100, call: 8, put: 8 }], { lotSize: 1 });
  assert.deepEqual(preview.displayLevels(result), [
    { kind: "combined", exact: 84, rounded: 84, label: "COMBINED BE 84" },
    { kind: "combined", exact: 116, rounded: 116, label: "COMBINED BE 116" }
  ]);
});
