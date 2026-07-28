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

  function optionDetails(symbol, expiry) {
    const match = String(symbol || "").trim().toUpperCase().match(/^NIFTY(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{4,6})(CE|PE)$/);
    const months = { JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06", JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12" };
    if (!match || !/^\d{4}-\d{2}-\d{2}$/.test(expiry) || expiry.slice(2, 4) !== match[1] || expiry.slice(5, 7) !== months[match[2]]) return null;
    return { strike: Number(match[3]), optionType: match[4] };
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

  function tradebookBatchFingerprint(trades) {
    return "ZERODHA_TRADEBOOK_CSV|" + trades.map(tradeFingerprint).slice().sort().join("\n");
  }

  function parseTradebookCsv(text) {
    const parsed = readCsv(text);
    const summary = emptySummary();
    if (parsed.errors.length) return { trades: [], errors: parsed.errors, summary };
    const rows = parsed.rows.filter((row) => row.some((value) => String(value).trim() !== ""));
    if (!rows.length) return { trades: [], errors: [{ row: 1, reason: "missing header row" }], summary };

    const headers = headerMap(rows[0]);
    const trustedZerodhaShape = ["tradeid", "orderid", "exchange", "tradingsymbol", "transactiontype", "quantity", "averageprice", "filltimestamp", "expiry"]
      .every((name) => typeof headers[name] === "number");
    if (!trustedZerodhaShape) {
      return { trades: [], errors: [{ row: 1, reason: "untrusted Zerodha tradebook header" }], summary };
    }
    const required = [
      ["tradingsymbol", ["tradingsymbol"]],
      ["transaction type", ["transactiontype"]],
      ["quantity", ["quantity"]],
      ["average price", ["averageprice"]],
      ["timestamp", ["filltimestamp"]],
      ["expiry", ["expiry"]]
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
      const tradingsymbol = valueFor(row, headers, ["tradingsymbol"]);
      const exchange = valueFor(row, headers, ["exchange"]).toUpperCase();
      const transactionType = valueFor(row, headers, ["transactiontype"]).toUpperCase();
      const quantity = Number(valueFor(row, headers, ["quantity"]));
      const rawPrice = valueFor(row, headers, ["averageprice"]);
      const price = Number(rawPrice);
      const timestamp = valueFor(row, headers, ["filltimestamp"]);
      const expiry = valueFor(row, headers, ["expiry"]);
      const details = optionDetails(tradingsymbol, expiry);
      if (exchange !== "NFO") {
        errors.push({ row: rowNumber, reason: "exchange must be NFO" });
        continue;
      }
      if (transactionType !== "BUY" && transactionType !== "SELL") {
        errors.push({ row: rowNumber, reason: "transaction type must be BUY or SELL" });
        continue;
      }
      if (!Number.isFinite(quantity) || quantity <= 0) {
        errors.push({ row: rowNumber, reason: "quantity must be a positive number" });
        continue;
      }
      if (!rawPrice) {
        errors.push({ row: rowNumber, reason: "price is required" });
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
        errors.push({ row: rowNumber, reason: "invalid NIFTY option identity" });
        continue;
      }
      const contractId = `NFO:${tradingsymbol}`;
      const suppliedId = valueFor(row, headers, ["tradeid"]);
      const trade = {
        id: suppliedId,
        contractId,
        tradingsymbol,
        underlying: "NIFTY",
        exchange: "NFO",
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
    return { trades, errors: [], summary, sourceKind: "ZERODHA_TRADEBOOK_CSV", batchFingerprint: tradebookBatchFingerprint(trades) };
  }

  const api = { parseTradebookCsv, tradeFingerprint, tradebookBatchFingerprint };
  root.NiftyTradebookCsv = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
