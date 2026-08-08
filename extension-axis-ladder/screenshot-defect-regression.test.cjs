"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const content = require("./content.js");
const payoff = require("./manual-payoff.js");
const preview = require("./strategy-preview.js");
const store = require("./strategy-store.js");
const strategyChart = require("./strategy-chart.js");
const timeframe = require("./timeframe-ladder.js");
const theme = require("./theme.js");
const manifest = require("./manifest.json");

const NOW = "2026-07-31T10:00:00.000Z";
const EXPIRY = "2026-08-25";
const INSTRUMENT = "NSE:NIFTY";
const read = (file) => fs.readFileSync(path.join(__dirname, file), "utf8");
const readRepo = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

function leg(overrides = {}) {
  return {
    id: "leg-1",
    source: "MANUAL",
    instrumentKey: INSTRUMENT,
    underlying: "NIFTY",
    expiry: EXPIRY,
    strike: 24000,
    optionType: "CALL",
    direction: "SELL",
    lots: 1,
    premium: 100,
    callSnapshot: 100,
    putSnapshot: 100,
    charges: [],
    chargesComplete: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides
  };
}

function apply(book, command) {
  return store.applyCommand(book, command, NOW);
}

function createStrategy(book, id, strategyId, label, versionId, overrides = {}) {
  return apply(book, {
    type: "CREATE_STRATEGY",
    id,
    strategyId,
    label,
    versionId,
    instrumentKey: overrides.instrumentKey || INSTRUMENT,
    underlying: overrides.underlying || "NIFTY",
    expiry: overrides.expiry || EXPIRY
  });
}

function addLeg(book, id, strategyId, versionId, entry) {
  return apply(book, { type: "ADD_LEG", id, strategyId, versionId, leg: entry });
}

function compatibleBook(count = 3) {
  let book = store.emptyBook();
  for (let index = 1; index <= count; index += 1) {
    book = createStrategy(book, `create-${index}`, `s${index}`, `T${index}`, `v${index}-1`);
    book = addLeg(book, `add-${index}`, `s${index}`, `v${index}-2`, leg({
      id: `leg-${index}`,
      strike: 23950 + index * 50,
      optionType: index % 2 ? "CALL" : "PUT"
    }));
  }
  return book;
}

