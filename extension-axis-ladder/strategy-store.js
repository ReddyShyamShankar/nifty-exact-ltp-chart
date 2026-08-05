(function (root) {
  "use strict";

  const STORAGE_KEY = "strategyBook";
  const VERSION = 1;
  const ACTIVE = "ACTIVE";
  const ARCHIVED = "ARCHIVED";
  const EXPIRED = "EXPIRED";
  const LEGACY_NIFTY_LOT_SIZE = 65;
  const STATUSES = new Set([ACTIVE, ARCHIVED, EXPIRED]);
  const OPERATIONS = new Set([
    "CREATE", "ADD", "EDIT", "REMOVE", "MERGE", "SPLIT", "RESTORE", "MIGRATE_LEGACY_PLAN",
    "SYNC_BROKER", "RECONCILE_MANUAL_PLAN"
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
    const usesLegacyNiftyLotSize = isRecord(input) && input.lotSize === undefined
      && input.underlying === "NIFTY"
      && ["MANUAL", "BROKER_POSITION"].includes(input.source);
    const lotSize = usesLegacyNiftyLotSize
      ? LEGACY_NIFTY_LOT_SIZE
      : finite(input?.lotSize);
    if (!isRecord(input) || !nonEmpty(input.id) || !nonEmpty(input.source)
      || !nonEmpty(input.instrumentKey) || !nonEmpty(input.underlying) || !isIsoDate(input.expiry)
      || !["CALL", "PUT"].includes(input.optionType) || !["BUY", "SELL"].includes(input.direction)
      || finite(input.strike) === null || input.strike <= 0
      || finite(input.lots) === null || !Number.isInteger(input.lots) || input.lots <= 0
      || lotSize === null || !Number.isInteger(lotSize) || lotSize <= 0
      || finite(input.premium) === null || input.premium < 0
      || !isIsoTimestamp(input.createdAt) || !isIsoTimestamp(input.updatedAt)) return null;
    const callSnapshot = input.callSnapshot === null ? null : finite(input.callSnapshot);
    const putSnapshot = input.putSnapshot === null ? null : finite(input.putSnapshot);
    const brokerPnl = input.brokerPnl === undefined || input.brokerPnl === null ? null : finite(input.brokerPnl);
    if ((callSnapshot !== null && callSnapshot < 0) || (putSnapshot !== null && putSnapshot < 0)
      || (input.brokerPnl !== undefined && input.brokerPnl !== null && brokerPnl === null)) return null;
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
      lotSize,
      premium: input.premium,
      callSnapshot,
      putSnapshot,
      brokerPnl,
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

  function isBrokerStrategy(book, strategy) {
    if (strategy.id.startsWith("broker:")) return true;
    const version = book.versions[strategy.currentVersionId];
    if (version?.operation === "SYNC_BROKER") return true;
    return Boolean(version?.legIds.length)
      && version.legIds.every((id) => book.legs[id]?.source === "BROKER_POSITION");
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
    const highestManual = Object.values(next.strategies)
      .filter((item) => !isBrokerStrategy(next, item))
      .reduce((max, item) => Math.max(max, item.sequence), 0);
    next.nextSequence = highestManual + 1;
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

  function contextKey(instrumentKey, expiry) {
    if (!nonEmpty(instrumentKey) || !isIsoDate(expiry)) return "";
    return JSON.stringify([instrumentKey, expiry]);
  }

  function resolveLastSelected(book, pointers, instrumentKey, expiry) {
    const active = activeStrategies(book, instrumentKey, expiry);
    if (!active.length) return null;
    const wanted = isRecord(pointers) ? pointers[contextKey(instrumentKey, expiry)] : "";
    return active.find((item) => item.id === wanted) || active[0];
  }

  function legsForStrategy(book, strategyId, versionId) {
    const normalized = normalizeBook(book);
    const strategy = normalized.strategies[strategyId];
    if (!strategy) return [];
    const version = normalized.versions[versionId || strategy.currentVersionId];
    if (!version || version.strategyId !== strategyId) return [];
    return version.legIds.map((id) => normalized.legs[id]).filter(Boolean);
  }

  function activeStrategyForLeg(book, legId) {
    if (!nonEmpty(legId)) return null;
    const normalized = normalizeBook(book);
    const owners = Object.values(normalized.strategies).filter((strategy) => {
      if (strategy.status !== ACTIVE) return false;
      const version = normalized.versions[strategy.currentVersionId];
      return version?.strategyId === strategy.id && version.legIds.includes(legId);
    });
    if (owners.length > 1) throw new Error(`Leg ${legId} belongs to multiple active strategies.`);
    return owners[0] || null;
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

  function createStrategy(book, command, now, {
    operation = "CREATE", legIds = [], sourceStrategyIds = [], consumeSequence = true
  } = {}) {
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
    if (consumeSequence) book.nextSequence += 1;
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

  function brokerPositionLeg(position, command, now) {
    if (!isRecord(position) || !nonEmpty(position.contractId) || !nonEmpty(position.tradingsymbol)
      || !nonEmpty(position.exchange) || position.underlying !== command.underlying
      || position.expiry !== command.expiry || finite(position.strike) === null || position.strike <= 0
      || !["CE", "PE"].includes(position.optionType)
      || !Number.isInteger(position.signedQuantity) || position.signedQuantity === 0
      || !Number.isInteger(position.lotSize) || position.lotSize <= 0
      || position.signedQuantity % position.lotSize !== 0
      || finite(position.averagePrice) === null || position.averagePrice < 0
      || finite(position.lastPrice) === null || position.lastPrice < 0
      || finite(position.pnl) === null) {
      throw new Error("Broker position must have exact identity and whole lots.");
    }
    const contractId = `${position.exchange}:${command.underlying}:${command.expiry}:${position.strike}:${position.optionType}`;
    if (position.contractId !== contractId) throw new Error("Broker position contract identity does not match strategy context.");
    const optionType = position.optionType === "CE" ? "CALL" : "PUT";
    return normalizeLeg({
      id: `broker:${position.contractId}:${command.snapshotId}`,
      source: "BROKER_POSITION",
      instrumentKey: command.instrumentKey,
      underlying: command.underlying,
      expiry: command.expiry,
      strike: position.strike,
      optionType,
      direction: position.signedQuantity > 0 ? "BUY" : "SELL",
      lots: Math.abs(position.signedQuantity / position.lotSize),
      lotSize: position.lotSize,
      premium: position.averagePrice,
      callSnapshot: optionType === "CALL" ? position.lastPrice : null,
      putSnapshot: optionType === "PUT" ? position.lastPrice : null,
      brokerPnl: position.pnl,
      charges: [],
      chargesComplete: false,
      createdAt: now,
      updatedAt: now
    });
  }

  function commandSyncBroker(book, command, now) {
    if (!nonEmpty(command.strategyId) || !nonEmpty(command.versionId) || !nonEmpty(command.snapshotId)
      || !nonEmpty(command.instrumentKey) || !nonEmpty(command.underlying) || !isIsoDate(command.expiry)
      || !Array.isArray(command.positions)) throw new Error("Broker strategy snapshot is invalid.");
    const existing = book.strategies[command.strategyId] || null;
    if (existing) requireCompatible(existing, command);
    if (!command.positions.length) {
      if (existing?.status === ACTIVE) {
        existing.status = ARCHIVED;
        existing.archivedReason = "BROKER_FLAT";
        existing.updatedAt = now;
      }
      return;
    }
    const seen = new Set();
    const legs = command.positions.map((position) => {
      const item = brokerPositionLeg(position, command, now);
      if (!item || seen.has(item.id) || book.legs[item.id]) throw new Error("Broker snapshot contains duplicate position identity.");
      seen.add(item.id);
      return item;
    });
    for (const item of legs) book.legs[item.id] = item;
    if (!existing) {
      createStrategy(book, command, now, {
        operation: "SYNC_BROKER",
        legIds: legs.map((item) => item.id),
        consumeSequence: false
      });
      return;
    }
    if (existing.status === EXPIRED) throw new Error("Expired broker strategy cannot be reopened.");
    existing.status = ACTIVE;
    existing.archivedReason = null;
    createVersion(book, existing, command.versionId, "SYNC_BROKER", legs.map((item) => item.id), now);
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
    EXPIRE_DUE: commandExpire,
    SYNC_BROKER_POSITIONS: commandSyncBroker
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

  function applyCommands(input, commands, now = new Date().toISOString()) {
    if (!Array.isArray(commands) || !commands.length) throw new Error("Strategy command batch is invalid.");
    return commands.reduce((book, command) => applyCommand(book, command, now), normalizeBook(input));
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

  const MANUAL_PLAN_FIELDS = [
    "id", "underlying", "expiry", "strike", "optionType", "direction", "lots", "lotSize", "premium",
    "callSnapshot", "putSnapshot", "createdAt", "updatedAt"
  ];

  function manualPlanMatchesLeg(planLeg, storedLeg) {
    return MANUAL_PLAN_FIELDS.every((field) => Object.is(planLeg?.[field], storedLeg?.[field]));
  }

  function stableIdentityHash(value) {
    let hash = 0x811c9dc5;
    for (const character of value) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
  }

  function manualPlanLeg(raw, instrumentKey, underlying, id = raw?.id) {
    return normalizeLeg({
      ...raw,
      id,
      source: "MANUAL",
      instrumentKey,
      underlying,
      charges: [],
      chargesComplete: false
    });
  }

  function activeOwnerInBook(book, legId) {
    const owners = Object.values(book.strategies).filter((strategy) => strategy.status === ACTIVE
      && book.versions[strategy.currentVersionId]?.legIds.includes(legId));
    if (owners.length > 1) throw new Error(`Leg ${legId} belongs to multiple active strategies.`);
    return owners[0] || null;
  }

  function reconciliationIdentity(raw, authoritative) {
    const evidence = MANUAL_PLAN_FIELDS.filter((field) => field !== "id")
      .map((field) => [field, authoritative[field]]);
    return `${raw.id}:reconciled:v2:${stableIdentityHash(JSON.stringify(evidence))}`;
  }

  function reconcileManualPlans(input, manualPlans, options = {}) {
    const instrumentKey = options.instrumentKey;
    const underlying = options.underlying;
    const now = options.at;
    if (!nonEmpty(instrumentKey) || !nonEmpty(underlying) || !isIsoTimestamp(now)) {
      throw new Error("Legacy reconciliation identity is invalid.");
    }
    let next = normalizeBook(input);
    const replacements = [];
    const removedEntryIds = [];
    const rehydratedEntries = [];
    const plans = isRecord(manualPlans?.plans) ? manualPlans.plans : {};
    const activePlanIds = new Set();
    const entries = Object.keys(plans).sort().flatMap((expiry) => {
      if (!isIsoDate(expiry) || !Array.isArray(plans[expiry]?.entries)) return [];
      return plans[expiry].entries.map((raw) => ({ expiry, raw }));
    }).sort((a, b) => a.expiry.localeCompare(b.expiry)
      || String(a.raw?.id || "").localeCompare(String(b.raw?.id || "")));

    for (const { expiry, raw } of entries) {
      const authoritative = manualPlanLeg(raw, instrumentKey, underlying);
      if (!authoritative || authoritative.expiry !== expiry) continue;
      const prior = next.legs[authoritative.id];
      if (!prior) {
        next.legs[authoritative.id] = authoritative;
        const legacyId = `legacy:${instrumentKey}:${expiry}`;
        const repairId = `legacy-v2:${instrumentKey}:${expiry}`;
        let strategy = [next.strategies[legacyId], next.strategies[repairId]]
          .find((item) => item?.status === ACTIVE) || null;
        if (!strategy) {
          const strategyId = next.strategies[legacyId] ? repairId : legacyId;
          strategy = createStrategy(next, {
            strategyId,
            versionId: `${strategyId}:manual-plan-v2:${stableIdentityHash(authoritative.id)}`,
            label: `T${next.nextSequence}`,
            instrumentKey,
            underlying,
            expiry
          }, now, { operation: "MIGRATE_LEGACY_PLAN", legIds: [authoritative.id] });
        } else {
          requireCompatible(strategy, authoritative);
          const versionId = `${strategy.id}:manual-plan-v2:${stableIdentityHash(authoritative.id)}`;
          createVersion(next, strategy, versionId, "MIGRATE_LEGACY_PLAN",
            [...currentVersion(next, strategy).legIds, authoritative.id], now);
        }
        activePlanIds.add(authoritative.id);
        continue;
      }
      const owner = activeOwnerInBook(next, prior.id);
      if (prior.source !== "MANUAL") {
        next.quarantine.push({ kind: "MANUAL_PLAN_ID_COLLISION", id: raw.id, raw: clone(raw) });
        continue;
      }
      if (manualPlanMatchesLeg(authoritative, prior)) {
        if (owner) activePlanIds.add(authoritative.id);
        else removedEntryIds.push(authoritative.id);
        continue;
      }
      const replacementId = reconciliationIdentity(raw, authoritative);
      const replacement = manualPlanLeg(raw, instrumentKey, underlying, replacementId);
      const replacementOwner = activeOwnerInBook(next, replacementId);
      if (replacementOwner) {
        if (!manualPlanMatchesLeg(replacement, next.legs[replacementId])) {
          throw new Error("Manual plan reconciliation identity conflicts with stored evidence.");
        }
        replacements.push({ oldId: raw.id, newId: replacementId });
        activePlanIds.add(replacementId);
        continue;
      }
      if (!owner) {
        if (!next.quarantine.some((item) => item?.kind === "MANUAL_PLAN_MISMATCH" && item.id === raw.id)) {
          next.quarantine.push({ kind: "MANUAL_PLAN_MISMATCH", id: raw.id, raw: clone(raw) });
        }
        removedEntryIds.push(raw.id);
        continue;
      }
      requireCompatible(owner, replacement);
      if (next.legs[replacementId]) {
        throw new Error("Manual plan reconciliation identity already exists.");
      }
      next.legs[replacementId] = replacement;
      const priorVersion = currentVersion(next, owner);
      const versionId = `${owner.id}:manual-plan-v2:${stableIdentityHash(`${raw.id}:${replacementId}`)}`;
      createVersion(next, owner, versionId, "RECONCILE_MANUAL_PLAN",
        priorVersion.legIds.map((id) => id === raw.id ? replacementId : id), now);
      replacements.push({ oldId: raw.id, newId: replacementId });
      activePlanIds.add(replacementId);
    }

    activeOwnership(next);
    for (const strategy of Object.values(next.strategies)) {
      if (strategy.status !== ACTIVE || strategy.instrumentKey !== instrumentKey
        || strategy.underlying !== underlying || isBrokerStrategy(next, strategy)) continue;
      const version = currentVersion(next, strategy);
      if (version.legIds.length || !["CREATE", "MIGRATE_LEGACY_PLAN"].includes(version.operation)) continue;
      strategy.status = ARCHIVED;
      strategy.archivedReason = "EMPTY_MANUAL_RECOVERY";
      strategy.updatedAt = now;
    }
    for (const strategy of Object.values(next.strategies)) {
      if (strategy.status !== ACTIVE || strategy.instrumentKey !== instrumentKey
        || strategy.underlying !== underlying) continue;
      for (const legId of currentVersion(next, strategy).legIds) {
        const leg = next.legs[legId];
        if (leg?.source !== "MANUAL" || activePlanIds.has(legId)) continue;
        rehydratedEntries.push(clone(leg));
        activePlanIds.add(legId);
      }
    }
    const commandId = `migration:manualPlans:v2:${instrumentKey}`;
    if (!next.appliedCommands[commandId]) next.appliedCommands[commandId] = now;
    return {
      strategyBook: normalizeBook(next),
      replacements,
      removedEntryIds: [...new Set(removedEntryIds)],
      rehydratedEntries
    };
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
    activeStrategyForLeg,
    contextKey,
    resolveLastSelected,
    strategyById,
    legsForStrategy,
    applyCommand,
    applyCommands,
    migrateManualPlans,
    reconcileManualPlans
  };
  root.OptionsStrategyStore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
