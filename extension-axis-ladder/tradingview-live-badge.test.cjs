"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const api = require("./tradingview-live-badge.js");

function badge(text, children = []) {
  return { textContent: text, children, classList: { values: new Set(), add(...v) { v.forEach((x) => this.values.add(x)); }, remove(...v) { v.forEach((x) => this.values.delete(x)); } } };
}

function control(text, badges, ariaLabel = null) {
  return {
    textContent: text,
    getAttribute(name) { return name === "aria-label" ? ariaLabel : null; },
    querySelectorAll() { return badges; }
  };
}

function documentWith(controls) {
  return { querySelectorAll(selector) { return selector === 'button, [role="button"]' ? controls : []; } };
}

test("maps only exact supported status text", () => {
  assert.equal(api.stateFor(" LIVE "), "live");
  assert.equal(api.stateFor("OFFLINE"), "offline");
  assert.equal(api.stateFor("Disconnected"), "offline");
  assert.equal(api.stateFor("Publish"), null);
});

test("finds one exact badge only inside one Publish control", () => {
  const target = badge("LIVE");
  assert.equal(api.findBadge(documentWith([control("Publish LIVE", [target])])), target);
  assert.equal(api.findBadge(documentWith([control("Other LIVE", [target])])), null);
});

test("rejects Publish-like controls and accepts compact Publish with nested LIVE", () => {
  const live = badge("LIVE");
  const nested = badge("LIVE", [live]);

  assert.equal(api.findBadge(documentWith([control("Publish idea LIVE", [live])])), null);
  assert.equal(api.findBadge(documentWith([control("Republish LIVE", [live])])), null);
  assert.equal(api.findBadge(documentWith([control("Publish LIVE", [live], "Publish idea")])), null);
  assert.equal(api.findBadge(documentWith([control("PublishLIVE", [nested, live])])), live);
  assert.equal(api.findBadge(documentWith([control("LIVE", [live], "Publish")])), live);
});

test("ambiguous Publish controls or status descendants fail closed", () => {
  const first = badge("LIVE");
  const second = badge("LIVE");
  assert.equal(api.findBadge(documentWith([
    control("Publish LIVE", [first]),
    control("Publish LIVE", [second])
  ])), null);
  assert.equal(api.findBadge(documentWith([control("Publish LIVE OFFLINE", [first, badge("OFFLINE")])])), null);
});

test("decoration replaces only owned state classes and preserves text", () => {
  const target = badge("LIVE");
  const publish = control("Publish LIVE", [target]);
  const doc = documentWith([publish]);
  assert.equal(api.decorate(doc), "live");
  assert.equal(target.textContent, "LIVE");
  assert.deepEqual([...target.classList.values].sort(), ["is-live", "nifty-tv-status-badge"]);
  target.textContent = "OFFLINE";
  publish.textContent = "Publish OFFLINE";
  assert.equal(api.decorate(doc), "offline");
  assert.deepEqual([...target.classList.values].sort(), ["is-offline", "nifty-tv-status-badge"]);
});

test("decoration clears owned classes when status becomes unsupported", () => {
  const target = badge("LIVE");
  target.classList.add("tradingview-owned");
  const doc = documentWith([control("Publish LIVE", [target])]);
  assert.equal(api.decorate(doc), "live");

  target.textContent = "CONNECTING";
  assert.equal(api.decorate(doc), null);
  assert.deepEqual([...target.classList.values], ["tradingview-owned"]);
});

test("decoration clears prior owned target when discovery becomes ambiguous", () => {
  const target = badge("LIVE");
  const controls = [control("Publish LIVE", [target])];
  const doc = documentWith(controls);
  assert.equal(api.decorate(doc), "live");

  controls.push(control("Publish OFFLINE", [badge("OFFLINE")]));
  assert.equal(api.decorate(doc), null);
  assert.deepEqual([...target.classList.values], []);
});

test("install decorates immediately, responds to rerender, and disconnects", () => {
  const target = badge("LIVE");
  const publish = control("Publish LIVE", [target]);
  const doc = documentWith([publish]);
  let callback;
  let disconnected = false;
  class Observer {
    constructor(fn) { callback = fn; }
    observe() {}
    disconnect() { disconnected = true; }
  }
  const stop = api.install(doc, Observer);
  assert.equal(target.classList.values.has("is-live"), true);
  target.textContent = "OFFLINE";
  publish.textContent = "Publish OFFLINE";
  callback([]);
  assert.equal(target.classList.values.has("is-live"), false);
  assert.equal(target.classList.values.has("is-offline"), true);
  stop();
  assert.equal(disconnected, true);
  target.textContent = "LIVE";
  publish.textContent = "Publish LIVE";
  callback([]);
  assert.equal(target.classList.values.has("is-live"), false);
  assert.equal(target.classList.values.has("is-offline"), true);
});
