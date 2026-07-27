const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const read = (name) => fs.readFileSync(path.join(__dirname, name), "utf8");

test("popup presents approved compact Trading Desk Lite workflow", () => {
  const html = read("popup.html");
  const js = read("popup.js");

  assert.ok(html.indexOf('id="refresh-chain"') < html.indexOf('class="market-card"'), "manual refresh stays in popup header");
  assert.match(html, /class="header-refresh mono" id="refresh-chain"/);
  assert.match(html, /<svg class="refresh-icon"[^>]+viewBox="0 0 24 24"/);
  assert.doesNotMatch(html, /refresh-glyph/);
  assert.match(html, /id="open-chain"[^>]+aria-expanded="false"/);
  assert.match(html, /id="chain-panel" hidden/);
  assert.match(html, /id="advanced-panel" hidden/);
  assert.match(html, /RETRY PLACEMENT/);
  assert.match(html, />REFRESH</);
  assert.match(html, /id="enabled"/);
  assert.match(html, /id="expiry"/);
  assert.doesNotMatch(html, /class="block intro"|class="block chain-block"/);
  assert.doesNotMatch(html, /SYNC PINE INPUTS|data-count|id="sync-pine"/);
  assert.doesNotMatch(js, /SYNC_PINE_INPUTS|syncPineInputs|labelCount|PINE_STRIKE_STEP/);
  assert.match(js, /RETRY_LABEL_PLACEMENT/);
  assert.doesNotMatch(js, /\/api\/nifty-chain/);
  assert.doesNotMatch(js, /setInterval\(loadChain/);
});

test("content accepts manual exact-axis placement retry", () => {
  const source = read("content.js");
  assert.match(source, /RETRY_LABEL_PLACEMENT/);
  assert.match(source, /controller\.place\(\)/);
});

test("popup fetches option numbers only after manual refresh", async () => {
  const source = read("popup.js");
  const listeners = new Map();
  const requests = [];
  const messages = [];
  const makeNode = (id = "") => ({
    id,
    value: id === "expiry" ? "current_month" : "",
    textContent: "",
    className: "",
    innerHTML: "",
    disabled: false,
    hidden: id === "chain-panel" || id === "advanced-panel",
    attributes: new Map([["aria-expanded", "false"]]),
    setAttribute(name, value) { this.attributes.set(name, String(value)); },
    getAttribute(name) { return this.attributes.get(name) || null; },
    removeAttribute(name) { this.attributes.delete(name); },
    addEventListener(type, listener) { listeners.set(`${id}:${type}`, listener); },
    replaceChildren() {},
    append() {}
  });
  const nodes = new Map([
    "status", "expiry-hint", "placement-status", "enabled", "summary", "ladder-title", "expiry",
    "chain", "spot", "retry-placement", "refresh-chain", "refresh-label", "open-chain", "chain-panel",
    "advanced-toggle", "advanced-panel"
  ].map((id) => [id, makeNode(id)]));
  const response = (payload) => ({ ok: true, json: async () => payload });
  const sandbox = {
    AbortController,
    chrome: {
      storage: {
        local: {
          async get(defaults) { return defaults; },
          async set() {}
        }
      },
      tabs: {
        async query() { return [{ id: 7, url: "https://www.tradingview.com/chart/test/" }]; },
        async sendMessage(_tabId, message) {
          messages.push(message);
          return { ok: true, chain: { spot: 23900, atm: 23900, rows: [] } };
        }
      }
    },
    document: {
      querySelector(selector) { return nodes.get(selector.replace(/^#/, "")); },
      createElement() { return makeNode(); }
    },
    fetch: async (url) => {
      requests.push(String(url));
      if (String(url).includes("/api/health")) return response({ status: "ok" });
      if (String(url).includes("/api/nifty-expiries")) return response({
        expiries: [{ expiry: "2026-07-30", daysToExpiry: 3 }]
      });
      return response({ spot: 23900, atm: 23900, rows: [] });
    },
    Intl,
    console,
    window: { setInterval() { return 1; } },
    setTimeout,
    clearTimeout
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox);
  await new Promise(setImmediate);
  await new Promise(setImmediate);

  assert.equal(requests.filter((url) => url.includes("/api/nifty-chain")).length, 0);
  assert.equal(typeof listeners.get("refresh-chain:click"), "function");
  assert.equal(typeof listeners.get("open-chain:click"), "function");
  assert.equal(nodes.get("chain-panel").hidden, true);

  await listeners.get("open-chain:click")();

  assert.equal(nodes.get("chain-panel").hidden, false);
  assert.equal(nodes.get("open-chain").getAttribute("aria-expanded"), "true");

  await listeners.get("refresh-chain:click")();

  assert.equal(requests.filter((url) => url.includes("/api/nifty-chain")).length, 0);
  assert.deepEqual(messages.map((message) => message.type), ["REFRESH_OPTION_NUMBERS"]);
});
