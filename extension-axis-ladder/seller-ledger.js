(function (root) {
  "use strict";

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function emptyLedger() {
    return {
      version: 1,
      strategies: [],
      brokerPositions: [],
      importedTrades: [],
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
    return clone(ledger);
  }

  function strategyFor(ledger, strategyId) {
    const strategy = ledger.strategies.find((candidate) => candidate.id === strategyId);
    if (!strategy) throw new Error("unknown strategy");
    return strategy;
  }

  function validExpiry(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  function validatePosition(input) {
    if (!input || typeof input.contractId !== "string" || !input.contractId ||
      !validExpiry(input.expiry) || !Number.isFinite(input.strike) || input.strike < 0 ||
      (input.optionType !== "CE" && input.optionType !== "PE") ||
      !Number.isInteger(input.signedQuantity) || !Number.isInteger(input.lotSize) || input.lotSize <= 0 ||
      input.signedQuantity % input.lotSize !== 0) {
      throw new Error("invalid broker position");
    }
    return clone(input);
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
    const change = ledger.reviewChanges.find((candidate) => candidate.contractId === contractId);
    return change ? change.position : null;
  }

  function positionFor(ledger, contractId) {
    return currentPosition(ledger, contractId) || reviewPosition(ledger, contractId);
  }

  function rebuildReviewChanges(ledger, previousPositions) {
    const oldById = new Map(previousPositions.map((position) => [position.contractId, position]));
    const positionIds = new Set(ledger.brokerPositions.map((position) => position.contractId));
    ledger.strategies.forEach((strategy) => strategy.allocations.forEach((allocation) => positionIds.add(allocation.contractId)));
    previousPositions.forEach((position) => positionIds.add(position.contractId));
    const changes = [];
    for (const contractId of positionIds) {
      const active = currentPosition(ledger, contractId);
      const prior = oldById.get(contractId) || reviewPosition(ledger, contractId);
      const metadata = active || prior;
      if (!metadata) continue;
      const signedQuantity = active ? active.signedQuantity : 0;
      const allocatedQuantity = strategyAllocations(ledger, contractId)
        .reduce((total, entry) => total + entry.allocation.signedLots * metadata.lotSize, 0);
      if (signedQuantity !== allocatedQuantity) {
        changes.push({
          contractId,
          previousSignedQuantity: prior ? prior.signedQuantity : 0,
          signedQuantity,
          allocatedQuantity,
          position: { ...metadata, signedQuantity }
        });
      }
    }
    ledger.reviewChanges = changes;
  }

  function createStrategy(ledger, input) {
    const next = nextLedger(ledger);
    if (!input || typeof input.id !== "string" || !input.id || typeof input.name !== "string" || !input.name ||
      input.underlying !== "NIFTY" || !validExpiry(input.expiry)) {
      throw new Error(input && input.underlying !== "NIFTY" ? "strategy underlying must be NIFTY" : "strategy requires id, name, and expiry");
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

  function reconcilePositions(ledger, positions) {
    const next = nextLedger(ledger);
    if (!Array.isArray(positions)) throw new Error("broker positions must be an array");
    const normalized = positions.map(validatePosition);
    const seen = new Set();
    normalized.forEach((position) => {
      if (seen.has(position.contractId)) throw new Error("duplicate broker contract");
      seen.add(position.contractId);
    });
    const previous = clone(next.brokerPositions);
    next.brokerPositions = normalized;
    rebuildReviewChanges(next, previous);
    const changed = next.reviewChanges.filter((change) => {
      const old = previous.find((position) => position.contractId === change.contractId);
      return !old || old.signedQuantity !== change.signedQuantity;
    });
    if (changed.length) next.audit.push({ type: "POSITION_REVIEW_REQUIRED", contracts: changed.map((change) => change.contractId) });
    return next;
  }

  function allocateLots(ledger, input) {
    const next = nextLedger(ledger);
    if (!input || typeof input.strategyId !== "string" || typeof input.contractId !== "string" ||
      !Number.isInteger(input.signedLots)) throw new Error("allocation must use whole lots");
    const strategy = strategyFor(next, input.strategyId);
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
    if (Math.abs(otherLots + input.signedLots) > Math.abs(brokerLots)) {
      throw new Error("allocation exceeds available broker lots");
    }
    if (existing) {
      if (input.signedLots === 0) strategy.allocations = strategy.allocations.filter((allocation) => allocation !== existing);
      else existing.signedLots = input.signedLots;
    } else if (input.signedLots !== 0) {
      strategy.allocations.push({ contractId: input.contractId, signedLots: input.signedLots });
    }
    const previous = clone(next.brokerPositions);
    rebuildReviewChanges(next, previous);
    next.audit.push({ type: "ALLOCATION_ACCEPTED", strategyId: strategy.id, contractId: input.contractId, signedLots: input.signedLots });
    return next;
  }

  function fingerprint(trade) {
    return [trade.contractId || trade.tradingsymbol || "", trade.transactionType || "", trade.quantity || "", trade.price || "", trade.timestamp || "", trade.expiry || ""]
      .map((value) => String(value).trim().toUpperCase()).join("|");
  }

  function validTrade(trade) {
    return trade && typeof trade.contractId === "string" && trade.contractId &&
      (trade.transactionType === "BUY" || trade.transactionType === "SELL") &&
      Number.isFinite(trade.quantity) && trade.quantity > 0 &&
      Number.isFinite(trade.price) && trade.price >= 0;
  }

  function assignFills(ledger, input) {
    const next = nextLedger(ledger);
    if (!input || typeof input.strategyId !== "string" || !Array.isArray(input.trades) || !Array.isArray(input.fillIds)) {
      throw new Error("fills require strategy, trades, and fill ids");
    }
    const strategy = strategyFor(next, input.strategyId);
    const ids = new Set(next.importedTrades.map((trade) => trade.id));
    const fingerprints = new Set(next.importedTrades.map(fingerprint));
    const summary = { type: "IMPORT_SUMMARY", accepted: 0, duplicateIds: 0, duplicateFingerprints: 0 };
    for (const sourceTrade of input.trades) {
      if (!validTrade(sourceTrade)) throw new Error("invalid imported trade");
      const trade = clone(sourceTrade);
      trade.id = trade.id || fingerprint(trade);
      const content = fingerprint(trade);
      if (ids.has(trade.id)) summary.duplicateIds += 1;
      else if (fingerprints.has(content)) summary.duplicateFingerprints += 1;
      else {
        next.importedTrades.push(trade);
        ids.add(trade.id);
        fingerprints.add(content);
        summary.accepted += 1;
      }
    }
    const known = new Map(next.importedTrades.map((trade) => [trade.id, trade]));
    const assignedElsewhere = new Set(next.strategies.filter((candidate) => candidate.id !== strategy.id)
      .flatMap((candidate) => candidate.fillIds));
    for (const fillId of input.fillIds) {
      if (!known.has(fillId)) throw new Error("unknown imported fill");
      if (assignedElsewhere.has(fillId)) throw new Error("fill is already assigned to another strategy");
      if (!strategy.fillIds.includes(fillId)) strategy.fillIds.push(fillId);
    }
    if (Object.prototype.hasOwnProperty.call(input, "complete")) strategy.historyComplete = input.complete === true;
    next.audit.push(summary);
    return next;
  }

  function acceptSnapshot(ledger, input) {
    const next = nextLedger(ledger);
    if (!input || typeof input.strategyId !== "string" || !input.snapshot || typeof input.snapshot !== "object") {
      throw new Error("snapshot requires strategy and snapshot data");
    }
    const strategy = strategyFor(next, input.strategyId);
    strategy.snapshots.push(clone(input.snapshot));
    next.audit.push({ type: "SNAPSHOT_ACCEPTED", strategyId: strategy.id });
    return next;
  }

  function fillsFor(strategy, ledger) {
    const wanted = new Set(strategy.fillIds);
    return ledger.importedTrades.filter((trade) => wanted.has(trade.id));
  }

  function signedFillQuantity(fills) {
    return fills.reduce((total, fill) => total + (fill.transactionType === "SELL" ? -1 : 1) * fill.quantity, 0);
  }

  function entryPriceFor(fills, signedLots, lotSize) {
    const direction = signedLots < 0 ? "SELL" : "BUY";
    const matching = fills.filter((fill) => fill.transactionType === direction);
    const expected = Math.abs(signedLots) * lotSize;
    const quantity = matching.reduce((total, fill) => total + fill.quantity, 0);
    if (quantity !== expected) return null;
    return matching.reduce((total, fill) => total + fill.quantity * fill.price, 0) / quantity;
  }

  function strategyRiskInput(ledger, strategyId) {
    assertLedger(ledger);
    const strategy = strategyFor(ledger, strategyId);
    const fills = fillsFor(strategy, ledger);
    const legState = [];
    let entryComplete = true;
    let fillsReconcile = true;
    for (const allocation of strategy.allocations) {
      const position = positionFor(ledger, allocation.contractId);
      if (!position) {
        entryComplete = false;
        fillsReconcile = false;
        continue;
      }
      const contractFills = fills.filter((fill) => fill.contractId === allocation.contractId);
      const owners = strategyAllocations(ledger, allocation.contractId).filter((entry) => entry.allocation.signedLots !== 0);
      const split = owners.length > 1;
      const exactPrice = entryPriceFor(contractFills, allocation.signedLots, position.lotSize);
      if (split && exactPrice === null) entryComplete = false;
      if (signedFillQuantity(contractFills) !== allocation.signedLots * position.lotSize) fillsReconcile = false;
      legState.push({
        id: allocation.contractId,
        strike: position.strike,
        optionType: position.optionType,
        signedLots: allocation.signedLots,
        lotSize: position.lotSize,
        entryPrice: split ? exactPrice : position.averagePrice
      });
    }
    const reconciled = ledger.reviewChanges.length === 0;
    const complete = strategy.historyComplete === true && strategy.allocations.length > 0 && fillsReconcile;
    const consistent = entryComplete && fillsReconcile;
    const history = { complete, reconciled, duplicates: false, consistent };
    let status = "OK";
    if (!reconciled) status = "REVIEW_POSITION_CHANGES";
    else if (!entryComplete) status = "ENTRY_HISTORY_INCOMPLETE";
    else if (!complete || !consistent) status = "HISTORY_INCOMPLETE";
    return { status, openLegs: legState, fills: clone(fills), history };
  }

  const api = { emptyLedger, createStrategy, reconcilePositions, allocateLots, assignFills, acceptSnapshot, strategyRiskInput };
  root.NiftySellerLedger = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
