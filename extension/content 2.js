(() => {
  "use strict";
  const PANEL_ID = "nifty-chain-overlay";
  const UPDATE_MS = 5000;
  const STRIKE_STEP = 50;
  const BRIDGE_URL = "http://127.0.0.1:8787/api/nifty-chain";
  const DEFAULTS = { enabled: false, expiry: "current_month", labelCount: "5" };
  let settings = { ...DEFAULTS };

  const money = (value) => Number.isFinite(value) ? value.toFixed(2) : "—";
  const removeOverlay = () => document.getElementById(PANEL_ID)?.remove();

  function chartBounds() {
    const charts = [...document.querySelectorAll('[aria-label^="Chart for"]')]
      .map((chart) => [chart, chart.getBoundingClientRect()])
      .filter(([, rect]) => rect.width > 500 && rect.height > 250);
    return charts.length === 1 ? charts[0][1] : null;
  }

  function displayedRows(rows, spot) {
    if (settings.labelCount === "all") return rows;
    const count = Number(settings.labelCount);
    const atm = Math.round(spot / STRIKE_STEP) * STRIKE_STEP;
    const offset = Math.floor(count / 2) * STRIKE_STEP;
    return rows.filter((row) => Math.abs(row.strike - atm) <= offset);
  }

  function render(rows, spot) {
    const bounds = chartBounds();
    if (!bounds) { removeOverlay(); return; }
    let overlay = document.getElementById(PANEL_ID);
    if (!overlay) { overlay = document.createElement("section"); overlay.id = PANEL_ID; document.documentElement.append(overlay); }
    const atm = Math.round(spot / STRIKE_STEP) * STRIKE_STEP;
    const anchorY = bounds.top + bounds.height * .52;
    const right = Math.max(12, window.innerWidth - bounds.right + 14);
    overlay.replaceChildren(...displayedRows(rows, spot).map((row) => {
      const item = document.createElement("div");
      const y = anchorY + (atm - row.strike) * .52;
      item.className = `nifty-chain-overlay__row${row.strike === atm ? " is-atm" : ""}`;
      item.style.top = `${Math.max(84, Math.min(window.innerHeight - 30, y))}px`;
      item.style.right = `${right}px`;
      item.textContent = `${money(row.call)} C  |  ${row.strike.toFixed(0)}  |  P ${money(row.put)}`;
      return item;
    }));
  }

  async function refresh() {
    if (!settings.enabled) { removeOverlay(); return; }
    try {
      const response = await fetch(`${BRIDGE_URL}?expiry=${encodeURIComponent(settings.expiry)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Bridge offline");
      render(data.rows, data.spot);
    } catch { removeOverlay(); }
  }

  chrome.storage.local.get(DEFAULTS).then((stored) => { settings = { ...DEFAULTS, ...stored }; refresh(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    Object.entries(changes).forEach(([key, value]) => { settings[key] = value.newValue; });
    refresh();
  });
  window.setInterval(refresh, UPDATE_MS);
})();
