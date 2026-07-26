"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function loadBackground() {
  const listeners = {};
  global.chrome = {
    runtime: { onMessage: { addListener(listener) { listeners.message = listener; } } }
  };
  global.importScripts = () => { global.NiftyOverlay = require("./overlay-utils.js"); };
  const filename = path.join(__dirname, "background.js");
  delete require.cache[filename];
  return { api: require(filename), listeners };
}

test("exports native-axis-only capture API", () => {
  const { api } = loadBackground();
  assert.deepEqual(Object.keys(api).sort(), [
    "axisPairsFromCandidates", "captureAxisScale", "extractAxisPrices", "isCaptureMessage"
  ]);
  assert.equal(api.isCaptureMessage("CAPTURE_AXIS_SCALE"), true);
  assert.equal(api.isCaptureMessage("CAPTURE_PINE_ANCHORS"), false);
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

test("axis capture returns native coordinates without screenshot or debugger", async () => {
  const { api } = loadBackground();
  const result = await api.captureAxisScale({}, {
    axisCandidates: [
      { price: 24200, y: 80 },
      { price: 24100, y: 120 },
      { price: 24000, y: 160 },
      { price: 23900, y: 200 }
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
