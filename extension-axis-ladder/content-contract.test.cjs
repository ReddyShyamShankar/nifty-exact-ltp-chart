"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const api = require("./content.js");
const viewIdentity = require("./seller-view-identity.js");
const strategyStore = require("./strategy-store.js");
const manualPlan = require("./manual-plan.js");

const RISK_EXPIRY = "2026-08-25";
const contentSource = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");

test("operator guide documents click-only single-leg break-even rails", () => {
  const readme = fs.readFileSync(path.join(__dirname, "README.md"), "utf8");
  assert.match(readme, /^Version 0\.6\.0\b/m);
  readme.split("\n").filter((line) => /0\.4\.0/.test(line)).forEach((line) => {
    assert.match(line, /baseline/i, `0.4.0 reference must be explicit baseline wording: ${line}`);
  });
  assert.match(readme, /click one ladder strike/i);
  assert.match(readme, /CALL BE is strike plus displayed Call premium/i);
  assert.match(readme, /PUT BE is strike minus displayed Put premium/i);
  assert.match(readme, /Values use selected instrument's valid display precision/i);
  assert.match(readme, /outside click removes both break-even rails/i);
  assert.match(readme, /Manual refresh removes both break-even rails; click a strike again/i);
  assert.match(readme, /independent single-leg expiry break-evens, not combined short-straddle break-evens/i);
});

test("0.6.0 guides document exact chart strategy workflow and keyboard parity", () => {
  const guides = [
    ["extension", fs.readFileSync(path.join(__dirname, "README.md"), "utf8")],
    ["root", fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf8")]
  ];
  for (const [name, guide] of guides) {
    assert.match(guide, /^Version 0\.6\.0\b/m, `${name}: candidate version`);
    assert.match(guide, /Double-click[^.\n]*row[^.\n]*add/i, `${name}: add gesture`);
    assert.match(guide, /CALL ▾[^.\n]*PUT ▾[^.\n]*Buy[^.\n]*Sell/i, `${name}: staged menus`);
    assert.match(guide, /positive whole-number lots[^.\n]*editable premium/i, `${name}: lot and premium controls`);
    assert.match(guide, /top-left `C2`[^.\n]*`P3`[^.\n]*Call[^.\n]*Put lots/i, `${name}: lot badge meaning`);
    assert.match(guide, /ARB Desk panel tokens[^.\n]*warning tokens[^.\n]*black text[^.\n]*accent tokens[^.\n]*danger tokens/i,
      `${name}: exact shared row tokens`);
    assert.match(guide, /new leg[^.\n]*explicit strategy ownership|Saving a new leg[^.\n]*strategy owns/i, `${name}: explicit ownership`);
    assert.match(guide, /strategy label[^.\n]*P&L|Click label[^.\n]*positions[^.\n]*P&L/i, `${name}: label action`);
    assert.match(guide, /Adjacent[^\n]*square[^\n]*temporary[^\n]*preview/i, `${name}: square action`);
    assert.match(guide, /two or more[^.\n]*combined break-even rails|Selecting two or more[^.\n]*combined break-even rails/i,
      `${name}: combined break-even meaning`);
    assert.match(guide, /Compare[^.\n]*original|Compare[^.\n]*individual rails/i, `${name}: compare behavior`);
    assert.match(guide, /manual refresh[^.\n]*live values[^.\n]*saved snapshots[^.\n]*unchanged/i,
      `${name}: refresh boundary`);
    assert.match(guide, /Shift\+Enter[^.\n]*editor[^.\n]*Enter[^.\n]*Space[^.\n]*single-click[^.\n]*Escape[^.\n]*live/i,
      `${name}: keyboard workflow`);
    assert.match(guide, /cannot place, modify, cancel, convert, or exit orders/i, `${name}: order boundary`);
  }
});

test("operator guide treats TradingView badge styling as cosmetic and fail-safe", () => {
  const readme = fs.readFileSync(path.join(__dirname, "README.md"), "utf8");
  assert.match(readme, /LIVE[^\n]*green/i);
  assert.match(readme, /OFFLINE[^\n]*red/i);
  assert.match(readme, /disconnected[^\n]*red/i);
  assert.match(readme, /both use white text/i);
  assert.match(readme, /TradingView-owned[^\n]*cosmetic/i);
  assert.match(readme, /TradingView changes[^\n]*or removes[^\n]*badge DOM[^\n]*leaves the page unchanged/i);
  assert.match(readme, /badge styling cannot block the ladder/i);
  assert.match(readme, /badge styling cannot block[^\n]*manual refresh/i);
  assert.match(readme, /badge styling cannot block[^\n]*break-even rails/i);
});

test("content delegates bridge chain requests to extension service worker", () => {
  assert.match(contentSource, /chrome\.runtime\.sendMessage\(\{\s*type:\s*"FETCH_NIFTY_CHAIN",\s*expiry\s*\}\)/);
  assert.doesNotMatch(contentSource, /fetch\([^)]*api\/nifty-chain/);
});

test("SKYLINE premium chart keeps separate passive canvas and preserves strike map", () => {
  assert.match(contentSource, /const PREMIUM_CHART_TRIALS_ID = "options-premium-chart-trials"/);
  assert.match(contentSource, /function renderPremiumChartTrials\(state, placement = premiumChartPlacement\)/);
  assert.match(contentSource,
    /renderPremiumStrikeMap\(state\);\s*const skylinePainted = renderPremiumChartTrials\(state\);\s*renderPremiumHistoryStatus\(state, skylinePainted\)/);
  assert.match(contentSource, /canvas\.style\.pointerEvents = "none"/);
  assert.match(contentSource, /premiumChartTrialsApi\.skylineGeometry/);
  assert.match(contentSource, /premiumChartTrialsApi\.skylineSegments/);
  assert.match(contentSource, /synchronizedCrosshair/);
  assert.match(contentSource, /requestAnimationFrame/);
  assert.doesNotMatch(contentSource, /premiumChartTrialsApi\.rangeGeometry/);
  assert.doesNotMatch(contentSource, /premiumChartTrialsApi\.premiumScaleGeometry/);
  assert.doesNotMatch(contentSource, /premiumChartTrialsApi\.hybridGeometry/);
});

test("SKYLINE crosshair uses spatial chips instead of paragraph tooltip", () => {
  assert.match(contentSource, /premiumChartTrialsApi\.spatialLabelLayout/);
  assert.match(contentSource, /premiumChartTrialsApi\.skylineCrosshairSample\(hover\.candle/);
  assert.match(contentSource, /drawPremiumSkylineChip/);
  assert.match(contentSource, /layout\.call, labels\.call, colors\.callFill, colors\.callInk/);
  assert.match(contentSource, /layout\.put, labels\.put, colors\.putFill, colors\.putInk/);
  assert.match(contentSource, /NO PREMIUM CANDLE/);
  assert.doesNotMatch(contentSource, /boxWidth = Math\.min\(390/);
  assert.doesNotMatch(contentSource, /CALL \$\{Number\.isFinite\(call\)[\s\S]*PUT \$\{Number\.isFinite\(put\)[\s\S]*STRIKE/);
});

test("Put labels use danger red while strike keeps warning orange", () => {
  assert.match(contentSource, /danger:\s*computed\?\.getPropertyValue\?\.\("--theme-danger"\)/);
  assert.match(contentSource, /colors\.putFill\s*=\s*colors\.danger/);
  assert.match(contentSource, /layout\.strike, labels\.strike, colors\.accent/);
});

test("OI rank badges use a separate top band and cannot collide with position badges", () => {
  const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");
  const wrapper = css.match(/\.nifty-axis-ladder__oi-badges\s*\{[\s\S]*?\}/)?.[0] || "";
  const call = css.match(/\.nifty-axis-ladder__oi-badge\.is-call\s*\{[\s\S]*?\}/)?.[0] || "";
  const put = css.match(/\.nifty-axis-ladder__oi-badge\.is-put\s*\{[\s\S]*?\}/)?.[0] || "";
  assert.match(wrapper, /position:\s*absolute/);
  assert.doesNotMatch(wrapper, /bottom:\s*-\d/,
    "OI stickers cannot hang below a row into PTF or neighboring chart labels");
  assert.match(wrapper, /top:\s*-31px/,
    "OI stickers own a separate top band above position stickers");
  assert.match(wrapper, /right:\s*4px/);
  assert.match(wrapper, /left:\s*auto/);
  assert.match(wrapper, /display:\s*flex/);
  assert.match(wrapper, /pointer-events:\s*none/);
  assert.match(call, /background:\s*var\(--theme-accent\)/);
  assert.match(put, /background:\s*var\(--theme-danger\)/);
});

test("rows owning C/P position badges render above neighboring ladder rows", () => {
  const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");
  const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  const placement = source.match(/function placeRows\(rows, membership, toY, visualPlacementRevision\)\s*\{[\s\S]*?\n  \}/)?.[0] || "";
  const base = css.match(/\.nifty-axis-ladder__row\s*\{[\s\S]*?\}/)?.[0] || "";
  const raised = css.match(/\.nifty-axis-ladder__row\.has-lot-badges\s*\{[\s\S]*?\}/)?.[0] || "";
  const baseIndex = Number(base.match(/z-index:\s*(\d+)/)?.[1]);
  const raisedIndex = Number(raised.match(/z-index:\s*(\d+)/)?.[1]);
  assert.ok(Number.isFinite(raisedIndex) && raisedIndex > baseIndex,
    "badge owner must be layer one visually, above normal rows");
  assert.match(raised, /overflow:\s*visible/);
  assert.match(css, /\.nifty-axis-ladder__row:has\(> \.nifty-axis-ladder__badges:not\(:empty\)\)\s*\{[\s\S]*?z-index:\s*6/,
    "DOM-shape fallback keeps badges above rows even if helper class is missing");
  assert.match(placement,
    /element\.style\.zIndex\s*=\s*element\.classList\.contains\("has-lot-badges"\)\s*\?\s*String\(100 \+ Math\.round\(row\.y\)\)\s*:\s*""/,
    "lower badge owners must paint above upper rows so C1/P1 stickers cannot be clipped");
});

test("grouped broker controls explicitly remove hidden compact originals from layout", () => {
  const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");
  const hiddenCompact = css.match(/\.nifty-position-spine__compact\[hidden\]\s*\{[\s\S]*?\}/)?.[0] || "";
  assert.match(hiddenCompact, /display:\s*none/,
    "author display:flex must not keep grouped broker checkboxes visible");
  assert.match(css, /\.nifty-position-spine__compact\.is-grouped\s*\{[\s\S]*?display:\s*none/,
    "grouped state must remove entire checkbox plus C1/P1 marker control");
});

test("production premium history uses on-chart skyline without mounting lower pane", () => {
  const ensurePane = contentSource.match(/function ensurePremiumHistoryPane\(\)\s*\{[\s\S]*?\n  \}/)?.[0] || "";
  assert.doesNotMatch(ensurePane, /createDomRenderer|premiumHistoryDom/);
  assert.match(ensurePane,
    /renderPremiumStrikeMap\(state\);\s*const skylinePainted = renderPremiumChartTrials\(state\);\s*renderPremiumHistoryStatus\(state, skylinePainted\)/);
});

test("premium chart trials clear across pane and extension lifecycle", () => {
  assert.match(contentSource, /function clearPremiumChartTrials\(\)/);
  assert.match(contentSource, /function closePremiumHistory\(\)[\s\S]*clearPremiumChartTrials\(\)/);
  assert.match(contentSource, /function stop\(\)[\s\S]*clearPremiumChartTrials\(\)/);
});

test("premium history uses exact range and stable TradingView time-axis evidence", () => {
  assert.deepEqual(api.premiumHistoryRange("2026-08-25", Date.parse("2026-08-01T12:00:00Z")), {
    from: "2025-08-25",
    to: "2026-08-01"
  });
  assert.equal(api.premiumHistoryRange("current_month"), null);
  assert.equal(api.normalizePremiumTimeAxis(JSON.stringify({ stableCount: 1, pairs: [] })), null);
  const axis = api.normalizePremiumTimeAxis(JSON.stringify({
    stableCount: 2,
    pairs: [
      { time: 1, x: 100, plotRect: { left: 20, top: 40, right: 900, bottom: 600 } },
      { time: 2, x: 200, plotRect: { left: 20, top: 40, right: 900, bottom: 600 } }
    ]
  }));
  assert.deepEqual(axis.plotRect, { left: 20, top: 40, right: 900, bottom: 600 });

  const attributes = new Map([["data-options-time-axis", "stable"]]);
  const documentRef = { documentElement: {
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name)
  } };
  api.setPremiumTimeSync(documentRef, true);
  assert.equal(attributes.get("data-options-time-sync"), "on");
  assert.equal(attributes.get("data-options-time-axis"), "stable");
  api.setPremiumTimeSync(documentRef, false);
  assert.equal(attributes.has("data-options-time-sync"), false);
  assert.equal(attributes.has("data-options-time-axis"), false);
});

test("strike-number history action does not replace row click or double-click behavior", () => {
  const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  assert.match(source, /type:\s*"FETCH_OPTION_HISTORY"/);
  assert.match(source, /closest\?\.\("\.nifty-axis-ladder__strike-face"\)[\s\S]*?stopPropagation\?\.\(\)[\s\S]*?openPremiumHistory\(context\.strike\)/);
  assert.match(source, /function handleLadderDoubleClick\(event\)[\s\S]*?nifty-axis-ladder__strike-face[\s\S]*?return;/);
  assert.match(source, /attributeFilter:\s*\["aria-label",\s*"data-nifty-axis-ticks",\s*"data-options-time-axis"\]/);
  assert.match(source, /if \(changes\.expiry\) \{\s*closePremiumHistory\(\);/);
  assert.doesNotMatch(source, /debugger;/);
});

test("premium history selection keeps strike baseline and removes strike-touch dots", () => {
  const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");
  assert.match(source, /PREMIUM_STRIKE_MAP_ID\s*=\s*"options-premium-strike-map"/);
  assert.match(source, /classList\.toggle\("is-history-selected"/);
  assert.match(source, /context\.lineTo\(width, height \/ 2\)/);
  assert.doesNotMatch(source, /strikeTouchMarkers\(state\.view\?\.points,\s*selectedStrike,\s*state\.timeAxis\)/);
  assert.doesNotMatch(source, /context\.fillRect\(Math\.round\(x\) - 3/);
  assert.match(source, /canvas\.style\.pointerEvents\s*=\s*"none"/);
  assert.match(source,
    /const premiumState = premiumHistoryPane\?\.state\?\.\(\);[\s\S]*renderPremiumStrikeMap\(premiumState\)/);
  assert.match(css, /\.nifty-axis-ladder__row\.is-history-selected/);
  assert.match(css, /#options-premium-strike-map/);
  assert.doesNotMatch(css, /--strike-touch-marker/);
});

test("premium strike map redraws after placement and clears with pane lifecycle", () => {
  const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  assert.match(source,
    /render:\s*\(state\)\s*=>\s*\{[\s\S]*?renderPremiumStrikeMap\(state\);[\s\S]*?const skylinePainted = renderPremiumChartTrials\(state\);[\s\S]*?renderPremiumHistoryStatus\(state, skylinePainted\);/);
  assert.match(source, /function closePremiumHistory\(\)\s*\{[\s\S]*?premiumHistoryPane\?\.close\?\.\(\);[\s\S]*?clearPremiumStrikeMap\(\);/);
  const placement = source.match(/function placeRows\(rows, membership, toY, visualPlacementRevision\)\s*\{[\s\S]*?\n  \}/)?.[0] || "";
  assert.match(placement,
    /const premiumState = premiumHistoryPane\?\.state\?\.\(\);[\s\S]*renderPremiumStrikeMap\(premiumState\)/);
});

test("timeframe changes invalidate stale premium calibration before reload", () => {
  const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  assert.match(source, /function scheduleTimeframeCheck\(\) \{[\s\S]*?premiumHistoryPane\?\.setTimeAxis\?\.\(null\);[\s\S]*?timeframeTimer = setTimeout/);
});

test("render transaction never exposes an axis row before placement coordinates commit", () => {
  const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  const renderRows = source.match(/function renderRows\(rows, membership\)\s*\{[\s\S]*?\n  \}/)?.[0] || "";
  const placeRows = source.match(/function placeRows\(rows, membership, toY, visualPlacementRevision\)\s*\{[\s\S]*?\n  \}/)?.[0] || "";
  assert.match(renderRows, /renderManualRow\(element, row, membership, entriesByStrike\);\s*element\.hidden = true;/);
  assert.match(placeRows, /element\.style\.right = `\$\{baseRight \+ lane \* laneOffset\}px`;\s*element\.style\.top = `\$\{row\.y\}px`;/);
});

function acceptedRiskView(overrides = {}) {
  const view = {
    version: viewIdentity.ACCEPTED_VIEW_VERSION,
    canPublish: true,
    strategyId: "s1",
    expiry: RISK_EXPIRY,
    candidateId: "accepted-1",
    state: "ACCEPTED",
    ...overrides
  };
  view.provenance = viewIdentity.acceptedProvenance(view);
  return view;
}

function chain(spot, delta = 0) {
  return {
    spot,
    rows: Array.from({ length: 41 }, (_, index) => {
      const strike = 22900 + index * 50;
      return { strike, call: 100 + index + delta, put: 200 + index + delta };
    })
  };
}

function scale() {
  return {
    ok: true,
    gridGapPx: 10,
    axisPairs: Array.from({ length: 13 }, (_, index) => ({
      price: 23450 + index * 50,
      y: 210 - index * 10
    }))
  };
}

function invertedScale() {
  return {
    ok: true,
    gridGapPx: 10,
    axisPairs: Array.from({ length: 13 }, (_, index) => ({
      price: 23450 + index * 50,
      y: 50 + index * 10
    }))
  };
}

test("formats each visible row as Call, Put, then rightmost strike", () => {
  assert.equal(api.formatRow({ strike: 26000, call: 266.6, put: 388.7 }), "C 266.60 | P 388.70 | 26,000");
});

test("activates only on the NIFTY underlying chart", () => {
  assert.equal(api.isNiftyChartLabel("Chart for NSE_DLY:NIFTY, 15 minutes"), true);
  assert.equal(api.isNiftyChartLabel("Chart for NSE:NIFTY, 1 hour"), true);
  assert.equal(api.isNiftyChartLabel("Chart for NSE:NIFTY 50, 1 day"), true);
  assert.equal(api.isNiftyChartLabel("Chart for TVC:DXY, 1 hour"), false);
  assert.equal(api.isNiftyChartLabel("Chart for FX:EURJPY, 15 minutes"), false);
  assert.equal(api.isNiftyChartLabel("Chart for NSE:NIFTY260730C24000, 1 minute"), false);
});

test("renders only genuine finite quotes and never coerces missing values to zero", () => {
  for (const invalid of [null, undefined, "", "   ", true, false, Infinity, -Infinity, NaN, "Infinity"]) {
    assert.equal(api.formatRow({ strike: 26000, call: invalid, put: invalid }), "C — | P — | 26,000");
  }
  assert.equal(api.formatRow({ strike: 26000, call: "12.5", put: 0 }), "C 12.50 | P — | 26,000");
  assert.equal(api.formatRow({ strike: 26000, call: "0", put: "12.5" }), "C — | P 12.50 | 26,000");
});

test("native canvas tick map tolerates two pixels of text raster rounding", () => {
  const toY = api.axisPriceToY([
    { price: 24200, y: 80 },
    { price: 24100, y: 120.8 },
    { price: 24000, y: 160.2 },
    { price: 23900, y: 200 }
  ]);
  assert.equal(typeof toY, "function");
  assert.equal(toY(24000), 160);
});

test("native canvas tick map follows an inverted TradingView price scale", () => {
  const toY = api.axisPriceToY([
    { price: 23800, y: 80 },
    { price: 23900, y: 120 },
    { price: 24000, y: 160 },
    { price: 24100, y: 200 }
  ]);
  assert.equal(typeof toY, "function");
  assert.equal(toY(24050), 180);
});

test("risk layout clears the leftmost measured lane-zero border box with a fixed gap", () => {
  const laneZeroRows = [
    { getBoundingClientRect: () => ({ left: 655, top: 286, right: 893, bottom: 316 }) },
    { getBoundingClientRect: () => ({ left: 640, top: 336, right: 893, bottom: 366 }) }
  ];

  assert.deepEqual(api.riskLabelLayout?.(laneZeroRows), { labelRight: 628 });
  assert.equal(api.riskLabelLayout?.(null), null);
});

test("controller rebuild succeeds and places exact contracts on an inverted TradingView scale", async () => {
  const placements = [];
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => chain(23767.45),
    captureAxisScale: async () => invertedScale(),
    renderRows: () => {},
    placeRows: (rows) => placements.push(rows)
  });

  assert.equal(await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour"), true);
  assert.equal(controller.membership().interval, 50);
  assert.equal(placements.at(-1).find((row) => row.strike === 23750).y, 110);
});

test("controller records TradingView label interval without a timeframe preference", async () => {
  const denseChain = {
    spot: 23767.45,
    rows: Array.from({ length: 101 }, (_, index) => ({
      strike: 21300 + index * 50,
      call: index,
      put: index + 100
    }))
  };
  const raw238Scale = { ...scale(), gridGapPx: 47.6 };
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => denseChain,
    captureAxisScale: async () => raw238Scale,
    renderRows: () => {},
    placeRows: () => true
  });

  assert.equal(await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour"), true);
  assert.equal(controller.membership().nativeInterval, 50);
  assert.equal(controller.membership().preferredInterval, undefined);
  assert.equal(controller.membership().interval, 50);
});

test("timeframe changes rebuild from cached chain without another data request", async () => {
  let fetches = 0;
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => { fetches += 1; return chain(23767.45); },
    captureAxisScale: async () => scale(),
    renderRows: () => {},
    placeRows: () => true
  });

  assert.equal(await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour"), true);
  assert.equal(await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 day"), true);
  assert.equal(await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 week"), true);
  assert.equal(fetches, 1);
});

test("coordinated refresh chain snapshot builds thirteen chart rows without fetching chain again", async () => {
  let fetches = 0;
  const rendered = [];
  const controller = api.createLadderController({
    expiry: "2026-08-25",
    now: () => Date.parse("2026-08-01T03:55:00.000Z"),
    fetchChain: async () => { fetches += 1; throw new Error("second chain request forbidden"); },
    captureAxisScale: async () => scale(),
    renderRows: (rows) => rendered.push(rows),
    placeRows: () => true
  });
  const refreshChain = {
    version: 1,
    updatedAt: "2026-08-01T03:50:00.000Z",
    expiry: "2026-08-25",
    lotSize: 25,
    ...chain(23767.45)
  };

  assert.equal(typeof controller.setChainSnapshot, "function");
  assert.equal(controller.setChainSnapshot(refreshChain), true);
  assert.equal(await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour"), true);
  assert.equal(fetches, 0);
  assert.equal(rendered.at(-1).length, 13);
  assert.equal(controller.chain().updatedAt, "2026-08-01T03:50:00.000Z");
  assert.equal(controller.chain().lotSize, 25);
});

test("risk view changes redraw from cached axis while zoom pan and timeframe reuse normal capture without fetching", async () => {
  let fetches = 0;
  let captures = 0;
  let riskHides = 0;
  const riskPlacements = [];
  const controller = api.createLadderController({
    expiry: RISK_EXPIRY,
    fetchChain: async () => { fetches += 1; return chain(23767.45); },
    captureAxisScale: async () => { captures += 1; return scale(); },
    renderRows: () => {},
    placeRows: () => ({ riskLayout: { labelRight: 643 } }),
    hideRisk: () => { riskHides += 1; },
    placeRisk: (view, toY, membership, layout) => {
      riskPlacements.push({ view, y: toY(23750), timeframe: membership.timeframe, labelRight: layout?.labelRight });
      return true;
    }
  });

  await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour");
  assert.equal(fetches, 1);
  assert.equal(captures, 2);
  assert.deepEqual(riskPlacements, []);
  assert.equal(riskHides, 1);

  const accepted = acceptedRiskView();
  const settings = { enabled: true, selectedStrategyId: "s1", sellerSafetyView: null };
  assert.equal(api.applyRiskStorageChanges({ sellerSafetyView: { newValue: accepted } }, "local", settings, controller), true);
  assert.equal(settings.sellerSafetyView, accepted);
  assert.equal(fetches, 1);
  assert.equal(captures, 2, "storage update must not capture axis independently");
  assert.deepEqual(riskPlacements.at(-1), { view: accepted, y: 150, timeframe: "1h", labelRight: 643 });
  assert.equal(api.applyRiskStorageChanges({ sellerSafetyView: { newValue: null } }, "sync", settings, controller), false);
  assert.equal(riskPlacements.length, 1, "non-local storage must not redraw");
  assert.equal(api.applyRiskStorageChanges({ sellerSafetyView: { newValue: null } }, "local", settings, controller), true);
  assert.equal(riskHides, 2, "pending review clearing accepted view removes risk layer");
  assert.equal(captures, 2, "clearing accepted view must not capture axis");
  api.applyRiskStorageChanges({ sellerSafetyView: { newValue: accepted } }, "local", settings, controller);

  await controller.place();
  await controller.place();
  await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 day");
  assert.equal(fetches, 1, "zoom, pan, and timeframe remaps use cached chain");
  assert.equal(captures, 6, "two placements capture once each; timeframe rebuild keeps two-capture stability check");
  assert.deepEqual(riskPlacements.slice(-3).map((placement) => placement.timeframe), ["1h", "1h", "1D"]);
});

test("accepted risk auto-hides at fifteen-minute broker deadline without a network request", async () => {
  let now = Date.parse("2026-08-01T03:50:00.000Z");
  let fetches = 0;
  let riskPlacements = 0;
  let riskHides = 0;
  let deadline;
  const accepted = acceptedRiskView({
    brokerUpdatedAt: "2026-08-01T03:50:00.000Z",
    brokerSessionExpiresAt: "2026-08-02T00:30:00.000Z"
  });
  const controller = api.createLadderController({
    expiry: RISK_EXPIRY,
    riskView: accepted,
    now: () => now,
    scheduleRiskDeadline: (run, delay) => { deadline = { run, delay }; return 91; },
    cancelRiskDeadline: () => {},
    fetchChain: async () => { fetches += 1; return chain(23767.45); },
    captureAxisScale: async () => scale(),
    renderRows: () => {},
    placeRows: () => ({ riskLayout: { labelRight: 643 } }),
    placeRisk: () => { riskPlacements += 1; return true; },
    hideRisk: () => { riskHides += 1; }
  });

  assert.equal(await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour"), true);
  assert.equal(riskPlacements, 1);
  assert.equal(deadline.delay, 15 * 60 * 1000);
  assert.equal(fetches, 1);

  now = Date.parse("2026-08-01T04:05:00.000Z");
  deadline.run();
  assert.ok(riskHides >= 1);
  assert.equal(await controller.place(), true);
  assert.equal(riskPlacements, 1);
  assert.equal(fetches, 1);
});

test("withheld chart state hides risk without erasing separately stored operator evidence", () => {
  const accepted = acceptedRiskView();
  const withheld = {
    canPublish: false,
    candidateId: "pending-2",
    priority: { kind: "review", label: "REVIEW POSITION CHANGES" }
  };
  const received = [];
  const settings = {
    enabled: true,
    sellerSafetyView: accepted,
    sellerSafetyChartView: accepted,
    selectedStrategyId: "s1"
  };

  assert.equal(api.applyRiskStorageChanges({
    sellerSafetyChartView: { oldValue: accepted, newValue: withheld }
  }, "local", settings, { setRiskView: (view) => received.push(view) }), true);

  assert.equal(settings.sellerSafetyView, accepted);
  assert.equal(settings.sellerSafetyChartView, withheld);
  assert.deepEqual(received, [withheld]);
});

test("accepted risk uses earlier Zerodha session expiry as local placement deadline", async () => {
  let now = Date.parse("2026-08-01T03:50:00.000Z");
  let riskPlacements = 0;
  let deadline;
  const controller = api.createLadderController({
    expiry: RISK_EXPIRY,
    riskView: acceptedRiskView({
      brokerUpdatedAt: "2026-08-01T03:50:00.000Z",
      brokerSessionExpiresAt: "2026-08-01T03:55:00.000Z"
    }),
    now: () => now,
    scheduleRiskDeadline: (run, delay) => { deadline = { run, delay }; return 92; },
    cancelRiskDeadline: () => {},
    fetchChain: async () => chain(23767.45),
    captureAxisScale: async () => scale(),
    renderRows: () => {},
    placeRows: () => ({ riskLayout: { labelRight: 643 } }),
    placeRisk: () => { riskPlacements += 1; return true; }
  });

  await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour");
  assert.equal(deadline.delay, 5 * 60 * 1000);
  assert.equal(riskPlacements, 1);

  now = Date.parse("2026-08-01T03:55:00.000Z");
  assert.equal(await controller.place(), true);
  assert.equal(riskPlacements, 1);
});

test("failed row placement clears the cached risk label boundary", async () => {
  let rowPlacements = 0;
  let riskHides = 0;
  const labelRights = [];
  const accepted = acceptedRiskView();
  const controller = api.createLadderController({
    expiry: RISK_EXPIRY,
    riskView: accepted,
    fetchChain: async () => chain(23767.45),
    captureAxisScale: async () => scale(),
    renderRows: () => {},
    placeRows: () => {
      rowPlacements += 1;
      return rowPlacements === 1 ? { riskLayout: { labelRight: 643 } } : false;
    },
    placeRisk: (_view, _toY, _membership, layout) => {
      labelRights.push(layout?.labelRight ?? null);
    },
    hideRisk: () => { riskHides += 1; }
  });

  assert.equal(await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour"), true);
  assert.equal(await controller.place(), false);
  assert.equal(controller.setRiskView({ ...accepted, acceptedAt: "later" }), false);
  assert.deepEqual(labelRights, [643]);
  assert.equal(riskHides, 1);
});

test("storage risk update during rebuild cannot revive prior layout", async () => {
  let fetches = 0;
  let captures = 0;
  let riskVisible = false;
  let resolveRebuildCapture;
  const pendingRebuildCapture = new Promise((resolve) => { resolveRebuildCapture = resolve; });
  const riskPlacements = [];
  const accepted = acceptedRiskView({ acceptedAt: "old" });
  const controller = api.createLadderController({
    expiry: RISK_EXPIRY,
    riskView: accepted,
    fetchChain: async () => { fetches += 1; return chain(23767.45); },
    captureAxisScale: async () => {
      captures += 1;
      return captures === 3 ? pendingRebuildCapture : scale();
    },
    renderRows: () => {},
    placeRows: () => ({ riskLayout: { labelRight: 643 } }),
    placeRisk: (view) => {
      riskVisible = true;
      riskPlacements.push(view.acceptedAt);
    },
    concealRows: () => { riskVisible = false; },
    hideRisk: () => { riskVisible = false; }
  });

  assert.equal(await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour"), true);
  assert.equal(riskVisible, true);
  const rebuilding = controller.rebuild("1D");
  assert.equal(captures, 3);
  assert.equal(riskVisible, false);

  const nextView = { ...accepted, acceptedAt: "during-rebuild" };
  const settings = { enabled: true, sellerSafetyView: accepted };
  assert.equal(api.applyRiskStorageChanges({ sellerSafetyView: { newValue: nextView } }, "local", settings, controller), true);
  assert.equal(riskVisible, false);
  assert.deepEqual(riskPlacements, ["old"]);
  assert.equal(fetches, 1);
  assert.equal(captures, 3);

  resolveRebuildCapture(scale());
  assert.equal(await rebuilding, true);
  assert.deepEqual(riskPlacements, ["old", "during-rebuild"]);
});

test("storage risk update after capture failure cannot revive prior layout", async () => {
  let fetches = 0;
  let captures = 0;
  let rowPlacements = 0;
  let riskVisible = false;
  const riskPlacements = [];
  const accepted = acceptedRiskView({ acceptedAt: "old" });
  const controller = api.createLadderController({
    expiry: RISK_EXPIRY,
    riskView: accepted,
    fetchChain: async () => { fetches += 1; return chain(23767.45); },
    captureAxisScale: async () => {
      captures += 1;
      if (captures === 3) throw new Error("capture failed");
      return scale();
    },
    renderRows: () => {},
    placeRows: () => {
      rowPlacements += 1;
      return { riskLayout: { labelRight: 643 } };
    },
    placeRisk: (view) => {
      riskVisible = true;
      riskPlacements.push(view.acceptedAt);
    },
    concealRows: () => { riskVisible = false; },
    hideRisk: () => { riskVisible = false; }
  });

  assert.equal(await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour"), true);
  assert.equal(await controller.place(), false);
  assert.equal(riskVisible, false);

  const nextView = { ...accepted, acceptedAt: "after-failure" };
  const settings = { enabled: true, sellerSafetyView: accepted };
  assert.equal(api.applyRiskStorageChanges({ sellerSafetyView: { newValue: nextView } }, "local", settings, controller), true);
  assert.equal(riskVisible, false);
  assert.deepEqual(riskPlacements, ["old"]);
  assert.equal(rowPlacements, 1, "failed capture must not reach row placement");
  assert.equal(fetches, 1);
  assert.equal(captures, 3);
});

test("storage risk update while capture is pending cannot redraw prior layout", async () => {
  let fetches = 0;
  let captures = 0;
  let riskVisible = false;
  let resolvePlacementCapture;
  const pendingPlacementCapture = new Promise((resolve) => { resolvePlacementCapture = resolve; });
  const riskPlacements = [];
  const accepted = acceptedRiskView({ acceptedAt: "old" });
  const controller = api.createLadderController({
    expiry: RISK_EXPIRY,
    riskView: accepted,
    fetchChain: async () => { fetches += 1; return chain(23767.45); },
    captureAxisScale: async () => {
      captures += 1;
      return captures === 3 ? pendingPlacementCapture : scale();
    },
    renderRows: () => {},
    placeRows: () => ({ riskLayout: { labelRight: 643 } }),
    placeRisk: (view) => {
      riskVisible = true;
      riskPlacements.push(view.acceptedAt);
    },
    concealRows: () => { riskVisible = false; },
    hideRisk: () => { riskVisible = false; }
  });

  assert.equal(await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour"), true);
  const placing = controller.place();
  assert.equal(captures, 3);

  const nextView = { ...accepted, acceptedAt: "during-capture" };
  const settings = { enabled: true, sellerSafetyView: accepted };
  assert.equal(api.applyRiskStorageChanges({ sellerSafetyView: { newValue: nextView } }, "local", settings, controller), true);
  assert.equal(riskVisible, false);
  assert.deepEqual(riskPlacements, ["old"]);
  assert.equal(fetches, 1);
  assert.equal(captures, 3);

  resolvePlacementCapture(scale());
  assert.equal(await placing, true);
  assert.deepEqual(riskPlacements, ["old", "during-capture"]);
});

test("failed initial chain request waits for manual refresh instead of retrying automatically", async () => {
  const scheduled = [];
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => { throw new Error("Too Many Request Sent"); },
    captureAxisScale: async () => scale(),
    renderRows: () => {},
    placeRows: () => true,
    scheduleRetry: (run, delay) => { scheduled.push({ run, delay }); return scheduled.length; },
    cancelRetry: () => {}
  });

  assert.equal(await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour"), false);
  assert.deepEqual(scheduled, []);
});

test("controller uses its own two-capture stability check without requiring observer stableCount", async () => {
  const captureOptions = [];
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => chain(23767.45),
    captureAxisScale: async (_signal, options) => {
      captureOptions.push(options);
      return { ...scale(), observedAt: 100, observationSignature: "native-axis-frame" };
    },
    renderRows: () => {},
    placeRows: () => true
  });

  assert.equal(await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 week"), true);
  assert.equal(captureOptions.length, 2);
  assert.equal(captureOptions.every((options) => options.requireStable !== true), true);
  assert.equal(controller.membership().timeframe, "1W");
});

test("timeframe changes keep contract membership driven by unchanged native axis", async () => {
  const denseChain = {
    spot: 23767.45,
    rows: Array.from({ length: 121 }, (_, index) => ({
      strike: 20750 + index * 50,
      call: index,
      put: index + 100
    }))
  };
  const sameMutatedScale = { ...scale(), gridGapPx: 10 };
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => denseChain,
    captureAxisScale: async () => sameMutatedScale,
    renderRows: () => {},
    placeRows: () => true
  });

  assert.equal(await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 15 minutes"), true);
  assert.equal(controller.membership().interval, 50);
  assert.equal(await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 week"), true);
  assert.equal(controller.membership().interval, 50);
  assert.equal(await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 month"), true);
  assert.equal(controller.membership().interval, 50);
  assert.equal(controller.membership().nativeInterval, 50);
});

test("controller accepts stable 25-point native ticks and selects real 50-point contracts", async () => {
  const denseChain = {
    spot: 23767.45,
    rows: Array.from({ length: 101 }, (_, index) => ({
      strike: 21300 + index * 50,
      call: index,
      put: index + 100
    }))
  };
  const native25Scale = {
    axisPairs: [
      { price: 23750, y: 200 },
      { price: 23800, y: 100 }
    ],
    gridGapPx: 50,
    ok: true
  };
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => denseChain,
    captureAxisScale: async () => native25Scale,
    renderRows: () => {},
    placeRows: () => true
  });

  assert.equal(await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 15 minutes"), true);
  assert.equal(controller.membership().nativeInterval, 50);
  assert.equal(controller.membership().interval, 50);
});

test("axis grid with no real contract never replaces last valid membership", async () => {
  let currentScale = scale();
  const invalidScale = {
    ok: true,
    gridGapPx: 10,
    axisPairs: Array.from({ length: 13 }, (_, index) => ({
      price: 24004 + index * 4,
      y: 210 - index * 10
    }))
  };
  const controller = api.createLadderController({
    expiry: "2026-08-25",
    fetchChain: async () => chain(23767.45),
    captureAxisScale: async () => currentScale,
    renderRows: () => {},
    placeRows: () => true
  });

  assert.equal(await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour"), true);
  const validStrikes = controller.membership().strikes.slice();
  currentScale = invalidScale;
  assert.equal(await controller.place(), false);
  assert.deepEqual(controller.membership().strikes, validStrikes);

  currentScale = scale();
  assert.equal(await controller.place(), true);
  assert.deepEqual(controller.membership().strikes, validStrikes);
});

test("production membership uses axis intersections plus real ATM inside visible range", () => {
  const rows = Array.from({ length: 101 }, (_, index) => ({
    strike: 21300 + index * 50,
    call: index,
    put: index + 100
  }));
  const membership = api.freezeMembership({
    timeframe: "1M",
    expiry: "current_month",
    interval: 1000,
    axisPrices: [23400, 23600, 23800, 24000, 24200],
    spot: 23767.45,
    chainRows: rows
  });

  assert.equal(membership.interval, 200);
  assert.equal(membership.center, 23750);
  assert.equal(membership.atmStep, 50);
  assert.deepEqual(membership.strikes, [23400, 23600, 23750, 23800, 24000, 24200]);
  assert.deepEqual(api.freezeMembership({
    timeframe: "1M",
    expiry: "current_month",
    interval: 1000,
    axisPrices: [21300, 21350, 21400],
    spot: 23767.45,
    chainRows: rows.slice(0, 12)
  }).strikes, [21300, 21350, 21400]);
});

test("membership keeps active off-grid strikes out of premium rows and exposes them for compact trade chips", () => {
  const rows = [24000, 24100, 24200, 24300, 24400].map((strike) => ({
    strike,
    call: strike / 100,
    put: strike / 200
  }));
  const membership = api.freezeMembership({
    timeframe: "1h",
    expiry: "2026-08-25",
    interval: 200,
    nativeInterval: 200,
    axisPrices: [24000, 24200, 24400],
    spot: 24200,
    chainRows: rows,
    pinnedStrikes: [24100, 24300]
  });

  assert.deepEqual(membership.strikes, [24000, 24200, 24400]);
  assert.deepEqual(membership.visibleStrikes, [24000, 24200, 24400]);
  assert.deepEqual(membership.pinnedStrikes, [24100, 24300]);
  assert.deepEqual(membership.offGridStrikes, [24100, 24300]);
});

test("edge stack clusters transitive collisions into one stable price group", () => {
  const clusters = api.edgeStackClusters([
    { id: "b8", y: 100 },
    { id: "call", y: 114 },
    { id: "put", y: 128 },
    { id: "b6", y: 170 }
  ], 20);

  assert.deepEqual(clusters.map((cluster) => ({
    key: cluster.key,
    y: cluster.y,
    ids: cluster.items.map((item) => item.id)
  })), [
    { key: "b8|call|put", y: 114, ids: ["b8", "call", "put"] },
    { key: "b6", y: 170, ids: ["b6"] }
  ]);
});

test("off-grid active trade renders compact directional chip while native premium rows stay axis-only", async () => {
  const h = createBreakEvenLifecycleHarness({
    manualEntries: [savedManualEntry({ strike: 23900, direction: "SELL", lots: 3 })],
    initialAxisPairs: [23400, 23600, 23800, 24000, 24200].map((price, index) => ({
      price,
      y: 220 - index * 20
    }))
  });
  await h.settle();

  assert.equal(h.row(23900), null, "off-grid strike must not become full premium row");
  const chip = h.document.getElementById("nifty-axis-ladder")
    .querySelector(".nifty-axis-ladder__off-grid");
  assert.ok(chip);
  assert.equal(chip.textContent, "C3", "edge stack keeps only compact side and lot token visible");
  assert.equal(chip.getAttribute("aria-label"), "C3 · 23,900 SELL");
  assert.equal(chip.classList.contains("is-sell"), true);
  assert.equal(h.document.getElementById("nifty-axis-ladder")
    .querySelector(".nifty-axis-ladder__off-grid-title"), null);
  assert.ok(h.row(23600), "native Y-axis strike remains normal premium row");
  assert.ok(h.row(23800), "native Y-axis strike remains normal premium row");
});

test("open-interest ranks use full expiry chain and preserve dense ties", () => {
  const rows = api.rankOpenInterestRows([
    { strike: 24200, call: 1, put: 1, callOi: 900, putOi: 200 },
    { strike: 24300, call: 1, put: 1, callOi: 700, putOi: 1000 },
    { strike: 24400, call: 1, put: 1, callOi: 900, putOi: 700 },
    { strike: 24500, call: 1, put: 1, callOi: 0, putOi: -4 }
  ]);

  assert.deepEqual(rows.map((row) => [row.strike, row.callOiRank, row.putOiRank]), [
    [24200, 1, 3],
    [24300, 2, 1],
    [24400, 1, 2],
    [24500, null, null]
  ]);
  assert.equal(Object.hasOwn(rows[0], "callOiRank"), true);
});

test("membership keeps full-chain OI ranks when only some strikes are visible", () => {
  const ranked = api.rankOpenInterestRows([
    { strike: 24200, call: 1, put: 1, callOi: 2000, putOi: 100 },
    { strike: 24300, call: 1, put: 1, callOi: 1500, putOi: 3000 },
    { strike: 24400, call: 1, put: 1, callOi: 1000, putOi: 2000 }
  ]);
  const membership = api.freezeMembership({
    timeframe: "1h",
    expiry: "current_month",
    interval: 100,
    nativeInterval: 100,
    axisPrices: [24300, 24400],
    spot: 24350,
    chainRows: ranked
  });

  assert.deepEqual(membership.rows.map((row) => [row.strike, row.callOiRank, row.putOiRank]), [
    [24300, 2, 1],
    [24400, 3, 2]
  ]);
});

test("builds one frozen contract per visible axis strike and maps native y positions", async () => {
  const placements = [];
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => chain(23767.45),
    captureAxisScale: async () => scale(),
    renderRows: () => {},
    placeRows: (rows) => placements.push(rows)
  });

  await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour");
  const membership = controller.membership();

  assert.deepEqual(membership.strikes, [
    23450, 23500, 23550, 23600, 23650, 23700, 23750,
    23800, 23850, 23900, 23950, 24000, 24050
  ]);
  assert.equal(membership.atm, 23750);
  assert.equal(membership.interval, 50);
  assert.equal(membership.rows.length, 13);
  assert.equal(Object.isFrozen(membership), true);
  assert.equal(Object.isFrozen(membership.strikes), true);

  await controller.place();
  const atm = placements.at(-1).find((row) => row.strike === 23750);
  assert.deepEqual(atm, {
    strike: 23750,
    call: 117,
    put: 217,
    text: "C 117.00 | P 217.00 | 23,750",
    isAtm: true,
    y: 150
  });
});

test("LTP refresh reuses cached exact positions while zoom placement captures a fresh scale", async () => {
  const placements = [];
  let fetches = 0;
  let captures = 0;
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => chain(fetches++ === 0 ? 23767.45 : 23774.99, fetches),
    captureAxisScale: async () => { captures += 1; return scale(); },
    renderRows: () => {},
    placeRows: (rows) => placements.push(rows)
  });

  await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour");
  assert.equal(captures, 2, "initial rebuild requires two matching calibration captures");
  const before = controller.membership();
  await controller.refreshLtp();
  assert.equal(captures, 2, "initial rebuild requires two matching calibration captures");
  await controller.place();
  const after = controller.membership();

  assert.deepEqual(after.strikes, before.strikes);
  assert.equal(after.interval, before.interval);
  assert.equal(after.atm, before.atm);
  assert.equal(after.timeframe, before.timeframe);
  assert.equal(after.rows.find((row) => row.strike === 23750).call, 119);
  assert.equal(placements.at(-1).find((row) => row.strike === 23750).y, 150);
  assert.equal(captures, 3, "refresh uses cached coordinates; explicit zoom placement captures once");
});

test("layout-only remap changes coordinates without replacing visible strike membership", async () => {
  let captures = 0;
  let renders = 0;
  const placements = [];
  const resizedScale = {
    ok: true,
    gridGapPx: 10,
    axisPairs: Array.from({ length: 13 }, (_, index) => ({
      price: 23000 + index * 100,
      y: 300 - index * 10
    }))
  };
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => chain(23767.45),
    captureAxisScale: async () => (++captures <= 2 ? scale() : resizedScale),
    renderRows: () => { renders += 1; },
    placeRows: (rows) => { placements.push(rows); return true; }
  });

  assert.equal(await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 day"), true);
  const before = controller.membership();
  assert.equal(typeof controller.remap, "function");
  assert.equal(await controller.remap(), true);

  assert.deepEqual(controller.membership().strikes, before.strikes,
    "side-panel resize must not swap visible contracts");
  assert.equal(controller.membership().interval, before.interval,
    "side-panel resize must not replace the frozen display interval");
  assert.equal(renders, 1, "coordinate-only placement must not rerender row membership");
  assert.deepEqual(placements.at(-1).map((row) => row.strike), before.strikes);
  assert.equal(placements.at(-1).find((row) => row.strike === 23750).y, 225,
    "existing contracts still follow the newly captured exact axis map");

  assert.equal(await controller.place(), true);
  assert.notDeepEqual(controller.membership().strikes, before.strikes,
    "explicit zoom/pan placement must still rebuild axis membership");
  assert.equal(renders, 2, "explicit zoom/pan still rerenders changed membership");
});

test("browser viewport resize routes every settling placement through membership preservation", () => {
  const schedule = contentSource.match(/function scheduleAxisPlacement\([^)]*\)\s*\{[\s\S]*?\n  \}/)?.[0] || "";
  const resize = contentSource.match(/function handleViewportResize\(\)\s*\{[\s\S]*?\n  \}/)?.[0] || "";
  const start = contentSource.match(/function start\(\)\s*\{[\s\S]*?\n  \}/)?.[0] || "";
  const stop = contentSource.match(/function stop\(\)\s*\{[\s\S]*?\n  \}/)?.[0] || "";

  assert.match(resize, /axisPlacementPreserveMembership\s*=\s*true;[\s\S]*scheduleAxisPlacement\(\)/);
  assert.match(schedule, /preserveMembership\s*\?\s*controller\.remap\(\)\s*:\s*controller\.place\(\)/);
  assert.match(start, /root\.addEventListener\?\.\("resize",\s*handleViewportResize\)/);
  assert.match(stop, /root\.removeEventListener\?\.\("resize",\s*handleViewportResize\)/);
});

test("LTP refresh recenters at the exact interval midpoint without another axis capture", async () => {
  const placements = [];
  let fetches = 0;
  let captures = 0;
  const movingChain = (spot, delta = 0) => ({
    spot,
    rows: Array.from({ length: 41 }, (_, index) => ({
      strike: 22900 + index * 50,
      call: 100 + index + delta,
      put: 200 + index + delta
    }))
  });
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => {
      fetches += 1;
      if (fetches === 1) return movingChain(23767.45);
      if (fetches === 2) return movingChain(23774.99, 25);
      return movingChain(23775, 50);
    },
    captureAxisScale: async () => { captures += 1; return scale(); },
    renderRows: () => {},
    placeRows: (rows) => placements.push(rows)
  });

  await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour");
  assert.equal(controller.membership().atm, 23750);
  assert.deepEqual(controller.membership().strikes, [
    23450, 23500, 23550, 23600, 23650, 23700, 23750,
    23800, 23850, 23900, 23950, 24000, 24050
  ]);

  assert.equal(await controller.refreshLtp(), true);
  assert.equal(controller.membership().atm, 23750, "spot below midpoint keeps current center");

  assert.equal(await controller.refreshLtp(), true);
  assert.equal(fetches, 3, "each refresh uses one already-fetched chain");
  assert.equal(captures, 2, "spot recenter reuses cached native-axis mapping");
  assert.equal(controller.membership().atm, 23800);
  assert.deepEqual(controller.membership().strikes, [
    23450, 23500, 23550, 23600, 23650, 23700, 23750,
    23800, 23850, 23900, 23950, 24000, 24050
  ]);
  assert.equal(placements.at(-1).find((row) => row.strike === 23800).isAtm, true);
});

test("LTP refresh recenters on true contract midpoint while axis controls visible rows", async () => {
  let spot = 23767.45;
  const denseRows = Array.from({ length: 101 }, (_, index) => ({
    strike: 21300 + index * 50,
    call: index,
    put: 1000 - index
  }));
  const rendered = [];
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => ({ spot, rows: denseRows }),
    captureAxisScale: async () => ({
      ok: true,
      observedAt: 100,
      gridGapPx: 100,
      axisPairs: [{ price: 22000, y: 800 }, { price: 23000, y: 700 }, { price: 24000, y: 600 }]
    }),
    renderRows: (_rows, membership) => rendered.push(membership),
    placeRows: () => true
  });

  await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 month");
  assert.equal(controller.membership().atm, 23750);
  assert.equal(controller.membership().interval, 1000);
  assert.deepEqual(controller.membership().visibleStrikes, [22000, 23000, 23750, 24000]);
  assert.equal(controller.membership().atmStep, 50);

  spot = 23774.99;
  await controller.refreshLtp();
  assert.equal(controller.membership().atm, 23750);

  spot = 23775;
  await controller.refreshLtp();
  assert.equal(controller.membership().atm, 23800);
  assert.deepEqual(controller.membership().visibleStrikes, [22000, 23000, 23800, 24000]);
  await controller.refreshLtp();
  await controller.refreshLtp();
  assert.equal(controller.membership().atm, 23800, "unchanged midpoint must not ping-pong back down");
  assert.ok(rendered.length >= 3);
});

test("LTP refresh recenters downward at exact lower midpoint and remains stable", async () => {
  let fetches = 0;
  const movingChain = (spot) => ({
    spot,
    rows: Array.from({ length: 41 }, (_, index) => ({
      strike: 22900 + index * 50,
      call: index,
      put: index + 100
    }))
  });
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => movingChain(fetches++ === 0 ? 23767.45 : 23725),
    captureAxisScale: async () => scale(),
    renderRows: () => {},
    placeRows: () => true
  });

  await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour");
  assert.equal(controller.membership().atm, 23750);
  await controller.refreshLtp();
  assert.equal(controller.membership().atm, 23700);
  await controller.refreshLtp();
  assert.equal(controller.membership().atm, 23700);
});

test("ATM recenter keeps exact contract rows while native axis remains independent", async () => {
  const wide = (spot) => ({
    spot,
    rows: Array.from({ length: 101 }, (_, index) => ({
      strike: 21300 + index * 50,
      call: index,
      put: index + 100
    }))
  });
  const narrow = (spot) => ({
    spot,
    rows: Array.from({ length: 17 }, (_, index) => ({
      strike: 23100 + index * 100,
      call: index,
      put: index + 100
    }))
  });
  let fetches = 0;
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => {
      fetches += 1;
      if (fetches === 1) return wide(23767.45);
      if (fetches === 2) return narrow(23975);
      return wide(24050);
    },
    captureAxisScale: async () => ({ ...scale(), gridGapPx: 70 }),
    renderRows: () => {},
    placeRows: () => {}
  });

  await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 month");
  assert.equal(controller.membership().nativeInterval, 50);
  assert.equal(controller.membership().preferredInterval, undefined);
  assert.equal(controller.membership().interval, 50);
  await controller.refreshLtp();
  assert.equal(controller.membership().interval, 50);
  assert.equal(controller.membership().atmStep, 100);
  await controller.refreshLtp();
  assert.equal(controller.membership().interval, 50, "TradingView axis remains sole display interval");
  assert.equal(controller.membership().atmStep, 50);
});

test("partial chain preserves membership but never reports LIVE", async () => {
  let fetches = 0;
  const statuses = [];
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => {
      fetches += 1;
      const next = chain(23767.45, fetches);
      if (fetches === 1) return next;
      return { ...next, rows: next.rows.filter((row) => row.strike !== 23750) };
    },
    captureAxisScale: async () => scale(),
    renderRows: () => {},
    placeRows: () => true,
    setStatus: (status) => statuses.push(status)
  });

  await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour");
  const oldCall = controller.membership().rows.find((row) => row.strike === 23750).call;
  assert.equal(await controller.refreshLtp(), true);
  assert.equal(controller.membership().rows.find((row) => row.strike === 23750).call, oldCall);
  assert.equal(statuses.at(-1), "PARTIAL");
});

test("missing Call or Put quote stays PARTIAL through later axis placement", async () => {
  let fetches = 0;
  const statuses = [];
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => {
      fetches += 1;
      const next = chain(23767.45, fetches);
      if (fetches === 1) return next;
      return {
        ...next,
        rows: next.rows.map((row) => row.strike === 23750 ? { ...row, put: null } : row)
      };
    },
    captureAxisScale: async () => scale(),
    renderRows: () => {},
    placeRows: () => true,
    setStatus: (status) => statuses.push(status)
  });

  await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour");
  assert.equal(await controller.refreshLtp(), true);
  assert.equal(statuses.at(-1), "PARTIAL");
  assert.equal(await controller.place(), true);
  assert.equal(statuses.at(-1), "PARTIAL");
});

test("failed partial refresh placement cannot restore a stale LIVE status", async () => {
  let fetches = 0;
  let placements = 0;
  const statuses = [];
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => {
      fetches += 1;
      const next = chain(23767.45, fetches);
      if (fetches === 1) return next;
      return { ...next, rows: next.rows.filter((row) => row.strike !== 23750) };
    },
    captureAxisScale: async () => scale(),
    renderRows: () => {},
    placeRows: () => ++placements !== 2,
    setStatus: (status) => statuses.push(status)
  });

  await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour");
  assert.equal(await controller.refreshLtp(), false);
  assert.equal(statuses.at(-1), "EXACT STRIKE POSITIONS UNAVAILABLE");
  assert.equal(await controller.place(), true);
  assert.equal(statuses.at(-1), "PARTIAL");
});

test("thrown refresh placement error belongs to refreshed membership and recovers", async () => {
  let placements = 0;
  const statuses = [];
  const concealed = [];
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => chain(23767.45, 10),
    captureAxisScale: async () => scale(),
    renderRows: () => {},
    placeRows: () => {
      placements += 1;
      if (placements === 2) throw new Error("MONTHLY LANES OUTSIDE VIEW");
      return true;
    },
    concealRows: (message) => concealed.push(message),
    setStatus: (status) => statuses.push(status)
  });

  await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 month");
  assert.equal(await controller.refreshLtp(), false);
  assert.equal(concealed.at(-1), "MONTHLY LANES OUTSIDE VIEW");
  assert.equal(statuses.at(-1), "MONTHLY LANES OUTSIDE VIEW");
  assert.equal(await controller.place(), true);
  assert.equal(statuses.at(-1), "LIVE");
});

test("failed exact-midpoint recenter retries when complete chain returns", async () => {
  let fetches = 0;
  const statuses = [];
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => {
      fetches += 1;
      const spot = fetches === 1 ? 23767.45 : 23775;
      const next = chain(spot, fetches);
      if (fetches !== 2) return next;
      return { ...next, rows: next.rows.filter((row) => row.strike !== 23800) };
    },
    captureAxisScale: async () => scale(),
    renderRows: () => {},
    placeRows: () => true,
    setStatus: (status) => statuses.push(status)
  });

  await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour");
  assert.equal(await controller.refreshLtp(), true);
  assert.equal(controller.membership().atm, 23750);
  assert.equal(statuses.at(-1), "PARTIAL");
  assert.equal(await controller.refreshLtp(), true);
  assert.equal(controller.membership().atm, 23800);
  assert.equal(statuses.at(-1), "LIVE");
});

test("newest placement capture wins when older capture resolves last", async () => {
  let resolveOld;
  let captures = 0;
  const oldScale = new Promise((resolve) => { resolveOld = resolve; });
  const placements = [];
  const shifted = {
    ...scale(),
    axisPairs: scale().axisPairs.map((pair) => ({ ...pair, y: pair.y + 100 }))
  };
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => chain(23767.45),
    captureAxisScale: async () => {
      captures += 1;
      if (captures <= 2) return scale();
      if (captures === 3) return oldScale;
      return shifted;
    },
    renderRows: () => {},
    placeRows: (rows) => placements.push(rows)
  });

  await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour");
  const older = controller.place();
  const newer = controller.place();
  assert.equal(await newer, true);
  const countAfterNewer = placements.length;
  resolveOld(scale());
  assert.equal(await older, false);
  assert.equal(placements.length, countAfterNewer);
  assert.equal(placements.at(-1).find((row) => row.strike === 23750).y, 250);
  await controller.refreshLtp();
  assert.equal(placements.at(-1).find((row) => row.strike === 23750).y, 250, "cached map also stays newest");
});

test("placement rejects an axis observation older than committed membership", async () => {
  let captures = 0;
  const options = [];
  const placements = [];
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => chain(23767.45),
    captureAxisScale: async (_signal, captureOptions = {}) => {
      options.push(captureOptions);
      captures += 1;
      return { ...scale(), observedAt: captures <= 2 ? 200 : 100 };
    },
    renderRows: () => {},
    placeRows: (rows) => placements.push(rows),
    concealRows: () => {},
    setStatus: () => {}
  });

  await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour");
  const before = placements.length;
  assert.equal(await controller.place(), false);
  assert.equal(options.at(-1).minimumObservedAt, 200);
  assert.equal(placements.length, before);
});

test("failed placement conceals but preserves rendered rows so next successful capture recovers immediately", async () => {
  let placementAttempts = 0;
  const hidden = [];
  const concealed = [];
  const placements = [];
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => chain(23767.45),
    captureAxisScale: async () => scale(),
    renderRows: () => {},
    placeRows: (rows) => {
      placementAttempts += 1;
      if (placementAttempts === 2) return false;
      placements.push(rows);
      return true;
    },
    hideRows: (message) => hidden.push(message),
    concealRows: (message) => concealed.push(message),
    setStatus: () => {}
  });

  await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour");
  const concealedBeforePlacement = concealed.length;
  assert.equal(await controller.place(), false);
  assert.deepEqual(hidden, [], "placement failure must not delete existing row elements");
  assert.equal(concealed.length, concealedBeforePlacement + 1, "stale coordinates must not remain visible");
  assert.equal(await controller.place(), true);
  assert.equal(placements.at(-1).length, 13);
});

test("placement started during rebuild cannot overwrite newly committed axis map", async () => {
  let resolveRebuildFirst;
  let resolveOldPlacement;
  const rebuildFirst = new Promise((resolve) => { resolveRebuildFirst = resolve; });
  const oldPlacement = new Promise((resolve) => { resolveOldPlacement = resolve; });
  let captures = 0;
  const placements = [];
  const shifted = {
    ...scale(),
    axisPairs: scale().axisPairs.map((pair) => ({ ...pair, y: pair.y + 100 }))
  };
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => chain(23767.45),
    captureAxisScale: async () => {
      captures += 1;
      if (captures <= 2) return scale();
      if (captures === 3) return oldPlacement;
      if (captures === 4) return rebuildFirst;
      return scale();
    },
    renderRows: () => {},
    placeRows: (rows) => { placements.push(rows); return true; }
  });

  await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour");
  const stalePlacement = controller.place();
  const rebuilding = controller.rebuild("1D");
  resolveRebuildFirst(scale());
  assert.equal(await rebuilding, true);
  resolveOldPlacement(shifted);
  assert.equal(await stalePlacement, false);
  await controller.refreshLtp();
  assert.equal(placements.at(-1).find((row) => row.strike === 23750).y, 150);
});

test("in-flight zoom placement survives concurrent LTP refresh and places latest quotes", async () => {
  let resolvePlacementScale;
  const pendingPlacementScale = new Promise((resolve) => { resolvePlacementScale = resolve; });
  const placements = [];
  const hidden = [];
  let fetches = 0;
  let captures = 0;
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => chain(23767.45, fetches++ === 0 ? 0 : 50),
    captureAxisScale: async () => {
      captures += 1;
      return captures <= 2 ? scale() : pendingPlacementScale;
    },
    renderRows: () => {},
    placeRows: (rows) => placements.push(rows),
    hideRows: (message) => hidden.push(message)
  });

  await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour");
  const placement = controller.place();
  assert.equal(await controller.refreshLtp(), true);
  resolvePlacementScale(scale());

  assert.equal(await placement, true);
  assert.deepEqual(hidden, []);
  assert.equal(controller.membership().rows.find((row) => row.strike === 23750).call, 167);
  assert.equal(placements.at(-1).find((row) => row.strike === 23750).call, 167);
});

test("same-timeframe expiry change blocks stale placement and waits for manual refresh", async () => {
  let resolveNextChain;
  const nextChain = new Promise((resolve) => { resolveNextChain = resolve; });
  const statuses = [];
  const hidden = [];
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async (expiry) => expiry === "current_month" ? chain(23767.45) : nextChain,
    captureAxisScale: async () => scale(),
    renderRows: () => {},
    placeRows: () => true,
    hideRows: (message) => hidden.push(message),
    setStatus: (status) => statuses.push(status)
  });

  await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour");
  const expiryChanged = controller.setExpiry("next_month");
  assert.equal(await controller.place(), false);
  assert.equal(await controller.refreshLtp(), false);
  assert.equal(statuses.at(-1), "MANUAL REFRESH REQUIRED");
  assert.equal(hidden.at(-1), "PRESS REFRESH OPTION NUMBERS");
  assert.equal(await expiryChanged, false);

  const rebuilding = controller.rebuild("1h");
  resolveNextChain(chain(23767.45, 25));
  assert.equal(await rebuilding, true);
  assert.equal(controller.membership().expiry, "next_month");
  assert.equal(statuses.at(-1), "LIVE");
});

test("refresh normalizes invalid live quotes to null without changing frozen contract membership", async () => {
  let fetches = 0;
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => {
      fetches += 1;
      return fetches === 1 ? chain(23767.45) : {
        spot: 23767.45,
        rows: chain(23767.45).rows.map((row) => ({ ...row, call: null, put: " " }))
      };
    },
    captureAxisScale: async () => scale(),
    renderRows: () => {},
    placeRows: () => {}
  });

  await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour");
  await controller.refreshLtp();

  assert.deepEqual(controller.membership().strikes, [
    23450, 23500, 23550, 23600, 23650, 23700, 23750,
    23800, 23850, 23900, 23950, 24000, 24050
  ]);
  assert.deepEqual(controller.membership().rows.find((row) => row.strike === 23750), { strike: 23750, call: null, put: null });
});

test("timeframe transition rebuilds once while an unchanged label does not", async () => {
  let fetches = 0;
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => { fetches += 1; return chain(23767.45); },
    captureAxisScale: async () => scale(),
    renderRows: () => {},
    placeRows: () => {}
  });

  assert.equal(await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour"), true);
  assert.equal(await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour"), false);
  assert.equal(await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 day"), true);
  assert.equal(fetches, 1);
  assert.equal(controller.membership().timeframe, "1D");
});

test("timeframe switch accepts axis observation painted just before label detection", async () => {
  const captureFloors = [];
  const scheduled = [];
  let observedAt = 100;
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => chain(23767.45),
    captureAxisScale: async (_signal, options) => {
      captureFloors.push(options.minimumObservedAt);
      if (observedAt < options.minimumObservedAt) return { ok: false };
      return { ...scale(), observedAt };
    },
    axisObservationAt: () => observedAt,
    renderRows: () => {},
    placeRows: () => {},
    scheduleRetry: (run, delay) => { scheduled.push({ run, delay }); return scheduled.length; },
    cancelRetry: () => {}
  });

  await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour");
  assert.deepEqual(captureFloors, [0, 0]);
  observedAt = 200;
  assert.equal(await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 day"), true);
  assert.equal(scheduled.length, 0);
  assert.deepEqual(captureFloors.slice(-2), [101, 101]);
  assert.equal(controller.membership().timeframe, "1D");
});

test("timeframe switch rejects old axis observation and retry keeps transition floor", async () => {
  const captureFloors = [];
  const scheduled = [];
  let observedAt = 100;
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => chain(23767.45),
    captureAxisScale: async (_signal, options) => {
      captureFloors.push(options.minimumObservedAt);
      if (observedAt < options.minimumObservedAt) return { ok: false };
      return { ...scale(), observedAt };
    },
    axisObservationAt: () => observedAt,
    renderRows: () => {},
    placeRows: () => {},
    scheduleRetry: (run, delay) => { scheduled.push({ run, delay }); return scheduled.length; },
    cancelRetry: () => {}
  });

  await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour");
  assert.equal(await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 day"), false);
  assert.equal(scheduled.length, 1);
  assert.equal(captureFloors.at(-1), 101);

  observedAt = 200;
  await scheduled[0].run();
  assert.deepEqual(captureFloors.slice(-2), [101, 101]);
  assert.equal(controller.membership().timeframe, "1D");
});

test("failed timeframe transition keeps its observation floor on direct re-entry", async () => {
  let observedAt = 100;
  let failCapture = false;
  const floors = [];
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => chain(23767.45),
    captureAxisScale: async (_signal, options = {}) => {
      floors.push(options.minimumObservedAt || 0);
      return failCapture ? { ok: false } : { ...scale(), observedAt };
    },
    axisObservationAt: () => observedAt,
    renderRows: () => {},
    placeRows: () => true,
    scheduleRetry: () => 1,
    cancelRetry: () => {}
  });

  await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour");
  observedAt = 200;
  failCapture = true;
  assert.equal(await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 day"), false);
  failCapture = false;
  assert.equal(await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 day"), true);
  assert.equal(floors.at(-2), 101);
  assert.equal(floors.at(-1), 101);
  assert.equal(controller.membership().timeframe, "1D");
});

test("failed timeframe transition keeps its observation floor when user chooses a third timeframe", async () => {
  let observedAt = 100;
  let failCapture = false;
  const floors = [];
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => chain(23767.45),
    captureAxisScale: async (_signal, options = {}) => {
      floors.push(options.minimumObservedAt || 0);
      return failCapture ? { ok: false } : { ...scale(), observedAt };
    },
    axisObservationAt: () => observedAt,
    renderRows: () => {},
    placeRows: () => true,
    scheduleRetry: () => 1,
    cancelRetry: () => {}
  });

  await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour");
  observedAt = 200;
  failCapture = true;
  assert.equal(await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 day"), false);
  failCapture = false;
  assert.equal(await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 week"), true);
  assert.equal(floors.at(-2), 101);
  assert.equal(floors.at(-1), 101);
  assert.equal(controller.membership().timeframe, "1W");
});

test("row layout always keeps one column without changing exact y", () => {
  const normalRows = [
    { strike: 23700, y: 100.375 },
    { strike: 23750, y: 124.375 },
    { strike: 23800, y: 148.375 }
  ];
  const normalSnapshot = structuredClone(normalRows);
  const normal = api.rowLaneLayout(normalRows, 23750, 50);
  assert.deepEqual(normal, { mode: "single", laneCount: 1, lanes: [0, 0, 0] });
  assert.deepEqual(normalRows, normalSnapshot);

  const dense = api.rowLaneLayout(Array.from({ length: 13 }, (_, index) => ({
    strike: 23450 + index * 50,
    y: 100.375 + index * 14
  })), 23750, 50);
  assert.equal(dense.mode, "single");
  assert.equal(dense.laneCount, 1);
  assert.deepEqual(dense.lanes, Array(13).fill(0));

  const inverted = api.rowLaneLayout(Array.from({ length: 13 }, (_, index) => ({
    strike: 23450 + index * 50,
    y: 268.375 - index * 14
  })), 23750, 50);
  assert.deepEqual(inverted, dense);
});

test("dense and coincident rows never expand beyond one column", () => {
  const compressed = Array.from({ length: 13 }, (_, index) => ({
    strike: 23450 + index * 50,
    y: 200.25 + index * 5
  }));
  const fiveLane = api.rowLaneLayout(compressed, 23750, 50);
  assert.deepEqual(fiveLane, {
    mode: "single",
    laneCount: 1,
    lanes: Array(13).fill(0)
  });
  assert.equal(fiveLane.lanes[6], 0, "ATM remains in the right-axis lane");

  const coincident = compressed.map((row) => ({ ...row, y: 300.5 }));
  assert.deepEqual(api.rowLaneLayout(coincident, 23750, 50), {
    mode: "single",
    laneCount: 1,
    lanes: Array(13).fill(0)
  });

  assert.equal(api.rowLaneLayout([
    ...coincident,
    { strike: 24050, y: 300.5 }
  ], 23750, 50), null);
});

test("display ATM snaps to nearest strike that is actually visible", () => {
  assert.equal(api.displayAtmStrike([24600, 24800], 24700), 24800,
    "equal-distance tie resolves upward");
  assert.equal(api.displayAtmStrike([24600, 24700, 24800], 24700), 24700,
    "exact visible ATM wins");
  assert.equal(api.displayAtmStrike([24600, 24800], 24774.3), 24800);
  assert.equal(api.displayAtmStrike([], 24700), null);
});

test("render filter retains real in-range ATM between native grid labels", () => {
  assert.deepEqual(api.renderableAxisStrikes({
    axisPrices: [24200, 24400],
    atm: 24300,
    atmStep: 50,
    rows: [{ strike: 24200 }, { strike: 24300 }, { strike: 24400 }]
  }), [24200, 24300, 24400]);
});

test("position spine is bounded by first and last visible strike", () => {
  assert.deepEqual(api.positionSpineBounds([
    { strike: 26200, y: 40 },
    { strike: 24800, y: 390 },
    { strike: 22600, y: 760 }
  ], { top: 0, bottom: 800 }), { top: 40, bottom: 760 });
  assert.equal(api.positionSpineBounds([{ y: -10 }, { y: 900 }], { top: 0, bottom: 800 }), null);
});

test("position spine owns a foreground layer above strike rows", () => {
  const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");
  const rails = css.match(/#nifty-strategy-rails\s*\{([^}]+)\}/)?.[1] || "";
  const rows = css.match(/\.nifty-axis-ladder__row\s*\{([^}]+)\}/)?.[1] || "";
  assert.match(rails, /z-index:\s*5/);
  assert.match(rows, /z-index:\s*2/);
});

test("viewport fit rejects clipped rows and accepts exact visible price coordinates", () => {
  const rows = [{ y: 120 }, { y: 180 }, { y: 240 }];
  const dimensions = rows.map(() => ({ width: 220, height: 22 }));
  const rect = { left: 50, top: 100, right: 950, bottom: 260 };
  assert.equal(api.rowsFitPlot(rows, dimensions, rect, 1000, 57, [0, 2, 0], 230), true);
  assert.equal(api.rowsFitPlot([{ y: 105 }, ...rows.slice(1)], dimensions, rect, 1000, 57, [0, 1, 0], 230), false);
  assert.equal(api.rowsFitPlot(rows, [{ width: 0, height: 22 }, ...dimensions.slice(1)], rect, 1000, 57, [0, 1, 0], 230), false);
  assert.equal(api.rowsFitPlot(rows, dimensions, { ...rect, left: 600 }, 1000, 57, [0, 2, 0], 230), false);
});

test("viewport filtering keeps visible exact strikes when sibling strikes are clipped", () => {
  const rows = [{ y: 90 }, { y: 120 }, { y: 180 }, { y: 270 }];
  const dimensions = rows.map(() => ({ width: 220, height: 22 }));
  const rect = { left: 50, top: 100, right: 950, bottom: 260 };

  assert.deepEqual(
    api.visibleRowIndexes(rows, dimensions, rect, 1000, 57, [0, 0, 0, 0], 230),
    [1, 2]
  );
});

test("returning to committed A cancels an in-flight B request and rebuilds desired A", async () => {
  let resolveB;
  const bCapture = new Promise((resolve) => { resolveB = resolve; });
  let bStarted = false;
  const requests = [];
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => chain(23767.45),
    captureAxisScale: async () => {
      const timeframe = requests.at(-1);
      if (timeframe === "1D" && !bStarted) {
        bStarted = true;
        return bCapture;
      }
      return scale();
    },
    renderRows: (_rows, membership) => requests.push(membership.timeframe),
    placeRows: () => {}
  });

  await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour");
  const b = controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 day");
  const a = controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour");
  resolveB(scale());

  assert.equal(await b, false);
  assert.equal(await a, true);
  assert.equal(controller.membership().timeframe, "1h");
});

test("expiry change invalidates old data and waits for manual refresh", async () => {
  let resolveOld;
  const oldExpiry = new Promise((resolve) => { resolveOld = resolve; });
  const requestedExpiries = [];
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async (expiry) => {
      requestedExpiries.push(expiry);
      return expiry === "current_month" ? oldExpiry : chain(23767.45, 20);
    },
    captureAxisScale: async () => scale(),
    renderRows: () => {},
    placeRows: () => {}
  });

  const initial = controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour");
  const replacement = controller.setExpiry("next_month");
  resolveOld(chain(23767.45, 99));

  assert.equal(await initial, false);
  assert.equal(await replacement, false);
  assert.deepEqual(requestedExpiries, ["current_month"]);
  assert.equal(controller.membership(), null);

  assert.equal(await controller.rebuild("1h"), true);
  assert.deepEqual(requestedExpiries, ["current_month", "next_month"]);
  assert.equal(controller.membership().timeframe, "1h");
  assert.equal(controller.membership().expiry, "next_month");
  assert.equal(controller.membership().rows.find((row) => row.strike === 23750).call, 137);
});

test("failed calibration retries the bounded rebuild schedule and commits the widest exact fallback after two matching intervals", async () => {
  const scheduled = [];
  let captures = 0;
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => chain(23767.45),
    captureAxisScale: async () => {
      captures += 1;
      if (captures === 1) return { ...scale(), ok: false };
      if (captures === 2) return scale();
      return { ...scale(), gridGapPx: 30 };
    },
    renderRows: () => {},
    placeRows: () => {},
    scheduleRetry: (run, delay) => { scheduled.push({ run, delay }); return scheduled.length; },
    cancelRetry: () => {}
  });

  assert.equal(await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour"), false);
  assert.deepEqual(scheduled.map((entry) => entry.delay), [0]);
  await scheduled[0].run();
  assert.deepEqual(scheduled.map((entry) => entry.delay), [0, 250]);
  await scheduled[1].run();

  assert.equal(controller.membership().interval, 50);
  assert.deepEqual(scheduled.map((entry) => entry.delay), [0, 250]);
});

test("a rebuild generation discards a stale in-flight LTP refresh", async () => {
  let resolveRefresh;
  const refreshChain = new Promise((resolve) => { resolveRefresh = resolve; });
  let resolveRebuildCapture;
  const rebuildCapture = new Promise((resolve) => { resolveRebuildCapture = resolve; });
  let fetches = 0;
  let captures = 0;
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => {
      fetches += 1;
      if (fetches === 1) return chain(23767.45);
      if (fetches === 2) return refreshChain;
      return chain(23767.45, 20);
    },
    captureAxisScale: async () => (++captures <= 2 ? scale() : rebuildCapture),
    renderRows: () => {},
    placeRows: () => {}
  });

  await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour");
  const refresh = controller.refreshLtp();
  const rebuild = controller.rebuild("1D");
  resolveRefresh(chain(23767.45, 99));

  assert.equal(await refresh, false);
  resolveRebuildCapture(scale());
  await rebuild;
  assert.equal(controller.membership().rows.find((row) => row.strike === 23750).call, 117);
});

test("rebuild aborts a hung LTP request and later quote refreshes continue", async () => {
  let fetches = 0;
  let refreshSignal;
  let resolveHungRefresh;
  const pendingRefresh = new Promise((resolve) => { resolveHungRefresh = resolve; });
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async (_expiry, signal) => {
      fetches += 1;
      if (fetches === 2) {
        refreshSignal = signal;
        return pendingRefresh;
      }
      return chain(23767.45, fetches >= 3 ? 50 : 0);
    },
    captureAxisScale: async () => scale(),
    renderRows: () => {},
    placeRows: () => true
  });

  await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour");
  const hungRefresh = controller.refreshLtp();
  assert.equal(await controller.rebuild("1D"), true);
  assert.equal(refreshSignal?.aborted, true);
  resolveHungRefresh(chain(23767.45, 99));
  assert.equal(await hungRefresh, false);
  assert.equal(await controller.refreshLtp(), true);
  assert.equal(controller.membership().rows.find((row) => row.strike === 23750).call, 167);
});

test("failed stale LTP request cannot overwrite newer LIVE status", async () => {
  let rejectRefresh;
  const staleRefresh = new Promise((_resolve, reject) => { rejectRefresh = reject; });
  let fetches = 0;
  const statuses = [];
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => (++fetches === 2 ? staleRefresh : chain(23767.45)),
    captureAxisScale: async () => scale(),
    renderRows: () => {},
    placeRows: () => true,
    setStatus: (status) => statuses.push(status)
  });

  await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour");
  const oldRefresh = controller.refreshLtp();
  assert.equal(await controller.rebuild("1D"), true);
  rejectRefresh(new Error("old request failed"));
  assert.equal(await oldRefresh, false);
  assert.equal(statuses.at(-1), "LIVE");
  assert.equal(statuses.includes("STALE"), false);
});

test("same timeframe can recover after bounded calibration retries are exhausted", async () => {
  const scheduled = [];
  let valid = false;
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => chain(23767.45),
    captureAxisScale: async () => valid ? scale() : { ok: false },
    renderRows: () => {},
    placeRows: () => true,
    scheduleRetry: (run, delay) => { scheduled.push({ run, delay }); return scheduled.length; },
    cancelRetry: () => {}
  });

  const label = "Chart for NSE_DLY:NIFTY, 1 hour";
  assert.equal(await controller.syncTimeframe(label), false);
  for (let index = 0; index < 4; index += 1) await scheduled[index].run();
  assert.equal(controller.membership(), null);
  valid = true;
  assert.equal(await controller.syncTimeframe(label), true);
  assert.equal(controller.membership().timeframe, "1h");
});

test("unsupported timeframes fail closed without chain or placement work", async () => {
  let fetches = 0;
  let hidden = 0;
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => { fetches += 1; return chain(23767.45); },
    captureAxisScale: async () => scale(),
    renderRows: () => {},
    placeRows: () => {},
    hideRows: () => { hidden += 1; }
  });

  assert.equal(await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 2 minutes"), false);
  assert.equal(fetches, 0);
  assert.equal(hidden, 1);
  assert.equal(controller.membership(), null);
});

test("unsupported timeframe aborts and invalidates an in-flight rebuild", async () => {
  let resolveScale;
  const pendingScale = new Promise((resolve) => { resolveScale = resolve; });
  let captures = 0;
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => chain(23767.45),
    captureAxisScale: async () => (++captures <= 2 ? scale() : pendingScale),
    renderRows: () => {},
    placeRows: () => {}
  });

  await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour");
  const rebuild = controller.rebuild("1D");
  assert.equal(await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 2 minutes"), false);
  resolveScale(scale());
  assert.equal(await rebuild, false);
  assert.equal(controller.membership(), null);
});

test("browser lifecycle disconnects observers and relies only on fresh axis observations for placement", () => {
  const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  const listeners = [];
  const removedListeners = [];
  const observers = [];
  const storageListeners = [];
  const nodes = new Map();
  const makeNode = () => ({
    dataset: {},
    hidden: false,
    style: { setProperty() {} },
    classList: { toggle() {} },
    addEventListener() {},
    removeEventListener() {},
    append(child) { if (child.id) nodes.set(child.id, child); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    remove() { if (this.id) nodes.delete(this.id); }
  });
  const root = makeNode();
  const sandbox = {
    NiftyTimeframeLadder: require("./timeframe-ladder.js"),
    NiftyManualPlan: require("./manual-plan.js"),
    NiftySellerViewIdentity: viewIdentity,
    AbortController,
    MutationObserver: class {
      constructor() { this.disconnects = 0; observers.push(this); }
      observe() {}
      disconnect() { this.disconnects += 1; }
    },
    chrome: {
      runtime: { sendMessage: async () => ({ ok: false }) },
      storage: {
        local: { get(_defaults, callback) { callback({ enabled: false, expiry: "current_month" }); } },
        onChanged: { addListener(listener) { storageListeners.push(listener); } }
      }
    },
    document: {
      documentElement: root,
      createElement: makeNode,
      getElementById(id) { return nodes.get(id); },
      querySelector() { return null; },
      addEventListener() {},
      removeEventListener() {}
    },
    window: {
      innerWidth: 100,
      innerHeight: 100,
      addEventListener(type) { listeners.push(type); },
      removeEventListener(type) { removedListeners.push(type); }
    },
    setInterval() { return 1; },
    clearInterval() {},
    setTimeout() { return 1; },
    clearTimeout() {},
    console
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox);
  storageListeners[0]({ enabled: { newValue: true } }, "local");
  storageListeners[0]({ enabled: { newValue: false } }, "local");
  storageListeners[0]({ enabled: { newValue: true } }, "local");

  assert.deepEqual(listeners, []);
  assert.deepEqual(removedListeners, []);
  assert.equal(observers.length, 2);
  assert.equal(observers[0].disconnects, 1);
});

test("enabled NIFTY tab waits for manual refresh before first chain request", async () => {
  const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  let chainFetches = 0;
  const runtimeListeners = [];
  const canvas = {
    getAttribute(name) { return name === "aria-label" ? "Chart for NSE_DLY:NIFTY, 1 hour" : null; },
    getBoundingClientRect() { return { left: 0, top: 0, right: 900, bottom: 700 }; }
  };
  const root = {
    getAttribute() { return null; },
    append() {},
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  const sandbox = {
    NiftyTimeframeLadder: require("./timeframe-ladder.js"),
    NiftyManualPlan: require("./manual-plan.js"),
    NiftySellerViewIdentity: viewIdentity,
    AbortController,
    MutationObserver: class { observe() {} disconnect() {} },
    chrome: {
      runtime: {
        async sendMessage() { return { ok: false }; },
        onMessage: { addListener(listener) { runtimeListeners.push(listener); } }
      },
      storage: {
        local: { get(_defaults, callback) { callback({ enabled: true, expiry: "current_month" }); } },
        onChanged: { addListener() {} }
      }
    },
    document: {
      documentElement: root,
      createElement() { return { dataset: {}, style: { setProperty() {} }, classList: { toggle() {} }, addEventListener() {}, removeEventListener() {}, append() {}, querySelector() { return null; }, querySelectorAll() { return []; } }; },
      getElementById() { return null; },
      querySelector(selector) { return selector.startsWith("canvas[aria-label") ? canvas : null; },
      addEventListener() {},
      removeEventListener() {}
    },
    fetch: async () => {
      chainFetches += 1;
      return { ok: true, json: async () => chain(23767.45) };
    },
    window: { innerWidth: 1000, innerHeight: 800 },
    setTimeout() { return 1; },
    clearTimeout() {},
    console
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox);
  await new Promise(setImmediate);
  await new Promise(setImmediate);

  assert.equal(runtimeListeners.length, 1);
  assert.equal(chainFetches, 0);
});

test("new content has no collision spreading or Pine input synchronization path", () => {
  const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");
  assert.doesNotMatch(source, /spreadAroundAnchor|SYNC_PINE_INPUTS|TRUSTED_REPLACE_FIELD/);
  assert.doesNotMatch(css, /has-leader|leader-down|leader-up|nifty-leader-height/);
  assert.doesNotMatch(source, /refreshTimer = setInterval/);
  assert.match(source, /REFRESH_OPTION_NUMBERS/);
  assert.match(source, /chain:\s*controller\.chain\(\)/);
});

test("manual plan disclosure keeps previous black cards with full-row profit and loss color in both themes", () => {
  const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");
  const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  const light = css.match(/#nifty-axis-ladder\[data-theme="light"\]\s*\{([^}]+)\}/)?.[1] || "";
  assert.match(css, /--theme-panel:\s*#111113/);
  assert.match(css, /--theme-line-2:\s*#2a2a30/);
  assert.match(css, /--theme-ink:\s*#f4f4f5/);
  assert.match(css, /--theme-warn:\s*#fbbf24/);
  assert.match(css, /--theme-accent:\s*#34d399/);
  assert.match(css, /--theme-danger:\s*#f87171/);
  assert.match(css, /--pnl-profit:\s*#34d399/);
  assert.match(css, /--pnl-profit-soft:\s*rgba\(52, 211, 153, 0\.12\)/);
  assert.match(css, /--pnl-loss:\s*#f87171/);
  assert.match(css, /--pnl-loss-soft:\s*rgba\(248, 113, 113, 0\.10\)/);
  assert.match(css, /--plan-surface:\s*#111113/);
  assert.match(css, /--plan-ink:\s*#f4f4f5/);
  assert.doesNotMatch(light, /--pnl-(?:profit|loss)/);
  assert.doesNotMatch(light, /--plan-(?:surface|ink)/);
  assert.match(css, /--ladder-surface:\s*var\(--theme-panel\)/);
  assert.match(css, /--ladder-atm:\s*var\(--theme-warn\)/);
  assert.match(css, /--ladder-buy:\s*var\(--theme-accent\)/);
  assert.match(css, /--ladder-sell:\s*var\(--theme-danger\)/);
  assert.match(css, /\.nifty-axis-ladder__row\.is-atm\s*\{[^}]*background:\s*var\(--ladder-atm\)/);
  assert.match(css, /\.nifty-axis-ladder__row\.is-manual-entry\.is-buy\s*\{[^}]*background:\s*var\(--ladder-buy\)/);
  assert.match(css, /\.nifty-axis-ladder__row\.is-manual-entry\.is-sell\s*\{[^}]*background:\s*var\(--ladder-sell\)/);
  assert.match(css, /\.nifty-axis-ladder__row\s*\{[\s\S]*?background:\s*var\(--ladder-surface\)/);
  assert.match(css, /\.nifty-axis-ladder__row\s*\{[\s\S]*?width:\s*max-content/);
  assert.match(css, /\.nifty-axis-ladder__row\s*\{[\s\S]*?text-align:\s*center/);
  assert.match(css, /--ladder-selected:\s*var\(--theme-warn\)/);
  assert.doesNotMatch(css, /#a78bfa|#ddd6fe/i);
  assert.match(css, /\.nifty-manual-plan__line\s*\{[^}]*border-top:\s*1px dashed var\(--ladder-line\)/);
  assert.match(css, /\.nifty-manual-plan__label,[\s\S]*?font:\s*11px\/1\.25 "Geist Mono"/);
  assert.match(css, /\.nifty-manual-plan__label,[\s\S]*?background:\s*var\(--plan-surface\)/);
  assert.match(css, /\.nifty-manual-plan__label,[\s\S]*?color:\s*var\(--plan-ink\)/);
  assert.match(css, /\.nifty-manual-plan__trade\.is-profit\s*\{[^}]*border-left-color:\s*var\(--pnl-profit\)[^}]*color:\s*var\(--pnl-profit\)/);
  assert.match(css, /\.nifty-manual-plan__trade\.is-loss\s*\{[^}]*border-left-color:\s*var\(--pnl-loss\)[^}]*color:\s*var\(--pnl-loss\)/);
  assert.match(css, /\.nifty-manual-plan__pnl\.is-profit,[\s\S]*?color:\s*inherit/);
  assert.doesNotMatch(css, /\.nifty-manual-plan__group\.is-atm/);
  assert.match(source, /trade\.className\s*=\s*`nifty-manual-plan__trade is-\$\{item\.tone\}`/);
  assert.match(css, /\.nifty-seller-risk__band\.is-current\.is-profit\s*\{[^}]*background:\s*var\(--pnl-profit-soft\)/);
  assert.match(css, /\.nifty-seller-risk__band\.is-current\.is-loss\s*\{[^}]*background:\s*var\(--pnl-loss-soft\)/);
});

test("entry faces contain exact compact copy without redundant trade words or icon", () => {
  const source = fs.readFileSync(path.join(__dirname, "manual-ui.js"), "utf8");
  assert.doesNotMatch(source, /SELL C|BUY C|SELL P|BUY P|↻/);
  assert.match(source, /×\$\{active\.lots\}/);
});

test("top-left lot badges use yellow emphasis without moving row geometry", () => {
  const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");
  const badges = css.match(/\.nifty-axis-ladder__badges\s*\{([^}]+)\}/)?.[1] || "";
  const badge = css.match(/\.nifty-axis-ladder__badge\s*\{([^}]+)\}/)?.[1] || "";
  const atmRowBadge = css.match(/\.nifty-axis-ladder__row\.is-atm \.nifty-axis-ladder__badge\s*\{([^}]+)\}/)?.[1] || "";
  const editor = css.match(/\.nifty-manual-editor\s*\{([^}]+)\}/)?.[1] || "";
  assert.match(badges, /position:\s*absolute/);
  assert.match(badges, /left:\s*4px/);
  assert.match(badges, /top:\s*-13px/);
  assert.match(badges, /z-index:\s*3/);
  assert.match(badge, /border:\s*1px solid var\(--ladder-selected-ink\)/);
  assert.match(badge, /background:\s*var\(--ladder-selected\)/);
  assert.match(badge, /color:\s*var\(--ladder-selected-ink\)/);
  assert.match(atmRowBadge, /border-color:\s*var\(--ladder-atm-badge\)/);
  assert.match(atmRowBadge, /background:\s*var\(--ladder-atm-badge\)/);
  assert.match(atmRowBadge, /color:\s*var\(--ladder-atm-badge-ink\)/);
  assert.match(editor, /position:\s*fixed/);
  assert.match(editor, /z-index:\s*\d+/);
  assert.match(editor, /top:\s*50%/);
  assert.match(editor, /width:\s*max-content/);
  assert.match(editor, /background:\s*var\(--ladder-selected\)/);
  assert.match(editor, /transform:\s*translateY\(-50%\)/);
  assert.match(css, /\.nifty-axis-ladder__row\.has-manual-editor[\s\S]*?\.nifty-axis-ladder__cell[\s\S]*?visibility:\s*hidden/);
  assert.doesNotMatch(css, /\.nifty-axis-ladder__row:has\(>\s*\.nifty-manual-editor\)/);
});

test("manual editor paints above strategy and broker control stacking context", () => {
  const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");
  const editor = css.match(/\.nifty-manual-editor\s*\{([^}]+)\}/)?.[1] || "";
  const strategyRoot = css.match(/#nifty-strategy-rails\s*\{([^}]+)\}/)?.[1] || "";
  const editorIndex = Number(editor.match(/z-index:\s*(\d+)/)?.[1]);
  const strategyIndex = Number(strategyRoot.match(/z-index:\s*(\d+)/)?.[1]);
  assert.ok(Number.isFinite(editorIndex) && Number.isFinite(strategyIndex));
  assert.ok(editorIndex > strategyIndex,
    "manual editor must remain readable and clickable above C/P and T controls");
});

test("quick break-even labels and strategy controls stay in separate fixed slots", () => {
  const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");
  assert.doesNotMatch(css, /\.nifty-break-even__label\.has-strategy-card/);
  assert.doesNotMatch(css, /\.nifty-strategy__card\.is-inline-be/);
  assert.doesNotMatch(contentSource, /attachQuickBreakEvenStrategyCards/);
});

test("collapsed manual strategy shows BE after strike click while checkbox controls rail", async () => {
  const book = chartStrategyBook();
  const manualEntries = Object.values(book.legs).filter((entry) => entry.source === "MANUAL");
  const h = createBreakEvenLifecycleHarness({ strategyBook: book, manualEntries });
  await h.settle();
  h.click(23800);
  await h.settle();

  let rails = h.strategyRails();
  let cards = rails.querySelectorAll(".nifty-strategy__card")
    .filter((node) => node.classList.contains("is-strategy"));
  assert.equal(cards.length, 1, "inactive same-strike T stays hidden until combined selection starts");
  assert.equal(rails.querySelectorAll(".nifty-strategy__rail")
    .filter((node) => node.classList.contains("is-original")).length, 0,
  "unchecked manual Call and Put never expose BE rails");
  cards.forEach((card) => {
    assert.ok(card.classList.contains("is-rail-header"));
    assert.ok(card.children[0].classList.contains("nifty-strategy__selector"),
      "checkbox remains first fixed slot for Call and Put");
    const label = card.children[1];
    assert.ok(label.children[0].classList.contains("nifty-strategy__rail-token"));
    assert.equal(label.children.length, 3,
      "strike-clicked control contains token, divider, and real BE evidence");
    assert.equal(label.querySelector(".nifty-strategy__rail-text").textContent, "BE 23,900 | Margin —");
  });

  cards[0].querySelector(".nifty-strategy__selector")
    .dispatch("click", { stopPropagation() {} });
  await h.settle();
  rails = h.strategyRails();
  cards = rails.querySelectorAll(".nifty-strategy__card")
    .filter((node) => node.classList.contains("is-strategy"));
  assert.equal(rails.querySelectorAll(".nifty-strategy__rail")
    .filter((node) => node.classList.contains("is-original")).length, 1);
  const checked = cards.find((card) => card.querySelector(".nifty-strategy__selector")
    ?.getAttribute("aria-pressed") === "true");
  assert.ok(checked.querySelector(".nifty-strategy__rail-divider"));
  assert.equal(checked.querySelector(".nifty-strategy__rail-text").textContent, "BE 23,900 | Margin —");
});

test("collapsed and open strategy cards cap quick BE labels without changing rail values or Y", async () => {
  const book = chartStrategyBook();
  const manualEntries = Object.values(book.legs).filter((entry) => entry.source === "MANUAL");
  const h = createBreakEvenLifecycleHarness({
    strategyBook: book,
    manualEntries,
    elementBounds(node) {
      if (node.classList.contains("nifty-axis-ladder__row")) {
        return { left: 1280, top: 20, right: 1500, bottom: 40 };
      }
      if (node.classList.contains("nifty-strategy__card")) {
        const right = 1600 - Number.parseFloat(node.style.right || "0");
        const top = Number.parseFloat(node.style.top || "0");
        const width = node.classList.contains("is-open") ? 320 : 180;
        return { left: right - width, top, right, bottom: top + (node.classList.contains("is-open") ? 120 : 24) };
      }
      return null;
    }
  });
  await h.settle();
  h.click(23800);
  await h.settle();

  const railIdentity = () => h.rails().querySelectorAll(".nifty-break-even__label").map((label) => ({
    exact: label.dataset.exact,
    top: label.parent.style.top
  }));
  const assertClearsCards = () => {
    const cards = h.strategyRails().querySelectorAll(".nifty-strategy__card")
      .filter((card) => !card.hidden);
    const left = Math.min(...cards.map((card) => card.getBoundingClientRect().left));
    h.rails().querySelectorAll(".nifty-break-even__label").forEach((label) => {
      const right = 1600 - Number.parseFloat(label.style.right);
      assert.ok(right <= left - 6, `quick BE right ${right} must clear strategy card left ${left}`);
    });
  };
  const before = railIdentity();
  assertClearsCards();

  h.strategyRails().querySelector(".nifty-strategy__label")
    .dispatch("click", { stopPropagation() {} });
  await h.settle();
  assert.ok(h.strategyRails().querySelectorAll(".nifty-strategy__card")
    .some((card) => card.classList.contains("is-open")));
  assertClearsCards();
  assert.deepEqual(railIdentity(), before, "open/collapse changes horizontal clearance only");
});

test("shared rail header keeps black surface on token only and plain BE text outside it", () => {
  const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");
  const labelRule = css.match(/\.nifty-strategy__card\.is-collapsed\.is-rail-header \.nifty-strategy__label\s*\{([^}]+)\}/)?.[1] || "";
  const tokenRule = css.match(/\.nifty-strategy__rail-token\s*\{([^}]+)\}/)?.[1] || "";
  const textRule = css.match(/(?:^|\})\s*\.nifty-strategy__rail-text\s*\{([^}]+)\}/)?.[1] || "";
  const callTokenRule = css.match(/\.nifty-strategy__card\.is-call \.nifty-strategy__rail-token\s*\{([^}]+)\}/)?.[1] || "";
  const putTokenRule = css.match(/\.nifty-strategy__card\.is-put \.nifty-strategy__rail-token\s*\{([^}]+)\}/)?.[1] || "";

  assert.match(labelRule, /border:\s*0/,
    "shared label must not draw one long bordered pill");
  assert.match(labelRule, /background:\s*transparent/,
    "shared label must not draw one long black pill");
  assert.match(labelRule, /color:\s*var\(--theme-ink\)/,
    "BE text follows chart theme outside token");
  assert.match(tokenRule, /border:\s*1px solid var\(--plan-line\)/);
  assert.match(tokenRule, /border-radius:\s*3px/);
  assert.match(tokenRule, /background:\s*var\(--plan-surface\)/,
    "only T token owns black surface");
  assert.match(tokenRule, /color:\s*var\(--plan-ink\)/);
  assert.match(textRule, /color:\s*var\(--theme-ink\)/);
  assert.match(callTokenRule, /border-bottom-color:\s*var\(--ladder-buy\)/);
  assert.match(putTokenRule, /border-bottom-color:\s*var\(--ladder-sell\)/);
});

test("matching saved strategy keeps separate token and never rewrites quick break-even header", async () => {
  const book = structuredClone(chartStrategyBook());
  book.legs["leg-s1"] = {
    ...book.legs["leg-s1"],
    premium: 120,
    callSnapshot: 120
  };
  const h = chartStrategyHarness(book);
  await h.settle();

  h.click(23800);
  await h.settle();

  const callLabel = h.rails().querySelectorAll(".nifty-break-even__label")
    .find((node) => node.classList.contains("is-call"));
  assert.equal(callLabel.textContent, "CALL BE 23,920 · SELL BELOW ↓");
  assert.equal(callLabel.querySelector(".nifty-strategy__card"), null);
  assert.equal(h.strategyRails().querySelectorAll(".nifty-strategy__card")
    .filter((node) => node.classList.contains("is-strategy")).length, 1);
});

test("light warning surfaces use white text while ATM lot badge stays black with white text", () => {
  const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");
  const light = css.match(/#nifty-axis-ladder\[data-theme="light"\]\s*\{([^}]+)\}/)?.[1] || "";
  assert.match(light, /--ladder-atm-ink:\s*#ffffff/);
  assert.match(light, /--ladder-selected-ink:\s*#ffffff/);
  assert.match(css, /--ladder-atm-badge:\s*#111113/);
  assert.match(css, /--ladder-atm-badge-ink:\s*#f4f4f5/);
});

test("manual persistence crosses one atomic service-worker operation boundary", () => {
  const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  assert.match(source, /MUTATE_MANUAL_STRATEGY/);
  assert.doesNotMatch(source, /MUTATE_MANUAL_PLANS/);
  assert.doesNotMatch(source, /chrome\.storage\.local\.set\(\{\s*\[manualPlanApi\.STORAGE_KEY\]/);
  assert.doesNotMatch(source, /manualPersistTail/);
});

test("selected strike uses a solid ARB Desk warning fill without an outline, including ATM", () => {
  const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");
  const selected = css.match(/\.nifty-axis-ladder__row\.is-selected\s*\{([^}]+)\}/)?.[1] || "";
  const selectedArrow = css.match(/\.nifty-axis-ladder__row\.is-selected::after\s*\{([^}]+)\}/)?.[1] || "";

  assert.match(css, /--ladder-selected:\s*var\(--theme-warn\)/);
  assert.match(css, /--ladder-selected-ink:\s*var\(--theme-contrast-ink\)/);
  assert.match(selected, /background:\s*var\(--ladder-selected\)/);
  assert.match(selected, /color:\s*var\(--ladder-selected-ink\)/);
  assert.match(selected, /border-color:\s*var\(--ladder-selected\)/);
  assert.match(selected, /outline:\s*none/);
  assert.match(selectedArrow, /border-left-color:\s*var\(--ladder-selected\)/);
  assert.doesNotMatch(css, /\.nifty-axis-ladder__row\.is-selected[^\{]*\{[^}]*outline:\s*2px/);
});

test("selected saved faces keep warning selection surface plus Buy or Sell direction cue", () => {
  const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");
  const selectedEntry = css.match(/\.nifty-axis-ladder__row\.is-selected\.is-manual-entry\s*\{([^}]+)\}/)?.[1] || "";
  const selectedBuy = css.match(/\.nifty-axis-ladder__row\.is-selected\.is-manual-entry\.is-buy\s*\{([^}]+)\}/)?.[1] || "";
  const selectedSell = css.match(/\.nifty-axis-ladder__row\.is-selected\.is-manual-entry\.is-sell\s*\{([^}]+)\}/)?.[1] || "";
  const selectedEntryArrow = css.match(/\.nifty-axis-ladder__row\.is-selected\.is-manual-entry::after\s*\{([^}]+)\}/)?.[1] || "";

  assert.match(selectedEntry, /border-color:\s*var\(--ladder-selected\)/);
  assert.match(selectedEntry, /background:\s*var\(--ladder-selected\)/);
  assert.match(selectedEntry, /color:\s*var\(--ladder-selected-ink\)/);
  assert.match(selectedEntryArrow, /border-left-color:\s*var\(--ladder-selected\)/);
  assert.match(selectedBuy, /border-bottom:\s*3px solid var\(--ladder-buy\)/,
    "Buy direction remains visible without replacing selected fill");
  assert.match(selectedSell, /border-bottom:\s*3px solid var\(--ladder-sell\)/,
    "Sell direction remains visible without replacing selected fill");
  assert.match(selectedBuy, /padding-bottom:\s*2px/,
    "thicker direction stripe must not change fixed row height");
  assert.match(selectedSell, /padding-bottom:\s*2px/,
    "thicker direction stripe must not change fixed row height");
});

test("risk labels wire the cleared right edge and translate their full width left", () => {
  const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");
  assert.match(source, /label\.style\.left = `\$\{line\.labelRight - line\.left\}px`/);
  assert.doesNotMatch(source, /line\.labelX/);
  assert.match(css, /\.nifty-seller-risk__label\s*\{[\s\S]*?transform:\s*translateX\(-100%\)/);
});

test("whole-trade profit and loss bands receive distinct production DOM classes and CSS treatments", () => {
  assert.equal(api.riskBandClassName({ layer: "whole-trade", kind: "profit" }),
    "nifty-seller-risk__band is-whole-trade is-profit");
  assert.equal(api.riskBandClassName({ layer: "whole-trade", kind: "loss" }),
    "nifty-seller-risk__band is-whole-trade is-loss");

  const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");
  const profit = css.match(/\.nifty-seller-risk__band\.is-whole-trade\.is-profit\s*\{([^}]+)\}/)?.[1];
  const loss = css.match(/\.nifty-seller-risk__band\.is-whole-trade\.is-loss\s*\{([^}]+)\}/)?.[1];
  assert.ok(profit, "whole-trade profit CSS exists");
  assert.ok(loss, "whole-trade loss CSS exists");
  assert.notEqual(profit.trim(), loss.trim(), "profit and loss cannot remain visually identical");
});

test("every non-axis lane draws a full connector back to the exact right-axis anchor", () => {
  const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");
  assert.match(source, /--nifty-connector-width", `\$\{lane \* laneOffset\}px`/);
  assert.match(source, /element\.style\.right = `\$\{baseRight \+ lane \* laneOffset\}px`/);
  assert.match(source, /element\.style\.top = `\$\{row\.y\}px`/);
  assert.match(css, /\[data-lane\]:not\(\[data-lane="0"\]\)::before/);
  assert.match(css, /width:\s*var\(--nifty-connector-width\)/);
  assert.match(css, /\[data-lane\]:not\(\[data-lane="0"\]\)::after/);
  assert.match(css, /right:\s*calc\(-1 \* \(var\(--nifty-connector-width\) \+ 7px\)\)/);
  assert.doesNotMatch(css, /\[data-lane="1"\]/);
});

test("stopping clears the timeframe debounce handle so re-enable can detect changes", () => {
  const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  const stopBody = source.match(/function stop\(\) \{([\s\S]*?)\n  \}/)?.[1] || "";
  assert.match(stopBody, /clearTimeout\(timeframeTimer\);\s*timeframeTimer = null;/);
});

test("browser lifecycle never places old membership on a changed timeframe axis", () => {
  const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  const placement = source.match(/function scheduleAxisPlacement\(\) \{([\s\S]*?)\n  \}/)?.[1] || "";
  assert.match(placement, /timeframeApi\.timeframeKey/);
  assert.match(placement, /membership\.timeframe/);
  assert.match(placement, /rebuildCurrent\(false\)/);
});

test("timeframe detection conceals old rows before delayed recalibration", () => {
  const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  const check = source.match(/function scheduleTimeframeCheck\(\) \{([\s\S]*?)\n  \}/)?.[1] || "";
  assert.match(check, /nextTimeframe !== membership\.timeframe/);
  assert.match(check, /concealRows\("CALIBRATING"\)/);
  assert.match(check, /else await controller\.place\(\)/, "A→B→A must restore concealed committed rows");
});

test("placement retry never fetches option numbers when membership is missing", () => {
  const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  const listener = source.match(/chrome\.runtime\.onMessage[\s\S]*?return true;\n  \}\);/)?.[0] || "";
  assert.match(listener, /if \(!controller\?\.membership\(\)\)/);
  assert.match(listener, /Press refresh option numbers first/);
  assert.doesNotMatch(listener, /if \(!controller\?\.membership\(\)\)[\s\S]*?rebuildCurrent/);
});

test("axis capture returns timestamp belonging to submitted candidates", () => {
  const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  const capture = source.match(/async function captureAxisScale[\s\S]*?\n  \}/)?.[0] || "";
  assert.match(capture, /acceptedObservedAt/);
  assert.match(capture, /observedAt: acceptedObservedAt/);
  assert.doesNotMatch(capture, /observedAt: axisObservationAt\(\)/);
  assert.doesNotMatch(capture, /Date\.now\(\) - observedAt/);
});

test("TradingView status decorator loads before content and stays independent from ladder", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "manifest.json"), "utf8"));
  const scripts = manifest.content_scripts.find((entry) => entry.js.includes("content.js")).js;
  assert.ok(scripts.indexOf("tradingview-live-badge.js") < scripts.indexOf("content.js"));
  const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  assert.match(source, /NiftyTradingViewLiveBadge/);
  assert.match(source, /stopLiveBadgeDecorator/);
  assert.doesNotMatch(source, /if \(!.*LiveBadge.*\).*start\(/);
});

test("native status badge uses active ARB Desk accent or danger fill with fixed light text", () => {
  const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");
  assert.match(css, /\.nifty-tv-status-badge\.is-live\s*\{[\s\S]*?background:\s*var\(--theme-accent\)/i);
  assert.match(css, /\.nifty-tv-status-badge\.is-offline\s*\{[\s\S]*?background:\s*var\(--theme-danger\)/i);
  assert.match(css, /\.nifty-tv-status-badge\s*\{[\s\S]*?color:\s*var\(--theme-status-ink\)/i);
});

test("native status badge CSS preserves TradingView box and text metrics", () => {
  const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");
  const declarationsFor = (selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const block = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "i"));
    assert.ok(block, `${selector} declaration block exists`);
    return block[1].split(";")
      .map((declaration) => declaration.trim())
      .filter(Boolean)
      .map((declaration) => {
        const separator = declaration.indexOf(":");
        assert.notEqual(separator, -1, `${selector} declaration is valid`);
        return {
          property: declaration.slice(0, separator).trim().toLowerCase(),
          value: declaration.slice(separator + 1).trim().toLowerCase()
        };
      });
  };
  const base = declarationsFor(".nifty-tv-status-badge");
  const live = declarationsFor(".nifty-tv-status-badge.is-live");
  const offline = declarationsFor(".nifty-tv-status-badge.is-offline");
  const forbiddenMetric = /^(?:border(?:-.+)?|padding(?:-.+)?|(?:min-|max-)?(?:width|height)|font-weight|font-size|line-height|position|pointer-events)$/;

  assert.equal(base.some(({ property }) => forbiddenMetric.test(property)), false);
  assert.deepEqual(base, [{ property: "color", value: "var(--theme-status-ink) !important" }]);
  assert.deepEqual(live, [{ property: "background", value: "var(--theme-accent) !important" }]);
  assert.deepEqual(offline, [{ property: "background", value: "var(--theme-danger) !important" }]);
});

test("live badge installs once outside ladder state, isolates failure, and stops on unload", () => {
  const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  let installCalls = 0;
  let stopCalls = 0;
  let unload;
  const run = (liveBadge) => {
    let storageRead = false;
    const sandbox = {
      NiftyTradingViewLiveBadge: liveBadge,
      NiftyManualPlan: require("./manual-plan.js"),
      NiftySellerViewIdentity: { normalizeStoredRiskViews(value) { return value; } },
      MutationObserver: class {},
      chrome: {
        runtime: {},
        storage: {
          local: { get(_defaults, callback) { storageRead = true; callback({ enabled: false }); } },
          onChanged: { addListener() {} }
        }
      },
      document: { documentElement: {} },
      addEventListener(type, listener) { if (type === "unload") unload = listener; },
      setTimeout() { return 1; },
      clearTimeout() {},
      console
    };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(source, sandbox);
    return storageRead;
  };

  assert.equal(run({ install() { installCalls += 1; return () => { stopCalls += 1; }; } }), true);
  assert.equal(installCalls, 1);
  assert.equal(typeof unload, "function");
  unload();
  assert.equal(stopCalls, 1);
  assert.equal(run({ install() { throw new Error("decorator unavailable"); } }), true);
});

test("unsafe viewport placement reports axis failure without fixed-count zoom guidance", () => {
  assert.equal(api.priceScaleFailure("overlap"), "VISIBLE STRIKES CANNOT BE PLACED SAFELY");
  assert.equal(api.priceScaleFailure("outside"), "NO OPTION STRIKES ON VISIBLE PRICE GRID");
  assert.throws(() => api.priceScaleFailure("unknown"), /Unknown price-scale failure/);
});

test("breakeven module loads before content and selection remains explicit", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "manifest.json"), "utf8"));
  const scripts = manifest.content_scripts.find((entry) => entry.js.includes("content.js")).js;
  assert.ok(scripts.indexOf("breakeven-rails.js") < scripts.indexOf("content.js"));

  const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  assert.match(source, /NiftyBreakEvenRails/);
  assert.match(source, /role", "button"/);
  assert.match(source, /aria-pressed/);
  assert.doesNotMatch(source, /aria-selected/);
  assert.match(source, /clearBreakEvenSelection/);
  assert.doesNotMatch(source, /autoSelectBreakEven|persistedBreakEven/);
});

test("rows alone accept input while fullscreen overlay remains pointer-transparent", () => {
  const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");
  assert.match(css, /#nifty-axis-ladder\s*\{[\s\S]*?pointer-events:\s*none/);
  assert.match(css, /\.nifty-axis-ladder__row\s*\{[\s\S]*?pointer-events:\s*auto/);
});

test("strategy ownership choices always require explicit existing or new destination", () => {
  let book = strategyStore.emptyBook();
  book = strategyStore.applyCommand(book, {
    id: "create-s1", type: "CREATE_STRATEGY", strategyId: "s1", versionId: "s1-v1",
    label: "T1", instrumentKey: "NSE_INDEX|NIFTY", underlying: "NIFTY", expiry: "2026-08-25"
  }, "2026-07-31T10:00:00.000Z");
  assert.deepEqual(api.strategyOwnershipChoices(book, "NSE_INDEX|NIFTY", "2026-08-25"), [
    { kind: "EXISTING", strategyId: "s1", label: "ADD TO T1" },
    { kind: "CREATE_NEW", label: "CREATE NEW STRATEGY" }
  ]);
  assert.deepEqual(api.strategyOwnershipChoices(book, "CME|ES", "2026-09-18"), [
    { kind: "CREATE_NEW", label: "CREATE NEW STRATEGY" }
  ]);
});

test("strategy chart integration keeps label and square as separate actions", () => {
  const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  assert.match(source, /className = "nifty-strategy__label"/);
  assert.match(source, /className = "nifty-strategy__selector"/);
  assert.match(source, /strategyChartController\.label\(model\.strategyId\)/);
  assert.match(source, /strategyChartController\.square\(model\.strategyId\)/);
  assert.doesNotMatch(source, /nifty-strategy[^\n]*dblclick/);
  assert.match(source, /addEventListener\("dblclick", handleLadderDoubleClick\)/);
});

test("strategy chart renders preview, Compare, edges, collisions, and lifecycle clear contracts", () => {
  const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  for (const token of [
    "nifty-strategy-rails", "nifty-strategy__edge", "nifty-strategy__connector",
    "nifty-strategy-preview", "COMBINED BE", "EXCLUDING UNKNOWN CHARGES",
    "clearStrategyPreview"
  ]) assert.match(source, new RegExp(token));
  assert.match(source, /strategyChartApi\.stackCards/);
  assert.match(source, /strategyChartApi\.projectBreakEven/);
  assert.match(source, /Compare/);
});

test("strategy chart CSS uses existing tokens and square selector in both themes", () => {
  const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");
  const strategyCss = css.slice(css.indexOf("#nifty-strategy-rails"));
  assert.match(strategyCss, /\.nifty-strategy__selector\s*\{[\s\S]*?width:\s*16px[\s\S]*?height:\s*16px/);
  assert.match(strategyCss, /\.nifty-strategy__selector\[aria-pressed="true"\][\s\S]*?var\(--pnl-profit\)/);
  assert.match(strategyCss, /#nifty-strategy-rails\s*\{[\s\S]*?z-index:\s*5/);
  assert.match(strategyCss, /\.nifty-strategy__rail,[\s\S]*?z-index:\s*1/);
  assert.match(strategyCss, /\.nifty-strategy__card\s*\{[\s\S]*?z-index:\s*3/);
  assert.match(strategyCss, /\.nifty-strategy__trade\.is-profit[\s\S]*?var\(--pnl-profit\)/);
  assert.match(strategyCss, /\.nifty-strategy__trade\.is-loss[\s\S]*?var\(--pnl-loss\)/);
  assert.doesNotMatch(strategyCss, /#[0-9a-f]{3,8}\b/i);
});

test("preview actions read as white outlined buttons and combined label keeps white text", () => {
  const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");
  const buttonRule = css.match(/\.nifty-strategy-preview button,[\s\S]*?\{([^}]+)\}/)?.[1] || "";
  const combinedRule = css.match(/\.nifty-strategy__card\.is-combined \.nifty-strategy__label\s*\{([^}]+)\}/)?.[1] || "";
  assert.match(buttonRule, /border:\s*1px solid var\(--plan-ink\)/);
  assert.match(buttonRule, /background:\s*transparent/);
  assert.match(buttonRule, /color:\s*var\(--plan-ink\)/);
  assert.match(combinedRule, /border-color:\s*var\(--theme-warn\)/);
  assert.match(combinedRule, /color:\s*var\(--plan-ink\)/);
});

test("chart save confirmation uses existing ARB Desk tokens and explicit destination copy", () => {
  const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");
  const chooserRule = css.match(/\.nifty-strategy-preview__save-chooser\s*\{([^}]+)\}/)?.[1] || "";
  assert.match(source, /save\.textContent = "Save"/);
  assert.match(source, /title\.textContent = "SAVE COMBINED AS"/);
  assert.match(source, /"CREATE NEW STRATEGY"/);
  assert.match(source, /`MERGE INTO \$\{destination\.label\}`/);
  assert.match(chooserRule, /background:\s*var\(--plan-surface\)/);
  assert.match(chooserRule, /color:\s*var\(--plan-ink\)/);
  assert.match(chooserRule, /border:\s*1px solid var\(--plan-line\)/);
  assert.doesNotMatch(chooserRule, /#[0-9a-f]{3,8}\b/i);
  assert.match(css, /\.nifty-strategy-preview button:focus-visible[\s\S]*?outline:\s*2px solid var\(--plan-ink\)/);
});

test("manual direct actions stay side by side with white Buy and Sell labels", () => {
  const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");
  const actions = css.match(/\.nifty-manual-editor__direct-actions\s*\{([^}]+)\}/)?.[1] || "";
  assert.match(actions, /display:\s*flex/);
  assert.match(actions, /gap:\s*2px/);
  assert.match(css, /\.nifty-manual-editor__action\[data-direction="BUY"\]\s*\{[^}]*background:\s*var\(--ladder-buy\)[^}]*color:\s*#ffffff/);
  assert.match(css, /\.nifty-manual-editor__action\[data-direction="SELL"\]\s*\{[^}]*background:\s*var\(--ladder-sell\)[^}]*color:\s*#ffffff/);
});

test("strategy ownership and preview controls keep readable plan contrast in light theme", () => {
  const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");
  assert.match(css,
    /\.nifty-strategy-preview button,[\s\S]*?background:\s*var\(--plan-surface\)[\s\S]*?color:\s*var\(--plan-ink\)/);
});

function harnessManualStrategyMutation(rawBook, rawPlans, mutation, at = "2026-08-05T10:00:00.000Z") {
  let book = strategyStore.normalizeBook(rawBook);
  let plans = manualPlan.normalizeStore(rawPlans);
  const marker = `manual:${mutation.id}`;
  const manualLeg = (entry, strategy) => strategyStore.normalizeLeg({
    ...entry,
    source: "MANUAL",
    instrumentKey: strategy.instrumentKey,
    underlying: strategy.underlying,
    charges: [],
    chargesComplete: false
  });

  if (mutation.type === "CREATE") {
    const entry = manualPlan.normalizeEntry(mutation.entry);
    assert.ok(entry, "atomic CREATE carries one valid manual entry");
    if (mutation.strategy.mode === "CREATE_NEW") {
      book = strategyStore.applyCommand(book, {
        id: `${marker}:strategy`,
        type: "CREATE_STRATEGY",
        strategyId: mutation.strategy.strategyId,
        versionId: `${marker}:strategy-version`,
        label: mutation.strategy.label,
        instrumentKey: mutation.strategy.instrumentKey,
        underlying: mutation.strategy.underlying,
        expiry: entry.expiry
      }, at);
    }
    const strategy = strategyStore.strategyById(book, mutation.strategy.strategyId);
    assert.ok(strategy, "atomic CREATE resolves exact strategy owner");
    book = strategyStore.applyCommand(book, {
      id: marker,
      type: "ADD_LEG",
      strategyId: strategy.id,
      versionId: `${marker}:version`,
      leg: manualLeg(entry, strategy)
    }, at);
    plans = manualPlan.upsertEntry(plans, entry);
    return { strategyBook: book, manualPlans: plans };
  }

  const stored = manualPlan.entryById(plans, mutation.entryId);
  const strategy = strategyStore.activeStrategyForLeg(book, mutation.entryId);
  assert.ok(stored && strategy, "atomic mutation resolves exact manual identity and owner");
  if (mutation.type === "EDIT") {
    const entry = manualPlan.normalizeEntry(mutation.entry);
    assert.ok(entry, "atomic EDIT carries one valid replacement entry");
    book = strategyStore.applyCommand(book, {
      id: marker,
      type: "EDIT_LEG",
      strategyId: strategy.id,
      versionId: `${marker}:version`,
      legId: mutation.entryId,
      replacementLeg: manualLeg(entry, strategy)
    }, at);
    plans = manualPlan.replaceEntry(plans, mutation.entryId, entry);
    return { strategyBook: book, manualPlans: plans };
  }

  assert.equal(mutation.type, "REMOVE");
  book = strategyStore.applyCommand(book, {
    id: marker,
    type: "REMOVE_LEG",
    strategyId: strategy.id,
    versionId: `${marker}:version`,
    legId: mutation.entryId
  }, at);
  if (!strategyStore.legsForStrategy(book, strategy.id).length) {
    book = strategyStore.applyCommand(book, {
      id: `${marker}:archive`,
      type: "ARCHIVE_STRATEGY",
      strategyId: strategy.id
    }, at);
  }
  plans = manualPlan.removeEntry(plans, stored.expiry, mutation.entryId);
  return { strategyBook: book, manualPlans: plans };
}

function createBreakEvenLifecycleHarness({
  plotRect = { left: 0, top: 0, right: 1200, bottom: 800 },
  invalidRows = {},
  manualEntries = [],
  rawManualPlans = null,
  storageSetError = null,
  deferStorage = false,
  deferManualStorageEvents = false,
  deferAxisCaptures: initiallyDeferAxisCaptures = false,
  deferFetches: initiallyDeferFetches = false,
  strategyMutationError = null,
  spot = 23767.45,
  chainLotSize = 65,
  omitChainLotSize = false,
  omitStoredChain = false,
  strategyBook = null,
  strategySupport = strategyBook !== null,
  brokerMarginEvidence = null,
  initialAxisPairs = null,
  elementBounds = null
} = {}) {
  const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  const nodesById = new Map();
  const roots = [];
  const storageListeners = [];
  const runtimeListeners = [];
  const timers = new Map();
  let nextTimerId = 1;
  let mutationCallback = null;
  let fetchCalls = 0;
  let refreshNumbers = null;
  let activeElement = null;
  const storageWrites = [];
  const manualMutationMessages = [];
  let localManualSetCalls = 0;
  const pendingStorageWrites = [];
  const pendingManualStorageEvents = [];
  const pendingAxisCaptures = [];
  const pendingFetches = [];
  let deferAxisCaptures = initiallyDeferAxisCaptures;
  let deferFetches = initiallyDeferFetches;
  let renderManualError = null;
  let manualRenderCalls = 0;
  const manualLevelInputs = [];
  let nextManualEntryId = 1;
  const railApi = require("./breakeven-rails.js");
  const manualPlanApi = require("./manual-plan.js");
  const manualPayoffApi = require("./manual-payoff.js");
  const manualInteractionApi = require("./manual-interaction.js");
  const manualUiApi = require("./manual-ui.js");
  const strategyPreviewApi = require("./strategy-preview.js");
  const strategyChartApi = require("./strategy-chart.js");
  const strategyMutationMessages = [];
  const initialManualPlans = rawManualPlans || manualEntries.reduce(
    (store, entry) => manualPlanApi.upsertEntry(store, entry),
    manualPlanApi.emptyStore()
  );
  let storedStrategyBook = strategyStore.normalizeBook(strategyBook || strategyStore.emptyBook());
  if (strategySupport && strategyBook === null && manualPlanApi.entriesFor(initialManualPlans, "2026-08-25").length) {
    storedStrategyBook = strategyStore.migrateManualPlans(storedStrategyBook, initialManualPlans, {
      instrumentKey: "NSE_DLY:NIFTY",
      underlying: "NIFTY",
      at: "2026-08-05T10:00:00.000Z"
    });
  }
  let storedManualPlans = initialManualPlans;
  let manualMutationTail = Promise.resolve();
  let axisPairs = initialAxisPairs || Array.from({ length: 21 }, (_, index) => ({
    price: 23450 + index * 50,
    y: 210 - index * 10
  }));
  let project = railApi.project;

  function dispatchStorage(changes) {
    storageListeners.forEach((listener) => listener(changes, "local"));
  }

  function eventTarget() {
    const listeners = new Map();
    return {
      addEventListener(type, listener) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(listener);
      },
      removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
      dispatch(type, event) { listeners.get(type)?.forEach((listener) => listener(event)); },
      listenerCount(type) { return listeners.get(type)?.size || 0; }
    };
  }

  const globalEvents = eventTarget();
  const location = { href: "https://www.tradingview.com/chart/initial/" };

  function makeNode(tagName = "div") {
    const events = eventTarget();
    const classes = new Set();
    const attributes = new Map();
    const node = {
      ...events,
      tagName,
      children: [],
      dataset: {},
      hidden: false,
      id: "",
      parent: null,
      style: { setProperty() {} },
      classList: {
        add(...values) { values.forEach((value) => classes.add(value)); },
        contains(value) { return classes.has(value); },
        remove(...values) { values.forEach((value) => classes.delete(value)); },
        toggle(value, force) {
          const enabled = force === undefined ? !classes.has(value) : Boolean(force);
          if (enabled) classes.add(value); else classes.delete(value);
          return enabled;
        }
      },
      append(...children) {
        children.forEach((child) => {
          child.parent = node;
          node.children.push(child);
          if (child.id) nodesById.set(child.id, child);
        });
      },
      replaceChildren(...children) {
        node.children.forEach((child) => { child.parent = null; });
        node.children = [];
        node.append(...children);
      },
      setAttribute(name, value) { attributes.set(name, String(value)); },
      getAttribute(name) { return attributes.get(name) || null; },
      closest(selector) {
        if (/^\.[\w-]+(?:\.[\w-]+)*$/.test(selector)) {
          const names = selector.slice(1).split(".");
          if (names.every((name) => classes.has(name))) return node;
        }
        if (selector === ".nifty-axis-ladder__row" && classes.has("nifty-axis-ladder__row")) return node;
        if (selector === ".nifty-manual-editor" && classes.has("nifty-manual-editor")) return node;
        return node.parent?.closest(selector) || null;
      },
      querySelector(selector) { return node.querySelectorAll(selector)[0] || null; },
      querySelectorAll(selector) {
        const descendants = node.children.flatMap((child) => [child, ...child.querySelectorAll("*")]);
        if (selector === "*") return descendants;
        if (selector === ".nifty-axis-ladder__row") return descendants.filter((child) => child.classList.contains("nifty-axis-ladder__row"));
        if (selector.startsWith(".nifty-axis-ladder__row[data-strike=\"")) {
          const strike = selector.match(/data-strike="(\d+)"/)?.[1];
          return descendants.filter((child) => child.classList.contains("nifty-axis-ladder__row") && child.dataset.strike === strike);
        }
        if (selector.startsWith(".")) return descendants.filter((child) => child.classList.contains(selector.slice(1)));
        if (selector.startsWith("#")) return descendants.filter((child) => child.id === selector.slice(1));
        return [];
      },
      remove() {
        if (node.id) nodesById.delete(node.id);
        if (node.parent) node.parent.children = node.parent.children.filter((child) => child !== node);
        node.parent = null;
      },
      focus() { activeElement = node; },
      getBoundingClientRect() {
        const override = typeof elementBounds === "function" ? elementBounds(node) : null;
        if (override) {
          return {
            ...override,
            width: Number.isFinite(Number(override.width))
              ? Number(override.width)
              : Number(override.right) - Number(override.left),
            height: Number.isFinite(Number(override.height))
              ? Number(override.height)
              : Number(override.bottom) - Number(override.top)
          };
        }
        return { left: 100, top: 20, right: 340, bottom: 40, width: 240, height: 20 };
      }
    };
    Object.defineProperty(node, "className", {
      get() { return [...classes].join(" "); },
      set(value) {
        classes.clear();
        String(value).split(/\s+/).filter(Boolean).forEach((name) => classes.add(name));
      }
    });
    let ownText = "";
    Object.defineProperty(node, "textContent", {
      get() { return ownText + node.children.map((child) => child.textContent).join(""); },
      set(value) { ownText = String(value ?? ""); }
    });
    return node;
  }

  const documentEvents = eventTarget();
  const documentElement = makeNode("html");
  const canvas = makeNode("canvas");
  let chartLabel = "Chart for NSE_DLY:NIFTY, 1 hour";
  canvas.getAttribute = (name) => name === "aria-label" ? chartLabel : null;
  canvas.getBoundingClientRect = () => ({
    ...plotRect,
    width: plotRect.right - plotRect.left,
    height: plotRect.bottom - plotRect.top
  });
  const document = {
    ...documentEvents,
    documentElement,
    get activeElement() { return activeElement; },
    createElement(tagName) {
      const node = makeNode(tagName);
      roots.push(node);
      return node;
    },
    getElementById(id) { return nodesById.get(id) || null; },
    querySelector(selector) { return selector.startsWith("canvas[aria-label") ? canvas : null; }
  };
  const snapshot = {
    version: 1,
    updatedAt: new Date().toISOString(),
    expiry: "2026-08-25",
    ...(omitChainLotSize ? {} : { lotSize: chainLotSize }),
    spot,
    rows: Array.from({ length: 41 }, (_, index) => {
      const strike = 22800 + index * 50;
      return { strike, call: 100 + index, put: 200 + index, ...(invalidRows[strike] || {}) };
    })
  };

  function axisCaptureResult() {
    return {
      ok: true,
      gridGapPx: 10,
      axisPairs
    };
  }

  function optionChainPayload(overrides = refreshNumbers) {
    const byStrike = overrides?.byStrike || {};
    const hasLegacyQuote = Object.prototype.hasOwnProperty.call(overrides || {}, "call")
      || Object.prototype.hasOwnProperty.call(overrides || {}, "put");
    const rows = snapshot.rows.map((row) => ({
      ...row,
      ...(byStrike[row.strike] || (row.strike === 24450 && hasLegacyQuote ? {
        call: overrides.call,
        put: overrides.put
      } : {}))
    }));
    return {
      ...(Object.prototype.hasOwnProperty.call(overrides || {}, "lotSize")
        ? { lotSize: overrides.lotSize }
        : Object.prototype.hasOwnProperty.call(snapshot, "lotSize") ? { lotSize: snapshot.lotSize } : {}),
      spot: Number.isFinite(Number(overrides?.spot)) ? Number(overrides.spot) : snapshot.spot,
      rows
    };
  }

  const sandbox = {
    AbortController,
    MutationObserver: class {
      constructor(callback) { mutationCallback = callback; }
      observe() {}
      disconnect() {}
    },
    NiftyBreakEvenRails: {
      calculate: railApi.calculate,
      createSelectionController: railApi.createSelectionController,
      layoutDecorations(...args) { return railApi.layoutDecorations(...args); },
      project(...args) { return project(...args); }
    },
    NiftyManualPlan: manualPlanApi,
    NiftyManualPayoff: {
      ...manualPayoffApi,
      levels(entries, ...args) {
        manualLevelInputs.push(structuredClone(entries));
        return manualPayoffApi.levels(entries, ...args);
      }
    },
    NiftyManualInteraction: manualInteractionApi,
    NiftyManualUi: {
      ...manualUiApi,
      renderRow(...args) {
        manualRenderCalls += 1;
        if (renderManualError) throw renderManualError;
        return manualUiApi.renderRow(...args);
      }
    },
    ...(strategySupport ? {
      OptionsStrategyStore: strategyStore,
      OptionsStrategyPreview: strategyPreviewApi,
      OptionsStrategyChart: strategyChartApi,
      OptionsStrategyPanel: require("./strategy-panel.js"),
      OptionsMarginEvidence: require("./margin-evidence.js")
    } : {}),
    NiftyRiskOverlay: require("./risk-overlay.js"),
    NiftySellerViewIdentity: viewIdentity,
    NiftyTimeframeLadder: require("./timeframe-ladder.js"),
    chrome: {
      runtime: {
        sendMessage: async (message) => {
          if (message?.type === "MIGRATE_MANUAL_PLANS" && strategySupport) {
            storedStrategyBook = strategyStore.migrateManualPlans(storedStrategyBook, storedManualPlans, {
              instrumentKey: message.instrumentKey,
              underlying: message.underlying,
              at: message.at
            });
            return { ok: true, strategyBook: storedStrategyBook };
          }
          if (message?.type === "MUTATE_STRATEGY_BOOK" && strategySupport) {
            strategyMutationMessages.push(message.command);
            if (strategyMutationError) return { ok: false, error: strategyMutationError.message };
            storedStrategyBook = strategyStore.applyCommand(storedStrategyBook, message.command);
            dispatchStorage({ strategyBook: { newValue: storedStrategyBook } });
            return { ok: true, strategyBook: storedStrategyBook };
          }
          if (message?.type === "MUTATE_MANUAL_STRATEGY" && strategySupport) {
            manualMutationMessages.push(message.mutation);
            const commit = async () => {
              const next = harnessManualStrategyMutation(
                storedStrategyBook,
                storedManualPlans,
                message.mutation
              );
              storageWrites.push({
                [manualPlanApi.STORAGE_KEY]: next.manualPlans,
                [strategyStore.STORAGE_KEY]: next.strategyBook
              });
              if (deferStorage) {
                await new Promise((resolve) => pendingStorageWrites.push({ value: next, resolve }));
              }
              if (storageSetError) throw storageSetError;
              const oldManualPlans = storedManualPlans;
              const oldStrategyBook = storedStrategyBook;
              storedManualPlans = next.manualPlans;
              storedStrategyBook = next.strategyBook;
              const changes = {
                [manualPlanApi.STORAGE_KEY]: { oldValue: oldManualPlans, newValue: storedManualPlans },
                [strategyStore.STORAGE_KEY]: { oldValue: oldStrategyBook, newValue: storedStrategyBook }
              };
              if (deferManualStorageEvents) pendingManualStorageEvents.push(changes);
              else dispatchStorage(changes);
              return { ok: true, manualPlans: storedManualPlans, strategyBook: storedStrategyBook };
            };
            const result = manualMutationTail.then(commit, commit);
            manualMutationTail = result.catch(() => {});
            try {
              return await result;
            } catch (error) {
              return { ok: false, error: error?.message || "Manual strategy mutation failed." };
            }
          }
          if (message?.type === "MUTATE_MANUAL_PLANS") {
            manualMutationMessages.push(message.mutation);
            const commit = async () => {
              const next = message.mutation?.type === "upsert"
                ? manualPlanApi.upsertEntry(storedManualPlans, message.mutation.entry)
                : manualPlanApi.removeEntry(
                  storedManualPlans,
                  message.mutation?.expiry,
                  message.mutation?.entryId
                );
              storageWrites.push({ [manualPlanApi.STORAGE_KEY]: next });
              if (deferStorage) {
                await new Promise((resolve) => pendingStorageWrites.push({ value: next, resolve }));
              }
              if (storageSetError) throw storageSetError;
              const oldValue = storedManualPlans;
              storedManualPlans = next;
              const changes = {
                [manualPlanApi.STORAGE_KEY]: {
                  oldValue,
                  newValue: storedManualPlans
                }
              };
              if (deferManualStorageEvents) pendingManualStorageEvents.push(changes);
              else dispatchStorage(changes);
              return { ok: true, manualPlans: next };
            };
            const result = manualMutationTail.then(commit, commit);
            manualMutationTail = result.catch(() => {});
            try {
              return await result;
            } catch (error) {
              return { ok: false, error: error?.message || "Manual plan mutation failed." };
            }
          }
          if (message?.type === "FETCH_NIFTY_CHAIN") {
            fetchCalls += 1;
            if (deferFetches) {
              return new Promise((resolve) => pendingFetches.push({ resolve }));
            }
            return { ok: true, chain: optionChainPayload() };
          }
          if (deferAxisCaptures) {
            return new Promise((resolve) => pendingAxisCaptures.push(resolve));
          }
          return axisCaptureResult();
        },
        onMessage: { addListener(listener) { runtimeListeners.push(listener); } }
      },
      storage: {
        local: {
          get(_defaults, callback) {
            callback({
              enabled: true,
              expiry: snapshot.expiry,
              manualPlans: initialManualPlans,
              ...(omitStoredChain ? {} : {
                sellerSafetyChain: snapshot,
                sellerSafetyChainsByExpiry: { [snapshot.expiry]: snapshot }
              }),
              ...(strategySupport ? { strategyBook: storedStrategyBook } : {}),
              ...(brokerMarginEvidence ? { brokerMarginEvidence } : {})
            });
          },
          async set(value) {
            storageWrites.push(value);
            if (value[manualPlanApi.STORAGE_KEY]) localManualSetCalls += 1;
            if (deferStorage) {
              await new Promise((resolve) => pendingStorageWrites.push({ value, resolve }));
            }
            if (storageSetError) throw storageSetError;
            if (value[manualPlanApi.STORAGE_KEY]) {
              const oldValue = storedManualPlans;
              storedManualPlans = value[manualPlanApi.STORAGE_KEY];
              const changes = {
                [manualPlanApi.STORAGE_KEY]: {
                  oldValue,
                  newValue: storedManualPlans
                }
              };
              if (deferManualStorageEvents) pendingManualStorageEvents.push(changes);
              else dispatchStorage(changes);
            }
          }
        },
        onChanged: { addListener(listener) { storageListeners.push(listener); } }
      }
    },
    document,
    setTimeout(callback, delay) {
      const id = nextTimerId++;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    window: { innerWidth: 1600, innerHeight: 900 },
    crypto: { randomUUID() { return `new-manual-entry-${nextManualEntryId++}`; } },
    location,
    ...globalEvents,
    console
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox);

  async function settle() {
    for (let index = 0; index < 8; index += 1) await new Promise(setImmediate);
  }

  function flushClickTimer() {
    const timer = [...timers.entries()].find(([, entry]) => entry.delay === 240);
    if (timer) {
      timers.delete(timer[0]);
      timer[1].callback();
    }
  }

  function requestOptionNumberRefresh(values) {
    refreshNumbers = values;
    return new Promise((resolve) => {
      assert.equal(runtimeListeners[0]({ type: "REFRESH_OPTION_NUMBERS" }, null, resolve), true);
    });
  }

  return {
    document,
    roots,
    runtimeListeners,
    rails() { return document.getElementById("nifty-break-even-rails"); },
    manualRails() { return document.getElementById("nifty-manual-plan-rails"); },
    manualRailLabels() { return this.manualRails()?.children.map((node) => node.textContent) || []; },
    editor(strike) {
      const root = document.getElementById("nifty-axis-ladder");
      return root?.querySelectorAll(".nifty-manual-editor").find((editor) => {
        const owner = editor.parent?.closest?.(".nifty-axis-ladder__row");
        return Number(editor.dataset.strike || owner?.dataset?.strike) === Number(strike);
      }) || null;
    },
    manualEntries() { return manualPlanApi.entriesFor(storedManualPlans, snapshot.expiry); },
    lastManualLevelInput() { return manualLevelInputs.at(-1) || []; },
    strategyBook() { return storedStrategyBook; },
    invalidManualEntries() { return manualPlanApi.invalidEntries(storedManualPlans); },
    storageSetCalls() { return storageWrites.length; },
    manualMutationMessages() { return manualMutationMessages.slice(); },
    strategyMutationMessages() { return strategyMutationMessages.slice(); },
    strategyRails() { return document.getElementById("nifty-strategy-rails"); },
    localManualSetCalls() { return localManualSetCalls; },
    lastManualPlanWrite() { return storageWrites.at(-1)?.[manualPlanApi.STORAGE_KEY] || null; },
    pendingStorageWriteCount() { return pendingStorageWrites.length; },
    pendingManualStorageEventCount() { return pendingManualStorageEvents.length; },
    resolveStorageWrite() {
      const pending = pendingStorageWrites.shift();
      assert.ok(pending, "expected a pending storage write");
      pending.resolve();
    },
    resolveManualStorageEvent(index = 0) {
      const [pending] = pendingManualStorageEvents.splice(index, 1);
      assert.ok(pending, "expected a pending manual storage event");
      dispatchStorage(pending);
    },
    setRenderManualError(error) { renderManualError = error; },
    manualRenderCalls() { return manualRenderCalls; },
    fetchCalls() { return fetchCalls; },
    status() { return document.getElementById("nifty-axis-ladder")?.querySelector(".nifty-axis-ladder__status")?.textContent || null; },
    setAxisPairs(nextPairs) { axisPairs = nextPairs; },
    setProject(nextProject) { project = nextProject; },
    deferAxisCaptures() { deferAxisCaptures = true; },
    deferFetches() { deferFetches = true; },
    pendingAxisCaptureCount() { return pendingAxisCaptures.length; },
    pendingFetchCount() { return pendingFetches.length; },
    resolveAxisCapture(index = 0, result = axisCaptureResult()) {
      const [resolve] = pendingAxisCaptures.splice(index, 1);
      assert.ok(resolve, "expected a pending axis capture");
      resolve(result);
    },
    resolveLatestAxisCapture(result = axisCaptureResult()) {
      this.resolveAxisCapture(pendingAxisCaptures.length - 1, result);
    },
    resolveFetch(index = 0, overrides) {
      const [pending] = pendingFetches.splice(index, 1);
      assert.ok(pending, "expected a pending option-number fetch");
      pending.resolve({ ok: true, chain: optionChainPayload(overrides) });
    },
    rejectFetch(index = 0, error = new Error("Option chain unavailable.")) {
      const [pending] = pendingFetches.splice(index, 1);
      assert.ok(pending, "expected a pending option-number fetch");
      pending.resolve({ ok: false, error: error.message });
    },
    row(strike = 23750) {
      return document.getElementById("nifty-axis-ladder")
        ?.querySelector(`.nifty-axis-ladder__row[data-strike="${strike}"]`);
    },
    navigateSpa(nextUrl) {
      location.href = nextUrl;
      globalEvents.dispatch("popstate", {});
    },
    scheduleTimeframeChange(nextLabel) {
      chartLabel = nextLabel;
      mutationCallback?.([{ type: "attributes", attributeName: "aria-label" }]);
    },
    mutateUrl(nextUrl) {
      location.href = nextUrl;
      mutationCallback?.([{ type: "childList" }]);
    },
    pagehide(persisted = false) { globalEvents.dispatch("pagehide", { persisted }); },
    async navigateTo(nextLabel) {
      chartLabel = nextLabel;
      mutationCallback?.([{ type: "attributes", attributeName: "aria-label" }]);
      const timer = [...timers.entries()].reverse().find(([, entry]) => entry.delay === 250);
      assert.ok(timer, "timeframe navigation schedules its lifecycle check");
      timers.delete(timer[0]);
      await timer[1].callback();
      await settle();
    },
    click(strike = 23750) {
      const root = document.getElementById("nifty-axis-ladder");
      const row = root?.querySelector(`.nifty-axis-ladder__row[data-strike="${strike}"]`);
      assert.ok(row, "exact rendered row is available for selection");
      root.dispatch("click", { target: row });
      flushClickTimer();
      return row;
    },
    clickTarget(target) {
      document.getElementById("nifty-axis-ladder")?.dispatch("click", { target });
    },
    pointerThenClickTarget(target) {
      document.dispatch("pointerdown", { target });
      if (target?.closest?.(".nifty-axis-ladder__row")) {
        document.getElementById("nifty-axis-ladder")?.dispatch("click", {
          target,
          preventDefault() {},
          stopPropagation() {}
        });
      } else {
        target?.dispatch?.("click", {
          target,
          preventDefault() {},
          stopPropagation() {}
        });
      }
    },
    realDoubleClickTarget(target) {
      const root = document.getElementById("nifty-axis-ladder");
      const dispatchClick = () => {
        document.dispatch("pointerdown", { target });
        if (target?.closest?.(".nifty-axis-ladder__row")) {
          root?.dispatch("click", {
            target,
            preventDefault() {},
            stopPropagation() {}
          });
        } else {
          target?.dispatch?.("click", {
            target,
            preventDefault() {},
            stopPropagation() {}
          });
        }
      };
      dispatchClick();
      dispatchClick();
      root?.dispatch("dblclick", {
        target,
        preventDefault() {},
        stopPropagation() {}
      });
    },
    doubleClick(strike = 23750, optionType = "CALL") {
      const root = document.getElementById("nifty-axis-ladder");
      const row = this.row(strike);
      assert.ok(row, "exact rendered row is available for double click");
      const target = row.querySelectorAll(".nifty-axis-ladder__cell")
        .find((cell) => cell.dataset.optionType === optionType) || row;
      root.dispatch("click", { target });
      root.dispatch("dblclick", { target });
    },
    openEdit(entryId) {
      const entry = this.manualEntries().find((item) => item.id === entryId);
      assert.ok(entry, "saved manual entry is available for editing");
      this.click(entry.strike);
      this.doubleClick(entry.strike);
    },
    setEditorLots(lots) {
      let editor = [...this.roots].find((node) => node.classList.contains("nifty-manual-editor"));
      assert.ok(editor, "manual editor is open");
      let current = Number(editor.querySelector(".nifty-manual-editor__lots")?.textContent);
      while (current !== lots) {
        const label = current < lots ? "+" : "−";
        const step = editor.querySelectorAll(".nifty-manual-editor__step")
          .find((node) => node.textContent === label);
        assert.ok(step, `manual editor has ${label} lot control`);
        step.dispatch("click", {});
        editor = [...this.roots].find((node) => node.classList.contains("nifty-manual-editor") && node.parent);
        current = Number(editor.querySelector(".nifty-manual-editor__lots")?.textContent);
      }
    },
    cancelEditor() {
      const editor = [...this.roots].find((node) => node.classList.contains("nifty-manual-editor") && node.parent);
      assert.ok(editor, "manual editor is open");
      editor.querySelector(".nifty-manual-editor__close").dispatch("click", {});
    },
    flushClickTimer,
    select(strike = 23750) {
      const row = this.click(strike);
      assert.equal(row.classList.contains("is-selected"), true);
      assert.equal(row.getAttribute("aria-pressed"), "true");
      assert.equal(row.getAttribute("aria-selected"), null);
      return row;
    },
    retryPlacement() {
      return new Promise((resolve) => {
        assert.equal(runtimeListeners[0]({ type: "RETRY_LABEL_PLACEMENT" }, null, resolve), true);
      });
    },
    storage(change) {
      if (change?.strategyBook && Object.hasOwn(change.strategyBook, "newValue")) {
        storedStrategyBook = strategyStore.normalizeBook(change.strategyBook.newValue);
      }
      if (change?.manualPlans && Object.hasOwn(change.manualPlans, "newValue")) {
        storedManualPlans = manualPlanApi.normalizeStore(change.manualPlans.newValue);
      }
      dispatchStorage(change);
    },
    startRefreshOptionNumbers(values) { return requestOptionNumberRefresh(values); },
    async refreshOptionNumbers(values) {
      await requestOptionNumberRefresh(values);
      await settle();
    },
    settle
  };

}

test("show-ladder off/on restores manually refreshed rows without another chain request", async () => {
  const h = createBreakEvenLifecycleHarness({ omitStoredChain: true });
  await h.settle();
  assert.equal(Boolean(h.row()), false);

  await h.refreshOptionNumbers();
  assert.ok(h.row(), "manual refresh renders exact-axis rows");
  const fetchesAfterRefresh = h.fetchCalls();

  h.storage({ enabled: { oldValue: true, newValue: false } });
  await h.settle();
  assert.equal(Boolean(h.row()), false, "off removes chart ladder");

  h.storage({ enabled: { oldValue: false, newValue: true } });
  await h.settle();
  assert.ok(h.row(), "on restores rows from last safe in-memory chain");
  assert.equal(h.fetchCalls(), fetchesAfterRefresh, "toggle restore never performs an automatic chain request");
});

function chartStrategyBook() {
  const at = "2026-07-31T10:00:00.000Z";
  const identity = { instrumentKey: "NSE_DLY:NIFTY", underlying: "NIFTY", expiry: "2026-08-25" };
  const leg = (id, optionType) => ({
    id,
    source: "MANUAL",
    ...identity,
    strike: 23800,
    optionType,
    direction: "SELL",
    lots: 1,
    premium: 100,
    callSnapshot: 100,
    putSnapshot: 100,
    charges: [],
    chargesComplete: true,
    createdAt: at,
    updatedAt: at
  });
  let book = strategyStore.emptyBook();
  for (const [strategyId, label, optionType] of [["s1", "T1", "CALL"], ["s2", "T2", "PUT"]]) {
    book = strategyStore.applyCommand(book, {
      id: `create-${strategyId}`,
      type: "CREATE_STRATEGY",
      strategyId,
      versionId: `${strategyId}-v1`,
      label,
      ...identity
    }, at);
    book = strategyStore.applyCommand(book, {
      id: `add-${strategyId}`,
      type: "ADD_LEG",
      strategyId,
      versionId: `${strategyId}-v2`,
      leg: leg(`leg-${strategyId}`, optionType)
    }, at);
  }
  return book;
}

function chartStrategyBookWithSameStrikeBroker() {
  const at = "2026-07-31T10:02:00.000Z";
  return strategyStore.applyCommand(chartStrategyBook(), {
    id: "broker-sync-same-strike-identity",
    type: "SYNC_BROKER_POSITIONS",
    strategyId: "broker:BROKER:NFO:NIFTY:2026-08-25",
    versionId: "broker-same-strike-v1",
    snapshotId: "broker-same-strike-snapshot",
    label: "BROKER · AUG 25",
    instrumentKey: "BROKER:NFO:NIFTY",
    underlying: "NIFTY",
    expiry: "2026-08-25",
    positions: [{
      contractId: "NFO:NIFTY:2026-08-25:23800:PE",
      tradingsymbol: "NIFTY26AUG23800PE",
      exchange: "NFO",
      underlying: "NIFTY",
      expiry: "2026-08-25",
      strike: 23800,
      optionType: "PE",
      signedQuantity: 65,
      lotSize: 65,
      averagePrice: 84,
      lastPrice: 90,
      pnl: 390
    }]
  }, at);
}

function resyncSameStrikeBroker(book, snapshotId, at = "2026-07-31T10:03:00.000Z") {
  return strategyStore.applyCommand(book, {
    id: `broker-sync-${snapshotId}`,
    type: "SYNC_BROKER_POSITIONS",
    strategyId: "broker:BROKER:NFO:NIFTY:2026-08-25",
    versionId: `broker-version-${snapshotId}`,
    snapshotId,
    label: "BROKER · AUG 25",
    instrumentKey: "BROKER:NFO:NIFTY",
    underlying: "NIFTY",
    expiry: "2026-08-25",
    positions: [{
      contractId: "NFO:NIFTY:2026-08-25:23800:PE",
      tradingsymbol: "NIFTY26AUG23800PE",
      exchange: "NFO",
      underlying: "NIFTY",
      expiry: "2026-08-25",
      strike: 23800,
      optionType: "PE",
      signedQuantity: 65,
      lotSize: 65,
      averagePrice: 84,
      lastPrice: 91,
      pnl: 455
    }]
  }, at);
}

function chartStrategyHarness(book = chartStrategyBook()) {
  const h = createBreakEvenLifecycleHarness({
    manualEntries: Object.values(book.legs),
    strategyBook: book
  });
  const settle = h.settle;
  let activated = false;
  h.settle = async () => {
    await settle();
    if (activated) return;
    activated = true;
    h.click(23800);
    await settle();
  };
  return h;
}

test("manual-only strategies keep shared position spine and T labels visible without strike selection", async () => {
  const book = chartStrategyBook();
  const h = createBreakEvenLifecycleHarness({
    strategyBook: book,
    manualEntries: Object.values(book.legs)
  });
  await h.settle();

  const rails = h.strategyRails();
  assert.ok(rails, "manual positions must create chart position layer");
  assert.ok(rails.querySelector(".nifty-position-spine__line"), "manual positions must retain vertical spine");
  assert.deepEqual(rails.querySelectorAll(".nifty-position-spine__lane-label")
    .map((node) => node.textContent).sort(), ["C", "P"]);
  const positions = rails.querySelectorAll(".nifty-position-spine__compact");
  assert.equal(positions.filter((node) => node.classList.contains("is-call")).length, 1);
  assert.equal(positions.filter((node) => node.classList.contains("is-put")).length, 1);
  assert.deepEqual(rails.querySelectorAll(".nifty-position-spine__marker")
    .map((node) => node.textContent).sort(), ["T1", "T2"]);
});

test("two persistent T checkboxes render combined evidence without a strike click", async () => {
  const book = chartStrategyBook();
  const h = createBreakEvenLifecycleHarness({
    strategyBook: book,
    manualEntries: Object.values(book.legs)
  });
  await h.settle();

  assert.equal(h.rails(), null, "workflow starts with no saved strike selected");
  for (const selector of h.strategyRails().querySelectorAll(".nifty-position-spine__compact-select")) {
    selector.dispatch("click", { detail: 0, stopPropagation() {} });
    await h.settle();
  }

  const rails = h.strategyRails();
  const summary = rails.querySelector(".nifty-strategy-combined-summary");
  assert.ok(summary, "2+ persistent T selections automatically render chart summary");
  assert.match(summary.textContent, /COMBINED · T1 \+ T2/);
  assert.match(summary.textContent, /BE LOW23,600/);
  assert.match(summary.textContent, /BE HIGH24,000/);
  assert.equal(h.rails(), null, "combined selection never invents a saved-strike click");
});

async function selectEveryReachableStrategy(h) {
  for (let guard = 0; guard < 8; guard += 1) {
    const selector = h.strategyRails()?.querySelectorAll(".nifty-strategy__selector")
      .find((node) => node.getAttribute("aria-pressed") === "false");
    if (!selector) return;
    selector.dispatch("click", { detail: 0, stopPropagation() {} });
    await h.settle();
  }
  assert.fail("strategy selection did not settle");
}

test("strike click shows owning strategy BE while checkbox alone owns its rail", async () => {
  const at = "2026-07-31T10:02:00.000Z";
  let book = chartStrategyBook();
  book = strategyStore.applyCommand(book, {
    id: "broker-sync-selection-gated-be",
    type: "SYNC_BROKER_POSITIONS",
    strategyId: "broker:BROKER:NFO:NIFTY:2026-08-25",
    versionId: "broker-selection-gated-be-v1",
    snapshotId: "broker-selection-gated-be-snapshot",
    label: "BROKER · AUG 25",
    instrumentKey: "BROKER:NFO:NIFTY",
    underlying: "NIFTY",
    expiry: "2026-08-25",
    positions: [{
      contractId: "NFO:NIFTY:2026-08-25:23900:CE", tradingsymbol: "NIFTY26AUG23900CE",
      exchange: "NFO", underlying: "NIFTY", expiry: "2026-08-25", strike: 23900,
      optionType: "CE", signedQuantity: 65, lotSize: 65, averagePrice: 50, lastPrice: 60, pnl: 650
    }, {
      contractId: "NFO:NIFTY:2026-08-25:24000:PE", tradingsymbol: "NIFTY26AUG24000PE",
      exchange: "NFO", underlying: "NIFTY", expiry: "2026-08-25", strike: 24000,
      optionType: "PE", signedQuantity: -65, lotSize: 65, averagePrice: 70, lastPrice: 60, pnl: 650
    }]
  }, at);
  const manualEntries = Object.values(book.legs).filter((entry) => entry.source === "MANUAL");
  const marginApi = require("./margin-evidence.js");
  const manualStrategy = strategyStore.activeStrategies(book, "NSE_DLY:NIFTY", "2026-08-25")[0];
  const marginLegs = strategyStore.legsForStrategy(book, manualStrategy.id);
  const brokerMarginEvidence = {
    version: 1,
    updatedAt: "2026-08-08T10:00:00.000Z",
    funds: null,
    baskets: {
      [`strategy:${manualStrategy.id}`]: {
        fingerprint: marginApi.fingerprint(marginLegs),
        total: 120000,
        legs: marginLegs.map((entry, index) => ({ entryId: entry.id, total: index ? 39000 : 450000 }))
      }
    }
  };
  const h = createBreakEvenLifecycleHarness({ strategyBook: book, manualEntries, brokerMarginEvidence });
  await h.settle();

  let rails = h.strategyRails();
  assert.ok(rails, "broker C/P position layer remains available without strike selection");
  assert.equal(rails.querySelectorAll(".nifty-position-spine__compact")
    .filter((node) => !node.hidden).length, 4,
  "manual and broker positions share persistent Call/Put lanes");
  assert.equal(rails.querySelectorAll(".nifty-strategy__card").length, 0,
    "no selected strike means no T controls on chart");
  assert.equal(rails.querySelectorAll(".nifty-strategy__rail").length, 0,
    "no selected strike means no saved strategy BE rails");
  assert.equal(h.rails(), null, "no selected strike means no quick Call/Put BE rails");

  h.click(23800);
  await h.settle();
  rails = h.strategyRails();
  assert.equal(rails.querySelectorAll(".nifty-strategy__card").length, 1,
    "strike click retains one reusable detail-card node");
  assert.equal(rails.querySelector(".nifty-strategy__card")
    .classList.contains("is-spine-evidence-proxy"), true,
  "closed unchecked detail-card proxy stays hidden behind persistent T control");
  const owningPosition = rails.querySelectorAll(".nifty-position-spine__compact")
    .find((node) => node.querySelector(".nifty-position-spine__marker")?.textContent.includes("T1"));
  assert.ok(owningPosition, "selected manual face retains its owning persistent T control");
  assert.equal(owningPosition.querySelector(".nifty-position-spine__marker").textContent,
    "T1|BE 23,900|Margin ₹1.20L",
    "strike click exposes real saved-strategy breakeven and broker margin beside persistent T token");
  assert.equal(owningPosition.querySelector(".nifty-position-spine__compact-select")
    .getAttribute("aria-pressed"), "false",
    "showing BE evidence never silently selects strategy");
  assert.equal(rails.querySelectorAll(".nifty-strategy__rail").length, 0,
    "selected strike never reveals unchecked saved strategy BE rails");
  assert.equal(h.rails().querySelectorAll(".nifty-break-even__line").length, 2,
    "selected strike reveals only quick Call and Put BE rails");
  assert.equal(rails.querySelectorAll(".nifty-position-spine__compact").length, 4,
    "manual and broker positions remain represented while BE rails are active");
  assert.equal(rails.querySelectorAll(".nifty-position-spine__compact")
    .filter((node) => node.classList.contains("is-call")).length, 2);
  assert.equal(rails.querySelectorAll(".nifty-position-spine__compact")
    .filter((node) => node.classList.contains("is-put")).length, 2);

  owningPosition.querySelector(".nifty-position-spine__marker")
    .dispatch("click", { stopPropagation() {} });
  await h.settle();
  rails = h.strategyRails();
  assert.equal(rails.querySelectorAll(".nifty-strategy__card").length, 1,
    "T click reuses one existing card");
  assert.equal(rails.querySelectorAll(".nifty-strategy__card")
    .filter((node) => node.classList.contains("is-open")).length, 1,
    "T click opens existing detail card without creating another card");
  assert.match(rails.querySelector(".nifty-strategy__card").textContent, /MARGIN REQUIRED ₹1\.20L/,
    "existing detail card shows broker combined margin without creating a new card");
  assert.match(rails.querySelector(".nifty-strategy__card").textContent, /MARGIN ₹(?:4\.50L|39\.00K)/,
    "existing detail card shows individual-leg margin evidence");
  const openedPersistentControl = rails.querySelectorAll(".nifty-position-spine__compact")
    .find((node) => node.querySelector(".nifty-position-spine__marker")?.textContent.includes("T1"));
  assert.equal(openedPersistentControl.hidden, true,
    "open detail card temporarily hides same T control so visible UI never duplicates or collides");

  rails.querySelectorAll(".nifty-strategy__selector")[0]
    .dispatch("click", { stopPropagation() {} });
  await h.settle();
  rails = h.strategyRails();
  assert.equal(rails.querySelectorAll(".nifty-strategy__rail").length, 1,
    "checking one T reveals only that strategy BE rail");
  assert.equal(rails.querySelector(".nifty-position-spine__marker-be").textContent, "BE 23,900",
    "checked rail never removes strike-click BE evidence from persistent T control");
  assert.equal(rails.querySelectorAll(".nifty-strategy__selector")
    .filter((node) => node.getAttribute("aria-pressed") === "true").length, 1);
  assert.equal(h.rails().querySelectorAll(".nifty-break-even__line").length, 2,
    "checking one T never duplicates quick Call and Put rails");

  h.document.dispatch("click", { target: { closest() { return null; } } });
  await h.settle();
  rails = h.strategyRails();
  assert.equal(h.rails(), null);
  assert.equal(rails.querySelectorAll(".nifty-strategy__card").length, 0);
  assert.equal(rails.querySelectorAll(".nifty-strategy__rail").length, 0);
  assert.equal(rails.querySelectorAll(".nifty-position-spine__compact")
    .filter((node) => !node.hidden).length, 4,
  "clearing strike removes BE visuals but never manual or broker positions");

  h.click(23800);
  await h.settle();
  h.doubleClick(23750);
  await h.settle();
  rails = h.strategyRails();
  assert.equal(h.rails(), null);
  assert.equal(rails.querySelectorAll(".nifty-strategy__card").length, 0,
    "opening manual trade editor deselects strike and hides all T controls");
  assert.equal(rails.querySelectorAll(".nifty-strategy__rail").length, 0,
    "opening manual trade editor hides all saved break-even rails");
  assert.equal(rails.querySelectorAll(".nifty-position-spine__compact")
    .filter((node) => !node.hidden).length, 4,
  "manual editor never removes manual or broker positions");
  h.document.dispatch("keydown", { key: "Escape", target: { closest() { return null; } } });
  await h.settle();

  h.click(23800);
  await h.settle();
  assert.equal(h.strategyRails().querySelectorAll(".nifty-strategy__card").length, 1);
  assert.equal(h.strategyRails().querySelector(".nifty-strategy__card")
    .classList.contains("is-spine-evidence-proxy"), true);
  assert.equal(h.strategyRails().querySelector(".nifty-position-spine__marker-be").textContent, "BE 23,900");
  h.document.dispatch("keydown", { key: "Escape", target: { closest() { return null; } } });
  await h.settle();
  rails = h.strategyRails();
  assert.equal(h.rails(), null);
  assert.equal(rails.querySelectorAll(".nifty-strategy__card").length, 0,
    "Escape removes T controls with active-strike BE rails");
  assert.equal(rails.querySelectorAll(".nifty-position-spine__compact")
    .filter((node) => !node.hidden).length, 4,
  "Escape never removes manual or broker C/P positions");
});

test("closed strike-evidence proxy stays visually hidden after collapsed-card display rules", () => {
  const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");
  assert.match(css,
    /\.nifty-strategy__card\.is-collapsed\.is-spine-evidence-proxy\s*\{[^}]*display:\s*none;/s,
    "collapsed detail proxy must beat normal collapsed-card display in CSS cascade");
});

test("sold saved strike appends saved-minus-live premium points only after explicit refresh", async () => {
  const entry = savedManualEntry({ premium: 440, callSnapshot: 440 });
  const h = createBreakEvenLifecycleHarness({ manualEntries: [entry], strategySupport: true });
  await h.settle();
  const fetchesBeforeClick = h.fetchCalls();

  h.click(23750);
  await h.settle();
  let labels = h.rails().querySelectorAll(".nifty-break-even__label");
  assert.equal(labels.find((label) => label.classList.contains("is-call")).textContent,
    "CALL BE 23,869 · SELL BELOW ↓ · 321.00 pts");
  assert.doesNotMatch(labels.find((label) => label.classList.contains("is-put")).textContent, /pts/,
    "premium difference belongs only to saved option side");
  assert.equal(h.fetchCalls(), fetchesBeforeClick,
    "strike click uses cached manual-refresh evidence and never starts quote loop");

  await h.refreshOptionNumbers({ byStrike: { 23750: { call: 654.85, put: 219 } } });
  assert.equal(h.rails(), null, "manual refresh preserves existing explicit clear boundary");
  h.click(23750);
  await h.settle();
  labels = h.rails().querySelectorAll(".nifty-break-even__label");
  assert.equal(labels.find((label) => label.classList.contains("is-call")).textContent,
    "CALL BE 24,405 · SELL BELOW ↓ · -214.85 pts");
  const fetchesAfterManualRefresh = h.fetchCalls();

  await h.retryPlacement();
  await h.settle();
  assert.equal(h.fetchCalls(), fetchesAfterManualRefresh,
    "geometry retries never refresh quotes automatically");
  assert.match(h.rails().textContent, /-214\.85 pts/);
});

test("same-strike broker face keeps two quick rails without leaking unrelated manual T controls", async () => {
  const book = chartStrategyBookWithSameStrikeBroker();
  const manualEntries = Object.values(book.legs).filter((entry) => entry.source === "MANUAL");
  const h = createBreakEvenLifecycleHarness({ strategyBook: book, manualEntries });
  await h.settle();

  const row = h.click(23800);
  await h.settle();
  assert.match(row.getAttribute("aria-label"), /Buy Put, 1 lot/,
    "newest broker P1 owns first saved face at shared strike");
  assert.equal(h.rails().querySelectorAll(".nifty-break-even__line").length, 2,
    "broker face preserves agreed quick Call and Put SELL what-if rails");
  assert.equal(h.strategyRails().querySelectorAll(".nifty-strategy__card").length, 0,
    "broker face cannot reveal unrelated manual T controls");
  assert.equal(h.strategyRails().querySelectorAll(".nifty-position-spine__compact").length, 3,
    "exact broker and manual positions remain visible in shared type columns");
  assert.equal(h.strategyRails().querySelectorAll(".nifty-position-spine__marker")
    .filter((node) => node.textContent === "P1").length, 1,
  "exact broker P control remains identifiable");
});

test("ordinary cell double-click from broker face opens fresh manual editor", async () => {
  const book = chartStrategyBookWithSameStrikeBroker();
  const manualEntries = Object.values(book.legs).filter((entry) => entry.source === "MANUAL");
  const h = createBreakEvenLifecycleHarness({ strategyBook: book, manualEntries });
  await h.settle();

  h.click(23800);
  await h.settle();
  assert.match(h.row(23800).getAttribute("aria-label"), /Buy Put, 1 lot/);

  h.doubleClick(23800, "CALL");
  await h.settle();

  assert.ok(h.editor(23800), "ordinary cell double-click opens manual editor");
  assert.equal(h.strategyRails()?.querySelector(".nifty-position-spine__card") || null, null,
    "active broker face cannot hijack ordinary cell double-click into read-only details");
  assert.equal(h.rails(), null, "opening manual editor clears quick break-even rails");
});

test("document pointer capture plus broker badge click opens exact read-only card without clearing quick rails", async () => {
  const book = chartStrategyBookWithSameStrikeBroker();
  const manualEntries = Object.values(book.legs).filter((entry) => entry.source === "MANUAL");
  const h = createBreakEvenLifecycleHarness({ strategyBook: book, manualEntries });
  await h.settle();

  h.click(23800);
  await h.settle();
  assert.equal(h.rails().querySelectorAll(".nifty-break-even__line").length, 2);

  const badge = h.row(23800).querySelectorAll(".nifty-axis-ladder__badge")
    .find((node) => node.dataset.source === "BROKER_POSITION");
  assert.ok(badge?.dataset.entryId, "single broker badge carries exact immutable entry identity");
  h.pointerThenClickTarget(badge);
  await h.settle();

  assert.equal(h.editor(23800), null, "broker position is never routed into manual editor");
  const card = h.strategyRails().querySelector(".nifty-position-spine__card");
  assert.ok(card, "broker badge opens exact broker P&L card");
  assert.match(card.textContent, /23,800/);
  assert.equal(h.rails().querySelectorAll(".nifty-break-even__line").length, 2,
    "document capture cannot clear quick BEs before broker badge click runs");
});

test("real double-click on exact broker ladder badge leaves exact read-only card open", async () => {
  const book = chartStrategyBookWithSameStrikeBroker();
  const manualEntries = Object.values(book.legs).filter((entry) => entry.source === "MANUAL");
  const h = createBreakEvenLifecycleHarness({ strategyBook: book, manualEntries });
  await h.settle();

  const badge = h.row(23800).querySelectorAll(".nifty-axis-ladder__badge")
    .find((node) => node.dataset.source === "BROKER_POSITION");
  assert.ok(badge?.dataset.entryId, "exact broker ladder badge exposes immutable entry identity");

  h.realDoubleClickTarget(badge);
  await h.settle();

  assert.equal(h.editor(23800), null, "broker double-click never opens manual ADD");
  const cards = h.strategyRails().querySelectorAll(".nifty-position-spine__card");
  assert.equal(cards.length, 1, "double-click finishes with one broker card open");
  assert.match(cards[0].textContent, /23,800/);
});

test("real double-click on broker spine marker leaves its exact read-only card open", async () => {
  const book = chartStrategyBookWithSameStrikeBroker();
  const manualEntries = Object.values(book.legs).filter((entry) => entry.source === "MANUAL");
  const h = createBreakEvenLifecycleHarness({ strategyBook: book, manualEntries });
  await h.settle();

  const marker = h.strategyRails().querySelector(".nifty-position-spine__marker");
  assert.ok(marker);

  h.realDoubleClickTarget(marker);
  await h.settle();

  assert.equal(h.editor(23800), null, "broker marker cannot route into manual editor");
  const cards = h.strategyRails().querySelectorAll(".nifty-position-spine__card");
  assert.equal(cards.length, 1, "two marker clicks cannot toggle exact card closed");
  assert.match(cards[0].textContent, /23,800/);
});

test("aggregate broker ladder badge without exact identity never enters manual face cycle", async () => {
  const book = chartStrategyBookWithSameStrikeBroker();
  const manualEntries = Object.values(book.legs).filter((entry) => entry.source === "MANUAL");
  const h = createBreakEvenLifecycleHarness({ strategyBook: book, manualEntries });
  await h.settle();

  const badge = h.row(23800).querySelectorAll(".nifty-axis-ladder__badge")
    .find((node) => node.dataset.source === "BROKER_POSITION");
  assert.ok(badge);
  badge.dataset.entryId = "";

  h.clickTarget(badge);
  h.flushClickTimer();
  await h.settle();

  assert.equal(h.row(23800).getAttribute("aria-pressed"), "false",
    "broker-only group cannot activate manual or quick row face");
  assert.equal(h.editor(23800), null);
  assert.equal(h.rails(), null);
  assert.equal(h.strategyRails().querySelector(".nifty-position-spine__card"), null);
});

test("broker spine click claims its exact strike instead of inheriting stale quick rails", async () => {
  const book = chartStrategyBookWithSameStrikeBroker();
  const manualEntries = Object.values(book.legs).filter((entry) => entry.source === "MANUAL");
  const h = createBreakEvenLifecycleHarness({ strategyBook: book, manualEntries });
  await h.settle();

  h.click(23750);
  await h.settle();
  assert.equal(h.row(23750).getAttribute("aria-pressed"), "true");

  const marker = h.strategyRails().querySelector(".nifty-position-spine__marker");
  assert.match(marker.getAttribute("aria-label"), /strike 23,800/);
  marker.dispatch("click", { stopPropagation() {} });
  await h.settle();

  assert.equal(h.row(23750).getAttribute("aria-pressed"), "false");
  assert.equal(h.row(23800).getAttribute("aria-pressed"), "true");
  assert.match(h.row(23800).getAttribute("aria-label"), /Buy Put, 1 lot/);
  assert.equal(h.rails().querySelectorAll(".nifty-break-even__line").length, 2);
  assert.equal(h.strategyRails().querySelectorAll(".nifty-strategy__card").length, 0,
    "broker face cannot expose stale manual T controls");
  const card = h.strategyRails().querySelector(".nifty-position-spine__card");
  assert.ok(card);
  assert.match(card.textContent, /23,800/);
  assert.equal(card.querySelector(".nifty-position-spine__rail-toggle").disabled, false,
    "broker BE control is enabled only after exact strike ownership");
});

test("broker snapshot ID churn clears stale face card and selection while preserving selected strike quick rails", async () => {
  const firstBook = chartStrategyBookWithSameStrikeBroker();
  const manualEntries = Object.values(firstBook.legs).filter((entry) => entry.source === "MANUAL");
  const h = createBreakEvenLifecycleHarness({ strategyBook: firstBook, manualEntries });
  await h.settle();

  h.click(23800);
  await h.settle();
  const oldBadge = h.row(23800).querySelectorAll(".nifty-axis-ladder__badge")
    .find((node) => node.dataset.source === "BROKER_POSITION");
  const oldEntryId = oldBadge.dataset.entryId;
  h.pointerThenClickTarget(oldBadge);
  await h.settle();
  const oldSelector = h.strategyRails().querySelector(".nifty-position-spine__compact-select");
  h.pointerThenClickTarget(oldSelector);
  await h.settle();
  assert.ok(h.strategyRails().querySelector(".nifty-position-spine__card"));
  assert.equal(h.rails().querySelectorAll(".nifty-break-even__line").length, 2);

  const secondBook = resyncSameStrikeBroker(firstBook, "snapshot-v2");
  h.storage({ strategyBook: { oldValue: firstBook, newValue: secondBook } });
  await h.settle();

  const refreshedRow = h.row(23800);
  const newBadge = refreshedRow.querySelectorAll(".nifty-axis-ladder__badge")
    .find((node) => node.dataset.source === "BROKER_POSITION");
  assert.notEqual(newBadge.dataset.entryId, oldEntryId, "new broker snapshot owns a new immutable leg ID");
  assert.equal(refreshedRow.getAttribute("aria-pressed"), "true", "selected strike survives broker refresh");
  assert.equal(h.rails().querySelectorAll(".nifty-break-even__line").length, 2,
    "broker refresh preserves only two generic quick BEs");
  assert.equal(h.strategyRails().querySelector(".nifty-position-spine__card"), null,
    "stale read-only broker card cannot survive snapshot identity churn");
  assert.equal(h.strategyRails().querySelectorAll(".nifty-position-spine__compact-select")
    .filter((node) => node.getAttribute("aria-pressed") === "true").length, 0,
  "stale broker preview selection cannot survive snapshot identity churn");
  assert.equal(h.strategyRails().querySelectorAll(".nifty-strategy__card").length, 0,
    "broker refresh cannot leak unrelated manual T cards");
  assert.doesNotMatch(refreshedRow.getAttribute("aria-label") || "", /Buy Put, 1 lot/,
    "stale broker face returns to live quote face");
});

test("production interaction path survives 1,000 neutral broker manual and live face evaluations", async () => {
  const book = chartStrategyBookWithSameStrikeBroker();
  const manualEntries = Object.values(book.legs).filter((entry) => entry.source === "MANUAL");
  const h = createBreakEvenLifecycleHarness({ strategyBook: book, manualEntries });
  await h.settle();

  let evaluations = 0;
  for (let cycle = 0; cycle < 200; cycle += 1) {
    h.document.dispatch("keydown", { key: "Escape", target: { closest() { return null; } } });
    await h.settle();
    assert.equal(h.rails(), null, `cycle ${cycle}: neutral owns no quick rails`);
    assert.equal(h.strategyRails().querySelectorAll(".nifty-strategy__card").length, 0,
      `cycle ${cycle}: neutral owns no T controls`);
    assert.equal(h.strategyRails().querySelectorAll(".nifty-position-spine__compact").length, 3,
      `cycle ${cycle}: neutral preserves unified manual and broker spine`);
    evaluations += 1;

    let row = h.click(23800);
    await h.settle();
    assert.match(row.getAttribute("aria-label"), /Buy Put, 1 lot/,
      `cycle ${cycle}: first click opens newest broker face`);
    assert.equal(h.rails().querySelectorAll(".nifty-break-even__line").length, 2,
      `cycle ${cycle}: broker face keeps exactly two quick rails`);
    assert.equal(h.strategyRails().querySelectorAll(".nifty-strategy__card").length, 0,
      `cycle ${cycle}: broker face leaks no manual T controls`);
    evaluations += 1;

    row = h.click(23800);
    await h.settle();
    assert.doesNotMatch(row.getAttribute("aria-label") || "", /Buy Put, 1 lot/,
      `cycle ${cycle}: second click leaves broker identity`);
    assert.equal(h.rails().querySelectorAll(".nifty-break-even__line").length, 2,
      `cycle ${cycle}: first manual face keeps exactly two quick rails`);
    assert.equal(h.strategyRails().querySelectorAll(".nifty-strategy__card").length, 1,
      `cycle ${cycle}: first manual face exposes only its owning T control`);
    evaluations += 1;

    row = h.click(23800);
    await h.settle();
    assert.doesNotMatch(row.getAttribute("aria-label") || "", /Buy Put, 1 lot/,
      `cycle ${cycle}: third click stays on manual identity`);
    assert.equal(h.rails().querySelectorAll(".nifty-break-even__line").length, 2,
      `cycle ${cycle}: second manual face keeps exactly two quick rails`);
    assert.equal(h.strategyRails().querySelectorAll(".nifty-strategy__card").length, 1,
      `cycle ${cycle}: second manual face exposes only its owning T control`);
    evaluations += 1;

    row = h.click(23800);
    await h.settle();
    assert.equal(row.getAttribute("aria-pressed"), "true", `cycle ${cycle}: live face keeps strike selected`);
    assert.equal(h.rails().querySelectorAll(".nifty-break-even__line").length, 2,
      `cycle ${cycle}: live face keeps exactly two quick rails`);
    assert.equal(h.strategyRails().querySelectorAll(".nifty-strategy__card").length, 0,
      `cycle ${cycle}: live face owns no T controls`);
    evaluations += 1;
  }

  assert.equal(evaluations, 1000);
});

test("production strategy rails open details, synchronize squares, preview combined roots, compare, and clear on refresh", async () => {
  const h = chartStrategyHarness();
  await h.settle();

  let rails = h.strategyRails();
  assert.ok(rails, "strategy rail layer rendered");
  let labels = rails.querySelectorAll(".nifty-strategy__label");
  assert.deepEqual(labels.map((node) => node.textContent.trim()).sort(), ["T1 BE 23,900 | Margin —"]);
  assert.equal(h.manualRails(), null, "legacy anonymous plan rails stay hidden after migration");

  labels[0].dispatch("click", { stopPropagation() {} });
  await h.settle();
  rails = h.strategyRails();
  assert.ok(rails.querySelector(".nifty-strategy__trades"), "label opens same-strategy P&L details");
  assert.equal(rails.querySelectorAll(".nifty-strategy__selector").every((node) => node.getAttribute("aria-pressed") === "false"), true);

  rails.querySelectorAll(".nifty-strategy__selector")[0].dispatch("click", { stopPropagation() {} });
  await h.settle();
  rails = h.strategyRails();
  rails.querySelectorAll(".nifty-strategy__selector").find((node) => node.getAttribute("aria-pressed") === "false")
    .dispatch("click", { stopPropagation() {} });
  await h.settle();

  rails = h.strategyRails();
  assert.deepEqual(rails.querySelectorAll(".nifty-strategy__label").map((node) => node.textContent).sort(), [
    "COMBINED BE 23,600", "COMBINED BE 24,000",
    "T1 BE 23,900", "T2 BE 23,700 | Margin —"
  ]);
  const combinedSummary = rails.querySelector(".nifty-strategy-combined-summary");
  assert.ok(combinedSummary, "2+ selected strategies automatically render compact on-chart basket summary");
  for (const label of ["COMBINED · T1 + T2", "BE LOW", "BE HIGH", "MAX PROFIT", "MAX LOSS", "WIN RATE", "MARGIN REQUIRED"]) {
    assert.match(combinedSummary.textContent, new RegExp(label.replace(/[+]/g, "\\+")));
  }
  assert.match(combinedSummary.textContent, /WIN RATE—/, "missing side-console win-rate evidence is never invented");
  assert.match(combinedSummary.textContent, /MARGIN REQUIRED—/, "missing broker basket margin fails closed");
  assert.ok(rails.querySelector(".nifty-strategy-preview"));
  assert.equal(rails.querySelectorAll(".nifty-strategy__rail")
    .filter((node) => node.classList.contains("is-original")).length, 0);

  rails.querySelector(".nifty-strategy-preview__compare").dispatch("click", { stopPropagation() {} });
  await h.settle();
  rails = h.strategyRails();
  assert.equal(rails.querySelectorAll(".nifty-strategy__rail")
    .filter((node) => node.classList.contains("is-original")).length, 2,
    "Compare restores original rails beside combined roots");

  await h.refreshOptionNumbers();
  rails = h.strategyRails();
  assert.ok(rails, "refresh retains permanent manual position spine");
  assert.equal(rails.querySelectorAll(".nifty-position-spine__marker").length, 2);
  assert.equal(rails.querySelectorAll(".nifty-strategy__card").length, 0);
  assert.equal(rails.querySelectorAll(".nifty-strategy__rail").length, 0);
});

test("checked manual break-even rail stays visible while black card click changes only opened details", async () => {
  const h = chartStrategyHarness();
  await h.settle();

  let rails = h.strategyRails();
  rails.querySelectorAll(".nifty-strategy__selector")[0]
    .dispatch("click", { stopPropagation() {} });
  await h.settle();
  rails = h.strategyRails();
  assert.equal(rails.querySelectorAll(".nifty-strategy__rail").length, 1);
  const first = rails.querySelectorAll(".nifty-strategy__label")
    .find((node) => node.textContent.startsWith("T1 "));
  first.dispatch("click", { stopPropagation() {} });
  await h.settle();

  rails = h.strategyRails();
  assert.equal(rails.querySelectorAll(".nifty-strategy__rail").length, 1);
  assert.ok(rails.querySelectorAll(".nifty-strategy__rail")
    .some((node) => node.dataset.strategyId === "s1"));
  assert.ok(rails.querySelector(".nifty-strategy__trades"));

  const second = rails.querySelectorAll(".nifty-strategy__label")
    .find((node) => node.textContent.startsWith("T2 "));
  second.dispatch("click", { stopPropagation() {} });
  await h.settle();
  rails = h.strategyRails();
  assert.equal(rails.querySelectorAll(".nifty-strategy__rail").length, 1);
  assert.ok(rails.querySelectorAll(".nifty-strategy__rail")
    .some((node) => node.dataset.strategyId === "s1"));

  rails.querySelectorAll(".nifty-strategy__label")
    .find((node) => node.textContent.startsWith("T2 "))
    .dispatch("click", { stopPropagation() {} });
  await h.settle();
  assert.equal(h.strategyRails().querySelectorAll(".nifty-strategy__rail").length, 1,
    "second click closes details without deleting checked rail");
});

test("strategy cards collapse into one narrow edge stack and expand only clicked token", async () => {
  const h = chartStrategyHarness();
  await h.settle();

  let rails = h.strategyRails();
  rails.querySelector(".nifty-strategy__selector").dispatch("click", { stopPropagation() {} });
  await h.settle();
  rails = h.strategyRails();
  let cards = rails.querySelectorAll(".nifty-strategy__card");
  assert.equal(cards.every((card) => card.classList.contains("is-collapsed")), true);
  assert.equal(rails.querySelectorAll(".nifty-strategy__selector").length, 2,
    "collapsed strategy tokens keep their direct selection checkboxes");
  assert.deepEqual(rails.querySelectorAll(".nifty-strategy__label")
    .map((label) => label.dataset.token).sort(), ["T1", "T2"]);

  rails.querySelectorAll(".nifty-strategy__label")
    .find((label) => label.dataset.token === "T1")
    .dispatch("click", { stopPropagation() {} });
  await h.settle();

  rails = h.strategyRails();
  cards = rails.querySelectorAll(".nifty-strategy__card");
  assert.equal(cards.find((card) => card.textContent.startsWith("T1 "))
    .classList.contains("is-open"), true);
  assert.equal(cards.find((card) => card.textContent.startsWith("T2 "))
    .classList.contains("is-collapsed"), true);
});

test("first T header click opens every trade owned by that exact strategy", async () => {
  let book = chartStrategyBook();
  const firstLeg = book.legs["leg-s1"];
  book = strategyStore.applyCommand(book, {
    id: "add-second-s1-leg",
    type: "ADD_LEG",
    strategyId: "s1",
    versionId: "s1-v3",
    leg: {
      ...firstLeg,
      id: "leg-s1-second",
      strike: 24000,
      direction: "BUY",
      premium: 80,
      callSnapshot: 80,
      createdAt: "2026-07-31T10:01:00.000Z",
      updatedAt: "2026-07-31T10:01:00.000Z"
    }
  }, "2026-07-31T10:01:00.000Z");
  const h = chartStrategyHarness(book);
  await h.settle();

  const t1Label = h.strategyRails().querySelectorAll(".nifty-strategy__label")
    .find((label) => label.dataset.token === "T1");
  assert.ok(t1Label);
  t1Label.dispatch("click", { stopPropagation() {} });
  await h.settle();

  const openT1 = h.strategyRails().querySelectorAll(".nifty-strategy__card")
    .find((card) => card.textContent.startsWith("T1 ") && card.classList.contains("is-open"));
  assert.ok(openT1, "first T1 click opens exact strategy");
  assert.equal(openT1.querySelectorAll(".nifty-strategy__trade").length, 2,
    "opened identity shows all owned trades on first click");
});

test("overlapping Call strategy and off-grid Call tokens use restored position group without absorbing nearby Put", async () => {
  const book = chartStrategyBook();
  const h = createBreakEvenLifecycleHarness({
    strategyBook: book,
    manualEntries: [
      ...Object.values(book.legs),
      savedManualEntry({ id: "off-grid-23900", strike: 23900, lots: 1 })
    ],
    initialAxisPairs: [23600, 23800, 24000, 24200].map((price, index) => ({
      price,
      y: 300 - index * 10
    }))
  });
  await h.settle();
  h.click(23800);
  await h.settle();

  let rails = h.strategyRails();
  if (!rails?.querySelectorAll(".nifty-strategy__card")
    .some((card) => card.textContent.startsWith("T1 "))) {
    h.click(23800);
    await h.settle();
    rails = h.strategyRails();
  }
  rails.querySelector(".nifty-strategy__selector").dispatch("click", { stopPropagation() {} });
  await h.settle();
  rails = h.strategyRails();
  const group = rails.querySelector(".nifty-position-spine__cluster-count");
  let groupSelector = rails.querySelector(".nifty-position-spine__cluster-select");
  assert.ok(group);
  assert.equal(group.textContent, "+3");
  assert.equal(groupSelector.getAttribute("aria-expanded"), "false");
  assert.equal(groupSelector.getAttribute("aria-pressed"), null);
  const selectedBeforeOpeningGroup = rails.querySelectorAll(".nifty-strategy__selector")
    .filter((node) => node.getAttribute("aria-pressed") === "true").length;
  assert.equal(rails.querySelectorAll(".nifty-strategy__card")
    .filter((card) => card.hidden).length, 1);
  assert.equal(rails.querySelectorAll(".nifty-strategy__card")
    .filter((card) => card.textContent.startsWith("T2 ") && !card.hidden).length, 1,
  "same-strike Put strategy remains visible in its separate Put column");
  assert.equal(h.document.getElementById("nifty-axis-ladder")
    .querySelector(".nifty-axis-ladder__off-grid"), null,
  "owned manual positions use shared spine instead of duplicate off-grid chips");

  group.dispatch("click", { stopPropagation() {} });
  await h.settle();
  assert.equal(h.strategyRails().querySelector(".nifty-position-spine__cluster-flyout"), null,
    "plus count stays informational");

  groupSelector.dispatch("click", { stopPropagation() {} });
  await h.settle();
  rails = h.strategyRails();
  groupSelector = rails.querySelector(".nifty-position-spine__cluster-select");
  assert.equal(groupSelector.getAttribute("aria-expanded"), "true");
  assert.equal(rails.querySelectorAll(".nifty-strategy__selector")
    .filter((node) => node.getAttribute("aria-pressed") === "true").length, selectedBeforeOpeningGroup,
  "outer square opens identities without changing strategy selection");
  const flyout = rails.querySelector(".nifty-position-spine__cluster-flyout");
  assert.ok(flyout);
  assert.equal(flyout.querySelectorAll(".nifty-position-spine__cluster-row").length, 3);
  assert.ok(Number.parseFloat(flyout.style.top) >= 8,
    "group flyout is clamped inside viewport top edge");
  assert.ok(Number.parseFloat(flyout.style.top) <= 900 - (3 * 24 + 2) - 8,
    "group flyout is clamped inside viewport bottom edge");

  const t1Row = flyout.querySelectorAll(".nifty-position-spine__cluster-row")
    .find((row) => row.textContent.startsWith("T1 "));
  t1Row.querySelector(".nifty-position-spine__cluster-row-select")
    .dispatch("click", { stopPropagation() {} });
  await h.settle();
  rails = h.strategyRails();
  assert.equal(rails.querySelector(".nifty-position-spine__cluster-select").getAttribute("aria-expanded"), "false",
    "removing selected rail proxy closes stale group membership");
  rails.querySelector(".nifty-position-spine__cluster-select")
    .dispatch("click", { stopPropagation() {} });
  await h.settle();
  rails = h.strategyRails();
  assert.equal(rails.querySelector(".nifty-position-spine__cluster-flyout").querySelectorAll(".nifty-position-spine__cluster-row-select")
    .filter((node) => node.getAttribute("aria-pressed") === "true").length, 0,
  "exact flyout square toggles the already-selected T1 off");
  rails.querySelector(".nifty-position-spine__cluster-flyout").querySelectorAll(".nifty-position-spine__cluster-row")
    .find((row) => row.textContent.startsWith("T1 "))
    .querySelector(".nifty-position-spine__cluster-row-select")
    .dispatch("click", { stopPropagation() {} });
  await h.settle();
  rails = h.strategyRails();
  if (!rails.querySelector(".nifty-position-spine__cluster-flyout")) {
    rails.querySelector(".nifty-position-spine__cluster-select")
      .dispatch("click", { stopPropagation() {} });
    await h.settle();
    rails = h.strategyRails();
  }
  assert.equal(rails.querySelector(".nifty-position-spine__cluster-flyout").querySelectorAll(".nifty-position-spine__cluster-row-select")
    .filter((node) => node.getAttribute("aria-pressed") === "true").length, 2,
  "same exact flyout square synchronizes both visible T1 controls");
  rails.querySelector(".nifty-position-spine__cluster-flyout").querySelectorAll(".nifty-position-spine__cluster-row")
    .find((row) => row.textContent.startsWith("T1 "))
    .querySelector(".nifty-position-spine__cluster-row-open")
    .dispatch("click", { stopPropagation() {} });
  await h.settle();
  assert.ok(h.strategyRails().querySelector(".nifty-strategy__trades"));
  assert.equal(h.strategyRails().querySelectorAll(".nifty-strategy__rail").length, 1,
    "opening grouped identity preserves only checked T1 BE rail");
});

test("saved-position face click keeps quick Call and Put break-even rails visible", async () => {
  const h = createBreakEvenLifecycleHarness({ manualEntries: [] });
  await h.settle();

  h.click(23750);
  await h.settle();
  assert.equal(h.rails().querySelectorAll(".nifty-break-even__line").length, 2);

  const call = savedManualEntry({ id: "saved-call", strike: 23750, optionType: "CALL", direction: "SELL", premium: 100, callSnapshot: 100 });
  const put = savedManualEntry({ id: "saved-put", strike: 23750, optionType: "PUT", direction: "SELL", premium: 200, putSnapshot: 200 });
  const plans = manualPlan.upsertEntry(manualPlan.upsertEntry(manualPlan.emptyStore(), call), put);
  h.storage({ manualPlans: { newValue: plans } });
  await h.settle();

  h.click(23750);
  await h.settle();
  assert.equal(h.rails().querySelectorAll(".nifty-break-even__line").length, 2,
    "cycling saved C1/P1 face must not clear quick rails");
  assert.equal(h.row(23750).classList.contains("is-manual-entry"), true);
});

test("broker disconnect hides persisted broker position spine without deleting strategy book", async () => {
  const at = "2026-07-31T10:00:00.000Z";
  let book = strategyStore.emptyBook();
  book = strategyStore.applyCommand(book, {
    id: "broker-sync-disconnect-visibility",
    type: "SYNC_BROKER_POSITIONS",
    strategyId: "broker:BROKER:NFO:NIFTY:2026-08-25",
    versionId: "broker-disconnect-v1",
    snapshotId: "broker-disconnect-snapshot",
    label: "BROKER · AUG 25",
    instrumentKey: "BROKER:NFO:NIFTY",
    underlying: "NIFTY",
    expiry: "2026-08-25",
    positions: [{
      contractId: "NFO:NIFTY:2026-08-25:23800:PE", tradingsymbol: "NIFTY26AUG23800PE",
      exchange: "NFO", underlying: "NIFTY", expiry: "2026-08-25", strike: 23800,
      optionType: "PE", signedQuantity: -65, lotSize: 65, averagePrice: 100, lastPrice: 90, pnl: 650
    }]
  }, at);
  const h = createBreakEvenLifecycleHarness({ strategyBook: book, manualEntries: [] });
  await h.settle();
  assert.equal(h.strategyRails().querySelectorAll(".nifty-position-spine__marker").length, 1);

  h.storage({ brokerConnection: { newValue: { connected: false, expiresAt: null, checkedAt: at } } });
  await h.settle();
  assert.equal(h.strategyRails(), null, "disconnect removes broker-origin chart visuals");

  h.storage({ brokerConnection: { newValue: { connected: true, expiresAt: "2027-08-04T00:30:00.000Z", checkedAt: at } } });
  await h.settle();
  assert.equal(h.strategyRails().querySelectorAll(".nifty-position-spine__marker").length, 1,
    "reconnect restores persisted broker positions without importing again");
});

test("broker disconnect clears stale face and T state while manual strategy remains reachable by exact face", async () => {
  const at = "2026-07-31T10:00:00.000Z";
  let book = chartStrategyBook();
  book = strategyStore.applyCommand(book, {
    id: "broker-sync-with-manual",
    type: "SYNC_BROKER_POSITIONS",
    strategyId: "broker:BROKER:NFO:NIFTY:2026-08-25",
    versionId: "broker-with-manual-v1",
    snapshotId: "broker-with-manual-snapshot",
    label: "BROKER · AUG 25",
    instrumentKey: "BROKER:NFO:NIFTY",
    underlying: "NIFTY",
    expiry: "2026-08-25",
    positions: [{
      contractId: "NFO:NIFTY:2026-08-25:23800:PE", tradingsymbol: "NIFTY26AUG23800PE",
      exchange: "NFO", underlying: "NIFTY", expiry: "2026-08-25", strike: 23800,
      optionType: "PE", signedQuantity: -65, lotSize: 65, averagePrice: 100, lastPrice: 90, pnl: 650
    }]
  }, at);
  const manualEntries = Object.values(book.legs).filter((entry) => entry.source === "MANUAL");
  const h = createBreakEvenLifecycleHarness({ strategyBook: book, manualEntries });
  await h.settle();
  h.click(23800);
  h.click(23800);
  await h.settle();
  assert.equal(h.strategyRails().querySelectorAll(".nifty-position-spine__marker").length, 3);

  h.storage({ brokerConnection: { newValue: { connected: false, expiresAt: null, checkedAt: at } } });
  await h.settle();
  assert.equal(h.strategyRails().querySelectorAll(".nifty-position-spine__marker").length, 2,
    "disconnect removes broker control while preserving manual T positions");
  assert.equal(h.strategyRails().querySelectorAll(".nifty-strategy__card").length, 0,
    "disconnect clears stale selected-face strategy cards");
  assert.equal(h.rails().querySelectorAll(".nifty-break-even__line").length, 2,
    "selected strike keeps only its two generic quick BEs");

  h.click(23800);
  await h.settle();
  assert.equal(h.strategyRails().querySelectorAll(".nifty-position-spine__marker").length, 2);
  const manualCards = h.strategyRails().querySelectorAll(".nifty-strategy__card")
    .filter((node) => node.classList.contains("is-standard"));
  assert.equal(manualCards.length, 1,
    "manual face reveals only exact entry owner, not every T at same strike");
  assert.deepEqual(manualCards.map((card) => card.textContent.slice(0, 2)), ["T1"]);
});

test("strategy square commits on pointerdown and ignores duplicate pointer click after rerender", async () => {
  const h = chartStrategyHarness();
  await h.settle();

  const selector = h.strategyRails().querySelectorAll(".nifty-strategy__selector")[0];
  selector.dispatch("pointerdown", {
    detail: 1,
    preventDefault() {},
    stopPropagation() {}
  });
  await h.settle();
  assert.equal(h.strategyRails().querySelectorAll(".nifty-strategy__card")
    .every((card) => card.classList.contains("is-collapsed")), true,
    "direct checkbox selection does not open strategy details");
  assert.equal(h.strategyRails().querySelectorAll(".nifty-strategy__selector")
    .filter((node) => node.getAttribute("aria-pressed") === "true").length, 1);

  selector.dispatch("click", { detail: 1, stopPropagation() {} });
  await h.settle();
  assert.equal(h.strategyRails().querySelectorAll(".nifty-strategy__selector")
    .filter((node) => node.getAttribute("aria-pressed") === "true").length, 1);
});

test("combined preview keeps every strategy square reachable while compare controls original rails", async () => {
  let book = chartStrategyBook();
  book = strategyStore.applyCommand(book, {
    id: "create-s3",
    type: "CREATE_STRATEGY",
    strategyId: "s3",
    versionId: "s3-v1",
    label: "T3",
    instrumentKey: "NSE_DLY:NIFTY",
    underlying: "NIFTY",
    expiry: "2026-08-25"
  }, "2026-07-31T10:00:00.000Z");
  book = strategyStore.applyCommand(book, {
    id: "add-s3",
    type: "ADD_LEG",
    strategyId: "s3",
    versionId: "s3-v2",
    leg: { ...book.legs["leg-s1"], id: "leg-s3", optionType: "CALL" }
  }, "2026-07-31T10:00:00.000Z");
  const h = chartStrategyHarness(book);
  await h.settle();

  for (const label of ["T1", "T2", "T3"]) {
    const selector = h.strategyRails().querySelectorAll(".nifty-strategy__selector")
      .find((node) => node.getAttribute("aria-label")?.startsWith(`${label} `));
    assert.ok(selector, `${label} selector remains reachable`);
    selector.dispatch("click", { detail: 0, stopPropagation() {} });
    await h.settle();
  }

  let rails = h.strategyRails();
  assert.equal(rails.querySelectorAll(".nifty-strategy__selector")
    .filter((node) => node.getAttribute("aria-pressed") === "true").length, 3);
  assert.equal(rails.querySelectorAll(".nifty-strategy__card")
    .filter((node) => node.classList.contains("is-strategy")).length, 3);
  assert.equal(rails.querySelectorAll(".nifty-strategy__rail")
    .filter((node) => node.classList.contains("is-original")).length, 0);

  rails.querySelector(".nifty-strategy-preview__compare").dispatch("click", { stopPropagation() {} });
  await h.settle();
  rails = h.strategyRails();
  assert.equal(rails.querySelectorAll(".nifty-strategy__rail")
    .filter((node) => node.classList.contains("is-original")).length, 3);
});

test("orphan active strategies without live manual legs stay off chart", async () => {
  const h = createBreakEvenLifecycleHarness({ strategyBook: chartStrategyBook() });
  await h.settle();
  assert.equal(h.strategyRails(), null);
});

test("broker position renders on exact-Y spine and ladder badge without blocking quick break-even", async () => {
  const at = "2026-07-31T10:00:00.000Z";
  let book = strategyStore.emptyBook();
  book = strategyStore.applyCommand(book, {
    id: "broker-sync-chart",
    type: "SYNC_BROKER_POSITIONS",
    strategyId: "broker:BROKER:NFO:NIFTY:2026-08-25",
    versionId: "broker-chart-v1",
    snapshotId: "broker-chart-snapshot",
    label: "BROKER · AUG 25",
    instrumentKey: "BROKER:NFO:NIFTY",
    underlying: "NIFTY",
    expiry: "2026-08-25",
    positions: [{
      contractId: "NFO:NIFTY:2026-08-25:23800:PE", tradingsymbol: "NIFTY26AUG23800PE",
      exchange: "NFO", underlying: "NIFTY", expiry: "2026-08-25", strike: 23800,
      optionType: "PE", signedQuantity: -65, lotSize: 65, averagePrice: 100, lastPrice: 90, pnl: 650
    }]
  }, at);
  const h = createBreakEvenLifecycleHarness({ strategyBook: book, manualEntries: [] });
  await h.settle();

  const rails = h.strategyRails();
  const line = rails.querySelector(".nifty-position-spine__line");
  assert.ok(line);
  assert.notEqual(line.style.top, "0px", "spine starts at first rendered strike, not plot edge");
  assert.notEqual(line.style.height, "800px", "spine ends at last rendered strike, not plot edge");
  const visibleAtmRows = h.document.getElementById("nifty-axis-ladder")
    .querySelectorAll(".nifty-axis-ladder__row")
    .filter((row) => !row.hidden && row.classList.contains("is-atm"));
  assert.equal(visibleAtmRows.length, 1);
  assert.equal(line.dataset.atm, visibleAtmRows[0].dataset.strike);
  const marker = rails.querySelector(".nifty-position-spine__marker");
  assert.equal(marker.className, "nifty-position-spine__marker is-put is-sell");
  assert.equal(marker.textContent, "P1");
  assert.ok(marker.parent.querySelector(".nifty-position-spine__compact-select"),
    "Put token keeps its selector visible without opening P&L");
  assert.ok(marker.parent.classList.contains("is-put"));
  assert.match(marker.getAttribute("aria-label"), /Put SELL, 1 lot, strike 23,800/);
  assert.equal(rails.querySelectorAll(".nifty-strategy__label").length, 0,
    "broker break-even cards stay absent until one spine marker opens");
  const badge = h.row(23800).querySelector(".nifty-axis-ladder__badge");
  assert.ok(badge, "broker position keeps same C/P lot badge contract as manual positions");
  assert.equal(badge.textContent, "P1");
  assert.equal(badge.dataset.source, "BROKER_POSITION");

  h.click(23800);
  await h.settle();
  assert.match(h.rails().textContent, /CALL BE 23,920 · SELL BELOW ↓/);
  assert.match(h.rails().textContent, /PUT BE 23,580 · SELL ABOVE ↑/);
});

test("broker spine opens one compact P&L card and shows break-even rail only on request", async () => {
  const at = "2026-07-31T10:00:00.000Z";
  let book = strategyStore.emptyBook();
  book = strategyStore.applyCommand(book, {
    id: "broker-sync-individual-cards",
    type: "SYNC_BROKER_POSITIONS",
    strategyId: "broker:BROKER:NFO:NIFTY:2026-08-25",
    versionId: "broker-individual-v1",
    snapshotId: "broker-individual-snapshot",
    label: "BROKER · AUG 25",
    instrumentKey: "BROKER:NFO:NIFTY",
    underlying: "NIFTY",
    expiry: "2026-08-25",
    positions: [{
      contractId: "NFO:NIFTY:2026-08-25:23800:PE", tradingsymbol: "NIFTY26AUG23800PE",
      exchange: "NFO", underlying: "NIFTY", expiry: "2026-08-25", strike: 23800,
      optionType: "PE", signedQuantity: -65, lotSize: 65, averagePrice: 100, lastPrice: 90, pnl: 650
    }, {
      contractId: "NFO:NIFTY:2026-08-25:24000:CE", tradingsymbol: "NIFTY26AUG24000CE",
      exchange: "NFO", underlying: "NIFTY", expiry: "2026-08-25", strike: 24000,
      optionType: "CE", signedQuantity: 65, lotSize: 65, averagePrice: 50, lastPrice: 60, pnl: 650
    }]
  }, at);
  const h = createBreakEvenLifecycleHarness({ strategyBook: book, manualEntries: [] });
  await h.settle();
  h.click(23800);
  h.click(23800);
  await h.settle();

  let rails = h.strategyRails();
  assert.equal(rails.querySelectorAll(".nifty-position-spine__marker").length, 2);
  assert.equal(rails.querySelectorAll(".nifty-position-spine__be-rail").length, 0);
  rails.querySelectorAll(".nifty-position-spine__marker")
    .find((node) => node.getAttribute("aria-label").startsWith("Put "))
    .dispatch("click", { stopPropagation() {} });
  await h.settle();
  rails = h.strategyRails();
  const card = rails.querySelector(".nifty-position-spine__card");
  assert.ok(card);
  assert.match(card.textContent, /^P123,800 · SELLLIVE P&L/);
  assert.equal(rails.querySelectorAll(".nifty-position-spine__card").length, 1);
  assert.equal(rails.querySelectorAll(".nifty-position-spine__be-rail").length, 0);
  const showRail = card.querySelector(".nifty-position-spine__rail-toggle");
  h.document.dispatch("pointerdown", { target: showRail });
  showRail.dispatch("click", { stopPropagation() {} });
  await h.settle();
  rails = h.strategyRails();
  assert.equal(rails.querySelectorAll(".nifty-position-spine__be-rail").length, 1);
  assert.equal(rails.querySelectorAll(".nifty-position-spine__card").length, 1,
    "broker P&L card stays open after its own rail action");
  assert.equal(rails.querySelector(".nifty-position-spine__rail-toggle").textContent, "HIDE BE RAIL");

  h.document.dispatch("click", { target: { closest() { return null; } } });
  await h.settle();
  rails = h.strategyRails();
  assert.equal(rails.querySelectorAll(".nifty-position-spine__be-rail").length, 0,
    "clearing active strike also removes requested broker break-even rail");
  assert.equal(rails.querySelectorAll(".nifty-position-spine__compact")
    .filter((node) => !node.hidden).length, 2,
  "clearing active strike never removes broker Call and Put positions");
});

test("broker card CLOSE removes its card and rail before delayed placement and stays closed after capture failure", async () => {
  const book = chartStrategyBookWithSameStrikeBroker();
  const manualEntries = Object.values(book.legs).filter((entry) => entry.source === "MANUAL");
  const h = createBreakEvenLifecycleHarness({ strategyBook: book, manualEntries });
  await h.settle();

  h.click(23800);
  await h.settle();
  h.strategyRails().querySelector(".nifty-position-spine__marker")
    .dispatch("click", { stopPropagation() {} });
  await h.settle();
  h.strategyRails().querySelector(".nifty-position-spine__rail-toggle")
    .dispatch("click", { stopPropagation() {} });
  await h.settle();

  let strategyRails = h.strategyRails();
  const quickBefore = h.rails().querySelectorAll(".nifty-break-even__line").length;
  const compactBefore = strategyRails.querySelectorAll(".nifty-position-spine__compact").length;
  assert.equal(strategyRails.querySelectorAll(".nifty-position-spine__card").length, 1);
  assert.equal(strategyRails.querySelectorAll(".nifty-position-spine__be-rail").length, 1);

  h.deferAxisCaptures();
  strategyRails.querySelector(".nifty-position-spine__close")
    .dispatch("click", { stopPropagation() {} });

  assert.equal(h.pendingAxisCaptureCount(), 1, "close requests one background repaint");
  assert.equal(strategyRails.querySelectorAll(".nifty-position-spine__card").length, 0,
    "card disappears synchronously before axis capture resolves");
  assert.equal(strategyRails.querySelectorAll(".nifty-position-spine__be-rail").length, 0,
    "same broker model BE rail disappears synchronously");
  const marker = strategyRails.querySelector(".nifty-position-spine__marker");
  assert.equal(marker.classList.contains("is-open"), false);
  assert.equal(marker.getAttribute("aria-expanded"), "false");
  assert.equal(strategyRails.querySelectorAll(".nifty-position-spine__compact").length, compactBefore,
    "closing details preserves compact broker controls");
  assert.equal(h.rails().querySelectorAll(".nifty-break-even__line").length, quickBefore,
    "closing details preserves selected-strike quick BEs");

  h.resolveAxisCapture(0, { ok: false, error: "axis unavailable" });
  await h.settle();
  const recovery = h.retryPlacement();
  assert.equal(h.pendingAxisCaptureCount(), 1);
  h.resolveAxisCapture();
  await recovery;
  await h.settle();

  strategyRails = h.strategyRails();
  assert.equal(strategyRails.querySelectorAll(".nifty-position-spine__card").length, 0,
    "failed close repaint cannot resurrect broker details during recovery");
  assert.equal(strategyRails.querySelectorAll(".nifty-position-spine__be-rail").length, 0);
  assert.equal(strategyRails.querySelectorAll(".nifty-position-spine__compact").length, compactBefore);
  assert.equal(h.rails().querySelectorAll(".nifty-break-even__line").length, quickBefore);
});

test("broker card CLOSE preserves an independent open plus group and exact strategy selection", async () => {
  const at = "2026-07-31T10:00:00.000Z";
  let book = strategyStore.emptyBook();
  book = strategyStore.applyCommand(book, {
    id: "broker-sync-close-with-open-group",
    type: "SYNC_BROKER_POSITIONS",
    strategyId: "broker:BROKER:NFO:NIFTY:2026-08-25",
    versionId: "broker-close-with-open-group-v1",
    snapshotId: "broker-close-with-open-group-snapshot",
    label: "BROKER · AUG 25",
    instrumentKey: "BROKER:NFO:NIFTY",
    underlying: "NIFTY",
    expiry: "2026-08-25",
    positions: [{
      contractId: "NFO:NIFTY:2026-08-25:23800:PE", tradingsymbol: "NIFTY26AUG23800PE",
      exchange: "NFO", underlying: "NIFTY", expiry: "2026-08-25", strike: 23800,
      optionType: "PE", signedQuantity: -65, lotSize: 65, averagePrice: 84, lastPrice: 90, pnl: -390
    }, {
      contractId: "NFO:NIFTY:2026-08-25:24000:CE", tradingsymbol: "NIFTY26AUG24000CE",
      exchange: "NFO", underlying: "NIFTY", expiry: "2026-08-25", strike: 24000,
      optionType: "CE", signedQuantity: 65, lotSize: 65, averagePrice: 50, lastPrice: 60, pnl: 650
    }, {
      contractId: "NFO:NIFTY:2026-08-25:24100:CE", tradingsymbol: "NIFTY26AUG24100CE",
      exchange: "NFO", underlying: "NIFTY", expiry: "2026-08-25", strike: 24100,
      optionType: "CE", signedQuantity: -65, lotSize: 65, averagePrice: 70, lastPrice: 60, pnl: 650
    }]
  }, at);
  const h = createBreakEvenLifecycleHarness({
    strategyBook: book,
    manualEntries: [],
    initialAxisPairs: [23600, 23800, 24000, 24200, 24400]
      .map((price, index) => ({ price, y: 300 - index * 10 }))
  });
  await h.settle();

  h.strategyRails().querySelectorAll(".nifty-position-spine__marker")
    .find((marker) => marker.getAttribute("aria-label").startsWith("Put "))
    .dispatch("click", { stopPropagation() {} });
  await h.settle();
  h.strategyRails().querySelector(".nifty-position-spine__cluster-select")
    .dispatch("click", { stopPropagation() {} });
  await h.settle();
  h.strategyRails().querySelector(".nifty-position-spine__cluster-flyout")
    .querySelector(".nifty-position-spine__cluster-row-select")
    .dispatch("click", { stopPropagation() {} });
  await h.settle();
  h.strategyRails().querySelector(".nifty-position-spine__rail-toggle")
    .dispatch("click", { stopPropagation() {} });
  await h.settle();

  let strategyRails = h.strategyRails();
  const compactCount = strategyRails.querySelectorAll(".nifty-position-spine__compact").length;
  const quickCount = h.rails().querySelectorAll(".nifty-break-even__line").length;
  assert.ok(strategyRails.querySelector(".nifty-position-spine__cluster-flyout"));
  assert.equal(strategyRails.querySelector(".nifty-position-spine__cluster-select")
    .getAttribute("aria-expanded"), "true");
  assert.equal(strategyRails.querySelectorAll(".nifty-position-spine__cluster-row-select")
    .filter((selector) => selector.getAttribute("aria-pressed") === "true").length, 1);
  assert.equal(strategyRails.querySelectorAll(".nifty-position-spine__card").length, 1);
  assert.equal(strategyRails.querySelectorAll(".nifty-position-spine__be-rail").length, 1);

  h.deferAxisCaptures();
  strategyRails.querySelector(".nifty-position-spine__close")
    .dispatch("click", { stopPropagation() {} });

  assert.equal(strategyRails.querySelectorAll(".nifty-position-spine__card").length, 0);
  assert.equal(strategyRails.querySelectorAll(".nifty-position-spine__be-rail").length, 0);
  assert.ok(strategyRails.querySelector(".nifty-position-spine__cluster-flyout"),
    "closing broker details cannot collapse unrelated grouped choices");
  assert.equal(strategyRails.querySelector(".nifty-position-spine__cluster-select")
    .getAttribute("aria-expanded"), "true");
  assert.equal(strategyRails.querySelectorAll(".nifty-position-spine__cluster-row-select")
    .filter((selector) => selector.getAttribute("aria-pressed") === "true").length, 1,
  "closing details cannot clear exact strategy selection");
  assert.equal(strategyRails.querySelectorAll(".nifty-position-spine__compact").length, compactCount);
  assert.equal(h.rails().querySelectorAll(".nifty-break-even__line").length, quickCount);
  const putMarker = strategyRails.querySelectorAll(".nifty-position-spine__marker")
    .find((marker) => marker.getAttribute("aria-label").startsWith("Put "));
  assert.equal(putMarker.classList.contains("is-open"), false);
  assert.equal(putMarker.getAttribute("aria-expanded"), "false");
});

test("opening broker P&L card caps quick BE labels before actual card without changing rail values or Y", async () => {
  const at = "2026-07-31T10:00:00.000Z";
  let book = strategyStore.emptyBook();
  book = strategyStore.applyCommand(book, {
    id: "broker-sync-be-card-clearance",
    type: "SYNC_BROKER_POSITIONS",
    strategyId: "broker:BROKER:NFO:NIFTY:2026-08-25",
    versionId: "broker-be-card-clearance-v1",
    snapshotId: "broker-be-card-clearance-snapshot",
    label: "BROKER · AUG 25",
    instrumentKey: "BROKER:NFO:NIFTY",
    underlying: "NIFTY",
    expiry: "2026-08-25",
    positions: [{
      contractId: "NFO:NIFTY:2026-08-25:24200:PE", tradingsymbol: "NIFTY26AUG24200PE",
      exchange: "NFO", underlying: "NIFTY", expiry: "2026-08-25", strike: 24200,
      optionType: "PE", signedQuantity: -65, lotSize: 65, averagePrice: 118.25,
      lastPrice: 84, pnl: 2226.25
    }]
  }, at);
  const h = createBreakEvenLifecycleHarness({
    strategyBook: book,
    manualEntries: [],
    elementBounds(node) {
      if (node.classList.contains("nifty-axis-ladder__row")) {
        return { left: 1280, top: 20, right: 1500, bottom: 40 };
      }
      if (node.classList.contains("nifty-position-spine__card")) {
        const right = 1600 - Number.parseFloat(node.style.right || "0");
        const top = Number.parseFloat(node.style.top || "0");
        return { left: right - 246, top, right, bottom: top + 98 };
      }
      if (node.classList.contains("nifty-position-spine__compact")) {
        const right = 1600 - Number.parseFloat(node.style.right || "0") + 47;
        const top = Number.parseFloat(node.style.top || "0");
        return { left: right - 47, top, right, bottom: top + 18 };
      }
      return null;
    }
  });
  await h.settle();
  h.click(24200);
  await h.settle();

  const before = h.rails().querySelectorAll(".nifty-break-even__label").map((label) => ({
    exact: label.dataset.exact,
    top: label.parent.style.top
  }));
  h.strategyRails().querySelector(".nifty-position-spine__marker")
    .dispatch("click", { stopPropagation() {} });
  await h.settle();

  const card = h.strategyRails().querySelector(".nifty-position-spine__card");
  const cardLeft = card.getBoundingClientRect().left;
  const afterLabels = h.rails().querySelectorAll(".nifty-break-even__label");
  assert.ok(afterLabels.length === 2);
  afterLabels.forEach((label) => {
    const labelRight = 1600 - Number.parseFloat(label.style.right);
    assert.ok(labelRight <= cardLeft - 6,
      `quick BE right ${labelRight} must clear open broker card left ${cardLeft}`);
  });
  assert.deepEqual(afterLabels.map((label) => ({
    exact: label.dataset.exact,
    top: label.parent.style.top
  })), before, "opening card changes horizontal clearance only");
});

test("broker spine compact selectors build combined preview without opening P&L cards", async () => {
  const at = "2026-07-31T10:00:00.000Z";
  let book = strategyStore.emptyBook();
  book = strategyStore.applyCommand(book, {
    id: "broker-sync-selectable-positions",
    type: "SYNC_BROKER_POSITIONS",
    strategyId: "broker:BROKER:NFO:NIFTY:2026-08-25",
    versionId: "broker-selectable-v1",
    snapshotId: "broker-selectable-snapshot",
    label: "BROKER · AUG 25",
    instrumentKey: "BROKER:NFO:NIFTY",
    underlying: "NIFTY",
    expiry: "2026-08-25",
    positions: [{
      contractId: "NFO:NIFTY:2026-08-25:23800:PE", tradingsymbol: "NIFTY26AUG23800PE",
      exchange: "NFO", underlying: "NIFTY", expiry: "2026-08-25", strike: 23800,
      optionType: "PE", signedQuantity: -65, lotSize: 65, averagePrice: 100, lastPrice: 90, pnl: 650
    }, {
      contractId: "NFO:NIFTY:2026-08-25:24000:CE", tradingsymbol: "NIFTY26AUG24000CE",
      exchange: "NFO", underlying: "NIFTY", expiry: "2026-08-25", strike: 24000,
      optionType: "CE", signedQuantity: 65, lotSize: 65, averagePrice: 50, lastPrice: 60, pnl: 650
    }]
  }, at);
  const h = createBreakEvenLifecycleHarness({ strategyBook: book, manualEntries: [] });
  await h.settle();
  h.select(23750);
  await h.settle();

  for (const side of ["is-put", "is-call"]) {
    const compact = h.strategyRails().querySelectorAll(".nifty-position-spine__compact")
      .find((node) => node.classList.contains(side));
    compact.querySelector(".nifty-position-spine__compact-select")
      .dispatch("click", { detail: 0, stopPropagation() {} });
    await h.settle();
  }

  const rails = h.strategyRails();
  assert.equal(rails.querySelectorAll(".nifty-position-spine__card").length, 0,
    "selection does not force an individual P&L card open");
  assert.ok(rails.querySelector(".nifty-strategy-preview"));
  assert.ok(rails.querySelectorAll(".nifty-strategy__label")
    .some((node) => node.textContent.startsWith("COMBINED BE ")));
});

test("Call and Put headers start above highest visible broker control", async () => {
  const at = "2026-07-31T10:00:00.000Z";
  let book = chartStrategyBook();
  book = strategyStore.applyCommand(book, {
    id: "broker-sync-header-bounds",
    type: "SYNC_BROKER_POSITIONS",
    strategyId: "broker:BROKER:NFO:NIFTY:2026-08-25",
    versionId: "broker-header-bounds-v1",
    snapshotId: "broker-header-bounds-snapshot",
    label: "BROKER · AUG 25",
    instrumentKey: "BROKER:NFO:NIFTY",
    underlying: "NIFTY",
    expiry: "2026-08-25",
    positions: [{
      contractId: "NFO:NIFTY:2026-08-25:24550:CE", tradingsymbol: "NIFTY26AUG24550CE",
      exchange: "NFO", underlying: "NIFTY", expiry: "2026-08-25", strike: 24550,
      optionType: "CE", signedQuantity: -65, lotSize: 65, averagePrice: 50, lastPrice: 40, pnl: 650
    }]
  }, at);
  const axisPairs = Array.from({ length: 21 }, (_, index) => ({
    price: 23450 + index * 50,
    y: 700 - index * 25
  }));
  const manualEntries = Object.values(book.legs).filter((entry) => entry.source === "MANUAL");
  const h = createBreakEvenLifecycleHarness({ strategyBook: book, manualEntries, initialAxisPairs: axisPairs });
  await h.settle();

  const rails = h.strategyRails();
  const control = rails.querySelector(".nifty-position-spine__compact");
  const callHeader = rails.querySelectorAll(".nifty-position-spine__lane-label")
    .find((node) => node.classList.contains("is-call"));
  const divider = rails.querySelector(".nifty-position-spine__line");
  assert.ok(control && callHeader && divider);
  assert.ok(Number.parseFloat(callHeader.style.top) < Number.parseFloat(control.style.top),
    "C/P header must precede first visible control");
  assert.ok(Number.parseFloat(divider.style.top) <= Number.parseFloat(control.style.top) + 9,
    "center divider must start at first visible control anchor");
});

test("manual and broker controls share columns by Call and Put type", async () => {
  const at = "2026-07-31T10:00:00.000Z";
  let book = chartStrategyBook();
  book = strategyStore.applyCommand(book, {
    id: "broker-sync-source-neutral-columns",
    type: "SYNC_BROKER_POSITIONS",
    strategyId: "broker:BROKER:NFO:NIFTY:2026-08-25",
    versionId: "broker-source-neutral-columns-v1",
    snapshotId: "broker-source-neutral-columns-snapshot",
    label: "BROKER · AUG 25",
    instrumentKey: "BROKER:NFO:NIFTY",
    underlying: "NIFTY",
    expiry: "2026-08-25",
    positions: [{
      contractId: "NFO:NIFTY:2026-08-25:23800:PE", tradingsymbol: "NIFTY26AUG23800PE",
      exchange: "NFO", underlying: "NIFTY", expiry: "2026-08-25", strike: 23800,
      optionType: "PE", signedQuantity: -65, lotSize: 65, averagePrice: 100, lastPrice: 90, pnl: 650
    }, {
      contractId: "NFO:NIFTY:2026-08-25:24200:CE", tradingsymbol: "NIFTY26AUG24200CE",
      exchange: "NFO", underlying: "NIFTY", expiry: "2026-08-25", strike: 24200,
      optionType: "CE", signedQuantity: 65, lotSize: 65, averagePrice: 50, lastPrice: 60, pnl: 650
    }]
  }, at);
  const manualEntries = Object.values(book.legs).filter((entry) => entry.source === "MANUAL");
  const h = createBreakEvenLifecycleHarness({ strategyBook: book, manualEntries });
  await h.settle();
  h.click(23800);
  h.click(23800);
  await h.settle();

  h.strategyRails().querySelector(".nifty-strategy__selector")
    .dispatch("click", { stopPropagation() {} });
  await h.settle();

  const rails = h.strategyRails();
  const cards = rails.querySelectorAll(".nifty-strategy__card");
  const manualCall = cards.find((node) => node.textContent.startsWith("T1 "));
  const manualPut = cards.find((node) => node.textContent.startsWith("T2 "));
  const brokerCall = rails.querySelectorAll(".nifty-position-spine__compact")
    .find((node) => node.classList.contains("is-call"));
  const brokerPut = rails.querySelectorAll(".nifty-position-spine__compact")
    .find((node) => node.classList.contains("is-put"));

  assert.equal(manualCall.style.right, brokerCall.style.right,
    "manual and broker Calls own one column");
  assert.equal(manualPut.style.right, brokerPut.style.right,
    "manual and broker Puts own one column");
  assert.notEqual(manualCall.style.right, manualPut.style.right,
    "Call and Put columns remain separate");
  assert.equal(new Set([manualCall, manualPut, brokerCall, brokerPut]
    .map((node) => node.style.right)).size, 2);
});

test("opposite-side broker control nudges shared rail header without moving exact BE rail", async () => {
  const at = "2026-07-31T10:00:00.000Z";
  let book = chartStrategyBook();
  book = strategyStore.applyCommand(book, {
    id: "broker-sync-opposite-header-collision",
    type: "SYNC_BROKER_POSITIONS",
    strategyId: "broker:BROKER:NFO:NIFTY:2026-08-25",
    versionId: "broker-opposite-header-collision-v1",
    snapshotId: "broker-opposite-header-collision-snapshot",
    label: "BROKER · AUG 25",
    instrumentKey: "BROKER:NFO:NIFTY",
    underlying: "NIFTY",
    expiry: "2026-08-25",
    positions: [{
      contractId: "NFO:NIFTY:2026-08-25:23700:CE", tradingsymbol: "NIFTY26AUG23700CE",
      exchange: "NFO", underlying: "NIFTY", expiry: "2026-08-25", strike: 23700,
      optionType: "CE", signedQuantity: 65, lotSize: 65, averagePrice: 50, lastPrice: 60, pnl: 650
    }]
  }, at);
  const manualEntries = Object.values(book.legs).filter((entry) => entry.source === "MANUAL");
  const h = createBreakEvenLifecycleHarness({
    strategyBook: book,
    manualEntries,
    initialAxisPairs: [23600, 23700, 23800, 23900, 24000].map((price, index) => ({
      price,
      y: 300 - index * 40
    }))
  });
  await h.settle();
  h.click(23800);
  h.click(23800);
  await h.settle();

  h.strategyRails().querySelectorAll(".nifty-strategy__selector")
    .find((node) => node.getAttribute("aria-label")?.startsWith("T2 "))
    .dispatch("click", { stopPropagation() {} });
  await h.settle();

  const rails = h.strategyRails();
  const manualPut = rails.querySelectorAll(".nifty-strategy__card")
    .find((node) => node.textContent.startsWith("T2 "));
  const brokerCall = rails.querySelectorAll(".nifty-position-spine__compact")
    .find((node) => node.classList.contains("is-call") && !node.hidden);
  const exactRail = rails.querySelectorAll(".nifty-strategy__rail")
    .find((node) => node.dataset.strategyId === "s2");
  assert.ok(manualPut, "manual Put shared header rendered");
  assert.ok(brokerCall, "opposite Call broker control rendered outside grouping");
  assert.ok(exactRail, "manual Put exact BE rail rendered");

  const manualTop = Number.parseFloat(manualPut.style.top);
  const brokerTop = Number.parseFloat(brokerCall.style.top);
  assert.ok(manualTop + 18 <= brokerTop || brokerTop + 18 <= manualTop,
    "shared manual header and opposite-side broker control cannot occupy same visual row");
  assert.equal(Number.parseFloat(exactRail.style.top), 300 - 40,
    "collision clearance moves header only, never exact BE rail");
});

test("colliding manual and broker Calls collapse through restored Call-only position group", async () => {
  const at = "2026-07-31T10:00:00.000Z";
  let book = chartStrategyBook();
  book = strategyStore.applyCommand(book, {
    id: "broker-sync-manual-call-collision",
    type: "SYNC_BROKER_POSITIONS",
    strategyId: "broker:BROKER:NFO:NIFTY:2026-08-25",
    versionId: "broker-manual-call-collision-v1",
    snapshotId: "broker-manual-call-collision-snapshot",
    label: "BROKER · AUG 25",
    instrumentKey: "BROKER:NFO:NIFTY",
    underlying: "NIFTY",
    expiry: "2026-08-25",
    positions: [{
      contractId: "NFO:NIFTY:2026-08-25:23800:CE", tradingsymbol: "NIFTY26AUG23800CE",
      exchange: "NFO", underlying: "NIFTY", expiry: "2026-08-25", strike: 23800,
      optionType: "CE", signedQuantity: 65, lotSize: 65, averagePrice: 50, lastPrice: 60, pnl: 650
    }]
  }, at);
  const manualEntries = Object.values(book.legs).filter((entry) => entry.source === "MANUAL");
  const h = createBreakEvenLifecycleHarness({ strategyBook: book, manualEntries });
  await h.settle();
  h.click(23800);
  await h.settle();

  let rails = h.strategyRails();
  const group = rails.querySelector(".nifty-position-spine__cluster-count");
  let selector = rails.querySelector(".nifty-position-spine__cluster-select");
  assert.ok(group);
  assert.equal(group.textContent, "+2");
  assert.match(selector.getAttribute("aria-label"), /2 grouped Call positions/);
  assert.equal(rails.querySelectorAll(".nifty-position-spine__compact")
    .filter((node) => node.classList.contains("is-call") && node.hidden).length, 2);
  assert.equal(rails.querySelectorAll(".nifty-position-spine__compact")
    .filter((node) => node.classList.contains("is-call")
      && node.classList.contains("is-grouped")
      && node.querySelector(".nifty-position-spine__marker")?.textContent === "C1").length, 1,
  "group hides full broker C1 control, not only its checkbox");

  selector.dispatch("click", { stopPropagation() {} });
  await h.settle();
  rails = h.strategyRails();
  const flyout = rails.querySelector(".nifty-position-spine__cluster-flyout");
  assert.ok(flyout, "outer square opens grouped manual and broker identities");
  const manualRow = flyout.querySelectorAll(".nifty-position-spine__cluster-row")
    .find((row) => row.textContent.startsWith("T1 "));
  const brokerRow = flyout.querySelectorAll(".nifty-position-spine__cluster-row")
    .find((row) => row.textContent.startsWith("C1 "));
  assert.ok(manualRow && brokerRow);
  const manualIdentitySelector = manualRow.querySelector(".nifty-position-spine__cluster-row-select");
  h.document.dispatch("pointerdown", { target: manualIdentitySelector });
  manualIdentitySelector.dispatch("click", { stopPropagation() {} });
  await h.settle();

  rails = h.strategyRails();
  selector = rails.querySelector(".nifty-position-spine__cluster-select");
  assert.equal(selector.getAttribute("aria-expanded"), "true",
    "selecting exact T identity keeps grouped choices open");
  const selectedFlyout = rails.querySelector(".nifty-position-spine__cluster-flyout");
  const selectedManual = selectedFlyout.querySelectorAll(".nifty-position-spine__cluster-row")
    .find((row) => row.textContent.startsWith("T1 "));
  const unselectedBroker = selectedFlyout.querySelectorAll(".nifty-position-spine__cluster-row")
    .find((row) => row.textContent.startsWith("C1 "));
  assert.equal(selectedManual.querySelector(".nifty-position-spine__cluster-row-select")
    .getAttribute("aria-pressed"), "true");
  assert.equal(unselectedBroker.querySelector(".nifty-position-spine__cluster-row-select")
    .getAttribute("aria-pressed"), "false",
  "exact T selection never absorbs adjacent broker C1");

  h.document.dispatch("pointerdown", { target: { closest() { return null; } } });
  rails = h.strategyRails();
  assert.equal(rails.querySelector(".nifty-position-spine__cluster-flyout"), null,
    "outside pointer removes grouped choices synchronously");
  assert.equal(rails.querySelector(".nifty-position-spine__cluster-select")
    .getAttribute("aria-expanded"), "false",
  "outside pointer synchronously closes the group opener");

  await h.settle();
  rails = h.strategyRails();
  rails.querySelector(".nifty-position-spine__cluster-select")
    .dispatch("click", { stopPropagation() {} });
  await h.settle();
  assert.equal(h.strategyRails().querySelector(".nifty-position-spine__cluster-flyout")
    .querySelectorAll(".nifty-position-spine__cluster-row-select")
    .filter((node) => node.getAttribute("aria-pressed") === "true").length, 1,
  "reopening group preserves exact prior checkbox selection");
});

test("nearby broker Call and Put positions remain in separate type columns", async () => {
  const at = "2026-07-31T10:00:00.000Z";
  let book = strategyStore.emptyBook();
  book = strategyStore.applyCommand(book, {
    id: "broker-sync-cross-side-group",
    type: "SYNC_BROKER_POSITIONS",
    strategyId: "broker:BROKER:NFO:NIFTY:2026-08-25",
    versionId: "broker-cross-side-group-v1",
    snapshotId: "broker-cross-side-group-snapshot",
    label: "BROKER · AUG 25",
    instrumentKey: "BROKER:NFO:NIFTY",
    underlying: "NIFTY",
    expiry: "2026-08-25",
    positions: [{
      contractId: "NFO:NIFTY:2026-08-25:24000:CE", tradingsymbol: "NIFTY26AUG24000CE",
      exchange: "NFO", underlying: "NIFTY", expiry: "2026-08-25", strike: 24000,
      optionType: "CE", signedQuantity: 65, lotSize: 65, averagePrice: 50, lastPrice: 60, pnl: 650
    }, {
      contractId: "NFO:NIFTY:2026-08-25:24100:PE", tradingsymbol: "NIFTY26AUG24100PE",
      exchange: "NFO", underlying: "NIFTY", expiry: "2026-08-25", strike: 24100,
      optionType: "PE", signedQuantity: -65, lotSize: 65, averagePrice: 70, lastPrice: 60, pnl: 650
    }]
  }, at);
  const h = createBreakEvenLifecycleHarness({
    strategyBook: book,
    manualEntries: [],
    initialAxisPairs: [23800, 24000, 24200, 24400]
      .map((price, index) => ({ price, y: 300 - index * 10 }))
  });
  await h.settle();

  const rails = h.strategyRails();
  const compacts = rails.querySelectorAll(".nifty-position-spine__compact");
  assert.equal(compacts.length, 2);
  assert.equal(rails.querySelector(".nifty-position-spine__cluster"), null);
  assert.notEqual(compacts[0].style.right, compacts[1].style.right);
});

test("chart controls expose only source-neutral Call and Put columns", () => {
  const layout = api.positionSpineLayout(720, { left: 20, right: 1200 }, 1440);
  assert.equal(layout.ladderLeft, 720);
  assert.equal(layout.call.right - layout.call.left, 47);
  assert.equal(layout.put.right - layout.put.left, 47);
  assert.ok(layout.call.right < layout.spineX);
  assert.ok(layout.put.left > layout.spineX);
  assert.ok(layout.put.right <= layout.ladderLeft - 4);
  assert.equal(layout.strategy, undefined);
  assert.equal(layout.broker, undefined);
});

test("quick break-even labels stop before broker and strategy control lanes", () => {
  const ladderLeft = 720;
  const rect = { left: 20, right: 1200 };
  const layout = api.positionSpineLayout(ladderLeft, rect, 1440);
  const labelRight = api.breakEvenLabelRight(ladderLeft, rect, 1440, true);
  assert.ok(labelRight <= layout.call.left - 6,
    "BE text right edge must end before leftmost control lane");
  assert.equal(api.breakEvenLabelRight(ladderLeft, rect, 1440, false), ladderLeft,
    "without broker controls existing label placement remains unchanged");
});

test("rendered broker and strategy blockers cap quick break-even labels at their actual left edge", () => {
  const plotRect = { left: 20, right: 1200 };
  assert.equal(typeof api.breakEvenLabelRightForRenderedBlockers, "function");
  const blockers = [
    { kind: "collapsed-strategy", left: 1010, right: 1060, top: 100, bottom: 118 },
    { kind: "open-strategy-card", left: 840, right: 1060, top: 140, bottom: 240 },
    { kind: "open-broker-card", left: 760, right: 1006, top: 260, bottom: 358 },
    { kind: "open-flyout", left: 610, right: 774, top: 380, bottom: 454 },
    { kind: "hidden-control", hidden: true, left: 300, right: 350, top: 0, bottom: 18 },
    { kind: "display-none-control", left: 0, right: 0, top: 0, bottom: 0 }
  ];

  assert.equal(api.breakEvenLabelRightForRenderedBlockers(1100, plotRect, blockers, 6), 604,
    "leftmost visible flyout owns the horizontal clearance boundary");
  assert.equal(api.breakEvenLabelRightForRenderedBlockers(1100, plotRect, [], 6), 1100,
    "no rendered blocker preserves existing label placement");
});

test("live quick BE labels reserve full risk-label gap from expanded strategy controls", () => {
  assert.match(contentSource,
    /breakEvenLabelRightForRenderedBlockers\([\s\S]*?renderedStrategyBlockerRects\([\s\S]*?RISK_LABEL_GAP_PX\s*\)/,
    "expanded T | BE | Margin control needs human-visible separation from quick BE label");
});

test("quick BE blocker collector includes legacy plus-N edge groups and flyouts", () => {
  const collector = contentSource.match(/function renderedStrategyBlockerRects\(rootNodeValue\)\s*\{([\s\S]*?)\n  \}/)?.[1] || "";
  for (const selector of [
    ".nifty-edge-stack__group",
    ".nifty-edge-stack__selector",
    ".nifty-edge-stack__flyout"
  ]) {
    assert.match(collector, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `${selector} participates in actual rendered-boundary measurement`);
  }
});

test("same-side broker collisions restore closed plus group with nothing selected", async () => {
  const at = "2026-07-31T10:00:00.000Z";
  let book = strategyStore.emptyBook();
  book = strategyStore.applyCommand(book, {
    id: "broker-sync-collision-group",
    type: "SYNC_BROKER_POSITIONS",
    strategyId: "broker:BROKER:NFO:NIFTY:2026-08-25",
    versionId: "broker-collision-v1",
    snapshotId: "broker-collision-snapshot",
    label: "BROKER · AUG 25",
    instrumentKey: "BROKER:NFO:NIFTY",
    underlying: "NIFTY",
    expiry: "2026-08-25",
    positions: [{
      contractId: "NFO:NIFTY:2026-08-25:24000:CE", tradingsymbol: "NIFTY26AUG24000CE",
      exchange: "NFO", underlying: "NIFTY", expiry: "2026-08-25", strike: 24000,
      optionType: "CE", signedQuantity: 65, lotSize: 65, averagePrice: 50, lastPrice: 60, pnl: 650
    }, {
      contractId: "NFO:NIFTY:2026-08-25:24100:CE", tradingsymbol: "NIFTY26AUG24100CE",
      exchange: "NFO", underlying: "NIFTY", expiry: "2026-08-25", strike: 24100,
      optionType: "CE", signedQuantity: -65, lotSize: 65, averagePrice: 70, lastPrice: 60, pnl: 650
    }]
  }, at);
  const h = createBreakEvenLifecycleHarness({
    strategyBook: book,
    manualEntries: [],
    initialAxisPairs: [23800, 24000, 24200, 24400].map((price, index) => ({ price, y: 300 - index * 10 }))
  });
  await h.settle();

  const rails = h.strategyRails();
  const group = rails.querySelector(".nifty-position-spine__cluster-count");
  const opener = rails.querySelector(".nifty-position-spine__cluster-select");
  assert.ok(group);
  assert.equal(group.textContent, "+2");
  assert.equal(opener.getAttribute("aria-expanded"), "false");
  assert.equal(opener.getAttribute("aria-pressed"), null,
    "closed group opener is navigation, never selection");
  assert.equal(rails.querySelectorAll(".nifty-position-spine__compact-select")
    .filter((node) => node.getAttribute("aria-pressed") === "true").length, 0,
  "closed group selects nothing");
});

test("open grouped-position flyout caps quick BE labels without changing rail values or Y", async () => {
  const at = "2026-07-31T10:00:00.000Z";
  let book = strategyStore.emptyBook();
  book = strategyStore.applyCommand(book, {
    id: "broker-sync-flyout-clearance",
    type: "SYNC_BROKER_POSITIONS",
    strategyId: "broker:BROKER:NFO:NIFTY:2026-08-25",
    versionId: "broker-flyout-clearance-v1",
    snapshotId: "broker-flyout-clearance-snapshot",
    label: "BROKER · AUG 25",
    instrumentKey: "BROKER:NFO:NIFTY",
    underlying: "NIFTY",
    expiry: "2026-08-25",
    positions: [{
      contractId: "NFO:NIFTY:2026-08-25:24000:CE", tradingsymbol: "NIFTY26AUG24000CE",
      exchange: "NFO", underlying: "NIFTY", expiry: "2026-08-25", strike: 24000,
      optionType: "CE", signedQuantity: 65, lotSize: 65, averagePrice: 50, lastPrice: 60, pnl: 650
    }, {
      contractId: "NFO:NIFTY:2026-08-25:24100:CE", tradingsymbol: "NIFTY26AUG24100CE",
      exchange: "NFO", underlying: "NIFTY", expiry: "2026-08-25", strike: 24100,
      optionType: "CE", signedQuantity: -65, lotSize: 65, averagePrice: 70, lastPrice: 60, pnl: 650
    }]
  }, at);
  const h = createBreakEvenLifecycleHarness({
    strategyBook: book,
    manualEntries: [],
    initialAxisPairs: [23800, 24000, 24200, 24400].map((price, index) => ({ price, y: 300 - index * 10 })),
    elementBounds(node) {
      if (node.classList.contains("nifty-axis-ladder__row")) {
        return { left: 1280, top: 20, right: 1500, bottom: 40 };
      }
      if (node.classList.contains("nifty-position-spine__cluster")) {
        const right = 1600 - Number.parseFloat(node.style.right || "0") + 47;
        const top = Number.parseFloat(node.style.top || "0");
        return { left: right - 47, top, right, bottom: top + 18 };
      }
      if (node.classList.contains("nifty-position-spine__cluster-flyout")) {
        const right = 1600 - Number.parseFloat(node.style.right || "0");
        const top = Number.parseFloat(node.style.top || "0");
        return { left: right - 164, top, right, bottom: top + 50 };
      }
      return null;
    }
  });
  await h.settle();
  h.click(24000);
  await h.settle();
  const before = h.rails().querySelectorAll(".nifty-break-even__label").map((label) => ({
    exact: label.dataset.exact,
    top: label.parent.style.top
  }));

  h.strategyRails().querySelector(".nifty-position-spine__cluster-select")
    .dispatch("click", { stopPropagation() {} });
  await h.settle();
  const flyout = h.strategyRails().querySelector(".nifty-position-spine__cluster-flyout");
  const flyoutLeft = flyout.getBoundingClientRect().left;
  h.rails().querySelectorAll(".nifty-break-even__label").forEach((label) => {
    const right = 1600 - Number.parseFloat(label.style.right);
    assert.ok(right <= flyoutLeft - 6, `quick BE right ${right} must clear flyout left ${flyoutLeft}`);
  });
  assert.deepEqual(h.rails().querySelectorAll(".nifty-break-even__label").map((label) => ({
    exact: label.dataset.exact,
    top: label.parent.style.top
  })), before, "opening flyout changes horizontal clearance only");
});

test("live broker strategy storage update adds exact Call marker and matching ladder badge", async () => {
  const at = "2026-07-31T10:00:00.000Z";
  const empty = strategyStore.emptyBook();
  const h = createBreakEvenLifecycleHarness({ strategyBook: empty, manualEntries: [] });
  await h.settle();
  assert.equal(h.row(23800).querySelector(".nifty-axis-ladder__badge"), null);

  const book = strategyStore.applyCommand(empty, {
    id: "broker-live-update",
    type: "SYNC_BROKER_POSITIONS",
    strategyId: "broker:BROKER:NFO:NIFTY:2026-08-25",
    versionId: "broker-live-v1",
    snapshotId: "broker-live-snapshot",
    label: "BROKER · AUG 25",
    instrumentKey: "BROKER:NFO:NIFTY",
    underlying: "NIFTY",
    expiry: "2026-08-25",
    positions: [{
      contractId: "NFO:NIFTY:2026-08-25:23800:CE", tradingsymbol: "NIFTY26AUG23800CE",
      exchange: "NFO", underlying: "NIFTY", expiry: "2026-08-25", strike: 23800,
      optionType: "CE", signedQuantity: 130, lotSize: 65, averagePrice: 100, lastPrice: 110, pnl: 1300
    }]
  }, at);
  h.storage({ strategyBook: { newValue: book } });
  await h.settle();

  const badge = h.row(23800).querySelector(".nifty-axis-ladder__badge");
  assert.ok(badge);
  assert.equal(badge.textContent, "C2");
  assert.equal(badge.dataset.source, "BROKER_POSITION");
  const marker = h.strategyRails().querySelector(".nifty-position-spine__marker");
  assert.equal(marker.className, "nifty-position-spine__marker is-call is-buy");
  assert.equal(marker.textContent, "C2");
  assert.ok(marker.parent.classList.contains("is-call"));
  assert.ok(marker.parent.querySelector(".nifty-position-spine__compact-select"));
  assert.match(marker.getAttribute("aria-label"), /Call BUY, 2 lots, strike 23,800/);
});

test("outside click collapses opened strategy P&L card", async () => {
  const h = chartStrategyHarness();
  await h.settle();

  let rails = h.strategyRails();
  rails.querySelector(".nifty-strategy__label").dispatch("click", { stopPropagation() {} });
  await h.settle();
  assert.ok(h.strategyRails().querySelector(".nifty-strategy__trades"), "strategy details start expanded");

  h.document.dispatch("click", { target: { closest() { return null; } } });
  await h.settle();

  rails = h.strategyRails();
  assert.ok(rails, "outside press preserves permanent position spine");
  assert.equal(rails.querySelectorAll(".nifty-position-spine__marker").length, 2);
  assert.equal(rails.querySelectorAll(".nifty-strategy__card").length, 0);
  assert.equal(rails.querySelectorAll(".nifty-strategy__rail").length, 0);
});

test("expanded Call details and neighboring Put remain in separate horizontal columns", async () => {
  const h = chartStrategyHarness();
  await h.settle();

  h.strategyRails().querySelector(".nifty-strategy__selector")
    .dispatch("click", { stopPropagation() {} });
  await h.settle();

  const firstLabel = h.strategyRails().querySelectorAll(".nifty-strategy__label")
    .find((node) => node.textContent.startsWith("T1 "));
  firstLabel.dispatch("click", { stopPropagation() {} });
  await h.settle();

  const cards = h.strategyRails().querySelectorAll(".nifty-strategy__card");
  const expanded = cards.find((node) => node.textContent.startsWith("T1 "));
  const neighbor = cards.find((node) => node.textContent.startsWith("T2 "));
  assert.notEqual(expanded.style.right, neighbor.style.right,
    "Call and Put cards remain horizontally separated while one is expanded");
});

test("combined preview saves permanently from chart after explicit destination choice", async () => {
  const h = chartStrategyHarness();
  await h.settle();

  for (const strategyLabel of ["T1", "T2"]) {
    const selector = h.strategyRails().querySelectorAll(".nifty-strategy__selector")
      .find((node) => node.getAttribute("aria-label")?.startsWith(`${strategyLabel} `));
    selector.dispatch("click", { detail: 0, stopPropagation() {} });
    await h.settle();
  }

  let rails = h.strategyRails();
  const save = rails.querySelector(".nifty-strategy-preview__save");
  assert.ok(save, "chart preview exposes permanent save action");
  save.dispatch("click", { stopPropagation() {} });

  const chooser = rails.querySelector(".nifty-strategy-preview__save-chooser");
  assert.ok(chooser, "save asks for explicit destination");
  assert.deepEqual(chooser.querySelectorAll(".nifty-strategy-preview__save-choice").map((node) => node.textContent), [
    "CREATE NEW STRATEGY",
    "MERGE INTO T1",
    "MERGE INTO T2"
  ]);

  chooser.querySelectorAll(".nifty-strategy-preview__save-choice")[0]
    .dispatch("click", { stopPropagation() {} });
  await h.settle();

  assert.equal(h.strategyMutationMessages().filter((command) => command.type === "MERGE_STRATEGIES").length, 1);
  rails = h.strategyRails();
  assert.ok(rails, "permanent save retains new strategy position spine");
  assert.equal(rails.querySelectorAll(".nifty-position-spine__marker").length, 2);
  assert.equal(rails.querySelectorAll(".nifty-strategy__card").length, 0);
  assert.deepEqual(strategyStore.activeStrategies(h.strategyBook(), "NSE_DLY:NIFTY", "2026-08-25")
    .map((strategy) => strategy.label), ["T3"]);

  h.click(23800);
  await h.settle();
  assert.deepEqual(h.strategyRails().querySelectorAll(".nifty-strategy__label")
    .map((node) => node.textContent.trim()), ["T3 BE 23,600 | Margin —", "T3 BE 24,000 | Margin —"]);
  assert.equal(h.strategyRails().querySelectorAll(".nifty-strategy__rail").length, 0,
    "new saved T3 BE rails remain hidden until its checkbox is selected");
});

test("combined preview save chooser cancels without mutation or selection loss", async () => {
  const h = chartStrategyHarness();
  await h.settle();

  await selectEveryReachableStrategy(h);
  const rails = h.strategyRails();
  rails.querySelector(".nifty-strategy-preview__save").dispatch("click", { stopPropagation() {} });
  rails.querySelector(".nifty-strategy-preview__save-cancel").dispatch("click", { stopPropagation() {} });

  assert.equal(rails.querySelector(".nifty-strategy-preview__save-chooser"), null);
  assert.ok(rails.querySelector(".nifty-strategy-preview"));
  assert.equal(rails.querySelectorAll(".nifty-strategy__selector")
    .filter((node) => node.getAttribute("aria-pressed") === "true").length, 2);
  assert.equal(h.strategyMutationMessages().filter((command) => command.type === "MERGE_STRATEGIES").length, 0);
});

test("combined preview save chooser is named, focuses first destination, and Escape returns focus", async () => {
  const h = chartStrategyHarness();
  await h.settle();

  await selectEveryReachableStrategy(h);
  const rails = h.strategyRails();
  const save = rails.querySelector(".nifty-strategy-preview__save");
  save.dispatch("click", { stopPropagation() {} });

  const chooser = rails.querySelector(".nifty-strategy-preview__save-chooser");
  assert.equal(chooser.getAttribute("role"), "dialog");
  assert.equal(chooser.getAttribute("aria-label"), "Save combined strategy");
  assert.equal(h.document.activeElement?.textContent, "CREATE NEW STRATEGY");

  chooser.dispatch("keydown", { key: "Escape", stopPropagation() {}, preventDefault() {} });
  assert.equal(rails.querySelector(".nifty-strategy-preview__save-chooser"), null);
  assert.equal(h.document.activeElement, save);
  assert.ok(rails.querySelector(".nifty-strategy-preview"), "Escape must keep temporary preview");
  assert.equal(h.strategyMutationMessages().filter((command) => command.type === "MERGE_STRATEGIES").length, 0);
});

test("failed permanent save keeps combined preview and restores destination actions", async () => {
  const h = createBreakEvenLifecycleHarness({
    manualEntries: Object.values(chartStrategyBook().legs),
    strategyBook: chartStrategyBook(),
    strategyMutationError: new Error("Storage unavailable")
  });
  await h.settle();
  h.click(23800);
  await h.settle();

  await selectEveryReachableStrategy(h);
  const rails = h.strategyRails();
  rails.querySelector(".nifty-strategy-preview__save").dispatch("click", { stopPropagation() {} });
  rails.querySelectorAll(".nifty-strategy-preview__save-choice")[0]
    .dispatch("click", { stopPropagation() {} });
  await h.settle();

  assert.match(rails.querySelector(".nifty-strategy-preview__summary").textContent, /SAVE FAILED · Storage unavailable/);
  assert.ok(rails.querySelector(".nifty-strategy-preview"));
  assert.equal(rails.querySelectorAll(".nifty-strategy-preview__save-choice")
    .every((node) => node.disabled === false), true);
  assert.equal(rails.querySelectorAll(".nifty-strategy__selector")
    .filter((node) => node.getAttribute("aria-pressed") === "true").length, 2);
});

test("previously archived strategy legs stay in ledger but leave badges and plan rails", async () => {
  const entry = savedManualEntry();
  const plans = manualPlan.upsertEntry(manualPlan.emptyStore(), entry);
  let book = strategyStore.migrateManualPlans(strategyStore.emptyBook(), plans, {
    instrumentKey: "NSE_INDEX|NIFTY",
    underlying: "NIFTY",
    at: "2026-07-31T10:00:00.000Z"
  });
  const strategyId = "legacy:NSE_INDEX|NIFTY:2026-08-25";
  book = strategyStore.applyCommand(book, {
    id: "archive-existing",
    type: "ARCHIVE_STRATEGY",
    strategyId
  }, "2026-07-31T10:05:00.000Z");

  const h = createBreakEvenLifecycleHarness({
    manualEntries: [entry],
    strategyBook: book
  });
  await h.settle();

  assert.equal(strategyStore.legsForStrategy(book, strategyId).length, 1, "ledger evidence remains");
  assert.equal(h.row(entry.strike).querySelectorAll(".nifty-axis-ladder__badge").length, 0);
  assert.equal(h.manualRails(), null);
  assert.equal(h.strategyRails(), null, "archived strategy leaves no active position spine");
});

test("clicking one-entry badge opens exact saved leg editor with remove control", async () => {
  const entry = savedManualEntry({ optionType: "CALL", lots: 1 });
  const h = createBreakEvenLifecycleHarness({ manualEntries: [entry] });
  await h.settle();

  h.click(entry.strike);
  await h.settle();
  assert.ok(h.rails(), "selected strike starts with quick BE rails");

  const badge = h.row(entry.strike).querySelector(".nifty-axis-ladder__badge");
  assert.equal(badge.dataset.entryId, entry.id);
  h.clickTarget(badge);

  const editor = h.editor(entry.strike);
  assert.ok(editor);
  assert.ok(editor.querySelector(".nifty-manual-editor__remove"));
  assert.equal(editor.querySelector(".nifty-manual-editor__commit").textContent, "SAVE");
  assert.equal(h.rails(), null, "opening saved editor clears quick BE rails");
  assert.equal(h.strategyRails()?.querySelectorAll(".nifty-strategy__card").length || 0, 0,
    "opening saved editor clears T controls");
});

test("real double-click on exact manual badge keeps that saved leg editor", async () => {
  const call = savedManualEntry({ id: "same-strike-call", optionType: "CALL", premium: 111 });
  const put = savedManualEntry({ id: "same-strike-put", optionType: "PUT", premium: 222 });
  const h = createBreakEvenLifecycleHarness({ manualEntries: [call, put] });
  await h.settle();

  const badge = h.row(put.strike).querySelectorAll(".nifty-axis-ladder__badge")
    .find((node) => node.dataset.entryId === put.id);
  assert.ok(badge, "exact saved Put badge is rendered");
  h.realDoubleClickTarget(badge);

  const editor = h.editor(put.strike);
  assert.ok(editor);
  assert.deepEqual(editor.querySelectorAll(".nifty-manual-editor__action").map((button) => button.textContent),
    ["BUY PUT", "SELL PUT"]);
  assert.equal(editor.querySelector(".nifty-manual-editor__premium").value, "222.00");
  assert.equal(editor.querySelector(".nifty-manual-editor__commit").textContent, "SAVE");
  assert.ok(editor.querySelector(".nifty-manual-editor__remove"));
});

test("chart badge removal archives emptied owner and clears both trade badge and T card", async () => {
  const entry = savedManualEntry({ optionType: "CALL", lots: 1 });
  const plans = manualPlan.upsertEntry(manualPlan.emptyStore(), entry);
  const book = strategyStore.migrateManualPlans(strategyStore.emptyBook(), plans, {
    instrumentKey: "NSE_DLY:NIFTY",
    underlying: "NIFTY",
    at: "2026-07-31T10:00:00.000Z"
  });
  const h = createBreakEvenLifecycleHarness({ manualEntries: [entry], strategyBook: book });
  await h.settle();

  h.clickTarget(h.row(entry.strike).querySelector(".nifty-axis-ladder__badge"));
  h.editor(entry.strike).querySelector(".nifty-manual-editor__remove").dispatch("click", {});
  await h.settle();

  assert.deepEqual(h.manualMutationMessages().map((mutation) => mutation.type), ["REMOVE"],
    "one atomic manual mutation removes leg and archives emptied owner");
  assert.equal(h.strategyMutationMessages().filter((command) =>
    ["REMOVE_LEG", "ARCHIVE_STRATEGY"].includes(command.type)).length, 0,
  "content cannot issue split strategy mutations");
  assert.equal(strategyStore.activeStrategies(h.strategyBook(), "NSE_DLY:NIFTY", entry.expiry).length, 0);
  assert.equal(h.row(entry.strike).querySelectorAll(".nifty-axis-ladder__badge").length, 0);
  assert.equal(h.strategyRails(), null, "removing final leg removes archived strategy spine");
});

test("side panel reads temporary chart strategy selection without mutating it", async () => {
  const h = chartStrategyHarness();
  await h.settle();
  const selector = h.strategyRails().querySelectorAll(".nifty-strategy__selector")[0];
  selector.dispatch("click", { stopPropagation() {} });
  await h.settle();

  let response = null;
  const handled = h.runtimeListeners[0]({ type: "GET_STRATEGY_PREVIEW_STATE" }, null, (value) => { response = value; });
  assert.equal(handled, false);
  assert.deepEqual(JSON.parse(JSON.stringify(response)), {
    ok: true,
    selectedIds: ["s1"],
    compare: false,
    instrumentKey: "NSE_DLY:NIFTY",
    underlying: "NIFTY",
    expiry: "2026-08-25",
    timeZone: "Asia/Kolkata"
  });
  assert.equal(h.strategyRails().querySelectorAll(".nifty-strategy__selector")
    .filter((node) => node.getAttribute("aria-pressed") === "true").length, 1);
});

test("side panel can open one saved strategy directly on chart", async () => {
  const h = chartStrategyHarness();
  await h.settle();

  let response = null;
  const handled = h.runtimeListeners[0]({ type: "OPEN_STRATEGY_ON_CHART", strategyId: "s1" }, null, (value) => { response = value; });
  assert.equal(handled, false);
  assert.deepEqual(JSON.parse(JSON.stringify(response)), { ok: true });
  await h.settle();
  assert.ok(h.strategyRails().querySelector(".nifty-strategy__trades"));
});

test("permanent save can clear stale temporary chart strategy selection", async () => {
  const h = chartStrategyHarness();
  await h.settle();
  let rails = h.strategyRails();
  rails.querySelectorAll(".nifty-strategy__selector")[0].dispatch("click", { stopPropagation() {} });
  await h.settle();
  rails = h.strategyRails();
  rails.querySelectorAll(".nifty-strategy__selector")
    .find((node) => node.getAttribute("aria-pressed") === "false")
    .dispatch("click", { stopPropagation() {} });
  await h.settle();
  assert.ok(h.strategyRails().querySelector(".nifty-strategy-preview"));

  let response = null;
  const handled = h.runtimeListeners[0]({ type: "CLEAR_STRATEGY_PREVIEW" }, null, (value) => { response = value; });
  assert.equal(handled, false);
  assert.deepEqual(JSON.parse(JSON.stringify(response)), { ok: true });
  await h.settle();
  rails = h.strategyRails();
  assert.equal(rails.querySelector(".nifty-strategy-preview"), null);
  assert.equal(rails.querySelectorAll(".nifty-strategy__selector")
    .every((node) => node.getAttribute("aria-pressed") === "false"), true);
});

test("new leg waits for explicit chart strategy ownership before any write", async () => {
  const h = chartStrategyHarness();
  await h.settle();
  h.doubleClick(23750);
  let editor = h.editor(23750);
  editor.children[0].children[1].dispatch("click", {});
  editor = h.editor(23750);
  commitManualEditor(h, 23750, { chooseOwnership: false });

  const chooser = editor.querySelector(".nifty-strategy-owner");
  assert.ok(chooser, "ownership chooser opens before mutation");
  assert.deepEqual(chooser.querySelectorAll(".nifty-strategy-owner__choice").map((node) => node.textContent), [
    "ADD TO T1", "ADD TO T2", "CREATE NEW STRATEGY"
  ]);
  assert.equal(h.strategyMutationMessages().filter((command) => command.type === "ADD_LEG").length, 0);
  assert.equal(h.strategyMutationMessages().filter((command) => command.type === "EXPIRE_DUE").length, 1);
  assert.equal(h.manualMutationMessages().length, 0);

  chooser.querySelectorAll(".nifty-strategy-owner__choice")[0].dispatch("click", { stopPropagation() {} });
  await h.settle();
  assert.equal(h.strategyMutationMessages().filter((command) => command.type === "ADD_LEG").length, 0,
    "manual ownership must not use a split strategy write");
  assert.deepEqual(h.manualMutationMessages().map((mutation) => mutation.type), ["CREATE"]);
  assert.equal(h.editor(23750), null);
});

test("production ladder shows visible strikes while clipped siblings stay hidden", async () => {
  const h = createBreakEvenLifecycleHarness({
    plotRect: { left: 0, top: 100, right: 1200, bottom: 160 }
  });
  await h.settle();

  assert.equal(h.status(), "LIVE");
  assert.equal(h.row(23900).hidden, false);
  assert.equal(h.row(23800).hidden, false);
  assert.equal(h.row(24000).hidden, true);
  assert.equal(h.row(23700).hidden, true);
});

test("production ladder retains off-grid real ATM inside visible native range", async () => {
  const h = createBreakEvenLifecycleHarness({
    spot: 23767.45,
    initialAxisPairs: [23400, 23600, 23800, 24000, 24200].map((price, index) => ({
      price,
      y: 300 - index * 40
    }))
  });
  await h.settle();

  assert.equal(h.row(23750).hidden, false, "real ATM remains visible between TradingView grid labels");
  assert.equal(h.row(23750).classList.contains("is-atm"), true,
    "real ATM keeps exact theme highlight");
  assert.equal(h.row(23800).hidden, false);
  assert.equal(h.row(23800).classList.contains("is-atm"), false,
    "nearest native grid strike does not impersonate ATM");
  assert.equal(h.row(23600).classList.contains("is-atm"), false);
});

function chooseCallSellEditor(h, strike = 23750) {
  let editor = h.editor(strike);
  editor.children[0].children[1].dispatch("click", {});
  editor = h.editor(strike);
  editor.children[3].dispatch("click", {});
  editor = h.editor(strike);
  editor.children[4].value = "358";
  editor.children[4].dispatch("input", {});
}

function savedManualEntry(overrides = {}) {
  return {
    id: "entry-23750",
    underlying: "NIFTY",
    expiry: "2026-08-25",
    strike: 23750,
    optionType: "CALL",
    direction: "SELL",
    lots: 1,
    premium: 119,
    callSnapshot: 119,
    putSnapshot: 219,
    createdAt: "2026-07-29T10:00:00.000Z",
    updatedAt: "2026-07-29T10:00:00.000Z",
    ...overrides
  };
}

const approvedOneCallThreePuts = [
  { id: "call-entry", underlying: "NIFTY", expiry: "2026-08-25", strike: 24100,
    optionType: "CALL", direction: "SELL", lots: 1, premium: 358,
    callSnapshot: 358, putSnapshot: 315.45,
    createdAt: "2026-07-29T10:00:00.000Z", updatedAt: "2026-07-29T10:00:00.000Z" },
  { id: "put-entry", underlying: "NIFTY", expiry: "2026-08-25", strike: 24000,
    optionType: "PUT", direction: "SELL", lots: 3, premium: 183,
    callSnapshot: 411.15, putSnapshot: 183,
    createdAt: "2026-07-29T10:01:00.000Z", updatedAt: "2026-07-29T10:01:00.000Z" }
];

function commitManualEditor(h, strike = 23750, { chooseOwnership = true } = {}) {
  const commit = h.editor(strike).querySelector(".nifty-manual-editor__commit");
  assert.ok(commit, "manual editor has a commit control");
  commit.dispatch("click", {});
  const chooser = h.editor(strike)?.querySelector(".nifty-strategy-owner");
  if (chooseOwnership && chooser) {
    const createNew = chooser.querySelectorAll(".nifty-strategy-owner__choice")
      .find((choice) => choice.textContent === "CREATE NEW STRATEGY");
    assert.ok(createNew, "new manual entry exposes explicit CREATE NEW STRATEGY ownership");
    createNew.dispatch("click", { stopPropagation() {} });
  }
  return commit;
}

function removeManualEditor(h, strike = 23750) {
  const remove = h.editor(strike).querySelector(".nifty-manual-editor__remove");
  assert.ok(remove, "saved manual editor has a remove control");
  remove.dispatch("click", {});
  return remove;
}

function previewChangedManualPlan(h) {
  h.openEdit("call-entry");
  h.setEditorLots(2);
}

test("malformed stored records stay recoverable and expose compact review count after valid mutation", async () => {
  const valid = savedManualEntry();
  const malformed = { ...valid, id: "recover-me", direction: "HOLD" };
  const h = createBreakEvenLifecycleHarness({
    rawManualPlans: {
      version: 1,
      plans: { "2026-08-25": { entries: [valid, malformed] } }
    },
    strategySupport: true
  });
  await h.settle();

  assert.match(h.status(), /MANUAL ENTRY NEEDS REVIEW · 1/);
  assert.deepEqual(h.manualEntries().map((entry) => entry.id), [valid.id]);
  assert.deepEqual(h.invalidManualEntries().map((item) => item.raw), [malformed]);

  h.openEdit(valid.id);
  h.setEditorLots(2);
  commitManualEditor(h);
  await h.settle();

  assert.deepEqual(h.manualEntries().map(({ lots }) => ({ lots })), [{ lots: 2 }]);
  assert.notEqual(h.manualEntries()[0].id, valid.id);
  assert.deepEqual(h.invalidManualEntries().map((item) => item.raw), [malformed]);
  assert.match(h.status(), /MANUAL ENTRY NEEDS REVIEW · 1/);
});

test("manual refresh preserves saved entry snapshot", async () => {
  const h = createBreakEvenLifecycleHarness({ manualEntries: [{
    id: "e1", underlying: "NIFTY", expiry: "2026-08-25", strike: 24450,
    optionType: "CALL", direction: "SELL", lots: 2, premium: 358,
    callSnapshot: 358, putSnapshot: 414.6,
    createdAt: "2026-07-29T10:00:00.000Z", updatedAt: "2026-07-29T10:00:00.000Z"
  }] });
  await h.settle();

  await h.refreshOptionNumbers({ call: 223.4, put: 409.8 });

  assert.equal(h.manualEntries()[0].callSnapshot, 358);
  assert.equal(h.manualEntries()[0].putSnapshot, 414.6);
});

for (const [name, dismiss] of [
  ["close", (h) => h.cancelEditor()],
  ["outside", (h) => h.document.dispatch("pointerdown", { target: { closest() { return null; } } })],
  ["Escape", (h) => h.document.dispatch("keydown", { key: "Escape", target: h.row(24100) })]
]) {
  test(`successful deferred save rerenders committed rows and rails after ${name}`, async () => {
    const h = createBreakEvenLifecycleHarness({
      manualEntries: approvedOneCallThreePuts,
      spot: 24050,
      deferStorage: true,
      strategySupport: true
    });
    await h.settle();
    h.openEdit("call-entry");
    h.setEditorLots(2);
    commitManualEditor(h, 24100);
    await h.settle();
    assert.equal(h.pendingStorageWriteCount(), 1);

    dismiss(h);
    await h.settle();
    assert.equal(h.editor(24100), null);
    assert.deepEqual(h.manualRailLabels(), [], "no strike selected means no legacy plan BE rails");

    h.resolveStorageWrite();
    await h.settle();

    const committedCall = h.manualEntries().find((entry) => entry.strike === 24100 && entry.optionType === "CALL");
    assert.equal(committedCall.lots, 2);
    assert.notEqual(committedCall.id, "call-entry");
    assert.deepEqual(h.manualRailLabels(), [], "atomic commit still requires explicit strike/face selection");
    assert.equal(h.row(24100).querySelector(".nifty-axis-ladder__badge").textContent, "C2");
    h.document.dispatch("keydown", { key: "Escape", target: h.row(24100) });
    h.click(24100);
    assert.match(h.row(24100).getAttribute("aria-label"), /2 lots/);
  });
}

test("manual add uses one atomic service-worker mutation instead of split storage writes", async () => {
  const h = createBreakEvenLifecycleHarness({ strategySupport: true, chainLotSize: 25 });
  await h.settle();
  h.doubleClick(23750);
  chooseCallSellEditor(h);
  commitManualEditor(h);
  await h.settle();

  assert.deepEqual(h.manualMutationMessages().map((mutation) => mutation.type), ["CREATE"]);
  assert.equal(h.strategyMutationMessages().filter((command) => command.type === "ADD_LEG").length, 0);
  assert.equal(h.localManualSetCalls(), 0);
  assert.equal(h.manualEntries().length, 1);
  assert.equal(h.manualEntries()[0].lotSize, 25);
  assert.equal(h.strategyBook().legs[h.manualEntries()[0].id].lotSize, 25,
    "the atomic strategy leg preserves the chain's exact contract multiplier");
});

test("new manual creation fails closed when the active chain has no lot-size metadata", async () => {
  const h = createBreakEvenLifecycleHarness({ strategySupport: true, omitChainLotSize: true });
  await h.settle();

  assert.equal(h.row(23750), null, "an unauthoritative chain is not rendered as a creatable ladder");
  assert.deepEqual(h.manualMutationMessages(), []);
  assert.deepEqual(h.manualEntries(), []);
});

test("editor is an accessible sibling of the ARIA row and inside clicks do not dismiss it", async () => {
  const h = createBreakEvenLifecycleHarness();
  await h.settle();
  h.doubleClick(23750);
  const row = h.row(23750);
  const editor = h.editor(23750);
  const root = h.document.getElementById("nifty-axis-ladder");

  assert.equal(row.getAttribute("role"), "button");
  assert.equal(row.querySelector(".nifty-manual-editor"), null);
  assert.equal(editor.parent, root);
  assert.equal(editor.getAttribute("role"), "group");
  assert.equal(row.getAttribute("aria-hidden"), "true");

  h.document.dispatch("pointerdown", {
    target: editor.querySelector(".nifty-manual-editor__premium")
  });
  assert.equal(h.editor(23750), editor);
});

test("premium input previews in place, preserves focus and selection, and drives compact validation", async () => {
  const h = createBreakEvenLifecycleHarness({
    manualEntries: approvedOneCallThreePuts,
    spot: 24050
  });
  await h.settle();
  h.openEdit("call-entry");
  const editor = h.editor(24100);
  const premium = editor.querySelector(".nifty-manual-editor__premium");
  const commit = editor.querySelector(".nifty-manual-editor__commit");
  const validation = editor.querySelector(".nifty-manual-editor__validation");
  premium.focus();
  premium.selectionStart = 1;
  premium.selectionEnd = 4;
  premium.value = "400";
  premium.dispatch("input", {});
  await h.settle();

  assert.equal(h.editor(24100), editor);
  assert.equal(h.document.activeElement, premium);
  assert.deepEqual([premium.selectionStart, premium.selectionEnd], [1, 4]);
  assert.equal(commit.disabled, false);
  assert.equal(validation.textContent, "");
  assert.deepEqual(h.manualRailLabels(), ["PREVIEW BE 23,684", "PREVIEW BE 25,049"]);

  premium.value = "";
  premium.dispatch("input", {});
  await h.settle();
  assert.equal(h.editor(24100), editor);
  assert.equal(commit.disabled, true);
  assert.equal(validation.textContent, "ENTER PREMIUM");
  assert.deepEqual(h.manualRailLabels(), ["PLAN BE 23,698", "PLAN BE 25,007"]);
  assert.equal(h.storageSetCalls(), 0);
});

test("new editor disables Add until selected leg and premium are valid", async () => {
  const h = createBreakEvenLifecycleHarness({ invalidRows: { 23750: { call: null } } });
  await h.settle();
  h.doubleClick(23750);
  let editor = h.editor(23750);
  assert.equal(editor.querySelector(".nifty-manual-editor__commit").disabled, true);
  assert.equal(editor.querySelector(".nifty-manual-editor__validation").textContent, "CHOOSE BUY / SELL");

  editor.children[0].children[0].dispatch("click", {});
  editor = h.editor(23750);
  assert.equal(editor.children[0].children[0].getAttribute("aria-pressed"), "true");
  assert.equal(editor.children[0].children[0].textContent, "BUY CALL");
  assert.equal(editor.querySelector(".nifty-manual-editor__commit").disabled, true);
  assert.equal(editor.querySelector(".nifty-manual-editor__validation").textContent, "ENTER PREMIUM");

  const premium = editor.querySelector(".nifty-manual-editor__premium");
  premium.value = "0";
  premium.dispatch("input", {});
  assert.equal(h.editor(23750), editor);
  assert.equal(editor.querySelector(".nifty-manual-editor__commit").disabled, false);
  assert.equal(editor.querySelector(".nifty-manual-editor__validation").textContent, "");
});

for (const [name, finish] of [
  ["success", async (h, request) => {
    h.resolveFetch(0, { byStrike: { 23750: { call: 500, put: 600 } } });
    const response = await request;
    assert.equal(response.ok, true, `${response.error} / ${h.status()}`);
  }],
  ["network failure", async (h, request) => {
    h.rejectFetch(0, new Error("network failed"));
    assert.equal((await request).ok, false);
  }],
  ["placement failure", async (h, request) => {
    h.setRenderManualError(new Error("placement failed"));
    h.resolveFetch();
    assert.equal((await request).ok, false);
  }]
]) {
  test(`refresh clears manual editor and active face before ${name}`, async () => {
    const h = createBreakEvenLifecycleHarness({
      manualEntries: [savedManualEntry()],
      deferFetches: true
    });
    await h.settle();
    h.openEdit("entry-23750");
    assert.ok(h.editor(23750));
    assert.equal(h.row(23750).classList.contains("is-manual-entry"), true);

    const request = h.startRefreshOptionNumbers();

    assert.equal(h.editor(23750), null);
    assert.equal(h.row(23750).classList.contains("is-manual-entry"), false);
    await finish(h, request);
    await h.settle();
    assert.equal(h.editor(23750), null);
  });
}

test("second refresh invalidates first response and clears a newly opened manual editor before fetch", async () => {
  const h = createBreakEvenLifecycleHarness({
    manualEntries: [savedManualEntry()],
    deferFetches: true
  });
  await h.settle();
  h.openEdit("entry-23750");
  const first = h.startRefreshOptionNumbers();
  assert.equal(h.editor(23750), null);

  h.openEdit("entry-23750");
  const second = h.startRefreshOptionNumbers();
  assert.equal(h.editor(23750), null);

  h.resolveFetch(1);
  const response = await second;
  assert.equal(response.ok, true, `${response.error} / ${h.status()}`);
  h.resolveFetch(0);
  assert.equal((await first).ok, false);
});

test("saved manual plan draws every neutral break-even through native axis", async () => {
  const h = createBreakEvenLifecycleHarness({ manualEntries: approvedOneCallThreePuts, spot: 24050 });
  await h.settle();

  assert.equal(h.lastManualLevelInput().length, approvedOneCallThreePuts.length,
    "chart payoff receives every active manual leg");
  assert.deepEqual(h.lastManualLevelInput().map(({ source, lotSize }) => ({ source, lotSize })),
    approvedOneCallThreePuts.map(() => ({ source: "MANUAL", lotSize: undefined })),
    "legacy manual payoff path keeps documented 65-contract fallback without inventing stored metadata");
  const rails = h.manualRails();
  assert.ok(rails, "saved manual plan creates its independent rail root");
  assert.deepEqual(rails.children.map((node) => node.textContent), ["PLAN BE 23,698", "PLAN BE 25,007"]);
  assert.equal(rails.children.every((node) => node.classList.contains("is-plan")), true);
  assert.equal(h.rails(), null, "manual plan never creates quick single-leg rails");
});

test("A2 plan disclosure is exclusive and any outside click collapses it", async () => {
  const h = createBreakEvenLifecycleHarness({ manualEntries: approvedOneCallThreePuts, spot: 24050 });
  h.setProject((level) => ({ mode: "line", y: level.exact < 24000 ? 180 : 220 }));
  await h.settle();

  const rails = h.manualRails();
  const lower = rails.children[0].children[0];
  const upper = rails.children[1].children[0];
  lower.dispatch("click", { stopPropagation() {} });
  assert.equal(lower.children[0].textContent, "PLAN BE 23,698");
  assert.equal(lower.children[1].children[0].children[0].textContent, "P 24,000 SELL ×3");
  assert.equal(lower.children[1].children[0].children[1].textContent, "-₹7,995");
  assert.equal(lower.children[1].children[0].children[1].classList.contains("is-loss"), true);
  assert.equal(lower.children[0].getAttribute("aria-expanded"), "true");

  h.document.dispatch("pointerdown", { target: lower.children[0] });
  assert.equal(lower.children.length, 2, "pressing the same plan header does not pre-collapse it");

  upper.dispatch("click", { stopPropagation() {} });
  assert.equal(lower.children.length, 1, "opening another plan collapses the prior plan");
  assert.equal(upper.children[0].textContent, "PLAN BE 25,007");
  assert.equal(upper.children[1].children[0].children[0].textContent, "C 24,100 SELL ×1");
  assert.equal(upper.children[1].children[0].children[1].textContent, "+₹15,080");
  assert.equal(upper.children[1].children[0].children[1].classList.contains("is-profit"), true);
  assert.equal(upper.children[0].getAttribute("aria-expanded"), "true");

  h.document.dispatch("pointerdown", { target: h.row(23750) });
  assert.deepEqual(h.manualRailLabels(), ["PLAN BE 23,698", "PLAN BE 25,007"]);
  assert.equal(upper.children[0].getAttribute("aria-expanded"), "false");
});

test("manual plan at exact ATM keeps previous disclosure structure", async () => {
  const h = createBreakEvenLifecycleHarness({
    manualEntries: [savedManualEntry({ strike: 23750, premium: 50, callSnapshot: 50 })],
    spot: 23800
  });
  await h.settle();

  const group = h.manualRails().children[0].children[0];
  assert.equal(group.classList.contains("is-atm"), true);
  group.dispatch("click", { stopPropagation() {} });
  assert.equal(group.children[0].textContent, "PLAN BE 23,800");
  assert.equal(group.children[1].children.length, 1);
});

test("valid draft previews changed lots without saving", async () => {
  const h = createBreakEvenLifecycleHarness({ manualEntries: approvedOneCallThreePuts, spot: 24050 });
  await h.settle();
  const fetchesBeforeDraft = h.fetchCalls();

  h.openEdit("call-entry");
  h.setEditorLots(2);
  await h.settle();
  assert.deepEqual(h.manualRailLabels(), ["PREVIEW BE 23,578", "PREVIEW BE 24,733"]);
  assert.equal(h.storageSetCalls(), 0);
  assert.equal(h.fetchCalls(), fetchesBeforeDraft);

  h.cancelEditor();
  await h.settle();
  assert.deepEqual(h.manualRailLabels(), ["PLAN BE 23,698", "PLAN BE 25,007"]);
});

test("outside click replaces preview rails with saved plan rails", async () => {
  const h = createBreakEvenLifecycleHarness({ manualEntries: approvedOneCallThreePuts, spot: 24050 });
  await h.settle();
  previewChangedManualPlan(h);
  await h.settle();
  assert.deepEqual(h.manualRailLabels(), ["PREVIEW BE 23,578", "PREVIEW BE 24,733"]);

  h.document.dispatch("pointerdown", { target: { closest() { return null; } } });
  await h.settle();

  assert.equal(h.editor(24100), null);
  assert.deepEqual(h.manualRailLabels(), ["PLAN BE 23,698", "PLAN BE 25,007"]);
  assert.equal(h.storageSetCalls(), 0);
});

test("Escape replaces preview rails with saved plan rails", async () => {
  const h = createBreakEvenLifecycleHarness({ manualEntries: approvedOneCallThreePuts, spot: 24050 });
  await h.settle();
  previewChangedManualPlan(h);
  await h.settle();
  assert.deepEqual(h.manualRailLabels(), ["PREVIEW BE 23,578", "PREVIEW BE 24,733"]);

  h.document.dispatch("keydown", { key: "Escape", target: h.row(24100) });
  await h.settle();

  assert.equal(h.editor(24100), null);
  assert.deepEqual(h.manualRailLabels(), ["PLAN BE 23,698", "PLAN BE 25,007"]);
  assert.equal(h.storageSetCalls(), 0);
});

test("outside click clears preview rails when saved re-placement has an invalid native axis", async () => {
  const h = createBreakEvenLifecycleHarness({ manualEntries: approvedOneCallThreePuts, spot: 24050 });
  await h.settle();
  previewChangedManualPlan(h);
  await h.settle();
  h.setAxisPairs([{ price: 24000, y: 100 }]);

  h.document.dispatch("pointerdown", { target: { closest() { return null; } } });
  await h.settle();

  assert.equal(h.editor(24100), null);
  assert.equal(h.manualRails(), null);
  assert.equal(h.manualEntries().length, 2);
  assert.equal(h.storageSetCalls(), 0);
});

test("Escape clears preview rails when saved re-placement has an invalid native axis", async () => {
  const h = createBreakEvenLifecycleHarness({ manualEntries: approvedOneCallThreePuts, spot: 24050 });
  await h.settle();
  previewChangedManualPlan(h);
  await h.settle();
  h.setAxisPairs([{ price: 24000, y: 100 }]);

  h.document.dispatch("keydown", { key: "Escape", target: h.row(24100) });
  await h.settle();

  assert.equal(h.editor(24100), null);
  assert.equal(h.manualRails(), null);
  assert.equal(h.manualEntries().length, 2);
  assert.equal(h.storageSetCalls(), 0);
});

test("pagehide clears manual rail visuals without deleting saved entries", async () => {
  const h = createBreakEvenLifecycleHarness({ manualEntries: approvedOneCallThreePuts, spot: 24050 });
  await h.settle();
  previewChangedManualPlan(h);
  await h.settle();

  h.pagehide(true);
  await h.settle();

  assert.equal(h.editor(24100), null);
  assert.equal(h.manualRails(), null);
  assert.equal(h.manualEntries().length, 2);
  assert.equal(h.storageSetCalls(), 0);
});

test("same-label SPA navigation clears manual rail visuals without deleting saved entries", async () => {
  const h = createBreakEvenLifecycleHarness({ manualEntries: approvedOneCallThreePuts, spot: 24050 });
  await h.settle();
  previewChangedManualPlan(h);
  await h.settle();

  h.navigateSpa("https://www.tradingview.com/chart/next-layout/");
  await h.settle();

  assert.equal(h.editor(24100), null);
  assert.equal(h.manualRails(), null);
  assert.equal(h.manualEntries().length, 2);
  assert.equal(h.storageSetCalls(), 0);
});

for (const [name, reset] of [
  ["pagehide", (h) => h.pagehide(true)],
  ["same-label SPA navigation", (h) => h.navigateSpa("https://www.tradingview.com/chart/after-reset/")]
]) {
  test(`delayed placement started before ${name} cannot redraw manual rails after reset`, async () => {
    const h = createBreakEvenLifecycleHarness({ manualEntries: approvedOneCallThreePuts, spot: 24050 });
    await h.settle();
    h.deferAxisCaptures();
    const stalePlacement = h.retryPlacement();
    assert.equal(h.pendingAxisCaptureCount(), 1);

    reset(h);
    h.resolveAxisCapture();
    await stalePlacement;
    await h.settle();

    assert.equal(h.manualRails(), null);
    assert.equal(h.manualEntries().length, 2);
    assert.equal(h.storageSetCalls(), 0);
  });
}

test("older cancelled placement cannot clear newer preview rails after it completes", async () => {
  const h = createBreakEvenLifecycleHarness({ manualEntries: approvedOneCallThreePuts, spot: 24050 });
  await h.settle();
  previewChangedManualPlan(h);
  await h.settle();
  h.deferAxisCaptures();

  h.document.dispatch("pointerdown", { target: { closest() { return null; } } });
  assert.equal(h.pendingAxisCaptureCount(), 1);
  previewChangedManualPlan(h);
  assert.ok(h.pendingAxisCaptureCount() > 1);

  h.resolveLatestAxisCapture();
  await h.settle();
  assert.deepEqual(h.manualRailLabels(), ["PREVIEW BE 23,578", "PREVIEW BE 24,733"]);

  h.resolveAxisCapture();
  await h.settle();
  assert.deepEqual(h.manualRailLabels(), ["PREVIEW BE 23,578", "PREVIEW BE 24,733"]);
  assert.equal(h.storageSetCalls(), 0);
});

test("older failed placement cannot clear newer preview rails", async () => {
  const h = createBreakEvenLifecycleHarness({ manualEntries: approvedOneCallThreePuts, spot: 24050 });
  await h.settle();
  previewChangedManualPlan(h);
  await h.settle();
  h.deferAxisCaptures();

  h.document.dispatch("keydown", { key: "Escape", target: h.row(24100) });
  assert.equal(h.pendingAxisCaptureCount(), 1);
  previewChangedManualPlan(h);
  assert.ok(h.pendingAxisCaptureCount() > 1);

  h.resolveLatestAxisCapture();
  await h.settle();
  assert.deepEqual(h.manualRailLabels(), ["PREVIEW BE 23,578", "PREVIEW BE 24,733"]);

  h.resolveAxisCapture(0, { ok: false, error: "axis unavailable" });
  await h.settle();
  assert.deepEqual(h.manualRailLabels(), ["PREVIEW BE 23,578", "PREVIEW BE 24,733"]);
  assert.equal(h.storageSetCalls(), 0);
});

test("production retry placement keeps accepted refresh quotes and commits its newer native axis", async () => {
  const h = createBreakEvenLifecycleHarness({ manualEntries: [savedManualEntry()] });
  await h.settle();
  assert.equal(h.manualRails().children[0].style.top, "126.2px");
  h.deferAxisCaptures();
  h.deferFetches();

  const placement = h.retryPlacement();
  assert.equal(h.pendingAxisCaptureCount(), 1);
  const refresh = h.startRefreshOptionNumbers();
  assert.equal(h.pendingFetchCount(), 1);

  h.resolveFetch(0, { byStrike: { 23700: { call: 777, put: 888 } } });
  assert.equal((await refresh).ok, true);
  h.resolveAxisCapture(0, {
    ok: true,
    gridGapPx: 20,
    axisPairs: [
      { price: 24000, y: 300 },
      { price: 23950, y: 310 },
      { price: 23900, y: 320 },
      { price: 23850, y: 330 },
      { price: 23800, y: 340 },
      { price: 23750, y: 350 },
      { price: 23700, y: 360 }
    ]
  });

  assert.equal((await placement).ok, true);
  assert.match(h.row(23700).textContent, /C 777\.00P 888\.00/);
  assert.equal(h.manualRails().children[0].style.top, "326.2px");
});

test("production retry placement applies its newer axis to refresh-recentered membership", async () => {
  const h = createBreakEvenLifecycleHarness({ manualEntries: [savedManualEntry()] });
  await h.settle();
  assert.equal(h.manualRails().children[0].style.top, "126.2px");
  h.deferAxisCaptures();
  h.deferFetches();

  const placement = h.retryPlacement();
  assert.equal(h.pendingAxisCaptureCount(), 1);
  const refresh = h.startRefreshOptionNumbers();
  assert.equal(h.pendingFetchCount(), 1);

  h.resolveFetch(0, {
    spot: 23775,
    byStrike: { 23800: { call: 777, put: 888 } }
  });
  assert.equal((await refresh).ok, true);
  assert.equal(h.row(23800).classList.contains("is-atm"), true);
  assert.match(h.row(23800).textContent, /C 777\.00P 888\.00/);
  assert.ok(h.row(23450), "lower visible grid contract remains rendered");
  assert.ok(h.row(24100), "upper visible grid contract remains rendered");

  h.resolveAxisCapture(0, {
    ok: true,
    gridGapPx: 20,
    axisPairs: [
      { price: 24000, y: 300 },
      { price: 23950, y: 310 },
      { price: 23900, y: 320 },
      { price: 23850, y: 330 },
      { price: 23800, y: 340 },
      { price: 23750, y: 350 },
      { price: 23700, y: 360 }
    ]
  });

  assert.equal((await placement).ok, true);
  assert.equal(h.row(23800).classList.contains("is-atm"), true);
  assert.match(h.row(23800).textContent, /C 777\.00P 888\.00/);
  assert.equal(h.manualRails().children[0].style.top, "326.2px");
});

test("production refresh finishing after a newer placement retains fresh quotes without moving fresh-axis rails", async () => {
  const h = createBreakEvenLifecycleHarness({ manualEntries: [savedManualEntry()] });
  await h.settle();
  h.deferAxisCaptures();
  h.deferFetches();

  const refresh = h.startRefreshOptionNumbers();
  assert.equal(h.pendingFetchCount(), 1);
  const placement = h.retryPlacement();
  assert.equal(h.pendingAxisCaptureCount(), 1);
  h.resolveAxisCapture(0, {
    ok: true,
    gridGapPx: 20,
    axisPairs: [
      { price: 24000, y: 300 },
      { price: 23950, y: 310 },
      { price: 23900, y: 320 },
      { price: 23850, y: 330 },
      { price: 23800, y: 340 },
      { price: 23750, y: 350 },
      { price: 23700, y: 360 }
    ]
  });
  assert.equal((await placement).ok, true);

  h.resolveFetch(0, { byStrike: { 23700: { call: 777, put: 888 } } });
  assert.equal((await refresh).ok, true);
  assert.match(h.row(23700).textContent, /C 777\.00P 888\.00/);
  assert.equal(h.manualRails().children[0].style.top, "326.2px");
});

test("production stale older refresh cannot overwrite a newer accepted refresh", async () => {
  const h = createBreakEvenLifecycleHarness();
  await h.settle();
  h.deferFetches();

  const older = h.startRefreshOptionNumbers();
  assert.equal(h.pendingFetchCount(), 1);
  const newer = h.startRefreshOptionNumbers();
  assert.equal(h.pendingFetchCount(), 2);

  h.resolveFetch(1, { byStrike: { 23700: { call: 999, put: 888 } } });
  assert.equal((await newer).ok, true);
  h.resolveFetch(0, { byStrike: { 23700: { call: 555, put: 444 } } });
  assert.equal((await older).ok, false);
  assert.match(h.row(23700).textContent, /C 999\.00P 888\.00/);
});

test("quick and manual near-price labels share one collision layout without moving rail y", async () => {
  const h = createBreakEvenLifecycleHarness({ manualEntries: approvedOneCallThreePuts, spot: 24050 });
  h.setProject((level) => ({
    mode: "line",
    y: level.kind === "call" ? 200 : level.kind === "put" ? 205 : level.exact < 24000 ? 202 : 207
  }));
  await h.settle();
  h.select(23750);
  await h.settle();

  const quick = h.rails();
  const manual = h.manualRails();
  assert.deepEqual(quick.children.map((line) => line.style.top), ["200px", "205px"]);
  assert.deepEqual(manual.children.map((line) => line.style.top), ["202px", "207px"]);
  assert.deepEqual(quick.children.map((line) => line.children[0].style.top), ["185px", "219px"]);
  assert.deepEqual(manual.children.map((line) => line.children[0].style.top), ["202px", "236px"]);
});

test("hidden migrated plan levels cannot displace visible quick labels", async () => {
  const book = chartStrategyBook();
  const manualEntries = Object.values(book.legs).filter((entry) => entry.source === "MANUAL");
  const h = createBreakEvenLifecycleHarness({ strategyBook: book, manualEntries });
  h.setProject((level) => ({
    mode: "line",
    y: level.kind === "call" ? 200 : level.kind === "put" ? 205 : level.exact < 23800 ? 202 : 207
  }));
  await h.settle();
  h.click(23800);
  await h.settle();

  const quick = h.rails();
  assert.deepEqual(quick.children.map((line) => line.style.top), ["200px", "205px"]);
  assert.deepEqual(quick.children.map((line) => line.children[0].style.top), ["185px", "202px"],
    "only two visible quick labels participate in collision layout");
  assert.equal(h.manualRails(), null, "migrated anonymous plan rails stay hidden");
});

test("atomic save leaves break-even and T rails hidden until operator selects an exact strike face", async () => {
  const h = createBreakEvenLifecycleHarness({
    manualEntries: approvedOneCallThreePuts,
    spot: 24050,
    strategySupport: true
  });
  await h.settle();

  h.openEdit("call-entry");
  h.setEditorLots(2);
  await h.settle();
  assert.deepEqual(h.manualRailLabels(), []);

  commitManualEditor(h, 24100);
  await h.settle();
  assert.equal(h.storageSetCalls(), 1);
  assert.equal(h.editor(24100), null);
  assert.deepEqual(h.manualRailLabels(), []);
  assert.equal(h.rails(), null);
  assert.ok(h.strategyRails(), "saved strategy positions remain visible on shared spine");
  assert.equal(h.strategyRails().querySelectorAll(".nifty-strategy__card").length, 0);
  assert.equal(h.strategyRails().querySelectorAll(".nifty-strategy__rail").length, 0);
  assert.equal(h.strategyRails().querySelectorAll(".nifty-position-spine__marker").length, 2);
});

test("manual plan keeps both roots visible as truthful edge markers", async () => {
  const h = createBreakEvenLifecycleHarness({ manualEntries: approvedOneCallThreePuts, spot: 24050 });
  h.setProject((level) => ({ mode: "edge", edge: level.exact < 24000 ? "top" : "bottom", y: 0 }));
  await h.settle();

  const rails = h.manualRails();
  assert.ok(rails, "manual plan creates rails for projected roots");
  assert.deepEqual(h.manualRailLabels(), ["PLAN BE 23,698", "PLAN BE 25,007"]);
  assert.equal(rails.children[0].classList.contains("is-top"), true);
  assert.equal(rails.children[1].classList.contains("is-bottom"), true);
});

test("flat manual plan clears rails and reports flat payoff", async () => {
  const h = createBreakEvenLifecycleHarness({ manualEntries: [
    { ...approvedOneCallThreePuts[0], id: "flat-buy", direction: "BUY" },
    { ...approvedOneCallThreePuts[0], id: "flat-sell" }
  ] });
  await h.settle();

  assert.equal(h.manualRails(), null);
  assert.equal(h.status(), "PLAN PAYOFF FLAT");
});

test("axis failure conceals manual rails without deleting plan", async () => {
  const h = createBreakEvenLifecycleHarness({ manualEntries: approvedOneCallThreePuts, spot: 24050 });
  await h.settle();
  assert.ok(h.manualRails());

  h.setProject(() => null);
  await h.retryPlacement();

  assert.equal(h.manualRails(), null);
  assert.equal(h.manualEntries().length, 2);
});

test("double click opens editor without quick rails or face flash", async () => {
  const h = createBreakEvenLifecycleHarness();
  await h.settle();

  h.doubleClick(23750);
  h.flushClickTimer();

  assert.ok(h.editor(23750));
  assert.equal(h.rails(), null);
  assert.equal(h.row(23750).classList.contains("is-manual-entry"), false);
});

test("neutral double-click of one saved manual trade opens SAVE and REMOVE", async () => {
  const entry = savedManualEntry({ id: "sole-manual" });
  const h = createBreakEvenLifecycleHarness({
    manualEntries: [entry],
    strategySupport: true
  });
  await h.settle();

  h.doubleClick(23750);

  const editor = h.editor(23750);
  assert.ok(editor);
  assert.equal(editor.querySelector(".nifty-manual-editor__commit").textContent, "SAVE");
  assert.equal(editor.querySelector(".nifty-manual-editor__remove").textContent, "REMOVE");
});

test("neutral Put double-click beside one saved Call opens fresh Put ADD editor", async () => {
  const entry = savedManualEntry({ id: "sole-saved-call", optionType: "CALL" });
  const h = createBreakEvenLifecycleHarness({
    manualEntries: [entry],
    strategySupport: true
  });
  await h.settle();

  h.doubleClick(entry.strike, "PUT");

  const editor = h.editor(entry.strike);
  assert.ok(editor);
  assert.deepEqual(editor.querySelectorAll(".nifty-manual-editor__action").map((button) => button.textContent),
    ["BUY PUT", "SELL PUT"]);
  assert.equal(editor.querySelector(".nifty-manual-editor__commit").textContent, "ADD");
  assert.equal(editor.querySelector(".nifty-manual-editor__remove"), null);
  assert.equal(h.manualEntries()[0].id, entry.id, "saved Call stays untouched");
});

test("saved manual editor paints above its dynamically stacked badge row", async () => {
  const entry = savedManualEntry({ id: "stacked-manual" });
  const h = createBreakEvenLifecycleHarness({
    manualEntries: [entry],
    strategySupport: true
  });
  await h.settle();

  h.doubleClick(23750);
  await h.retryPlacement();

  const rowIndex = Number(h.row(23750).style.zIndex);
  const editorIndex = Number(h.editor(23750).style.zIndex);
  assert.ok(rowIndex > 10, "saved badge row owns a dynamic foreground layer");
  assert.ok(editorIndex > rowIndex, "manual editor must paint above its owning badge row");
});

test("closing editor cannot resurrect prior saved face", async () => {
  const book = chartStrategyBook();
  const h = createBreakEvenLifecycleHarness({
    strategyBook: book,
    manualEntries: Object.values(book.legs)
  });
  await h.settle();

  h.click(23800);
  await h.settle();
  assert.match(h.row(23800).getAttribute("aria-label"), /Sell (Call|Put), 1 lot/);
  h.doubleClick(23800);
  assert.ok(h.editor(23800));
  h.editor(23800).querySelector(".nifty-manual-editor__close").dispatch("click", {});
  await h.settle();

  assert.doesNotMatch(h.row(23800).getAttribute("aria-label") || "", /Sell (Call|Put), 1 lot/,
    "editor close returns row to live face");
  assert.equal(h.rails(), null, "editor close does not resurrect quick rails");
  assert.equal(h.strategyRails()?.querySelectorAll(".nifty-strategy__card").length || 0, 0,
    "editor close does not resurrect T controls");
});

test("double-clicked premium side controls the two direct editor actions", async () => {
  const h = createBreakEvenLifecycleHarness();
  await h.settle();

  h.doubleClick(23750, "CALL");
  assert.deepEqual(
    h.editor(23750).querySelectorAll(".nifty-manual-editor__action").map((button) => button.textContent),
    ["BUY CALL", "SELL CALL"]
  );
  h.editor(23750).querySelector(".nifty-manual-editor__close").dispatch("click", {});

  h.doubleClick(23750, "PUT");
  assert.deepEqual(
    h.editor(23750).querySelectorAll(".nifty-manual-editor__action").map((button) => button.textContent),
    ["BUY PUT", "SELL PUT"]
  );
});

test("Shift+Enter focuses first editor action and Escape restores exact-row focus", async () => {
  const h = createBreakEvenLifecycleHarness();
  await h.settle();
  const row = h.row(23750);
  row.focus();
  let prevented = false;

  h.document.dispatch("keydown", {
    key: "Enter",
    shiftKey: true,
    target: row,
    preventDefault() { prevented = true; }
  });

  assert.equal(prevented, true);
  assert.ok(h.editor(23750));
  assert.equal(h.rails(), null);
  const firstAction = h.editor(23750).querySelector(".nifty-manual-editor__action");
  assert.equal(h.document.activeElement, firstAction);
  const premium = h.editor(23750).querySelector(".nifty-manual-editor__premium");
  premium.focus();
  h.document.dispatch("keydown", { key: "Escape", target: premium });
  await h.settle();

  assert.equal(h.editor(23750), null);
  assert.equal(h.document.activeElement, row);
});

test("Enter and Space cycle saved faces newest-first while Escape returns live", async () => {
  const entries = [
    savedManualEntry({
      id: "old-put",
      optionType: "PUT",
      direction: "BUY",
      lots: 3,
      callSnapshot: 118,
      putSnapshot: 218,
      createdAt: "2026-07-29T09:00:00.000Z",
      updatedAt: "2026-07-29T09:00:00.000Z"
    }),
    savedManualEntry({
      id: "new-call",
      optionType: "CALL",
      direction: "SELL",
      lots: 1,
      callSnapshot: 119,
      putSnapshot: 219,
      createdAt: "2026-07-29T10:00:00.000Z",
      updatedAt: "2026-07-29T10:00:00.000Z"
    })
  ];
  const h = createBreakEvenLifecycleHarness({ manualEntries: entries });
  await h.settle();
  const row = h.row(23750);
  assert.equal(row.classList.contains("is-atm"), true);
  assert.equal(row.getAttribute("aria-label"),
    "Call 119.00, Put 219.00, strike 23,750, 2 saved entries");

  h.document.dispatch("keydown", { key: "Enter", shiftKey: false, target: row, preventDefault() {} });
  h.flushClickTimer();
  assert.equal(row.classList.contains("is-atm"), false);
  assert.equal(row.classList.contains("is-manual-entry"), true);
  assert.equal(row.classList.contains("is-sell"), true);
  assert.equal(row.getAttribute("aria-label"),
    "Sell Call, 1 lot, Call snapshot 119.00, Put snapshot 219.00, strike 23,750, saved entry 1 of 2");

  h.document.dispatch("keydown", { key: " ", shiftKey: false, target: row, preventDefault() {} });
  h.flushClickTimer();
  assert.equal(row.classList.contains("is-buy"), true);
  assert.equal(row.getAttribute("aria-label"),
    "Buy Put, 3 lots, Call snapshot 118.00, Put snapshot 218.00, strike 23,750, saved entry 2 of 2");

  h.document.dispatch("keydown", { key: "Escape", target: row });
  assert.equal(row.classList.contains("is-atm"), true);
  assert.equal(row.classList.contains("is-manual-entry"), false);
  assert.equal(row.getAttribute("aria-label"),
    "Call 119.00, Put 219.00, strike 23,750, 2 saved entries");
});

test("editor close control cancels draft and restores exact-row focus", async () => {
  const h = createBreakEvenLifecycleHarness();
  await h.settle();
  const row = h.row(23750);
  h.doubleClick(23750);
  const editor = h.editor(23750);
  editor.querySelector(".nifty-manual-editor__premium").focus();

  editor.querySelector(".nifty-manual-editor__close").dispatch("click", {});
  await h.settle();

  assert.equal(h.editor(23750), null);
  assert.equal(h.document.activeElement, row);
});

test("editor controls never schedule a delayed row interaction", async () => {
  const h = createBreakEvenLifecycleHarness();
  await h.settle();
  h.doubleClick(23750);
  const editor = h.editor(23750);

  h.clickTarget(editor.children[0]);
  h.flushClickTimer();
  await h.settle();

  assert.equal(h.editor(23750), editor);
  assert.equal(h.rails(), null);
});

test("editor add persists only exact row and restores focus without fetching", async () => {
  const h = createBreakEvenLifecycleHarness({ strategySupport: true });
  await h.settle();
  const fetchesBeforeEditor = h.fetchCalls();

  h.doubleClick(23750);
  chooseCallSellEditor(h);
  commitManualEditor(h, 23750);
  await h.settle();

  assert.deepEqual(h.manualEntries().map((entry) => ({
    id: entry.id, strike: entry.strike, optionType: entry.optionType,
    direction: entry.direction, lots: entry.lots, premium: entry.premium
  })), [{ id: "new-manual-entry-1", strike: 23750, optionType: "CALL", direction: "SELL", lots: 2, premium: 358 }]);
  assert.equal(h.storageSetCalls(), 1);
  assert.equal(h.editor(23750), null);
  assert.equal(h.document.activeElement, h.row(23750));
  assert.equal(h.fetchCalls(), fetchesBeforeEditor);
});

test("storage failure keeps exact editor draft open and old plan intact", async () => {
  const h = createBreakEvenLifecycleHarness({
    storageSetError: new Error("write failed"),
    strategySupport: true
  });
  await h.settle();

  h.doubleClick(23750);
  chooseCallSellEditor(h);
  commitManualEditor(h, 23750);
  await h.settle();

  assert.ok(h.editor(23750));
  assert.deepEqual(h.manualEntries(), []);
  assert.equal(h.storageSetCalls(), 1);
  assert.equal(h.status(), "PLAN NOT SAVED");
});

test("rejected manual write removes its self-echo correlation", async () => {
  const h = createBreakEvenLifecycleHarness({
    storageSetError: new Error("write failed"),
    strategySupport: true
  });
  await h.settle();

  h.doubleClick(23750);
  chooseCallSellEditor(h, 23750);
  commitManualEditor(h, 23750);
  await h.settle();
  const rejectedStore = h.lastManualPlanWrite();
  assert.ok(rejectedStore);

  h.document.dispatch("pointerdown", { target: { closest() { return null; } } });
  const rendersBeforeExternalChange = h.manualRenderCalls();
  h.storage({ manualPlans: { newValue: rejectedStore } });
  await h.settle();

  assert.ok(h.manualRenderCalls() > rendersBeforeExternalChange);
});

test("serialized overlapping manual commits preserve both explicit entries", async () => {
  const h = createBreakEvenLifecycleHarness({ deferStorage: true, strategySupport: true });
  await h.settle();

  h.doubleClick(23750);
  chooseCallSellEditor(h, 23750);
  const firstCommit = commitManualEditor(h, 23750);
  await h.settle();
  assert.equal(firstCommit.disabled, true, "originating editor cannot commit twice while its write is pending");
  assert.equal(h.storageSetCalls(), 1);

  h.doubleClick(23800);
  chooseCallSellEditor(h, 23800);
  const secondCommit = commitManualEditor(h, 23800);
  await h.settle();
  assert.equal(secondCommit.disabled, true, "queued editor commit remains guarded");
  assert.equal(h.storageSetCalls(), 1, "second updater waits for the first committed store");

  h.resolveStorageWrite();
  await h.settle();
  assert.equal(h.storageSetCalls(), 2);
  assert.ok(h.editor(23800), "older completion cannot close the newer editor");
  assert.equal(h.document.activeElement, null, "older completion cannot focus its row");

  h.resolveStorageWrite();
  await h.settle();
  const committed = h.manualEntries().map(({ id, strike }) => ({ id, strike }));
  assert.deepEqual(committed.map(({ strike }) => strike), [23750, 23800]);
  assert.equal(new Set(committed.map(({ id }) => id)).size, 2,
    "each committed manual leg owns one unique immutable identity");
  assert.equal(h.editor(23800), null);
  assert.equal(h.document.activeElement, h.row(23800));
});

test("self-originated storage echo cannot replace a newer manual editor", async () => {
  const h = createBreakEvenLifecycleHarness({ deferStorage: true, strategySupport: true });
  await h.settle();

  h.doubleClick(23750);
  chooseCallSellEditor(h, 23750);
  commitManualEditor(h, 23750);
  await h.settle();

  h.doubleClick(23800);
  chooseCallSellEditor(h, 23800);
  const newerEditor = h.editor(23800);

  h.resolveStorageWrite();
  await h.settle();

  assert.equal(h.editor(23800), newerEditor, "storage echo from the older editor leaves the newer draft intact");
  assert.equal(h.document.activeElement, null);
});

test("self-originated storage echo cannot rerender or unhide concealed rows", async () => {
  const h = createBreakEvenLifecycleHarness({ deferStorage: true, strategySupport: true });
  await h.settle();

  h.doubleClick(23750);
  chooseCallSellEditor(h, 23750);
  commitManualEditor(h, 23750);
  await h.settle();

  const row = h.row(23750);
  h.scheduleTimeframeChange("Chart for NSE_DLY:NIFTY, 1 day");
  assert.equal(row.hidden, true);
  const rendersBeforeEcho = h.manualRenderCalls();

  h.resolveStorageWrite();
  await h.settle();

  assert.equal(row.hidden, true);
  assert.equal(h.manualRenderCalls(), rendersBeforeEcho);
});

test("self-originated storage echo cannot rerender after pagehide lifecycle reset", async () => {
  const h = createBreakEvenLifecycleHarness({ deferStorage: true, strategySupport: true });
  await h.settle();

  h.doubleClick(23750);
  chooseCallSellEditor(h, 23750);
  commitManualEditor(h, 23750);
  await h.settle();

  h.pagehide(true);
  const rendersBeforeEcho = h.manualRenderCalls();

  h.resolveStorageWrite();
  await h.settle();

  assert.equal(h.manualRenderCalls(), rendersBeforeEcho);
  assert.equal(h.editor(23750) ?? null, null);
});

test("all unacknowledged self-write echoes survive pagehide past sixteen writes", async () => {
  const h = createBreakEvenLifecycleHarness({
    manualEntries: [savedManualEntry()],
    deferManualStorageEvents: true,
    strategySupport: true
  });
  await h.settle();

  for (let write = 0; write < 17; write += 1) {
    h.click(23750);
    h.doubleClick(23750);
    h.editor(23750).children[4].dispatch("click", {});
    commitManualEditor(h, 23750);
    await h.settle();
  }

  assert.equal(h.storageSetCalls(), 17);
  assert.equal(h.pendingManualStorageEventCount(), 17);
  h.pagehide(true);
  const rootBeforeEarliestEcho = h.document.getElementById("nifty-axis-ladder");
  const rowBeforeEarliestEcho = h.row(23750);
  const rowHiddenBeforeEarliestEcho = rowBeforeEarliestEcho.hidden;
  const rendersBeforeEarliestEcho = h.manualRenderCalls();

  h.resolveManualStorageEvent();
  await h.settle();

  assert.equal(h.manualRenderCalls(), rendersBeforeEarliestEcho);
  assert.equal(h.document.getElementById("nifty-axis-ladder"), rootBeforeEarliestEcho);
  assert.equal(h.row(23750), rowBeforeEarliestEcho);
  assert.equal(h.row(23750).hidden, rowHiddenBeforeEarliestEcho);
  assert.equal(h.editor(23750) ?? null, null);
});

test("serialized overlapping save and remove preserve both explicit mutations", async () => {
  const saved = savedManualEntry();
  const removable = savedManualEntry({
    id: "entry-23800",
    strike: 23800,
    premium: 120,
    callSnapshot: 120,
    putSnapshot: 220,
    createdAt: "2026-07-29T09:00:00.000Z",
    updatedAt: "2026-07-29T09:00:00.000Z"
  });
  const h = createBreakEvenLifecycleHarness({
    manualEntries: [saved, removable], deferStorage: true, strategySupport: true
  });
  await h.settle();

  h.click(23750);
  h.doubleClick(23750);
  h.setEditorLots(2);
  commitManualEditor(h, 23750);
  await h.settle();

  h.click(23800);
  h.doubleClick(23800);
  const remove = removeManualEditor(h, 23800);
  await h.settle();
  assert.equal(remove.disabled, true);

  h.resolveStorageWrite();
  await h.settle();
  assert.ok(h.editor(23800), "older save completion cannot replace queued remove editor");

  h.resolveStorageWrite();
  await h.settle();
  assert.deepEqual(h.manualEntries().map(({ lots }) => ({ lots })), [{ lots: 2 }]);
  assert.notEqual(h.manualEntries()[0].id, saved.id,
    "editing replaces immutable manual identity while queued remove stays exact");
  assert.equal(h.document.activeElement, h.row(23800));
});

test("serialized overlapping remove and add preserve both explicit mutations", async () => {
  const removed = savedManualEntry();
  const h = createBreakEvenLifecycleHarness({
    manualEntries: [removed], deferStorage: true, strategySupport: true
  });
  await h.settle();

  h.click(23750);
  h.doubleClick(23750);
  removeManualEditor(h, 23750);
  await h.settle();

  h.doubleClick(23800);
  chooseCallSellEditor(h, 23800);
  commitManualEditor(h, 23800);
  await h.settle();

  h.resolveStorageWrite();
  await h.settle();
  assert.ok(h.editor(23800), "older remove completion cannot replace queued add editor");

  h.resolveStorageWrite();
  await h.settle();
  assert.deepEqual(h.manualEntries().map(({ strike }) => ({ strike })), [{ strike: 23800 }]);
  assert.match(h.manualEntries()[0].id, /^new-manual-entry-/);
  assert.equal(h.document.activeElement, h.row(23800));
});

test("same-lifecycle storage failure reports globally without modifying a newer editor", async () => {
  const h = createBreakEvenLifecycleHarness({
    deferStorage: true,
    storageSetError: new Error("write failed"),
    strategySupport: true
  });
  await h.settle();

  h.doubleClick(23750);
  chooseCallSellEditor(h, 23750);
  commitManualEditor(h, 23750);
  await h.settle();

  h.doubleClick(23800);
  chooseCallSellEditor(h, 23800);
  const newerEditor = h.editor(23800);

  h.resolveStorageWrite();
  await h.settle();

  assert.equal(h.status(), "PLAN NOT SAVED");
  assert.equal(h.editor(23800), newerEditor);
  assert.equal(h.manualEntries().length, 0);
});

test("lifecycle reset suppresses storage failure status from an older editor", async () => {
  const h = createBreakEvenLifecycleHarness({
    deferStorage: true,
    storageSetError: new Error("write failed"),
    strategySupport: true
  });
  await h.settle();

  h.doubleClick(23750);
  chooseCallSellEditor(h, 23750);
  commitManualEditor(h, 23750);
  await h.settle();

  h.storage({ enabled: { newValue: false } });
  h.resolveStorageWrite();
  await h.settle();

  assert.equal(h.document.getElementById("nifty-axis-ladder"), null);
});

test("stale manual completion cannot restore UI after lifecycle reset", async () => {
  const h = createBreakEvenLifecycleHarness({ deferStorage: true, strategySupport: true });
  await h.settle();

  h.doubleClick(23750);
  chooseCallSellEditor(h, 23750);
  commitManualEditor(h, 23750);
  await h.settle();
  h.storage({ enabled: { newValue: false } });
  assert.equal(h.document.getElementById("nifty-axis-ladder"), null);

  h.resolveStorageWrite();
  await h.settle();

  assert.equal(h.document.getElementById("nifty-axis-ladder"), null, "late completion cannot recreate the ladder");
  assert.equal(h.document.activeElement, null, "late completion cannot focus a removed row");
  assert.equal(h.manualEntries().length, 1, "successful write remains committed after lifecycle reset");
});

test("post-write render failure keeps the committed plan and never reports PLAN NOT SAVED", async () => {
  const h = createBreakEvenLifecycleHarness({ strategySupport: true });
  await h.settle();
  h.setRenderManualError(new Error("render failed after storage write"));

  h.doubleClick(23750);
  chooseCallSellEditor(h, 23750);
  commitManualEditor(h, 23750);
  await h.settle();

  assert.equal(h.manualEntries().length, 1);
  assert.notEqual(h.status(), "PLAN NOT SAVED");
  assert.equal(h.editor(23750), null, "a successful persistence still completes the editor action");
});

test("post-write placement failure keeps the committed plan and never reports PLAN NOT SAVED", async () => {
  const h = createBreakEvenLifecycleHarness({ strategySupport: true });
  await h.settle();
  h.setAxisPairs([]);

  h.doubleClick(23750);
  chooseCallSellEditor(h, 23750);
  commitManualEditor(h, 23750);
  await h.settle();

  assert.equal(h.manualEntries().length, 1);
  assert.notEqual(h.status(), "PLAN NOT SAVED");
});

test("different-row interaction closes the current manual editor before quick rails", async () => {
  const h = createBreakEvenLifecycleHarness();
  await h.settle();
  h.doubleClick(23750);
  assert.ok(h.editor(23750));

  h.click(23800);
  await h.settle();

  assert.equal(h.editor(23750), null);
  assert.ok(h.rails(), "the other row receives its existing quick break-even rails");
});

test("different-row double click closes the current manual editor before opening the next editor", async () => {
  const h = createBreakEvenLifecycleHarness();
  await h.settle();
  h.doubleClick(23750);
  assert.ok(h.editor(23750));

  h.doubleClick(23800);

  assert.equal(h.editor(23750), null);
  assert.ok(h.editor(23800));
  assert.equal(h.rails(), null);
});

test("manual edit replaces identity atomically, preserves created timestamp, and focuses exact row", async () => {
  const original = savedManualEntry();
  const h = createBreakEvenLifecycleHarness({
    manualEntries: [original], strategySupport: true, chainLotSize: 25
  });
  await h.settle();

  h.click(23750);
  h.doubleClick(23750);
  h.setEditorLots(2);
  commitManualEditor(h, 23750);
  await h.settle();

  const [edited] = h.manualEntries();
  assert.notEqual(edited.id, original.id);
  assert.equal(edited.createdAt, original.createdAt);
  assert.notEqual(edited.updatedAt, original.updatedAt);
  assert.equal(edited.lots, 2);
  assert.equal(Object.hasOwn(original, "lotSize"), false);
  assert.equal(edited.lotSize, 25, "editing upgrades a legacy entry from the authoritative current chain");
  assert.equal(h.strategyBook().legs[edited.id].lotSize, 25);
  assert.equal(h.document.activeElement, h.row(23750));
});

test("manual remove targets the active entry identity and focuses its exact row", async () => {
  const removed = savedManualEntry();
  const retained = savedManualEntry({
    id: "entry-23800",
    strike: 23800,
    premium: 120,
    callSnapshot: 120,
    putSnapshot: 220,
    createdAt: "2026-07-29T09:00:00.000Z",
    updatedAt: "2026-07-29T09:00:00.000Z"
  });
  const h = createBreakEvenLifecycleHarness({
    manualEntries: [removed, retained], strategySupport: true
  });
  await h.settle();

  h.click(23750);
  h.doubleClick(23750);
  removeManualEditor(h, 23750);
  await h.settle();

  assert.deepEqual(h.manualEntries().map((entry) => entry.id), [retained.id]);
  assert.equal(h.document.activeElement, h.row(23750));
});

test("storage failure preserves a non-empty store and the editor draft", async () => {
  const original = savedManualEntry();
  const h = createBreakEvenLifecycleHarness({
    manualEntries: [original],
    storageSetError: new Error("write failed"),
    strategySupport: true
  });
  await h.settle();

  h.click(23750);
  h.doubleClick(23750);
  h.setEditorLots(2);
  commitManualEditor(h, 23750);
  await h.settle();

  assert.deepEqual(h.manualEntries(), [original]);
  assert.equal(h.editor(23750).querySelector(".nifty-manual-editor__lots").textContent, "2");
  assert.equal(h.status(), "PLAN NOT SAVED");
});

test("every manual lifecycle hook closes transient editor state", async () => {
  const lifecycleCases = [
    ["outside pointer", (h) => h.document.dispatch("pointerdown", { target: { closest() { return null; } } })],
    ["Escape", (h) => h.document.dispatch("keydown", { key: "Escape", target: h.row(23750) })],
    ["expiry change", (h) => h.storage({ expiry: { newValue: "2026-09-01" } })],
    ["timeframe change", (h) => h.navigateTo("Chart for NSE_DLY:NIFTY, 1 day")],
    ["SPA navigation", (h) => h.navigateSpa("https://www.tradingview.com/chart/next-layout/")],
    ["runtime URL mutation", (h) => h.mutateUrl("https://www.tradingview.com/chart/mutated-layout/")],
    ["pagehide", (h) => h.pagehide(true)],
    ["stop", (h) => h.storage({ enabled: { newValue: false } })]
  ];

  for (const [name, trigger] of lifecycleCases) {
    const h = createBreakEvenLifecycleHarness();
    await h.settle();
    h.doubleClick(23750);
    assert.ok(h.editor(23750), `${name}: editor opens before lifecycle reset`);

    await trigger(h);

    assert.equal(h.editor(23750) ?? null, null, `${name}: editor closes`);
  }
});

test("direct hideRows route closes manual editor state", async () => {
  const h = createBreakEvenLifecycleHarness();
  await h.settle();
  h.doubleClick(23750);

  await h.navigateTo("Chart for NSE_DLY:NIFTY, 2 hours");

  assert.equal(h.editor(23750) ?? null, null);
  assert.equal(h.row(23750) ?? null, null);
});

test("direct concealRows route closes editor before timeframe recalibration", async () => {
  const h = createBreakEvenLifecycleHarness();
  await h.settle();
  h.doubleClick(23750);
  const row = h.row(23750);

  h.scheduleTimeframeChange("Chart for NSE_DLY:NIFTY, 1 day");

  assert.equal(h.editor(23750) ?? null, null);
  assert.equal(row.hidden, true);
});

test("selected rows clear through outside input, Escape, dedicated refresh clear, and expiry change", async () => {
  const harness = createBreakEvenLifecycleHarness();
  await harness.settle();

  let row = harness.select();
  harness.document.dispatch("click", { target: { closest() { return null; } } });
  assert.equal(row.classList.contains("is-selected"), false);
  assert.equal(row.getAttribute("aria-pressed"), "false");

  row = harness.select();
  harness.document.dispatch("keydown", { key: "Escape", target: row });
  assert.equal(row.classList.contains("is-selected"), false);
  assert.equal(row.getAttribute("aria-pressed"), "false");

  row = harness.select();
  const refreshHandledAsync = harness.runtimeListeners[0]({ type: "CLEAR_BREAK_EVEN_SELECTION" }, null, () => {});
  assert.equal(refreshHandledAsync, false);
  assert.equal(row.classList.contains("is-selected"), false, "refresh clears before async option fetch settles");
  assert.equal(row.getAttribute("aria-pressed"), "false");

  harness.doubleClick(23750);
  assert.ok(harness.editor(23750));
  harness.runtimeListeners[0]({ type: "CLEAR_BREAK_EVEN_SELECTION" }, null, () => {});
  assert.equal(harness.editor(23750), null, "refresh clear closes manual editor immediately");

  await harness.settle();
  row = harness.select();
  harness.storage({ expiry: { newValue: "2026-09-01" } });
  assert.equal(row.classList.contains("is-selected"), false);
  assert.equal(row.getAttribute("aria-pressed"), "false");
});

test("stop clears selected rows and re-enable restores one listener set", async () => {
  const harness = createBreakEvenLifecycleHarness();
  await harness.settle();
  const row = harness.select();
  const initialRoot = harness.document.getElementById("nifty-axis-ladder");
  assert.equal(harness.document.listenerCount("pointerdown"), 1);
  assert.equal(harness.document.listenerCount("keydown"), 1);
  assert.equal(initialRoot.listenerCount("click"), 1);

  harness.storage({ enabled: { newValue: false } });
  assert.equal(row.classList.contains("is-selected"), false);
  assert.equal(row.getAttribute("aria-pressed"), "false");
  assert.equal(harness.document.listenerCount("pointerdown"), 0);
  assert.equal(harness.document.listenerCount("keydown"), 0);
  assert.equal(initialRoot.listenerCount("click"), 0);

  harness.storage({ enabled: { newValue: true } });
  await harness.settle();
  const reenabledRoot = harness.document.getElementById("nifty-axis-ladder");
  assert.equal(harness.document.listenerCount("pointerdown"), 1);
  assert.equal(harness.document.listenerCount("keydown"), 1);
  assert.equal(reenabledRoot.listenerCount("click"), 1);
  harness.select();
});

test("clicked selection creates two rails across the full plot behind the label", async () => {
  const harness = createBreakEvenLifecycleHarness();
  await harness.settle();
  harness.select();
  await harness.settle();

  const rails = harness.rails();
  assert.ok(rails);
  assert.equal(rails.children.length, 2);
  rails.children.forEach((line) => {
    assert.equal(line.classList.contains("nifty-break-even__line"), true);
    assert.equal(line.style.left, "0px");
    assert.equal(line.style.width, "1200px");
    assert.equal(line.children.length, 1);
    assert.equal(line.children[0].style.right, "1512px");
  });
});

test("switching valid rows removes old rails before the next asynchronous placement and never fetches quotes", async () => {
  const harness = createBreakEvenLifecycleHarness();
  await harness.settle();
  harness.select(23750);
  await harness.settle();
  assert.equal(harness.rails().children.length, 2);
  const fetchesBeforeClick = harness.fetchCalls();

  const nextRow = harness.select(23800);
  assert.equal(harness.rails(), null, "previous rails disappear in the click turn");
  assert.equal(nextRow.getAttribute("aria-pressed"), "true");
  assert.equal(harness.fetchCalls(), fetchesBeforeClick, "row clicks only place cached rows");

  await harness.settle();
  assert.equal(harness.rails().children.length, 2);
});

test("zoom removing selected strike clears quick break-evens and hidden selection", async () => {
  const harness = createBreakEvenLifecycleHarness();
  await harness.settle();
  harness.select(23750);
  await harness.settle();

  harness.setAxisPairs([
    { price: 24000, y: 100 },
    { price: 23950, y: 110 },
    { price: 23900, y: 120 },
    { price: 23850, y: 130 },
    { price: 23800, y: 140 }
  ]);
  await harness.retryPlacement();

  assert.equal(harness.row(23750) ?? null, null);
  assert.equal(harness.rails() ?? null, null);
  assert.equal(harness.status(), "LIVE");
});

test("price-axis drag keeps selected strike and remaps its quick break-evens", async () => {
  const harness = createBreakEvenLifecycleHarness();
  await harness.settle();
  const row = harness.select(23750);
  await harness.settle();

  const chartTarget = { closest() { return null; } };
  harness.document.dispatch("pointerdown", { target: chartTarget, clientX: 100, clientY: 100 });
  harness.document.dispatch("pointermove", { target: chartTarget, clientX: 100, clientY: 120 });
  harness.document.dispatch("click", { target: chartTarget, clientX: 100, clientY: 120 });
  harness.setAxisPairs([
    { price: 23900, y: 100 },
    { price: 23850, y: 120 },
    { price: 23800, y: 140 },
    { price: 23750, y: 160 },
    { price: 23700, y: 180 }
  ]);
  await harness.retryPlacement();

  assert.equal(row.getAttribute("aria-pressed"), "true");
  assert.equal(harness.row(23750).getAttribute("aria-pressed"), "true");
  assert.equal(harness.rails().children.length, 2);
});

test("zoom removal clears saved face identity before strike returns", async () => {
  const book = chartStrategyBookWithSameStrikeBroker();
  const harness = createBreakEvenLifecycleHarness({
    strategyBook: book,
    manualEntries: Object.values(book.legs).filter((entry) => entry.source === "MANUAL")
  });
  await harness.settle();
  harness.click(23800);
  await harness.settle();
  assert.match(harness.row(23800).getAttribute("aria-label"), /Buy Put, 1 lot/);

  harness.setAxisPairs([
    { price: 24100, y: 100 },
    { price: 24050, y: 110 },
    { price: 24000, y: 120 },
    { price: 23950, y: 130 },
    { price: 23900, y: 140 }
  ]);
  await harness.retryPlacement();
  assert.equal(harness.row(23800), null);

  harness.setAxisPairs([
    { price: 23900, y: 100 },
    { price: 23850, y: 110 },
    { price: 23800, y: 120 },
    { price: 23750, y: 130 },
    { price: 23700, y: 140 }
  ]);
  await harness.retryPlacement();

  assert.doesNotMatch(harness.row(23800).getAttribute("aria-label") || "", /Buy Put, 1 lot/,
    "restored row starts on live quote face");
  harness.click(23800);
  await harness.settle();
  assert.match(harness.row(23800).getAttribute("aria-label"), /Buy Put, 1 lot/,
    "first click after restore starts cycle from newest exact face");
});

test("clicking the selected row toggles its rails and selection off", async () => {
  const harness = createBreakEvenLifecycleHarness();
  await harness.settle();
  const row = harness.select(23750);
  await harness.settle();
  assert.equal(harness.rails().children.length, 2);

  harness.click(23750);
  assert.equal(row.classList.contains("is-selected"), false);
  assert.equal(row.getAttribute("aria-pressed"), "false");
  assert.equal(harness.rails(), null);
  assert.equal(harness.status(), "LIVE");
});

test("invalid-price row stays selected, draws no rails, and reports unavailable without fetching", async () => {
  const harness = createBreakEvenLifecycleHarness({ invalidRows: { 23750: { call: null } } });
  await harness.settle();
  const fetchesBeforeClick = harness.fetchCalls();

  const row = harness.click(23750);
  assert.equal(row.classList.contains("is-selected"), true);
  assert.equal(row.getAttribute("aria-pressed"), "true");
  assert.equal(harness.rails(), null);
  assert.equal(harness.status(), "OPTION PRICE UNAVAILABLE");
  assert.equal(harness.fetchCalls(), fetchesBeforeClick);
});

test("unavailable status overrides later placement while normal status updates underneath", async () => {
  const harness = createBreakEvenLifecycleHarness({ invalidRows: { 23750: { call: null } } });
  await harness.settle();
  const row = harness.select(23750);

  await harness.retryPlacement();
  assert.equal(harness.status(), "OPTION PRICE UNAVAILABLE");
  assert.equal(row.classList.contains("is-selected"), true);

  harness.setAxisPairs([]);
  await harness.retryPlacement();
  assert.equal(harness.status(), "OPTION PRICE UNAVAILABLE");

  harness.document.dispatch("click", { target: { closest() { return null; } } });
  assert.equal(harness.status(), "Native axis map is unavailable.");
});

test("generic timeframe rebuild failure preserves clicked snapshot and restores rails after axis recovery", async () => {
  const harness = createBreakEvenLifecycleHarness();
  await harness.settle();
  harness.select(23750);
  await harness.settle();
  assert.equal(harness.rails().children.length, 2);

  harness.setAxisPairs([]);
  await harness.navigateTo("Chart for NSE_DLY:NIFTY, 1 day");
  assert.equal(harness.rails(), null);

  harness.setAxisPairs([
    { price: 24000, y: 100 },
    { price: 23950, y: 110 },
    { price: 23900, y: 120 },
    { price: 23850, y: 130 },
    { price: 23800, y: 140 },
    { price: 23750, y: 150 },
    { price: 23700, y: 160 }
  ]);
  await harness.navigateTo("Chart for NSE_DLY:NIFTY, 1 hour");
  const restored = harness.row(23750);
  assert.equal(restored.classList.contains("is-selected"), true);
  assert.equal(restored.getAttribute("aria-pressed"), "true");
  assert.equal(harness.rails().children.length, 2);
});

test("generic timeframe rebuild failure preserves unavailable selection feedback through recovery", async () => {
  const harness = createBreakEvenLifecycleHarness({ invalidRows: { 23750: { call: null } } });
  await harness.settle();
  harness.select(23750);
  assert.equal(harness.status(), "OPTION PRICE UNAVAILABLE");

  harness.setAxisPairs([]);
  await harness.navigateTo("Chart for NSE_DLY:NIFTY, 1 day");
  assert.equal(harness.status(), "OPTION PRICE UNAVAILABLE");

  harness.setAxisPairs([
    { price: 24000, y: 100 },
    { price: 23950, y: 110 },
    { price: 23900, y: 120 },
    { price: 23850, y: 130 },
    { price: 23800, y: 140 },
    { price: 23750, y: 150 },
    { price: 23700, y: 160 }
  ]);
  await harness.navigateTo("Chart for NSE_DLY:NIFTY, 1 hour");
  const restored = harness.row(23750);
  assert.equal(restored.classList.contains("is-selected"), true);
  assert.equal(restored.getAttribute("aria-pressed"), "true");
  assert.equal(harness.rails(), null);
  assert.equal(harness.status(), "OPTION PRICE UNAVAILABLE");
});

test("switching from invalid selection to a valid row clears unavailable override", async () => {
  const harness = createBreakEvenLifecycleHarness({ invalidRows: { 23750: { call: null } } });
  await harness.settle();
  harness.select(23750);
  assert.equal(harness.status(), "OPTION PRICE UNAVAILABLE");

  const validRow = harness.select(23800);
  assert.equal(validRow.classList.contains("is-selected"), true);
  assert.equal(harness.status(), "PARTIAL");

  await harness.settle();
  assert.equal(harness.rails().children.length, 2);
  assert.equal(harness.status(), "PARTIAL");
});

test("clearing an unavailable selection restores the normal status", async () => {
  const harness = createBreakEvenLifecycleHarness({ invalidRows: { 23750: { call: null } } });
  await harness.settle();
  const normalStatus = harness.status();
  const row = harness.select(23750);
  assert.equal(harness.status(), "OPTION PRICE UNAVAILABLE");

  harness.document.dispatch("click", { target: { closest() { return null; } } });
  assert.equal(row.classList.contains("is-selected"), false);
  assert.equal(harness.rails(), null);
  assert.equal(harness.status(), normalStatus);

  harness.select(23750);
  harness.document.dispatch("keydown", { key: "Escape", target: row });
  assert.equal(harness.status(), normalStatus);

  harness.select(23750);
  harness.runtimeListeners[0]({ type: "REFRESH_OPTION_NUMBERS" }, null, () => {});
  assert.equal(harness.status(), normalStatus);

  harness.select(23750);
  harness.storage({ expiry: { newValue: "2026-09-01" } });
  assert.equal(row.classList.contains("is-selected"), false);
  assert.equal(harness.rails(), null);
  assert.equal(harness.status(), "MANUAL REFRESH REQUIRED");
});

test("non-NIFTY navigation clears invalid selection, rails, and unavailable feedback", async () => {
  const harness = createBreakEvenLifecycleHarness({ invalidRows: { 23750: { call: null } } });
  await harness.settle();
  const row = harness.select(23750);
  assert.equal(harness.status(), "OPTION PRICE UNAVAILABLE");

  await harness.navigateTo("Chart for TVC:DXY, 1 hour");
  assert.equal(row.classList.contains("is-selected"), false);
  assert.equal(row.getAttribute("aria-pressed"), "false");
  assert.equal(harness.rails(), null);
  assert.equal(harness.status(), null);
  assert.equal(harness.document.getElementById("nifty-axis-ladder"), null);
});

test("pagehide including BFCache entry clears clicked selection immediately", async () => {
  const harness = createBreakEvenLifecycleHarness();
  await harness.settle();
  const row = harness.select();
  await harness.settle();

  harness.pagehide(true);

  assert.equal(row.classList.contains("is-selected"), false);
  assert.equal(row.getAttribute("aria-pressed"), "false");
  assert.equal(harness.rails(), null);
});

test("same-label SPA URL navigation clears selection without treating timeframe rebuild as navigation", async () => {
  const harness = createBreakEvenLifecycleHarness();
  await harness.settle();
  let row = harness.select();
  await harness.navigateTo("Chart for NSE_DLY:NIFTY, 1 day");
  row = harness.row(23750);
  assert.equal(row.getAttribute("aria-pressed"), "true", "timeframe transition preserves selection");

  harness.navigateSpa("https://www.tradingview.com/chart/next-layout/");

  assert.equal(row.classList.contains("is-selected"), false);
  assert.equal(row.getAttribute("aria-pressed"), "false");
  assert.equal(harness.rails(), null);
});

test("off-screen rails pin top and bottom markers to plot edges before lane-zero rows", async () => {
  const harness = createBreakEvenLifecycleHarness({ plotRect: { left: 0, top: 80, right: 1200, bottom: 230 } });
  await harness.settle();

  harness.select(24000);
  await harness.settle();
  let rails = harness.rails();
  let marker = rails.children.find((element) => element.classList.contains("is-top"));
  assert.ok(marker);
  assert.equal(marker.style.top, "80px");
  assert.equal(marker.style.right, "1512px");

  harness.select(23450);
  await harness.settle();
  rails = harness.rails();
  marker = rails.children.find((element) => element.classList.contains("is-bottom"));
  assert.ok(marker);
  assert.equal(marker.style.top, "215px");
  assert.equal(Number(marker.style.top.slice(0, -2)) + 15, 230);
  assert.equal(marker.style.right, "1512px");
});

test("visible rail labels stay within plot bounds near top and bottom", async () => {
  const harness = createBreakEvenLifecycleHarness({ plotRect: { left: 0, top: 75, right: 1200, bottom: 253 } });
  await harness.settle();

  for (const strike of [24000, 23450]) {
    harness.select(strike);
    await harness.settle();
    const labels = harness.rails().children
      .filter((element) => element.classList.contains("nifty-break-even__line"))
      .map((line) => line.children[0]);
    assert.ok(labels.length > 0);
    labels.forEach((label) => {
      const top = Number(label.style.top.slice(0, -2));
      assert.ok(top >= 75);
      assert.ok(top + 15 <= 253);
    });
  }
});

test("close rails keep exact line y coordinates while labels stack", async () => {
  const harness = createBreakEvenLifecycleHarness();
  harness.setProject((level) => ({ mode: "line", y: level.kind === "call" ? 200 : 205 }));
  await harness.settle();
  harness.select();
  await harness.settle();

  const lines = harness.rails().children;
  assert.deepEqual(lines.map((line) => line.style.top), ["200px", "205px"]);
  assert.deepEqual(lines.map((line) => line.children[0].style.top), ["185px", "202px"]);
});

test("same-edge offscreen markers stack without leaving plot", async () => {
  const harness = createBreakEvenLifecycleHarness();
  harness.setProject(() => ({ mode: "edge", edge: "top", y: 0 }));
  await harness.settle();
  harness.select();
  await harness.settle();

  const markers = harness.rails().children;
  assert.deepEqual(markers.map((marker) => marker.style.top), ["0px", "17px"]);
  assert.ok(markers.every((marker) => marker.classList.contains("is-top")));
});

test("invalid axis map or projection conceals rails without clearing selected row", async () => {
  const harness = createBreakEvenLifecycleHarness();
  await harness.settle();
  const row = harness.select();
  await harness.settle();
  assert.equal(harness.rails().children.length, 2);

  harness.setAxisPairs([]);
  await harness.retryPlacement();
  assert.equal(harness.rails(), null);
  assert.equal(row.classList.contains("is-selected"), true);

  harness.setAxisPairs([
    { price: 24000, y: 100 },
    { price: 23950, y: 110 },
    { price: 23900, y: 120 },
    { price: 23850, y: 130 },
    { price: 23800, y: 140 },
    { price: 23750, y: 150 },
    { price: 23700, y: 160 }
  ]);
  harness.setProject(() => null);
  await harness.retryPlacement();
  assert.equal(harness.rails(), null);
  assert.equal(row.classList.contains("is-selected"), true);

  harness.setProject(require("./breakeven-rails.js").project);
  await harness.retryPlacement();
  assert.equal(harness.rails().children.length, 2);
  assert.equal(row.classList.contains("is-selected"), true);
});
