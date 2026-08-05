const test = require("node:test");
const assert = require("node:assert/strict");
const interaction = require("./manual-interaction.js");

function harness() {
  const timers = new Map();
  let id = 0;
  const calls = [];
  const controller = interaction.createController({
    delay: 240,
    setTimer(fn) {
      const key = ++id;
      timers.set(key, fn);
      return key;
    },
    clearTimer(key) {
      timers.delete(key);
    },
    onQuick(value) {
      calls.push(["quick", value.strike]);
    },
    onFace(value) {
      calls.push(["face", value.entryId]);
    },
    onEditor(value) {
      calls.push(["editor", value.entryId]);
    },
    onReset() {
      calls.push(["reset"]);
    }
  });
  return {
    controller,
    calls,
    flush() {
      for (const [key, fn] of [...timers]) {
        timers.delete(key);
        fn();
      }
    },
    timers
  };
}

function queuedHarness() {
  const timers = [];
  let id = 0;
  const calls = [];
  const controller = interaction.createController({
    delay: 240,
    setTimer(fn) {
      const key = ++id;
      timers.push({ key, fn });
      return key;
    },
    clearTimer() {},
    onQuick(value) {
      calls.push(["quick", value.strike]);
    },
    onFace(value) {
      calls.push(["face", value.entryId]);
    },
    onEditor(value) {
      calls.push(["editor", value.entryId]);
    },
    onReset() {
      calls.push(["reset"]);
    }
  });
  return {
    controller,
    calls,
    flush() {
      for (const timer of timers.splice(0)) timer.fn();
    }
  };
}

test("double click cancels pending single click", () => {
  const h = harness();
  const context = { strike: 24450, entries: [], liveRow: { strike: 24450 } };
  h.controller.click(context);
  h.controller.doubleClick(context);
  h.flush();
  assert.deepEqual(h.calls, [["editor", null]]);
});

test("double click passes exact face to editor then clears cycle ownership", () => {
  const h = harness();
  const context = { strike: 24450, entries: [{ id: "saved" }] };
  h.controller.click(context);
  h.flush();
  assert.equal(h.controller.activeEntryId(24450), "saved");

  h.controller.doubleClick(context);

  assert.deepEqual(h.calls, [["face", "saved"], ["editor", "saved"]]);
  assert.equal(h.controller.activeEntryId(24450), null);
});

test("neutral double click infers the sole editable manual entry", () => {
  const h = harness();
  const context = {
    strike: 24450,
    optionType: "CALL",
    entries: [
      { id: "manual", source: "MANUAL", optionType: "CALL" },
      { id: "broker", source: "BROKER_POSITION", optionType: "CALL" }
    ]
  };

  h.controller.doubleClick(context);

  assert.deepEqual(h.calls, [["editor", "manual"]]);
});

test("neutral double click never edits the sole manual entry from the opposite side", () => {
  const h = harness();
  h.controller.doubleClick({
    strike: 24450,
    optionType: "PUT",
    entries: [{ id: "saved-call", source: "MANUAL", optionType: "CALL" }]
  });

  assert.deepEqual(h.calls, [["editor", null]]);
});

test("double click ignores already-queued stale single callback", () => {
  const h = queuedHarness();
  const context = { strike: 24450, entries: [], liveRow: { strike: 24450 } };
  h.controller.click(context);
  h.controller.doubleClick(context);
  h.flush();
  assert.deepEqual(h.calls, [["editor", null]]);
});

test("later click ignores earlier already-queued callback", () => {
  const h = queuedHarness();
  const context = { strike: 24450, entries: [{ id: "new" }] };
  h.controller.click(context);
  h.controller.click(context);
  h.flush();
  assert.deepEqual(h.calls, [["face", "new"]]);
});

test("saved entries cycle newest first then live", () => {
  const h = harness();
  const context = { strike: 24450, entries: [{ id: "new" }, { id: "old" }] };
  h.controller.click(context);
  h.flush();
  h.controller.click(context);
  h.flush();
  h.controller.click(context);
  h.flush();
  assert.deepEqual(h.calls, [["face", "new"], ["face", "old"], ["face", null]]);
});

test("outside and escape cancel timer and reset faces", () => {
  const h = harness();
  h.controller.click({ strike: 24450, entries: [] });
  h.controller.outside();
  h.flush();
  assert.deepEqual(h.calls, [["reset"]]);
});

test("Escape and reset clear active face after completed cycles", () => {
  const h = harness();
  const context = { strike: 24450, entries: [{ id: "new" }, { id: "old" }] };

  h.controller.click(context);
  h.flush();
  assert.equal(h.controller.activeEntryId(24450), "new");
  h.controller.escape();
  assert.equal(h.controller.activeEntryId(24450), null);

  h.controller.click(context);
  h.flush();
  assert.equal(h.controller.activeEntryId(24450), "new");
  h.controller.reset();
  assert.equal(h.controller.activeEntryId(24450), null);
  assert.deepEqual(h.calls, [["face", "new"], ["reset"], ["face", "new"], ["reset"]]);
});

test("dispose cancels pending work and clears stored face without redraw callback", () => {
  const h = harness();
  const context = { strike: 24450, entries: [{ id: "new" }] };
  h.controller.click(context);
  h.flush();
  assert.equal(h.controller.activeEntryId(24450), "new");

  h.controller.click(context);
  h.controller.dispose();
  h.flush();

  assert.equal(h.controller.activeEntryId(24450), null);
  assert.deepEqual(h.calls, [["face", "new"]]);
});

test("exact badge opens one owned face and cancels any queued row click", () => {
  const h = queuedHarness();
  const context = { strike: 24450, entries: [{ id: "manual" }, { id: "broker" }] };

  h.controller.click(context);
  assert.equal(h.controller.openFace(context, "broker"), true);
  h.flush();

  assert.equal(h.controller.activeEntryId(24450), "broker");
  assert.deepEqual(h.calls, [["face", "broker"]]);
  assert.equal(h.controller.openFace(context, "missing"), false);
});
