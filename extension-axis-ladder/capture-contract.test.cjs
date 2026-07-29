"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const manualPlan = require("./manual-plan.js");

function loadBackground({ manualPlans = manualPlan.emptyStore() } = {}) {
  const listeners = {};
  const sidePanelCalls = [];
  const session = {};
  const local = { [manualPlan.STORAGE_KEY]: manualPlans };
  const manualWrites = [];
  global.chrome = {
    runtime: {
      onMessage: { addListener(listener) { listeners.message = listener; } },
      onInstalled: { addListener(listener) { listeners.installed = listener; } },
      onStartup: { addListener(listener) { listeners.startup = listener; } }
    },
    tabs: {
      onCreated: { addListener(listener) { listeners.created = listener; } },
      onUpdated: { addListener(listener) { listeners.updated = listener; } },
      onActivated: { addListener(listener) { listeners.activated = listener; } },
      async query() { return []; },
      async get() { return undefined; }
    },
    sidePanel: {
      async setPanelBehavior(value) { sidePanelCalls.push(["behavior", value]); },
      async setOptions(value) { sidePanelCalls.push(["options", value]); },
      async close(value) { sidePanelCalls.push(["close", value]); }
    },
    action: {
      async enable() {},
      async disable() {}
    },
    storage: {
      session: {
        async get(key) { return { [key]: session[key] }; },
        async set(values) { Object.assign(session, values); }
      },
      local: {
        async get(key) {
          if (typeof key === "string") return { [key]: local[key] };
          return { ...key, ...local };
        },
        async set(values) {
          Object.assign(local, values);
          if (Object.hasOwn(values, manualPlan.STORAGE_KEY)) manualWrites.push(values[manualPlan.STORAGE_KEY]);
        }
      }
    },
    debugger: {
      async attach() {},
      async detach() {},
      async sendCommand() {}
    }
  };
  global.importScripts = (...files) => {
    for (const file of files) {
      if (file === "overlay-utils.js") global.NiftyOverlay = require("./overlay-utils.js");
      if (file === "side-panel.js") global.NiftySidePanel = require("./side-panel.js");
      if (file === "manual-plan.js") global.NiftyManualPlan = manualPlan;
    }
  };
  const filename = path.join(__dirname, "background.js");
  delete require.cache[filename];
  return { api: require(filename), listeners, sidePanelCalls, local, manualWrites };
}

test("exports native-axis capture and single-writer manual mutation API", () => {
  const { api } = loadBackground();
  assert.deepEqual(Object.keys(api).sort(), [
    "applyManualPlanMutation", "axisPairsFromCandidates", "captureAxisScale", "dispatchScaleDrag",
    "enqueueManualPlanMutation", "extractAxisPrices", "fitAxisScale", "isCaptureMessage",
    "isFitMessage", "isManualPlanMutationMessage", "isolateAxisCandidates"
  ]);
  assert.equal(api.isCaptureMessage("CAPTURE_AXIS_SCALE"), true);
  assert.equal(api.isCaptureMessage("CAPTURE_PINE_ANCHORS"), false);
  assert.equal(api.isFitMessage("FIT_AXIS_SCALE"), true);
  assert.equal(api.isManualPlanMutationMessage("MUTATE_MANUAL_PLANS"), true);
});

function manualEntry(overrides = {}) {
  return {
    id: "entry-a",
    underlying: "NIFTY",
    expiry: "2026-08-25",
    strike: 23750,
    optionType: "CALL",
    direction: "SELL",
    lots: 1,
    premium: 119,
    callSnapshot: 119,
    putSnapshot: null,
    createdAt: "2026-07-29T10:00:00.000Z",
    updatedAt: "2026-07-29T10:00:00.000Z",
    ...overrides
  };
}

function sendManualMutation(listeners, tabId, mutation) {
  return new Promise((resolve) => {
    const handled = listeners.message(
      { type: "MUTATE_MANUAL_PLANS", mutation },
      { tab: { id: tabId }, url: `https://www.tradingview.com/chart/tab-${tabId}/` },
      resolve
    );
    assert.equal(handled, true);
  });
}

