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
  const rawEntries = [{ ...callEntry, lots: 0 }, { ...callEntry, id: "bad", premium: "" }];
  const malformed = { version: 1, plans: { "2026-08-25": { entries: rawEntries } } };
  const normalized = plan.normalizeStore(malformed);
  assert.deepEqual(plan.entriesFor(normalized, "2026-08-25"), []);
  assert.equal(plan.invalidCount(normalized), 2);
  assert.deepEqual(plan.invalidEntries(normalized).map((item) => item.raw), rawEntries);
});

test("valid mutations preserve quarantined raw recovery records", () => {
  const raw = { ...callEntry, id: "recover-me", direction: "HOLD" };
  const quarantined = plan.normalizeStore({
    version: 1,
    plans: { [callEntry.expiry]: { entries: [raw] } }
  });

  const added = plan.upsertEntry(quarantined, callEntry);
  const removed = plan.removeEntry(added, callEntry.expiry, callEntry.id);

  assert.equal(plan.invalidCount(added), 1);
  assert.equal(plan.invalidCount(removed), 1);
  assert.deepEqual(plan.invalidEntries(removed)[0].raw, raw);
});

test("malformed plan containers are quarantined intact through valid mutations", () => {
  const rawPlan = { entries: "not-an-array", recoveryNote: "keep all raw fields" };
  const quarantined = plan.normalizeStore({
    version: 1,
    plans: { [callEntry.expiry]: rawPlan }
  });

  const added = plan.upsertEntry(quarantined, callEntry);

  assert.deepEqual(plan.invalidEntries(added), [{
    planExpiry: callEntry.expiry,
    raw: rawPlan
  }]);
});

test("real ISO dates and timestamps fail closed while opposite snapshot may stay null", () => {
  assert.deepEqual(plan.normalizeEntry({ ...callEntry, putSnapshot: null }), { ...callEntry, putSnapshot: null });
  assert.ok(plan.normalizeEntry({
    ...callEntry,
    createdAt: "2026-07-29T15:30:00+05:30",
    updatedAt: "2026-07-29T10:00:00Z"
  }));
  assert.equal(plan.isIsoDate("2024-02-29"), true);
  assert.equal(plan.isIsoDate("2025-02-29"), false);
  assert.equal(plan.isIsoTimestamp("2026-07-29T10:00:00+14:00"), true);
  assert.equal(plan.isIsoTimestamp("2026-07-29T10:00:00+14:01"), false);

  for (const expiry of ["2026-02-30", "2026-13-01", "2026-00-10", "26-08-25"]) {
    assert.equal(plan.normalizeEntry({ ...callEntry, expiry }), null, expiry);
  }
  for (const timestamp of [
    "not-a-timestamp",
    "2026-02-30T10:00:00.000Z",
    "2026-07-29T24:00:00.000Z",
    "2026-07-29T10:00:00"
  ]) {
    assert.equal(plan.normalizeEntry({ ...callEntry, updatedAt: timestamp }), null, timestamp);
  }
  assert.equal(plan.normalizeEntry({ ...callEntry, callSnapshot: null }), null,
    "selected Call snapshot is required");
});

test("remove deletes only exact id in exact expiry", () => {
  const second = { ...callEntry, id: "entry-2", strike: 24000, optionType: "PUT" };
  const stored = plan.upsertEntry(plan.upsertEntry(plan.emptyStore(), callEntry), second);
  assert.deepEqual(plan.entriesFor(plan.removeEntry(stored, callEntry.expiry, callEntry.id), callEntry.expiry), [second]);
});
