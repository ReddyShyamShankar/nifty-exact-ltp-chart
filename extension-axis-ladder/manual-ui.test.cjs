"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const ui = require("./manual-ui.js");

const row = { strike: 24450, call: 223.4, put: 409.8 };
const expiry = "2026-08-25";

function fakeDocument() {
  function node(tagName) {
    const listeners = new Map();
    const classes = new Set();
    const attributes = new Map();
    return {
      tagName: tagName.toUpperCase(),
      children: [],
      dataset: {},
      disabled: false,
      textContent: "",
      value: "",
      classList: {
        add(...values) { values.forEach((value) => classes.add(value)); },
        contains(value) { return classes.has(value); },
        remove(...values) { values.forEach((value) => classes.delete(value)); }
      },
      get className() { return [...classes].join(" "); },
      set className(value) {
        classes.clear();
        String(value).split(/\s+/).filter(Boolean).forEach((value) => classes.add(value));
      },
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; },
      setAttribute(name, value) { attributes.set(name, String(value)); },
      getAttribute(name) { return attributes.get(name) || null; },
      addEventListener(type, listener) { listeners.set(type, listener); },
      dispatch(type, event = {}) { listeners.get(type)?.({ preventDefault() {}, target: this, ...event }); }
    };
  }
  return { createElement: node };
}

function actionDraft() {
  return ui.chooseAction(ui.createDraft({ expiry, row }), "CALL", "SELL");
}

test("choosing Call Sell fills Call quote and preserves both snapshots", () => {
  const initial = ui.createDraft({ expiry, row });
  const draft = ui.chooseAction(initial, "CALL", "SELL");
  assert.equal(draft.premium, 223.4);
  assert.equal(draft.callSnapshot, 223.4);
  assert.equal(draft.putSnapshot, 409.8);
  assert.equal(ui.validateDraft(ui.setLots(draft, 2)).ok, true);
  assert.deepEqual(initial, ui.createDraft({ expiry, row }));
});

test("edited traded premium replaces only selected snapshot", () => {
  let draft = actionDraft();
  draft = ui.setPremium(ui.setLots(draft, 2), 358);
  const entry = ui.entryFromDraft(draft, { id: "e1", now: "2026-07-29T10:00:00.000Z" });
  assert.deepEqual([entry.callSnapshot, entry.putSnapshot, entry.premium], [358, 409.8, 358]);
});

test("editing keeps creation time and preview replaces only matching entry", () => {
  const saved = [{ id: "e1", underlying: "NIFTY", expiry, strike: 24450, optionType: "PUT", direction: "BUY", lots: 1,
    premium: 409.8, callSnapshot: 223.4, putSnapshot: 409.8, createdAt: "2026-07-28T10:00:00.000Z", updatedAt: "2026-07-28T10:00:00.000Z" }];
  const draft = ui.setLots(ui.createDraft({ expiry, row, entry: saved[0] }), 3);
  const identity = { id: "e1", now: "2026-07-29T10:00:00.000Z" };
  const entry = ui.entryFromDraft(draft, identity);
  const preview = ui.previewEntries(saved, draft, identity);
  assert.equal(entry.createdAt, "2026-07-28T10:00:00.000Z");
  assert.equal(entry.updatedAt, identity.now);
  assert.deepEqual(preview.map((item) => [item.id, item.lots]), [["e1", 3]]);
  assert.deepEqual(saved.map((item) => [item.id, item.lots]), [["e1", 1]]);
});

test("row model shows one face and exact compact copy", () => {
  const model = ui.rowModel({ liveRow: row, isAtm: false,
    entries: [{ id: "e1", strike: 24450, direction: "SELL", optionType: "CALL", lots: 2, callSnapshot: 358, putSnapshot: 414.6 }], activeEntryId: "e1" });
  assert.deepEqual(model.columns, ["C 358.00 ×2", "P 414.60", "24,450"]);
  assert.equal(model.className, "is-manual-entry is-sell");
  assert.equal(model.count, 1);
  assert.equal(model.visibleFaceCount, 1);
  assert.equal(model.tradedCellIndex, 0);
  assert.equal(model.accessibleName,
    "Sell Call, 2 lots, Call snapshot 358.00, Put snapshot 414.60, strike 24,450, saved entry 1 of 1");
});

test("row model ignores mixed-strike entries for active face and count", () => {
  const entries = [
    { id: "same", strike: 24450, direction: "BUY", optionType: "PUT", lots: 2, callSnapshot: 223.4, putSnapshot: 409.8 },
    { id: "other", strike: 24500, direction: "SELL", optionType: "CALL", lots: 9, callSnapshot: 999, putSnapshot: 1 }
  ];
  const unrelatedActive = ui.rowModel({ liveRow: row, isAtm: false, entries, activeEntryId: "other" });
  const relatedActive = ui.rowModel({ liveRow: row, isAtm: false, entries, activeEntryId: "same" });
  assert.deepEqual(unrelatedActive.columns, ["C 223.40", "P 409.80", "24,450"]);
  assert.equal(unrelatedActive.className, "");
  assert.equal(unrelatedActive.count, 1);
  assert.deepEqual(relatedActive.columns, ["C 223.40", "P 409.80 ×2", "24,450"]);
  assert.equal(relatedActive.count, 1);
});

