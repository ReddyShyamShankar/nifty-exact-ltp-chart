"use strict";

const API = "http://127.0.0.1:8787";
const DEFAULTS = {
  enabled: false,
  expiry: "current_month",
  sellerSafetyLedger: null,
  selectedStrategyId: "",
  sellerSafetyView: null
};
const $ = (selector) => document.querySelector(selector);
let state = { ...DEFAULTS };
let ledger = null;
let brokerStatus = { configured: false, connected: false, expiresAt: null };
let expiries = [];
let pendingRefresh = null;
let pendingChain = null;

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
  state = { ...state, ...next };
  if (Object.prototype.hasOwnProperty.call(next, "sellerSafetyLedger")) ledger = next.sellerSafetyLedger;
  await chrome.storage.local.set(next);
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
  const options = [optionNode("", "Select strategy")].concat(ledger.strategies
    .filter((strategy) => strategy.expiry === state.expiry)
    .map((strategy) => optionNode(strategy.id, strategy.name)));
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

function renderView(view, { pending = false } = {}) {
  const shown = pending && view.canPublish
    ? {
      ...view,
      canPublish: false,
      priority: { kind: "review", label: "REVIEW REFRESH SNAPSHOT" },
      currentRisk: { lower: "—", upper: "—" },
      wholeTrade: { lower: "—", upper: "—", status: "WITHHELD" },
      maxProfit: "—",
      maxLoss: "—",
      whyMoved: [],
      warning: "EXPLICIT SNAPSHOT ACCEPTANCE REQUIRED. RISK MAP WITHHELD."
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
  renderAllocations(shown);
  $("#review-panel").hidden = !(pending || shown.reviewChanges.length);
}

function currentView(chain = pendingChain) {
  return NiftySellerPopupView.buildView({
    ledger,
    selectedStrategyId: state.selectedStrategyId,
    brokerStatus,
    chain: chain || { expiry: state.expiry },
    now: new Date().toISOString()
  });
}

function renderCurrent({ pending = Boolean(pendingRefresh) } = {}) {
  const stored = state.sellerSafetyView;
  const validStoredView = stored?.canPublish === true && stored.priority && stored.currentRisk &&
    stored.wholeTrade && stored.broker && Array.isArray(stored.whyMoved) &&
    Array.isArray(stored.legs) && Array.isArray(stored.timeline);
  if (!pending && validStoredView) {
    renderView(stored);
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
      await persist({ expiry: expiries[0]?.expiry || "current_month", selectedStrategyId: "", sellerSafetyView: null });
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

async function refreshAll() {
  const button = $("#refresh-all");
  const label = $("#refresh-label");
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  label.textContent = "REFRESHING…";
  $("#placement-status").textContent = "READING BROKER + MARKET SNAPSHOT…";
  try {
    const data = await responseData(await fetch(`${API}/api/seller-refresh?expiry=${encodeURIComponent(state.expiry)}`, { cache: "no-store" }));
    pendingRefresh = data;
    const expiryData = expiries.find((entry) => entry.expiry === state.expiry);
    pendingChain = {
      ...data.chain,
      updatedAt: data.updatedAt,
      daysToExpiry: expiryData?.daysToExpiry
    };
    ledger = NiftySellerLedger.reconcilePositions(ledger, data.positions);
    await persist({ sellerSafetyLedger: ledger, sellerSafetyView: null });
    renderCurrent({ pending: true });
    $("#placement-status").textContent = ledger.reviewChanges.length
      ? `${ledger.reviewChanges.length} POSITION CHANGE${ledger.reviewChanges.length === 1 ? "" : "S"} NEED REVIEW`
      : "SNAPSHOT READY FOR EXPLICIT ACCEPTANCE";
  } catch (error) {
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
    await persist({ sellerSafetyLedger: ledger, selectedStrategyId: id, sellerSafetyView: null });
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
    for (const input of inputs) {
      const signedLots = Number(input.value);
      if (!Number.isInteger(signedLots)) throw new Error("Allocations must use signed whole lots.");
      ledger = NiftySellerLedger.allocateLots(ledger, {
        strategyId: state.selectedStrategyId,
        contractId: input.dataset.allocationContract,
        signedLots
      });
    }
    await persist({ sellerSafetyLedger: ledger, sellerSafetyView: null });
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
  if (!state.selectedStrategyId) {
    $("#import-summary").textContent = "SELECT A STRATEGY BEFORE IMPORT";
    return;
  }
  try {
    const parsed = NiftyTradebookCsv.parseTradebookCsv(await file.text());
    if (parsed.errors.length) throw new Error(parsed.errors.map((error) => `ROW ${error.row}: ${error.reason}`).join(" · "));
    if (!parsed.trades.length) throw new Error("CSV contains no accepted NIFTY fills.");
    const dates = parsed.trades.map((trade) => datePart(trade.timestamp)).filter(Boolean).sort();
    const today = new Date().toISOString().slice(0, 10);
    const acceptedAt = new Date().toISOString();
    ledger = NiftySellerLedger.assignFills(ledger, {
      strategyId: state.selectedStrategyId,
      trades: parsed.trades,
      fillIds: parsed.trades.map((trade) => trade.id),
      importBatch: {
        sourceKind: parsed.sourceKind,
        fingerprint: parsed.batchFingerprint,
        coverage: { from: dates[0], to: [dates.at(-1), today].sort().at(-1) },
        acceptedAt,
        confirmedAt: acceptedAt
      }
    });
    await persist({ sellerSafetyLedger: ledger, sellerSafetyView: null });
    $("#import-summary").textContent = `${parsed.trades.length} FILL${parsed.trades.length === 1 ? "" : "S"} IMPORTED · ${file.name}`;
    renderCurrent({ pending: true });
  } catch (error) {
    $("#import-summary").textContent = friendlyError(error);
  }
}

async function acceptSnapshot() {
  if (!pendingRefresh) {
    $("#placement-status").textContent = "PRESS REFRESH ALL BEFORE ACCEPTING";
    return;
  }
  if (ledger.reviewChanges.length) {
    $("#placement-status").textContent = "ALLOCATE EVERY POSITION CHANGE BEFORE ACCEPTING";
    return;
  }
  try {
    const acceptedAt = new Date().toISOString();
    const acceptedLedger = JSON.parse(JSON.stringify(ledger));
    const acceptedStrategy = acceptedLedger.strategies.find((strategy) => strategy.id === state.selectedStrategyId);
    if (!acceptedStrategy) throw new Error("Select the reviewed strategy before accepting.");
    acceptedStrategy.snapshots.push({ at: acceptedAt });
    const view = NiftySellerPopupView.buildView({
      ledger: acceptedLedger,
      selectedStrategyId: state.selectedStrategyId,
      brokerStatus,
      chain: pendingChain,
      now: acceptedAt
    });
    if (!view.canPublish || !view.maps) throw new Error("Reviewed allocation is not safe to publish.");
    ledger = NiftySellerLedger.acceptSnapshot(ledger, {
      strategyId: state.selectedStrategyId,
      snapshot: {
        at: acceptedAt,
        currentMap: view.maps.current,
        wholeTradeMap: view.maps.wholeTrade
      }
    });
    view.timeline = [{ at: acceptedAt, lower: view.currentRisk.lower, upper: view.currentRisk.upper }].concat(view.timeline.slice(1));
    await persist({
      sellerSafetyLedger: ledger,
      selectedStrategyId: state.selectedStrategyId,
      sellerSafetyView: view
    });
    pendingRefresh = null;
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
  $("#accept-snapshot").addEventListener("click", acceptSnapshot);
  $("#selected-strategy").addEventListener("change", async (event) => {
    await persist({ selectedStrategyId: event.target.value, sellerSafetyView: null });
    renderCurrent({ pending: true });
  });
  $("#expiry").addEventListener("change", async (event) => {
    pendingRefresh = null;
    pendingChain = null;
    const matching = ledger.strategies.find((strategy) => strategy.expiry === event.target.value);
    await persist({ expiry: event.target.value, selectedStrategyId: matching?.id || "", sellerSafetyView: null });
    const expiryData = expiries.find((entry) => entry.expiry === state.expiry);
    $("#expiry-hint").textContent = expiryData ? `${expiryData.daysToExpiry} DTE` : "NO EXPIRY";
    renderCurrent({ pending: false });
    $("#placement-status").textContent = "EXPIRY CHANGED · PRESS REFRESH ALL";
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
  bindEvents();
  renderSettings();
  renderCurrent({ pending: false });
  await loadHealth();
  await loadExpiries();
  await loadBrokerStatus();
  renderSettings();
  renderCurrent({ pending: false });
}

init();
