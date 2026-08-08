(function (root) {
  "use strict";

  const strategyStore = typeof module !== "undefined" && module.exports
    ? require("./strategy-store.js")
    : root.OptionsStrategyStore;
  const manualPayoff = typeof module !== "undefined" && module.exports
    ? require("./manual-payoff.js")
    : root.NiftyManualPayoff;
  const sellerRisk = typeof module !== "undefined" && module.exports
    ? require("./seller-risk.js")
    : root.NiftySellerRisk;

  function createSelection() {
    return { selectedIds: [], compare: false };
  }

  function normalizeSelection(selection) {
    return {
      selectedIds: [...new Set(Array.isArray(selection?.selectedIds)
        ? selection.selectedIds.filter((id) => typeof id === "string" && id)
        : [])],
      compare: selection?.compare === true
    };
  }

  function toggle(selection, strategyId) {
    const next = normalizeSelection(selection);
    if (typeof strategyId !== "string" || !strategyId) return next;
    next.selectedIds = next.selectedIds.includes(strategyId)
      ? next.selectedIds.filter((id) => id !== strategyId)
      : [...next.selectedIds, strategyId];
    return next;
  }

  function setCompare(selection, compare) {
    return { ...normalizeSelection(selection), compare: compare === true };
  }

  function emptyResult(status, selectedIds, extra = {}) {
    return {
      status,
      selectedIds: [...selectedIds],
      entries: [],
      breakEvens: [],
      currentPnl: null,
      maxProfit: null,
      maxLoss: null,
      winRate: null,
      knownCharges: 0,
      chargesComplete: false,
      disclosure: null,
      missingQuotes: [],
      missingLotSizes: [],
      ...extra
    };
  }

  function chargeTotal(entry) {
    return Array.isArray(entry.charges)
      ? entry.charges.reduce((sum, charge) => sum + (Number.isFinite(Number(charge?.amount)) ? Number(charge.amount) : 0), 0)
      : 0;
  }

  function buildPreviewFromGroups(groups, quoteRows, options = {}) {
    const selected = Array.isArray(groups) ? groups.filter(Boolean) : [];
    const ids = [...new Set(selected.map((item) => item.id).filter(Boolean))];
    if (ids.length < 2) return emptyResult("SELECT_MORE", ids);
    const first = selected[0];
    const groupUnderlying = (item) => item?.underlying || item?.entries?.[0]?.underlying || "";
    const firstUnderlying = groupUnderlying(first);
    if (!first || selected.some((item) => item.expiry !== first.expiry
      || !Array.isArray(item.entries)
      || (firstUnderlying && groupUnderlying(item)
        ? groupUnderlying(item) !== firstUnderlying
        : item.instrumentKey !== first.instrumentKey))) {
      return emptyResult("INCOMPATIBLE", ids);
    }

    const entries = [...new Map(selected.flatMap((item) => item.entries)
      .map((entry) => [entry.id, entry])).values()];
    const missingLotSizes = entries
      .filter((entry) => manualPayoff.lotSizeForEntry(entry) === null)
      .map((entry) => ({ legId: entry.id, source: entry.source || null }));
    const rows = Array.isArray(quoteRows) ? quoteRows : [];
    const missingQuotes = [];
    const liveRows = new Map();
    entries.forEach((entry) => {
      const row = rows.find((candidate) => Number(candidate?.strike) === Number(entry.strike));
      const live = Number(entry.optionType === "CALL" ? row?.call : row?.put);
      if (!row || !Number.isFinite(live) || live <= 0) {
        missingQuotes.push({ legId: entry.id, strike: entry.strike, optionType: entry.optionType });
      } else {
        liveRows.set(entry.id, row);
      }
    });

    const knownCharges = entries.reduce((sum, entry) => sum + chargeTotal(entry), 0);
    const chargesComplete = entries.every((entry) => entry.chargesComplete === true);
    const disclosure = chargesComplete ? null : "EXCLUDING UNKNOWN CHARGES";
    if (missingLotSizes.length) {
      return emptyResult("INCOMPLETE", ids, {
        entries,
        knownCharges,
        chargesComplete,
        disclosure,
        missingQuotes,
        missingLotSizes
      });
    }

    const breakEvenResult = manualPayoff.breakEvens(entries, knownCharges);
    const riskMap = sellerRisk?.currentRiskMap?.({
      legs: entries.map((entry) => ({
        id: entry.id,
        strike: entry.strike,
        optionType: entry.optionType === "CALL" ? "CE" : "PE",
        signedLots: entry.direction === "BUY" ? entry.lots : -entry.lots,
        lotSize: manualPayoff.lotSizeForEntry(entry),
        entryPrice: entry.premium
      })),
      charges: knownCharges
    });
    const savedEvidence = {
      entries,
      breakEvens: breakEvenResult.status === "invalid" ? [] : breakEvenResult.points,
      maxProfit: riskMap?.status === "INVALID_INPUT" ? null : riskMap?.maxProfit ?? null,
      maxLoss: riskMap?.status === "INVALID_INPUT" ? null : riskMap?.maxLoss ?? null,
      winRate: null,
      knownCharges,
      chargesComplete,
      disclosure,
      missingQuotes,
      missingLotSizes
    };
    if (breakEvenResult.status === "invalid") return emptyResult("INCOMPLETE", ids, savedEvidence);

    const quoteUpdatedAt = Date.parse(options.quoteUpdatedAt || "");
    const now = Date.parse(options.now || new Date().toISOString());
    const maxQuoteAgeMs = Number(options.maxQuoteAgeMs);
    if (Number.isFinite(quoteUpdatedAt) && Number.isFinite(now) && Number.isFinite(maxQuoteAgeMs)
      && maxQuoteAgeMs >= 0 && now - quoteUpdatedAt > maxQuoteAgeMs) {
      return emptyResult("INCOMPLETE", ids, {
        ...savedEvidence,
        currentPnl: null,
        disclosure: "LIVE QUOTES STALE · REFRESH REQUIRED"
      });
    }
    if (missingQuotes.length) return emptyResult("INCOMPLETE", ids, savedEvidence);

    const pnls = entries.map((entry) => manualPayoff.positionPnl(entry, liveRows.get(entry.id)));
    if (pnls.some((value) => value === null)) {
      return emptyResult("INCOMPLETE", ids, savedEvidence);
    }
    return {
      status: "OK",
      selectedIds: ids,
      instrumentKey: first.instrumentKey,
      underlying: firstUnderlying,
      expiry: first.expiry,
      entries,
      breakEvens: breakEvenResult.points,
      currentPnl: pnls.reduce((sum, value) => sum + value, 0) - knownCharges,
      maxProfit: savedEvidence.maxProfit,
      maxLoss: savedEvidence.maxLoss,
      winRate: null,
      knownCharges,
      chargesComplete,
      disclosure,
      missingQuotes: [],
      missingLotSizes: []
    };
  }

  function buildPreview(book, selectedIds, quoteRows, options = {}) {
    const ids = [...new Set(Array.isArray(selectedIds) ? selectedIds.filter(Boolean) : [])];
    if (ids.length < 2) return emptyResult("SELECT_MORE", ids);
    const strategies = ids.map((id) => strategyStore.strategyById(book, id));
    if (strategies.some((item) => !item || item.status !== "ACTIVE")) {
      return emptyResult("INCOMPATIBLE", ids);
    }
    return buildPreviewFromGroups(strategies.map((strategy) => ({
      id: strategy.id,
      instrumentKey: strategy.instrumentKey,
      underlying: strategy.underlying,
      expiry: strategy.expiry,
      entries: strategyStore.legsForStrategy(book, strategy.id)
    })), quoteRows, options);
  }

  function displayLevels(preview, prefix = "COMBINED BE") {
    return (Array.isArray(preview?.breakEvens) ? preview.breakEvens : []).map((exact) => ({
      kind: "combined",
      exact,
      rounded: Math.round(exact),
      label: `${prefix} ${Math.round(exact).toLocaleString("en-IN")}`
    }));
  }

  const api = { createSelection, toggle, setCompare, buildPreview, buildPreviewFromGroups, displayLevels };
  root.OptionsStrategyPreview = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
