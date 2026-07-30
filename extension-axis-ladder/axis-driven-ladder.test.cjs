const test = require("node:test");
const assert = require("node:assert/strict");
const api = require("./content.js");

function denseChain(spot = 24276.65) {
  return {
    spot,
    rows: Array.from({ length: 81 }, (_, index) => ({
      strike: 22000 + index * 50,
      call: index,
      put: index + 100
    }))
  };
}

function scale(prices) {
  return {
    ok: true,
    observedAt: 100,
    observationSignature: prices.join(":"),
    gridGapPx: 100,
    axisPairs: prices.map((price, index) => ({ price, y: 500 - index * 100 }))
  };
}

test("zoom rebuilds axis-aligned membership from cached chain without network", async () => {
  let fetches = 0;
  let currentScale = scale([24000, 24100, 24200, 24300, 24400]);
  const renders = [];
  const placements = [];
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => { fetches += 1; return denseChain(); },
    captureAxisScale: async () => currentScale,
    renderRows: (rows) => renders.push(rows.map((row) => row.strike)),
    placeRows: (_rows, membership) => { placements.push(membership); return true; }
  });

  assert.equal(await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour"), true);
  assert.deepEqual(controller.membership().visibleStrikes, [24000, 24100, 24200, 24300, 24400]);

  currentScale = scale([23400, 23700, 24000, 24300, 24600]);
  assert.equal(await controller.place(), true);

  assert.equal(fetches, 1);
  assert.deepEqual(placements.at(-1).visibleStrikes, [23400, 23700, 24000, 24300, 24600]);
  assert.equal(placements.at(-1).nativeInterval, 300);
  assert.deepEqual(controller.membership().visibleStrikes, [23400, 23700, 24000, 24300, 24600]);
  assert.deepEqual(renders.at(-1), [23400, 23700, 24000, 24300, 24600]);
  assert.equal(renders.length, 2, "zoom rebuilds visible DOM from cached full chain");
});

test("controller pins real ATM row inside visible range for theme-specific highlight", async () => {
  const renders = [];
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => denseChain(),
    captureAxisScale: async () => scale([23600, 23800, 24000, 24200, 24400, 24600]),
    renderRows: (rows) => renders.push(rows.map((row) => row.strike)),
    placeRows: () => true
  });

  assert.equal(await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 4 hours"), true);
  assert.equal(controller.membership().atm, 24300);
  assert.deepEqual(controller.membership().strikes, [23600, 23800, 24000, 24200, 24300, 24400, 24600]);
  assert.deepEqual(renders.at(-1), [23600, 23800, 24000, 24200, 24300, 24400, 24600]);
});

test("single-column layout never requires visible strikes to align around ATM", () => {
  const rows = [24200, 24000, 23800].map((strike, index) => ({ strike, y: 100 + index * 80 }));

  assert.deepEqual(api.rowLaneLayout(rows, 24300, 40), {
    mode: "single",
    laneCount: 1,
    lanes: [0, 0, 0]
  });
});

test("dense rows remain in one column instead of spreading into lanes", () => {
  const rows = Array.from({ length: 13 }, (_, index) => ({
    strike: 24000 + index * 50,
    y: 100 + index * 5
  }));

  assert.deepEqual(api.rowLaneLayout(rows, 24300, 50), {
    mode: "single",
    laneCount: 1,
    lanes: Array(13).fill(0)
  });
});

test("single-column layout has no artificial thirteen-row limit", () => {
  const rows = Array.from({ length: 25 }, (_, index) => ({
    strike: 100 + index * 10,
    y: 100 + index * 20
  }));

  assert.deepEqual(api.rowLaneLayout(rows, 220, 10), {
    mode: "single",
    laneCount: 1,
    lanes: Array(25).fill(0)
  });
});
