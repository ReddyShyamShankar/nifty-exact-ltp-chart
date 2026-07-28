(function (root) {
  "use strict";

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function exactIsoDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function exactTimestamp(value) {
    return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
  }

  function canonicalContractId(expiry, strike, optionType) {
    if (!exactIsoDate(expiry) || !Number.isInteger(strike) || strike <= 0 ||
      (optionType !== "CE" && optionType !== "PE")) return null;
    return `NFO:NIFTY:${expiry}:${strike}:${optionType}`;
  }

  function isCanonicalContractId(value) {
    if (typeof value !== "string") return false;
    const match = value.match(/^NFO:NIFTY:(\d{4}-\d{2}-\d{2}):([1-9]\d*):(CE|PE)$/);
    return Boolean(match && canonicalContractId(match[1], Number(match[2]), match[3]) === value);
  }

  const MONTHS = {
    JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
    JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12"
  };
  const WEEKLY_MONTHS = { 1: "01", 2: "02", 3: "03", 4: "04", 5: "05", 6: "06", 7: "07", 8: "08", 9: "09", O: "10", N: "11", D: "12" };

  function optionIdentity(symbol, expiry) {
    const value = typeof symbol === "string" ? symbol.trim().toUpperCase() : "";
    if (!exactIsoDate(expiry)) return null;
    const monthly = value.match(/^NIFTY(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)([1-9]\d{3,5})(CE|PE)$/);
    const weekly = value.match(/^NIFTY(\d{2})([1-9OND])(\d{2})([1-9]\d{3,5})(CE|PE)$/);
    let strike;
    let optionType;
    if (monthly) {
      if (expiry.slice(2, 4) !== monthly[1] || expiry.slice(5, 7) !== MONTHS[monthly[2]]) return null;
      strike = Number(monthly[3]);
      optionType = monthly[4];
    } else if (weekly) {
      if (expiry.slice(2, 4) !== weekly[1] || expiry.slice(5, 7) !== WEEKLY_MONTHS[weekly[2]] ||
        expiry.slice(8, 10) !== weekly[3]) return null;
      strike = Number(weekly[4]);
      optionType = weekly[5];
    } else {
      return null;
    }
    return {
      symbol: value,
      strike,
      optionType,
      contractId: canonicalContractId(expiry, strike, optionType)
    };
  }

  function emptyLedger() {
    return {
      version: 1,
      strategies: [],
      brokerPositions: [],
      importedTrades: [],
      tradeEvidence: [],
      tradeReviews: [],
      fillAssignments: [],
      fillDispositions: [],
      importBatches: [],
      coverageDeclarations: [],
      historyCheckpoints: [],
      historyGaps: [],
      allocationRevisions: [],
      reviewChanges: [],
      audit: []
    };
  }

  function assertLedger(ledger) {
    if (!ledger || ledger.version !== 1 || !Array.isArray(ledger.strategies) ||
      !Array.isArray(ledger.brokerPositions) || !Array.isArray(ledger.importedTrades) ||
      !Array.isArray(ledger.reviewChanges) || !Array.isArray(ledger.audit)) {
      throw new Error("invalid seller ledger");
    }
  }

  function nextLedger(ledger) {
    assertLedger(ledger);
    const next = clone(ledger);
    for (const field of [
      "tradeEvidence", "tradeReviews", "fillAssignments", "fillDispositions", "importBatches",
      "coverageDeclarations", "historyCheckpoints", "historyGaps", "allocationRevisions"
    ]) {
      if (!Array.isArray(next[field])) next[field] = [];
    }
    next.strategies.forEach((strategy) => {
      if (!Array.isArray(strategy.allocations)) strategy.allocations = [];
      if (!Array.isArray(strategy.fillIds)) strategy.fillIds = [];
      if (!Array.isArray(strategy.snapshots)) strategy.snapshots = [];
    });
    return next;
  }

  function strategyFor(ledger, strategyId) {
    const strategy = ledger.strategies.find((candidate) => candidate.id === strategyId);
    if (!strategy) throw new Error("unknown strategy");
    return strategy;
  }

  function validatePosition(input) {
    const identity = input && optionIdentity(input.tradingsymbol, input.expiry);
    if (!input || input.exchange !== "NFO" ||
      (Object.prototype.hasOwnProperty.call(input, "underlying") && input.underlying !== "NIFTY") ||
      !identity || input.contractId !== identity.contractId || input.strike !== identity.strike ||
      input.optionType !== identity.optionType || !Number.isInteger(input.signedQuantity) ||
      !Number.isInteger(input.lotSize) || input.lotSize <= 0 || input.signedQuantity % input.lotSize !== 0 ||
      !Number.isFinite(input.averagePrice) || input.averagePrice < 0) {
      throw new Error("invalid exact-expiry NIFTY broker position");
    }
    return clone(input);
  }

  function validTrade(trade) {
    const identity = trade && optionIdentity(trade.tradingsymbol, trade.expiry);
    return Boolean(trade && identity && trade.underlying === "NIFTY" && trade.exchange === "NFO" &&
      trade.contractId === identity.contractId && trade.strike === identity.strike && trade.optionType === identity.optionType &&
      (trade.transactionType === "BUY" || trade.transactionType === "SELL") &&
      Number.isInteger(trade.quantity) && trade.quantity > 0 && Number.isFinite(trade.price) && trade.price >= 0 &&
      exactTimestamp(trade.timestamp));
  }

  function strategyAllocations(ledger, contractId) {
    return ledger.strategies.flatMap((strategy) => strategy.allocations
      .filter((allocation) => allocation.contractId === contractId)
      .map((allocation) => ({ strategy, allocation })));
  }

  function currentPosition(ledger, contractId) {
    return ledger.brokerPositions.find((position) => position.contractId === contractId) || null;
  }

  function reviewPosition(ledger, contractId) {
    return ledger.reviewChanges.find((candidate) => candidate.contractId === contractId)?.position || null;
  }

  function positionFor(ledger, contractId) {
    return currentPosition(ledger, contractId) || reviewPosition(ledger, contractId);
  }

  function rebuildReviewChanges(ledger, previousPositions, priorReviews = []) {
    const previousById = new Map(previousPositions.map((position) => [position.contractId, position]));
    const priorReviewById = new Map(priorReviews.map((review) => [review.contractId, review.position]));
    const ids = new Set(ledger.brokerPositions.map((position) => position.contractId));
    ledger.strategies.forEach((strategy) => strategy.allocations.forEach((allocation) => ids.add(allocation.contractId)));
    previousPositions.forEach((position) => ids.add(position.contractId));
    priorReviews.forEach((review) => ids.add(review.contractId));
    ledger.reviewChanges = Array.from(ids).flatMap((contractId) => {
      const active = currentPosition(ledger, contractId);
      const prior = previousById.get(contractId) || priorReviewById.get(contractId);
      const metadata = active || prior;
      if (!metadata) return [];
      const signedQuantity = active ? active.signedQuantity : 0;
      const allocatedQuantity = strategyAllocations(ledger, contractId)
        .reduce((total, entry) => total + entry.allocation.signedLots * metadata.lotSize, 0);
      return signedQuantity === allocatedQuantity ? [] : [{
        contractId,
        previousSignedQuantity: prior ? prior.signedQuantity : 0,
        signedQuantity,
        allocatedQuantity,
        position: { ...metadata, signedQuantity }
      }];
    });
  }

  function createStrategy(ledger, input) {
    const next = nextLedger(ledger);
    if (!input || typeof input.id !== "string" || !input.id || typeof input.name !== "string" || !input.name ||
      input.underlying !== "NIFTY" || !exactIsoDate(input.expiry)) {
      throw new Error(input && input.underlying !== "NIFTY" ? "strategy underlying must be NIFTY" : "strategy requires id, name, and exact expiry");
    }
    if (next.strategies.some((strategy) => strategy.id === input.id)) throw new Error("strategy id already exists");
    next.strategies.push({
      id: input.id,
      name: input.name,
      underlying: "NIFTY",
      expiry: input.expiry,
      allocations: [],
      fillIds: [],
      snapshots: [],
      historyComplete: false
    });
    next.audit.push({ type: "STRATEGY_CREATED", strategyId: input.id });
    return next;
  }

  function reconcilePositions(ledger, positions, options = {}) {
    const next = nextLedger(ledger);
    if (!Array.isArray(positions)) throw new Error("broker positions must be an array");
    const normalized = positions.map(validatePosition);
    const scopeExpiry = options && Object.prototype.hasOwnProperty.call(options, "expiry") ? options.expiry : null;
    if (scopeExpiry !== null && !exactIsoDate(scopeExpiry)) throw new Error("position reconciliation requires exact expiry scope");
    if (scopeExpiry && normalized.some((position) => position.expiry !== scopeExpiry)) {
      throw new Error("broker position falls outside reconciliation expiry");
    }
    const seen = new Set();
    normalized.forEach((position) => {
      if (seen.has(position.contractId)) throw new Error("duplicate exact broker contract");
      seen.add(position.contractId);
    });
    const previous = clone(next.brokerPositions);
    const priorReviews = clone(next.reviewChanges);
    next.brokerPositions = scopeExpiry
      ? previous.filter((position) => position.expiry !== scopeExpiry).concat(normalized)
      : normalized;
    rebuildReviewChanges(next, previous, priorReviews);
    const changed = next.reviewChanges.filter((change) => {
      if (scopeExpiry && change.position.expiry !== scopeExpiry) return false;
      const prior = previous.find((position) => position.contractId === change.contractId);
      return !prior || prior.signedQuantity !== change.signedQuantity;
    });
    if (changed.length) next.audit.push({
      type: "POSITION_REVIEW_REQUIRED",
      expiry: scopeExpiry || null,
      contracts: changed.map((change) => change.contractId)
    });
    return next;
  }

  function allocateLots(ledger, input) {
    const next = nextLedger(ledger);
    if (!input || typeof input.strategyId !== "string" || typeof input.contractId !== "string" ||
      !Number.isInteger(input.signedLots)) throw new Error("allocation must use signed whole lots");
    if (!isCanonicalContractId(input.contractId)) throw new Error("allocation requires exact-expiry contract identity");
    const strategy = strategyFor(next, input.strategyId);
    const before = clone(strategy.allocations);
    const position = positionFor(next, input.contractId);
    if (!position) throw new Error("broker position is unavailable");
    if (strategy.expiry !== position.expiry) throw new Error("allocation expiry must match strategy expiry");
    const brokerLots = position.signedQuantity / position.lotSize;
    if (input.signedLots !== 0 && (brokerLots === 0 || Math.sign(input.signedLots) !== Math.sign(brokerLots))) {
      throw new Error("allocation direction must match broker lots");
    }
    const existing = strategy.allocations.find((allocation) => allocation.contractId === input.contractId);
    const otherLots = strategyAllocations(next, input.contractId)
      .filter((entry) => entry.strategy.id !== strategy.id)
      .reduce((total, entry) => total + entry.allocation.signedLots, 0);
    if (Math.abs(otherLots + input.signedLots) > Math.abs(brokerLots)) throw new Error("allocation exceeds available broker lots");
    if (existing) {
      if (input.signedLots === 0) strategy.allocations = strategy.allocations.filter((allocation) => allocation !== existing);
      else existing.signedLots = input.signedLots;
    } else if (input.signedLots !== 0) {
      strategy.allocations.push({ contractId: input.contractId, signedLots: input.signedLots });
    }
    rebuildReviewChanges(next, clone(next.brokerPositions), clone(next.reviewChanges));
    const revision = { strategyId: strategy.id, contractId: input.contractId, before, after: clone(strategy.allocations) };
    next.allocationRevisions.push(clone(revision));
    next.audit.push({ type: "ALLOCATION_ACCEPTED", signedLots: input.signedLots, ...revision });
    return next;
  }

  function fingerprint(trade) {
    return [trade.contractId || "", trade.transactionType || "", trade.quantity || "", trade.price ?? "", trade.timestamp || "", trade.expiry || ""]
      .map((value) => String(value).trim().toUpperCase()).join("|");
  }

  function importedById(ledger) {
    return new Map(ledger.importedTrades.map((trade) => [trade.id, trade]));
  }

  function assignedQuantity(ledger, fillId) {
    return ledger.fillAssignments.filter((assignment) => assignment.fillId === fillId)
      .reduce((total, assignment) => total + (Number.isInteger(assignment.quantity) ? assignment.quantity : 0), 0);
  }

  function unassignedQuantity(ledger, fillId) {
    return ledger.fillDispositions.filter((entry) => entry.fillId === fillId && entry.disposition === "UNASSIGNED")
      .reduce((total, entry) => total + (Number.isInteger(entry.quantity) ? entry.quantity : 0), 0);
  }

  function remainingQuantity(ledger, fillId) {
    const trade = ledger.importedTrades.find((candidate) => candidate.id === fillId);
    return trade ? trade.quantity - assignedQuantity(ledger, fillId) - unassignedQuantity(ledger, fillId) : 0;
  }

  function refreshTradeReview(ledger, fillId, sourceKind) {
    const trade = ledger.importedTrades.find((candidate) => candidate.id === fillId);
    ledger.tradeReviews = ledger.tradeReviews.filter((review) => review.fillId !== fillId);
    if (!trade) return;
    const remaining = remainingQuantity(ledger, fillId);
    if (remaining > 0) {
      ledger.tradeReviews.push({
        fillId,
        contractId: trade.contractId,
        expiry: trade.expiry,
        remainingQuantity: remaining,
        sourceKind,
        reason: "QUANTITY_OWNERSHIP_REVIEW_REQUIRED"
      });
    }
  }

  function addTrades(next, trades, sourceKind, evidence = {}) {
    const byId = importedById(next);
    const canonicalIds = [];
    for (const sourceTrade of trades) {
      if (!validTrade(sourceTrade) || typeof sourceTrade.id !== "string" || !sourceTrade.id) {
        throw new Error("invalid exact-expiry NIFTY trade");
      }
      const trade = clone(sourceTrade);
      const content = fingerprint(trade);
      const sameId = byId.get(trade.id);
      if (sameId && fingerprint(sameId) !== content) throw new Error("immutable trade ID conflict");
      const canonical = sameId || trade;
      if (!sameId) {
        next.importedTrades.push(canonical);
        byId.set(canonical.id, canonical);
      }
      canonicalIds.push(canonical.id);
      if (!next.tradeEvidence.some((item) => item.fillId === canonical.id && item.sourceKind === sourceKind &&
        (sourceKind !== "ZERODHA_TRADEBOOK_CSV" || item.importBatchFingerprint === evidence.importBatchFingerprint))) {
        next.tradeEvidence.push({ fillId: canonical.id, sourceKind, ...clone(evidence) });
      }
      refreshTradeReview(next, canonical.id, sourceKind);
    }
    return canonicalIds;
  }

  function stageTradebookImport(ledger, input) {
    const next = nextLedger(ledger);
    if (!input || input.sourceKind !== "ZERODHA_TRADEBOOK_CSV" || !Array.isArray(input.trades) ||
      typeof input.batchFingerprint !== "string" || !input.batchFingerprint || !exactTimestamp(input.stagedAt) ||
      !input.scope || input.scope.underlying !== "NIFTY" || !exactIsoDate(input.scope.expiry)) {
      throw new Error("invalid staged Zerodha tradebook evidence");
    }
    if (input.trades.some((trade) => trade.expiry !== input.scope.expiry)) throw new Error("tradebook row falls outside staged expiry scope");
    const existing = next.importBatches.find((batch) => batch.fingerprint === input.batchFingerprint);
    if (existing) return next;
    const fillIds = addTrades(next, input.trades, "ZERODHA_TRADEBOOK_CSV", {
      importBatchFingerprint: input.batchFingerprint
    });
    next.importBatches.push({
      sourceKind: "ZERODHA_TRADEBOOK_CSV",
      fingerprint: input.batchFingerprint,
      stagedAt: input.stagedAt,
      scope: clone(input.scope),
      fillIds: Array.from(new Set(fillIds))
    });
    next.audit.push({
      type: "IMPORT_BATCH_STAGED",
      fingerprint: input.batchFingerprint,
      stagedAt: input.stagedAt,
      fillIds: Array.from(new Set(fillIds))
    });
    return next;
  }

  function ingestBrokerTrades(ledger, input) {
    const next = nextLedger(ledger);
    if (!input || !Array.isArray(input.trades) || !exactIsoDate(input.expiry) || !exactTimestamp(input.observedAt) ||
      input.trades.some((trade) => trade.expiry !== input.expiry)) {
      throw new Error("current-day trades require exact expiry and observed timestamp");
    }
    const fillIds = addTrades(next, input.trades, "ZERODHA_CURRENT_DAY", { observedAt: input.observedAt });
    const date = input.observedAt.slice(0, 10);
    const checkpointId = `DAILY:${input.expiry}:${input.observedAt}`;
    if (!next.historyCheckpoints.some((checkpoint) => checkpoint.id === checkpointId)) {
      next.historyCheckpoints.push({
        id: checkpointId,
        kind: "ZERODHA_CURRENT_DAY_SUCCESS",
        expiry: input.expiry,
        date,
        observedAt: input.observedAt,
        tradeIds: Array.from(new Set(fillIds))
      });
      next.audit.push({ type: "DAILY_CHECKPOINT_RECORDED", checkpointId, expiry: input.expiry, date, tradeIds: Array.from(new Set(fillIds)) });
    }
    next.audit.push({ type: "CURRENT_DAY_TRADES_INGESTED", observedAt: input.observedAt, tradeIds: fillIds });
    return next;
  }

  function assignFillQuantity(ledger, input) {
    const next = nextLedger(ledger);
    if (!input || typeof input.fillId !== "string" || !Number.isInteger(input.quantity) || input.quantity <= 0 ||
      !exactTimestamp(input.confirmedAt) || !["STRATEGY", "UNASSIGNED"].includes(input.disposition)) {
      throw new Error("fill ownership requires explicit positive quantity and disposition");
    }
    const trade = next.importedTrades.find((candidate) => candidate.id === input.fillId);
    if (!trade || !validTrade(trade)) throw new Error("unknown exact-expiry imported fill");
    if (input.quantity > remainingQuantity(next, input.fillId)) throw new Error("fill ownership quantity exceeds unassigned remainder");
    if (input.disposition === "STRATEGY") {
      const strategy = strategyFor(next, input.strategyId);
      if (strategy.expiry !== trade.expiry) throw new Error("fill expiry must match strategy expiry");
      next.fillAssignments.push({
        fillId: trade.id,
        strategyId: strategy.id,
        quantity: input.quantity,
        confirmedAt: input.confirmedAt
      });
      if (!strategy.fillIds.includes(trade.id)) strategy.fillIds.push(trade.id);
      next.audit.push({ type: "FILL_QUANTITY_ASSIGNED", fillId: trade.id, strategyId: strategy.id, quantity: input.quantity, confirmedAt: input.confirmedAt });
    } else {
      next.fillDispositions.push({
        fillId: trade.id,
        disposition: "UNASSIGNED",
        quantity: input.quantity,
        confirmedAt: input.confirmedAt
      });
      next.audit.push({ type: "FILL_QUANTITY_LEFT_UNASSIGNED", fillId: trade.id, quantity: input.quantity, confirmedAt: input.confirmedAt });
    }
    if (next.tradeEvidence.some((item) => item.fillId === trade.id && item.sourceKind === "ZERODHA_CURRENT_DAY")) {
      next.tradeEvidence.push({
        fillId: trade.id,
        sourceKind: "ZERODHA_CURRENT_DAY_CONFIRMED",
        disposition: input.disposition,
        strategyId: input.disposition === "STRATEGY" ? input.strategyId : null,
        quantity: input.quantity,
        confirmedAt: input.confirmedAt
      });
    }
    refreshTradeReview(next, trade.id, next.tradeEvidence.find((item) => item.fillId === trade.id)?.sourceKind || "UNKNOWN");
    return next;
  }

  function assignReviewedTrade(ledger, input) {
    if (!input || !Number.isInteger(input.quantity)) throw new Error("reviewed trade requires explicit quantity");
    return assignFillQuantity(ledger, {
      ...input,
      disposition: input.disposition || "STRATEGY"
    });
  }

  function assignFills(ledger, input) {
    if (!input || !Array.isArray(input.assignments) || input.fillIds) {
      throw new Error("fills require explicit per-fill quantity assignments");
    }
    let next = stageTradebookImport(ledger, {
      trades: input.trades,
      sourceKind: "ZERODHA_TRADEBOOK_CSV",
      batchFingerprint: input.importBatch?.fingerprint,
      stagedAt: input.importBatch?.stagedAt,
      scope: input.importBatch?.scope
    });
    for (const assignment of input.assignments) next = assignFillQuantity(next, assignment);
    return next;
  }

  function confirmHistoryCoverage(ledger, input) {
    const next = nextLedger(ledger);
    if (!input || typeof input.strategyId !== "string" || typeof input.batchFingerprint !== "string" ||
      !exactIsoDate(input.from) || !exactIsoDate(input.to) || input.from > input.to ||
      !Array.isArray(input.checkpointIds) || !exactTimestamp(input.confirmedAt)) {
      throw new Error("history coverage requires explicit bounds, checkpoints, and confirmation time");
    }
    const strategy = strategyFor(next, input.strategyId);
    const batch = next.importBatches.find((candidate) => candidate.fingerprint === input.batchFingerprint);
    if (!batch || batch.scope?.expiry !== strategy.expiry) throw new Error("staged import batch does not match strategy expiry");
    if (batch.fillIds.some((fillId) => remainingQuantity(next, fillId) !== 0)) {
      throw new Error("every staged fill quantity requires an explicit strategy or unassigned disposition");
    }
    const batchTrades = batch.fillIds.map((fillId) => next.importedTrades.find((trade) => trade.id === fillId)).filter(Boolean);
    if (batchTrades.some((trade) => trade.timestamp.slice(0, 10) < input.from || trade.timestamp.slice(0, 10) > input.to)) {
      throw new Error("declared coverage bounds exclude staged fill evidence");
    }
    const checkpoints = new Map(next.historyCheckpoints.map((checkpoint) => [checkpoint.id, checkpoint]));
    if (input.checkpointIds.some((id) => !checkpoints.has(id) || checkpoints.get(id).expiry !== strategy.expiry)) {
      throw new Error("declared coverage references an invalid checkpoint");
    }
    const id = ["COVERAGE", strategy.id, batch.fingerprint, input.from, input.to, input.checkpointIds.slice().sort().join(",")].join("|");
    if (next.coverageDeclarations.some((declaration) => declaration.id === id)) return next;
    const declaration = {
      id,
      strategyId: strategy.id,
      batchFingerprint: batch.fingerprint,
      from: input.from,
      to: input.to,
      checkpointIds: input.checkpointIds.slice().sort(),
      confirmedAt: input.confirmedAt
    };
    next.coverageDeclarations.push(declaration);
    next.audit.push({ type: "HISTORY_COVERAGE_CONFIRMED", ...clone(declaration) });
    return next;
  }

  function recordHistoryGap(ledger, input) {
    const next = nextLedger(ledger);
    if (!input || typeof input.strategyId !== "string" || !exactIsoDate(input.from) || !exactIsoDate(input.to) ||
      input.from > input.to || typeof input.reason !== "string" || !input.reason) {
      throw new Error("history gap requires strategy, date range, and reason");
    }
    strategyFor(next, input.strategyId);
    const gap = clone(input);
    next.historyGaps.push(gap);
    next.audit.push({ type: "HISTORY_GAP_RECORDED", ...gap });
    return next;
  }

  function ownedFills(strategy, ledger) {
    const assignments = ledger.fillAssignments.filter((assignment) => assignment.strategyId === strategy.id &&
      Number.isInteger(assignment.quantity) && assignment.quantity > 0);
    const quantities = new Map();
    assignments.forEach((assignment) => quantities.set(assignment.fillId, (quantities.get(assignment.fillId) || 0) + assignment.quantity));
    return Array.from(quantities, ([fillId, quantity]) => {
      const source = ledger.importedTrades.find((trade) => trade.id === fillId);
      return source ? { ...clone(source), quantity } : null;
    }).filter(Boolean).sort((left, right) => left.timestamp.localeCompare(right.timestamp) || left.id.localeCompare(right.id));
  }

  function signedFillQuantity(fills) {
    return fills.reduce((total, fill) => total + (fill.transactionType === "SELL" ? -1 : 1) * fill.quantity, 0);
  }

  function openEntryPrice(fills, expectedSignedQuantity) {
    let signedQuantity = 0;
    let entryPrice = null;
    for (const fill of fills.slice().sort((left, right) => left.timestamp.localeCompare(right.timestamp) || left.id.localeCompare(right.id))) {
      const signed = (fill.transactionType === "BUY" ? 1 : -1) * fill.quantity;
      if (signedQuantity === 0 || Math.sign(signedQuantity) === Math.sign(signed)) {
        const total = Math.abs(signedQuantity) + Math.abs(signed);
        entryPrice = total ? ((entryPrice || 0) * Math.abs(signedQuantity) + fill.price * Math.abs(signed)) / total : null;
        signedQuantity += signed;
      } else if (Math.abs(signed) < Math.abs(signedQuantity)) {
        signedQuantity += signed;
      } else if (Math.abs(signed) === Math.abs(signedQuantity)) {
        signedQuantity = 0;
        entryPrice = null;
      } else {
        signedQuantity += signed;
        entryPrice = fill.price;
      }
    }
    return signedQuantity === expectedSignedQuantity ? entryPrice : null;
  }

  function addDay(date, amount = 1) {
    const value = new Date(`${date}T00:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() + amount);
    return value.toISOString().slice(0, 10);
  }

  function checkpointComplete(ledger, checkpoint) {
    return checkpoint.tradeIds.every((fillId) => remainingQuantity(ledger, fillId) === 0);
  }

  function evidenceState(strategy, fills, ledger) {
    const declarations = ledger.coverageDeclarations.filter((item) => item.strategyId === strategy.id);
    const batches = new Map(ledger.importBatches.map((batch) => [batch.fingerprint, batch]));
    const evidence = ledger.tradeEvidence || [];
    let consistent = fills.length > 0;
    for (const fill of fills) {
      if (!validTrade(fill) || fill.expiry !== strategy.expiry) consistent = false;
      const assignmentQuantity = ledger.fillAssignments.filter((assignment) => assignment.strategyId === strategy.id && assignment.fillId === fill.id)
        .reduce((total, assignment) => total + (Number.isInteger(assignment.quantity) ? assignment.quantity : 0), 0);
      if (assignmentQuantity !== fill.quantity) consistent = false;
      const csvEvidence = evidence.filter((item) => item.fillId === fill.id && item.sourceKind === "ZERODHA_TRADEBOOK_CSV");
      const dailyEvidence = evidence.some((item) => item.fillId === fill.id && item.sourceKind === "ZERODHA_CURRENT_DAY");
      const fillDate = fill.timestamp.slice(0, 10);
      const coveredByCsv = csvEvidence.some((item) => declarations.some((declaration) =>
        declaration.batchFingerprint === item.importBatchFingerprint && batches.has(item.importBatchFingerprint) &&
        fillDate >= declaration.from && fillDate <= declaration.to));
      const coveredByDaily = dailyEvidence && ledger.historyCheckpoints.some((checkpoint) =>
        checkpoint.expiry === strategy.expiry && checkpoint.date === fillDate && checkpoint.tradeIds.includes(fill.id) && checkpointComplete(ledger, checkpoint));
      if (!coveredByCsv && !coveredByDaily) consistent = false;
    }

    const netByContract = new Map();
    fills.forEach((fill) => netByContract.set(fill.contractId,
      (netByContract.get(fill.contractId) || 0) + (fill.transactionType === "SELL" ? -1 : 1) * fill.quantity));
    for (const allocation of strategy.allocations) {
      const position = positionFor(ledger, allocation.contractId);
      if (!position || netByContract.get(allocation.contractId) !== allocation.signedLots * position.lotSize) consistent = false;
      netByContract.delete(allocation.contractId);
    }
    if (Array.from(netByContract.values()).some((quantity) => quantity !== 0)) consistent = false;

    const intervals = declarations.map((declaration) => ({ from: declaration.from, to: declaration.to }));
    ledger.historyCheckpoints.filter((checkpoint) => checkpoint.expiry === strategy.expiry && checkpointComplete(ledger, checkpoint))
      .forEach((checkpoint) => intervals.push({ from: checkpoint.date, to: checkpoint.date }));
    intervals.sort((left, right) => left.from.localeCompare(right.from) || left.to.localeCompare(right.to));
    const snapshots = strategy.snapshots.map((snapshot) => snapshot.at?.slice(0, 10)).filter(exactIsoDate);
    const fillDates = fills.map((fill) => fill.timestamp.slice(0, 10)).filter(exactIsoDate);
    const target = fillDates.concat(snapshots).sort().at(-1) || null;
    let coveredTo = intervals[0]?.to || null;
    let gap = false;
    if (!intervals.length || !declarations.length || !target) gap = false;
    for (let index = 1; index < intervals.length && coveredTo; index += 1) {
      if (intervals[index].from > addDay(coveredTo)) {
        if (!target || addDay(coveredTo) <= target) gap = true;
        break;
      }
      if (intervals[index].to > coveredTo) coveredTo = intervals[index].to;
    }
    if (coveredTo && target && coveredTo < target) gap = true;
    if (ledger.historyGaps.some((item) => !item.strategyId || item.strategyId === strategy.id)) gap = true;
    const complete = consistent && declarations.length > 0 && Boolean(target) && Boolean(coveredTo) && coveredTo >= target && !gap;
    return { complete, consistent, gap };
  }

  function strategyEffectiveLegs(ledger, strategy, fills = ownedFills(strategy, ledger)) {
    const legs = [];
    let complete = true;
    for (const allocation of strategy.allocations) {
      const position = positionFor(ledger, allocation.contractId);
      const exactPositionId = position
        ? canonicalContractId(position.expiry, position.strike, position.optionType)
        : null;
      if (!position || position.expiry !== strategy.expiry || exactPositionId !== allocation.contractId ||
        position.contractId !== allocation.contractId) {
        complete = false;
        continue;
      }
      const contractFills = fills.filter((fill) => fill.contractId === allocation.contractId);
      const split = strategyAllocations(ledger, allocation.contractId)
        .filter((entry) => entry.allocation.signedLots !== 0).length > 1;
      const expectedQuantity = allocation.signedLots * position.lotSize;
      const exactPrice = openEntryPrice(contractFills, expectedQuantity);
      if (split && exactPrice === null) complete = false;
      const entryPrice = split ? exactPrice : position.averagePrice;
      legs.push({
        id: allocation.contractId,
        strike: position.strike,
        optionType: position.optionType,
        signedLots: allocation.signedLots,
        lotSize: position.lotSize,
        entryPrice
      });
    }
    return { complete, legs };
  }

  function strategyAcceptedInputs(ledger, strategyId, suppliedEffectiveLegs) {
    assertLedger(ledger);
    const strategy = strategyFor(ledger, strategyId);
    const positions = strategy.allocations.map((allocation) => positionFor(ledger, allocation.contractId)).filter(Boolean)
      .map((position) => ({
        contractId: position.contractId,
        expiry: position.expiry,
        strike: position.strike,
        optionType: position.optionType,
        signedQuantity: position.signedQuantity,
        lotSize: position.lotSize,
        averagePrice: position.averagePrice
      })).sort((left, right) => left.contractId.localeCompare(right.contractId));
    const allocations = clone(strategy.allocations).sort((left, right) => left.contractId.localeCompare(right.contractId));
    const ownedFillQuantities = ownedFills(strategy, ledger).map((fill) => ({
      fillId: fill.id,
      contractId: fill.contractId,
      transactionType: fill.transactionType,
      quantity: fill.quantity,
      price: fill.price,
      timestamp: fill.timestamp
    }));
    const coverageDeclarationIds = ledger.coverageDeclarations.filter((item) => item.strategyId === strategy.id).map((item) => item.id).sort();
    const checkpointIds = ledger.historyCheckpoints.filter((item) => item.expiry === strategy.expiry).map((item) => item.id).sort();
    const effectiveLegs = (suppliedEffectiveLegs || strategyEffectiveLegs(ledger, strategy).legs).map((leg) => ({
      contractId: leg.id,
      strike: leg.strike,
      optionType: leg.optionType,
      signedLots: leg.signedLots,
      lotSize: leg.lotSize,
      entryPrice: leg.entryPrice,
      cashContribution: Number.isFinite(leg.entryPrice)
        ? -leg.signedLots * leg.lotSize * leg.entryPrice
        : null
    })).sort((left, right) => left.contractId.localeCompare(right.contractId));
    return {
      version: 2,
      strategyId: strategy.id,
      expiry: strategy.expiry,
      positions,
      allocations,
      ownedFillQuantities,
      effectiveLegs,
      evidence: {
        allocationRevisionCount: ledger.allocationRevisions.filter((item) => item.strategyId === strategy.id).length,
        fillAssignmentCount: ledger.fillAssignments.filter((item) => item.strategyId === strategy.id).length,
        coverageDeclarationIds,
        checkpointIds
      }
    };
  }

  function acceptSnapshot(ledger, input) {
    const next = nextLedger(ledger);
    if (!input || typeof input.strategyId !== "string" || !input.snapshot || typeof input.snapshot !== "object" ||
      !exactTimestamp(input.snapshot.at)) throw new Error("snapshot requires strategy and exact timestamp");
    const strategy = strategyFor(next, input.strategyId);
    const snapshot = clone(input.snapshot);
    snapshot.normalizedInputs = strategyAcceptedInputs(next, strategy.id);
    strategy.snapshots.push(snapshot);
    next.audit.push({ type: "SNAPSHOT_ACCEPTED", strategyId: strategy.id, at: snapshot.at });
    return next;
  }

  function strategyRiskInput(ledger, strategyId) {
    assertLedger(ledger);
    const strategy = strategyFor(ledger, strategyId);
    if (strategy.allocations.some((allocation) => !isCanonicalContractId(allocation.contractId))) {
      return {
        status: "LEGACY_IDENTITY_REVIEW_REQUIRED",
        openLegs: [],
        fills: [],
        history: { complete: false, reconciled: false, duplicates: false, consistent: false, gap: false }
      };
    }
    const fills = ownedFills(strategy, ledger);
    const effective = strategyEffectiveLegs(ledger, strategy, fills);
    const legs = effective.legs;
    const entryComplete = effective.complete;
    const relevantPositionReview = ledger.reviewChanges.some((change) => change.position?.expiry === strategy.expiry);
    const evidence = evidenceState(strategy, fills, ledger);
    const history = {
      complete: evidence.complete,
      reconciled: !relevantPositionReview,
      duplicates: false,
      consistent: evidence.consistent && entryComplete,
      gap: evidence.gap
    };
    let status = "OK";
    if (relevantPositionReview) status = "REVIEW_POSITION_CHANGES";
    else if (!entryComplete) status = "ENTRY_HISTORY_INCOMPLETE";
    else if (evidence.gap) status = "HISTORY_GAP";
    else if (!evidence.complete || !evidence.consistent) status = "HISTORY_INCOMPLETE";
    return {
      status,
      openLegs: legs,
      fills: clone(fills),
      history,
      normalizedInputs: strategyAcceptedInputs(ledger, strategy.id, legs)
    };
  }

  const api = {
    emptyLedger,
    canonicalContractId,
    createStrategy,
    reconcilePositions,
    ingestBrokerTrades,
    allocateLots,
    stageTradebookImport,
    assignFillQuantity,
    assignFills,
    assignReviewedTrade,
    confirmHistoryCoverage,
    acceptSnapshot,
    recordHistoryGap,
    strategyAcceptedInputs,
    strategyRiskInput
  };
  root.NiftySellerLedger = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
