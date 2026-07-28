"use strict";

const API = "http://127.0.0.1:8787";
const SELLER_SAFETY_STALE_MS = 15 * 60 * 1000;
const DEFAULTS = {
  enabled: false,
  expiry: "current_month",
  sellerSafetyLedger: null,
  selectedStrategyId: "",
  sellerSafetyView: null,
  sellerSafetyChartView: null,
  sellerSafetyViewsByStrategy: {},
  sellerSafetyChartViewsByStrategy: {},
  sellerSafetyRefreshFailuresByExpiry: {},
  sellerSafetyPending: null,
  sellerSafetyChain: null,
  sellerSafetyChainsByExpiry: {}
};
const $ = (selector) => document.querySelector(selector);
let state = { ...DEFAULTS };
let ledger = null;
let brokerStatus = { configured: false, connected: false, expiresAt: null };
let expiries = [];
let pendingReview = null;
let candidateSequence = 0;

function friendlyError(error) {
  const message = String(error?.message || error || "Unknown error");
  if (/failed to fetch|networkerror|load failed/i.test(message)) return "Local bridge is stopped. Run bin/nifty-bridge setup once.";
  return message;
}

async function responseData(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Bridge returned HTTP ${response.status}.`);
  return data;
}

function optionNode(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function disclosure(buttonSelector, panelSelector) {
  const button = $(buttonSelector);
  const panel = $(panelSelector);
  const expanded = button.getAttribute("aria-expanded") === "true";
  button.setAttribute("aria-expanded", String(!expanded));
  panel.hidden = expanded;
}

async function persist(next) {
  await chrome.storage.local.set(next);
  state = { ...state, ...next };
  if (Object.prototype.hasOwnProperty.call(next, "sellerSafetyLedger")) ledger = next.sellerSafetyLedger;
  if (Object.prototype.hasOwnProperty.call(next, "sellerSafetyPending")) pendingReview = next.sellerSafetyPending;
}

async function clearPendingCandidate() {
  pendingReview = null;
  state = { ...state, sellerSafetyPending: null };
  await chrome.storage.local.set({ sellerSafetyPending: null });
}

function validStoredChain(snapshot, expiry = snapshot?.expiry) {
  const updatedAt = Date.parse(snapshot?.updatedAt || "");
  return Boolean(snapshot && snapshot.version === 1 &&
    NiftySellerViewIdentity.exactIsoDate(expiry) && snapshot.expiry === expiry &&
    typeof snapshot.updatedAt === "string" && Number.isFinite(updatedAt) &&
    Date.now() - updatedAt <= SELLER_SAFETY_STALE_MS &&
    Number.isFinite(Number(snapshot.spot)) && Array.isArray(snapshot.rows) && snapshot.rows.length >= 13 &&
    snapshot.rows.every((row) => Number.isFinite(Number(row?.strike))) &&
    new Set(snapshot.rows.map((row) => Number(row.strike))).size === snapshot.rows.length);
}

function storedChainFor(expiry, chains = state.sellerSafetyChainsByExpiry || {}) {
  const snapshot = chains[expiry];
  return validStoredChain(snapshot, expiry) ? snapshot : null;
}

function legacyChartFor(evidence) {
  return NiftySellerViewIdentity.legacyIdentityReviewView(evidence);
}

function appendTextRows(container, values, emptyLabel) {
  const rows = values.length ? values : [emptyLabel];
  container.replaceChildren(...rows.map((value) => {
    const row = document.createElement("span");
    row.textContent = value;
    return row;
  }));
}

function renderDetailRows(container, rows, emptyLabel) {
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "detail-row";
    empty.textContent = emptyLabel;
    container.replaceChildren(empty);
    return;
  }
  container.replaceChildren(...rows.map((row) => {
    const item = document.createElement("div");
    item.className = "detail-row";
    const label = document.createElement("strong");
    label.textContent = row.label;
    const detail = document.createElement("span");
    detail.textContent = row.detail;
    item.append(label, detail);
    return item;
  }));
}

function renderStrategies() {
  const select = $("#selected-strategy");
  $("#strategy-bar").hidden = ledger.strategies.length === 0;
  const options = [optionNode("", "Select strategy")].concat(ledger.strategies
    .map((strategy) => optionNode(strategy.id, `${strategy.name} · ${strategy.expiry}`)));
  select.replaceChildren(...options);
  select.value = state.selectedStrategyId;
}

function renderAllocations(view) {
  const selected = ledger.strategies.find((strategy) => strategy.id === state.selectedStrategyId);
  const list = $("#allocation-list");
  list.replaceChildren(...view.reviewChanges.map((change) => {
    const row = document.createElement("label");
    row.className = "allocation-row";
    const copy = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = change.label;
    const available = document.createElement("span");
    available.textContent = `${change.availableLots > 0 ? "+" : ""}${change.availableLots} LOTS AVAILABLE`;
    copy.append(title, available);
    const input = document.createElement("input");
    input.type = "number";
    input.step = "1";
    input.dataset.allocationContract = change.contractId;
    input.setAttribute("aria-label", `Signed lots for ${change.label}`);
    const existing = selected?.allocations.find((allocation) => allocation.contractId === change.contractId);
    input.value = String(existing?.signedLots || 0);
    row.append(copy, input);
    return row;
  }));
}

function renderTradeReviews(view) {
  const reviews = Array.isArray(view.tradeReviews) ? view.tradeReviews : [];
  const list = $("#trade-review-list");
  list.replaceChildren(...reviews.map((review) => {
    const trade = ledger.importedTrades.find((candidate) => candidate.id === review.fillId);
    const row = document.createElement("label");
    row.className = "trade-review-row";
    const copy = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = `${trade?.transactionType || "TRADE"} ${review.remainingQuantity || trade?.quantity || "—"} REMAINING · ${trade?.tradingsymbol || review.contractId}`;
    const detail = document.createElement("span");
    detail.textContent = `${review.fillId} · EXPLICIT OWNER REQUIRED`;
    copy.append(title, detail);
    const controls = document.createElement("span");
    controls.className = "trade-review-controls";
    const select = document.createElement("select");
    select.dataset.tradeReviewId = review.fillId;
    select.setAttribute("aria-label", `Strategy owner for trade ${review.fillId}`);
    const eligible = ledger.strategies.filter((strategy) => strategy.expiry === review.expiry);
    select.replaceChildren(
      optionNode("", "Select owner"),
      ...eligible.map((strategy) => optionNode(strategy.id, strategy.name)),
      optionNode("__UNASSIGNED__", "Leave unassigned")
    );
    select.value = "";
    const quantity = document.createElement("input");
    quantity.type = "number";
    quantity.step = "1";
    quantity.min = "1";
    quantity.max = String(review.remainingQuantity || trade?.quantity || "");
    quantity.value = String(review.remainingQuantity || trade?.quantity || "");
    quantity.dataset.tradeReviewQuantity = review.fillId;
    quantity.setAttribute("aria-label", `Owned quantity for trade ${review.fillId}`);
    controls.append(select, quantity);
    row.append(copy, controls);
    return row;
  }));
  $("#assign-trades").hidden = reviews.length === 0;
}

function renderView(view, { pending = false, preserveEvidence = false } = {}) {
  const shown = pending && view.canPublish
    ? {
      ...view,
      canPublish: false,
      priority: { kind: "review", label: view.reviewChanges?.length
        ? "REVIEW POSITION CHANGES"
        : view.tradeReviews?.length ? "REVIEW TRADE OWNERSHIP" : "REVIEW REFRESH SNAPSHOT" },
      ...(preserveEvidence ? {} : {
        currentRisk: { lower: "—", upper: "—" },
        wholeTrade: { lower: "—", upper: "—", status: "WITHHELD" },
        maxProfit: "—",
        maxLoss: "—",
        whyMoved: []
      }),
      warning: preserveEvidence
        ? "LAST ACCEPTED EVIDENCE ONLY. NEW SNAPSHOT REQUIRES REVIEW; CHART RISK IS WITHHELD."
        : "EXPLICIT SNAPSHOT ACCEPTANCE REQUIRED. RISK MAP WITHHELD."
    }
    : view;
  $("#priority-label").textContent = shown.priority.label;
  $("#current-lower").textContent = shown.currentRisk.lower;
  $("#current-upper").textContent = shown.currentRisk.upper;
  $("#whole-lower").textContent = shown.wholeTrade.lower;
  $("#whole-upper").textContent = shown.wholeTrade.upper;
  $("#whole-status").textContent = shown.wholeTrade.status;
  $("#live-pnl").textContent = shown.livePnl;
  $("#max-profit").textContent = shown.maxProfit;
  $("#max-loss").textContent = shown.maxLoss;
  $("#warning").textContent = shown.warning;
  appendTextRows($("#why-moved"), shown.whyMoved, "No prior accepted movement facts.");
  renderDetailRows($("#legs-list"), shown.legs.map((leg) => ({
    label: leg.label,
    detail: `ENTRY ${leg.entry} · LAST ${leg.last} · ${leg.pnl}`
  })), "No accepted position legs.");
  renderDetailRows($("#timeline-list"), shown.timeline.map((snapshot) => ({
    label: snapshot.at,
    detail: `${snapshot.lower} / ${snapshot.upper}`
  })), "No accepted snapshots.");
  $("#broker-line").textContent = shown.broker.label;
  $("#connect-zerodha").hidden = !shown.broker.action;
  if (shown.broker.action) $("#connect-zerodha").textContent = shown.broker.action.label;
  renderStrategies();
  $("#risk-summary").hidden = ledger.strategies.length === 0;
  renderAllocations(shown);
  renderTradeReviews(shown);
  $("#review-panel").hidden = !(pending || shown.reviewChanges.length || shown.tradeReviews?.length);
}

function selectedStrategy() {
  return ledger.strategies.find((strategy) => strategy.id === state.selectedStrategyId) || null;
}

function pendingMatchesSelection() {
  return Boolean(pendingReview?.chain?.expiry && pendingReview.chain.expiry === state.expiry);
}

function acceptedViewFor(strategyId = state.selectedStrategyId) {
  const byStrategy = state.sellerSafetyViewsByStrategy || {};
  const stored = byStrategy[strategyId];
  if (stored?.strategyId === strategyId) return stored;
  return state.sellerSafetyView?.strategyId === strategyId ? state.sellerSafetyView : null;
}

function acceptedChartFor(strategyId = state.selectedStrategyId) {
  const byStrategy = state.sellerSafetyChartViewsByStrategy || {};
  const stored = byStrategy[strategyId];
  if (stored?.strategyId === strategyId) return stored;
  return acceptedViewFor(strategyId);
}

function chartPointerFor(strategyId, expiry) {
  if (pendingReview?.chain?.expiry === expiry && state.sellerSafetyChartView?.candidateId === pendingReview.candidateId) {
    return state.sellerSafetyChartView;
  }
  return state.sellerSafetyRefreshFailuresByExpiry?.[expiry] || acceptedChartFor(strategyId);
}

function restoredChartPointerFor(strategyId, expiry) {
  const evidence = acceptedViewFor(strategyId);
  if (evidence?.canPublish === true && !NiftySellerViewIdentity.isCanonicalAcceptedView(evidence)) {
    return legacyChartFor(evidence);
  }
  const chart = chartPointerFor(strategyId, expiry);
  if (chart?.canPublish === true && !NiftySellerViewIdentity.isCanonicalAcceptedView(chart)) {
    return legacyChartFor(chart);
  }
  return chart?.canPublish === true && !storedChainFor(expiry) ? null : chart;
}

function currentView(chain) {
  const selectedChain = chain || (pendingMatchesSelection() ? pendingReview.chain : null) ||
    (state.sellerSafetyChain?.expiry === state.expiry ? state.sellerSafetyChain : { expiry: state.expiry });
  return NiftySellerPopupView.buildView({
    ledger,
    selectedStrategyId: state.selectedStrategyId,
    brokerStatus,
    chain: selectedChain,
    now: new Date().toISOString()
  });
}

function latestAcceptedCandidateId() {
  const strategy = ledger.strategies.find((candidate) => candidate.id === state.selectedStrategyId);
  return typeof strategy?.snapshots?.at(-1)?.candidateId === "string" ? strategy.snapshots.at(-1).candidateId : "";
}

function renderCurrent({ pending = pendingMatchesSelection() } = {}) {
  const stored = acceptedViewFor();
  if (stored?.canPublish === true && !NiftySellerViewIdentity.isCanonicalAcceptedView(stored)) {
    renderView({
      ...stored,
      ...legacyChartFor(stored),
      warning: "LAST ACCEPTED OPERATOR EVIDENCE ONLY. EXACT-EXPIRY IDENTITY REVIEW REQUIRED BEFORE CHART PUBLICATION."
    });
    return;
  }
  const validStoredView = stored?.canPublish === true && stored.priority && stored.currentRisk &&
    stored.wholeTrade && stored.broker && Array.isArray(stored.whyMoved) &&
    Array.isArray(stored.legs) && Array.isArray(stored.timeline) &&
    typeof stored.candidateId === "string" && stored.candidateId &&
    latestAcceptedCandidateId() === stored.candidateId;
  if (validStoredView) {
    const liveStatus = NiftySellerPopupView.buildView({
      ledger,
      selectedStrategyId: state.selectedStrategyId,
      brokerStatus,
      chain: {
        candidateId: stored.candidateId,
        expiry: stored.expiry,
        daysToExpiry: stored.daysToExpiry,
        updatedAt: stored.brokerUpdatedAt || stored.acceptedAt
      },
      now: new Date().toISOString()
    });
    if (pending) {
      const candidate = currentView();
      renderView({
        ...stored,
        broker: liveStatus.broker,
        reviewChanges: candidate.reviewChanges,
        tradeReviews: candidate.tradeReviews || []
      }, { pending: true, preserveEvidence: true });
    } else {
      renderView({ ...stored, broker: liveStatus.broker });
    }
    return;
  }
  renderView(currentView(), { pending });
}

function renderSettings() {
  $("#enabled").setAttribute("aria-checked", String(state.enabled));
  $("#expiry").value = state.expiry;
}

async function loadHealth() {
  try {
    const data = await responseData(await fetch(`${API}/api/health?live=1`, { cache: "no-store" }));
    return data.status === "ok";
  } catch (error) {
    $("#placement-status").textContent = friendlyError(error);
    return false;
  }
}

async function loadExpiries() {
  try {
    const data = await responseData(await fetch(`${API}/api/nifty-expiries`, { cache: "no-store" }));
    expiries = data.expiries || [];
    $("#expiry").replaceChildren(...expiries.map(({ expiry, daysToExpiry }) => optionNode(expiry, `${expiry} · ${daysToExpiry} DTE`)));
    if (!expiries.some((entry) => entry.expiry === state.expiry)) {
      const firstExpiry = expiries[0]?.expiry || "current_month";
      const matching = ledger.strategies.find((strategy) => strategy.expiry === firstExpiry);
      const restoredView = matching ? acceptedViewFor(matching.id) : null;
      const restoredChart = matching ? chartPointerFor(matching.id, firstExpiry) : null;
      await persist({
        expiry: firstExpiry,
        selectedStrategyId: matching?.id || "",
        sellerSafetyView: restoredView,
        sellerSafetyChartView: restoredChart,
        sellerSafetyPending: pendingReview
      });
    }
    const selected = expiries.find((entry) => entry.expiry === state.expiry);
    $("#expiry-hint").textContent = selected ? `${selected.daysToExpiry} DTE` : "NO EXPIRY";
  } catch (error) {
    $("#expiry-hint").textContent = friendlyError(error);
  }
}

async function loadBrokerStatus() {
  try {
    brokerStatus = await responseData(await fetch(`${API}/api/zerodha/status`, { cache: "no-store" }));
  } catch (error) {
    brokerStatus = { configured: false, connected: false, expiresAt: null };
    $("#placement-status").textContent = friendlyError(error);
  }
}

function validRefreshTrade(trade, expiry) {
  return trade && typeof trade.id === "string" && trade.id &&
    trade.contractId === NiftySellerLedger.canonicalContractId(expiry, trade.strike, trade.optionType) &&
    typeof trade.tradingsymbol === "string" && trade.tradingsymbol &&
    trade.underlying === "NIFTY" && trade.exchange === "NFO" && trade.expiry === expiry &&
    Number.isFinite(trade.strike) && (trade.optionType === "CE" || trade.optionType === "PE") &&
    (trade.transactionType === "BUY" || trade.transactionType === "SELL") &&
    Number.isInteger(trade.quantity) && trade.quantity > 0 &&
    Number.isFinite(trade.price) && trade.price >= 0 &&
    typeof trade.timestamp === "string" && Number.isFinite(Date.parse(trade.timestamp));
}

function nextCandidateId() {
  candidateSequence += 1;
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `seller-${uuid}` : `seller-${Date.now()}-${candidateSequence}`;
}

function validateRefreshPayload(data) {
  if (!data || typeof data.updatedAt !== "string" || !Number.isFinite(Date.parse(data.updatedAt)) ||
    !Array.isArray(data.positions) || !Array.isArray(data.trades) ||
    !data.chain || data.chain.expiry !== state.expiry || !Number.isFinite(data.chain.spot) ||
    !Array.isArray(data.chain.rows) || !data.trades.every((trade) => validRefreshTrade(trade, state.expiry))) {
    throw new Error("Bridge returned an invalid seller refresh snapshot.");
  }
  const positionLedger = NiftySellerLedger.reconcilePositions(ledger, data.positions, { expiry: state.expiry });
  const nextLedger = NiftySellerLedger.ingestBrokerTrades(positionLedger, {
    trades: data.trades,
    expiry: state.expiry,
    observedAt: data.updatedAt
  });
  const expiryData = expiries.find((entry) => entry.expiry === state.expiry);
  const candidateId = nextCandidateId();
  return {
    nextLedger,
    chainSnapshot: {
      version: 1,
      updatedAt: data.updatedAt,
      expiry: data.chain.expiry,
      spot: data.chain.spot,
      rows: data.chain.rows
    },
    pending: {
      version: 1,
      candidateId,
      updatedAt: data.updatedAt,
      positionCount: data.positions.length,
      tradeCount: data.trades.length,
      chain: {
        candidateId,
        expiry: data.chain.expiry,
        spot: data.chain.spot,
        updatedAt: data.updatedAt,
        daysToExpiry: expiryData?.daysToExpiry ?? null
      }
    }
  };
}

function withheldChartView(candidate) {
  const scopedPositionReviews = candidate.nextLedger.reviewChanges.filter((change) => change.position?.expiry === candidate.pending.chain.expiry);
  const scopedTradeReviews = (candidate.nextLedger.tradeReviews || []).filter((review) => review.expiry === candidate.pending.chain.expiry);
  const priority = scopedPositionReviews.length
    ? "REVIEW POSITION CHANGES"
    : scopedTradeReviews.length ? "REVIEW TRADE OWNERSHIP" : "REVIEW REFRESH SNAPSHOT";
  return {
    version: 1,
    candidateId: candidate.pending.candidateId,
    canPublish: false,
    priority: { kind: "review", label: priority },
    expiry: candidate.pending.chain.expiry,
    brokerUpdatedAt: candidate.pending.updatedAt,
    brokerSessionExpiresAt: brokerStatus.expiresAt || null
  };
}

function failedRefreshChartView() {
  return {
    version: 1,
    state: "REFRESH_FAILED",
    canPublish: false,
    priority: { kind: "stale", label: "STALE · REFRESH FAILED" },
    strategyId: state.selectedStrategyId,
    expiry: state.expiry,
    failedAt: new Date().toISOString(),
    brokerSessionExpiresAt: brokerStatus.expiresAt || null
  };
}

async function refreshAll() {
  const button = $("#refresh-all");
  const label = $("#refresh-label");
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  label.textContent = "REFRESHING…";
  $("#placement-status").textContent = "READING BROKER + MARKET SNAPSHOT…";
  try {
    await clearPendingCandidate();
    const data = await responseData(await fetch(`${API}/api/seller-refresh?expiry=${encodeURIComponent(state.expiry)}`, { cache: "no-store" }));
    const candidate = validateRefreshPayload(data);
    const failuresByExpiry = { ...(state.sellerSafetyRefreshFailuresByExpiry || {}) };
    delete failuresByExpiry[state.expiry];
    const chainsByExpiry = { ...(state.sellerSafetyChainsByExpiry || {}) };
    if (validStoredChain(candidate.chainSnapshot, state.expiry)) {
      chainsByExpiry[state.expiry] = candidate.chainSnapshot;
    }
    await persist({
      sellerSafetyLedger: candidate.nextLedger,
      sellerSafetyChartView: withheldChartView(candidate),
      sellerSafetyRefreshFailuresByExpiry: failuresByExpiry,
      sellerSafetyPending: candidate.pending,
      sellerSafetyChain: candidate.chainSnapshot,
      sellerSafetyChainsByExpiry: chainsByExpiry
    });
    renderCurrent({ pending: true });
    $("#placement-status").textContent = ledger.tradeReviews?.length
      ? `${ledger.tradeReviews.length} TRADE OWNERSHIP REVIEW${ledger.tradeReviews.length === 1 ? "" : "S"} REQUIRED`
      : ledger.reviewChanges.length
      ? `${ledger.reviewChanges.length} POSITION CHANGE${ledger.reviewChanges.length === 1 ? "" : "S"} NEED REVIEW`
      : "SNAPSHOT READY FOR EXPLICIT ACCEPTANCE";
  } catch (error) {
    try { await clearPendingCandidate(); } catch (_clearError) { /* in-memory candidate already cleared */ }
    const failure = failedRefreshChartView();
    await persist({
      sellerSafetyChartView: failure,
      sellerSafetyRefreshFailuresByExpiry: {
        ...(state.sellerSafetyRefreshFailuresByExpiry || {}),
        [state.expiry]: failure
      },
      sellerSafetyPending: null
    });
    $("#placement-status").textContent = friendlyError(error);
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    label.textContent = "REFRESH ALL";
  }
}

async function createStrategy() {
  const name = $("#strategy-name").value.trim();
  if (!name) {
    $("#placement-status").textContent = "ENTER A STRATEGY NAME FIRST";
    return;
  }
  try {
    const id = `strategy-${Date.now()}`;
    ledger = NiftySellerLedger.createStrategy(ledger, { id, name, underlying: "NIFTY", expiry: state.expiry });
    await persist({
      sellerSafetyLedger: ledger,
      selectedStrategyId: id,
      sellerSafetyPending: pendingReview
    });
    $("#strategy-name").value = "";
    renderCurrent({ pending: true });
    $("#placement-status").textContent = "STRATEGY CREATED · ALLOCATE SIGNED WHOLE LOTS";
  } catch (error) {
    $("#placement-status").textContent = friendlyError(error);
  }
}

async function allocateLots() {
  if (!state.selectedStrategyId) {
    $("#placement-status").textContent = "SELECT A STRATEGY FIRST";
    return;
  }
  try {
    const inputs = Array.from(document.querySelectorAll("[data-allocation-contract]"));
    if (!inputs.length) throw new Error("No position changes are available to allocate.");
    let reviewed = ledger;
    for (const input of inputs) {
      const signedLots = Number(input.value);
      if (!Number.isInteger(signedLots)) throw new Error("Allocations must use signed whole lots.");
      reviewed = NiftySellerLedger.allocateLots(reviewed, {
        strategyId: state.selectedStrategyId,
        contractId: input.dataset.allocationContract,
        signedLots
      });
    }
    ledger = reviewed;
    await persist({ sellerSafetyLedger: ledger, sellerSafetyPending: pendingReview });
    renderCurrent({ pending: true });
    $("#placement-status").textContent = ledger.reviewChanges.length
      ? `${ledger.reviewChanges.length} POSITION CHANGE${ledger.reviewChanges.length === 1 ? "" : "S"} STILL UNALLOCATED`
      : "ALLOCATION REVIEWED · ACCEPT SNAPSHOT WHEN READY";
  } catch (error) {
    $("#placement-status").textContent = friendlyError(error);
  }
}

function datePart(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "";
}

async function importTradebook(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const parsed = NiftyTradebookCsv.parseTradebookCsv(await file.text(), {
      underlying: "NIFTY",
      expiry: state.expiry
    });
    if (parsed.errors.length) throw new Error(parsed.errors.map((error) => `ROW ${error.row}: ${error.reason}`).join(" · "));
    if (!parsed.trades.length) throw new Error("CSV contains no accepted NIFTY fills.");
    const dates = parsed.trades.map((trade) => datePart(trade.timestamp)).filter(Boolean).sort();
    ledger = NiftySellerLedger.stageTradebookImport(ledger, {
      sourceKind: parsed.sourceKind,
      trades: parsed.trades,
      batchFingerprint: parsed.batchFingerprint,
      stagedAt: new Date().toISOString(),
      scope: { underlying: "NIFTY", expiry: state.expiry, accountId: parsed.scope?.accountId || null }
    });
    await persist({ sellerSafetyLedger: ledger, sellerSafetyPending: pendingReview });
    if (dates.length) {
      $("#coverage-from").value = dates[0];
      $("#coverage-to").value = dates.at(-1);
    }
    const ignored = parsed.summary?.ignoredOutOfScope || 0;
    $("#import-summary").textContent = `${parsed.trades.length} FILL${parsed.trades.length === 1 ? "" : "S"} STAGED · ${ignored} PROVEN OUT-OF-SCOPE IGNORED · ${file.name}`;
    renderCurrent({ pending: true });
  } catch (error) {
    $("#import-summary").textContent = friendlyError(error);
  }
}

async function assignReviewedTrades() {
  try {
    const choices = Array.from(document.querySelectorAll("[data-trade-review-id]"));
    const quantities = new Map(Array.from(document.querySelectorAll("[data-trade-review-quantity]"))
      .map((input) => [input.dataset.tradeReviewQuantity, input]));
    if (!choices.length) throw new Error("No fills require quantity ownership review.");
    if (choices.some((choice) => !choice.value)) throw new Error("Select an owner for every reviewed trade.");
    const confirmedAt = new Date().toISOString();
    let reviewed = ledger;
    for (const choice of choices) {
      const quantity = Number(quantities.get(choice.dataset.tradeReviewId)?.value);
      if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("Enter an explicit positive quantity for every reviewed fill.");
      reviewed = NiftySellerLedger.assignFillQuantity(reviewed, {
        fillId: choice.dataset.tradeReviewId,
        quantity,
        disposition: choice.value === "__UNASSIGNED__" ? "UNASSIGNED" : "STRATEGY",
        ...(choice.value === "__UNASSIGNED__" ? {} : { strategyId: choice.value }),
        confirmedAt
      });
    }
    ledger = reviewed;
    await persist({ sellerSafetyLedger: ledger, sellerSafetyPending: pendingReview });
    renderCurrent({ pending: true });
    $("#placement-status").textContent = ledger.tradeReviews.length
      ? "QUANTITY RECORDED · REMAINING FILL QUANTITY STILL NEEDS A DISPOSITION"
      : "ALL FILL QUANTITIES HAVE EXPLICIT DISPOSITIONS";
  } catch (error) {
    $("#placement-status").textContent = friendlyError(error);
  }
}

async function confirmCoverage() {
  if (!state.selectedStrategyId) {
    $("#placement-status").textContent = "SELECT A STRATEGY BEFORE CONFIRMING COVERAGE";
    return;
  }
  try {
    const strategy = selectedStrategy();
    const declarations = new Set(ledger.coverageDeclarations
      .filter((item) => item.strategyId === strategy.id)
      .map((item) => item.batchFingerprint));
    const batch = ledger.importBatches.slice().reverse().find((item) =>
      item.scope?.expiry === strategy.expiry && !declarations.has(item.fingerprint));
    if (!batch) throw new Error("No staged import batch awaits coverage confirmation for this strategy.");
    const from = $("#coverage-from").value;
    const to = $("#coverage-to").value;
    const checkpointIds = ledger.historyCheckpoints
      .filter((checkpoint) => checkpoint.expiry === strategy.expiry && checkpoint.date >= from && checkpoint.date <= to)
      .map((checkpoint) => checkpoint.id);
    ledger = NiftySellerLedger.confirmHistoryCoverage(ledger, {
      strategyId: strategy.id,
      batchFingerprint: batch.fingerprint,
      from,
      to,
      checkpointIds,
      confirmedAt: new Date().toISOString()
    });
    await persist({ sellerSafetyLedger: ledger, sellerSafetyPending: pendingReview });
    renderCurrent({ pending: true });
    $("#placement-status").textContent = `COVERAGE CONFIRMED · ${from} TO ${to} · ${checkpointIds.length} CHECKPOINT${checkpointIds.length === 1 ? "" : "S"}`;
  } catch (error) {
    $("#placement-status").textContent = friendlyError(error);
  }
}

async function acceptSnapshot() {
  if (!pendingReview || !pendingMatchesSelection()) {
    $("#placement-status").textContent = "PRESS REFRESH ALL BEFORE ACCEPTING";
    return;
  }
  if (ledger.reviewChanges.some((change) => change.position?.expiry === state.expiry)) {
    $("#placement-status").textContent = "ALLOCATE EVERY POSITION CHANGE BEFORE ACCEPTING";
    return;
  }
  if (ledger.tradeReviews?.some((review) => review.expiry === state.expiry)) {
    $("#placement-status").textContent = "SELECT EACH TRADE OWNER AND ASSIGN REVIEWED TRADES BEFORE ACCEPTING";
    return;
  }
  try {
    const acceptedAt = new Date().toISOString();
    if (!selectedStrategy()) throw new Error("Select the reviewed strategy before accepting.");
    const acceptedLedger = NiftySellerLedger.acceptSnapshot(ledger, {
      strategyId: state.selectedStrategyId,
      snapshot: { at: acceptedAt, candidateId: pendingReview.candidateId }
    });
    const view = NiftySellerPopupView.buildView({
      ledger: acceptedLedger,
      selectedStrategyId: state.selectedStrategyId,
      brokerStatus,
      chain: pendingReview.chain,
      now: acceptedAt
    });
    if (!view.canPublish || !view.maps) throw new Error("Reviewed allocation is not safe to publish.");
    ledger = NiftySellerLedger.acceptSnapshot(ledger, {
      strategyId: state.selectedStrategyId,
      snapshot: {
        at: acceptedAt,
        candidateId: pendingReview.candidateId,
        currentMap: view.maps.current,
        wholeTradeMap: view.maps.wholeTrade
      }
    });
    view.timeline = [{ at: acceptedAt, lower: view.currentRisk.lower, upper: view.currentRisk.upper }].concat(view.timeline.slice(1));
    const viewsByStrategy = {
      ...(state.sellerSafetyViewsByStrategy || {}),
      [state.selectedStrategyId]: view
    };
    const chartViewsByStrategy = {
      ...(state.sellerSafetyChartViewsByStrategy || {}),
      [state.selectedStrategyId]: view
    };
    const failuresByExpiry = { ...(state.sellerSafetyRefreshFailuresByExpiry || {}) };
    delete failuresByExpiry[state.expiry];
    await persist({
      sellerSafetyLedger: ledger,
      selectedStrategyId: state.selectedStrategyId,
      sellerSafetyView: view,
      sellerSafetyChartView: view,
      sellerSafetyViewsByStrategy: viewsByStrategy,
      sellerSafetyChartViewsByStrategy: chartViewsByStrategy,
      sellerSafetyRefreshFailuresByExpiry: failuresByExpiry,
      sellerSafetyPending: null
    });
    renderView(view);
    $("#review-panel").hidden = true;
    $("#placement-status").textContent = "REVIEWED SNAPSHOT ACCEPTED · RISK MAP PUBLISHED";
  } catch (error) {
    $("#placement-status").textContent = friendlyError(error);
  }
}

async function connectZerodha() {
  try {
    const data = await responseData(await fetch(`${API}/api/zerodha/login-url`, { cache: "no-store" }));
    const login = new URL(data.loginUrl);
    if (login.origin !== "https://kite.zerodha.com" || login.pathname !== "/connect/login") {
      throw new Error("Bridge returned an invalid Zerodha login URL.");
    }
    await chrome.tabs.create({ url: login.toString() });
  } catch (error) {
    $("#placement-status").textContent = friendlyError(error);
  }
}

async function retryChartPlacement() {
  const button = $("#retry-placement");
  button.disabled = true;
  $("#placement-status").textContent = "READING NATIVE AXIS TICKS…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.startsWith("https://www.tradingview.com/")) throw new Error("Open active TradingView chart first.");
    const result = await chrome.tabs.sendMessage(tab.id, { type: "RETRY_LABEL_PLACEMENT" });
    if (!result?.ok) throw new Error(result?.error || "Exact-axis retry failed.");
    $("#placement-status").textContent = "EXACT-AXIS PLACEMENT RESTORED";
  } catch (error) {
    $("#placement-status").textContent = friendlyError(error);
  } finally {
    button.disabled = false;
  }
}

function bindEvents() {
  $("#refresh-all").addEventListener("click", refreshAll);
  $("#connect-zerodha").addEventListener("click", connectZerodha);
  $("#create-strategy").addEventListener("click", createStrategy);
  $("#allocate-lots").addEventListener("click", allocateLots);
  $("#tradebook-csv").addEventListener("change", importTradebook);
  $("#assign-trades").addEventListener("click", assignReviewedTrades);
  $("#confirm-coverage").addEventListener("click", confirmCoverage);
  $("#accept-snapshot").addEventListener("click", acceptSnapshot);
  $("#selected-strategy").addEventListener("change", async (event) => {
    const strategy = ledger.strategies.find((candidate) => candidate.id === event.target.value);
    const expiry = strategy?.expiry || state.expiry;
    const view = strategy ? acceptedViewFor(strategy.id) : null;
    await persist({
      selectedStrategyId: event.target.value,
      expiry,
      sellerSafetyView: view,
      sellerSafetyChartView: strategy ? restoredChartPointerFor(strategy.id, expiry) : null,
      sellerSafetyChain: storedChainFor(expiry),
      sellerSafetyPending: pendingReview
    });
    renderSettings();
    const expiryData = expiries.find((entry) => entry.expiry === state.expiry);
    $("#expiry-hint").textContent = expiryData ? `${expiryData.daysToExpiry} DTE` : "NO EXPIRY";
    renderCurrent();
  });
  $("#expiry").addEventListener("change", async (event) => {
    const matching = ledger.strategies.find((strategy) => strategy.expiry === event.target.value);
    const view = matching ? acceptedViewFor(matching.id) : null;
    await persist({
      expiry: event.target.value,
      selectedStrategyId: matching?.id || "",
      sellerSafetyView: view,
      sellerSafetyChartView: matching ? restoredChartPointerFor(matching.id, matching.expiry) : null,
      sellerSafetyChain: storedChainFor(event.target.value),
      sellerSafetyPending: pendingReview
    });
    const expiryData = expiries.find((entry) => entry.expiry === state.expiry);
    $("#expiry-hint").textContent = expiryData ? `${expiryData.daysToExpiry} DTE` : "NO EXPIRY";
    renderCurrent();
    $("#placement-status").textContent = view ? "ACCEPTED STRATEGY VIEW RESTORED" : "EXPIRY CHANGED · PRESS REFRESH ALL";
  });
  $("#enabled").addEventListener("click", async () => {
    await persist({ enabled: !state.enabled });
    renderSettings();
  });
  $("#retry-placement").addEventListener("click", retryChartPlacement);
  $("#legs-toggle").addEventListener("click", () => disclosure("#legs-toggle", "#legs-panel"));
  $("#timeline-toggle").addEventListener("click", () => disclosure("#timeline-toggle", "#timeline-panel"));
  $("#advanced-toggle").addEventListener("click", () => disclosure("#advanced-toggle", "#advanced-panel"));
}

async function init() {
  state = { ...DEFAULTS, ...(await chrome.storage.local.get(DEFAULTS)) };
  ledger = state.sellerSafetyLedger || NiftySellerLedger.emptyLedger();
  pendingReview = state.sellerSafetyPending;
  const viewsByStrategy = { ...(state.sellerSafetyViewsByStrategy || {}) };
  const chartViewsByStrategy = { ...(state.sellerSafetyChartViewsByStrategy || {}) };
  if (state.sellerSafetyView?.strategyId && !viewsByStrategy[state.sellerSafetyView.strategyId]) {
    viewsByStrategy[state.sellerSafetyView.strategyId] = state.sellerSafetyView;
  }
  if (state.sellerSafetyChartView?.canPublish === true && state.sellerSafetyChartView.strategyId &&
    !chartViewsByStrategy[state.sellerSafetyChartView.strategyId]) {
    chartViewsByStrategy[state.sellerSafetyChartView.strategyId] = state.sellerSafetyChartView;
  }
  for (const [strategyId, evidence] of Object.entries(viewsByStrategy)) {
    if (evidence?.canPublish === true && !NiftySellerViewIdentity.isCanonicalAcceptedView(evidence)) {
      chartViewsByStrategy[strategyId] = legacyChartFor(evidence);
    } else if (chartViewsByStrategy[strategyId]?.canPublish === true &&
      !NiftySellerViewIdentity.isCanonicalAcceptedView(chartViewsByStrategy[strategyId])) {
      chartViewsByStrategy[strategyId] = legacyChartFor(chartViewsByStrategy[strategyId]);
    }
  }
  const chainsByExpiry = { ...(state.sellerSafetyChainsByExpiry || {}) };
  if (validStoredChain(state.sellerSafetyChain)) {
    chainsByExpiry[state.sellerSafetyChain.expiry] = state.sellerSafetyChain;
  }
  for (const [expiry, snapshot] of Object.entries(chainsByExpiry)) {
    if (!validStoredChain(snapshot, expiry)) delete chainsByExpiry[expiry];
  }
  const restoredStrategy = ledger.strategies.find((strategy) => strategy.id === state.selectedStrategyId);
  const restoredExpiry = restoredStrategy?.expiry || state.expiry;
  const normalizedActive = NiftySellerViewIdentity.normalizeStoredRiskViews({
    sellerSafetyView: state.sellerSafetyView,
    sellerSafetyChartView: state.sellerSafetyChartView
  });
  const activeChart = normalizedActive.sellerSafetyChartView?.canPublish === true && !chainsByExpiry[restoredExpiry]
    ? null
    : normalizedActive.sellerSafetyChartView;
  const migration = {
    sellerSafetyViewsByStrategy: viewsByStrategy,
    sellerSafetyChartViewsByStrategy: chartViewsByStrategy,
    sellerSafetyRefreshFailuresByExpiry: { ...(state.sellerSafetyRefreshFailuresByExpiry || {}) },
    sellerSafetyChartView: activeChart,
    sellerSafetyChainsByExpiry: chainsByExpiry,
    sellerSafetyChain: chainsByExpiry[restoredExpiry] || null,
    ...(restoredStrategy ? { expiry: restoredStrategy.expiry } : {})
  };
  await persist(migration);
  bindEvents();
  renderSettings();
  renderCurrent();
  await loadHealth();
  await loadExpiries();
  await loadBrokerStatus();
  renderSettings();
  renderCurrent();
}

init();
