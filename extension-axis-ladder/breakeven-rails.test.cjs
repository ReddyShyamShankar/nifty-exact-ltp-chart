"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const api = require("./breakeven-rails.js");

test("calculates rounded independent single-leg expiry break-evens", () => {
  assert.deepEqual(api.calculate({ strike: 24300, call: 219.20, put: 402 }), {
    strike: 24300,
    call: { kind: "call", exact: 24519.2, rounded: 24519, label: "CALL BE 24,519 · SELL BELOW ↓" },
    put: { kind: "put", exact: 23898, rounded: 23898, label: "PUT BE 23,898 · SELL ABOVE ↑" }
  });
});

test("rejects missing non-numeric and negative premiums without zero substitution", () => {
  for (const invalid of [null, undefined, "", " ", "\t", "x", NaN, Infinity, -0.05]) {
    assert.equal(api.calculate({ strike: 24300, call: invalid, put: 402 }), null);
    assert.equal(api.calculate({ strike: 24300, call: 219.2, put: invalid }), null);
  }
  assert.equal(api.calculate({ strike: 24300, call: 0, put: 0 }).call.rounded, 24300);
});

test("projects exact rails and truthful top or bottom markers", () => {
  const toY = (price) => 500 - (price - 24000) / 2;
  const bounds = { top: 100, bottom: 700 };
  assert.deepEqual(api.project({ exact: 24519.2 }, toY, bounds), { mode: "line", y: 240.4 });
  assert.deepEqual(api.project({ exact: 25000 }, toY, bounds), { mode: "edge", edge: "top", y: 100 });
  assert.deepEqual(api.project({ exact: 23000 }, toY, bounds), { mode: "edge", edge: "bottom", y: 700 });
});

test("stacks close line labels without moving exact rail coordinates", () => {
  const placements = [
    { level: { kind: "call" }, projection: { mode: "line", y: 200 } },
    { level: { kind: "put" }, projection: { mode: "line", y: 205 } }
  ];

  assert.deepEqual(api.layoutDecorations(placements, { top: 100, bottom: 300 }), [
    { top: 185 },
    { top: 202 }
  ]);
  assert.deepEqual(placements.map(({ projection }) => projection.y), [200, 205]);
});

test("deterministically stacks same-edge markers inside plot bounds", () => {
  const top = [
    { level: { kind: "call" }, projection: { mode: "edge", edge: "top", y: 100 } },
    { level: { kind: "put" }, projection: { mode: "edge", edge: "top", y: 100 } }
  ];
  const bottom = top.map(({ level }) => ({
    level,
    projection: { mode: "edge", edge: "bottom", y: 300 }
  }));

  assert.deepEqual(api.layoutDecorations(top, { top: 100, bottom: 300 }), [
    { top: 100 },
    { top: 117 }
  ]);
  assert.deepEqual(api.layoutDecorations(bottom, { top: 100, bottom: 300 }), [
    { top: 268 },
    { top: 285 }
  ]);
});

test("selection replaces exact snapshot and clear removes it", () => {
  const changes = [];
  const controller = api.createSelectionController((value) => changes.push(value));
  const first = { strike: 24300, call: 219.2, put: 402 };
  const second = { strike: 24250, call: 245.5, put: 375 };
  assert.equal(controller.select(first), true);
  assert.deepEqual(controller.current(), first);
  assert.equal(controller.select(second), true);
  assert.deepEqual(controller.current(), second);
  controller.clear();
  assert.equal(controller.current(), null);
  assert.deepEqual(changes, [first, second, null]);
});

test("invalid selection reports unavailable while retaining the clicked row until cleared", () => {
  const controller = api.createSelectionController(() => {});
  assert.equal(controller.select({ strike: 24300, call: null, put: 402 }), false);
  assert.deepEqual(controller.current(), { strike: 24300, call: null, put: 402 });
  controller.clear();
  assert.equal(controller.current(), null);
});

test("calculatePosition binds one break-even to exact broker or manual entry economics", () => {
  assert.deepEqual(api.calculatePosition({
    id: "broker-put-24200",
    source: "BROKER_POSITION",
    strike: 24200,
    optionType: "PUT",
    direction: "BUY",
    premium: 84
  }), {
    kind: "put",
    exact: 24116,
    rounded: 24116,
    label: "PUT BE 24,116 · BUY BELOW ↓",
    ownerId: "broker-put-24200",
    source: "BROKER_POSITION"
  });

  assert.equal(api.calculatePosition({
    id: "manual-put-24200",
    source: "MANUAL",
    strike: 24200,
    optionType: "PUT",
    direction: "SELL",
    premium: 118.25
  }).label, "PUT BE 24,082 · SELL ABOVE ↑");

  assert.equal(api.calculatePosition({
    id: "manual-call-24200",
    source: "MANUAL",
    strike: 24200,
    optionType: "CALL",
    direction: "BUY",
    premium: 533.8
  }).label, "CALL BE 24,734 · BUY ABOVE ↑");

  assert.equal(api.calculatePosition({
    id: "manual-call-sell-24200",
    source: "MANUAL",
    strike: 24200,
    optionType: "CALL",
    direction: "SELL",
    premium: 533.8
  }).label, "CALL BE 24,734 · SELL BELOW ↓");
});

test("calculatePosition rejects missing identity, invalid direction, and impossible Put BE", () => {
  assert.equal(api.calculatePosition({
    strike: 24200, optionType: "PUT", direction: "BUY", premium: 84
  }), null);
  assert.equal(api.calculatePosition({
    id: "x", source: "MANUAL", strike: 24200, optionType: "PUT", direction: "HOLD", premium: 84
  }), null);
  assert.equal(api.calculatePosition({
    id: "x", source: "MANUAL", strike: 50, optionType: "PUT", direction: "BUY", premium: 84
  }), null);
});
