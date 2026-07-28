(function (root) {
  "use strict";

  const ACCEPTED_VIEW_VERSION = 2;
  const PROVENANCE_VERSION = 1;
  const CONTRACT_IDENTITY = "NIFTY_EXACT_EXPIRY_V1";

  function exactIsoDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function acceptedProvenance({ strategyId, expiry, candidateId }) {
    return {
      version: PROVENANCE_VERSION,
      contractIdentity: CONTRACT_IDENTITY,
      strategyId,
      expiry,
      candidateId
    };
  }

  function isCanonicalAcceptedView(view) {
    const provenance = view?.provenance;
    return Boolean(view && view.canPublish === true && view.version === ACCEPTED_VIEW_VERSION &&
      typeof view.strategyId === "string" && view.strategyId &&
      typeof view.candidateId === "string" && view.candidateId &&
      exactIsoDate(view.expiry) &&
      provenance?.version === PROVENANCE_VERSION &&
      provenance.contractIdentity === CONTRACT_IDENTITY &&
      provenance.strategyId === view.strategyId &&
      provenance.expiry === view.expiry &&
      provenance.candidateId === view.candidateId);
  }

  function legacyIdentityReviewView(evidence) {
    return {
      version: ACCEPTED_VIEW_VERSION,
      state: "LEGACY_IDENTITY_REVIEW_REQUIRED",
      canPublish: false,
      priority: { kind: "review", label: "LEGACY IDENTITY REVIEW REQUIRED" },
      strategyId: typeof evidence?.strategyId === "string" ? evidence.strategyId : "",
      expiry: typeof evidence?.expiry === "string" ? evidence.expiry : "",
      candidateId: typeof evidence?.candidateId === "string" ? evidence.candidateId : "",
      brokerUpdatedAt: evidence?.brokerUpdatedAt || null,
      brokerSessionExpiresAt: evidence?.brokerSessionExpiresAt || null
    };
  }

  function normalizeStoredRiskViews(stored) {
    const source = stored && typeof stored === "object" ? stored : {};
    const operatorEvidence = source.sellerSafetyView;
    const chartView = source.sellerSafetyChartView;
    const invalidOperator = operatorEvidence?.canPublish === true && !isCanonicalAcceptedView(operatorEvidence);
    const invalidChart = chartView?.canPublish === true && !isCanonicalAcceptedView(chartView);
    if (!invalidOperator && !invalidChart) return { ...source };
    return {
      ...source,
      sellerSafetyChartView: legacyIdentityReviewView(invalidOperator ? operatorEvidence : chartView)
    };
  }

  const api = {
    ACCEPTED_VIEW_VERSION,
    CONTRACT_IDENTITY,
    PROVENANCE_VERSION,
    acceptedProvenance,
    exactIsoDate,
    isCanonicalAcceptedView,
    legacyIdentityReviewView,
    normalizeStoredRiskViews
  };
  root.NiftySellerViewIdentity = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
