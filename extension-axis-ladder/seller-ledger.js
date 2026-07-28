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
      tradeEvidence: [],
      tradeReviews: [],
      fillAssignments: [],
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
    if (!Array.isArray(next.tradeEvidence)) next.tradeEvidence = [];
    if (!Array.isArray(next.tradeReviews)) next.tradeReviews = [];
    if (!Array.isArray(next.fillAssignments)) next.fillAssignments = [];
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

  function optionIdentity(symbol, expiry) {
    const match = typeof symbol === "string" && symbol.trim().toUpperCase().match(/^NIFTY(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{4,6})(CE|PE)$/);
    const months = { JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06", JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12" };
    if (!match || !validExpiry(expiry) || expiry.slice(2, 4) !== match[1] || expiry.slice(5, 7) !== months[match[2]]) return null;
    return { symbol: symbol.trim().toUpperCase(), strike: Number(match[3]), optionType: match[4] };
  }

  function validatePosition(input) {
    const identity = input && optionIdentity(input.tradingsymbol, input.expiry);
    if (!input || typeof input.contractId !== "string" || !input.contractId || input.exchange !== "NFO" ||
      (Object.prototype.hasOwnProperty.call(input, "underlying") && input.underlying !== "NIFTY") || !identity ||
      input.contractId !== `NFO:${identity.symbol}` || input.strike !== identity.strike || input.optionType !== identity.optionType ||
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
    const identity = trade && optionIdentity(trade.tradingsymbol, trade.expiry);
    return trade && typeof trade.contractId === "string" && trade.contractId &&
      trade.underlying === "NIFTY" && trade.exchange === "NFO" && identity &&
      trade.contractId === `NFO:${identity.symbol}` && trade.strike === identity.strike && trade.optionType === identity.optionType &&
      (trade.transactionType === "BUY" || trade.transactionType === "SELL") &&
      Number.isFinite(trade.quantity) && trade.quantity > 0 &&
      Number.isFinite(trade.price) && trade.price >= 0;
  }

  function dateInCoverage(timestamp, coverage) {
    const date = typeof timestamp === "string" ? timestamp.slice(0, 10) : "";
    return validExpiry(date) && date >= coverage.from && date <= coverage.to;
  }

  function ingestBrokerTrades(ledger, input) {
    const next = nextLedger(ledger);
    if (!input || !Array.isArray(input.trades) || typeof input.observedAt !== "string" ||
      !Number.isFinite(Date.parse(input.observedAt))) {
      throw new Error("current-day trades require an observed timestamp");
    }
    const byId = new Map(next.importedTrades.map((trade) => [trade.id, trade]));
    const byFingerprint = new Map(next.importedTrades.map((trade) => [fingerprint(trade), trade]));
    for (const sourceTrade of input.trades) {
      if (!validTrade(sourceTrade) || typeof sourceTrade.id !== "string" || !sourceTrade.id) {
        throw new Error("invalid current-day NIFTY trade");
      }
      const trade = clone(sourceTrade);
      const content = fingerprint(trade);
      const sameId = byId.get(trade.id);
      if (sameId && fingerprint(sameId) !== content) throw new Error("immutable trade ID conflict");
      const canonical = sameId || byFingerprint.get(content) || trade;
      if (!sameId && !byFingerprint.has(content)) {
        next.importedTrades.push(canonical);
        byId.set(canonical.id, canonical);
        byFingerprint.set(content, canonical);
      }
      if (!next.tradeEvidence.some((evidence) => evidence.fillId === canonical.id && evidence.sourceKind === "ZERODHA_CURRENT_DAY")) {
        next.tradeEvidence.push({ fillId: canonical.id, sourceKind: "ZERODHA_CURRENT_DAY", observedAt: input.observedAt });
      }
      if (!ownerFor(next, canonical.id) && !next.tradeReviews.some((review) => review.fillId === canonical.id)) {
        next.tradeReviews.push({
          fillId: canonical.id,
          contractId: canonical.contractId,
          expiry: canonical.expiry,
          reason: "OWNERSHIP_REVIEW_REQUIRED"
        });
      }
    }
    next.audit.push({ type: "CURRENT_DAY_TRADES_INGESTED", observedAt: input.observedAt, tradeIds: input.trades.map((trade) => trade.id) });
    return next;
  }

  function normalizeImportBatch(input) {
    if (!input) return null;
    if (input.sourceKind !== "ZERODHA_TRADEBOOK_CSV" || typeof input.fingerprint !== "string" || !input.fingerprint ||
      !input.coverage || !validExpiry(input.coverage.from) || !validExpiry(input.coverage.to) ||
      input.coverage.from > input.coverage.to || typeof input.acceptedAt !== "string" || !input.acceptedAt ||
      typeof input.confirmedAt !== "string" || !input.confirmedAt) {
      throw new Error("invalid Zerodha import batch evidence");
    }
    return {
      sourceKind: "ZERODHA_TRADEBOOK_CSV",
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
    if (trade.strategyId && trade.strategyId !== strategy.id) throw new Error("fill already has another strategy owner");
  }

  function ownerFor(ledger, fillId) {
    const trade = ledger.importedTrades.find((candidate) => candidate.id === fillId);
    const owners = new Set();
    if (trade && trade.strategyId) owners.add(trade.strategyId);
    ledger.fillAssignments.filter((assignment) => assignment.fillId === fillId).forEach((assignment) => owners.add(assignment.strategyId));
    ledger.strategies.filter((strategy) => strategy.fillIds.includes(fillId)).forEach((strategy) => owners.add(strategy.id));
    return owners.size === 1 ? Array.from(owners)[0] : owners.size > 1 ? "CONFLICT" : null;
  }

  function assignFills(ledger, input) {
    const next = nextLedger(ledger);
    if (!input || typeof input.strategyId !== "string" || !Array.isArray(input.trades) || !Array.isArray(input.fillIds)) {
      throw new Error("fills require strategy, trades, and fill ids");
    }
    const strategy = strategyFor(next, input.strategyId);
    const batch = normalizeImportBatch(input.importBatch);
    const allowedContracts = relatedContracts(strategy, next);
    input.trades.forEach((trade) => assertTradeProvenance(trade, strategy, allowedContracts));
    const byId = new Map(next.importedTrades.map((trade) => [trade.id, trade]));
    const byFingerprint = new Map(next.importedTrades.map((trade) => [fingerprint(trade), trade]));
    const canonicalByRequestedId = new Map();
    const summary = { type: "IMPORT_SUMMARY", accepted: 0, duplicateIds: 0, duplicateFingerprints: 0 };
    if (batch) {
      const existingBatch = next.importBatches.find((candidate) => candidate.fingerprint === batch.fingerprint);
      if (existingBatch && JSON.stringify(existingBatch) !== JSON.stringify(batch)) throw new Error("import batch fingerprint already exists");
      if (!existingBatch) {
        next.importBatches.push(clone(batch));
        next.audit.push({ type: "IMPORT_BATCH_ACCEPTED", fingerprint: batch.fingerprint, sourceKind: batch.sourceKind, coverage: clone(batch.coverage), acceptedAt: batch.acceptedAt });
        next.audit.push({ type: "IMPORT_BATCH_CONFIRMED", fingerprint: batch.fingerprint, confirmedAt: batch.confirmedAt });
      }
    }
    for (const sourceTrade of input.trades) {
      const trade = clone(sourceTrade);
      trade.id = trade.id || fingerprint(trade);
      const content = fingerprint(trade);
      const sameId = byId.get(trade.id);
      if (sameId && fingerprint(sameId) !== content) throw new Error("immutable trade ID conflict");
      const sameContent = byFingerprint.get(content);
      const canonical = sameId || sameContent || trade;
      canonicalByRequestedId.set(trade.id, canonical.id);
      if (sameId) summary.duplicateIds += 1;
      else if (sameContent) summary.duplicateFingerprints += 1;
      else {
        if (batch) trade.importBatchFingerprint = batch.fingerprint;
        next.importedTrades.push(trade);
        byId.set(trade.id, trade);
        byFingerprint.set(content, trade);
        summary.accepted += 1;
      }
      if (batch && !next.tradeEvidence.some((evidence) => evidence.fillId === canonical.id &&
        evidence.sourceKind === "ZERODHA_TRADEBOOK_CSV" && evidence.importBatchFingerprint === batch.fingerprint)) {
        next.tradeEvidence.push({
          fillId: canonical.id,
          sourceKind: "ZERODHA_TRADEBOOK_CSV",
          importBatchFingerprint: batch.fingerprint
        });
      }
    }
    const known = new Map(next.importedTrades.map((trade) => [trade.id, trade]));
    for (const requestedFillId of input.fillIds) {
      const fillId = canonicalByRequestedId.get(requestedFillId) || requestedFillId;
      if (!known.has(fillId)) throw new Error("unknown imported fill");
      const owner = ownerFor(next, fillId);
      if (owner && owner !== strategy.id) throw new Error("fill already has another strategy owner");
      assertTradeProvenance(known.get(fillId), strategy, allowedContracts);
      if (!owner) {
        next.fillAssignments.push({ fillId, strategyId: strategy.id });
        next.audit.push({ type: "FILL_ASSIGNED", fillId, strategyId: strategy.id });
      }
      if (!strategy.fillIds.includes(fillId)) strategy.fillIds.push(fillId);
      next.tradeReviews = next.tradeReviews.filter((review) => review.fillId !== fillId);
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

  function recordHistoryGap(ledger, input) {
    const next = nextLedger(ledger);
    if (!input || typeof input.strategyId !== "string" || !validExpiry(input.from) || !validExpiry(input.to) ||
      input.from > input.to || typeof input.reason !== "string" || !input.reason) {
      throw new Error("history gap requires strategy, date range, and reason");
    }
    strategyFor(next, input.strategyId);
    const gap = clone(input);
    next.historyGaps.push(gap);
    next.audit.push({ type: "HISTORY_GAP_RECORDED", ...gap });
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
    const evidence = Array.isArray(ledger.tradeEvidence) ? ledger.tradeEvidence : [];
    const batchForFill = (fill) => {
      const fingerprints = fill.importBatchFingerprint ? [fill.importBatchFingerprint] : [];
      evidence.filter((item) => item.fillId === fill.id && item.sourceKind === "ZERODHA_TRADEBOOK_CSV")
        .forEach((item) => fingerprints.push(item.importBatchFingerprint));
      return fingerprints.map((batchFingerprint) => batches.get(batchFingerprint))
        .find((batch) => batch?.coverage && dateInCoverage(fill.timestamp, batch.coverage));
    };
    const validBatches = fills.map(batchForFill);
    const fillsCovered = fills.every((fill) => {
      const batch = batchForFill(fill);
      return ownerFor(ledger, fill.id) === strategy.id && fill.underlying === "NIFTY" && fill.expiry === strategy.expiry &&
        batch && batch.sourceKind === "ZERODHA_TRADEBOOK_CSV" &&
        typeof batch.acceptedAt === "string" && batch.acceptedAt && typeof batch.confirmedAt === "string" && batch.confirmedAt &&
        batch.coverage && dateInCoverage(fill.timestamp, batch.coverage);
    });
    if (!fillsCovered || validBatches.some((batch) => !batch)) return false;
    const snapshotDates = strategy.snapshots.map((snapshot) => typeof snapshot.at === "string" ? snapshot.at.slice(0, 10) : "").filter(validExpiry);
    if (!snapshotDates.length) return false;
    const fillDates = fills.map((fill) => fill.timestamp.slice(0, 10)).filter(validExpiry);
    const earliest = fillDates.slice().sort()[0];
    const target = fillDates.concat(snapshotDates).sort().at(-1);
    const intervals = Array.from(new Map(validBatches.map((batch) => [batch.fingerprint, batch.coverage])).values())
      .sort((left, right) => left.from.localeCompare(right.from));
    if (!intervals.length || intervals[0].from > earliest) return false;
    let coveredTo = intervals[0].to;
    for (let index = 1; index < intervals.length; index += 1) {
      const nextStart = new Date(`${coveredTo}T00:00:00Z`);
      nextStart.setUTCDate(nextStart.getUTCDate() + 1);
      const contiguousThrough = nextStart.toISOString().slice(0, 10);
      if (intervals[index].from > contiguousThrough) return false;
      if (intervals[index].to > coveredTo) coveredTo = intervals[index].to;
    }
    return coveredTo >= target;
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
      if (contractFills.some((fill) => !validTrade(fill) || fill.underlying !== "NIFTY" || fill.expiry !== strategy.expiry || ownerFor(ledger, fill.id) !== strategy.id)) {
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
    if (fills.some((fill) => !validTrade(fill) || fill.underlying !== "NIFTY" || fill.expiry !== strategy.expiry || ownerFor(ledger, fill.id) !== strategy.id)) {
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

  const api = { emptyLedger, createStrategy, reconcilePositions, ingestBrokerTrades, allocateLots, assignFills, acceptSnapshot, recordHistoryGap, strategyRiskInput };
  root.NiftySellerLedger = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
