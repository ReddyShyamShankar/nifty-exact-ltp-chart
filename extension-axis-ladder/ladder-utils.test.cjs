const test = require("node:test");
const assert = require("node:assert/strict");
const { centerForSpot, fiveStrikes } = require("./ladder-utils.js");

test("rounds NIFTY spot to nearest 100-point center", () => {
  assert.equal(centerForSpot(23767.45, 100), 23800);
  assert.equal(centerForSpot(23849.95, 100), 23800);
  assert.equal(centerForSpot(23850, 100), 23900);
});

test("builds five strikes 100 points apart", () => {
  assert.deepEqual(fiveStrikes(23800, 100), [23600, 23700, 23800, 23900, 24000]);
});
