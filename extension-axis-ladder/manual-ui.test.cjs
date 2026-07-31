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
        remove(...values) { values.forEach((value) => classes.delete(value)); },
        toggle(value, force) {
          const enabled = force === undefined ? !classes.has(value) : Boolean(force);
          if (enabled) classes.add(value); else classes.delete(value);
          return enabled;
        }
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

test("switching an edited Call entry to Put starts a second position instead of overwriting Call", () => {
  const saved = {
    id: "call-entry",
    expiry,
    strike: 24450,
    optionType: "CALL",
    direction: "BUY",
    lots: 2,
    premium: 358,
    callSnapshot: 358,
    putSnapshot: 414.6,
    createdAt: "2026-07-28T10:00:00.000Z"
  };
  const edited = ui.createDraft({ expiry, row, entry: saved });
  const second = ui.chooseAction(edited, "PUT", "SELL");

  assert.equal(second.id, null);
  assert.equal(second.createdAt, null);
  assert.equal(second.optionType, "PUT");
  assert.equal(second.direction, "SELL");
  assert.equal(second.lots, 1);
  assert.equal(second.premium, 409.8);
  assert.equal(second.callSnapshot, 223.4);
  assert.equal(second.putSnapshot, 409.8);
});

test("edited traded premium replaces only selected snapshot", () => {
  let draft = actionDraft();
  draft = ui.setPremium(ui.setLots(draft, 2), 358);
  const entry = ui.entryFromDraft(draft, { id: "e1", now: "2026-07-29T10:00:00.000Z" });
  assert.deepEqual([entry.callSnapshot, entry.putSnapshot, entry.premium], [358, 409.8, 358]);
});

test("editing preserves unavailable opposite snapshot instead of backfilling live quote", () => {
  const saved = {
    id: "e1",
    expiry,
    strike: 24450,
    optionType: "CALL",
    direction: "SELL",
    lots: 2,
    premium: 358,
    callSnapshot: 358,
    putSnapshot: null,
    createdAt: "2026-07-28T10:00:00.000Z"
  };
  const draft = ui.setLots(ui.createDraft({ expiry, row, entry: saved }), 3);
  const entry = ui.entryFromDraft(draft, { id: saved.id, now: "2026-07-29T10:00:00.000Z" });
  const face = ui.rowModel({ liveRow: row, entries: [entry], activeEntryId: entry.id });

  assert.equal(ui.validateDraft(draft).ok, true);
  assert.equal(draft.putSnapshot, null);
  assert.equal(entry.putSnapshot, null);
  assert.deepEqual(face.columns, ["C 358.00 ×3", "P —", "24,450"]);
});

