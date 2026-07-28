(function (root) {
  "use strict";

  const MONTHS = {
    JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
    JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12"
  };
  const WEEKLY_MONTHS = { 1: "01", 2: "02", 3: "03", 4: "04", 5: "05", 6: "06", 7: "07", 8: "08", 9: "09", O: "10", N: "11", D: "12" };

  function emptySummary() {
    return {
      accepted: 0,
      ignoredNonNifty: 0,
      ignoredOutOfScope: 0,
      ignoredAccount: 0,
      ignoredUnderlying: 0,
      ignoredExpiry: 0,
      ignoredExchange: 0,
      duplicateIds: 0,
      duplicateFingerprints: 0
    };
  }

  function fieldKey(value) {
    return String(value || "").replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  }

  function readCsv(text) {
    const rows = [];
    let values = [];
    let cell = "";
    let quoted = false;
    let line = 1;
    let rowLine = 1;
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
          if (char === "\n") line += 1;
        }
      } else if (char === '"') {
        quoted = true;
      } else if (char === ",") {
        values.push(cell);
        cell = "";
      } else if (char === "\n") {
        values.push(cell.replace(/\r$/, ""));
        rows.push({ values, line: rowLine });
        values = [];
        cell = "";
        line += 1;
        rowLine = line;
      } else {
        cell += char;
      }
    }
    if (quoted) return { rows: [], errors: [{ row: rowLine, reason: "unterminated quoted field" }] };
    if (cell.length || values.length) {
      values.push(cell.replace(/\r$/, ""));
      rows.push({ values, line: rowLine });
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

  function exactIsoDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function strictTimestamp(value) {
    const match = typeof value === "string" && value.trim().match(
      /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})?$/
    );
    if (!match) return null;
    const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
    if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return null;
    const calendar = new Date(Date.UTC(year, month - 1, day));
    if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return null;
    if (match[8] && match[8] !== "Z") {
      const [offsetHour, offsetMinute] = match[8].slice(1).split(":").map(Number);
      if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return null;
    }
    const normalized = value.trim().replace(" ", "T") + (match[8] ? "" : "+05:30");
    return Number.isFinite(Date.parse(normalized)) ? normalized : null;
  }

  function canonicalContractId(expiry, strike, optionType) {
    return `NFO:NIFTY:${expiry}:${strike}:${optionType}`;
  }

  function optionDetails(symbol, expiry) {
    const value = String(symbol || "").trim().toUpperCase();
    if (!exactIsoDate(expiry)) return null;
    const monthly = value.match(/^NIFTY(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)([1-9]\d{3,5})(CE|PE)$/);
    const weekly = value.match(/^NIFTY(\d{2})([1-9OND])(\d{2})([1-9]\d{3,5})(CE|PE)$/);
    if (monthly) {
      if (expiry.slice(2, 4) !== monthly[1] || expiry.slice(5, 7) !== MONTHS[monthly[2]]) return null;
      return { strike: Number(monthly[3]), optionType: monthly[4] };
    }
    if (weekly) {
      if (expiry.slice(2, 4) !== weekly[1] || expiry.slice(5, 7) !== WEEKLY_MONTHS[weekly[2]] || expiry.slice(8, 10) !== weekly[3]) return null;
      return { strike: Number(weekly[4]), optionType: weekly[5] };
    }
    return null;
  }

  function clearlyOtherUnderlying(symbol) {
    const value = String(symbol || "").trim().toUpperCase();
    return !value.startsWith("NIFTY") && /^[A-Z][A-Z0-9]*(?:\d{2}[A-Z]{3}|\d{2}[1-9OND]\d{2})[1-9]\d{3,5}(?:CE|PE)$/.test(value);
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

  function ignored(summary, kind) {
    summary.ignoredOutOfScope += 1;
    summary[kind] += 1;
    if (kind === "ignoredUnderlying") summary.ignoredNonNifty += 1;
  }

  function parseTradebookCsv(text, scope = {}) {
    const parsed = readCsv(text);
    const summary = emptySummary();
    if (parsed.errors.length) return { trades: [], errors: parsed.errors, summary };
    const rows = parsed.rows.filter((row) => row.values.some((value) => String(value).trim() !== ""));
    if (!rows.length) return { trades: [], errors: [{ row: 1, reason: "missing header row" }], summary };
    if (scope.expiry && !exactIsoDate(scope.expiry)) return { trades: [], errors: [{ row: 1, reason: "invalid import expiry scope" }], summary };
    if (scope.underlying && scope.underlying !== "NIFTY") return { trades: [], errors: [{ row: 1, reason: "unsupported import underlying scope" }], summary };

    const headers = headerMap(rows[0].values);
    const trustedZerodhaShape = ["tradeid", "orderid", "exchange", "tradingsymbol", "transactiontype", "quantity", "averageprice", "filltimestamp", "expiry"]
      .every((name) => typeof headers[name] === "number");
    if (!trustedZerodhaShape) return { trades: [], errors: [{ row: rows[0].line, reason: "untrusted Zerodha tradebook header" }], summary };

    const accountHeader = ["clientid", "accountid"].find((name) => typeof headers[name] === "number");
    const dataRows = rows.slice(1);
    if (accountHeader && !scope.accountId) {
      const accounts = new Set(dataRows.map((row) => valueFor(row.values, headers, [accountHeader])).filter(Boolean));
      if (accounts.size > 1) {
        return { trades: [], errors: [{ row: dataRows[0]?.line || rows[0].line, reason: "mixed account export requires explicit account scope" }], summary };
      }
    }
    if (scope.accountId && !accountHeader) {
      return { trades: [], errors: [{ row: rows[0].line, reason: "account scope cannot be proved because export has no account column" }], summary };
    }

    const errors = [];
    const candidates = [];
    for (const sourceRow of dataRows) {
      const row = sourceRow.values;
      const rowNumber = sourceRow.line;
      const accountId = accountHeader ? valueFor(row, headers, [accountHeader]) : "";
      const tradingsymbol = valueFor(row, headers, ["tradingsymbol"]).toUpperCase();
      const exchange = valueFor(row, headers, ["exchange"]).toUpperCase();
      const expiry = valueFor(row, headers, ["expiry"]);
      if (scope.accountId && accountId !== scope.accountId) {
        ignored(summary, "ignoredAccount");
        continue;
      }
      if (exchange !== "NFO") {
        ignored(summary, "ignoredExchange");
        continue;
      }
      if (clearlyOtherUnderlying(tradingsymbol)) {
        ignored(summary, "ignoredUnderlying");
        continue;
      }
      const details = optionDetails(tradingsymbol, expiry);
      if (!details) {
        errors.push({ row: rowNumber, reason: "invalid NIFTY option identity" });
        continue;
      }
      if (scope.expiry && expiry !== scope.expiry) {
        ignored(summary, "ignoredExpiry");
        continue;
      }

      const transactionType = valueFor(row, headers, ["transactiontype"]).toUpperCase();
      const rawQuantity = valueFor(row, headers, ["quantity"]);
      const quantity = Number(rawQuantity);
      const rawPrice = valueFor(row, headers, ["averageprice"]);
      const price = Number(rawPrice);
      const timestamp = strictTimestamp(valueFor(row, headers, ["filltimestamp"]));
      if (transactionType !== "BUY" && transactionType !== "SELL") {
        errors.push({ row: rowNumber, reason: "transaction type must be BUY or SELL" });
        continue;
      }
      if (!rawQuantity || !Number.isInteger(quantity) || quantity <= 0) {
        errors.push({ row: rowNumber, reason: "quantity must be a positive integer" });
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
        errors.push({ row: rowNumber, reason: "invalid fill timestamp" });
        continue;
      }
      const suppliedId = valueFor(row, headers, ["tradeid"]);
      const trade = {
        id: suppliedId,
        contractId: canonicalContractId(expiry, details.strike, details.optionType),
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
      if (candidate.suppliedId && tradeIds.has(candidate.trade.id)) summary.duplicateIds += 1;
      else if (fingerprints.has(candidate.fingerprint)) summary.duplicateFingerprints += 1;
      else {
        if (candidate.suppliedId) tradeIds.add(candidate.trade.id);
        fingerprints.add(candidate.fingerprint);
        trades.push(candidate.trade);
        summary.accepted += 1;
      }
    }
    return {
      trades,
      errors: [],
      summary,
      sourceKind: "ZERODHA_TRADEBOOK_CSV",
      batchFingerprint: tradebookBatchFingerprint(trades),
      scope: { underlying: "NIFTY", expiry: scope.expiry || null, accountId: scope.accountId || null }
    };
  }

  const api = { parseTradebookCsv, tradeFingerprint, tradebookBatchFingerprint };
  root.NiftyTradebookCsv = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
