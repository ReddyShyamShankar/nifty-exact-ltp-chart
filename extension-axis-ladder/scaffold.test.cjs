const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const manifest = require("./manifest.json");

test("new extension has independent identity", () => {
  assert.equal(manifest.name, "Options Ladder");
  assert.equal(manifest.version, "0.4.3");
  assert.equal(manifest.minimum_chrome_version, "141");
  assert.equal(manifest.permissions.includes("debugger"), true);
  assert.equal(manifest.permissions.includes("sidePanel"), true);
  assert.deepEqual(manifest.side_panel, { default_path: "popup.html" });
  assert.equal(Object.hasOwn(manifest.action, "default_popup"), false);
  assert.equal(Object.hasOwn(manifest.action, "default_state"), false);
  assert.equal(manifest.action.default_title, "Options Ladder");
});

test("extension card and toolbar use popup-matching green status mark", () => {
  const expected = {
    "16": "icons/nifty-mark-16.png",
    "32": "icons/nifty-mark-32.png",
    "48": "icons/nifty-mark-48.png",
    "128": "icons/nifty-mark-128.png"
  };
  assert.deepEqual(manifest.icons, expected);
  assert.deepEqual(manifest.action.default_icon, expected);
  for (const file of Object.values(expected)) {
    assert.equal(fs.existsSync(path.join(__dirname, file)), true, `${file} must exist`);
  }
});

test("manual modules load before content in dependency order", () => {
  const scripts = manifest.content_scripts.find((entry) => entry.js.includes("content.js")).js;
  for (const file of ["manual-plan.js", "manual-payoff.js", "manual-interaction.js", "manual-ui.js"]) {
    assert.ok(scripts.indexOf(file) < scripts.indexOf("content.js"), `${file} must load before content.js`);
  }
});
