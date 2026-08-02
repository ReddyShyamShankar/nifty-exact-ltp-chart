"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const api = require("./premium-chart-trials.js");

const axis = {
  from: 1000,
  to: 5000,
  xOf: (time) => (Number(time) - 1000) / 4
};

const points = [
  {
    time: 2000,
    call: { open: 180, high: 210, low: 170, close: 200 },
    put: { open: 90, high: 110, low: 80, close: 100 }
  },
  {
    time: 3000,
    call: { open: 200, high: 240, low: 190, close: 225 },
    put: { open: 100, high: 130, low: 95, close: 120 }
  }
];

test("SKYLINE is the only supported on-chart premium projection", () => {
  assert.deepEqual(Array.from(api.TRIAL_MODES), ["SKYLINE"]);
  assert.equal(api.rangeGeometry, undefined);
  assert.equal(api.premiumScaleGeometry, undefined);
  assert.equal(api.hybridGeometry, undefined);
});

test("SKYLINE maps exact Call close above strike and Put close below strike", () => {
  const geometry = api.skylineGeometry(points.slice(0, 1), 24200, axis, (price) => 25000 - price);
  assert.equal(geometry.length, 1);
  assert.deepEqual(geometry[0], {
    time: 2000,
    x: 250,
    anchorY: 800,
    call: { premium: 200, y: 600 },
    put: { premium: 100, y: 900 }
  });
});

test("SKYLINE preserves missing option side as a real gap", () => {
  const geometry = api.skylineGeometry([
    { time: 2000, call: { close: 200 }, put: { close: 100 } },
    { time: 3000, call: null, put: { close: 120 } },
    { time: 4000, call: { close: 225 }, put: { close: 130 } }
  ], 24200, axis, (price) => 25000 - price, 0);
  assert.equal(geometry[0].call.y, 600);
  assert.equal(geometry[1].call, null);
  assert.equal(geometry[1].put.premium, 120);
  assert.deepEqual(api.skylineSegments(geometry, "call").map((segment) => segment.map((point) => point.time)), [
    [2000], [4000]
  ]);
  assert.deepEqual(api.skylineSegments(geometry, "put").map((segment) => segment.map((point) => point.time)), [
    [2000, 3000, 4000]
  ]);
});

test("crosshair projects exact raw candle even when visual geometry was downsampled", () => {
  const sample = api.skylineCrosshairSample({
    time: 3000,
    call: { close: 225 },
    put: { close: 120 }
  }, 24200, (price) => 25000 - price);
  assert.deepEqual(sample, {
    time: 3000,
    anchorY: 800,
    call: { premium: 225, y: 575 },
    put: { premium: 120, y: 920 }
  });
});

test("crosshair raw candle preserves a true two-sided premium gap", () => {
  assert.deepEqual(api.skylineCrosshairSample({ time: 3000, call: null, put: null },
    24200, (price) => 25000 - price), {
    time: 3000,
    anchorY: 800,
    call: null,
    put: null
  });
});

test("visible samples clip by TradingView time and bound zoomed-out work by pixels", () => {
  const many = Array.from({ length: 1000 }, (_, index) => ({
    time: index,
    call: { open: index, high: index + 2, low: index - 2, close: index + 1 }
  }));
  const visible = api.visiblePremiumSamples(many, {
    from: 100,
    to: 899,
    xOf: (time) => (Number(time) - 100) / 8
  }, 4);
  assert.equal(visible[0].time, 100);
  assert.equal(visible.at(-1).time, 899);
  assert.ok(visible.length <= 27, `expected bounded samples, received ${visible.length}`);
});

test("crosshair equality suppresses repeated outside and identical pointer paints", () => {
  assert.equal(api.sameCrosshair(null, null), true);
  assert.equal(api.sameCrosshair(null, { time: 2000, clientX: 250 }), false);
  assert.equal(api.sameCrosshair(
    { time: 2000, clientX: 250 },
    { time: 2000, clientX: 250 }
  ), true);
  assert.equal(api.sameCrosshair(
    { time: 2000, clientX: 250 },
    { time: 2000, clientX: 251 }
  ), false);
});

test("spatial labels attach to date, Call, Put, and strike locations", () => {
  const layout = api.spatialLabelLayout({
    plotWidth: 900,
    plotHeight: 600,
    x: 450,
    anchorY: 300,
    callY: 180,
    putY: 430,
    widths: { date: 128, call: 118, put: 112, strike: 72, missing: 154 },
    height: 24
  });
  assert.equal(layout.date.y, 8);
  assert.equal(layout.call.y + layout.call.height, 171);
  assert.equal(layout.put.y, 439);
  assert.equal(layout.strike.y, 288);
  assert.equal(layout.missing, null);
  assert.ok(layout.call.x >= 8 && layout.call.x + layout.call.width <= 892);
  assert.ok(layout.put.x >= 8 && layout.put.x + layout.put.width <= 892);
});

test("spatial labels flip at vertical edges and clamp at horizontal edges", () => {
  const left = api.spatialLabelLayout({
    plotWidth: 320,
    plotHeight: 220,
    x: 2,
    anchorY: 110,
    callY: 10,
    putY: 212,
    widths: { date: 128, call: 118, put: 112, strike: 72, missing: 154 },
    height: 24
  });
  assert.equal(left.date.x, 8);
  assert.equal(left.call.y, 19);
  assert.equal(left.put.y + left.put.height, 203);
  Object.values(left).filter((box) => box && Number.isFinite(box.x)).forEach((box) => {
    assert.ok(box.x >= 8);
    assert.ok(box.x + box.width <= 312);
    assert.ok(box.y >= 8);
    assert.ok(box.y + box.height <= 212);
  });
});

test("spatial labels separate collisions without moving sample locations", () => {
  const layout = api.spatialLabelLayout({
    plotWidth: 500,
    plotHeight: 240,
    x: 250,
    anchorY: 120,
    callY: 108,
    putY: 132,
    widths: { date: 128, call: 118, put: 112, strike: 72, missing: 154 },
    height: 24
  });
  assert.equal(layout.sampleX, 250);
  assert.equal(layout.callPointY, 108);
  assert.equal(layout.putPointY, 132);
  assert.equal(api.rectsOverlap(layout.call, layout.strike, 4), false);
  assert.equal(api.rectsOverlap(layout.put, layout.strike, 4), false);
  assert.equal(api.rectsOverlap(layout.call, layout.put, 4), false);
});

test("both missing premiums produce one compact state beside strike", () => {
  const layout = api.spatialLabelLayout({
    plotWidth: 700,
    plotHeight: 300,
    x: 350,
    anchorY: 150,
    callY: null,
    putY: null,
    widths: { date: 128, call: 118, put: 112, strike: 72, missing: 154 },
    height: 24
  });
  assert.equal(layout.call, null);
  assert.equal(layout.put, null);
  assert.ok(layout.missing);
  assert.equal(api.rectsOverlap(layout.missing, layout.strike, 4), false);
});
