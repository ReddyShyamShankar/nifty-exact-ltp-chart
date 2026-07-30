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
  assert.deepEqual(placements.at(-1).visibleStrikes, [24000, 24300, 24600]);
  assert.equal(placements.at(-1).nativeInterval, 300);
  assert.equal(renders.length, 1, "zoom remaps existing DOM rows without rebuilding editor state");
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
