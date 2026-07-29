"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const api = require("./content.js");
const viewIdentity = require("./seller-view-identity.js");

const RISK_EXPIRY = "2026-08-25";

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
    gridGapPx: 20,
    axisPairs: [
      { price: 24000, y: 100 },
      { price: 23900, y: 120 },
      { price: 23800, y: 140 },
      { price: 23700, y: 160 }
    ]
  };
}

function invertedScale() {
  return {
    ok: true,
    gridGapPx: 20,
    axisPairs: [
      { price: 23700, y: 100 },
      { price: 23800, y: 120 },
      { price: 23900, y: 140 },
      { price: 24000, y: 160 }
    ]
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

test("controller membership follows timeframe profile instead of mutable native axis interval", async () => {
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
  assert.equal(controller.membership().nativeInterval, 200);
  assert.equal(controller.membership().preferredInterval, 50);
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

test("timeframe changes keep independent contract spacing after prior scale auto-fit", async () => {
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
  assert.equal(controller.membership().interval, 250);
  assert.equal(await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 month"), true);
  assert.equal(controller.membership().interval, 500);
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

test("monthly production membership uses widest complete exact range and never edge substitutions", () => {
  const rows = Array.from({ length: 101 }, (_, index) => ({
    strike: 21300 + index * 50,
    call: index,
    put: index + 100
  }));
  const membership = api.freezeMembership({
    timeframe: "1M",
    expiry: "current_month",
    interval: 1000,
    spot: 23767.45,
    chainRows: rows
  });

  assert.equal(membership.interval, 400);
  assert.equal(membership.center, 23750);
  assert.equal(membership.atmStep, 50);
  assert.deepEqual(membership.strikes, [
    21350, 21750, 22150, 22550, 22950, 23350, 23750,
    24150, 24550, 24950, 25350, 25750, 26150
  ]);
  assert.equal(api.freezeMembership({
    timeframe: "1M",
    expiry: "current_month",
    interval: 1000,
    spot: 23767.45,
    chainRows: rows.slice(0, 12)
  }), null);
});

test("builds thirteen frozen contracts from spot but maps their y positions from native axis pairs", async () => {
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
    23500, 23550, 23600, 23650, 23700, 23750, 23800,
    23850, 23900, 23950, 24000, 24050, 24100
  ]);
  assert.equal(placements.at(-1).find((row) => row.strike === 23800).isAtm, true);
});

test("LTP refresh recenters on true contract midpoint, not wide display interval midpoint", async () => {
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
  assert.equal(controller.membership().interval, 400);
  assert.equal(controller.membership().atmStep, 50);

  spot = 23774.99;
  await controller.refreshLtp();
  assert.equal(controller.membership().atm, 23750);

  spot = 23775;
  await controller.refreshLtp();
  assert.equal(controller.membership().atm, 23800);
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

test("ATM recenter always retries from timeframe preference instead of ratcheting to a smaller fallback", async () => {
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
  assert.equal(controller.membership().nativeInterval, 350);
  assert.equal(controller.membership().preferredInterval, 500);
  assert.equal(controller.membership().interval, 400);
  await controller.refreshLtp();
  assert.equal(controller.membership().interval, 100);
  await controller.refreshLtp();
  assert.equal(controller.membership().interval, 350, "recovered chain must choose widest complete exact range from timeframe preference");
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
  assert.equal(statuses.at(-1), "RECENTER PENDING");
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

test("row layout selects the minimum deterministic lane count without changing exact y", () => {
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
  assert.equal(dense.mode, "double");
  assert.equal(dense.laneCount, 2);
  assert.deepEqual(dense.lanes, [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0]);

  const inverted = api.rowLaneLayout(Array.from({ length: 13 }, (_, index) => ({
    strike: 23450 + index * 50,
    y: 268.375 - index * 14
  })), 23750, 50);
  assert.deepEqual(inverted, dense);
});

test("3M and 6M density expands deterministically through thirteen lanes", () => {
  const compressed = Array.from({ length: 13 }, (_, index) => ({
    strike: 23450 + index * 50,
    y: 200.25 + index * 5
  }));
  const fiveLane = api.rowLaneLayout(compressed, 23750, 50);
  assert.deepEqual(fiveLane, {
    mode: "multi",
    laneCount: 5,
    lanes: [1, 0, 2, 3, 4, 1, 0, 2, 3, 4, 1, 0, 2]
  });
  assert.equal(fiveLane.lanes[6], 0, "ATM remains in the right-axis lane");

  const reversedRows = compressed.slice().reverse();
  const reversed = api.rowLaneLayout(reversedRows, 23750, 50);
  const byStrike = new Map(compressed.map((row, index) => [row.strike, fiveLane.lanes[index]]));
  reversedRows.forEach((row, index) => {
    assert.equal(reversed.lanes[index], byStrike.get(row.strike));
  });

  for (let expected = 1; expected <= 13; expected += 1) {
    const gap = expected === 1
      ? 22
      : (22 / expected + 22 / (expected - 1)) / 2;
    const rows = compressed.map((row, index) => ({ ...row, y: 300.5 + index * gap }));
    assert.equal(api.rowLaneLayout(rows, 23750, 50).laneCount, expected);
  }

  const coincident = compressed.map((row) => ({ ...row, y: 300.5 }));
  assert.deepEqual(api.rowLaneLayout(coincident, 23750, 50), {
    mode: "multi",
    laneCount: 13,
    lanes: [6, 1, 2, 3, 4, 5, 0, 7, 8, 9, 10, 11, 12]
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

test("chart ladder uses popup design tokens with compact centered labels", () => {
  const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");
  assert.match(css, /--ladder-surface:\s*#111315/);
  assert.match(css, /--ladder-line:\s*#2c3238/);
  assert.match(css, /--ladder-ink:\s*#f4f4f5/);
  assert.match(css, /--ladder-accent:\s*#34d399/);
  assert.match(css, /--ladder-accent-dark:\s*#063d2d/);
  assert.match(css, /\.nifty-axis-ladder__row\s*\{[\s\S]*?width:\s*max-content/);
  assert.match(css, /\.nifty-axis-ladder__row\s*\{[\s\S]*?text-align:\s*center/);
  assert.doesNotMatch(css, /#ff9f0a|rgba\(66,\s*71,\s*82/);
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

test("trusted scale fit waits for a fresh observer frame before retrying placement", () => {
  const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  const request = source.match(/function requestScaleFit[\s\S]*?\n  \}/)?.[0] || "";
  assert.match(request, /observationBeforeFit = axisObservationAt\(\)/);
  assert.match(request, /await waitForFreshAxisObservation\(observationBeforeFit\);[\s\S]*?scaleFitInFlight = false;[\s\S]*?await controller\?\.place\(\)/);
});

test("new timeframe resets exhausted scale-fit budget before attempt guard", () => {
  const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  const request = source.match(/function requestScaleFit[\s\S]*?\n  \}/)?.[0] || "";
  assert.ok(
    request.indexOf("scaleFitTimeframe !== timeframe") < request.indexOf("scaleFitAttempts >= 6"),
    "timeframe reset must happen before exhausted-attempt guard"
  );
});

test("trusted scale fit includes active timeframe for calibrated drag strength", () => {
  const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  const body = source.match(/function requestScaleFit\([\s\S]*?\n  \}/)?.[0] || "";
  const request = body.match(/chrome\.runtime\.sendMessage\(\{([\s\S]*?)\}\)\.then/)?.[1] || "";
  assert.match(request, /timeframe/);
});

test("breakeven module loads before content and selection remains explicit", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "manifest.json"), "utf8"));
  const scripts = manifest.content_scripts.find((entry) => entry.js.includes("content.js")).js;
  assert.ok(scripts.indexOf("breakeven-rails.js") < scripts.indexOf("content.js"));

  const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  assert.match(source, /NiftyBreakEvenRails/);
  assert.match(source, /role", "button"/);
  assert.match(source, /aria-selected/);
  assert.match(source, /clearBreakEvenSelection/);
  assert.doesNotMatch(source, /autoSelectBreakEven|persistedBreakEven/);
});

test("rows alone accept input while fullscreen overlay remains pointer-transparent", () => {
  const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");
  assert.match(css, /#nifty-axis-ladder\s*\{[\s\S]*?pointer-events:\s*none/);
  assert.match(css, /\.nifty-axis-ladder__row\s*\{[\s\S]*?pointer-events:\s*auto/);
});
