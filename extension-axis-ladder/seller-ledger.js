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
      importBatches: [],
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
    if (!Array.isArray(next.importBatches)) next.importBatches = [];
    if (!Array.isArray(next.historyGaps)) next.historyGaps = [];
    if (!Array.isArray(next.allocationRevisions)) next.allocationRevisions = [];
    return next;
  }

  function strategyFor(ledger, strategyId) {
    const strategy = ledger.strategies.find((candidate) => candidate.id === strategyId);
    if (!strategy) throw new Error("unknown strategy");
    return strategy;
  }

  function validExpiry(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  function niftySymbol(value) {
    return typeof value === "string" && /^NIFTY(?=[A-Z0-9])/.test(value.trim().toUpperCase());
  }

  function niftyContract(value) {
    return typeof value === "string" && /^(?:[A-Z_]+:)?NIFTY(?=[A-Z0-9])/.test(value.trim().toUpperCase());
  }

  function validatePosition(input) {
    if (!input || typeof input.contractId !== "string" || !input.contractId ||
      !niftyContract(input.contractId) || !niftySymbol(input.tradingsymbol) ||
      !validExpiry(input.expiry) || !Number.isFinite(input.strike) || input.strike < 0 ||
      (input.optionType !== "CE" && input.optionType !== "PE") ||
      !Number.isInteger(input.signedQuantity) || !Number.isInteger(input.lotSize) || input.lotSize <= 0 ||
      input.signedQuantity % input.lotSize !== 0) {
      throw new Error("invalid NIFTY broker position");
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
    const after = clone(strategy.allocations);
    const revision = { strategyId: strategy.id, contractId: input.contractId, before, after };
    next.allocationRevisions.push(clone(revision));
    next.audit.push({ type: "ALLOCATION_ACCEPTED", signedLots: input.signedLots, ...revision });
    return next;
  }

  function fingerprint(trade) {
    return [trade.contractId || trade.tradingsymbol || "", trade.transactionType || "", trade.quantity || "", trade.price || "", trade.timestamp || "", trade.expiry || ""]
      .map((value) => String(value).trim().toUpperCase()).join("|");
  }

  function validTrade(trade) {
    return trade && typeof trade.contractId === "string" && trade.contractId &&
      trade.underlying === "NIFTY" && niftyContract(trade.contractId) &&
      validExpiry(trade.expiry) &&
      (trade.transactionType === "BUY" || trade.transactionType === "SELL") &&
      Number.isFinite(trade.quantity) && trade.quantity > 0 &&
      Number.isFinite(trade.price) && trade.price >= 0;
  }

  function dateInCoverage(timestamp, coverage) {
    const date = typeof timestamp === "string" ? timestamp.slice(0, 10) : "";
    return validExpiry(date) && date >= coverage.from && date <= coverage.to;
  }

  function normalizeImportBatch(input, strategyId) {
    if (!input) return null;
    if (input.sourceType !== "ZERODHA_TRADEBOOK_CSV" || typeof input.fingerprint !== "string" || !input.fingerprint ||
      !input.coverage || !validExpiry(input.coverage.from) || !validExpiry(input.coverage.to) ||
      input.coverage.from > input.coverage.to || typeof input.acceptedAt !== "string" || !input.acceptedAt ||
      typeof input.confirmedAt !== "string" || !input.confirmedAt) {
      throw new Error("invalid Zerodha import batch evidence");
    }
    return {
      strategyId,
      sourceType: "ZERODHA_TRADEBOOK_CSV",
      fingerprint: input.fingerprint,
      coverage: clone(input.coverage),
      acceptedAt: input.acceptedAt,
      confirmedAt: input.confirmedAt
    };
  }

  function relatedContracts(strategy, ledger) {
    return new Set(strategy.allocations.map((allocation) => allocation.contractId)
      .concat(strategy.fillIds.map((fillId) => ledger.importedTrades.find((trade) => trade.id === fillId))
        .filter(Boolean).map((trade) => trade.contractId)));
  }

  function assertTradeProvenance(trade, strategy, allowedContracts) {
    if (!validTrade(trade)) throw new Error("invalid imported NIFTY trade");
    if (trade.expiry !== strategy.expiry) throw new Error("fill expiry must match strategy expiry");
    if (!allowedContracts.has(trade.contractId)) throw new Error("fill contract must relate to strategy allocation or history");
  }

  function assignFills(ledger, input) {
    const next = nextLedger(ledger);
    if (!input || typeof input.strategyId !== "string" || !Array.isArray(input.trades) || !Array.isArray(input.fillIds)) {
      throw new Error("fills require strategy, trades, and fill ids");
    }
    const strategy = strategyFor(next, input.strategyId);
    const batch = normalizeImportBatch(input.importBatch, strategy.id);
    const allowedContracts = relatedContracts(strategy, next);
    input.trades.forEach((trade) => assertTradeProvenance(trade, strategy, allowedContracts));
    const ids = new Set(next.importedTrades.map((trade) => trade.id));
    const fingerprints = new Set(next.importedTrades.map(fingerprint));
    const summary = { type: "IMPORT_SUMMARY", accepted: 0, duplicateIds: 0, duplicateFingerprints: 0 };
    if (batch) {
      const existingBatch = next.importBatches.find((candidate) => candidate.fingerprint === batch.fingerprint);
      if (existingBatch && JSON.stringify(existingBatch) !== JSON.stringify(batch)) throw new Error("import batch fingerprint already exists");
      if (!existingBatch) {
        next.importBatches.push(clone(batch));
        next.audit.push({ type: "IMPORT_BATCH_ACCEPTED", fingerprint: batch.fingerprint, sourceType: batch.sourceType, coverage: clone(batch.coverage), acceptedAt: batch.acceptedAt });
        next.audit.push({ type: "IMPORT_BATCH_CONFIRMED", fingerprint: batch.fingerprint, confirmedAt: batch.confirmedAt });
      }
    }
    for (const sourceTrade of input.trades) {
      const trade = clone(sourceTrade);
      trade.id = trade.id || fingerprint(trade);
      trade.strategyId = strategy.id;
      if (batch) trade.importBatchFingerprint = batch.fingerprint;
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
      assertTradeProvenance(known.get(fillId), strategy, allowedContracts);
      if (!strategy.fillIds.includes(fillId)) strategy.fillIds.push(fillId);
    }
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

  function evidenceComplete(strategy, fills, ledger) {
    if (!fills.length || !Array.isArray(ledger.importBatches) || !Array.isArray(ledger.historyGaps)) return false;
    if (ledger.historyGaps.some((gap) => !gap.strategyId || gap.strategyId === strategy.id)) return false;
    const batches = new Map(ledger.importBatches.map((batch) => [batch.fingerprint, batch]));
    return fills.every((fill) => {
      const batch = batches.get(fill.importBatchFingerprint);
      return fill.strategyId === strategy.id && fill.underlying === "NIFTY" && fill.expiry === strategy.expiry &&
        batch && batch.strategyId === strategy.id && batch.sourceType === "ZERODHA_TRADEBOOK_CSV" &&
        typeof batch.acceptedAt === "string" && batch.acceptedAt && typeof batch.confirmedAt === "string" && batch.confirmedAt &&
        batch.coverage && dateInCoverage(fill.timestamp, batch.coverage);
    });
  }

  function strategyRiskInput(ledger, strategyId) {
    assertLedger(ledger);
    const strategy = strategyFor(ledger, strategyId);
    const fills = fillsFor(strategy, ledger);
    const legState = [];
    let entryComplete = true;
    let fillsReconcile = true;
    let provenanceValid = true;
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
      if (contractFills.some((fill) => !validTrade(fill) || fill.underlying !== "NIFTY" || fill.expiry !== strategy.expiry || fill.strategyId !== strategy.id)) {
        provenanceValid = false;
      }
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
    if (fills.some((fill) => !validTrade(fill) || fill.underlying !== "NIFTY" || fill.expiry !== strategy.expiry || fill.strategyId !== strategy.id)) {
      provenanceValid = false;
    }
    const complete = strategy.allocations.length > 0 && fillsReconcile && provenanceValid && evidenceComplete(strategy, fills, ledger);
    const consistent = entryComplete && fillsReconcile && provenanceValid;
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
