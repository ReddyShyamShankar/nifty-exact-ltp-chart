(function (root) {
  "use strict";
  const STORAGE_KEY = "manualPlans";
  const VERSION = 1;
  const QUARANTINE_KEY = "quarantine";
  const finite = (value) => value === null || value === undefined || value === "" || typeof value === "boolean"
    ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
  const snapshot = (value) => { const number = finite(value); return number !== null && number >= 0 ? number : null; };
  const emptyStore = () => ({ version: VERSION, plans: {}, [QUARANTINE_KEY]: [] });
  const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

  function cloneRaw(value) {
    if (Array.isArray(value)) return value.map(cloneRaw);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneRaw(child)]));
    }
    return value;
  }

  function isIsoDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }

  function isIsoTimestamp(value) {
    if (typeof value !== "string") return false;
    const match = value.match(/^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(Z|([+-])(\d{2}):(\d{2}))$/);
    if (!match || !isIsoDate(match[1])) return false;
    if (match[3] !== "Z") {
      const offsetHours = Number(match[5]);
      const offsetMinutes = Number(match[6]);
      if (offsetHours > 14 || offsetMinutes > 59 || (offsetHours === 14 && offsetMinutes !== 0)) return false;
    }
    return Number.isFinite(Date.parse(value));
  }

  function normalizeEntry(input) {
    const strike = finite(input?.strike);
    const lots = finite(input?.lots);
    const premium = finite(input?.premium);
    const callSnapshot = snapshot(input?.callSnapshot);
    const putSnapshot = snapshot(input?.putSnapshot);
    if (!input || typeof input.id !== "string" || !input.id || input.underlying !== "NIFTY"
      || !isIsoDate(input.expiry)
      || !["CALL", "PUT"].includes(input.optionType) || !["BUY", "SELL"].includes(input.direction)
      || strike === null || strike <= 0 || lots === null || !Number.isInteger(lots) || lots <= 0
      || premium === null || premium < 0
      || (input.optionType === "CALL" ? callSnapshot === null : putSnapshot === null)
      || !isIsoTimestamp(input.createdAt) || !isIsoTimestamp(input.updatedAt)) return null;
    return { id: input.id, underlying: "NIFTY", expiry: input.expiry, strike, optionType: input.optionType,
      direction: input.direction, lots, premium, callSnapshot,
      putSnapshot, createdAt: input.createdAt, updatedAt: input.updatedAt };
  }

  function normalizeStore(input) {
    const next = emptyStore();
    if (input === undefined) return next;
    if (!isRecord(input) || !Object.hasOwn(input, "plans") || !isRecord(input.plans)) {
      next[QUARANTINE_KEY].push({ planExpiry: null, raw: cloneRaw(input) });
      return next;
    }
    const existingQuarantine = Array.isArray(input?.[QUARANTINE_KEY]) ? input[QUARANTINE_KEY] : [];
    existingQuarantine.forEach((record) => {
      if (record && typeof record === "object" && Object.hasOwn(record, "raw")) {
        next[QUARANTINE_KEY].push({
          planExpiry: typeof record.planExpiry === "string" ? record.planExpiry : null,
          raw: cloneRaw(record.raw)
        });
      } else {
        next[QUARANTINE_KEY].push({ planExpiry: null, raw: cloneRaw(record) });
      }
    });
    for (const [expiry, plan] of Object.entries(input.plans)) {
      if (!Array.isArray(plan?.entries)) {
        next[QUARANTINE_KEY].push({ planExpiry: expiry, raw: cloneRaw(plan) });
        continue;
      }
      const entries = [];
      plan.entries.forEach((raw) => {
        const entry = normalizeEntry(raw);
        if (entry && entry.expiry === expiry) entries.push(entry);
        else next[QUARANTINE_KEY].push({ planExpiry: expiry, raw: cloneRaw(raw) });
      });
      if (entries.length) next.plans[expiry] = { entries };
    }
    return next;
  }
  function entriesFor(store, expiry) { return normalizeStore(store).plans[expiry]?.entries || []; }
  function invalidEntries(store, expiry) {
    const entries = normalizeStore(store)[QUARANTINE_KEY];
    return typeof expiry === "string" ? entries.filter((item) => item.planExpiry === expiry) : entries;
  }
  function invalidCount(store, expiry) { return invalidEntries(store, expiry).length; }
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
  function removeEntries(store, entryIds) {
    const ids = new Set(Array.isArray(entryIds) ? entryIds.filter((id) => typeof id === "string" && id) : []);
    const next = normalizeStore(store);
    if (!ids.size) return next;
    for (const [expiry, plan] of Object.entries(next.plans)) {
      const remaining = plan.entries.filter((entry) => !ids.has(entry.id));
      if (remaining.length) next.plans[expiry] = { entries: remaining };
      else delete next.plans[expiry];
    }
    return next;
  }
  function groupByStrike(entries) {
    const groups = new Map();
    entries.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
      .forEach((entry) => groups.set(entry.strike, [...(groups.get(entry.strike) || []), entry]));
    return groups;
  }
  const api = {
    STORAGE_KEY,
    QUARANTINE_KEY,
    emptyStore,
    isIsoDate,
    isIsoTimestamp,
    normalizeEntry,
    normalizeStore,
    entriesFor,
    invalidEntries,
    invalidCount,
    upsertEntry,
    removeEntry,
    removeEntries,
    groupByStrike
  };
  root.NiftyManualPlan = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
