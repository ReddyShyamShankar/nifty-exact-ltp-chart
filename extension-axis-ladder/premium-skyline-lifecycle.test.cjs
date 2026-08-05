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

test("opening Premium Skyline immediately hands existing stable time-axis evidence to the pane", () => {
  const open = functionSource("openPremiumHistory");
  assert.match(open, /pane\.setTimeAxis\?\.\(currentPremiumTimeAxis\(\)\)/);
  assert.match(open, /setTimeAxis[\s\S]*pane\.open\(selection\)/,
    "first paint must receive existing chart time geometry before history resolves");
});

test("outside chart pointerdown closes Premium Skyline with the other transient selections", () => {
  const handler = functionSource("handleDocumentPointerDown");
  assert.match(handler, /if \(!row && outsideStrategyCard\) \{[\s\S]*?closePremiumHistory\(\)/);
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
    /const statePlotRect = state\?\.timeAxis\?\.plotRect;[\s\S]*const placementPlotRect = premiumChartPlacement\?\.plotRect;[\s\S]*samePlotRect\(statePlotRect, placementPlotRect\)/);
});

test("switching ready Skyline A to loading Skyline B removes A canvas", () => {
  let mounted = true;
  const canvas = { remove() { mounted = false; } };
  const documentRef = {
    getElementById(id) {
      return id === "options-premium-chart-trials" && mounted ? canvas : null;
    }
  };

  assert.equal(content.reconcilePremiumCanvas(documentRef, () => true), true,
    "ready A keeps its painted canvas");
  assert.equal(mounted, true);
  assert.equal(content.reconcilePremiumCanvas(documentRef, () => false), false,
    "loading B cannot paint yet");
  assert.equal(mounted, false, "unpaintable B removes A canvas immediately");
});

test("loading Premium Skyline keeps latest price placement until time-axis evidence arrives", () => {
  const renderer = functionSource("renderPremiumChartTrials");
  assert.match(renderer,
    /const statePlotRect = state\?\.timeAxis\?\.plotRect;[\s\S]*if \(!statePlotRect\) \{[\s\S]*return false;/);
  const waitingBranch = renderer.match(/if \(!statePlotRect\) \{[\s\S]*?return false;/)?.[0] || "";
  assert.doesNotMatch(waitingBranch, /premiumChartPlacement = null/,
    "loading state must not discard price-axis placement needed by ready Skyline");
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

test("Premium Skyline exposes explicit loading and offline status-card contracts", () => {
  assert.deepEqual(content.premiumHistoryStatusView({
    status: "loading",
    selection: { strike: 23800, expiry: "2026-08-25", interval: "1D" }
  }), {
    kind: "loading",
    title: "PREMIUM HISTORY · LOADING…",
    detail: "23,800 · 2026-08-25 · 1D",
    canRetry: false
  });
  assert.deepEqual(content.premiumHistoryStatusView({
    status: "unavailable",
    selection: { strike: 23800, expiry: "2026-08-25", interval: "1D" },
    error: "Failed to fetch"
  }), {
    kind: "unavailable",
    title: "PREMIUM HISTORY UNAVAILABLE",
    detail: "LOCAL BRIDGE OFFLINE",
    canRetry: true
  });
  assert.equal(content.premiumHistoryStatusView({ status: "ready" }), null);
  assert.equal(content.premiumHistoryStatusView({ status: "closed" }), null);
});

test("on-chart Premium Skyline status card owns retry and close without outside-click teardown", () => {
  const renderer = functionSource("renderPremiumHistoryStatus");
  const handler = functionSource("handleDocumentPointerDown");
  const close = functionSource("closePremiumHistory");
  const pane = functionSource("ensurePremiumHistoryPane");
  const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");

  assert.match(source, /const PREMIUM_HISTORY_STATUS_ID = "options-premium-history-status"/);
  assert.match(renderer, /PREMIUM HISTORY/);
  assert.match(renderer, /data-action", "retry"/);
  assert.match(renderer, /openPremiumHistory\(selection\.strike, selection\.interval\)/);
  assert.match(renderer, /data-action", "close"/);
  assert.match(renderer, /closePremiumHistory\(\)/);
  assert.match(handler, /PREMIUM_HISTORY_STATUS_ID/,
    "status buttons must not be treated as outside-chart clicks");
  assert.match(pane, /renderPremiumHistoryStatus\(state/);
  assert.match(close, /clearPremiumHistoryStatus\(\)/);
  assert.match(css, /#options-premium-history-status\s*\{/);
  assert.match(css, /\.options-premium-history-status__actions/);
  assert.match(css, /#options-premium-history-status button:focus-visible/);
});

test("Premium Skyline status card stays inside narrow chart plots", () => {
  assert.equal(content.premiumHistoryStatusMaxWidth(200), 176);
  assert.equal(content.premiumHistoryStatusMaxWidth(24), 0);
  assert.equal(content.premiumHistoryStatusMaxWidth("unknown"), null);

  const css = fs.readFileSync(path.join(__dirname, "overlay.css"), "utf8");
  const statusRule = css.match(/#options-premium-history-status\s*\{([\s\S]*?)\}/)?.[1] || "";
  const actionsRule = css.match(/\.options-premium-history-status__actions\s*\{([\s\S]*?)\}/)?.[1] || "";
  assert.match(statusRule, /min-width:\s*0/);
  assert.match(statusRule, /box-sizing:\s*border-box/);
  assert.match(statusRule, /flex-wrap:\s*wrap/);
  assert.doesNotMatch(statusRule, /white-space:\s*nowrap/);
  assert.match(actionsRule, /flex-wrap:\s*wrap/);
});

test("closing Premium Skyline preserves current price-axis placement for cached reopen", () => {
  const close = functionSource("closePremiumHistory");
  assert.doesNotMatch(close, /premiumChartPlacement = null/,
    "selection close must clear drawings, not discard reusable chart price geometry");
  const stop = functionSource("stop");
  assert.match(stop, /premiumChartPlacement = null/,
    "extension teardown still discards all retained placement state");
});

test("terminal chart lifecycle changes discard retained Premium Skyline placement", () => {
  const identitySync = functionSource("syncPremiumHistoryTimeframe");
  const runtimeMutations = functionSource("handleRuntimeMutations");
  const urlNavigation = functionSource("handleUrlNavigation");
  const pageHide = functionSource("handlePageHide");
  assert.match(identitySync, /closePremiumHistory\(\);\s*invalidatePremiumHistoryPlacement\(\)/);
  assert.match(runtimeMutations, /nextUrl !== currentUrl[\s\S]*closePremiumHistory\(\);\s*invalidatePremiumHistoryPlacement\(\)/);
  assert.match(urlNavigation, /closePremiumHistory\(\);\s*invalidatePremiumHistoryPlacement\(\)/);
  assert.match(pageHide, /closePremiumHistory\(\);\s*invalidatePremiumHistoryPlacement\(\)/);
});
