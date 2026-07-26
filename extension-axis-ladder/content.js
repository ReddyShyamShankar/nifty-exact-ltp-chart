(() => {
  "use strict";
  const LABELS_ID = "nifty-chain-overlay";
  const PANEL_ID = "nifty-exact-price-chart";
  const API = "http://127.0.0.1:8787";
  const STRIKE_STEP = 100;
  const DEFAULTS = { enabled: false, expiry: "current_month", labelCount: "5", panelOpen: false };
  let settings = { ...DEFAULTS };
  let labelData = null;
  let panelData = null;
  let hoveredStrike = null;
  let refreshTimer = null;
  let loading = false;
  let labelsLoading = false;
  let placementTimer = null;
  let placementBurstTimers = [];
  let placementInFlight = false;
  let placementQueued = false;
  let lastPlacementStartedAt = 0;
  let placementCenter = null;
  const MIN_CAPTURE_GAP = 550;
  const PLACEMENT_RETRY_DELAYS = [0, 650, 1350, 2200];

  const money = (value) => Number.isFinite(value) ? value.toFixed(2) : "—";
  const remove = (id) => document.getElementById(id)?.remove();
  const selectedRows = (rows, strike, count) => {
    if (count === "all") return rows;
    const span = Math.floor(Number(count) / 2) * STRIKE_STEP;
    return rows.filter((row) => Math.abs(row.strike - strike) <= span);
  };

  function ensureLabelRoot() {
    let root = document.getElementById(LABELS_ID);
    if (root) return root;
    root = document.createElement("div");
    root.id = LABELS_ID;
    root.hidden = true;
    document.documentElement.append(root);
    return root;
  }

  function markerMask(role) {
    const mask = document.createElement("span");
    mask.className = "nifty-chain-overlay__anchor-mask";
    mask.dataset.anchor = role;
    return mask;
  }

  function renderLabels() {
    if (!settings.enabled || !labelData?.rows?.length) { remove(LABELS_ID); return; }
    const center = NiftyLadder.centerForSpot(labelData.spot, STRIKE_STEP);
    const byStrike = new Map(labelData.rows.map((row) => [Number(row.strike), row]));
    const rows = NiftyLadder.fiveStrikes(center, STRIKE_STEP).map((strike) => byStrike.get(strike)).filter(Boolean);
    if (rows.length !== 5) return;
    const root = ensureLabelRoot();
    const existing = new Map([...root.querySelectorAll(".nifty-chain-overlay__row")].map((node) => [Number(node.dataset.strike), node]));
    rows.forEach((row) => {
      let node = existing.get(Number(row.strike));
      if (!node) {
        node = document.createElement("div");
        node.className = "nifty-chain-overlay__row";
        node.dataset.strike = String(row.strike);
        root.append(node);
      }
      node.classList.toggle("is-atm", Number(row.strike) === center);
      node.textContent = `C ${money(row.call)} | P ${money(row.put)}`;
      existing.delete(Number(row.strike));
    });
    existing.forEach((node) => node.remove());
    if (!root.querySelector('[data-anchor="lower"]')) root.append(markerMask("lower"));
    if (!root.querySelector('[data-anchor="upper"]')) root.append(markerMask("upper"));
    if (root.hidden || placementCenter !== center) requestPlacementBurst();
  }

  async function refreshLabels() {
    if (!settings.enabled || labelsLoading) return;
    labelsLoading = true;
    try {
      const response = await fetch(`${API}/api/nifty-chain?expiry=${encodeURIComponent(settings.expiry)}`, { cache: "no-store" });
      const chain = await response.json();
      if (!response.ok) throw new Error(chain.error || "Option chain unavailable.");
      labelData = chain;
      renderLabels();
    } catch {
      // Preserve last good labels during a short bridge or network interruption.
    } finally { labelsLoading = false; }
  }

  function requestPlacement(delay = 180) {
    placementQueued = true;
    clearTimeout(placementTimer);
    const captureWait = Math.max(0, MIN_CAPTURE_GAP - (Date.now() - lastPlacementStartedAt));
    placementTimer = setTimeout(runPlacement, Math.max(delay, captureWait));
  }

  function requestPlacementBurst() {
    placementBurstTimers.forEach(clearTimeout);
    placementBurstTimers = PLACEMENT_RETRY_DELAYS.map((delay) => setTimeout(() => requestPlacement(0), delay));
  }

  async function runPlacement() {
    placementTimer = null;
    if (placementInFlight || !placementQueued) return;
    const captureWait = Math.max(0, MIN_CAPTURE_GAP - (Date.now() - lastPlacementStartedAt));
    if (captureWait > 0) {
      placementTimer = setTimeout(runPlacement, captureWait);
      return;
    }
    placementQueued = false;
    placementInFlight = true;
    lastPlacementStartedAt = Date.now();
    try {
      await placeLabels();
    } finally {
      placementInFlight = false;
      if (placementQueued) requestPlacement(0);
    }
  }

  async function placeLabels() {
    const root = document.getElementById(LABELS_ID);
    const plot = document.querySelector('canvas[aria-label^="Chart for"]');
    if (!root || !plot || !labelData) return;
    const plotRect = plot.getBoundingClientRect();
    const masks = [...root.querySelectorAll(".nifty-chain-overlay__anchor-mask")];
    masks.forEach((mask) => { mask.style.display = "none"; });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const anchors = await chrome.runtime.sendMessage({
      type: "CAPTURE_PINE_ANCHORS",
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      plotRect: { left: plotRect.left, top: plotRect.top, right: plotRect.right, bottom: plotRect.bottom }
    }).catch(() => null);
    if (!anchors?.ok || !anchors.lower || !anchors.upper) {
      if (!root.hidden) masks.forEach((mask) => { mask.style.display = "block"; });
      return;
    }
    const center = NiftyLadder.centerForSpot(labelData.spot, STRIKE_STEP);
    const toY = NiftyOverlay.priceToY(anchors.lower, anchors.upper, center - STRIKE_STEP * 2, center + STRIKE_STEP * 2);
    if (!toY) {
      if (!root.hidden) masks.forEach((mask) => { mask.style.display = "block"; });
      return;
    }
    const rowRecords = [...root.querySelectorAll(".nifty-chain-overlay__row")]
      .map((node) => ({
        node,
        strike: Number(node.dataset.strike),
        rawY: toY(Number(node.dataset.strike)),
        height: node.getBoundingClientRect().height || 22
      }))
      .filter((record) => Number.isFinite(record.rawY))
      .sort((a, b) => a.rawY - b.rawY);
    const atmIndex = rowRecords.findIndex((record) => record.strike === center);
    const minimumGap = Math.ceil(Math.max(...rowRecords.map((record) => record.height), 22) + 4);
    const labelYs = NiftyOverlay.spreadAroundAnchor(rowRecords.map((record) => record.rawY), atmIndex, minimumGap);
    if (!labelYs) return;
    rowRecords.forEach((record, index) => {
      const { node, rawY, height } = record;
      const labelY = labelYs[index];
      const anchorOffset = Math.round(rawY - labelY);
      node.style.right = `${Math.max(0, window.innerWidth - plotRect.right + 7)}px`;
      node.style.top = `${Math.round(labelY - height / 2)}px`;
      node.style.setProperty("--nifty-leader-height", `${Math.abs(anchorOffset)}px`);
      node.classList.toggle("has-leader", Math.abs(anchorOffset) > 1);
      node.classList.toggle("leader-down", anchorOffset > 1);
      node.classList.toggle("leader-up", anchorOffset < -1);
    });
    [["lower", anchors.lower], ["upper", anchors.upper]].forEach(([role, anchor]) => {
      const mask = root.querySelector(`[data-anchor="${role}"]`);
      mask.style.left = `${Math.floor(anchor.left - 3)}px`;
      mask.style.top = `${Math.floor(anchor.top - 3)}px`;
      mask.style.width = `${Math.ceil(anchor.right - anchor.left + 6)}px`;
      mask.style.height = `${Math.ceil(anchor.bottom - anchor.top + 6)}px`;
      mask.style.display = "block";
    });
    placementCenter = center;
    root.hidden = false;
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;
    panel = document.createElement("aside");
    panel.id = PANEL_ID;
    panel.innerHTML = `<header><div><span class="mark"></span><b>NIFTY OPTIONS</b><em>/ exact price chart</em></div><button type="button" aria-label="Close exact price chart">×</button></header><div class="meta"><span data-role="expiry">Loading expiry…</span><span data-role="status">CONNECTING</span><span data-role="spot">—</span></div><div class="instruction">MOVE OVER PRICE LEVEL — CALL / PUT LTP LOCKS TO EXACT STRIKE</div><canvas aria-label="NIFTY companion chart"></canvas><div class="readout" data-role="readout">Loading chart…</div>`;
    panel.querySelector("button").addEventListener("click", () => chrome.storage.local.set({ panelOpen: false }));
    panel.querySelector("canvas").addEventListener("mousemove", (event) => {
      if (!panelData) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      const point = panelData.geometry;
      const y = (event.clientY - bounds.top) * panelData.pixelRatio;
      if (y < point.top || y > point.bottom) return;
      const raw = point.max - ((y - point.top) / (point.bottom - point.top)) * (point.max - point.min);
      const next = Math.round(raw / STRIKE_STEP) * STRIKE_STEP;
      if (next !== hoveredStrike && panelData.byStrike.has(next)) { hoveredStrike = next; drawChart(); }
    });
    document.documentElement.append(panel);
    return panel;
  }

  function drawChart() {
    const panel = ensurePanel();
    const canvas = panel.querySelector("canvas");
    const rect = canvas.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * pixelRatio));
    canvas.height = Math.max(1, Math.round(rect.height * pixelRatio));
    const ctx = canvas.getContext("2d");
    const { candles, rows, spot, expiry } = panelData;
    const activeStrike = hoveredStrike ?? Math.round(spot / STRIKE_STEP) * STRIKE_STEP;
    const values = candles.flatMap((candle) => [candle.high, candle.low]).concat(rows.map((row) => row.strike));
    const min = Math.floor((Math.min(...values) - 100) / 100) * 100;
    const max = Math.ceil((Math.max(...values) + 100) / 100) * 100;
    const left = 12 * pixelRatio, right = canvas.width - 178 * pixelRatio, top = 20 * pixelRatio, bottom = canvas.height - 20 * pixelRatio;
    const scaleY = (price) => top + ((max - price) / (max - min)) * (bottom - top);
    panelData.geometry = { min, max, top, bottom };
    panelData.pixelRatio = pixelRatio;

    ctx.fillStyle = "#0a0a0a"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = `${10 * pixelRatio}px Geist Mono, monospace`; ctx.textBaseline = "middle";
    for (let price = min; price <= max; price += 200) {
      const y = scaleY(price); ctx.strokeStyle = "#1f1f23"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
      ctx.fillStyle = "#71717a"; ctx.textAlign = "left"; ctx.fillText(price.toLocaleString("en-IN"), right + 10 * pixelRatio, y);
    }
    const width = (right - left) / candles.length;
    candles.forEach((candle, index) => {
      const x = left + index * width + width * .5; const up = candle.close >= candle.open;
      ctx.strokeStyle = up ? "#34d399" : "#f87171"; ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath(); ctx.moveTo(x, scaleY(candle.high)); ctx.lineTo(x, scaleY(candle.low)); ctx.stroke();
      const yOpen = scaleY(candle.open), yClose = scaleY(candle.close); const bodyY = Math.min(yOpen, yClose);
      ctx.fillRect(x - Math.max(1, width * .32), bodyY, Math.max(2, width * .64), Math.max(1.5 * pixelRatio, Math.abs(yClose - yOpen)));
    });
    const visible = selectedRows(rows, activeStrike, settings.labelCount);
    visible.forEach((row) => {
      const y = scaleY(row.strike); if (y < top || y > bottom) return;
      const active = row.strike === activeStrike; const label = `${money(row.call)} C  |  ${row.strike}  |  P ${money(row.put)}`;
      ctx.fillStyle = active ? "#34d399" : "#161618"; ctx.fillRect(right + 4 * pixelRatio, y - 12 * pixelRatio, canvas.width - right - 8 * pixelRatio, 24 * pixelRatio);
      ctx.fillStyle = active ? "#0a0a0a" : "#f4f4f5"; ctx.textAlign = "left"; ctx.font = `${active ? 10.5 : 10}px Geist Mono, monospace`; ctx.fillText(label, right + 10 * pixelRatio, y);
    });
    const active = panelData.byStrike.get(activeStrike);
    panel.querySelector('[data-role="expiry"]').textContent = `EXPIRY ${expiry}`;
    panel.querySelector('[data-role="status"]').textContent = `LIVE · ${new Date(panelData.updatedAt).toLocaleTimeString("en-IN")}`;
    panel.querySelector('[data-role="spot"]').textContent = `SPOT ${money(spot)}`;
    panel.querySelector('[data-role="readout"]').textContent = active ? `${activeStrike.toLocaleString("en-IN")}  ·  CALL ${money(active.call)}  ·  PUT ${money(active.put)}` : "Move over a strike price";
  }

  async function openPanel() {
    if (loading) return;
    loading = true;
    const panel = ensurePanel();
    panel.classList.add("is-loading");
    try {
      const [chainResponse, candleResponse] = await Promise.all([
        fetch(`${API}/api/nifty-chain?expiry=${encodeURIComponent(settings.expiry)}`, { cache: "no-store" }),
        fetch(`${API}/api/nifty-candles?days=120`, { cache: "no-store" })
      ]);
      const chain = await chainResponse.json(); const candles = await candleResponse.json();
      if (!chainResponse.ok) throw new Error(chain.error || "Option chain unavailable.");
      if (!candleResponse.ok) throw new Error(candles.error || "NIFTY candles unavailable.");
      const previousStrike = hoveredStrike;
      panelData = { ...chain, candles: candles.candles, byStrike: new Map(chain.rows.map((row) => [row.strike, row])) };
      hoveredStrike = panelData.byStrike.has(previousStrike) ? previousStrike : Math.round(chain.spot / STRIKE_STEP) * STRIKE_STEP;
      drawChart();
    } catch (error) {
      panel.querySelector('[data-role="status"]').textContent = "STALE";
      panel.querySelector('[data-role="readout"]').textContent = error.message;
    } finally { loading = false; panel.classList.remove("is-loading"); }
  }

  function startRefresh() {
    if (refreshTimer) return;
    refreshTimer = window.setInterval(() => {
      if (settings.enabled) refreshLabels();
      if (settings.panelOpen) openPanel();
    }, 2000);
  }

  function stopRefresh() {
    if (!refreshTimer) return;
    window.clearInterval(refreshTimer);
    refreshTimer = null;
  }

  const visible = (node) => {
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(node).visibility !== "hidden";
  };

  const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
  const normalizeText = (value) => String(value || "").replace(/[−–—]/g, "-").replace(/\s+/g, " ").trim();
  const allVisible = (selector, root = document) => [...root.querySelectorAll(selector)].filter(visible);

  async function waitFor(find, message, timeout = 7000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const result = find();
      if (result) return result;
      await wait(100);
    }
    throw new Error(message);
  }

  async function waitForDomQuiet(root, quietMs = 350, timeout = 4000) {
    await new Promise((resolve) => {
      let quietTimer;
      let timeoutTimer;
      const finish = () => {
        observer.disconnect();
        clearTimeout(quietTimer);
        clearTimeout(timeoutTimer);
        resolve();
      };
      const observer = new MutationObserver(() => {
        clearTimeout(quietTimer);
        quietTimer = setTimeout(finish, quietMs);
      });
      observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true });
      quietTimer = setTimeout(finish, quietMs);
      timeoutTimer = setTimeout(finish, timeout);
    });
  }

  function exactText(root, value) {
    const wanted = normalizeText(value);
    return allVisible("*", root)
      .filter((node) => normalizeText(node.textContent) === wanted)
      .sort((a, b) => a.children.length - b.children.length || a.getBoundingClientRect().width - b.getBoundingClientRect().width)[0] || null;
  }

  function descriptor(node) {
    if (!node) return "";
    const attributes = node.getAttributeNames?.().map((name) => node.getAttribute(name)).join(" ") || "";
    return normalizeText(`${node.textContent || ""} ${attributes}`);
  }

  async function trustedCommand(message) {
    const result = await chrome.runtime.sendMessage(message);
    if (!result?.ok) throw new Error(result?.error || "Chrome trusted input failed.");
  }

  async function activatePoint(x, y) {
    await trustedCommand({
      type: "TRUSTED_CLICK",
      x,
      y
    });
    return true;
  }

  async function activate(node) {
    if (!node) return false;
    node.scrollIntoView({ block: "center", inline: "center" });
    await wait(80);
    const rect = node.getBoundingClientRect();
    return activatePoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  async function doubleActivate(node) {
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    await trustedCommand({
      type: "TRUSTED_DOUBLE_CLICK",
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    });
    return true;
  }

  async function replaceText(node, value) {
    await activate(node);
    await trustedCommand({ type: "TRUSTED_REPLACE_TEXT", text: value });
  }

  async function replaceFieldText(node, value) {
    node.scrollIntoView({ block: "center", inline: "center" });
    await wait(80);
    const rect = node.getBoundingClientRect();
    await trustedCommand({
      type: "TRUSTED_REPLACE_FIELD",
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      text: String(value)
    });
  }

  function settingsDialog() {
    const title = exactText(document, "NIFTY Monthly LTP Ladder");
    for (let node = title; node; node = node.parentElement) {
      const text = normalizeText(node.textContent);
      if (text.includes("Inputs") && text.includes("Style") && text.includes("Visibility")
        && allVisible("button, [role=button]", node).some((button) => /^(ok|apply|done)$/i.test(normalizeText(button.textContent)))) return node;
    }
    return null;
  }

  async function ensureSettingsDialog() {
    const existing = settingsDialog();
    if (existing) return existing;
    const showLegend = allVisible("button, [role=button]").find((button) => /show indicators legend/i.test(descriptor(button)));
    if (showLegend) {
      await activate(showLegend);
      await wait(650);
    }
    const indicator = await waitFor(
      () => exactText(document, "NIFTY Monthly LTP Ladder"),
      "NIFTY Monthly LTP Ladder indicator not found on this chart."
    );
    const indicatorRect = indicator.getBoundingClientRect();
    const indicatorY = indicatorRect.top + indicatorRect.height / 2;
    await doubleActivate(indicator);
    await wait(600);
    const openedByTitle = settingsDialog();
    if (openedByTitle) return openedByTitle;

    const settingsCandidates = allVisible("button, [role=button]")
      .filter((button) => /settings/i.test(descriptor(button)))
      .map((button) => {
        const rect = button.getBoundingClientRect();
        return { button, rect, distance: Math.abs(rect.top + rect.height / 2 - indicatorY) };
      })
      .filter(({ rect, distance }) => distance < 18 && rect.left >= 0 && rect.right <= window.innerWidth)
      .sort((a, b) => a.distance - b.distance);
    const selectedSettings = settingsCandidates[0];
    const settingsButton = selectedSettings?.button || null;
    if (!settingsButton) throw new Error(`Indicator Settings button not found near y=${Math.round(indicatorY)}.`);
    settingsButton.click();
    await wait(500);
    const opened = settingsDialog();
    if (opened) return opened;
    await activate(settingsButton);
    try {
      return await waitFor(settingsDialog, "Pine Settings did not open.");
    } catch {
      const rect = selectedSettings.rect;
      const candidates = settingsCandidates.map(({ rect: candidate }) =>
        `${Math.round(candidate.left)},${Math.round(candidate.top)},${Math.round(candidate.width)}x${Math.round(candidate.height)}`
      ).join("|");
      throw new Error(`Pine Settings did not open. title=${Math.round(indicatorRect.left)},${Math.round(indicatorRect.top)} picked=${Math.round(rect.left)},${Math.round(rect.top)} candidates=${candidates}`);
    }
  }

  function fieldRow(dialog, label) {
    const labelNode = exactText(dialog, label);
    if (!labelNode) return null;
    const labelRect = labelNode.getBoundingClientRect();
    const labelY = labelRect.top + labelRect.height / 2;
    const buttons = allVisible("button, [role=button]", dialog)
      .map((button) => ({ button, rect: button.getBoundingClientRect() }))
      .filter(({ rect }) => rect.left > labelRect.right - 5
        && Math.abs(rect.top + rect.height / 2 - labelY) < 22)
      .sort((a, b) => a.rect.left - b.rect.left);
    if (!buttons.length) return null;
    return { node: dialog, labelNode, resetButton: buttons.at(-1).button };
  }

  async function activateSymbolEditor(row) {
    const valueNode = fieldValueNode(row);
    if (!valueNode) throw new Error(`Pine symbol editor target not found: ${normalizeText(row.labelNode.textContent)}`);
    await activate(valueNode);
  }

  function fieldValueNode(row) {
    const labelRect = row.labelNode.getBoundingClientRect();
    const resetRect = row.resetButton.getBoundingClientRect();
    const labelY = labelRect.top + labelRect.height / 2;
    return allVisible("*", row.node)
      .map((node) => ({ node, rect: node.getBoundingClientRect() }))
      .filter(({ node, rect }) => node !== row.labelNode
        && rect.left > labelRect.right + 4
        && rect.right <= resetRect.left + 2
        && Math.abs(rect.top + rect.height / 2 - labelY) < 24)
      .filter(({ node }) => /^NSE:NIFTY\w+/i.test(normalizeText(node.textContent)))
      .sort((a, b) => a.node.children.length - b.node.children.length || a.rect.width - b.rect.width)[0]?.node || null;
  }

  function fieldValueText(row) {
    return normalizeText(fieldValueNode(row)?.textContent);
  }

  function numericInput(dialog, label) {
    const labelNode = exactText(dialog, label);
    if (!labelNode) return null;
    const labelRect = labelNode.getBoundingClientRect();
    return allVisible("input", dialog)
      .map((input) => ({ input, rect: input.getBoundingClientRect() }))
      .filter(({ rect }) => rect.left > labelRect.right && Math.abs(rect.top + rect.height / 2 - (labelRect.top + labelRect.height / 2)) < 24)
      .sort((a, b) => a.rect.left - b.rect.left)[0]?.input || null;
  }

  async function setNumericInput(dialog, label, value) {
    const input = numericInput(dialog, label);
    if (!input) throw new Error(`${label} input not found.`);
    if (Number(input.value) === Number(value)) return;
    await replaceFieldText(input, String(value));
    await wait(150);
    if (Number(input.value) !== Number(value)) throw new Error(`${label} did not update to ${value}.`);
  }

  function changeSymbolRoot() {
    const input = allVisible('input[placeholder*="Symbol"], input[placeholder*="ISIN"], [role=searchbox]').find((node) => /symbol|isin|cusip/i.test(node.getAttribute("placeholder") || ""));
    if (!input) return null;
    let best = input.parentElement;
    for (let node = input.parentElement, depth = 0; node && depth < 8; node = node.parentElement, depth += 1) {
      if (/change symbol/i.test(normalizeText(node.textContent))) best = node;
    }
    return { root: best, input };
  }

  function optionChainRoot() {
    const title = exactText(document, "NIFTY Options");
    for (let node = title; node; node = node.parentElement) {
      const text = normalizeText(node.textContent);
      if (text.includes("Calls") && text.includes("Puts") && text.includes("Strike")) return node;
    }
    return null;
  }

  function niftyResult(root) {
    const candidates = allVisible("*", root).filter((node) => normalizeText(node.textContent) === "NIFTY");
    for (const candidate of candidates) {
      for (let node = candidate.parentElement, depth = 0; node && depth < 7; node = node.parentElement, depth += 1) {
        const text = normalizeText(node.textContent);
        if (text.includes("Nifty 50 Index") && text.includes("NSE")) return candidate;
      }
    }
    return null;
  }

  async function openOptionChain() {
    const existing = optionChainRoot();
    if (existing) return existing;
    const picker = await waitFor(changeSymbolRoot, "TradingView symbol picker did not open.");
    await replaceText(picker.input, "NIFTY");
    const result = await waitFor(() => niftyResult(picker.root), "NIFTY option chain result not found.");
    await activate(result);
    return waitFor(optionChainRoot, "NIFTY option chain did not open.");
  }

  async function chooseExpiry(chain, expiry) {
    if (!expiry) return;
    const matchesExpiry = (node) => NiftyExpiry.matches(descriptor(node), expiry);
    const options = () => allVisible("button, [role=button]", chain)
      .filter((node) => node.hasAttribute("aria-selected") && matchesExpiry(node));
    const option = await waitFor(
      () => options()[0] || null,
      `TradingView does not offer expiry ${expiry}.`,
      5000
    );
    if (option.getAttribute("aria-selected") === "true") return;

    await activate(option);
    await waitFor(
      () => option.getAttribute("aria-selected") === "true",
      `TradingView did not switch to expiry ${expiry}.`,
      5000
    );
    await wait(500);
    await waitForDomQuiet(chain);
  }

  function contractCell(chain, side, strike) {
    const wanted = `${side} ${Number(strike)}`.toLowerCase();
    const textNode = allVisible("*", chain)
      .filter((node) => normalizeText(node.textContent).replace(/,/g, "").toLowerCase() === wanted)
      .sort((a, b) => a.children.length - b.children.length || a.getBoundingClientRect().width - b.getBoundingClientRect().width)[0] || null;
    return textNode;
  }

  async function chooseContract(label, symbol, side, strike, expiry) {
    let dialog = await ensureSettingsDialog();
    const row = fieldRow(dialog, label);
    if (!row) throw new Error(`Pine row not found: ${label}`);
    if (fieldValueText(row).includes(symbol)) return false;
    row.node.scrollIntoView({ block: "center" });
    await wait(100);
    await activateSymbolEditor(row);
    const chain = await openOptionChain();
    await chooseExpiry(chain, expiry);
    const cell = await waitFor(() => contractCell(optionChainRoot(), side, strike), `TradingView contract not found: ${side} ${strike}`);
    const cellRect = cell.getBoundingClientRect();
    await activate(cell);
    dialog = await waitFor(
      () => optionChainRoot() ? null : settingsDialog(),
      `TradingView did not close option chain after selecting ${side} ${strike}.`
    );
    await wait(100);
    const updatedRow = fieldRow(dialog, label);
    if (!updatedRow || !fieldValueText(updatedRow).includes(symbol)) {
      throw new Error(
        `TradingView did not apply ${label}: ${symbol}.`
        + ` cell=${Math.round(cellRect.left)},${Math.round(cellRect.top)},${Math.round(cellRect.width)}x${Math.round(cellRect.height)}`
      );
    }
    return true;
  }

  async function syncPineInputs(rows, expiry, spot, requestedStep = 100) {
    const dialog = await ensureSettingsDialog();
    const step = Number(requestedStep);
    const center = NiftyLadder.centerForSpot(spot, step);
    if (!Number.isFinite(center) || !Number.isFinite(step)) throw new Error("Live center strike or strike interval not found.");
    await setNumericInput(dialog, "Center strike", center);
    await setNumericInput(dialog, "Strike interval", step);

    const byStrike = new Map(rows.map((row) => [Number(row.strike), row]));
    const fields = [
      { offset: -2, call: "Strike -2 Call", put: "Strike -2 Put" },
      { offset: -1, call: "Strike -1 Call", put: "Strike -1 Put" },
      { offset: 0, call: "Center Call", put: "Center Put" },
      { offset: 1, call: "Strike +1 Call", put: "Strike +1 Put" },
      { offset: 2, call: "Strike +2 Call", put: "Strike +2 Put" }
    ];
    let count = 0;
    for (const field of fields) {
      const strike = center + field.offset * step;
      const row = byStrike.get(strike);
      if (!row?.callSymbol || !row?.putSymbol) throw new Error(`Bridge contract missing for strike ${strike}.`);
      if (await chooseContract(field.call, row.callSymbol, "Call", strike, expiry)) count += 1;
      if (await chooseContract(field.put, row.putSymbol, "Put", strike, expiry)) count += 1;
    }

    const finalDialog = await ensureSettingsDialog();
    const apply = allVisible("button, [role=button]", finalDialog)
      .find((button) => /^(apply|ok|done)$/i.test(normalizeText(button.textContent)));
    if (!apply) throw new Error("Pine Ok button not found.");
    await activate(apply);
    return { ok: true, count: 10, changed: count, center, step };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "RETRY_LABEL_PLACEMENT") {
      requestPlacementBurst();
      sendResponse({ ok: true });
      return;
    }
    if (message?.type !== "SYNC_PINE_INPUTS") return;
    (async () => {
      await trustedCommand({ type: "TRUSTED_SESSION_START" });
      try {
        await wait(1000);
        return await syncPineInputs(message.rows || [], message.expiry, message.spot, message.strikeStep);
      } finally {
        await trustedCommand({ type: "TRUSTED_SESSION_END" }).catch(() => {});
      }
    })().then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  });

  function sync() {
    if (settings.enabled) { refreshLabels(); startRefresh(); } else remove(LABELS_ID);
    if (settings.panelOpen) { openPanel(); startRefresh(); } else remove(PANEL_ID);
    if (!settings.enabled && !settings.panelOpen) stopRefresh();
  }
  chrome.storage.local.get(DEFAULTS).then((stored) => { settings = { ...DEFAULTS, ...stored }; sync(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    Object.entries(changes).forEach(([key, value]) => { settings[key] = value.newValue; });
    sync();
  });
  window.addEventListener("resize", () => { if (panelData && settings.panelOpen) drawChart(); requestPlacementBurst(); });
  window.addEventListener("wheel", requestPlacementBurst, { capture: true, passive: true });
  window.addEventListener("pointerup", requestPlacementBurst, true);
  window.addEventListener("keydown", requestPlacementBurst, true);
})();
