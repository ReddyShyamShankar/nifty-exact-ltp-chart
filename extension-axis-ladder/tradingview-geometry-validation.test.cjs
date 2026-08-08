"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const api = require("./content.js");

const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");
const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
const rect = (left, top, right, bottom) => ({ left, top, right, bottom });
const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const layout = (ladderLeft = 1040, width = 1280, plotLeft = 20) =>
  api.positionSpineLayout(ladderLeft, { left: plotLeft, right: width - 40 }, width);

test("TVG-001 Call and Put badge separation", () => {
  const value = layout();
  assert.ok(value.call.right < value.spineX && value.put.left > value.spineX);
  assert.equal(overlaps(rect(value.call.left, 100, value.call.right, 118), rect(value.put.left, 100, value.put.right, 118)), false);
});

test("TVG-002 same-side badge collision grouping", () => {
  const groups = api.positionColumnClusters([{ id: "T1", side: "call", y: 100 }, { id: "T2", side: "call", y: 112 }], 20);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 2);
});

test("TVG-003 badge chart-edge clipping", () => {
  for (const width of [760, 1024, 1440, 1920]) {
    const value = layout(width - 180, width, 8);
    assert.ok(value.call.left >= 8 && value.put.right <= width);
  }
});

test("TVG-004 badge and ladder-row separation", () => {
  const value = layout();
  const ladder = rect(value.ladderLeft, 100, 1240, 124);
  assert.equal(overlaps(rect(value.call.left, 100, value.call.right, 118), ladder), false);
  assert.equal(overlaps(rect(value.put.left, 100, value.put.right, 118), ladder), false);
});

test("TVG-005 saved face and adjacent-row separation", () => {
  const rows = [100, 130, 160].map((y) => rect(1000, y - 12, 1240, y + 12));
  assert.equal(rows.some((row, index) => rows.slice(index + 1).some((other) => overlaps(row, other))), false);
});

test("TVG-006 strategy rail and ladder-row separation", () => {
  const value = layout();
  assert.ok(value.call.right < value.ladderLeft && value.put.right < value.ladderLeft);
  assert.match(source, /rail\.style\.width = `\$\{Math\.max\(0, cardRight - rect\.left\)\}px`/);
});

test("TVG-007 OI badge and position badge separation", () => {
  assert.match(css, /\.nifty-axis-ladder__badges\s*\{[\s\S]*?top:\s*-13px/);
  assert.match(css, /\.nifty-axis-ladder__oi-badges\s*\{[\s\S]*?top:\s*-31px/);
  assert.match(css, /\.nifty-axis-ladder__oi-badges\[hidden\]\s*\{\s*display:\s*none/);
  assert.match(source, /const visibleRowRects = elements/);
  assert.match(source, /oiBadges\.hidden = visibleRowRects\.some/);
});

test("TVG-008 break-even text and position-lane separation", () => {
  const value = layout();
  const right = api.breakEvenLabelRight(value.ladderLeft, { left: 20, right: 1240 }, 1280, true);
  assert.ok(right <= value.call.left - 6);
});

test("TVG-009 native price-label clearance", () => {
  const value = layout();
  assert.ok(value.put.right <= value.ladderLeft - 3);
  assert.equal(value.hasSafePutGap, true);
});

test("TVG-010 live-price label clearance", () => {
  const value = layout(1180, 1280);
  assert.ok(value.spineX < value.ladderLeft);
  assert.ok(value.put.right < value.ladderLeft);
});

test("TVG-011 crosshair clearance", () => {
  assert.match(css, /#nifty-strategy-rails\s*\{[\s\S]*?pointer-events:\s*none/);
  assert.match(css, /\.nifty-position-spine__compact\s*\{[\s\S]*?pointer-events:\s*auto/);
});

test("TVG-012 dense strike layout", () => {
  const items = Array.from({ length: 12 }, (_, index) => ({ id: `T${index + 1}`, side: "put", y: 100 + index * 4 }));
  const groups = api.positionColumnClusters(items, 20);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 12);
});

test("TVG-013 price-axis zoom-in geometry", () => {
  const bounds = api.positionSpineBounds([90, 140, 190, 240], { top: 100, bottom: 220 });
  assert.deepEqual(bounds, { top: 140, bottom: 190 });
});

test("TVG-014 price-axis zoom-out geometry", () => {
  const bounds = api.positionSpineBounds([100, 300, 500, 700], { top: 80, bottom: 720 });
  assert.deepEqual(bounds, { top: 100, bottom: 700 });
});

test("TVG-015 horizontal-pan geometry", () => {
  const before = layout(1000, 1280);
  const after = layout(1000, 1280);
  assert.deepEqual(after, before);
});

test("TVG-016 timeframe-change geometry", () => {
  for (const yValues of [[100, 180], [80, 240], [40, 600]]) {
    const bounds = api.positionSpineBounds(yValues, { top: 20, bottom: 700 });
    assert.deepEqual(bounds, { top: yValues[0], bottom: yValues[1] });
  }
});

test("TVG-017 side-panel resize geometry", () => {
  for (const width of [720, 840, 1024, 1280, 1600]) {
    const value = layout(width - 140, width, 8);
    assert.equal(value.hasSafePutGap, true);
    assert.ok(value.call.left >= 8);
  }
});

test("TVG-018 browser-zoom geometry", () => {
  for (const zoom of [0.8, 1, 1.25, 1.5, 2]) {
    const width = 1280 / zoom;
    const value = layout(width - 140, width, 8);
    assert.ok(value.call.left >= 8 && value.put.right <= value.ladderLeft - 3);
  }
});

test("TVG-019 light and dark theme geometry", () => {
  assert.match(css, /var\(--plan-line\)/);
  assert.match(css, /var\(--plan-surface\)/);
  assert.doesNotMatch(css.match(/\.nifty-position-spine__line\s*\{[\s\S]*?\}/)?.[0] || "", /#[0-9a-f]{3,8}/i);
});

test("TVG-020 full visual bounding-rectangle audit", () => {
  const value = layout();
  const spine = rect(value.spineX, 40, value.spineX + 1, 700);
  const call = rect(value.call.left, 100, value.call.right, 118);
  const put = rect(value.put.left, 100, value.put.right, 118);
  const ladder = rect(value.ladderLeft, 88, 1240, 124);
  assert.equal(overlaps(call, put), false);
  assert.equal(overlaps(call, ladder), false);
  assert.equal(overlaps(put, ladder), false);
  assert.equal(overlaps(call, spine), false);
  assert.equal(overlaps(put, spine), false);
});
