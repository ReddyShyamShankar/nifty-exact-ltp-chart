(function (root) {
  "use strict";

  function emptySummary() {
    return { accepted: 0, ignoredNonNifty: 0, duplicateIds: 0, duplicateFingerprints: 0 };
  }

  function fieldKey(value) {
    return String(value || "").replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  }

  function readCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    const source = String(text || "").replace(/^\uFEFF/, "");
    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (quoted) {
        if (char === '"' && source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else if (char === '"') {
          quoted = false;
        } else {
          cell += char;
        }
      } else if (char === '"') {
        quoted = true;
      } else if (char === ",") {
        row.push(cell);
        cell = "";
      } else if (char === "\n") {
        row.push(cell.replace(/\r$/, ""));
        rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += char;
      }
    }
    if (quoted) return { rows: [], errors: [{ row: rows.length + 1, reason: "unterminated quoted field" }] };
    if (cell.length || row.length) {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
    }
    return { rows, errors: [] };
  }

  function headerMap(header) {
    return header.reduce((map, name, index) => {
      const key = fieldKey(name);
      if (key && !Object.prototype.hasOwnProperty.call(map, key)) map[key] = index;
      return map;
    }, {});
  }

  function valueFor(row, headers, names) {
    for (const name of names) {
      const index = headers[name];
      if (typeof index === "number") return String(row[index] || "").trim();
    }
    return "";
  }

  function optionDetails(symbol) {
    const match = String(symbol || "").trim().toUpperCase().match(/^NIFTY.*?(\d{4,6})(CE|PE)$/);
    if (!match) return null;
    return { strike: Number(match[1]), optionType: match[2] };
  }

  function tradeFingerprint(trade) {
    const direction = String(trade.transactionType || "").trim().toUpperCase();
    const quantity = Number(trade.quantity);
    const price = Number(trade.price);
    return [
      String(trade.contractId || trade.tradingsymbol || "").trim().toUpperCase(),
      direction,
      Number.isFinite(quantity) ? String(quantity) : "",
      Number.isFinite(price) ? String(price) : "",
      String(trade.timestamp || "").trim(),
      String(trade.expiry || "").trim()
    ].join("|");
  }

  function parseTradebookCsv(text) {
    const parsed = readCsv(text);
    const summary = emptySummary();
    if (parsed.errors.length) return { trades: [], errors: parsed.errors, summary };
    const rows = parsed.rows.filter((row) => row.some((value) => String(value).trim() !== ""));
    if (!rows.length) return { trades: [], errors: [{ row: 1, reason: "missing header row" }], summary };

    const headers = headerMap(rows[0]);
    const required = [
      ["tradingsymbol", ["tradingsymbol", "symbol"]],
      ["transaction type", ["transactiontype", "buyorsell", "side"]],
      ["quantity", ["quantity", "filledquantity"]],
      ["price", ["price", "tradeprice", "averageprice"]],
      ["timestamp", ["timestamp", "tradetime", "filltimestamp", "executiontime"]]
    ];
    for (const [label, aliases] of required) {
      if (!aliases.some((name) => typeof headers[name] === "number")) {
        return { trades: [], errors: [{ row: 1, reason: `missing required header: ${label}` }], summary };
      }
    }

    const errors = [];
    const candidates = [];
    for (let index = 1; index < rows.length; index += 1) {
      const row = rows[index];
      const rowNumber = index + 1;
      const tradingsymbol = valueFor(row, headers, ["tradingsymbol", "symbol"]);
      if (!/^NIFTY/i.test(tradingsymbol)) {
        summary.ignoredNonNifty += 1;
        continue;
      }
      const transactionType = valueFor(row, headers, ["transactiontype", "buyorsell", "side"]).toUpperCase();
      const quantity = Number(valueFor(row, headers, ["quantity", "filledquantity"]));
      const price = Number(valueFor(row, headers, ["price", "tradeprice", "averageprice"]));
      const timestamp = valueFor(row, headers, ["timestamp", "tradetime", "filltimestamp", "executiontime"]);
      const expiry = valueFor(row, headers, ["expiry", "expirydate"]);
      const details = optionDetails(tradingsymbol);
      if (transactionType !== "BUY" && transactionType !== "SELL") {
        errors.push({ row: rowNumber, reason: "transaction type must be BUY or SELL" });
        continue;
      }
      if (!Number.isFinite(quantity) || quantity <= 0) {
        errors.push({ row: rowNumber, reason: "quantity must be a positive number" });
        continue;
      }
      if (!Number.isFinite(price) || price < 0) {
        errors.push({ row: rowNumber, reason: "price must be a non-negative number" });
        continue;
      }
      if (!timestamp) {
        errors.push({ row: rowNumber, reason: "timestamp is required" });
        continue;
      }
      if (!details) {
        errors.push({ row: rowNumber, reason: "NIFTY option symbol must include strike and CE or PE" });
        continue;
      }
      const contractId = valueFor(row, headers, ["contractid", "instrumentid"]) || `NFO:${tradingsymbol}`;
      const suppliedId = valueFor(row, headers, ["tradeid", "orderexecutionid"]);
      const trade = {
        id: suppliedId,
        contractId,
        tradingsymbol,
        underlying: "NIFTY",
        expiry,
        strike: details.strike,
        optionType: details.optionType,
        transactionType,
        quantity,
        price,
        timestamp
      };
      const fingerprint = tradeFingerprint(trade);
      trade.id = trade.id || fingerprint;
      candidates.push({ trade, fingerprint, suppliedId: Boolean(suppliedId) });
    }
    if (errors.length) return { trades: [], errors, summary: emptySummary() };

    const tradeIds = new Set();
    const fingerprints = new Set();
    const trades = [];
    for (const candidate of candidates) {
      if (candidate.suppliedId && tradeIds.has(candidate.trade.id)) {
        summary.duplicateIds += 1;
      } else if (fingerprints.has(candidate.fingerprint)) {
        summary.duplicateFingerprints += 1;
      } else {
        if (candidate.suppliedId) tradeIds.add(candidate.trade.id);
        fingerprints.add(candidate.fingerprint);
        trades.push(candidate.trade);
        summary.accepted += 1;
      }
    }
    return { trades, errors: [], summary };
  }

  const api = { parseTradebookCsv, tradeFingerprint };
  root.NiftyTradebookCsv = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
