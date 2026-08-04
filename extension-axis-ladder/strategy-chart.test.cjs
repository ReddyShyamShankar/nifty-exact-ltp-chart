const test = require("node:test");
const assert = require("node:assert/strict");
const chart = require("./strategy-chart.js");

function controller(events) {
  return chart.createController({
    onOpen: (id) => events.push(["open", id]),
    onSelection: (ids) => events.push(["selection", ids]),
    onCompare: (value) => events.push(["compare", value]),
    onClear: () => events.push(["clear"])
  });
}

function axisMap(minPrice = 23000, maxPrice = 25000) {
  return {
    minPrice,
    maxPrice,
    minY: 0,
    maxY: 500,
    priceToY: (price) => ((maxPrice - price) / (maxPrice - minPrice)) * 500
  };
}

test("label opens details without toggling selection", () => {
  const events = [];
  const c = controller(events);
  c.label("s1");
  assert.deepEqual(events, [["open", "s1"]]);
  assert.deepEqual(c.selected(), []);
});

test("any square synchronizes whole strategy selection", () => {
  const events = [];
  const c = controller(events);
  c.square("s1");
  assert.equal(c.isSelected("s1"), true);
  assert.deepEqual(c.selected(), ["s1"]);
  c.square("s1");
  assert.equal(c.isSelected("s1"), false);
  assert.deepEqual(events, [["selection", ["s1"]], ["selection", []]]);
});

test("group selection replaces strategy membership in one update", () => {
  const events = [];
  const c = controller(events);
  c.setSelected(["s1", "s2", "s1", "", null]);
  assert.deepEqual(c.selected(), ["s1", "s2"]);
  assert.deepEqual(events, [["selection", ["s1", "s2"]]]);
  c.setSelected([]);
  assert.deepEqual(c.selected(), []);
});

test("Compare and clear remain explicit independent actions", () => {
  const events = [];
  const c = controller(events);
  c.square("s1");
  c.square("s2");
  c.compare(true);
  c.clear();
  assert.equal(c.comparing(), false);
  assert.deepEqual(c.selected(), []);
  assert.deepEqual(events.slice(-3), [["compare", true], ["selection", []], ["clear"]]);
  assert.equal(typeof c.doubleClick, "undefined");
});

test("on-screen roots remain exact rails", () => {
  assert.deepEqual(chart.projectBreakEven(24000, axisMap()), { mode: "RAIL", exact: 24000, railY: 250 });
});

test("off-screen roots become truthful top and bottom edge markers", () => {
  assert.deepEqual(chart.projectBreakEven(25420, axisMap()), {
    mode: "EDGE", edge: "TOP", arrow: "↑", exact: 25420, markerY: 0
  });
  assert.deepEqual(chart.projectBreakEven(22500, axisMap()), {
    mode: "EDGE", edge: "BOTTOM", arrow: "↓", exact: 22500, markerY: 500
  });
});

test("unsafe axis maps fail closed", () => {
  assert.deepEqual(chart.projectBreakEven(24000, { ...axisMap(), priceToY: () => NaN }), {
    mode: "HIDDEN", exact: 24000, reason: "UNSAFE_AXIS"
  });
});

test("stacking moves cards but never rails", () => {
  const input = [{ id: "a", railY: 100, height: 28 }, { id: "b", railY: 108, height: 28 }];
  const result = chart.stackCards(input, { gap: 6, minY: 0, maxY: 300 });
  assert.deepEqual(result.map((item) => item.railY), [100, 108]);
  assert.ok(result[1].cardY - result[0].cardY >= 34);
  assert.deepEqual(input, [{ id: "a", railY: 100, height: 28 }, { id: "b", railY: 108, height: 28 }]);
  assert.equal(result[0].connector.toY, 100);
  assert.equal(result[1].connector.toY, 108);
});

test("stacking stays inside plot and keeps stable rail order", () => {
  const result = chart.stackCards([
    { id: "later", railY: 294, height: 28 },
    { id: "first", railY: 288, height: 28 }
  ], { gap: 6, minY: 0, maxY: 300 });
  assert.deepEqual(result.map((item) => item.id), ["first", "later"]);
  assert.ok(result[0].cardY >= 0);
  assert.ok(result[1].cardY + result[1].height <= 300);
});

test("expanded strategy card height includes every trade and disclosure row", () => {
  assert.equal(chart.strategyCardHeight({
    kind: "STRATEGY",
    strategyId: "s1",
    entries: [{ id: "leg-1" }],
    disclosure: "EXCLUDING UNKNOWN CHARGES"
  }, "s1"), 78);
  assert.equal(chart.strategyCardHeight({
    kind: "STRATEGY",
    strategyId: "s1",
    entries: [{ id: "leg-1" }, { id: "leg-2" }],
    disclosure: null
  }, "s1"), 78);
  assert.equal(chart.strategyCardHeight({
    kind: "STRATEGY",
    strategyId: "s1",
    entries: [{ id: "leg-1" }],
    disclosure: "EXCLUDING UNKNOWN CHARGES"
  }, null), 24);
  assert.equal(chart.strategyCardHeight({ kind: "COMBINED" }, "s1"), 24);
});

test("accessible labels expose identity, exact price, edge direction, and action", () => {
  assert.equal(chart.accessibleLabel({
    strategyLabel: "T1", exact: 24874, mode: "EDGE", edge: "TOP", selected: true
  }), "T1 break-even 24,874, above visible chart, selected for combined preview. Open positions and P&L.");
  assert.equal(chart.accessibleLabel({
    strategyLabel: "T2", exact: 23688, mode: "RAIL", selected: false
  }), "T2 break-even 23,688, visible on chart, not selected for combined preview. Open positions and P&L.");
});