test("draft validation requires only selected snapshot and rejects malformed input matrix", () => {
  const valid = ui.chooseAction(ui.createDraft({
    expiry,
    row: { ...row, put: null }
  }), "CALL", "BUY");
  assert.equal(ui.validateDraft(valid).ok, true, "missing opposite quote remains saveable");

  const invalidCases = [
    ["expiry", { expiry: "2026-02-30" }],
    ["strike", { strike: 0 }],
    ["optionType", { optionType: "WING" }],
    ["direction", { direction: "HOLD" }],
    ["lots zero", { lots: 0 }],
    ["lots fractional", { lots: 1.5 }],
    ["premium negative", { premium: -1 }],
    ["premium malformed", { premium: null }],
    ["selected snapshot", { callSnapshot: null }]
  ];
  for (const [name, change] of invalidCases) {
    assert.equal(ui.validateDraft({ ...valid, ...change }).ok, false, name);
  }
  assert.throws(() => ui.entryFromDraft(valid, {
    id: "e1",
    now: "2026-02-30T10:00:00.000Z"
  }), /identity/);
  assert.equal(ui.entryFromDraft({
    ...valid,
    createdAt: "not-a-timestamp"
  }, {
    id: "e1",
    now: "2026-07-29T10:00:00.000Z"
  }).createdAt, "2026-07-29T10:00:00.000Z");
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

test("row model exposes separate Call and Put lot badges for same-strike positions", () => {
  const entries = [
    { id: "call", strike: 24450, direction: "BUY", optionType: "CALL", lots: 2, callSnapshot: 223.4, putSnapshot: 409.8 },
    { id: "put", strike: 24450, direction: "SELL", optionType: "PUT", lots: 3, callSnapshot: 223.4, putSnapshot: 409.8 }
  ];
  const model = ui.rowModel({ liveRow: row, isAtm: false, entries, activeEntryId: null });

  assert.deepEqual(model.badges, [
    { optionType: "CALL", label: "C2" },
    { optionType: "PUT", label: "P3" }
  ]);
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

test("editor model contains one mutually exclusive four-leg menu", () => {
  const model = ui.editorModel(ui.createDraft({ expiry, row }));
  assert.deepEqual(model.legChoices, [
    { label: "BUY CALL", optionType: "CALL", direction: "BUY" },
    { label: "BUY PUT", optionType: "PUT", direction: "BUY" },
    { label: "SELL CALL", optionType: "CALL", direction: "SELL" },
    { label: "SELL PUT", optionType: "PUT", direction: "SELL" }
  ]);
  assert.equal(model.visibleStrike, null);
  assert.equal(model.flipIcon, null);
  assert.equal(model.commitLabel, "ADD");
  assert.equal(model.canRemove, false);
  assert.equal(model.canCommit, false);
  assert.equal(model.validationLabel, "CHOOSE LEG");
});

test("renderRow replaces children with safe cells and omits badges for incomplete legacy data", () => {
  const document = fakeDocument();
  const element = document.createElement("div");
  element.append(document.createElement("i"));
  ui.renderRow(document, element, { liveRow: row, isAtm: false, entries: [{ id: "e1", strike: 24450 }], activeEntryId: null });
  assert.equal(element.children.length, 3);
  assert.deepEqual(element.children.map((child) => [child.className, child.textContent]), [
    ["nifty-axis-ladder__cell", "C 223.40"],
    ["nifty-axis-ladder__cell", "P 409.80"],
    ["nifty-axis-ladder__cell", "24,450"]
  ]);
  assert.equal(element.getAttribute("aria-label"), "Call 223.40, Put 409.80, strike 24,450, 1 saved entry");
});

test("renderRow places separate lot badges before price cells", () => {
  const document = fakeDocument();
  const element = document.createElement("div");
  ui.renderRow(document, element, {
    liveRow: row,
    isAtm: false,
    entries: [
      { id: "call", strike: 24450, direction: "BUY", optionType: "CALL", lots: 2 },
      { id: "put", strike: 24450, direction: "SELL", optionType: "PUT", lots: 3 }
    ],
    activeEntryId: null
  });

  assert.equal(element.children[0].className, "nifty-axis-ladder__badges");
  assert.deepEqual(element.children[0].children.map((badge) => [badge.dataset.optionType, badge.textContent]), [
    ["CALL", "C2"],
    ["PUT", "P3"]
  ]);
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
  assert.deepEqual(element.children.slice(1, 4).map((child) => child.className), [
    "nifty-axis-ladder__cell",
    "nifty-axis-ladder__cell is-traded",
    "nifty-axis-ladder__cell"
  ]);
  assert.deepEqual(element.children.slice(1, 4).map((child) => child.textContent),
    ["C 223.40", "P 409.80 ×3", "24,450"]);
});

test("editor wires one four-leg menu, lot stepper, premium, save, remove, and close", () => {
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
  assert.equal(editor.children[4].size, 6);
  assert.equal(editor.children[4].getAttribute("aria-label"), "Premium");
  assert.equal(editor.children[5].disabled, false);
  assert.equal(editor.children.map((child) => child.textContent).includes("REMOVE"), true);
  assert.equal(editor.children[7].getAttribute("aria-label"), "Close editor");
  assert.equal(editor.children[8].className, "nifty-manual-editor__validation");
  editor.children[0].dispatch("click");
  const menu = editor.children.at(-1);
  assert.deepEqual(menu.children.map((child) => child.textContent), [
    "BUY CALL", "BUY PUT", "SELL CALL", "SELL PUT"
  ]);
  assert.deepEqual(menu.children.map((child) => child.getAttribute("aria-pressed")), [
    "false", "true", "false", "false"
  ]);
  menu.children[2].dispatch("click");
  editor.children[3].dispatch("click");
  editor.children[4].value = "358";
  editor.children[4].dispatch("input");
  editor.children[5].dispatch("click");
  editor.children[6].dispatch("click");
  editor.children[7].dispatch("click");
  assert.deepEqual(calls, [["action", "CALL", "SELL"], ["lots", 3], ["premium", 358], ["save"], ["remove"], ["close"]]);
});

test("editor exposes selected side and direction while invalid commit stays disabled", () => {
  const document = fakeDocument();
  const blank = ui.renderEditor(document, ui.createDraft({ expiry, row }));
  assert.equal(blank.children[0].getAttribute("aria-pressed"), "false");
  assert.equal(blank.children[0].textContent, "CHOOSE LEG ▾");
  assert.equal(blank.children[5].disabled, true);
  assert.equal(blank.children.at(-1).textContent, "CHOOSE LEG");

  const selected = ui.renderEditor(document, actionDraft());
  assert.equal(selected.children[0].textContent, "SELL CALL ▾");
  assert.equal(selected.children[0].getAttribute("aria-pressed"), "true");
  assert.equal(selected.children[0].classList.contains("is-selected"), true);
  assert.equal(selected.children[5].disabled, false);
  assert.equal(selected.children.at(-1).textContent, "");

  selected.children[0].dispatch("click");
  const menu = selected.children.at(-1);
  assert.deepEqual(menu.children.map((child) => child.getAttribute("aria-pressed")), [
    "false", "false", "true", "false"
  ]);
  assert.equal(menu.children[2].classList.contains("is-selected"), true);
});
