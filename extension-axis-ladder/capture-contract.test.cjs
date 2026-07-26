"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function installChromeMock(options = {}) {
  const calls = [];
  const listeners = {};
  global.chrome = {
    debugger: {
      attach: async (target) => {
        calls.push(["attach", target.tabId]);
        return options.attach?.(target);
      },
      detach: async (target) => calls.push(["detach", target.tabId]),
      sendCommand: async (target, method, params) => {
        calls.push(["send", target.tabId, method, params]);
        return options.sendCommand?.(target, method, params) || {};
      },
      onDetach: { addListener(listener) { listeners.debuggerDetach = listener; } }
    },
    tabs: {
      onRemoved: { addListener(listener) { listeners.tabRemoved = listener; } },
      captureVisibleTab: async () => { throw new Error("not used in unit tests"); }
    },
    runtime: { onMessage: { addListener(listener) { listeners.message = listener; } } }
  };
  global.importScripts = () => { global.NiftyOverlay = require("./overlay-utils.js"); };
  return { calls, listeners };
}

function loadBackground(options) {
  const filename = path.join(__dirname, "background.js");
  delete require.cache[filename];
  const mock = installChromeMock(options);
  return { api: require(filename), ...mock };
}

test("exports native-axis capture API and supports both capture message names", () => {
  const { api } = loadBackground();
  assert.equal(typeof api.captureAxisScale, "function");
  assert.equal(typeof api.withTemporaryAxisDebugger, "function");
  assert.equal(typeof api.extractAxisPrices, "function");
  assert.equal(typeof api.matchAxisCandidatesToGridRows, "function");
  assert.equal(typeof api.cssGridCalibration, "function");
  assert.equal(typeof api.capturePineAnchors, "function");
  assert.equal(typeof api.isCaptureMessage, "function");
  assert.equal(api.isCaptureMessage("CAPTURE_AXIS_SCALE"), true);
  assert.equal(api.isCaptureMessage("CAPTURE_PINE_ANCHORS"), true);
});

test("native-axis extractor accepts only plain comma-formatted axis labels", () => {
  const { api } = loadBackground();
  const nodes = [
    { name: { value: "24,000.00" } },
    { name: { value: "23,800" } },
    { name: { value: "O 23,771.45 H 23,792.95" } },
    { name: { value: "-0.43%" } },
    { name: { value: "30 Jul 2026" } },
    { name: { value: "46.18M" } },
    { name: { value: "C 371.65 | P 298.45 | 23,800" } },
    { name: { value: "23,800" } }
  ];
  assert.deepEqual(api.extractAxisPrices(nodes), [24000, 23800]);
});

test("temporary axis debugger enables Accessibility then cleans up its own session", async () => {
  const { api, calls } = loadBackground();
  await api.withTemporaryAxisDebugger(77, async (sendCommand) => {
    await sendCommand("Accessibility.getFullAXTree");
  });
  assert.deepEqual(calls.map((call) => call.slice(0, 3)), [
    ["attach", 77],
    ["send", 77, "Accessibility.enable"],
    ["send", 77, "Accessibility.getFullAXTree"],
    ["send", 77, "Accessibility.disable"],
    ["detach", 77]
  ]);
});

test("chart screenshot uses debugger permission without an activeTab user gesture", async () => {
  const { api, calls } = loadBackground({
    sendCommand: (_target, method) => method === "Page.captureScreenshot" ? { data: "cG5n" } : {}
  });
  assert.equal(await api.captureTabPng(76), "data:image/png;base64,cG5n");
  assert.deepEqual(calls.map((call) => call.slice(0, 3)), [
    ["attach", 76],
    ["send", 76, "Page.captureScreenshot"],
    ["detach", 76]
  ]);
});

test("temporary axis debugger never detaches a pre-existing trusted debugger session", async () => {
  const { api, calls } = loadBackground();
  api.attachedTabs.add(78);
  await api.withTemporaryAxisDebugger(78, async () => {});
  assert.equal(calls.some(([kind]) => kind === "attach"), false);
  assert.equal(calls.some(([kind]) => kind === "detach"), false);
  assert.deepEqual(calls.map((call) => call.slice(0, 3)), [
    ["send", 78, "Accessibility.enable"],
    ["send", 78, "Accessibility.disable"]
  ]);
});

