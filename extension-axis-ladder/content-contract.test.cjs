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

test("renders only genuine finite quotes and never coerces missing values to zero", () => {
  for (const invalid of [null, undefined, "", "   ", true, false, Infinity, -Infinity, NaN, "Infinity"]) {
    assert.equal(api.formatRow({ strike: 26000, call: invalid, put: invalid }), "C — | P — | 26,000");
  }
  assert.equal(api.formatRow({ strike: 26000, call: "12.5", put: 0 }), "C 12.50 | P 0.00 | 26,000");
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

test("LTP refresh reuses cached exact positions while zoom placement captures a fresh scale", async () => {
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
  assert.equal(after.rows.find((row) => row.strike === 23800).call, 108);
  assert.equal(placements.at(-1).find((row) => row.strike === 23800).y, 140);
  assert.equal(captures, 3, "refresh uses cached coordinates; explicit zoom placement captures once");
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
    23200, 23300, 23400, 23500, 23600, 23700, 23800,
    23900, 24000, 24100, 24200, 24300, 24400
  ]);
  assert.deepEqual(controller.membership().rows.find((row) => row.strike === 23800), { strike: 23800, call: null, put: null });
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

test("expiry change invalidates an initial response and rebuilds the latest desired timeframe", async () => {
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
  assert.equal(await replacement, true);
  assert.deepEqual(requestedExpiries, ["current_month", "next_month"]);
  assert.equal(controller.membership().timeframe, "1h");
  assert.equal(controller.membership().expiry, "next_month");
  assert.equal(controller.membership().rows.find((row) => row.strike === 23800).call, 126);
});

test("failed calibration retries the bounded rebuild schedule and commits only after two matching intervals", async () => {
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

  assert.equal(controller.membership().interval, 150);
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

test("browser lifecycle disconnects observers and binds placement listeners only once", () => {
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

  assert.deepEqual(listeners, ["resize", "wheel", "pointerup", "resize", "wheel", "pointerup"]);
  assert.deepEqual(removedListeners, ["resize", "wheel", "pointerup"]);
  assert.equal(observers.length, 2);
  assert.equal(observers[0].disconnects, 1);
});

test("new content has no collision spreading or Pine input synchronization path", () => {
  const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");
  assert.doesNotMatch(source, /spreadAroundAnchor|SYNC_PINE_INPUTS|TRUSTED_REPLACE_FIELD/);
  assert.doesNotMatch(css, /has-leader|leader-down|leader-up|nifty-leader-height/);
});
