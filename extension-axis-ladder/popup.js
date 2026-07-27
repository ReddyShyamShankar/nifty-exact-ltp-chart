const API = "http://127.0.0.1:8787";
const DEFAULTS = { enabled: false, expiry: "current_month" };
const $ = (selector) => document.querySelector(selector);
let state = { ...DEFAULTS };

function money(value) { return Number.isFinite(value) ? value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"; }
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
    $("#placement-status").textContent = friendlyError(error);
    return false;
  }
}

async function save(next) { state = { ...state, ...next }; await chrome.storage.local.set(state); renderState(); }
function renderState() {
  $("#enabled").setAttribute("aria-checked", String(state.enabled));
  $("#ladder-title").textContent = state.enabled ? "Option ladder is on chart" : "Option ladder is off";
  $("#summary").textContent = state.enabled
    ? "Numbers stay fixed until manual refresh."
    : "Enable it under Advanced. Numbers change only when you press refresh.";
  setStatus(state.enabled ? "LIVE" : "OFF", state.enabled ? "live" : "");
  $("#expiry").value = state.expiry;
}

function renderChain(data) {
  const chain = $("#chain");
  setStatus(state.enabled ? "LIVE" : "OFF", state.enabled ? "live" : "");
  $("#spot").textContent = money(data.spot);
  const rows = [...data.rows].sort((a, b) => b.strike - a.strike);
  chain.replaceChildren(...rows.map((row) => {
    const item = document.createElement("div");
    item.className = `chain-row${row.strike === data.atm ? " atm" : ""}`;
    item.innerHTML = `<span>${money(row.call)}</span><span class="strike">${row.strike.toLocaleString("en-IN")}</span><span class="put">${money(row.put)}</span>`;
    return item;
  }));
}

function toggleDisclosure(buttonSelector, panelSelector) {
  const button = $(buttonSelector);
  const panel = $(panelSelector);
  const expanded = button.getAttribute("aria-expanded") === "true";
  button.setAttribute("aria-expanded", String(!expanded));
  panel.hidden = expanded;
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

async function retryChartPlacement() {
  const status = $("#placement-status");
  const button = $("#retry-placement");
  button.disabled = true;
  status.textContent = "Reading native axis ticks…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.startsWith("https://www.tradingview.com/")) throw new Error("Open active TradingView chart first.");
    const result = await chrome.tabs.sendMessage(tab.id, { type: "RETRY_LABEL_PLACEMENT" });
    if (!result?.ok) throw new Error(result?.error || "Exact-axis retry failed.");
    status.textContent = "Exact-axis placement restored.";
  } catch (error) {
    status.textContent = friendlyError(error);
  } finally { button.disabled = false; }
}

async function refreshOptionNumbers() {
  const status = $("#placement-status");
  const button = $("#refresh-chain");
  const label = $("#refresh-label");
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  label.textContent = "REFRESHING…";
  status.textContent = "Refreshing option numbers…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.startsWith("https://www.tradingview.com/")) throw new Error("Open active NIFTY TradingView chart first.");
    const result = await chrome.tabs.sendMessage(tab.id, { type: "REFRESH_OPTION_NUMBERS" });
    if (!result?.ok) throw new Error(result?.error || "Option-number refresh failed.");
    if (!result.chain?.rows) throw new Error("Option-number refresh returned no chain data.");
    renderChain(result.chain);
    status.textContent = `Updated manually · ${result.chain.rows.length}/13 labels on chart`;
  } catch (error) {
    status.textContent = friendlyError(error);
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    label.textContent = "REFRESH";
  }
}

async function init() {
  state = { ...DEFAULTS, ...(await chrome.storage.local.get(DEFAULTS)) };
  $("#enabled").addEventListener("click", () => save({ enabled: !state.enabled }));
  $("#retry-placement").addEventListener("click", retryChartPlacement);
  $("#refresh-chain").addEventListener("click", refreshOptionNumbers);
  $("#open-chain").addEventListener("click", () => toggleDisclosure("#open-chain", "#chain-panel"));
  $("#advanced-toggle").addEventListener("click", () => toggleDisclosure("#advanced-toggle", "#advanced-panel"));
  $("#expiry").addEventListener("change", async (event) => {
    await save({ expiry: event.target.value });
    $("#spot").textContent = "—";
    $("#chain").innerHTML = '<div class="empty">Press refresh to load selected expiry.</div>';
    $("#placement-status").textContent = "Expiry changed · press Refresh";
  });
  renderState();
  if (!(await loadHealth())) return;
  await loadExpiries();
  renderState();
}

init();