test("temporary axis debugger serializes concurrent captures under one debugger lease", async () => {
  const { api, calls } = loadBackground();
  let releaseFirst;
  let firstEntered;
  const firstEnteredPromise = new Promise((resolve) => { firstEntered = resolve; });
  const first = api.withTemporaryAxisDebugger(79, async () => {
    firstEntered();
    await new Promise((resolve) => { releaseFirst = resolve; });
  });
  await firstEnteredPromise;
  const second = api.withTemporaryAxisDebugger(79, async () => {});
  await Promise.resolve();
  assert.deepEqual(calls.map((call) => call.slice(0, 3)), [
    ["attach", 79],
    ["send", 79, "Accessibility.enable"]
  ]);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(calls.map((call) => call.slice(0, 3)), [
    ["attach", 79],
    ["send", 79, "Accessibility.enable"],
    ["send", 79, "Accessibility.disable"],
    ["send", 79, "Accessibility.enable"],
    ["send", 79, "Accessibility.disable"],
    ["detach", 79]
  ]);
});

test("capture cleanup cannot detach a trusted debugger session started during capture", async () => {
  const { api, calls } = loadBackground();
  let releaseCapture;
  let captureEntered;
  const entered = new Promise((resolve) => { captureEntered = resolve; });
  const capture = api.withTemporaryAxisDebugger(80, async () => {
    captureEntered();
    await new Promise((resolve) => { releaseCapture = resolve; });
  });
  await entered;
  await api.ensureAttached(80);
  releaseCapture();
  await capture;
  assert.equal(calls.filter(([kind]) => kind === "attach").length, 1);
  assert.equal(calls.some(([kind]) => kind === "detach"), false);
  await api.detach(80);
  assert.equal(calls.filter(([kind]) => kind === "detach").length, 1);
});

test("borrowed capture detaches after trusted session ends during capture", async () => {
  const { api, calls, listeners } = loadBackground();
  await api.ensureAttached(82);
  calls.splice(0);

  let releaseCapture;
  let captureEntered;
  const entered = new Promise((resolve) => { captureEntered = resolve; });
  const capture = api.withTemporaryAxisDebugger(82, async () => {
    captureEntered();
    await new Promise((resolve) => { releaseCapture = resolve; });
  });
  await entered;

  await new Promise((resolve, reject) => {
    listeners.message(
      { type: "TRUSTED_SESSION_END" },
      { tab: { id: 82 }, url: "https://www.tradingview.com/chart" },
      (response) => {
        try {
          assert.deepEqual(response, { ok: true });
          resolve();
        } catch (error) {
          reject(error);
        }
      }
    );
  });
  releaseCapture();
  await capture;

  assert.deepEqual(calls.map((call) => call.slice(0, 3)), [
    ["send", 82, "Accessibility.enable"],
    ["send", 82, "Accessibility.disable"],
    ["detach", 82]
  ]);
});

test("trusted start shares an in-flight capture attach instead of attaching twice", async () => {
  const releases = [];
  let announceAttach;
  const attachStarted = new Promise((resolve) => { announceAttach = resolve; });
  const { api, calls } = loadBackground({
    attach: async () => {
      announceAttach();
      await new Promise((resolve) => { releases.push(resolve); });
    }
  });
  const capture = api.withTemporaryAxisDebugger(81, async () => {});
  await attachStarted;
  const trusted = api.ensureAttached(81);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const attachCount = calls.filter(([kind]) => kind === "attach").length;
  releases.splice(0).forEach((release) => release());
  await Promise.all([capture, trusted]);
  assert.equal(attachCount, 1);
  assert.equal(calls.filter(([kind]) => kind === "detach").length, 0);
  await api.detach(81);
});

test("grid calibration converts Retina device rows before CSS gap thresholds", () => {
  const { api } = loadBackground();
  assert.deepEqual(api.cssGridCalibration([20, 40, 60, 80], 2), {
    gridRows: [10, 20, 30, 40],
    gridGapPx: null
  });
  assert.deepEqual(api.cssGridCalibration([40, 80, 120, 160], 2), {
    gridRows: [20, 40, 60, 80],
    gridGapPx: 20
  });
});

test("axis candidates retain AX y coordinates and match only their nearby screenshot grid rows", () => {
  const { api } = loadBackground();
  assert.deepEqual(api.matchAxisCandidatesToGridRows([
    { price: 24000, y: 10.5 }, { price: 23800, y: 20.5 },
    { price: 23600, y: 29.5 }, { price: 23400, y: 40.5 }
  ], [10, 20, 30, 40], 1), [
    { price: 24000, y: 10 }, { price: 23800, y: 20 },
    { price: 23600, y: 30 }, { price: 23400, y: 40 }
  ]);
});

