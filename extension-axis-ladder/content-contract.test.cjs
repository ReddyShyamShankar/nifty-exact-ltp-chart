"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const api = require("./content.js");

function chain(spot, delta = 0) {
  return {
    spot,
    rows: Array.from({ length: 13 }, (_, index) => {
      const strike = 23200 + index * 100;
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

test("formats each visible row as Call, Put, then rightmost strike", () => {
  assert.equal(api.formatRow({ strike: 26000, call: 266.6, put: 388.7 }), "C 266.60 | P 388.70 | 26,000");
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
    23200, 23300, 23400, 23500, 23600, 23700, 23800,
    23900, 24000, 24100, 24200, 24300, 24400
  ]);
  assert.equal(membership.atm, 23800);
  assert.equal(membership.interval, 100);
  assert.equal(membership.rows.length, 13);
  assert.equal(Object.isFrozen(membership), true);
  assert.equal(Object.isFrozen(membership.strikes), true);

  await controller.place();
  const atm = placements.at(-1).find((row) => row.strike === 23800);
  assert.deepEqual(atm, {
    strike: 23800,
    call: 106,
    put: 206,
    text: "C 106.00 | P 206.00 | 23,800",
    isAtm: true,
    y: 140
  });
});

test("LTP refresh and zoom placement keep frozen membership while updating only matching values", async () => {
  const placements = [];
  let fetches = 0;
  let captures = 0;
  const controller = api.createLadderController({
    expiry: "current_month",
    fetchChain: async () => chain(fetches++ === 0 ? 23767.45 : 25049.95, fetches),
    captureAxisScale: async () => { captures += 1; return scale(); },
    renderRows: () => {},
    placeRows: (rows) => placements.push(rows)
  });

  await controller.syncTimeframe("Chart for NSE_DLY:NIFTY, 1 hour");
  const before = controller.membership();
  await controller.refreshLtp();
  assert.equal(captures, 2, "refresh places the frozen rows against a fresh axis capture");
  await controller.place();
  const after = controller.membership();

  assert.deepEqual(after.strikes, before.strikes);
  assert.equal(after.interval, before.interval);
  assert.equal(after.atm, before.atm);
  assert.equal(after.timeframe, before.timeframe);
  assert.equal(after.rows.find((row) => row.strike === 23800).call, 108);
  assert.equal(placements.at(-1).find((row) => row.strike === 23800).y, 140);
  assert.equal(captures, 3, "initial rebuild, refresh placement, and explicit zoom placement each capture scale without rebuilding membership");
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
  assert.equal(fetches, 2);
  assert.equal(controller.membership().timeframe, "1D");
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
    captureAxisScale: async () => (++captures === 1 ? scale() : rebuildCapture),
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
  assert.equal(controller.membership().rows.find((row) => row.strike === 23800).call, 126);
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
    captureAxisScale: async () => (++captures === 1 ? scale() : pendingScale),
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

test("browser lifecycle disconnects observers and binds placement listeners only once", () => {
  const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  const listeners = [];
  const observers = [];
  const storageListeners = [];
  const nodes = new Map();
  const makeNode = () => ({
    dataset: {},
    hidden: false,
    style: { setProperty() {} },
    classList: { toggle() {} },
    append(child) { if (child.id) nodes.set(child.id, child); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    remove() { if (this.id) nodes.delete(this.id); }
  });
  const root = makeNode();
  const sandbox = {
    NiftyTimeframeLadder: require("./timeframe-ladder.js"),
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
      querySelector() { return null; }
    },
    window: { innerWidth: 100, innerHeight: 100, addEventListener(type) { listeners.push(type); } },
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

  assert.deepEqual(listeners, ["resize", "wheel", "pointerup"]);
  assert.equal(observers.length, 2);
  assert.equal(observers[0].disconnects, 1);
});

test("new content has no collision spreading or Pine input synchronization path", () => {
  const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");
  assert.doesNotMatch(source, /spreadAroundAnchor|SYNC_PINE_INPUTS|TRUSTED_REPLACE_FIELD/);
  assert.doesNotMatch(css, /has-leader|leader-down|leader-up|nifty-leader-height/);
});
