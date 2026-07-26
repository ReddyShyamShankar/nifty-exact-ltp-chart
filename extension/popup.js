const API = "http://127.0.0.1:8787";
const PINE_STRIKE_STEP = 100;
const DEFAULTS = { enabled: false, expiry: "current_month", labelCount: "5", panelOpen: false };
const $ = (selector) => document.querySelector(selector);
let state = { ...DEFAULTS };
let refreshTimer = null;

function money(value) { return Number.isFinite(value) ? value.toFixed(2) : "—"; }
function formatDate(value) { return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`)); }
function setStatus(label, kind = "") { const node = $("#status"); node.textContent = label; node.className = `status-pill ${kind}`; }
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

async function loadHealth() {
  try {
    const response = await fetch(`${API}/api/health?live=1`, { cache: "no-store" });
    const data = await responseData(response);
    return data.status === "ok";
  } catch (error) {
    setStatus("ERROR", "err");
    $("#expiry-hint").textContent = friendlyError(error);
    $("#sync-status").textContent = friendlyError(error);
    return false;
  }
}

async function save(next) { state = { ...state, ...next }; await chrome.storage.local.set(state); renderState(); }
function renderState() {
  $("#enabled").setAttribute("aria-checked", String(state.enabled));
  $("#summary").textContent = state.enabled ? "Labels shown only on active NIFTY chart tabs." : "Open only when wanted. Nothing shown on chart.";
  setStatus(state.enabled ? "LIVE" : "OFF", state.enabled ? "live" : "");
  document.querySelectorAll("[data-count]").forEach((button) => button.classList.toggle("on", button.dataset.count === state.labelCount));
  $("#expiry").value = state.expiry;
}

async function loadChain() {
  const chain = $("#chain");
  chain.innerHTML = '<div class="empty">Loading live LTP…</div>';
  try {
    const response = await fetch(`${API}/api/nifty-chain?expiry=${encodeURIComponent(state.expiry)}`, { cache: "no-store" });
    const data = await responseData(response);
    setStatus("LIVE", "live");
    $("#spot").textContent = `SPOT ${money(data.spot)}`;
    const rows = [...data.rows].sort((a, b) => b.strike - a.strike);
    chain.replaceChildren(...rows.map((row) => {
      const item = document.createElement("div");
      item.className = `chain-row${row.strike === data.atm ? " atm" : ""}`;
      item.innerHTML = `<span>${money(row.call)}</span><span class="strike">${row.strike.toLocaleString("en-IN")}</span><span class="put">${money(row.put)}</span>`;
      return item;
    }));
  } catch (error) {
    setStatus("ERROR", "err");
    $("#spot").textContent = "BRIDGE OFFLINE";
    chain.innerHTML = `<div class="empty">${friendlyError(error)}</div>`;
  }
}

async function loadExpiries() {
  try {
    const response = await fetch(`${API}/api/nifty-expiries`, { cache: "no-store" });
    const data = await responseData(response);
    const select = $("#expiry");
    select.replaceChildren();
    data.expiries.forEach(({ expiry, daysToExpiry }) => {
      const option = document.createElement("option");
      option.value = expiry;
      option.textContent = `${formatDate(expiry)} · ${daysToExpiry} DTE`;
      select.append(option);
    });
    if (!data.expiries.some(({ expiry }) => expiry === state.expiry)) await save({ expiry: data.expiries[0]?.expiry || "current_month" });
    $("#expiry-hint").textContent = `${data.expiries.length} dates`;
  } catch (error) {
    $("#expiry-hint").textContent = friendlyError(error);
  }
}

async function syncPineInputs() {
  const status = $("#sync-status");
  const button = $("#sync-pine");
  button.disabled = true;
  status.textContent = "Reading live contracts…";
  try {
    const response = await fetch(`${API}/api/nifty-chain?expiry=${encodeURIComponent(state.expiry)}`, { cache: "no-store" });
    const data = await responseData(response);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active TradingView tab.");
    const result = await chrome.tabs.sendMessage(tab.id, {
      type: "SYNC_PINE_INPUTS",
      expiry: data.expiry,
      rows: data.rows,
      spot: data.spot,
      strikeStep: PINE_STRIKE_STEP
    });
    if (!result?.ok) throw new Error(result?.error || "Pine settings not ready.");
    status.textContent = `ATM ${result.center.toLocaleString("en-IN")} · ${result.step}-point spacing · ${result.count} fields synced.`;
  } catch (error) {
    status.textContent = friendlyError(error);
  } finally { button.disabled = false; }
}

async function retryChartPlacement() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.startsWith("https://www.tradingview.com/")) return;
  await chrome.tabs.sendMessage(tab.id, { type: "RETRY_LABEL_PLACEMENT" }).catch(() => {});
}

async function init() {
  state = { ...DEFAULTS, ...(await chrome.storage.local.get(DEFAULTS)) };
  $("#enabled").addEventListener("click", () => save({ enabled: !state.enabled }));
  $("#open-canvas").addEventListener("click", () => save({ panelOpen: true }));
  $("#sync-pine").addEventListener("click", syncPineInputs);
  $("#expiry").addEventListener("change", async (event) => { await save({ expiry: event.target.value }); await loadChain(); });
  document.querySelectorAll("[data-count]").forEach((button) => button.addEventListener("click", () => save({ labelCount: button.dataset.count })));
  renderState();
  await retryChartPlacement();
  if (!(await loadHealth())) return;
  await loadExpiries();
  renderState();
  await loadChain();
  refreshTimer = window.setInterval(loadChain, 2000);
}
init();
