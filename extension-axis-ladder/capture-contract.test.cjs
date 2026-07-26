"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function installChromeMock() {
  const calls = [];
  global.chrome = {
    debugger: {
      attach: async (target) => calls.push(["attach", target.tabId]),
      detach: async (target) => calls.push(["detach", target.tabId]),
      sendCommand: async (target, method, params) => {
        calls.push(["send", target.tabId, method, params]);
        return {};
      },
      onDetach: { addListener() {} }
    },
    tabs: {
      onRemoved: { addListener() {} },
      captureVisibleTab: async () => { throw new Error("not used in unit tests"); }
    },
    runtime: { onMessage: { addListener() {} } }
  };
  global.importScripts = () => { global.NiftyOverlay = require("./overlay-utils.js"); };
  return calls;
}

function loadBackground() {
  const filename = path.join(__dirname, "background.js");
  delete require.cache[filename];
  const calls = installChromeMock();
  return { api: require(filename), calls };
}

test("exports native-axis capture API and supports both capture message names", () => {
  const { api } = loadBackground();
  assert.equal(typeof api.captureAxisScale, "function");
  assert.equal(typeof api.withTemporaryAxisDebugger, "function");
  assert.equal(typeof api.extractAxisPrices, "function");
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
      readNativeAxisPrices: async () => ["24,000", "23,800", "23,600", "23,400"]
    }
  );
  assert.equal(screenshots, 1);
  assert.deepEqual(result, {
    ok: true,
    lower: { y: 40 },
    upper: { y: 10 },
    gridRows: [10, 20, 30, 40],
    gridGapPx: 10,
    axisPrices: [24000, 23800, 23600, 23400],
    axisPairs: [
      { price: 24000, y: 10 }, { price: 23800, y: 20 },
      { price: 23600, y: 30 }, { price: 23400, y: 40 }
    ]
  });
});

test("axis capture fails closed when native labels and grid rows cannot make exact pairs", async () => {
  const { api } = loadBackground();
  const result = await api.captureAxisScale(
    { tab: { id: 9, windowId: 3 } },
    { viewportWidth: 100, viewportHeight: 100, plotRect: { left: 0, top: 0, right: 100, bottom: 100 } },
    {
      captureScreenshot: async () => ({ lower: null, upper: null, gridRows: [20, 40, 60], gridGapPx: 20, scaleY: 1 }),
      readNativeAxisPrices: async () => ["24,000", "23,800"]
    }
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /reliable/i);
});