test("background queue preserves concurrent adds from two TradingView contexts", async () => {
  const h = loadBackground();
  const first = sendManualMutation(h.listeners, 1, { type: "upsert", entry: manualEntry() });
  const second = sendManualMutation(h.listeners, 2, {
    type: "upsert",
    entry: manualEntry({ id: "entry-b", strike: 23800, callSnapshot: 120 })
  });

  const responses = await Promise.all([first, second]);

  assert.equal(responses.every((response) => response.ok), true);
  assert.deepEqual(manualPlan.entriesFor(h.local.manualPlans, "2026-08-25")
    .map(({ id, strike }) => ({ id, strike })), [
    { id: "entry-a", strike: 23750 },
    { id: "entry-b", strike: 23800 }
  ]);
  assert.equal(h.manualWrites.length, 2);
});

test("background queue preserves concurrent save and add from two TradingView contexts", async () => {
  const initial = manualPlan.upsertEntry(manualPlan.emptyStore(), manualEntry());
  const h = loadBackground({ manualPlans: initial });
  const save = sendManualMutation(h.listeners, 1, {
    type: "upsert",
    entry: manualEntry({ lots: 3, updatedAt: "2026-07-29T10:05:00.000Z" })
  });
  const add = sendManualMutation(h.listeners, 2, {
    type: "upsert",
    entry: manualEntry({ id: "entry-b", strike: 23800, callSnapshot: 120 })
  });

  await Promise.all([save, add]);

  assert.deepEqual(manualPlan.entriesFor(h.local.manualPlans, "2026-08-25")
    .map(({ id, lots }) => ({ id, lots })), [
    { id: "entry-a", lots: 3 },
    { id: "entry-b", lots: 1 }
  ]);
});

test("background queue preserves concurrent remove and add without deleting quarantine", async () => {
  const raw = { ...manualEntry(), id: "recover", action: "HOLD", direction: "HOLD" };
  let initial = manualPlan.normalizeStore({
    version: 1,
    plans: { "2026-08-25": { entries: [manualEntry(), raw] } }
  });
  const h = loadBackground({ manualPlans: initial });
  const remove = sendManualMutation(h.listeners, 1, {
    type: "remove",
    expiry: "2026-08-25",
    entryId: "entry-a"
  });
  const add = sendManualMutation(h.listeners, 2, {
    type: "upsert",
    entry: manualEntry({ id: "entry-b", strike: 23800, callSnapshot: 120 })
  });

  await Promise.all([remove, add]);
  initial = h.local.manualPlans;

  assert.deepEqual(manualPlan.entriesFor(initial, "2026-08-25").map((entry) => entry.id), ["entry-b"]);
  assert.equal(manualPlan.invalidCount(initial), 1);
  assert.deepEqual(manualPlan.invalidEntries(initial)[0].raw, raw);
});

test("background installs tab-specific side panel without changing capture API", async () => {
  const { api, listeners, sidePanelCalls } = loadBackground();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(typeof listeners.installed, "function");
  assert.equal(typeof listeners.startup, "function");
  assert.equal(typeof listeners.created, "function");
  assert.equal(typeof listeners.updated, "function");
  assert.equal(typeof listeners.activated, "function");
  assert.deepEqual(sidePanelCalls[0], ["behavior", { openPanelOnActionClick: true }]);
  assert.equal(typeof api.captureAxisScale, "function");
  assert.equal(typeof api.fitAxisScale, "function");
});

test("first trusted scale fit resets TradingView price scale and detaches", async () => {
  const { api } = loadBackground();
  const calls = [];
  global.chrome.debugger.attach = async (...args) => calls.push(["attach", ...args]);
  global.chrome.debugger.sendCommand = async (...args) => calls.push(["command", ...args]);
  global.chrome.debugger.detach = async (...args) => calls.push(["detach", ...args]);

  assert.deepEqual(await api.fitAxisScale({ tab: { id: 7 } }, {
    plotRect: { left: 50, top: 40, right: 1000, bottom: 740 },
    viewportWidth: 1120,
    viewportHeight: 800,
    attempt: 1,
    direction: "out"
  }), { ok: true });
  assert.deepEqual(calls[0], ["attach", { tabId: 7 }, "1.3"]);
  const commands = calls.filter(([kind]) => kind === "command");
  assert.equal(commands.length, 5);
  assert.deepEqual(commands.slice(1).map(([, , , params]) => [params.type, params.clickCount]), [
    ["mousePressed", 1], ["mouseReleased", 1], ["mousePressed", 2], ["mouseReleased", 2]
  ]);
  assert.equal(commands[1][3].x, 1018);
  assert.deepEqual(calls.at(-1), ["detach", { tabId: 7 }]);
});

