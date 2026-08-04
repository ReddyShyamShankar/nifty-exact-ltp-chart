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

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed)
      ? parsed.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : "—";
  }

  function rupees(value) {
    const formatted = number(value);
    return formatted === "—" ? formatted : `₹${formatted}`;
  }

  function signedRupees(value) {
    if (!Number.isFinite(value)) return "—";
    const sign = value > 0 ? "+" : value < 0 ? "−" : "";
    return `${sign}₹${number(Math.abs(value))}`;
  }

  function expiryLabel(value) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime())) return "NO EXPIRY";
    const month = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][date.getUTCMonth()];
    return `${month} ${String(date.getUTCDate()).padStart(2, "0")}`;
  }

  function strategyKind(strategy, legs) {
    if (legs.length === 1) {
      return `${legs[0].direction === "SELL" ? "SHORT" : "LONG"} ${legs[0].optionType}`;
    }
    const types = legs.map((leg) => leg.optionType);
    const directions = legs.map((leg) => leg.direction);
    if (legs.length === 4 && types.filter((type) => type === "CALL").length === 2
      && types.filter((type) => type === "PUT").length === 2
      && directions.filter((direction) => direction === "BUY").length === 2
      && directions.filter((direction) => direction === "SELL").length === 2) return "IRON CONDOR";
    return strategy.label;
  }

  function breakEvenLabel(view) {
    const values = [view?.currentRisk?.lower, view?.currentRisk?.upper]
      .filter((value) => typeof value === "string" && value && value !== "—");
    return values.length ? values.join(" / ") : "—";
  }

  function dashboardCard(book, strategy, options = {}) {
    const legs = store.legsForStrategy(book, strategy.id);
    const view = options.acceptedViewsByStrategy?.[strategy.id] || null;
    const brokerPnl = legs.length && legs.every((leg) => leg.source === "BROKER_POSITION"
      && Number.isFinite(leg.brokerPnl))
      ? signedRupees(legs.reduce((sum, leg) => sum + leg.brokerPnl, 0))
      : "—";
    return {
      id: strategy.id,
      underlying: strategy.underlying,
      title: `${strategyKind(strategy, legs)} · ${expiryLabel(strategy.expiry)}`,
      label: strategy.label,
      status: strategy.status === store.ACTIVE ? "OPEN" : strategy.status,
      expanded: strategy.status === store.ACTIVE && strategy.id === options.expandedStrategyId,
      metrics: {
        pnl: view?.livePnl || brokerPnl,
        breakEven: breakEvenLabel(view),
        maxProfit: view?.maxProfit || "—",
        maxLoss: view?.maxLoss || "—"
      },
      legs: legs.map((leg) => ({
        id: leg.id,
        optionType: leg.optionType === "CALL" ? "C" : "P",
        strike: Number(leg.strike).toLocaleString("en-IN"),
        direction: leg.direction,
        lots: leg.lots,
        entry: rupees(leg.premium),
        live: rupees(leg.optionType === "CALL" ? leg.callSnapshot : leg.putSnapshot)
      }))
    };
  }

  function dashboardModel(input, options = {}) {
    const book = store.normalizeBook(input);
    const active = Object.values(book.strategies)
      .filter((strategy) => strategy.status === store.ACTIVE)
      .sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id));
    const groups = [];
    for (const strategy of active) {
      let group = groups.find((item) => item.underlying === strategy.underlying);
      if (!group) {
        group = { underlying: strategy.underlying, count: 0, cards: [] };
        groups.push(group);
      }
      group.cards.push(dashboardCard(book, strategy, options));
      group.count += 1;
    }
    const history = Object.values(book.strategies)
      .filter((strategy) => strategy.status !== store.ACTIVE)
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.sequence - b.sequence)
      .map((strategy) => ({ ...dashboardCard(book, strategy, options), expanded: false }));
    return { groups, history, quarantineCount: book.quarantine.length };
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
    dashboardModel,
    saveChoices,
    commandForSave,
    commandForSplit,
    commandForRestore,
    historyRows
  };
  root.OptionsStrategyPanel = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
