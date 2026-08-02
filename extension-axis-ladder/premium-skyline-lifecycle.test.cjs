"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const content = require("./content.js");
const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");

function functionSource(name) {
  return source.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}`))?.[0] || "";
}

test("opening Premium Skyline preserves stable time-axis evidence for the first paint", () => {
  const attributes = new Map([["data-options-time-axis", "stable-before-strike-click"]]);
  const documentRef = {
    documentElement: {
      setAttribute(name, value) { attributes.set(name, value); },
      removeAttribute(name) { attributes.delete(name); }
    }
  };

  content.setPremiumTimeSync(documentRef, true);

  assert.equal(attributes.get("data-options-time-axis"), "stable-before-strike-click");
  assert.equal(attributes.get("data-options-time-sync"), "on");
});

test("outside chart pointerdown closes Premium Skyline with the other transient selections", () => {
  const handler = functionSource("handleDocumentPointerDown");
  assert.match(handler, /if \(!row\) \{[\s\S]*?closePremiumHistory\(\)/);
});

test("strike chip uses theme-aware selected-strike ink instead of hardwired black contrast ink", () => {
  const crosshair = functionSource("drawPremiumSkylineCrosshair");
  const strikeDraw = crosshair.match(/drawPremiumSkylineChip\(context, layout\.strike[^\n]+/)?.[0] || "";
  assert.doesNotMatch(strikeDraw, /colors\.contrastInk/);
  assert.match(strikeDraw, /colors\.strikeInk/);
});

test("new time-axis geometry cannot paint against stale Premium Skyline placement", () => {
  const renderer = functionSource("renderPremiumChartTrials");
  assert.match(renderer,
    /samePlotRect\(state\?\.timeAxis\?\.plotRect,\s*premiumChartPlacement\?\.plotRect\)/);
});

test("invalidated premium-history runtime tells the user to reload TradingView", () => {
  assert.equal(
    content.premiumHistoryStatusMessage({
      status: "unavailable",
      error: "Extension context invalidated."
    }),
    "RELOAD TRADINGVIEW · EXTENSION UPDATED"
  );
  assert.equal(content.premiumHistoryStatusMessage({ status: "ready", error: null }), null);
});
