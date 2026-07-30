(function (root) {
  "use strict";

  const STORAGE_KEY = "strategyBook";
  const VERSION = 1;
  const ACTIVE = "ACTIVE";
  const ARCHIVED = "ARCHIVED";
  const EXPIRED = "EXPIRED";
  const STATUSES = new Set([ACTIVE, ARCHIVED, EXPIRED]);
  const OPERATIONS = new Set([
    "CREATE", "ADD", "EDIT", "REMOVE", "MERGE", "SPLIT", "RESTORE", "MIGRATE_LEGACY_PLAN"
  ]);

  const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
  const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const nonEmpty = (value) => typeof value === "string" && Boolean(value.trim());
  const finite = (value) => typeof value === "number" && Number.isFinite(value) ? value : null;

  function isIsoDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }

  function isIsoTimestamp(value) {
    return typeof value === "string" && Number.isFinite(Date.parse(value)) && /^\d{4}-\d{2}-\d{2}T/.test(value);
  }

  function emptyBook() {
    return {
      version: VERSION,
      nextSequence: 1,
      legs: {},
      strategies: {},
      versions: {},
      quarantine: [],
      appliedCommands: {}
    };
  }

  function normalizeCharge(value) {
    if (!isRecord(value) || !nonEmpty(value.kind)) return null;
    const amount = finite(value.amount);
    if (amount === null || amount < 0) return null;
    return { kind: value.kind.trim().toUpperCase(), amount };
  }

  function normalizeLeg(input) {
    if (!isRecord(input) || !nonEmpty(input.id) || !nonEmpty(input.source)
      || !nonEmpty(input.instrumentKey) || !nonEmpty(input.underlying) || !isIsoDate(input.expiry)
      || !["CALL", "PUT"].includes(input.optionType) || !["BUY", "SELL"].includes(input.direction)
      || finite(input.strike) === null || input.strike <= 0
      || finite(input.lots) === null || !Number.isInteger(input.lots) || input.lots <= 0
      || finite(input.premium) === null || input.premium < 0
      || !isIsoTimestamp(input.createdAt) || !isIsoTimestamp(input.updatedAt)) return null;
    const callSnapshot = input.callSnapshot === null ? null : finite(input.callSnapshot);
    const putSnapshot = input.putSnapshot === null ? null : finite(input.putSnapshot);
    if ((callSnapshot !== null && callSnapshot < 0) || (putSnapshot !== null && putSnapshot < 0)) return null;
    const charges = Array.isArray(input.charges) ? input.charges.map(normalizeCharge) : [];
    if (charges.some((item) => item === null)) return null;
    return {
      id: input.id,
      source: input.source,
      instrumentKey: input.instrumentKey,
      underlying: input.underlying,
      expiry: input.expiry,
      strike: input.strike,
      optionType: input.optionType,
      direction: input.direction,
      lots: input.lots,
      premium: input.premium,
      callSnapshot,
      putSnapshot,
      charges,
      chargesComplete: input.chargesComplete === true,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt
    };
  }

  function normalizeStrategy(input) {
    if (!isRecord(input) || !nonEmpty(input.id) || !nonEmpty(input.label)
      || !nonEmpty(input.instrumentKey) || !nonEmpty(input.underlying) || !isIsoDate(input.expiry)
      || !STATUSES.has(input.status) || !nonEmpty(input.currentVersionId)
      || finite(input.sequence) === null || !Number.isInteger(input.sequence) || input.sequence <= 0
      || !isIsoTimestamp(input.createdAt) || !isIsoTimestamp(input.updatedAt)) return null;
    return {
      id: input.id,
      label: input.label,
      sequence: input.sequence,
      instrumentKey: input.instrumentKey,
      underlying: input.underlying,
      expiry: input.expiry,
      status: input.status,
      currentVersionId: input.currentVersionId,
      archivedReason: nonEmpty(input.archivedReason) ? input.archivedReason : null,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt
    };
  }

  function normalizeVersion(input) {
    if (!isRecord(input) || !nonEmpty(input.id) || !nonEmpty(input.strategyId)
      || !Array.isArray(input.legIds) || input.legIds.some((id) => !nonEmpty(id))
      || !OPERATIONS.has(input.operation) || !isIsoTimestamp(input.createdAt)) return null;
    return {
      id: input.id,
      strategyId: input.strategyId,
      parentVersionId: nonEmpty(input.parentVersionId) ? input.parentVersionId : null,
      legIds: [...new Set(input.legIds)],
      operation: input.operation,
      sourceStrategyIds: Array.isArray(input.sourceStrategyIds)
        ? [...new Set(input.sourceStrategyIds.filter(nonEmpty))]
        : [],
      createdAt: input.createdAt
    };
  }

  function normalizeBook(input) {
    const next = emptyBook();
    if (input === undefined || input === null) return next;
    if (!isRecord(input)) {
      next.quarantine.push({ kind: "BOOK", raw: clone(input) });
      return next;
    }
    if (Array.isArray(input.quarantine)) next.quarantine = clone(input.quarantine);
    for (const [id, raw] of Object.entries(isRecord(input.legs) ? input.legs : {})) {
      const item = normalizeLeg(raw);
      if (item && item.id === id) next.legs[id] = item;
      else next.quarantine.push({ kind: "LEG", id, raw: clone(raw) });
    }
    for (const [id, raw] of Object.entries(isRecord(input.versions) ? input.versions : {})) {
      const item = normalizeVersion(raw);
      if (item && item.id === id) next.versions[id] = item;
      else next.quarantine.push({ kind: "VERSION", id, raw: clone(raw) });
    }
    for (const [id, raw] of Object.entries(isRecord(input.strategies) ? input.strategies : {})) {
      const item = normalizeStrategy(raw);
      if (item && item.id === id && next.versions[item.currentVersionId]?.strategyId === id) next.strategies[id] = item;
      else next.quarantine.push({ kind: "STRATEGY", id, raw: clone(raw) });
    }
    if (isRecord(input.appliedCommands)) {
      for (const [id, at] of Object.entries(input.appliedCommands)) {
        if (nonEmpty(id) && isIsoTimestamp(at)) next.appliedCommands[id] = at;
      }
    }
    const highest = Object.values(next.strategies).reduce((max, item) => Math.max(max, item.sequence), 0);
    next.nextSequence = Math.max(
      Number.isInteger(input.nextSequence) && input.nextSequence > 0 ? input.nextSequence : 1,
      highest + 1
    );
    return next;
  }

  function strategyById(book, id) {
    return normalizeBook(book).strategies[id] || null;
  }

  function activeStrategies(book, instrumentKey, expiry) {
    return Object.values(normalizeBook(book).strategies)
      .filter((item) => item.status === ACTIVE
        && (instrumentKey === undefined || item.instrumentKey === instrumentKey)
        && (expiry === undefined || item.expiry === expiry))
      .sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id));
  }

  function legsForStrategy(book, strategyId, versionId) {
    const normalized = normalizeBook(book);
    const strategy = normalized.strategies[strategyId];
    if (!strategy) return [];
    const version = normalized.versions[versionId || strategy.currentVersionId];
    if (!version || version.strategyId !== strategyId) return [];
    return version.legIds.map((id) => normalized.legs[id]).filter(Boolean);
  }

  function requireStrategy(book, id, { active = true } = {}) {
    const strategy = book.strategies[id];
    if (!strategy || (active && strategy.status !== ACTIVE)) throw new Error("Active strategy not found.");
    return strategy;
  }

  function requireCompatible(strategy, legOrStrategy) {
    if (strategy.instrumentKey !== legOrStrategy.instrumentKey || strategy.expiry !== legOrStrategy.expiry) {
      throw new Error("Strategy instrument or expiry mismatch.");
    }
  }

  function currentVersion(book, strategy) {
    const version = book.versions[strategy.currentVersionId];
    if (!version) throw new Error("Current strategy version unavailable.");
    return version;
  }

  function createVersion(book, strategy, id, operation, legIds, now, sourceStrategyIds = []) {
    if (!nonEmpty(id) || book.versions[id]) throw new Error("Strategy version ID already exists or is invalid.");
    book.versions[id] = {
      id,
      strategyId: strategy.id,
      parentVersionId: strategy.currentVersionId || null,
      legIds: [...new Set(legIds)],
      operation,
      sourceStrategyIds: [...new Set(sourceStrategyIds)],
      createdAt: now
    };
    strategy.currentVersionId = id;
    strategy.updatedAt = now;
  }

  function createStrategy(book, command, now, { operation = "CREATE", legIds = [], sourceStrategyIds = [] } = {}) {
    if (!nonEmpty(command.strategyId) || book.strategies[command.strategyId]) throw new Error("Strategy ID already exists or is invalid.");
    if (!nonEmpty(command.instrumentKey) || !nonEmpty(command.underlying) || !isIsoDate(command.expiry)) {
      throw new Error("Strategy identity is invalid.");
    }
    const sequence = book.nextSequence;
    const strategy = {
      id: command.strategyId,
      label: nonEmpty(command.label) ? command.label : `T${sequence}`,
      sequence,
      instrumentKey: command.instrumentKey,
      underlying: command.underlying,
      expiry: command.expiry,
      status: ACTIVE,
      currentVersionId: "",
      archivedReason: null,
      createdAt: now,
      updatedAt: now
    };
    book.nextSequence += 1;
    book.strategies[strategy.id] = strategy;
    createVersion(book, strategy, command.versionId, operation, legIds, now, sourceStrategyIds);
    return strategy;
  }

  function activeOwnership(book) {
    const owners = new Map();
    for (const strategy of Object.values(book.strategies)) {
      if (strategy.status !== ACTIVE) continue;
      for (const legId of currentVersion(book, strategy).legIds) {
        if (owners.has(legId) && owners.get(legId) !== strategy.id) {
          throw new Error(`Leg ${legId} already belongs to active strategy ${owners.get(legId)}.`);
        }
        owners.set(legId, strategy.id);
      }
    }
    return owners;
  }

  function commandCreate(book, command, now) {
    createStrategy(book, command, now);
  }

  function commandAdd(book, command, now) {
    const strategy = requireStrategy(book, command.strategyId);
    const item = normalizeLeg(command.leg);
    if (!item) throw new Error("Strategy leg is invalid.");
    requireCompatible(strategy, item);
    const owner = activeOwnership(book).get(item.id);
    if (owner && owner !== strategy.id) throw new Error(`Leg ${item.id} already belongs to active strategy ${owner}.`);
    if (book.legs[item.id] && !currentVersion(book, strategy).legIds.includes(item.id)) {
      throw new Error("Leg identity already exists.");
    }
    book.legs[item.id] = item;
    createVersion(book, strategy, command.versionId, "ADD", [...currentVersion(book, strategy).legIds, item.id], now);
  }

  function commandEdit(book, command, now) {
    const strategy = requireStrategy(book, command.strategyId);
    const prior = currentVersion(book, strategy);
    if (!prior.legIds.includes(command.legId)) throw new Error("Strategy leg not found.");
    const replacement = normalizeLeg(command.replacementLeg);
    if (!replacement || replacement.id === command.legId || book.legs[replacement.id]) {
      throw new Error("Replacement leg must have new valid identity.");
    }
    requireCompatible(strategy, replacement);
    book.legs[replacement.id] = replacement;
    createVersion(book, strategy, command.versionId, "EDIT",
      prior.legIds.map((id) => id === command.legId ? replacement.id : id), now);
  }

  function commandRemove(book, command, now) {
    const strategy = requireStrategy(book, command.strategyId);
    const prior = currentVersion(book, strategy);
    if (!prior.legIds.includes(command.legId)) throw new Error("Strategy leg not found.");
    createVersion(book, strategy, command.versionId, "REMOVE", prior.legIds.filter((id) => id !== command.legId), now);
  }

  function commandMerge(book, command, now) {
    const sourceIds = [...new Set(command.sourceStrategyIds || [])];
    if (sourceIds.length < 2) throw new Error("Select at least two strategies to merge.");
    const sources = sourceIds.map((id) => requireStrategy(book, id));
    sources.slice(1).forEach((item) => requireCompatible(sources[0], item));
    const legIds = [...new Set(sources.flatMap((item) => currentVersion(book, item).legIds))];
    let destination;
    if (command.destination?.mode === "CREATE_NEW") {
      destination = createStrategy(book, {
        strategyId: command.destination.strategyId,
        versionId: command.versionId,
        label: command.destination.label,
        instrumentKey: sources[0].instrumentKey,
        underlying: sources[0].underlying,
        expiry: sources[0].expiry
      }, now, { operation: "MERGE", legIds, sourceStrategyIds: sourceIds });
    } else if (command.destination?.mode === "EXISTING") {
      destination = requireStrategy(book, command.destination.strategyId);
      requireCompatible(sources[0], destination);
      createVersion(book, destination, command.versionId, "MERGE",
        [...new Set([...currentVersion(book, destination).legIds, ...legIds])], now, sourceIds);
    } else {
      throw new Error("Merge destination is required.");
    }
    for (const source of sources) {
      if (source.id === destination.id) continue;
      source.status = ARCHIVED;
      source.archivedReason = `MERGED_INTO:${destination.id}`;
      source.updatedAt = now;
    }
  }

  function commandSplit(book, command, now) {
    const source = requireStrategy(book, command.sourceStrategyId);
    const sourceVersion = currentVersion(book, source);
    const moving = [...new Set(command.legIds || [])];
    if (!moving.length || moving.some((id) => !sourceVersion.legIds.includes(id))) throw new Error("Split legs are invalid.");
    const remaining = sourceVersion.legIds.filter((id) => !moving.includes(id));
    createVersion(book, source, command.sourceVersionId, "SPLIT", remaining, now);
    if (command.destination?.mode === "CREATE_NEW") {
      createStrategy(book, {
        strategyId: command.destination.strategyId,
        versionId: command.destinationVersionId,
        label: command.destination.label,
        instrumentKey: source.instrumentKey,
        underlying: source.underlying,
        expiry: source.expiry
      }, now, { operation: "SPLIT", legIds: moving, sourceStrategyIds: [source.id] });
    } else if (command.destination?.mode === "EXISTING") {
      const destination = requireStrategy(book, command.destination.strategyId);
      requireCompatible(source, destination);
      createVersion(book, destination, command.destinationVersionId, "SPLIT",
        [...currentVersion(book, destination).legIds, ...moving], now, [source.id]);
    } else {
      throw new Error("Split destination is required.");
    }
  }

  function commandRestore(book, command, now) {
    const strategy = requireStrategy(book, command.strategyId);
    const restored = book.versions[command.restoreVersionId];
    if (!restored || restored.strategyId !== strategy.id) throw new Error("Historical version not found.");
    createVersion(book, strategy, command.versionId, "RESTORE", restored.legIds, now);
  }

  function commandArchive(book, command, now) {
    const strategy = requireStrategy(book, command.strategyId);
    strategy.status = ARCHIVED;
    strategy.archivedReason = "USER_ARCHIVED";
    strategy.updatedAt = now;
  }

  function commandExpire(book, command, now) {
    if (!isIsoDate(command.asOfDate)) throw new Error("Expiry comparison date is invalid.");
    for (const strategy of Object.values(book.strategies)) {
      if (strategy.status === ACTIVE && strategy.expiry < command.asOfDate) {
        strategy.status = EXPIRED;
        strategy.archivedReason = "EXPIRY_COMPLETE";
        strategy.updatedAt = now;
      }
    }
  }

  const COMMANDS = {
    CREATE_STRATEGY: commandCreate,
    ADD_LEG: commandAdd,
    EDIT_LEG: commandEdit,
    REMOVE_LEG: commandRemove,
    MERGE_STRATEGIES: commandMerge,
    SPLIT_STRATEGY: commandSplit,
    RESTORE_VERSION: commandRestore,
    ARCHIVE_STRATEGY: commandArchive,
    EXPIRE_DUE: commandExpire
  };

  function applyCommand(input, command, now = new Date().toISOString()) {
    const book = normalizeBook(input);
    if (!isRecord(command) || !nonEmpty(command.id) || !nonEmpty(command.type) || !isIsoTimestamp(now)) {
      throw new Error("Strategy command is invalid.");
    }
    if (book.appliedCommands[command.id]) return book;
    const handler = COMMANDS[command.type];
    if (!handler) throw new Error("Strategy command type is unsupported.");
    const next = clone(book);
    handler(next, command, now);
    activeOwnership(next);
    next.appliedCommands[command.id] = now;
    return normalizeBook(next);
  }

  function migrateManualPlans(input, manualPlans, options = {}) {
    const book = normalizeBook(input);
    const instrumentKey = options.instrumentKey;
    const underlying = options.underlying;
    const now = options.at;
    const commandId = `migration:manualPlans:v1:${instrumentKey || ""}`;
    if (book.appliedCommands[commandId]) return book;
    if (!nonEmpty(instrumentKey) || !nonEmpty(underlying) || !isIsoTimestamp(now)) {
      throw new Error("Legacy migration identity is invalid.");
    }
    const next = clone(book);
    const plans = isRecord(manualPlans?.plans) ? manualPlans.plans : {};
    for (const expiry of Object.keys(plans).sort()) {
      if (!isIsoDate(expiry) || !Array.isArray(plans[expiry]?.entries) || !plans[expiry].entries.length) continue;
      const strategyId = `legacy:${instrumentKey}:${expiry}`;
      if (next.strategies[strategyId]) continue;
      const legIds = [];
      for (const raw of plans[expiry].entries) {
        const item = normalizeLeg({
          ...raw,
          source: "MANUAL",
          instrumentKey,
          underlying,
          charges: [],
          chargesComplete: false
        });
        if (!item || item.expiry !== expiry || next.legs[item.id]) {
          next.quarantine.push({ kind: "LEGACY_LEG", expiry, raw: clone(raw) });
          continue;
        }
        next.legs[item.id] = item;
        legIds.push(item.id);
      }
      if (!legIds.length) continue;
      createStrategy(next, {
        strategyId,
        versionId: `${strategyId}:v1`,
        label: `T${next.nextSequence}`,
        instrumentKey,
        underlying,
        expiry
      }, now, { operation: "MIGRATE_LEGACY_PLAN", legIds });
    }
    activeOwnership(next);
    next.appliedCommands[commandId] = now;
    return normalizeBook(next);
  }

  const api = {
    STORAGE_KEY,
    ACTIVE,
    ARCHIVED,
    EXPIRED,
    emptyBook,
    normalizeLeg,
    normalizeBook,
    activeStrategies,
    strategyById,
    legsForStrategy,
    applyCommand,
    migrateManualPlans
  };
  root.OptionsStrategyStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
