(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.OptionsMarginEvidence = api;
})(typeof globalThis === "undefined" ? this : globalThis, function () {
  "use strict";

  function finite(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  function requestLeg(entry) {
    if (!entry || typeof entry.id !== "string" || !entry.id
      || entry.underlying !== "NIFTY" || !/^\d{4}-\d{2}-\d{2}$/.test(entry.expiry || "")
      || !["CALL", "PUT"].includes(entry.optionType)
      || !["BUY", "SELL"].includes(entry.direction)
      || finite(entry.strike) === null || entry.strike <= 0
      || !Number.isInteger(entry.lots) || entry.lots <= 0
      || !Number.isInteger(entry.lotSize) || entry.lotSize <= 0
      || finite(entry.premium) === null || entry.premium < 0) return null;
    return {
      entryId: entry.id,
      underlying: entry.underlying,
      expiry: entry.expiry,
      strike: entry.strike,
      optionType: entry.optionType,
      direction: entry.direction,
      lots: entry.lots,
      lotSize: entry.lotSize,
      premium: entry.premium,
      product: typeof entry.product === "string" && entry.product ? entry.product : "NRML"
    };
  }

  function fingerprint(legs) {
    const serialized = JSON.stringify((Array.isArray(legs) ? legs : []).map((entry) => requestLeg({
      ...entry,
      id: entry.entryId || entry.id
    })).filter(Boolean));
    let hash = 0x811c9dc5;
    for (const character of serialized) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 0x01000193);
    }
    return `v1:${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  function strategyLegs(book, strategy) {
    const direct = Array.isArray(strategy?.legIds) ? strategy.legIds : null;
    const version = book?.versions?.[strategy?.currentVersionId];
    const ids = direct || (Array.isArray(version?.legIds) ? version.legIds : []);
    return ids.map((id) => requestLeg(book?.legs?.[id])).filter(Boolean);
  }

  function requestsForBook(book, selectedIds = []) {
    const active = Object.values(book?.strategies || {})
      .filter((strategy) => strategy?.status === "ACTIVE")
      .sort((left, right) => Number(left.sequence || 0) - Number(right.sequence || 0)
        || String(left.id).localeCompare(String(right.id)));
    const byId = new Map(active.map((strategy) => [strategy.id, strategy]));
    const requests = active.flatMap((strategy) => {
      const legs = strategyLegs(book, strategy);
      return legs.length ? [{ key: `strategy:${strategy.id}`, legs, fingerprint: fingerprint(legs) }] : [];
    });
    const selected = [...new Set(selectedIds)].filter((id) => byId.has(id)).sort();
    if (selected.length >= 2) {
      const legs = selected.flatMap((id) => strategyLegs(book, byId.get(id)));
      if (legs.length) requests.push({
        key: `selection:${selected.join("+")}`,
        legs,
        fingerprint: fingerprint(legs)
      });
    }
    return requests;
  }

  function normalizeFunds(value) {
    if (!value || [value.availableMargin, value.usedMargin, value.availableCash]
      .some((item) => finite(item) === null)) return null;
    return {
      availableMargin: value.availableMargin,
      usedMargin: value.usedMargin,
      availableCash: value.availableCash
    };
  }

  function normalizeRefreshEvidence(value) {
    const updatedAt = typeof value?.updatedAt === "string" && Number.isFinite(Date.parse(value.updatedAt))
      ? value.updatedAt : null;
    const baskets = {};
    if (updatedAt) (Array.isArray(value?.baskets) ? value.baskets : []).forEach((basket) => {
      if (!basket || typeof basket.key !== "string" || !basket.key
        || typeof basket.fingerprint !== "string" || !basket.fingerprint
        || finite(basket.total) === null || basket.total < 0) return;
      const legs = (Array.isArray(basket.legs) ? basket.legs : []).flatMap((item) =>
        item && typeof item.entryId === "string" && item.entryId
          && finite(item.total) !== null && item.total >= 0
          ? [{ entryId: item.entryId, total: item.total }] : []);
      baskets[basket.key] = { fingerprint: basket.fingerprint, total: basket.total, legs };
    });
    return { version: 1, updatedAt, funds: normalizeFunds(value?.funds), baskets };
  }

  function resolveBasket(evidence, key, legs) {
    const basket = evidence?.version === 1 ? evidence?.baskets?.[key] : null;
    return basket && basket.fingerprint === fingerprint(legs) ? basket : null;
  }

  function formatMoney(value) {
    const numeric = finite(value);
    if (numeric === null) return "—";
    const sign = numeric < 0 ? "-" : "";
    const absolute = Math.abs(numeric);
    if (absolute >= 100000) return `${sign}₹${(absolute / 100000).toFixed(2)}L`;
    if (absolute >= 1000) return `${sign}₹${(absolute / 1000).toFixed(2)}K`;
    return `${sign}₹${absolute.toFixed(2)}`;
  }

  return { fingerprint, formatMoney, normalizeRefreshEvidence, requestsForBook, resolveBasket };
});