test("later trusted scale fit uses a gentle bounded drag", async () => {
  const { api } = loadBackground();
  const calls = [];
  global.chrome.debugger.attach = async (...args) => calls.push(["attach", ...args]);
  global.chrome.debugger.sendCommand = async (...args) => calls.push(["command", ...args]);
  global.chrome.debugger.detach = async (...args) => calls.push(["detach", ...args]);

  assert.deepEqual(await api.fitAxisScale({ tab: { id: 7 } }, {
    plotRect: { left: 50, top: 40, right: 1000, bottom: 740 },
    viewportWidth: 1120,
    viewportHeight: 800,
    attempt: 2,
    direction: "out"
  }), { ok: true });
  const pressed = calls.find(([, , method, params]) => method === "Input.dispatchMouseEvent" && params.type === "mousePressed");
  const released = calls.find(([, , method, params]) => method === "Input.dispatchMouseEvent" && params.type === "mouseReleased");
  assert.equal(pressed[3].x, 1018);
  assert.equal(released[3].y - pressed[3].y, 48);
  assert.deepEqual(calls.at(-1), ["detach", { tabId: 7 }]);
});

test("1-minute scale fit uses a stronger bounded drag", async () => {
  const { api } = loadBackground();
  const calls = [];
  global.chrome.debugger.attach = async (...args) => calls.push(["attach", ...args]);
  global.chrome.debugger.sendCommand = async (...args) => calls.push(["command", ...args]);
  global.chrome.debugger.detach = async (...args) => calls.push(["detach", ...args]);

  assert.deepEqual(await api.fitAxisScale({ tab: { id: 7 } }, {
    plotRect: { left: 50, top: 40, right: 1000, bottom: 740 },
    viewportWidth: 1120,
    viewportHeight: 800,
    attempt: 2,
    direction: "out",
    timeframe: "1m"
  }), { ok: true });
  const pressed = calls.find(([, , method, params]) => method === "Input.dispatchMouseEvent" && params.type === "mousePressed");
  const released = calls.find(([, , method, params]) => method === "Input.dispatchMouseEvent" && params.type === "mouseReleased");
  assert.equal(released[3].y - pressed[3].y, 96);
});

test("native-axis extractor accepts only plain comma-formatted axis labels", () => {
  const { api } = loadBackground();
  const nodes = [
    { name: { value: "24,000.00" } },
    { name: { value: "23,800" } },
    { name: { value: "O 23,771.45 H 23,792.95" } },
    { name: { value: "-0.43%" } },
    { name: { value: "C 371.65 | P 298.45 | 23,800" } },
    { name: { value: "23,800" } }
  ];
  assert.deepEqual(api.extractAxisPrices(nodes), [24000, 23800]);
});

test("observed native ticks form a direct linear axis and ignore unrelated labels", () => {
  const { api } = loadBackground();
  assert.deepEqual(api.axisPairsFromCandidates([
    { price: 24100, y: 100 },
    { price: 24000, y: 140 },
    { price: 23900, y: 180 },
    { price: 23800, y: 220 },
    { price: 23787, y: 199 },
    { price: 46.18, y: 700 }
  ]), [
    { price: 24100, y: 100 },
    { price: 24000, y: 140 },
    { price: 23900, y: 180 },
    { price: 23800, y: 220 }
  ]);
});

test("observed native ticks also form a direct linear axis when TradingView scale is inverted", () => {
  const { api } = loadBackground();
  assert.deepEqual(api.axisPairsFromCandidates([
    { price: 23800, y: 100 },
    { price: 23900, y: 140 },
    { price: 24000, y: 180 },
    { price: 24100, y: 220 },
    { price: 23787, y: 199 },
    { price: 46.18, y: 700 }
  ]), [
    { price: 23800, y: 100 },
    { price: 23900, y: 140 },
    { price: 24000, y: 180 },
    { price: 24100, y: 220 }
  ]);
});

test("axis capture returns native coordinates without screenshot or debugger", async () => {
  const { api } = loadBackground();
  const canvasRect = { left: 0, top: 0, right: 1000, bottom: 600 };
  const result = await api.captureAxisScale({}, {
    plotRect: { left: 0, top: 0, right: 880, bottom: 600 },
    axisCandidates: [
      { price: 24200, x: 900, y: 80, canvasRect },
      { price: 24100, x: 900, y: 120, canvasRect },
      { price: 24000, x: 900, y: 160, canvasRect },
      { price: 23900, x: 900, y: 200, canvasRect }
    ]
  });
  assert.deepEqual(result, {
    ok: true,
    lower: null,
    upper: null,
    gridRows: [80, 120, 160, 200],
    gridGapPx: 40,
    axisPrices: [24200, 24100, 24000, 23900],
    axisPairs: [
      { price: 24200, y: 80 },
      { price: 24100, y: 120 },
      { price: 24000, y: 160 },
      { price: 23900, y: 200 }
    ]
  });
});