test("axis candidate matching ignores unrelated labels but rejects ambiguous and nonlinear mappings", () => {
  const { api } = loadBackground();
  assert.deepEqual(api.matchAxisCandidatesToGridRows([
    { price: 24000, y: 10 }, { price: 23800, y: 20 }, { price: 23600, y: 30 }, { price: 23400, y: 76 }
  ], [10, 20, 30, 40], 1), [
    { price: 24000, y: 10 }, { price: 23800, y: 20 }, { price: 23600, y: 30 }
  ], "unrelated axis label is ignored");
  assert.equal(api.matchAxisCandidatesToGridRows([
    { price: 24000, y: 10 }, { price: 23900, y: 10.5 }, { price: 23800, y: 20 }, { price: 23600, y: 30 }
  ], [10, 20, 30], 1), null, "two labels target one row and leave fewer than three anchors");
  assert.equal(api.matchAxisCandidatesToGridRows([
    { price: 24000, y: 40 }, { price: 23800, y: 30 }, { price: 23600, y: 20 }, { price: 23400, y: 10 }
  ], [10, 20, 30, 40], 1), null, "sorted prices and rows must not erase reversed AX positions");
  assert.equal(api.matchAxisCandidatesToGridRows([
    { price: 24000, y: 10 }, { price: 23800, y: 20 }, { price: 23500, y: 30 }, { price: 23300, y: 40 }
  ], [10, 20, 30, 40], 1), null, "nonlinear price scale");
});

test("axis capture reuses one screenshot and returns only reliable CSS-pixel calibration", async () => {
  const { api } = loadBackground();
  let screenshots = 0;
  const result = await api.captureAxisScale(
    { tab: { id: 9, windowId: 3 } },
    { viewportWidth: 100, viewportHeight: 100, plotRect: { left: 0, top: 0, right: 100, bottom: 100 } },
    {
      captureScreenshot: async () => {
        screenshots += 1;
        return {
          lower: { y: 80 }, upper: { y: 20 },
          gridRows: [20, 40, 60, 80], gridGapPx: 20, scaleY: 2
        };
      },
      readNativeAxisPrices: async () => [
        { price: 24000, y: 20 }, { price: 23800, y: 40 },
        { price: 23600, y: 60 }, { price: 23400, y: 80 }
      ]
    }
  );
  assert.equal(screenshots, 1);
  assert.deepEqual(result, {
    ok: true,
    lower: { y: 40 },
    upper: { y: 10 },
    gridRows: [20, 40, 60, 80],
    gridGapPx: 20,
    axisPrices: [24000, 23800, 23600, 23400],
    axisPairs: [
      { price: 24000, y: 20 }, { price: 23800, y: 40 },
      { price: 23600, y: 60 }, { price: 23400, y: 80 }
    ]
  });
});

test("axis capture prefers main-world canvas observations over inaccessible AX labels", async () => {
  const { api } = loadBackground();
  const result = await api.captureAxisScale(
    { tab: { id: 9, windowId: 3 } },
    {
      viewportWidth: 100,
      viewportHeight: 100,
      plotRect: { left: 0, top: 0, right: 100, bottom: 100 },
      axisCandidates: [
        { price: 24000, y: 20 }, { price: 23800, y: 40 },
        { price: 23600, y: 60 }, { price: 23400, y: 80 }
      ]
    },
    {
      captureScreenshot: async () => ({ gridRows: [20, 40, 60, 80], gridGapPx: 20, scaleX: 1, scaleY: 1 }),
      readNativeAxisPrices: async () => { throw new Error("AX fallback must not run"); }
    }
  );
  assert.equal(result.ok, true);
  assert.equal(result.axisPairs.length, 4);
});

test("axis capture fails closed when native labels and grid rows cannot make exact pairs", async () => {
  const { api } = loadBackground();
  const result = await api.captureAxisScale(
    { tab: { id: 9, windowId: 3 } },
    { viewportWidth: 100, viewportHeight: 100, plotRect: { left: 0, top: 0, right: 100, bottom: 100 } },
    {
      captureScreenshot: async () => ({ lower: null, upper: null, gridRows: [20, 40, 60], gridGapPx: 20, scaleY: 1 }),
      readNativeAxisPrices: async () => [{ price: 24000, y: 20 }, { price: 23800, y: 40 }]
    }
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /reliable/i);
});

test("legacy Pine-anchor capture stays screenshot-only when native axis capture is unavailable", async () => {
  const { api } = loadBackground();
  const result = await api.capturePineAnchors(
    { tab: { id: 9, windowId: 3 } },
    { viewportWidth: 100, viewportHeight: 100, plotRect: { left: 0, top: 0, right: 100, bottom: 100 } },
    {
      captureScreenshot: async () => ({ lower: { y: 80 }, upper: { y: 20 }, scaleX: 2, scaleY: 2 })
    }
  );
  assert.deepEqual(result, { lower: { y: 40 }, upper: { y: 10 } });
});
