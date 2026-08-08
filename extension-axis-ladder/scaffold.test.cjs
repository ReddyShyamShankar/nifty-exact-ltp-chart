const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const manifest = require("./manifest.json");

test("new extension has independent identity", () => {
  assert.equal(manifest.name, "Options Ladder");
  assert.equal(manifest.version, "0.6.0");
  assert.equal(manifest.minimum_chrome_version, "141");
  assert.equal(manifest.permissions.includes("debugger"), false);
  assert.equal(manifest.permissions.includes("sidePanel"), true);
  assert.equal(manifest.permissions.includes("contextMenus"), false);
  assert.deepEqual(manifest.side_panel, { default_path: "popup.html" });
  assert.equal(manifest.action.default_popup, "action-popup.html");
  assert.equal(Object.hasOwn(manifest.action, "default_state"), false);
  assert.equal(manifest.action.default_title, "Options Ladder");
});

test("extension card and toolbar preserve original Options Ladder logo", () => {
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

test("manual strategy and premium-history modules load before content in dependency order", () => {
  const scripts = manifest.content_scripts.find((entry) => entry.js.includes("content.js")).js;
  assert.deepEqual(scripts.slice(-14), [
    "manual-plan.js",
    "manual-payoff.js",
    "manual-interaction.js",
    "manual-ui.js",
    "strategy-store.js",
    "strategy-preview.js",
    "strategy-chart.js",
    "strategy-panel.js",
    "margin-evidence.js",
    "estimated-iv.js",
    "premium-history-model.js",
    "premium-chart-trials.js",
    "premium-history-pane.js",
    "content.js"
  ]);
});

test("synchronized premium axis loads on-demand TradingView time observer", () => {
  const mainWorld = manifest.content_scripts.find((entry) => entry.world === "MAIN");
  assert.deepEqual(mainWorld.js, ["axis-observer.js", "time-axis-observer.js"]);
});

test("atomic manual strategy mutations are owned by the manifest service worker", () => {
  const background = fs.readFileSync(path.join(__dirname, "background.js"), "utf8");

  assert.equal(manifest.version, "0.6.0");
  assert.equal(manifest.background.service_worker, "background.js");
  assert.equal(manifest.permissions.includes("storage"), true);
  assert.match(background, /importScripts\([^)]*"manual-plan\.js"/);
  assert.match(background, /MUTATE_MANUAL_PLANS/);
  assert.match(background, /deprecated[^\n]+atomic manual strategy/i);
  assert.match(background, /MUTATE_MANUAL_STRATEGY/);
  assert.match(background, /importScripts\([^)]*"strategy-store\.js"/);
  assert.match(background, /MUTATE_STRATEGY_BOOK/);
  assert.match(background, /MIGRATE_MANUAL_PLANS/);
});
