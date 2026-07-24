(() => {
  "use strict";
  const LABELS_ID = "nifty-chain-overlay";
  const PANEL_ID = "nifty-exact-price-chart";
  const API = "http://127.0.0.1:8787";
  const STRIKE_STEP = 50;
  const DEFAULTS = { enabled: false, expiry: "current_month", labelCount: "5", panelOpen: false };
  let settings = { ...DEFAULTS };
  let panelData = null;
  let hoveredStrike = null;

  const money = (value) => Number.isFinite(value) ? value.toFixed(2) : "—";
  const remove = (id) => document.getElementById(id)?.remove();
  const selectedRows = (rows, strike, count) => {
    if (count === "all") return rows;
    const span = Math.floor(Number(count) / 2) * STRIKE_STEP;
    return rows.filter((row) => Math.abs(row.strike - strike) <= span);
  };

  function renderLabels() {
    remove(LABELS_ID);
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;
    panel = document.createElement("aside");
    panel.id = PANEL_ID;
    panel.innerHTML = `<header><div><span class="mark"></span><b>NIFTY OPTIONS</b><em>/ exact price chart</em></div><button type="button" aria-label="Close exact price chart">×</button></header><div class="meta"><span data-role="expiry">Loading expiry…</span><span data-role="spot">—</span></div><div class="instruction">MOVE OVER PRICE LEVEL — CALL / PUT LTP LOCKS TO EXACT STRIKE</div><canvas aria-label="NIFTY companion chart"></canvas><div class="readout" data-role="readout">Loading chart…</div>`;
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
    panel.querySelector('[data-role="spot"]').textContent = `SPOT ${money(spot)}`;
    panel.querySelector('[data-role="readout"]').textContent = active ? `${activeStrike.toLocaleString("en-IN")}  ·  CALL ${money(active.call)}  ·  PUT ${money(active.put)}` : "Move over a strike price";
  }

  async function openPanel() {
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
      panelData = { ...chain, candles: candles.candles, byStrike: new Map(chain.rows.map((row) => [row.strike, row])) };
      hoveredStrike = Math.round(chain.spot / STRIKE_STEP) * STRIKE_STEP;
      drawChart();
    } catch (error) {
      panel.querySelector('[data-role="readout"]').textContent = error.message;
    } finally { panel.classList.remove("is-loading"); }
  }

  function sync() {
    renderLabels();
    if (settings.panelOpen) openPanel(); else remove(PANEL_ID);
  }
  chrome.storage.local.get(DEFAULTS).then((stored) => { settings = { ...DEFAULTS, ...stored }; sync(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    Object.entries(changes).forEach(([key, value]) => { settings[key] = value.newValue; });
    sync();
  });
  window.addEventListener("resize", () => { if (panelData && settings.panelOpen) drawChart(); });
})();
