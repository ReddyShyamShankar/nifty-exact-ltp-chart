"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const api = require("./tradingview-live-badge.js");

function badge(text) {
  return { textContent: text, classList: { values: new Set(), add(...v) { v.forEach((x) => this.values.add(x)); }, remove(...v) { v.forEach((x) => this.values.delete(x)); } } };
}

function control(text, badges) {
  return { textContent: text, querySelectorAll() { return badges; } };
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
  const doc = documentWith([control("Publish LIVE", [target])]);
  assert.equal(api.decorate(doc), "live");
  assert.equal(target.textContent, "LIVE");
  assert.deepEqual([...target.classList.values].sort(), ["is-live", "nifty-tv-status-badge"]);
  target.textContent = "OFFLINE";
  assert.equal(api.decorate(doc), "offline");
  assert.deepEqual([...target.classList.values].sort(), ["is-offline", "nifty-tv-status-badge"]);
});

test("install decorates immediately, responds to rerender, and disconnects", () => {
  const target = badge("LIVE");
  const doc = documentWith([control("Publish LIVE", [target])]);
  let callback;
  let disconnected = false;
  class Observer {
    constructor(fn) { callback = fn; }
    observe() {}
    disconnect() { disconnected = true; }
  }
  const stop = api.install(doc, Observer);
  assert.equal(target.classList.values.has("is-live"), true);
  callback([]);
  stop();
  assert.equal(disconnected, true);
});
