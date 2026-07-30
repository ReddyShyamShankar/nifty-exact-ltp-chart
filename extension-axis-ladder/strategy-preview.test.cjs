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
});

test("mixed instrument or expiry selection is rejected", () => {
  const book = twoStrategyBook({ instrumentKey: "CME:ES", underlying: "ES", expiry: "2026-09-18" });
  const result = preview.buildPreview(book, ["s1", "s2"], [{ strike: 100, call: 8, put: 8 }]);
  assert.equal(result.status, "INCOMPATIBLE");
  assert.deepEqual(result.breakEvens, []);
});

test("missing live quote preserves selection but blocks economics", () => {
  const result = preview.buildPreview(twoStrategyBook(), ["s1", "s2"], [{ strike: 100, call: 8, put: 0 }], { lotSize: 1 });
  assert.equal(result.status, "INCOMPLETE");
  assert.deepEqual(result.breakEvens, []);
  assert.equal(result.currentPnl, null);
  assert.deepEqual(result.missingQuotes, [{ legId: "put", strike: 100, optionType: "PUT" }]);
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
