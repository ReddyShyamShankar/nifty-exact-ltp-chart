const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const chart = require("./strategy-chart.js");
const preview = require("./strategy-preview.js");
const panel = require("./strategy-panel.js");

const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");
const content = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "manifest.json"), "utf8"));
const expandedCases = fs.readFileSync(
  path.join(__dirname, "../docs/testing/2026-07-31-options-ladder-expanded-100-test-cases.md"),
  "utf8"
);

function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))?.[1] || "";
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16) / 255);
}

function luminance(hex) {
  const channels = hexToRgb(hex).map((value) => (
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  ));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("dark plan text contrast exceeds WCAG AA", () => {
  assert.ok(contrast("#111113", "#f4f4f5") >= 4.5);
});

test("light plan text contrast exceeds WCAG AA", () => {
  assert.ok(contrast("#ffffff", "#18181b") >= 4.5);
});

test("dark ATM text contrast exceeds WCAG AA", () => {
  assert.ok(contrast("#fbbf24", "#18181b") >= 4.5);
});

test("light ATM text contrast exceeds WCAG AA", () => {
  assert.ok(contrast("#b45309", "#ffffff") >= 4.5);
});

test("dark profit text contrast exceeds WCAG AA", () => {
  assert.ok(contrast("#111113", "#34d399") >= 4.5);
});

test("dark loss text contrast exceeds WCAG AA", () => {
  assert.ok(contrast("#111113", "#f87171") >= 4.5);
});

test("light profit text contrast exceeds WCAG AA", () => {
  assert.ok(contrast("#ffffff", "#066647") >= 4.5);
});

test("light loss text contrast exceeds WCAG AA", () => {
  assert.ok(contrast("#ffffff", "#dc2626") >= 4.5);
});

test("strategy layer order keeps rails under rows and cards", () => {
  assert.match(css, /\.nifty-strategy__rail,\s*\.nifty-strategy__edge\s*\{[^}]*z-index:\s*1/);
  assert.match(rule(".nifty-axis-ladder__row"), /z-index:\s*2/);
  assert.match(rule(".nifty-strategy__card"), /z-index:\s*3/);
});

test("strategy selection control remains a square token", () => {
  const selector = rule(".nifty-strategy__selector");
  assert.match(selector, /width:\s*16px/);
  assert.match(selector, /height:\s*16px/);
  assert.match(selector, /border-radius:\s*2px/);
});

test("strategy labels use tabular numerals and locked mono type", () => {
  const label = rule(".nifty-strategy__label");
  assert.match(label, /font-variant-numeric:\s*tabular-nums/);
  assert.match(label, /"Geist Mono"/);
});

test("preview chooser uses locked surface line and ink tokens", () => {
  const chooser = rule(".nifty-strategy-preview__save-chooser");
  assert.match(chooser, /background:\s*var\(--plan-surface\)/);
  assert.match(chooser, /border:\s*1px solid var\(--plan-line\)/);
  assert.match(chooser, /color:\s*var\(--plan-ink\)/);
});

test("preview controls expose visible keyboard focus", () => {
  assert.match(css, /\.nifty-strategy-preview button:focus-visible[\s\S]*outline:\s*2px solid var\(--plan-ink\)/);
});

test("save status is polite and chooser is a named dialog", () => {
  assert.match(content, /summary\.setAttribute\("aria-live", "polite"\)/);
  assert.match(content, /chooser\.setAttribute\("role", "dialog"\)/);
  assert.match(content, /chooser\.setAttribute\("aria-label", "Save combined strategy"\)/);
});

test("save chooser focuses first destination and Escape restores Save", () => {
  assert.match(content, /querySelector\("\.nifty-strategy-preview__save-choice"\)\?\.focus\(\)/);
  assert.match(content, /keyEvent\.key !== "Escape"/);
  assert.match(content, /save\.focus\(\)/);
});

test("manifest loads strategy panel before chart content", () => {
  const scripts = manifest.content_scripts.find((entry) => entry.js.includes("content.js")).js;
  assert.ok(scripts.indexOf("strategy-panel.js") < scripts.indexOf("content.js"));
});

test("expanded height scales for twenty-five legs without clipping", () => {
  const model = {
    kind: "STRATEGY",
    strategyId: "s1",
    entries: Array.from({ length: 25 }, (_, index) => ({ id: `leg-${index}` })),
    disclosure: "EXCLUDING UNKNOWN CHARGES"
  };
  assert.equal(chart.strategyCardHeight(model, "s1"), 726);
});

test("ten thousand strategy projections stay inside performance budget", () => {
  const axis = {
    minPrice: 0,
    maxPrice: 10000,
    minY: 0,
    maxY: 1000,
    priceToY: (price) => 1000 - price / 10
  };
  const started = performance.now();
  for (let index = 0; index < 10000; index += 1) {
    const result = chart.projectBreakEven(index, axis);
    assert.notEqual(result.mode, "HIDDEN");
  }
  assert.ok(performance.now() - started < 500);
});

test("five thousand card placements stay deterministic inside performance budget", () => {
  const cards = Array.from({ length: 5000 }, (_, index) => ({
    id: `s${index}`,
    railY: index * 30 + 12,
    height: 24
  }));
  const started = performance.now();
  const placed = chart.stackCards(cards, { gap: 6, minY: 0, maxY: 150000 });
  assert.ok(performance.now() - started < 500);
  assert.equal(placed.length, 5000);
  assert.deepEqual(placed.slice(0, 5).map((item) => item.id), ["s0", "s1", "s2", "s3", "s4"]);
});

test("large card placement keeps every adjacent rectangle separated", () => {
  const cards = Array.from({ length: 1000 }, (_, index) => ({
    id: `s${index}`,
    railY: index * 31 + 12,
    height: index % 7 === 0 ? 78 : 24
  }));
  const placed = chart.stackCards(cards, { gap: 6, minY: 0, maxY: 90000 });
  for (let index = 1; index < placed.length; index += 1) {
    assert.ok(placed[index].cardY >= placed[index - 1].cardY + placed[index - 1].height + 6);
  }
});

test("one thousand square toggles preserve unique ordered selection", () => {
  const controller = chart.createController();
  const started = performance.now();
  for (let index = 0; index < 1000; index += 1) controller.square(`s${index}`);
  assert.ok(performance.now() - started < 500);
  assert.equal(controller.selected().length, 1000);
  controller.square("s500");
  assert.equal(controller.selected().includes("s500"), false);
});

test("preview selection removes duplicates while preserving first-seen order", () => {
  let selection = preview.createSelection();
  selection = preview.toggle(selection, "s2");
  selection = preview.toggle(selection, "s1");
  selection.selectedIds.push("s2");
  selection = preview.setCompare(selection, true);
  assert.deepEqual(selection, { selectedIds: ["s2", "s1"], compare: true });
});

test("save choices reject one selected strategy", () => {
  assert.deepEqual(panel.saveChoices({}, ["s1"]), []);
});

test("save command deduplicates repeated source identities", () => {
  const command = panel.commandForSave({
    commandId: "cmd-1",
    versionId: "version-1",
    selectedIds: ["s1", "s1", "s2"],
    destination: { mode: "CREATE_NEW", strategyId: "s3", label: "T3" }
  });
  assert.deepEqual(command.sourceStrategyIds, ["s1", "s2"]);
});

test("save command rejects blank permanent destination identity", () => {
  assert.throws(() => panel.commandForSave({
    commandId: "cmd-1",
    versionId: "version-1",
    selectedIds: ["s1", "s2"],
    destination: { mode: "CREATE_NEW", strategyId: "", label: "T3" }
  }), /destination identity/i);
});

test("strategy chart and preview modules expose no broker order verbs", () => {
  const source = [
    fs.readFileSync(path.join(__dirname, "strategy-chart.js"), "utf8"),
    fs.readFileSync(path.join(__dirname, "strategy-preview.js"), "utf8"),
    fs.readFileSync(path.join(__dirname, "strategy-panel.js"), "utf8")
  ].join("\n");
  assert.doesNotMatch(source, /\b(placeOrder|modifyOrder|cancelOrder|exitOrder)\b/);
});

test("preview display rounds labels but preserves exact economics", () => {
  const levels = preview.displayLevels({ breakEvens: [24433.49, 25001.51] });
  assert.deepEqual(levels.map((item) => item.exact), [24433.49, 25001.51]);
  assert.deepEqual(levels.map((item) => item.label), ["COMBINED BE 24,433", "COMBINED BE 25,002"]);
});

test("unsafe projection rejects NaN and inverted axis inputs", () => {
  assert.equal(chart.projectBreakEven(Number.NaN, {}).mode, "HIDDEN");
  assert.equal(chart.projectBreakEven(100, {
    minPrice: 200,
    maxPrice: 100,
    minY: 0,
    maxY: 100,
    priceToY: () => 50
  }).mode, "HIDDEN");
});

test("accessible edge labels state exact direction and selection", () => {
  const label = chart.accessibleLabel({
    strategyLabel: "T7",
    exact: 26004,
    mode: "EDGE",
    edge: "TOP",
    selected: true
  });
  assert.equal(label, "T7 break-even 26,004, above visible chart, selected for combined preview. Open positions and P&L.");
});

test("preview action copy stays short and explicit", () => {
  assert.match(content, /compare\.textContent = "Compare"/);
  assert.match(content, /save\.textContent = "Save"/);
  assert.match(content, /clear\.textContent = "Clear"/);
  assert.match(content, /title\.textContent = "SAVE COMBINED AS"/);
  assert.match(content, /"CREATE NEW STRATEGY"/);
  assert.match(content, /`MERGE INTO \$\{destination\.label\}`/);
});

test("expanded QA document contains one hundred unique traceable cases", () => {
  const ids = [...expandedCases.matchAll(/^### (TC_[A-Z0-9]+_\d{3}) —/gm)].map((match) => match[1]);
  assert.equal(ids.length, 100);
  assert.equal(new Set(ids).size, 100);
  for (const prefix of ["UI", "TOKEN", "A11Y", "AXIS", "PREVIEW", "VERSION", "PERF", "RESILIENCE", "SAFETY", "LIFECYCLE"]) {
    assert.equal(ids.filter((id) => id.startsWith(`TC_${prefix}_`)).length, 10);
  }
  assert.equal((expandedCases.match(/\*\*Expected Results:\*\*/g) || []).length, 100);
  assert.equal((expandedCases.match(/\*\*Actual Results \/ Status:\*\*/g) || []).length, 100);
});
