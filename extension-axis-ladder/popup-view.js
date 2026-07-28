(function (root, factory) {
  "use strict";

  const dependencies = typeof module !== "undefined" && module.exports
    ? { risk: require("./seller-risk.js"), ledger: require("./seller-ledger.js") }
    : { risk: root.NiftySellerRisk, ledger: root.NiftySellerLedger };
  const api = factory(dependencies);
  root.NiftySellerPopupView = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis, function ({ risk, ledger: ledgerApi }) {
  const STALE_AFTER_MS = 15 * 60 * 1000;

  function finite(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function number(value) {
    return finite(value)
      ? value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : "—";
  }

  function rupees(value, { signed = false } = {}) {
    if (!finite(value)) return "—";
    const prefix = signed && value > 0 ? "+" : value < 0 ? "−" : "";
    return `${prefix}₹${number(Math.abs(value))}`;
  }

  function breakevens(map) {
    const values = Array.isArray(map?.breakevens) ? map.breakevens : [];
    return { lower: number(values[0]), upper: number(values[1]) };
  }

  function dateTime(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "UNKNOWN TIME";
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(date).toUpperCase();
  }

  function brokerView(status, updatedAt, now) {
    if (!status?.connected) {
      return {
        kind: "auth",
        label: status?.configured ? "ZERODHA DISCONNECTED" : "ZERODHA NOT CONFIGURED",
        action: { label: "CONNECT ZERODHA", kind: "connect" }
      };
    }
    const updated = Date.parse(updatedAt || "");
    const current = Date.parse(now || "");
    const expires = Date.parse(status.expiresAt || "");
    if (Number.isFinite(current) && Number.isFinite(expires) && expires <= current) {
      return {
        kind: "auth",
        label: "ZERODHA SESSION EXPIRED",
        action: { label: "CONNECT ZERODHA", kind: "connect" }
      };
    }
    if (Number.isFinite(updated) && Number.isFinite(current) && current - updated > STALE_AFTER_MS) {
      return { kind: "stale", label: `ZERODHA STALE · ${dateTime(updatedAt)}`, action: null };
    }
    return { kind: "connected", label: "ZERODHA CONNECTED · TODAY", action: null };
  }

  function reviewRows(sourceLedger) {
    return (sourceLedger.reviewChanges || []).map((change) => ({
      contractId: change.contractId,
      label: change.position?.tradingsymbol || change.contractId,
      signedLots: change.position ? change.signedQuantity / change.position.lotSize : 0,
      allocatedLots: change.position ? change.allocatedQuantity / change.position.lotSize : 0,
      availableLots: change.position ? (change.signedQuantity - change.allocatedQuantity) / change.position.lotSize : 0
    }));
  }

  function restoreMap(map) {
    if (!map) return null;
    return {
      ...map,
      maxProfit: map.maxProfit === "UNBOUNDED" ? Infinity : map.maxProfit,
      maxLoss: map.maxLoss === "UNBOUNDED" ? -Infinity : map.maxLoss
    };
  }

  function previousMap(strategy) {
    const snapshots = Array.isArray(strategy?.snapshots) ? strategy.snapshots : [];
    for (let index = snapshots.length - 1; index >= 0; index -= 1) {
      if (snapshots[index]?.currentMap) return restoreMap(snapshots[index].currentMap);
    }
    return null;
  }

  function latestAcceptedCandidateId(strategy) {
    const snapshots = Array.isArray(strategy?.snapshots) ? strategy.snapshots : [];
    return snapshots.length && typeof snapshots.at(-1)?.candidateId === "string"
      ? snapshots.at(-1).candidateId
      : "";
  }

  function allocatedPnl(sourceLedger, strategy) {
    if (!strategy) return null;
    let total = 0;
    for (const allocation of strategy.allocations) {
      const position = sourceLedger.brokerPositions.find((candidate) => candidate.contractId === allocation.contractId);
      if (!position || !finite(position.pnl) || !position.signedQuantity) return null;
      const allocatedQuantity = allocation.signedLots * position.lotSize;
      total += position.pnl * (allocatedQuantity / position.signedQuantity);
    }
    return total;
  }

  function legsFor(sourceLedger, strategy) {
    if (!strategy) return [];
    return strategy.allocations.map((allocation) => {
      const position = sourceLedger.brokerPositions.find((candidate) => candidate.contractId === allocation.contractId);
      return {
        contractId: allocation.contractId,
        label: position
          ? `${allocation.signedLots > 0 ? "+" : ""}${allocation.signedLots} × ${position.strike.toLocaleString("en-IN")} ${position.optionType}`
          : `${allocation.signedLots > 0 ? "+" : ""}${allocation.signedLots} × ${allocation.contractId}`,
        entry: number(position?.averagePrice),
        last: number(position?.lastPrice),
        pnl: position && position.signedQuantity
          ? rupees(position.pnl * (allocation.signedLots * position.lotSize / position.signedQuantity), { signed: true })
          : "—"
      };
    });
  }

  function timelineFor(strategy) {
    return (strategy?.snapshots || []).slice().reverse().map((snapshot) => ({
      at: dateTime(snapshot.at),
      lower: number(snapshot.currentMap?.breakevens?.[0]),
      upper: number(snapshot.currentMap?.breakevens?.[1])
    }));
  }

  function emptyRisk(status = "WITHHELD") {
    return {
      currentRisk: { lower: "—", upper: "—" },
      wholeTrade: { lower: "—", upper: "—", status }
    };
  }

  function snapshotMap(map) {
    if (!map) return null;
    return {
      status: map.status,
      breakevens: Array.isArray(map.breakevens) ? map.breakevens.slice() : [],
      maxProfit: map.maxProfit === Infinity ? "UNBOUNDED" : map.maxProfit,
      maxLoss: map.maxLoss === -Infinity ? "UNBOUNDED" : map.maxLoss,
      upsideUnbounded: Boolean(map.upsideUnbounded)
    };
  }

  function buildView({ ledger: sourceLedger, selectedStrategyId, brokerStatus, chain, now }) {
    const strategy = sourceLedger?.strategies?.find((candidate) => candidate.id === selectedStrategyId) || null;
    const reviewChanges = reviewRows(sourceLedger || { reviewChanges: [] });
    const broker = brokerView(brokerStatus, chain?.updatedAt, now);
    const candidateId = typeof chain?.candidateId === "string" ? chain.candidateId : "";
    const base = {
      version: 1,
      candidateId,
      acceptedAt: now,
      brokerUpdatedAt: chain?.updatedAt || null,
      strategyId: strategy?.id || "",
      strategyName: strategy?.name || "NO STRATEGY SELECTED",
      expiry: strategy?.expiry || chain?.expiry || "",
      daysToExpiry: Number.isFinite(chain?.daysToExpiry) ? chain.daysToExpiry : null,
      spot: number(chain?.spot),
      broker,
      reviewChanges,
      livePnl: rupees(allocatedPnl(sourceLedger || {}, strategy), { signed: true }),
      legs: legsFor(sourceLedger || { brokerPositions: [] }, strategy),
      timeline: timelineFor(strategy)
    };
    if (reviewChanges.length) {
      return {
        ...base,
        ...emptyRisk(),
        canPublish: false,
        priority: { kind: "review", label: "REVIEW POSITION CHANGES" },
        maxProfit: "—",
        maxLoss: "—",
        whyMoved: [],
        warning: "POSITION CHANGES MUST BE ALLOCATED AND EXPLICITLY ACCEPTED. RISK MAP WITHHELD.",
        maps: null
      };
    }
    if (!strategy || !strategy.allocations.length) {
      return {
        ...base,
        ...emptyRisk(),
        canPublish: false,
        priority: { kind: "setup", label: "CREATE OR SELECT STRATEGY" },
        maxProfit: "—",
        maxLoss: "—",
        whyMoved: [],
        warning: "NO ACCEPTED STRATEGY ALLOCATION.",
        maps: null
      };
    }
    if (!candidateId || latestAcceptedCandidateId(strategy) !== candidateId) {
      return {
        ...base,
        ...emptyRisk(),
        canPublish: false,
        priority: { kind: "review", label: "REVIEW POSITION CHANGES" },
        maxProfit: "—",
        maxLoss: "—",
        whyMoved: [],
        warning: "PENDING SNAPSHOT REQUIRES EXPLICIT ACCEPTANCE. RISK MAP WITHHELD.",
        maps: null
      };
    }

    const riskInput = ledgerApi.strategyRiskInput(sourceLedger, strategy.id);
    const currentMap = risk.currentRiskMap({ legs: riskInput.openLegs });
    if (currentMap.status === "INVALID_INPUT") {
      return {
        ...base,
        ...emptyRisk(),
        canPublish: false,
        priority: { kind: "error", label: "RISK INPUT INVALID" },
        maxProfit: "—",
        maxLoss: "—",
        whyMoved: [],
        warning: "RISK MAP WITHHELD BECAUSE POSITION EVIDENCE IS INVALID.",
        maps: null
      };
    }
    const wholeMap = risk.wholeTradeRiskMap({
      openLegs: riskInput.openLegs,
      fills: riskInput.fills,
      history: riskInput.history
    });
    const wholeStatus = wholeMap.status === "HISTORY_INCOMPLETE"
      ? "HISTORY INCOMPLETE"
      : wholeMap.status.replaceAll("_", " ");
    const currentDisplay = breakevens(currentMap);
    const wholeDisplay = breakevens(wholeMap);
    const explanation = risk.explainRiskChange(previousMap(strategy), currentMap);
    const warningParts = [];
    if (currentMap.maxLoss === -Infinity || currentMap.upsideUnbounded) warningParts.push("MAXIMUM LOSS IS UNBOUNDED");
    if (wholeMap.status === "HISTORY_INCOMPLETE") warningParts.push("HISTORY INCOMPLETE · WHOLE-TRADE MAP WITHHELD");
    if (currentMap.status === "EXCLUDING_CHARGES" || wholeMap.status === "EXCLUDING_CHARGES") warningParts.push("BROKER CHARGES EXCLUDED");
    return {
      ...base,
      currentRisk: currentDisplay,
      wholeTrade: { ...wholeDisplay, status: wholeStatus },
      canPublish: true,
      priority: { kind: "risk", label: "CURRENT RISK" },
      maxProfit: currentMap.maxProfit === Infinity ? "UNBOUNDED" : rupees(currentMap.maxProfit, { signed: true }),
      maxLoss: currentMap.maxLoss === -Infinity ? "UNBOUNDED" : rupees(currentMap.maxLoss, { signed: true }),
      whyMoved: explanation.facts,
      warning: warningParts.join(" · ") || "NO STRUCTURAL WARNING",
      maps: { current: snapshotMap(currentMap), wholeTrade: snapshotMap(wholeMap) }
    };
  }

  return { buildView };
});
