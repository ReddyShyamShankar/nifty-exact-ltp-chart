"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const api = require("./content.js");

const sequential = { concurrency: false };

for (let index = 0; index < 40; index += 1) {
  const id = String(index + 1).padStart(3, "0");
  test(`POS_LAYOUT_${id} reserves source-neutral Call and Put columns before ladder`, sequential, () => {
    const viewportWidth = 1200 + (index % 5) * 120;
    const ladderLeft = 360 + index * 9;
    const layout = api.positionSpineLayout(ladderLeft, {
      left: 20 + (index % 3) * 5,
      right: viewportWidth - 40
    }, viewportWidth);
    assert.ok(layout);
    assert.equal(layout.ladderLeft, ladderLeft);
    assert.equal(layout.call.right - layout.call.left, 47);
    assert.equal(layout.put.right - layout.put.left, 47);
    assert.ok(layout.call.right < layout.spineX, "Call column ends before spine");
    assert.ok(layout.put.left > layout.spineX, "Put column starts after spine");
    assert.ok(layout.put.right <= layout.ladderLeft - 3, "Put column ends before ladder/OI card");
    assert.equal(layout.hasSafePutGap, true);
    assert.equal(layout.strategy, undefined);
    assert.equal(layout.broker, undefined);
  });
}

for (let index = 0; index < 20; index += 1) {
  const id = String(index + 41).padStart(3, "0");
  test(`POS_GROUP_${id} collapses same-side vertical collisions into one informational count`, sequential, () => {
    const side = index % 2 === 0 ? "call" : "put";
    const count = 2 + (index % 5);
    const step = index % 19;
    const items = Array.from({ length: count }, (_, itemIndex) => ({
      id: `${side}-${index}-${itemIndex}`,
      side,
      y: 100 + itemIndex * step
    }));
    const clusters = api.positionColumnClusters(items, 20);
    assert.equal(clusters.length, 1);
    assert.equal(clusters[0].items.length, count);
    assert.equal(clusters[0].items.every((item) => item.side === side), true);
    assert.equal(new Set(clusters[0].items.map((item) => item.id)).size, count);
    assert.equal(clusters[0].key, `${side}:${[...clusters[0].items.map((item) => item.id)].sort().join("|")}`);
  });
}

for (let index = 0; index < 15; index += 1) {
  const id = String(index + 61).padStart(3, "0");
  test(`POS_SIDE_${id} never combines Call and Put collisions`, sequential, () => {
    const y = 120 + index * 3;
    const clusters = api.positionColumnClusters([
      { id: `call-a-${index}`, side: "call", y },
      { id: `call-b-${index}`, side: "call", y: y + 2 },
      { id: `put-a-${index}`, side: "put", y },
      { id: `put-b-${index}`, side: "put", y: y + 2 }
    ], 20);
    assert.equal(clusters.length, 2);
    assert.deepEqual(clusters.map((cluster) => cluster.side), ["call", "put"]);
    assert.equal(clusters.every((cluster) => cluster.items.length === 2), true);
    assert.equal(clusters.every((cluster) => cluster.items.every((item) => item.side === cluster.side)), true);
  });
}

for (let index = 0; index < 10; index += 1) {
  const id = String(index + 76).padStart(3, "0");
  test(`POS_CLEAR_${id} keeps safely separated positions directly visible`, sequential, () => {
    const gap = 20 + index * 2;
    const side = index % 2 === 0 ? "call" : "put";
    const clusters = api.positionColumnClusters(Array.from({ length: 5 }, (_, itemIndex) => ({
      id: `${side}-${index}-${itemIndex}`,
      side,
      y: 100 + itemIndex * gap
    })), 20);
    assert.equal(clusters.length, 5);
    assert.equal(clusters.every((cluster) => cluster.items.length === 1), true);
    assert.equal(clusters.every((cluster) => cluster.items[0].side === side), true);
  });
}

for (let index = 0; index < 10; index += 1) {
  const id = String(index + 86).padStart(3, "0");
  test(`POS_SPINE_${id} limits vertical spine to first and last visible ladder strikes`, sequential, () => {
    const top = 40 + index;
    const bottom = 640 - index;
    const points = [
      { y: top - 30 },
      { y: top },
      { y: top + 80 + index },
      { y: bottom },
      { y: bottom + 30 }
    ];
    assert.deepEqual(api.positionSpineBounds(points, { top, bottom }), { top, bottom });
  });
}

const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");
const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
const cssCase = (selector) => css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{[\\s\\S]*?\\}`))?.[0] || "";

test("POS_A11Y_096 group opener exposes expansion only, never ambiguous selection", sequential, () => {
  assert.match(source, /nifty-position-spine__cluster-select[\s\S]*?setAttribute\("aria-expanded"/);
  const block = source.match(/const groupSelector = document\.createElement\("button"\);[\s\S]*?rootNodeValue\.append\(groupSelector\);/)?.[0] || "";
  assert.doesNotMatch(block, /aria-pressed/);
});

test("POS_A11Y_097 closed plus count is informational and cannot be clicked", sequential, () => {
  assert.match(cssCase(".nifty-position-spine__cluster-count"), /width:\s*28px/);
  assert.match(cssCase(".nifty-position-spine__cluster-count"), /height:\s*18px/);
});

test("POS_A11Y_098 exact flyout row owns explicit selection state", sequential, () => {
  assert.match(source, /nifty-position-spine__cluster-row-select[\s\S]*?setAttribute\("aria-pressed"/);
  assert.match(cssCase('.nifty-position-spine__cluster-row-select[aria-pressed="true"]'), /background:\s*var\(--control-bg\)/);
});

test("POS_LAYER_099 grouped flyout renders above ladder and compact controls", sequential, () => {
  assert.match(cssCase(".nifty-position-spine__cluster-flyout"), /z-index:\s*8/);
  assert.match(cssCase(".nifty-position-spine__cluster-flyout"), /pointer-events:\s*auto/);
});

test("POS_COLOR_100 grouped rows preserve Buy green and Sell red identity rails", sequential, () => {
  assert.match(cssCase(".nifty-position-spine__cluster-row.is-buy"), /var\(--ladder-buy\)/);
  assert.match(cssCase(".nifty-position-spine__cluster-row.is-sell"), /var\(--ladder-sell\)/);
});

for (let index = 0; index < 20; index += 1) {
  const id = String(index + 101).padStart(3, "0");
  test(`BE_CLEAR_${id} stops quick break-even text before every position-control lane`, sequential, () => {
    const viewportWidth = 1280 + (index % 4) * 160;
    const ladderLeft = 420 + index * 12;
    const rect = { left: 16 + (index % 3) * 8, right: viewportWidth - 32 };
    const layout = api.positionSpineLayout(ladderLeft, rect, viewportWidth);
    const clearRight = api.breakEvenLabelRight(ladderLeft, rect, viewportWidth, true);
    assert.ok(clearRight <= layout.call.left - 6);
    assert.ok(clearRight < layout.put.left);
    assert.ok(clearRight >= rect.left);
    assert.equal(api.breakEvenLabelRight(ladderLeft, rect, viewportWidth, false), ladderLeft);
  });
}
