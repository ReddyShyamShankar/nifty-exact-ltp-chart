(function (root) {
  "use strict";

  const store = typeof module !== "undefined" && module.exports
    ? require("./strategy-store.js")
    : root.OptionsStrategyStore;

  const nonEmpty = (value) => typeof value === "string" && Boolean(value.trim());
  const uniqueIds = (value) => [...new Set(Array.isArray(value) ? value.filter(nonEmpty) : [])];

  function versionsFor(book, strategyId) {
    return Object.values(book.versions || {})
      .filter((version) => version.strategyId === strategyId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id));
  }

  function historyRows(input) {
    const book = store.normalizeBook(input);
    return Object.values(book.strategies)
      .filter((strategy) => strategy.status !== store.ACTIVE)
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.sequence - b.sequence)
      .map((strategy) => ({
        id: strategy.id,
        label: strategy.label,
        status: strategy.status,
        reason: strategy.archivedReason,
        expiry: strategy.expiry,
        updatedAt: strategy.updatedAt,
        versionCount: versionsFor(book, strategy.id).length
      }));
  }

  function viewModel(input, activeContext = {}) {
    const book = store.normalizeBook(input);
    const active = store.activeStrategies(book, activeContext.instrumentKey, activeContext.expiry).map((strategy) => ({
      ...strategy,
      legs: store.legsForStrategy(book, strategy.id),
      versions: versionsFor(book, strategy.id)
    }));
    return { active, history: historyRows(book), quarantineCount: book.quarantine.length };
  }

  function saveChoices(input, selectedIds) {
    const book = store.normalizeBook(input);
    const ids = uniqueIds(selectedIds);
    if (ids.length < 2) return [];
    const selected = ids.map((id) => book.strategies[id]).filter((item) => item?.status === store.ACTIVE);
    if (selected.length !== ids.length) return [];
    return [
      { kind: "CREATE_NEW", label: "CREATE NEW STRATEGY" },
      {
        kind: "MERGE_INTO",
        label: "MERGE INTO EXISTING",
        destinations: selected.map((item) => ({ strategyId: item.id, label: item.label }))
      }
    ];
  }

  function commandForSave(input = {}) {
    const selectedIds = uniqueIds(input.selectedIds);
    if (selectedIds.length < 2) throw new Error("Select at least two strategies.");
    const destination = input.destination;
    if (!destination || !["CREATE_NEW", "EXISTING"].includes(destination.mode)) {
      throw new Error("Explicit save destination is required.");
    }
    if (!nonEmpty(input.commandId) || !nonEmpty(input.versionId)) throw new Error("Save command identity is required.");
    if (!nonEmpty(destination.strategyId)
      || (destination.mode === "CREATE_NEW" && !nonEmpty(destination.label))) {
      throw new Error("Save destination identity is invalid.");
    }
    return {
      id: input.commandId,
      type: "MERGE_STRATEGIES",
      sourceStrategyIds: selectedIds,
      destination: { ...destination },
      versionId: input.versionId
    };
  }

  function commandForSplit(input = {}) {
    const legIds = uniqueIds(input.legIds);
    if (!legIds.length) throw new Error("Select at least one leg to split.");
    if (!nonEmpty(input.commandId) || !nonEmpty(input.sourceStrategyId)
      || !nonEmpty(input.sourceVersionId) || !nonEmpty(input.destinationVersionId)) {
      throw new Error("Split command identity is invalid.");
    }
    if (!input.destination || !["CREATE_NEW", "EXISTING"].includes(input.destination.mode)
      || !nonEmpty(input.destination.strategyId)
      || (input.destination.mode === "CREATE_NEW" && !nonEmpty(input.destination.label))) {
      throw new Error("Explicit split destination is required.");
    }
    return {
      id: input.commandId,
      type: "SPLIT_STRATEGY",
      sourceStrategyId: input.sourceStrategyId,
      sourceVersionId: input.sourceVersionId,
      legIds,
      destination: { ...input.destination },
      destinationVersionId: input.destinationVersionId
    };
  }

  function commandForRestore(input = {}) {
    if (!nonEmpty(input.commandId) || !nonEmpty(input.strategyId)
      || !nonEmpty(input.restoreVersionId) || !nonEmpty(input.versionId)) {
      throw new Error("Restore command identity is invalid.");
    }
    return {
      id: input.commandId,
      type: "RESTORE_VERSION",
      strategyId: input.strategyId,
      restoreVersionId: input.restoreVersionId,
      versionId: input.versionId
    };
  }

  const api = {
    viewModel,
    saveChoices,
    commandForSave,
    commandForSplit,
    commandForRestore,
    historyRows
  };
  root.OptionsStrategyPanel = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
