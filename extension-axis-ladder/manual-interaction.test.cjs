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
