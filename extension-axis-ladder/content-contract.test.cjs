"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const api = require("./content.js");
const viewIdentity = require("./seller-view-identity.js");
const strategyStore = require("./strategy-store.js");

const RISK_EXPIRY = "2026-08-25";

test("operator guide documents click-only single-leg break-even rails", () => {
  const readme = fs.readFileSync(path.join(__dirname, "README.md"), "utf8");
  assert.match(readme, /^Version 0\.5\.0\b/m);
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

test("0.5.0 guides document exact manual-only strategy workflow and keyboard parity", () => {
  const guides = [
    ["extension", fs.readFileSync(path.join(__dirname, "README.md"), "utf8")],
    ["root", fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf8")]
  ];
  for (const [name, guide] of guides) {
    assert.match(guide, /^Version 0\.5\.0\b/m, `${name}: candidate version`);
    assert.match(guide, /Double-click[^.\n]*row[^.\n]*add/i, `${name}: add gesture`);
    assert.match(guide, /CALL ▾[^.\n]*PUT ▾[^.\n]*Buy[^.\n]*Sell/i, `${name}: staged menus`);
    assert.match(guide, /positive whole-number lots[^.\n]*editable premium/i, `${name}: lot and premium controls`);
    assert.match(guide, /top-left `C2`[^.\n]*`P3`[^.\n]*Call[^.\n]*Put lots/i, `${name}: lot badge meaning`);
    assert.match(guide, /ARB Desk panel tokens[^.\n]*warning tokens[^.\n]*black text[^.\n]*accent tokens[^.\n]*danger tokens/i,
      `${name}: exact shared row tokens`);
    assert.match(guide, /single-click[^.\n]*newest-first[^.\n]*live/i, `${name}: entry cycle`);
    assert.match(guide, /PLAN BE[^.\n]*combined[^.\n]*expiry payoff[^.\n]*zero/i, `${name}: combined break-even meaning`);
    assert.match(guide, /rails span[^.\n]*both directions/i, `${name}: rail direction`);
    assert.match(guide, /individual position P&L[^.\n]*never combined/i, `${name}: P&L meaning`);
    assert.match(guide, /manual refresh[^.\n]*live values[^.\n]*saved snapshots[^.\n]*unchanged/i,
      `${name}: refresh boundary`);
    assert.match(guide, /Shift\+Enter[^.\n]*editor[^.\n]*Enter[^.\n]*Space[^.\n]*single-click[^.\n]*Escape[^.\n]*live/i,
      `${name}: keyboard workflow`);
    assert.match(guide, /manual-only[^.\n]*does not import broker positions or tradebooks[^.\n]*cannot place, modify, or cancel orders/i,
      `${name}: broker and order boundary`);
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
  const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  assert.match(source, /chrome\.runtime\.sendMessage\(\{\s*type:\s*"FETCH_NIFTY_CHAIN",\s*expiry\s*\}\)/);
  assert.doesNotMatch(source, /fetch\([^)]*api\/nifty-chain/);
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
  assert.equal(api.formatRow({ strike: 26000, call: "12.5", put: 0 }), "C 12.50 | P 0.00 | 26,000");
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
    fetchChain: async () => { fetches += 1; throw new Error("second chain request forbidden"); },
    captureAxisScale: async () => scale(),
    renderRows: (rows) => rendered.push(rows),
    placeRows: () => true
  });
  const refreshChain = {
    version: 1,
    updatedAt: "2026-08-01T03:50:00.000Z",
    expiry: "2026-08-25",
    ...chain(23767.45)
  };

  assert.equal(typeof controller.setChainSnapshot, "function");
  assert.equal(controller.setChainSnapshot(refreshChain), true);
  assert.equal(await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour"), true);
  assert.equal(fetches, 0);
  assert.equal(rendered.at(-1).length, 13);
  assert.equal(controller.chain().updatedAt, "2026-08-01T03:50:00.000Z");
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
  assert.match(badges, /top:\s*-9px/);
  assert.match(badge, /border:\s*1px solid var\(--ladder-selected-ink\)/);
  assert.match(badge, /background:\s*var\(--ladder-selected\)/);
  assert.match(badge, /color:\s*var\(--ladder-selected-ink\)/);
  assert.match(atmRowBadge, /border-color:\s*var\(--ladder-atm-badge\)/);
  assert.match(atmRowBadge, /background:\s*var\(--ladder-atm-badge\)/);
  assert.match(atmRowBadge, /color:\s*var\(--ladder-atm-badge-ink\)/);
  assert.match(editor, /position:\s*fixed/);
  assert.match(editor, /z-index:\s*[3-9]/);
  assert.match(editor, /top:\s*50%/);
  assert.match(editor, /width:\s*max-content/);
  assert.match(editor, /background:\s*var\(--ladder-selected\)/);
  assert.match(editor, /transform:\s*translateY\(-50%\)/);
  assert.match(css, /\.nifty-axis-ladder__row\.has-manual-editor[\s\S]*?\.nifty-axis-ladder__cell[\s\S]*?visibility:\s*hidden/);
  assert.doesNotMatch(css, /\.nifty-axis-ladder__row:has\(>\s*\.nifty-manual-editor\)/);
});

test("light warning surfaces use white text while ATM lot badge stays black with white text", () => {
  const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");
  const light = css.match(/#nifty-axis-ladder\[data-theme="light"\]\s*\{([^}]+)\}/)?.[1] || "";
  assert.match(light, /--ladder-atm-ink:\s*#ffffff/);
  assert.match(light, /--ladder-selected-ink:\s*#ffffff/);
  assert.match(css, /--ladder-atm-badge:\s*#111113/);
  assert.match(css, /--ladder-atm-badge-ink:\s*#f4f4f5/);
});

test("manual persistence crosses only the service-worker operation boundary", () => {
  const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  assert.match(source, /MUTATE_MANUAL_PLANS/);
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
  assert.match(strategyCss, /\.nifty-strategy__trade\.is-profit[\s\S]*?var\(--pnl-profit\)/);
  assert.match(strategyCss, /\.nifty-strategy__trade\.is-loss[\s\S]*?var\(--pnl-loss\)/);
  assert.doesNotMatch(strategyCss, /#[0-9a-f]{3,8}\b/i);
});

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
  spot = 23767.45,
  strategyBook = null
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
  let nextManualEntryId = 1;
  const railApi = require("./breakeven-rails.js");
  const manualPlanApi = require("./manual-plan.js");
  const manualPayoffApi = require("./manual-payoff.js");
  const manualInteractionApi = require("./manual-interaction.js");
  const manualUiApi = require("./manual-ui.js");
  const strategyPreviewApi = require("./strategy-preview.js");
  const strategyChartApi = require("./strategy-chart.js");
  let storedStrategyBook = strategyBook;
  const strategyMutationMessages = [];
  const initialManualPlans = rawManualPlans || manualEntries.reduce(
    (store, entry) => manualPlanApi.upsertEntry(store, entry),
    manualPlanApi.emptyStore()
  );
  let storedManualPlans = initialManualPlans;
  let manualMutationTail = Promise.resolve();
  let axisPairs = Array.from({ length: 21 }, (_, index) => ({
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
      getBoundingClientRect() { return { left: 100, top: 20, right: 340, bottom: 40, width: 240, height: 20 }; }
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
    NiftyManualPayoff: manualPayoffApi,
    NiftyManualInteraction: manualInteractionApi,
    NiftyManualUi: {
      ...manualUiApi,
      renderRow(...args) {
        manualRenderCalls += 1;
        if (renderManualError) throw renderManualError;
        return manualUiApi.renderRow(...args);
      }
    },
    ...(strategyBook ? {
      OptionsStrategyStore: strategyStore,
      OptionsStrategyPreview: strategyPreviewApi,
      OptionsStrategyChart: strategyChartApi
    } : {}),
    NiftyRiskOverlay: require("./risk-overlay.js"),
    NiftySellerViewIdentity: viewIdentity,
    NiftyTimeframeLadder: require("./timeframe-ladder.js"),
    chrome: {
      runtime: {
        sendMessage: async (message) => {
          if (message?.type === "MIGRATE_MANUAL_PLANS" && strategyBook) {
            storedStrategyBook = strategyStore.migrateManualPlans(storedStrategyBook, storedManualPlans, {
              instrumentKey: message.instrumentKey,
              underlying: message.underlying,
              at: message.at
            });
            return { ok: true, strategyBook: storedStrategyBook };
          }
          if (message?.type === "MUTATE_STRATEGY_BOOK" && strategyBook) {
            strategyMutationMessages.push(message.command);
            storedStrategyBook = strategyStore.applyCommand(storedStrategyBook, message.command);
            dispatchStorage({ strategyBook: { newValue: storedStrategyBook } });
            return { ok: true, strategyBook: storedStrategyBook };
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
              sellerSafetyChain: snapshot,
              sellerSafetyChainsByExpiry: { [snapshot.expiry]: snapshot },
              ...(strategyBook ? { strategyBook: storedStrategyBook } : {})
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
    doubleClick(strike = 23750) {
      const root = document.getElementById("nifty-axis-ladder");
      const row = this.row(strike);
      assert.ok(row, "exact rendered row is available for double click");
      root.dispatch("click", { target: row });
      root.dispatch("dblclick", { target: row });
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
        editor.children[current < lots ? 4 : 2].dispatch("click", {});
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
    storage(change) { dispatchStorage(change); },
    startRefreshOptionNumbers(values) { return requestOptionNumberRefresh(values); },
    async refreshOptionNumbers(values) {
      await requestOptionNumberRefresh(values);
      await settle();
    },
    settle
  };

}

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

test("production strategy rails open details, synchronize squares, preview combined roots, compare, and clear on refresh", async () => {
  const h = createBreakEvenLifecycleHarness({ strategyBook: chartStrategyBook() });
  await h.settle();

  let rails = h.strategyRails();
  assert.ok(rails, "strategy rail layer rendered");
  let labels = rails.querySelectorAll(".nifty-strategy__label");
  assert.deepEqual(labels.map((node) => node.textContent).sort(), ["T1 BE 23,900", "T2 BE 23,700"]);
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
    "COMBINED BE 23,600", "COMBINED BE 24,000"
  ]);
  assert.ok(rails.querySelector(".nifty-strategy-preview"));

  rails.querySelector(".nifty-strategy-preview__compare").dispatch("click", { stopPropagation() {} });
  await h.settle();
  rails = h.strategyRails();
  assert.equal(rails.querySelectorAll(".nifty-strategy__label").length, 4, "Compare restores originals beside combined roots");

  await h.refreshOptionNumbers();
  rails = h.strategyRails();
  assert.equal(rails.querySelector(".nifty-strategy-preview"), null);
  assert.equal(rails.querySelectorAll(".nifty-strategy__selector").every((node) => node.getAttribute("aria-pressed") === "false"), true);
});

test("side panel reads temporary chart strategy selection without mutating it", async () => {
  const h = createBreakEvenLifecycleHarness({ strategyBook: chartStrategyBook() });
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

test("new leg waits for explicit chart strategy ownership before any write", async () => {
  const h = createBreakEvenLifecycleHarness({ strategyBook: chartStrategyBook() });
  await h.settle();
  h.doubleClick(23750);
  let editor = h.editor(23750);
  editor.children[0].dispatch("click", {});
  editor.children.at(-1).children[1].dispatch("click", {});
  editor = h.editor(23750);
  commitManualEditor(h, 23750);

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
  assert.equal(h.strategyMutationMessages().filter((command) => command.type === "ADD_LEG").length, 1);
  assert.equal(h.manualMutationMessages().length, 1);
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

function chooseCallSellEditor(h, strike = 23750) {
  let editor = h.editor(strike);
  editor.children[0].dispatch("click", {});
  editor.children.at(-1).children[1].dispatch("click", {});
  editor = h.editor(strike);
  editor.children[4].dispatch("click", {});
  editor = h.editor(strike);
  editor.children[5].value = "358";
  editor.children[5].dispatch("input", {});
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

function commitManualEditor(h, strike = 23750) {
  const commit = h.editor(strike).querySelector(".nifty-manual-editor__commit");
  assert.ok(commit, "manual editor has a commit control");
  commit.dispatch("click", {});
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
    }
  });
  await h.settle();

  assert.match(h.status(), /MANUAL ENTRY NEEDS REVIEW · 1/);
  assert.deepEqual(h.manualEntries().map((entry) => entry.id), [valid.id]);
  assert.deepEqual(h.invalidManualEntries().map((item) => item.raw), [malformed]);

  h.openEdit(valid.id);
  h.setEditorLots(2);
  commitManualEditor(h);
  await h.settle();

  assert.deepEqual(h.manualEntries().map(({ id, lots }) => ({ id, lots })), [{ id: valid.id, lots: 2 }]);
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
      deferStorage: true
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
    assert.deepEqual(h.manualRailLabels(), ["PLAN BE 23,698", "PLAN BE 25,007"]);

    h.resolveStorageWrite();
    await h.settle();

    assert.equal(h.manualEntries().find((entry) => entry.id === "call-entry").lots, 2);
    assert.deepEqual(h.manualRailLabels(), ["PLAN BE 23,578", "PLAN BE 24,733"]);
    assert.equal(h.row(24100).querySelector(".nifty-axis-ladder__badge").textContent, "C2");
    h.document.dispatch("keydown", { key: "Escape", target: h.row(24100) });
    h.click(24100);
    assert.match(h.row(24100).getAttribute("aria-label"), /2 lots/);
  });
}

test("manual add uses service-worker mutation message instead of content storage write", async () => {
  const h = createBreakEvenLifecycleHarness();
  await h.settle();
  h.doubleClick(23750);
  chooseCallSellEditor(h);
  commitManualEditor(h);
  await h.settle();

  assert.deepEqual(h.manualMutationMessages().map((mutation) => mutation.type), ["upsert"]);
  assert.equal(h.localManualSetCalls(), 0);
  assert.equal(h.manualEntries().length, 1);
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
  assert.equal(editor.querySelector(".nifty-manual-editor__validation").textContent, "CHOOSE LEG");

  editor.children[0].dispatch("click", {});
  editor.children.at(-1).children[0].dispatch("click", {});
  editor = h.editor(23750);
  assert.equal(editor.children[0].getAttribute("aria-pressed"), "true");
  assert.equal(editor.children[0].textContent, "BUY CALL ▾");
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

test("saving a draft replaces preview rails with committed plan rails", async () => {
  const h = createBreakEvenLifecycleHarness({ manualEntries: approvedOneCallThreePuts, spot: 24050 });
  await h.settle();

  h.openEdit("call-entry");
  h.setEditorLots(2);
  await h.settle();
  assert.deepEqual(h.manualRailLabels(), ["PREVIEW BE 23,578", "PREVIEW BE 24,733"]);

  commitManualEditor(h, 24100);
  await h.settle();
  assert.equal(h.storageSetCalls(), 1);
  assert.equal(h.editor(24100), null);
  assert.deepEqual(h.manualRailLabels(), ["PLAN BE 23,578", "PLAN BE 24,733"]);
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

test("Shift+Enter opens exact-row editor and Escape cancels it with row focus restored", async () => {
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
  const h = createBreakEvenLifecycleHarness();
  await h.settle();
  const fetchesBeforeEditor = h.fetchCalls();

  h.doubleClick(23750);
  chooseCallSellEditor(h);
  h.editor(23750).children[6].dispatch("click", {});
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
  const h = createBreakEvenLifecycleHarness({ storageSetError: new Error("write failed") });
  await h.settle();

  h.doubleClick(23750);
  chooseCallSellEditor(h);
  h.editor(23750).children[6].dispatch("click", {});
  await h.settle();

  assert.ok(h.editor(23750));
  assert.deepEqual(h.manualEntries(), []);
  assert.equal(h.storageSetCalls(), 1);
  assert.equal(h.status(), "PLAN NOT SAVED");
});

test("rejected manual write removes its self-echo correlation", async () => {
  const h = createBreakEvenLifecycleHarness({ storageSetError: new Error("write failed") });
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
  const h = createBreakEvenLifecycleHarness({ deferStorage: true });
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
  assert.deepEqual(h.manualEntries().map(({ id, strike }) => ({ id, strike })), [
    { id: "new-manual-entry-1", strike: 23750 },
    { id: "new-manual-entry-2", strike: 23800 }
  ]);
  assert.equal(h.editor(23800), null);
  assert.equal(h.document.activeElement, h.row(23800));
});

test("self-originated storage echo cannot replace a newer manual editor", async () => {
  const h = createBreakEvenLifecycleHarness({ deferStorage: true });
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
  const h = createBreakEvenLifecycleHarness({ deferStorage: true });
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
  const h = createBreakEvenLifecycleHarness({ deferStorage: true });
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
    deferManualStorageEvents: true
  });
  await h.settle();

  h.click(23750);
  for (let write = 0; write < 17; write += 1) {
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
  const h = createBreakEvenLifecycleHarness({ manualEntries: [saved, removable], deferStorage: true });
  await h.settle();

  h.click(23750);
  h.doubleClick(23750);
  h.editor(23750).children[4].dispatch("click", {});
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
  assert.deepEqual(h.manualEntries().map(({ id, lots }) => ({ id, lots })), [{ id: saved.id, lots: 2 }]);
  assert.equal(h.document.activeElement, h.row(23800));
});

test("serialized overlapping remove and add preserve both explicit mutations", async () => {
  const removed = savedManualEntry();
  const h = createBreakEvenLifecycleHarness({ manualEntries: [removed], deferStorage: true });
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
  assert.deepEqual(h.manualEntries().map(({ id, strike }) => ({ id, strike })), [
    { id: "new-manual-entry-1", strike: 23800 }
  ]);
  assert.equal(h.document.activeElement, h.row(23800));
});

test("same-lifecycle storage failure reports globally without modifying a newer editor", async () => {
  const h = createBreakEvenLifecycleHarness({
    deferStorage: true,
    storageSetError: new Error("write failed")
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
    storageSetError: new Error("write failed")
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
  const h = createBreakEvenLifecycleHarness({ deferStorage: true });
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
  const h = createBreakEvenLifecycleHarness();
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
  const h = createBreakEvenLifecycleHarness();
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

test("manual edit preserves identity and created timestamp while focusing its exact row", async () => {
  const original = savedManualEntry();
  const h = createBreakEvenLifecycleHarness({ manualEntries: [original] });
  await h.settle();

  h.click(23750);
  h.doubleClick(23750);
  h.editor(23750).children[4].dispatch("click", {});
  commitManualEditor(h, 23750);
  await h.settle();

  const [edited] = h.manualEntries();
  assert.equal(edited.id, original.id);
  assert.equal(edited.createdAt, original.createdAt);
  assert.notEqual(edited.updatedAt, original.updatedAt);
  assert.equal(edited.lots, 2);
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
  const h = createBreakEvenLifecycleHarness({ manualEntries: [removed, retained] });
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
    storageSetError: new Error("write failed")
  });
  await h.settle();

  h.click(23750);
  h.doubleClick(23750);
  h.editor(23750).children[4].dispatch("click", {});
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
  harness.document.dispatch("pointerdown", { target: { closest() { return null; } } });
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

  harness.document.dispatch("pointerdown", { target: { closest() { return null; } } });
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

  harness.document.dispatch("pointerdown", { target: { closest() { return null; } } });
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
