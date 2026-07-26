const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const read = (name) => fs.readFileSync(path.join(__dirname, name), "utf8");

test("popup presents automatic thirteen-strike exact-axis workflow", () => {
  const html = read("popup.html");
  const js = read("popup.js");

  assert.match(html, /AUTO\s*·\s*13 STRIKES\s*·\s*EXACT AXIS/);
  assert.match(html, /RETRY PLACEMENT/);
  assert.match(html, /id="enabled"/);
  assert.match(html, /id="expiry"/);
  assert.doesNotMatch(html, /SYNC PINE INPUTS|data-count|id="sync-pine"/);
  assert.doesNotMatch(js, /SYNC_PINE_INPUTS|syncPineInputs|labelCount|PINE_STRIKE_STEP/);
  assert.match(js, /RETRY_LABEL_PLACEMENT/);
  assert.match(js, /const requestedExpiry = state\.expiry/);
  assert.match(js, /chainAbort\?\.abort\(\)/);
  assert.match(js, /requestId !== chainRequestId \|\| requestedExpiry !== state\.expiry/);
});

test("content accepts manual exact-axis placement retry", () => {
  const source = read("content.js");
  assert.match(source, /RETRY_LABEL_PLACEMENT/);
  assert.match(source, /controller\.place\(\)/);
});