test("live row remains one black or ATM face while count shows saved entries", () => {
  const model = ui.rowModel({ liveRow: row, isAtm: true, entries: [{ id: "e1", strike: 24450 }], activeEntryId: null });
  assert.deepEqual(model.columns, ["C 223.40", "P 409.80", "24,450"]);
  assert.equal(model.className, "is-atm");
  assert.equal(model.count, 1);
  assert.equal(model.visibleFaceCount, 1);
  assert.equal(model.accessibleName, "Call 223.40, Put 409.80, strike 24,450, 1 saved entry");
});

test("entry accessible name reports exact position in newest-first cycle", () => {
  const entries = [
    { id: "new", strike: 24450, direction: "SELL", optionType: "CALL", lots: 1, callSnapshot: 358, putSnapshot: 414.6 },
    { id: "old", strike: 24450, direction: "BUY", optionType: "PUT", lots: 3, callSnapshot: 223.4, putSnapshot: 409.8 }
  ];
  const model = ui.rowModel({ liveRow: row, isAtm: false, entries, activeEntryId: "old" });
  assert.equal(model.accessibleName,
    "Buy Put, 3 lots, Call snapshot 223.40, Put snapshot 409.80, strike 24,450, saved entry 2 of 2");
});

test("editor model contains two staged menus and no strike or flip icon", () => {
  const model = ui.editorModel(ui.createDraft({ expiry, row }));
  assert.deepEqual(model.typeButtons, ["CALL", "PUT"]);
  assert.deepEqual(model.actions, ["BUY", "SELL"]);
  assert.equal(model.visibleStrike, null);
  assert.equal(model.flipIcon, null);
  assert.equal(model.commitLabel, "ADD");
  assert.equal(model.canRemove, false);
});

test("renderRow replaces children with safe cells and optional count dot", () => {
  const document = fakeDocument();
  const element = document.createElement("div");
  element.append(document.createElement("i"));
  ui.renderRow(document, element, { liveRow: row, isAtm: false, entries: [{ id: "e1", strike: 24450 }], activeEntryId: null });
  assert.equal(element.children.length, 4);
  assert.deepEqual(element.children.slice(0, 3).map((child) => [child.className, child.textContent]), [
    ["nifty-axis-ladder__cell", "C 223.40"],
    ["nifty-axis-ladder__cell", "P 409.80"],
    ["nifty-axis-ladder__cell", "24,450"]
  ]);
  assert.deepEqual([element.children[3].className, element.children[3].textContent], ["nifty-axis-ladder__count", "1"]);
  assert.equal(element.getAttribute("aria-label"), "Call 223.40, Put 409.80, strike 24,450, 1 saved entry");
});

test("renderRow emphasizes only traded snapshot cell without visible trade words", () => {
  const document = fakeDocument();
  const element = document.createElement("div");
  ui.renderRow(document, element, {
    liveRow: row,
    isAtm: false,
    entries: [{ id: "e1", strike: 24450, direction: "SELL", optionType: "PUT", lots: 3, callSnapshot: 223.4, putSnapshot: 409.8 }],
    activeEntryId: "e1"
  });
  assert.deepEqual(element.children.slice(0, 3).map((child) => child.className), [
    "nifty-axis-ladder__cell",
    "nifty-axis-ladder__cell is-traded",
    "nifty-axis-ladder__cell"
  ]);
  assert.deepEqual(element.children.slice(0, 3).map((child) => child.textContent),
    ["C 223.40", "P 409.80 ×3", "24,450"]);
});

test("editor wires staged actions, lot stepper, premium, save, remove, and close", () => {
  const document = fakeDocument();
  const calls = [];
  const editor = ui.renderEditor(document, ui.createDraft({ expiry, row, entry: { id: "e1", lots: 2, optionType: "PUT", direction: "BUY", premium: 409.8, callSnapshot: 223.4, putSnapshot: 409.8 } }), {
    chooseAction: (...args) => calls.push(["action", ...args]),
    setLots: (lots) => calls.push(["lots", lots]),
    setPremium: (premium) => calls.push(["premium", premium]),
    save: () => calls.push(["save"]),
    remove: () => calls.push(["remove"]),
    close: () => calls.push(["close"])
  });
  assert.equal(editor.classList.contains("nifty-manual-editor"), true);
  assert.equal(editor.children.some((child) => child.textContent.includes("24,450")), false);
  assert.equal(editor.children[5].size, 6);
  assert.equal(editor.children[5].getAttribute("aria-label"), "Premium");
  assert.equal(editor.children.map((child) => child.textContent).includes("REMOVE"), true);
  assert.equal(editor.children[8].getAttribute("aria-label"), "Close editor");
  editor.children[0].dispatch("click");
  const menu = editor.children.at(-1);
  assert.deepEqual(menu.children.map((child) => child.textContent), ["BUY", "SELL"]);
  menu.children[1].dispatch("click");
  editor.children[4].dispatch("click");
  editor.children[5].value = "358";
  editor.children[5].dispatch("change");
  editor.children[6].dispatch("click");
  editor.children[7].dispatch("click");
  editor.children[8].dispatch("click");
  assert.deepEqual(calls, [["action", "CALL", "SELL"], ["lots", 3], ["premium", 358], ["save"], ["remove"], ["close"]]);
});
