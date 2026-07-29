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
