const test = require("node:test");
const assert = require("node:assert/strict");
const plan = require("./manual-plan.js");

const callEntry = {
  id: "entry-1", underlying: "NIFTY", expiry: "2026-08-25",
  strike: 24100, optionType: "CALL", direction: "SELL", lots: 2,
  premium: 358, callSnapshot: 358, putSnapshot: 315.45,
  createdAt: "2026-07-29T10:00:00.000Z", updatedAt: "2026-07-29T10:00:00.000Z"
};

test("upsert keeps old store immutable and groups exact strikes", () => {
  const before = plan.emptyStore();
  const after = plan.upsertEntry(before, callEntry);
  assert.deepEqual(plan.entriesFor(before, "2026-08-25"), []);
  assert.deepEqual(plan.entriesFor(after, "2026-08-25"), [callEntry]);
  assert.deepEqual([...plan.groupByStrike(plan.entriesFor(after, "2026-08-25"))], [[24100, [callEntry]]]);
});

test("same id updates exact entry and preserves createdAt", () => {
  const stored = plan.upsertEntry(plan.emptyStore(), callEntry);
  const changed = plan.upsertEntry(stored, { ...callEntry, lots: 3, updatedAt: "2026-07-29T10:05:00.000Z" });
  assert.equal(plan.entriesFor(changed, callEntry.expiry)[0].lots, 3);
  assert.equal(plan.entriesFor(changed, callEntry.expiry)[0].createdAt, callEntry.createdAt);
});

test("invalid entries are excluded without guessing values", () => {
  const malformed = { version: 1, plans: { "2026-08-25": { entries: [{ ...callEntry, lots: 0 }, { ...callEntry, id: "bad", premium: "" }] } } };
  assert.deepEqual(plan.entriesFor(plan.normalizeStore(malformed), "2026-08-25"), []);
});

test("remove deletes only exact id in exact expiry", () => {
  const second = { ...callEntry, id: "entry-2", strike: 24000, optionType: "PUT" };
  const stored = plan.upsertEntry(plan.upsertEntry(plan.emptyStore(), callEntry), second);
  assert.deepEqual(plan.entriesFor(plan.removeEntry(stored, callEntry.expiry, callEntry.id), callEntry.expiry), [second]);
});