function contrastLuminance(hex) {
  const channels = hex.match(/[a-f\d]{2}/gi).map((value) => parseInt(value, 16) / 255)
    .map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(first, second) {
  const values = [contrastLuminance(first), contrastLuminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

// UI regressions

test("UI: render transaction hides rows before finite placement coordinates commit", () => {
  const source = read("content.js");
  const renderRows = source.match(/function renderRows\(rows, membership\)\s*\{[\s\S]*?\n  \}/)?.[0] || "";
  const placeRows = source.match(/function placeRows\(rows, membership, toY, visualPlacementRevision\)\s*\{[\s\S]*?\n  \}/)?.[0] || "";
  assert.match(renderRows, /element\.hidden = true/);
  assert.match(placeRows, /element\.style\.right =/);
  assert.match(placeRows, /element\.style\.top =/);
  assert.match(placeRows, /element\.hidden = false/);
});

test("UI: twenty-five dense strikes stay in one right-side column", () => {
  const rows = Array.from({ length: 25 }, (_, index) => ({ strike: 23000 + index * 50, y: 100 + index * 5 }));
  const result = content.rowLaneLayout(rows, 24300, 50);
  assert.equal(result.mode, "single");
  assert.equal(result.laneCount, 1);
  assert.deepEqual(result.lanes, Array(25).fill(0));
});

test("UI: rails remain below ladder rows and strategy cards", () => {
  const css = read("overlay.css");
  assert.match(css, /#nifty-break-even-rails\s*\{[\s\S]*?z-index:\s*1;/);
  assert.match(css, /\.nifty-axis-ladder__row\s*\{[\s\S]*?z-index:\s*2;/);
  assert.match(css, /\.nifty-strategy__card\s*\{[\s\S]*?z-index:\s*3;/);
});

test("UI: expanded card packing prevents overlap without moving financial rails", () => {
  const cards = [
    { id: "a", railY: 100, height: strategyChart.strategyCardHeight({
      kind: "STRATEGY", strategyId: "a", entries: [leg()], disclosure: "EXCLUDING UNKNOWN CHARGES"
    }, "a") },
    { id: "b", railY: 108, height: 24 }
  ];
  const placed = strategyChart.stackCards(cards, { gap: 6, minY: 0, maxY: 300 });
  assert.ok(placed[1].cardY >= placed[0].cardY + placed[0].height + 6);
  assert.deepEqual(placed.map((item) => item.railY), [100, 108]);
});

test("UI: combined label and strategy cards use readable plan ink", () => {
  const css = read("overlay.css");
  assert.match(css, /\.nifty-strategy__label\s*\{[\s\S]*?background:\s*var\(--plan-surface\);[\s\S]*?color:\s*var\(--plan-ink\);/);
  assert.match(css, /\.nifty-strategy__card\.is-combined \.nifty-strategy__label\s*\{[\s\S]*?color:\s*var\(--plan-ink\);/);
});

test("UI: Save chooser cannot produce anonymous blank action buttons", () => {
  const source = read("content.js");
  assert.match(source, /choice\.textContent = option\.label/);
  assert.match(source, /CREATE NEW STRATEGY/);
  assert.match(source, /MERGE INTO \$\{destination\.label\}/);
});

// UX regressions

test("UX: label opens details while square only changes preview membership", () => {
  const events = [];
  const controller = strategyChart.createController({
    onOpen: (id) => events.push(["open", id]),
    onSelection: (ids) => events.push(["selection", ids])
  });
  controller.label("s1");
  assert.deepEqual(controller.selected(), []);
  controller.square("s1");
  assert.deepEqual(events, [["open", "s1"], ["selection", ["s1"]]]);
});

test("UX: preview selection supports three strategies and preserves order", () => {
  const controller = strategyChart.createController();
  controller.square("s1");
  controller.square("s2");
  controller.square("s3");
  assert.deepEqual(controller.selected(), ["s1", "s2", "s3"]);
});

test("UX: Clear resets preview without mutating strategy book", () => {
  const book = compatibleBook();
  const before = JSON.stringify(book);
  const controller = strategyChart.createController();
  controller.square("s1");
  controller.square("s2");
  controller.compare(true);
  controller.clear();
  assert.deepEqual(controller.selected(), []);
  assert.equal(controller.comparing(), false);
  assert.equal(JSON.stringify(book), before);
});

test("UX: permanent Save uses named destination dialog and explicit choices", () => {
  const source = read("content.js");
  assert.match(source, /chooser\.setAttribute\("role", "dialog"\)/);
  assert.match(source, /chooser\.setAttribute\("aria-label", "Save combined strategy"\)/);
  assert.match(source, /CREATE_NEW/);
  assert.match(source, /MERGE INTO/);
});

test("UX: archived strategy is excluded from active chart source list", () => {
  let book = compatibleBook(1);
  book = apply(book, { type: "ARCHIVE_STRATEGY", id: "archive-1", strategyId: "s1" });
  assert.deepEqual(store.activeStrategies(book, INSTRUMENT, EXPIRY), []);
  assert.equal(store.strategyById(book, "s1").status, store.ARCHIVED);
});

test("UX: action popup separates Refresh Ladder from Open Controls", () => {
  const html = read("action-popup.html");
  assert.match(html, /id="refresh-ladder"/);
  assert.match(html, /id="open-side-panel"/);
  assert.notEqual(html.indexOf('id="refresh-ladder"'), html.indexOf('id="open-side-panel"'));
});

// Product-logic regressions

test("product: axis membership has no thirteen-row cap", () => {
  const rows = Array.from({ length: 25 }, (_, index) => ({
    strike: 23000 + index * 50, call: 100 - index, put: 100 + index
  }));
  const axis = rows.map((row) => row.strike);
  const selected = timeframe.selectAxisAlignedRows(rows, 23600, axis, 13);
  assert.equal(selected.rows.length, 25);
});

test("product: timeframe label never chooses strike interval", () => {
  assert.equal(timeframe.timeframeKey("Chart for NSE:NIFTY, 15 minutes"), "15m");
  assert.equal(timeframe.timeframeKey("Chart for NSE:NIFTY, 4 hours"), "4h");
  assert.equal(timeframe.snapStrikeInterval(100), 100);
  const source = read("timeframe-ladder.js");
  assert.doesNotMatch(source, /(?:15m|1h|4h).{0,80}(?:50|100|250|500)/i);
});

test("product: dense 10-point axis intersects only real 50-point contracts", () => {
  const rows = [24200, 24250, 24300, 24350].map((strike) => ({ strike, call: 1, put: 1 }));
  const axis = Array.from({ length: 16 }, (_, index) => 24200 + index * 10);
  assert.deepEqual(
    timeframe.selectAxisAlignedRows(rows, 24296.6, axis).rows.map((row) => row.strike),
    [24200, 24250, 24300, 24350]
  );
});

test("product: 100-point axis keeps every matching middle strike", () => {
  const rows = Array.from({ length: 17 }, (_, index) => ({ strike: 23000 + index * 100 }));
  const axis = [23800, 23900, 24000, 24100, 24200, 24300, 24400, 24500, 24600];
  assert.deepEqual(
    timeframe.selectAxisAlignedRows(rows, 24296.6, axis).rows.map((row) => row.strike),
    axis
  );
});

test("product: ATM is nearest real contract and never raw spot", () => {
  const rows = [{ strike: 24250 }, { strike: 24300 }];
  assert.equal(timeframe.nearestAvailableStrike(rows, 24296.6), 24300);
  assert.notEqual(timeframe.nearestAvailableStrike(rows, 24296.6), 24296.6);
});

test("product: visible in-range ATM is retained on sparse axis", () => {
  const rows = [24200, 24250, 24300, 24350, 24400].map((strike) => ({ strike }));
  const selected = timeframe.selectAxisAlignedRows(rows, 24296.6, [24200, 24400]);
  assert.deepEqual(selected.rows.map((row) => row.strike), [24200, 24300, 24400]);
});

test("product: zoom-out warning and forced auto-fit copy are absent", () => {
  const sources = [read("content.js"), read("action-popup.js"), read("action-popup.html")].join("\n");
  assert.doesNotMatch(sources, /strikes outside visible price range|zoom out to show/i);
  assert.doesNotMatch(sources, /auto.?fit/i);
});

test("product: permanent merge archives sources and creates one active destination", () => {
  let book = compatibleBook(2);
  book = apply(book, {
    type: "MERGE_STRATEGIES",
    id: "merge-1",
    sourceStrategyIds: ["s1", "s2"],
    destination: {
      mode: "CREATE_NEW",
      strategyId: "s3",
      label: "T3"
    },
    versionId: "s3-v1"
  });
  assert.equal(store.strategyById(book, "s1").status, store.ARCHIVED);
  assert.equal(store.strategyById(book, "s2").status, store.ARCHIVED);
  assert.deepEqual(store.activeStrategies(book, INSTRUMENT, EXPIRY).map((item) => item.id), ["s3"]);
});

// Runtime regressions

test("runtime: manifest contains no debugger permission", () => {
  assert.equal((manifest.permissions || []).includes("debugger"), false);
  assert.equal((manifest.optional_permissions || []).includes("debugger"), false);
});

test("runtime: ladder root is reused and rows update in place", () => {
  const source = read("content.js");
  assert.match(source, /document\.getElementById\(LABELS_ID\)/);
  assert.match(source, /const existing = new Map\(\[\.\.\.node\.querySelectorAll\("\.nifty-axis-ladder__row"\)\]/);
  assert.match(source, /existing\.forEach\(\(row\) => row\.remove\(\)\)/);
});

test("runtime: unsafe axis projection fails closed", () => {
  assert.deepEqual(strategyChart.projectBreakEven(24000, {
    minPrice: 23000, maxPrice: 25000, minY: 0, maxY: 500, priceToY: () => NaN
  }), { mode: "HIDDEN", exact: 24000, reason: "UNSAFE_AXIS" });
});

test("runtime: unavailable and non-positive market quotes never become silent zero", () => {
  assert.equal(content.formatRow({ strike: 24300, call: NaN, put: undefined }), "C — | P — | 24,300");
  assert.equal(content.formatRow({ strike: 24300, call: 0, put: 0 }), "C — | P — | 24,300");
});

test("runtime: axis zoom rebuild can reuse cached chain without membership cap", async () => {
  let fetches = 0;
  let prices = [24000, 24100, 24200, 24300, 24400];
  const controller = content.createLadderController({
    expiry: EXPIRY,
    fetchChain: async () => {
      fetches += 1;
      return {
        spot: 24296.6,
        rows: Array.from({ length: 41 }, (_, index) => ({ strike: 23000 + index * 50, call: 1, put: 1 }))
      };
    },
    captureAxisScale: async () => ({
      ok: true,
      gridGapPx: 100,
      axisPairs: prices.map((price, index) => ({ price, y: 500 - index * 100 }))
    }),
    renderRows: () => {},
    placeRows: () => true
  });
  await controller.syncTimeframe("Chart for NSE:NIFTY, 4 hours");
  prices = [23400, 23700, 24000, 24300, 24600];
  await controller.place();
  assert.equal(fetches, 1);
  assert.deepEqual(controller.membership().visibleStrikes, prices);
});

test("runtime: save command deduplication prevents repeated mutation", () => {
  let book = compatibleBook(1);
  const command = {
    type: "ARCHIVE_STRATEGY", id: "archive-once", strategyId: "s1"
  };
  const once = apply(book, command);
  const twice = apply(once, command);
  assert.deepEqual(twice, once);
});

// Data and business-rule regressions

test("business: short Call and short Put break-evens use collected premium", () => {
  assert.deepEqual(payoff.breakEvens([leg({ optionType: "CALL" })]).points, [24100]);
  assert.deepEqual(payoff.breakEvens([leg({ optionType: "PUT" })]).points, [23900]);
});

test("business: payoff engine returns every exact root it finds", () => {
  const butterfly = [
    leg({ id: "a", strike: 24000, optionType: "CALL", direction: "BUY", premium: 300 }),
    leg({ id: "b", strike: 24100, optionType: "CALL", direction: "SELL", lots: 2, premium: 220 }),
    leg({ id: "c", strike: 24200, optionType: "CALL", direction: "BUY", premium: 160 })
  ];
  assert.deepEqual(payoff.breakEvens(butterfly).points, [24020, 24180]);
});

test("business: known charges shift roots and reduce current P&L", () => {
  let book = compatibleBook(2);
  for (const id of ["leg-1", "leg-2"]) {
    book.legs[id].charges = [{ kind: "BROKERAGE", amount: 2 }];
    book.legs[id].chargesComplete = true;
  }
  const result = preview.buildPreview(book, ["s1", "s2"], [
    { strike: 24000, call: 98, put: 98 },
    { strike: 24050, call: 98, put: 98 }
  ], { lotSize: 1 });
  assert.equal(result.knownCharges, 4);
  assert.equal(result.chargesComplete, true);
  assert.equal(result.currentPnl, 256,
    "per-leg 65-contract quantities override obsolete global lotSize preview option");
});

test("business: unknown charges are disclosed and never invented", () => {
  const book = compatibleBook(2);
  book.legs["leg-2"].chargesComplete = false;
  const result = preview.buildPreview(book, ["s1", "s2"], [
    { strike: 24000, call: 98, put: 98 },
    { strike: 24050, call: 98, put: 98 }
  ], { lotSize: 1 });
  assert.equal(result.disclosure, "EXCLUDING UNKNOWN CHARGES");
  assert.equal(result.knownCharges, 0);
});

test("business: same contract can be captured later as a separate leg identity", () => {
  let book = createStrategy(store.emptyBook(), "create-1", "s1", "T1", "v1");
  book = addLeg(book, "add-1", "s1", "v2", leg({ id: "first", premium: 100 }));
  book = addLeg(book, "add-2", "s1", "v3", leg({
    id: "later", premium: 120, createdAt: "2026-08-10T10:00:00.000Z", updatedAt: "2026-08-10T10:00:00.000Z"
  }));
  assert.deepEqual(store.legsForStrategy(book, "s1").map((item) => item.id), ["first", "later"]);
});

test("business: one leg identity cannot belong to two active strategies", () => {
  let book = compatibleBook(2);
  assert.throws(() => addLeg(book, "reuse-leg", "s2", "s2-v3", book.legs["leg-1"]), /already belongs/i);
});

test("business: mixed exact expiry or instrument selection fails closed", () => {
  let book = compatibleBook(1);
  book = createStrategy(book, "create-mixed", "mixed", "T2", "mixed-v1", {
    instrumentKey: "EUREX:ESTX50",
    underlying: "EURO STOXX 50",
    expiry: "2026-09-18"
  });
  book = addLeg(book, "add-mixed", "mixed", "mixed-v2", leg({
    id: "euro-leg",
    instrumentKey: "EUREX:ESTX50",
    underlying: "EURO STOXX 50",
    expiry: "2026-09-18",
    strike: 4250.5,
    lotSize: 10
  }));
  assert.equal(preview.buildPreview(book, ["s1", "mixed"], []).status, "INCOMPATIBLE");
});

// Design-system regressions

test("design system: original logo hashes remain locked", () => {
  const expected = {
    "icons/nifty-mark.svg": "82d3ebe76354732bce9b54e72af8dd44351e4497bf0ef8ae632877572fba748e",
    "icons/nifty-mark-16.png": "3d738fccc5cd2e30cde9ebe309da696d8eb25cd78efbd63dcf54267bc1e6bada"
  };
  for (const [file, hash] of Object.entries(expected)) {
    const actual = crypto.createHash("sha256").update(fs.readFileSync(path.join(__dirname, file))).digest("hex");
    assert.equal(actual, hash);
  }
});

test("design system: square selector geometry cannot regress to circle", () => {
  const css = read("overlay.css");
  const selector = css.match(/\.nifty-strategy__selector\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(selector, /width:\s*16px/);
  assert.match(selector, /height:\s*16px/);
  assert.match(selector, /border-radius:\s*2px/);
  assert.doesNotMatch(selector, /border-radius:\s*50%/);
});

test("design system: ATM uses different accessible light and dark tokens", () => {
  assert.ok(contrast("fbbf24", "18181b") >= 4.5);
  assert.ok(contrast("b45309", "ffffff") >= 4.5);
  const css = read("overlay.css");
  assert.match(css, /--theme-warn:\s*#fbbf24/);
  assert.match(css, /data-theme="light"[\s\S]*?--theme-warn:\s*#b45309/);
});

test("design system: profit stays green and loss stays red in both modes", () => {
  const css = read("overlay.css");
  const lightTheme = css.match(/#nifty-axis-ladder\[data-theme="light"\]\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const profitRule = css.match(/\.nifty-strategy__trade\.is-profit\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const lossRule = css.match(/\.nifty-strategy__trade\.is-loss\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(css, /--pnl-profit:\s*#34d399/);
  assert.match(css, /--pnl-loss:\s*#f87171/);
  assert.match(css, /data-theme="light"[\s\S]*?--theme-accent:\s*#066647/);
  assert.match(css, /data-theme="light"[\s\S]*?--theme-danger:\s*#dc2626/);
  assert.doesNotMatch(lightTheme, /--pnl-(?:profit|loss):/);
  assert.match(profitRule, /color:\s*var\(--pnl-profit\)/);
  assert.doesNotMatch(profitRule, /var\(--pnl-loss\)/);
  assert.match(lossRule, /color:\s*var\(--pnl-loss\)/);
  assert.doesNotMatch(lossRule, /var\(--pnl-profit\)/);
});

test("design system: Geist assets, tabular numerals, and shadow-free cards stay locked", () => {
  assert.equal(fs.existsSync(path.join(__dirname, "fonts", "GeistMono-Variable.woff2")), true);
  const css = read("overlay.css");
  assert.match(css, /font-variant-numeric:\s*tabular-nums/);
  assert.match(css, /font-family:\s*"Geist Mono"|font:[^;]*"Geist Mono"/);
  assert.doesNotMatch(css, /(?:linear|radial)-gradient/i);
});

test("design system: one stored theme drives accessible toggle state", () => {
  assert.equal(theme.normalizeTheme("light"), "light");
  assert.equal(theme.normalizeTheme("dark"), "dark");
  assert.equal(theme.normalizeTheme("sepia"), "dark");
  assert.equal(theme.oppositeTheme("light"), "dark");
});

// Requirement-interpretation regressions

test("requirements: approved design starts with universal optionable-market rule", () => {
  const design = readRepo("docs/superpowers/specs/2026-07-31-chart-strategy-grouping-versioning-design.md");
  const rule = design.indexOf("Universal product rule");
  const goal = design.indexOf("## Goal");
  assert.ok(rule > -1 && rule < goal);
  assert.match(design, /any supported optionable pair, instrument, or index worldwide/i);
  assert.match(design, /NIFTY is only current test case/i);
});

test("requirements: current design rejects timeframe-based membership rules", () => {
  const design = readRepo("docs/superpowers/specs/2026-07-31-chart-strategy-grouping-versioning-design.md");
  assert.match(design, /TradingView axis remains source of chart coordinates/i);
  assert.doesNotMatch(design, /(?:15m|1h|4h).{0,80}(?:50|100|250|500)/i);
});

test("requirements: toolbar action uses explicit popup instead of implicit side-panel toggle", () => {
  assert.equal(manifest.action.default_popup, "action-popup.html");
  assert.equal(manifest.side_panel.default_path, "popup.html");
});

test("requirements: new-leg ownership choices never guess destination", () => {
  let book = compatibleBook(2);
  const choices = content.strategyOwnershipChoices(book, INSTRUMENT, EXPIRY);
  assert.deepEqual(choices.map((item) => item.kind), ["EXISTING", "EXISTING", "CREATE_NEW"]);
  assert.equal(choices.some((item) => item.selected === true), false);
});

test("requirements: premium surge alert remains explicitly next phase", () => {
  const design = readRepo("docs/superpowers/specs/2026-07-31-chart-strategy-grouping-versioning-design.md");
  assert.match(design, /50% seller-premium increase alerts/);
  assert.match(design, /Premium alerts are next connected phase/);
});

test("requirements: active documents contain no superseded fixed strike-count rule", () => {
  const activeDocs = [
    readRepo("docs/01-project-brief.md"),
    readRepo("docs/02-product-requirements.md"),
    readRepo("docs/07-decision-log.md")
  ].join("\n");
  assert.doesNotMatch(activeDocs, /Default strike count:\s*five|five total strikes|3,\s*5,\s*7,\s*9,\s*or\s*11/i);
});

test("requirements: runtime contains no superseded fixed-count artifact", () => {
  const activeSource = read("content.js");
  assert.doesNotMatch(activeSource, /labelCount:\s*"5"/);
  assert.equal(fs.existsSync(path.join(__dirname, "content 2.js")), false);
});

test("requirements: screenshot regression catalog contains seventy unique traceable cases", () => {
  const file = readRepo("docs/testing/2026-07-31-screenshot-defect-regression-70-test-cases.md");
  const ids = [...file.matchAll(/^### (TC_S(?:UI|UX|PL|RT|BR|DS|RI)_\d{3})\b/gm)].map((match) => match[1]);
  assert.equal(ids.length, 70);
  assert.equal(new Set(ids).size, 70);
  for (const prefix of ["SUI", "SUX", "SPL", "SRT", "SBR", "SDS", "SRI"]) {
    assert.equal(ids.filter((id) => id.startsWith(`TC_${prefix}_`)).length, 10, prefix);
  }
  assert.equal((file.match(/\*\*Expected Results:\*\*/g) || []).length, 70);
  assert.equal((file.match(/\*\*Actual Results:\*\*/g) || []).length, 70);
  assert.equal((file.match(/\*\*Status:\*\*/g) || []).length, 70);
});