test("capture isolates main plot from a denser indicator pane", async () => {
  const { api } = loadBackground();
  const main = { left: 0, top: 0, right: 1000, bottom: 600 };
  const indicator = { left: 0, top: 600, right: 1000, bottom: 800 };
  const result = await api.captureAxisScale({}, {
    plotRect: { left: 0, top: 0, right: 880, bottom: 600 },
    axisCandidates: [
      { price: 24200, x: 900, y: 80, canvasRect: main },
      { price: 24100, x: 900, y: 120, canvasRect: main },
      { price: 24000, x: 900, y: 160, canvasRect: main },
      ...Array.from({ length: 8 }, (_, index) => ({
        price: 80 - index * 10,
        x: 900,
        y: 620 + index * 20,
        canvasRect: indicator
      }))
    ]
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.axisPrices, [24200, 24100, 24000]);
});

test("capture chooses nearest right-axis x cluster and ignores farther scale", async () => {
  const { api } = loadBackground();
  const canvasRect = { left: 0, top: 0, right: 1100, bottom: 600 };
  const result = await api.captureAxisScale({}, {
    plotRect: { left: 0, top: 0, right: 880, bottom: 600 },
    axisCandidates: [
      { price: 24200, x: 900, y: 80, canvasRect },
      { price: 24100, x: 900, y: 120, canvasRect },
      { price: 24000, x: 900, y: 160, canvasRect },
      { price: 5000, x: 1020, y: 60, canvasRect },
      { price: 4000, x: 1020, y: 120, canvasRect },
      { price: 3000, x: 1020, y: 180, canvasRect },
      { price: 2000, x: 1020, y: 240, canvasRect }
    ]
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.axisPrices, [24200, 24100, 24000]);
});

test("capture skips a nearer singleton price marker and uses the first complete axis cluster", async () => {
  const { api } = loadBackground();
  const canvasRect = { left: 0, top: 0, right: 1000, bottom: 600 };
  const result = await api.captureAxisScale({}, {
    plotRect: { left: 0, top: 0, right: 880, bottom: 600 },
    axisCandidates: [
      { price: 23787, x: 882, y: 199, canvasRect },
      { price: 24200, x: 900, y: 80, canvasRect },
      { price: 24100, x: 900, y: 120, canvasRect },
      { price: 24000, x: 900, y: 160, canvasRect },
      { price: 23900, x: 900, y: 200, canvasRect }
    ]
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.axisPrices, [24200, 24100, 24000, 23900]);
});

test("capture isolates an inverted main axis from unrelated scales", async () => {
  const { api } = loadBackground();
  const canvasRect = { left: 0, top: 0, right: 1000, bottom: 600 };
  const result = await api.captureAxisScale({}, {
    plotRect: { left: 0, top: 0, right: 880, bottom: 600 },
    axisCandidates: [
      { price: 24000, x: 900, y: 80, canvasRect },
      { price: 24100, x: 900, y: 120, canvasRect },
      { price: 24200, x: 900, y: 160, canvasRect },
      { price: 50, x: 1020, y: 80, canvasRect },
      { price: 40, x: 1020, y: 120, canvasRect },
      { price: 30, x: 1020, y: 160, canvasRect },
      { price: 20, x: 1020, y: 200, canvasRect }
    ]
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.axisPrices, [24000, 24100, 24200]);
});

test("capture fails closed when candidate geometry is missing", async () => {
  const { api } = loadBackground();
  assert.deepEqual(await api.captureAxisScale({}, {
    plotRect: { left: 0, top: 0, right: 880, bottom: 600 },
    axisCandidates: [
      { price: 24200, y: 80 },
      { price: 24100, y: 120 },
      { price: 24000, y: 160 }
    ]
  }), { ok: false, error: "Native axis ticks are still loading." });
});

test("capture rejects candidates outside their reported canvas bounds", async () => {
  const { api } = loadBackground();
  const canvasRect = { left: 0, top: 0, right: 1000, bottom: 600 };
  assert.deepEqual(await api.captureAxisScale({}, {
    plotRect: { left: 0, top: 0, right: 880, bottom: 600 },
    axisCandidates: [
      { price: 24200, x: 1200, y: 80, canvasRect },
      { price: 24100, x: 1200, y: 120, canvasRect },
      { price: 24000, x: 1200, y: 160, canvasRect }
    ]
  }), { ok: false, error: "Native axis ticks are still loading." });
});

test("capture keeps a sparse native line when moving markers conflict with its coordinates", async () => {
  const { api } = loadBackground();
  const canvasRect = { left: 0, top: 0, right: 1000, bottom: 600 };
  const base = {
    plotRect: { left: 0, top: 0, right: 880, bottom: 600 },
    axisCandidates: [
      { price: 24200, x: 900, y: 80, canvasRect },
      { price: 24100, x: 900, y: 120, canvasRect },
      { price: 24000, x: 900, y: 160, canvasRect }
    ]
  };
  const duplicatePrice = await api.captureAxisScale({}, {
    ...base,
    axisCandidates: [...base.axisCandidates, { price: 24200, x: 900, y: 200, canvasRect }]
  });
  assert.equal(duplicatePrice.ok, true);
  assert.deepEqual(duplicatePrice.axisPrices, [24200, 24100, 24000]);
  const duplicatePixel = await api.captureAxisScale({}, {
    ...base,
    axisCandidates: [...base.axisCandidates, { price: 23900, x: 900, y: 120, canvasRect }]
  });
  assert.equal(duplicatePixel.ok, true);
  assert.deepEqual(duplicatePixel.axisPrices, [24200, 24100, 24000]);
});

test("capture skips a nearer invalid marker cluster and uses a later valid native axis", async () => {
  const { api } = loadBackground();
  const canvasRect = { left: 0, top: 0, right: 1000, bottom: 600 };
  const result = await api.captureAxisScale({}, {
    plotRect: { left: 0, top: 0, right: 880, bottom: 600 },
    axisCandidates: [
      { price: 23787, x: 882, y: 90, canvasRect },
      { price: 24446.35, x: 882, y: 170, canvasRect },
      { price: 22991, x: 882, y: 260, canvasRect },
      { price: 24200, x: 900, y: 80, canvasRect },
      { price: 24100, x: 900, y: 120, canvasRect },
      { price: 24000, x: 900, y: 160, canvasRect },
      { price: 23900, x: 900, y: 200, canvasRect }
    ]
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.axisPrices, [24200, 24100, 24000, 23900]);
});

test("capture keeps dominant native grid when TradingView markers share axis canvas", async () => {
  const { api } = loadBackground();
  const canvasRect = { left: 1605, top: 42, right: 1679, bottom: 715 };
  const nativeTicks = Array.from({ length: 18 }, (_, index) => ({
    price: 24700 - index * 100,
    x: 1640,
    y: 45.53 + index * 37.72,
    canvasRect
  }));
  const result = await api.captureAxisScale({}, {
    plotRect: { left: 50, top: 42, right: 1605, bottom: 715 },
    axisCandidates: [
      ...nativeTicks,
      { price: 24446.35, x: 1640, y: 141, canvasRect },
      { price: 24100, x: 1640, y: 256, canvasRect },
      { price: 23787, x: 1640, y: 390, canvasRect },
      { price: 23744.4, x: 1640, y: 406, canvasRect },
      { price: 22991, x: 1640, y: 697.5, canvasRect }
    ]
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.axisPrices, nativeTicks.map((tick) => tick.price));
  assert.equal(result.gridGapPx, 38);
});

test("axis capture fails closed while native ticks are loading", async () => {
  const { api } = loadBackground();
  assert.deepEqual(await api.captureAxisScale({}, { axisCandidates: [] }), {
    ok: false,
    error: "Native axis ticks are still loading."
  });
});

test("message listener rejects non-TradingView callers", () => {
  const { listeners } = loadBackground();
  let response;
  const asyncResult = listeners.message(
    { type: "CAPTURE_AXIS_SCALE", axisCandidates: [] },
    { tab: { id: 7 }, url: "https://example.com/" },
    (value) => { response = value; }
  );
  assert.equal(asyncResult, undefined);
  assert.deepEqual(response, { ok: false, error: "Axis capture is limited to TradingView tabs." });
});
