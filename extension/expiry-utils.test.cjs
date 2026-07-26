const test = require("node:test");
const assert = require("node:assert/strict");
const { matches, parts } = require("./expiry-utils.js");

test("parses an ISO expiry", () => {
  assert.deepEqual(parts("2026-07-28"), { year: "2026", month: "jul", day: "28" });
});

test("matches TradingView expiry date in either visual order", () => {
  assert.equal(matches("Jul 28, 2026", "2026-07-28"), true);
  assert.equal(matches("28 Jul 2026 · 3 DTE", "2026-07-28"), true);
  assert.equal(matches("25 Aug 2026", "2026-07-28"), false);
});

test("does not confuse day prefixes", () => {
  assert.equal(matches("Jul 2, 2026", "2026-07-22"), false);
  assert.equal(matches("Jul 22, 2026", "2026-07-22"), true);
});
