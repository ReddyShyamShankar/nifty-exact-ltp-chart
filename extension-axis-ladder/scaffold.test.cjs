const test = require("node:test");
const assert = require("node:assert/strict");
const manifest = require("./manifest.json");

test("new extension has independent identity", () => {
  assert.equal(manifest.name, "NIFTY Axis LTP Ladder");
  assert.equal(manifest.version, "0.3.8");
  assert.equal(manifest.permissions.includes("debugger"), true);
});
