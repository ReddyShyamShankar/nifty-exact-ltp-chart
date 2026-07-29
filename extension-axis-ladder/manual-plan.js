(function (root) {
  "use strict";
  const STORAGE_KEY = "manualPlans";
  const VERSION = 1;
  const finite = (value) => value === null || value === undefined || value === "" || typeof value === "boolean"
    ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
  const snapshot = (value) => { const number = finite(value); return number !== null && number >= 0 ? number : null; };
  const emptyStore = () => ({ version: VERSION, plans: {} });

  function normalizeEntry(input) {
    const strike = finite(input?.strike);
    const lots = finite(input?.lots);
    const premium = finite(input?.premium);
    if (!input || typeof input.id !== "string" || !input.id || input.underlying !== "NIFTY"
      || typeof input.expiry !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.expiry)
      || !["CALL", "PUT"].includes(input.optionType) || !["BUY", "SELL"].includes(input.direction)
      || strike === null || strike <= 0 || lots === null || !Number.isInteger(lots) || lots <= 0
      || premium === null || premium < 0 || typeof input.createdAt !== "string" || typeof input.updatedAt !== "string") return null;
    return { id: input.id, underlying: "NIFTY", expiry: input.expiry, strike, optionType: input.optionType,
      direction: input.direction, lots, premium, callSnapshot: snapshot(input.callSnapshot),
      putSnapshot: snapshot(input.putSnapshot), createdAt: input.createdAt, updatedAt: input.updatedAt };
  }

  function normalizeStore(input) {
    const next = emptyStore();
    for (const [expiry, plan] of Object.entries(input?.plans || {})) {
      const entries = (Array.isArray(plan?.entries) ? plan.entries : []).map(normalizeEntry).filter(Boolean)
        .filter((entry) => entry.expiry === expiry);
      if (entries.length) next.plans[expiry] = { entries };
    }
    return next;
  }
  function entriesFor(store, expiry) { return normalizeStore(store).plans[expiry]?.entries || []; }
  function upsertEntry(store, input) {
    const entry = normalizeEntry(input); if (!entry) throw new Error("invalid manual entry");
    const next = normalizeStore(store); const current = entriesFor(next, entry.expiry);
    const prior = current.find((item) => item.id === entry.id);
    const saved = prior ? { ...entry, createdAt: prior.createdAt } : entry;
    next.plans[entry.expiry] = { entries: [...current.filter((item) => item.id !== entry.id), saved] };
    return next;
  }
  function removeEntry(store, expiry, entryId) {
    const next = normalizeStore(store); const remaining = entriesFor(next, expiry).filter((entry) => entry.id !== entryId);
    if (remaining.length) next.plans[expiry] = { entries: remaining }; else delete next.plans[expiry];
    return next;
  }
  function groupByStrike(entries) {
    const groups = new Map();
    entries.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
      .forEach((entry) => groups.set(entry.strike, [...(groups.get(entry.strike) || []), entry]));
    return groups;
  }
  const api = { STORAGE_KEY, emptyStore, normalizeEntry, normalizeStore, entriesFor, upsertEntry, removeEntry, groupByStrike };
  root.NiftyManualPlan = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
