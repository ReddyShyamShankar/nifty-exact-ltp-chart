const test = require("node:test");
const assert = require("node:assert/strict");
const store = require("./strategy-store.js");
const panel = require("./strategy-panel.js");

const NOW = "2026-07-31T10:00:00.000Z";

function create(id, label, expiry = "2026-08-25") {
  return {
    id: `create-${id}`,
    type: "CREATE_STRATEGY",
    strategyId: id,
    versionId: `${id}-v1`,
    label,
    instrumentKey: "NSE_DLY:NIFTY",
    underlying: "NIFTY",
    expiry
  };
}

function book() {
  let value = store.emptyBook();
  value = store.applyCommand(value, create("s1", "T1"), NOW);
  value = store.applyCommand(value, create("s2", "T2"), NOW);
  return value;
}

test("save always requires create-new or explicit destination", () => {
  assert.deepEqual(panel.saveChoices(book(), ["s1", "s2"]).map((item) => item.kind), ["CREATE_NEW", "MERGE_INTO"]);
  assert.throws(() => panel.commandForSave({ selectedIds: ["s1", "s2"] }), /destination/i);
});

test("save builder creates explicit new or existing merge command", () => {
  assert.deepEqual(panel.commandForSave({
    commandId: "merge-command",
    versionId: "s3-v1",
    selectedIds: ["s1", "s2"],
    destination: { mode: "CREATE_NEW", strategyId: "s3", label: "T3" }
  }), {
    id: "merge-command",
    type: "MERGE_STRATEGIES",
    sourceStrategyIds: ["s1", "s2"],
    destination: { mode: "CREATE_NEW", strategyId: "s3", label: "T3" },
    versionId: "s3-v1"
  });
  assert.equal(panel.commandForSave({
    commandId: "merge-existing", versionId: "s1-v2", selectedIds: ["s1", "s2"],
    destination: { mode: "EXISTING", strategyId: "s1" }
  }).destination.mode, "EXISTING");
});

test("split and restore builders require explicit immutable identities", () => {
  assert.deepEqual(panel.commandForSplit({
    commandId: "split", sourceStrategyId: "s1", sourceVersionId: "s1-v2",
    legIds: ["leg-1"], destination: { mode: "CREATE_NEW", strategyId: "s3", label: "T3" },
    destinationVersionId: "s3-v1"
  }), {
    id: "split", type: "SPLIT_STRATEGY", sourceStrategyId: "s1", sourceVersionId: "s1-v2",
    legIds: ["leg-1"], destination: { mode: "CREATE_NEW", strategyId: "s3", label: "T3" },
    destinationVersionId: "s3-v1"
  });
  assert.deepEqual(panel.commandForRestore({
    commandId: "restore", strategyId: "s1", restoreVersionId: "s1-v1", versionId: "s1-v3"
  }), {
    id: "restore", type: "RESTORE_VERSION", strategyId: "s1",
    restoreVersionId: "s1-v1", versionId: "s1-v3"
  });
  assert.throws(() => panel.commandForSplit({ sourceStrategyId: "s1", legIds: [] }), /leg/i);
});

test("history includes merged-source and expired strategies", () => {
  let value = book();
  value = store.applyCommand(value, {
    id: "merge", type: "MERGE_STRATEGIES", sourceStrategyIds: ["s1", "s2"],
    destination: { mode: "CREATE_NEW", strategyId: "s3", label: "T3" }, versionId: "s3-v1"
  }, NOW);
  value = store.applyCommand(value, create("old", "T4", "2026-07-30"), NOW);
  value = store.applyCommand(value, { id: "expire", type: "EXPIRE_DUE", asOfDate: "2026-07-31" }, NOW);
  assert.deepEqual(panel.historyRows(value).map((item) => item.status).sort(), ["ARCHIVED", "ARCHIVED", "EXPIRED"]);
});

test("view model exposes active versions and history without mutating book", () => {
  const value = book();
  const before = structuredClone(value);
  const result = panel.viewModel(value, { instrumentKey: "NSE_DLY:NIFTY", expiry: "2026-08-25" });
  assert.deepEqual(result.active.map((item) => item.label), ["T1", "T2"]);
  assert.equal(result.active[0].versions.length, 1);
  assert.deepEqual(result.history, []);
  assert.deepEqual(value, before);
});
