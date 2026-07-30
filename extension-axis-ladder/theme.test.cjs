"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const theme = require("./theme.js");
const manifest = require("./manifest.json");

function fakeElement() {
  const listeners = {};
  const attrs = {};
  return {
    dataset: {},
    style: {},
    src: "",
    title: "",
    addEventListener(type, listener) { listeners[type] = listener; },
    dispatch(type) { return listeners[type]?.(); },
    setAttribute(name, value) { attrs[name] = value; },
    getAttribute(name) { return attrs[name]; }
  };
}

function harness(saved = "dark") {
  const root = fakeElement();
  const toggle = fakeElement();
  const mark = fakeElement();
  const listeners = [];
  const writes = [];
  const chromeApi = {
    storage: {
      local: {
        async get() { return { uiTheme: saved }; },
        async set(value) { writes.push(value); }
      },
      onChanged: { addListener(listener) { listeners.push(listener); } }
    }
  };
  const documentApi = {
    documentElement: root,
    getElementById(id) { return id === "theme-toggle" ? toggle : id === "popup-mark" ? mark : null; }
  };
  return { chromeApi, controller: theme.createController(chromeApi, documentApi), listeners, mark, root, toggle, writes };
}

test("dark is stable default and only light or dark can be stored", () => {
  assert.equal(theme.DEFAULT_THEME, "dark");
  assert.equal(theme.normalizeTheme("light"), "light");
  assert.equal(theme.normalizeTheme("dark"), "dark");
  assert.equal(theme.normalizeTheme("system"), "dark");
  assert.equal(theme.oppositeTheme("dark"), "light");
  assert.equal(theme.oppositeTheme("light"), "dark");
});

test("one stored theme updates surface, icon, accessible label, and all listeners", async () => {
  const h = harness("dark");
  await h.controller.install();
  assert.equal(h.root.dataset.theme, "dark");
  assert.equal(h.root.style.colorScheme, "dark");
  assert.equal(h.mark.src, "icons/nifty-mark.svg");
  assert.equal(h.toggle.getAttribute("aria-label"), "Switch to light theme");

  assert.equal(await h.controller.toggleTheme(), "light");
  assert.deepEqual(h.writes, [{ uiTheme: "light" }]);
  assert.equal(h.root.dataset.theme, "light");
  assert.equal(h.mark.src, "icons/nifty-mark.svg");
  assert.equal(h.toggle.getAttribute("aria-label"), "Switch to dark theme");

  h.listeners[0]({ uiTheme: { newValue: "dark" } }, "local");
  assert.equal(h.root.dataset.theme, "dark");
});

test("popup and side panel load one shared controller while chart scopes same setting to ladder root", () => {
  for (const file of ["action-popup.html", "popup.html"]) {
    const html = fs.readFileSync(path.join(__dirname, file), "utf8");
    assert.match(html, /href="theme\.css"/);
    assert.match(html, /src="theme\.js"/);
    assert.equal((html.match(/id="theme-toggle"/g) || []).length, 1, `${file}: one theme toggle`);
    assert.match(html, /icons\/nifty-mark\.svg/);
  }
  const scripts = manifest.content_scripts.find((entry) => entry.js.includes("content.js")).js;
  assert.equal(scripts.includes("theme.js"), false, "theme controller must not mutate TradingView document root");
  const content = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  assert.match(content, /uiTheme:\s*"dark"/);
  assert.match(content, /node\.dataset\.theme = settings\.uiTheme/);
  assert.match(content, /if \(changes\.uiTheme\)/);
});

test("original Options Ladder logo and bundled official Geist fonts exist", () => {
  for (const file of ["Geist-Variable.woff2", "GeistMono-Variable.woff2", "OFL.txt"]) {
    assert.equal(fs.existsSync(path.join(__dirname, "fonts", file)), true, `${file} must be bundled`);
  }
  const exactAssetHashes = {
    "icons/nifty-mark.svg": "82d3ebe76354732bce9b54e72af8dd44351e4497bf0ef8ae632877572fba748e",
    "icons/nifty-mark-16.png": "3d738fccc5cd2e30cde9ebe309da696d8eb25cd78efbd63dcf54267bc1e6bada",
    "icons/nifty-mark-32.png": "b4691bd686c91b01755c8336ae4d52849b0cb1efb41511bc3c6e117d4120c80f",
    "icons/nifty-mark-48.png": "1aaed2ed649e924039812926c62822c161b609742e3e603418869decbcf4724a",
    "icons/nifty-mark-128.png": "8d9515f27c5c8091160017e0ccab1533a6f97ee99330af504ff121201f2b6c04"
  };
  for (const [file, expected] of Object.entries(exactAssetHashes)) {
    const actual = crypto.createHash("sha256").update(fs.readFileSync(path.join(__dirname, file))).digest("hex");
    assert.equal(actual, expected, `${file}: original Options Ladder logo hash`);
  }
});

test("all UI color literals stay inside locked ARB Desk core palette", () => {
  const files = ["theme.css", "action-popup.css", "popup.css", "overlay.css"];
  const allowedHex = new Set([
    "#0a0a0a", "#111113", "#161618", "#1f1f23", "#2a2a30", "#f4f4f5", "#a1a1aa", "#71717a",
    "#34d399", "#f87171", "#fbbf24", "#fafafa", "#ffffff", "#e4e4e7", "#d4d4d8", "#18181b",
    "#52525b", "#6a6a73", "#066647", "#dc2626", "#b45309"
  ]);
  const allowedRgba = new Set([
    "rgba(52,211,153,0.12)", "rgba(248,113,113,0.10)", "rgba(251,191,36,0.10)",
    "rgba(5,150,105,0.10)", "rgba(220,38,38,0.08)", "rgba(180,83,9,0.10)",
    "rgba(10,10,10,0.92)", "rgba(250,250,250,0.7)"
  ]);
  for (const file of files) {
    const css = fs.readFileSync(path.join(__dirname, file), "utf8");
    for (const color of css.match(/#[0-9a-f]{3,8}/gi) || []) {
      assert.equal(allowedHex.has(color.toLowerCase()), true, `${file}: unapproved ${color}`);
    }
    for (const color of css.match(/rgba?\([^)]*\)/gi) || []) {
      const normalized = color.toLowerCase().replace(/\s+/g, "");
      assert.equal(allowedRgba.has(normalized), true, `${file}: unapproved ${color}`);
    }
    assert.doesNotMatch(css, /\b(?:Inter|Segoe UI)\b/i, `${file}: fallback font drift`);
    assert.doesNotMatch(css, /(?:linear|radial)-gradient/i, `${file}: gradient drift`);
    for (const value of [...css.matchAll(/box-shadow:\s*([^;]+);/gi)].map((match) => match[1].trim())) {
      assert.equal(value, "none", `${file}: shadow drift ${value}`);
    }
  }
});
