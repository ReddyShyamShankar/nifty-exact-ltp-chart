const LOT_SIZE = 65;
const MONTHS = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
  JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12"
};
const WEEKLY_MONTHS = { 1: "01", 2: "02", 3: "03", 4: "04", 5: "05", 6: "06", 7: "07", 8: "08", 9: "09", O: "10", N: "11", D: "12" };

function exactIsoDate(expiry) {
  if (typeof expiry !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return false;
  const date = new Date(`${expiry}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === expiry;
}

function canonicalIdentity(symbol, expiry, expiryKind) {
  const value = typeof symbol === "string" ? symbol.trim().toUpperCase() : "";
  if (!value.startsWith("NIFTY")) return null;
  if (/^NIFTY\d{2}(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)FUT$/.test(value)) return null;
  const monthly = value.match(/^NIFTY(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)([1-9]\d{3,5})(CE|PE)$/);
  const weekly = value.match(/^NIFTY(\d{2})([1-9OND])(\d{2})([1-9]\d{3,5})(CE|PE)$/);
  let strike;
  let optionType;
  if (monthly) {
    if (expiry.slice(2, 4) !== monthly[1] || expiry.slice(5, 7) !== MONTHS[monthly[2]]) return null;
    if (expiryKind === "weekly") return null;
    if (expiryKind !== "monthly") throw new Error("Monthly expiry identity cannot be proved from cached Upstox metadata.");
    strike = Number(monthly[3]);
    optionType = monthly[4];
  } else if (weekly) {
    if (expiry.slice(2, 4) !== weekly[1] || expiry.slice(5, 7) !== WEEKLY_MONTHS[weekly[2]] || expiry.slice(8, 10) !== weekly[3]) return null;
    if (expiryKind === "monthly") throw new Error("Weekly Zerodha symbol conflicts with monthly Upstox expiry metadata.");
    strike = Number(weekly[4]);
    optionType = weekly[5];
  } else {
    throw new Error("Invalid NIFTY option identity from Zerodha.");
  }
  const tradingsymbol = value;
  const contractId = `NFO:NIFTY:${expiry}:${strike}:${optionType}`;
  return { tradingsymbol, contractId, strike, optionType };
}

function finiteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Invalid Zerodha ${label}.`);
  return value;
}

function assertPayload(payload, rows, label) {
  if (!payload || payload.status !== "success" || !Array.isArray(rows)) {
    throw new Error(`Invalid Zerodha ${label} response.`);
  }
}

function normalizedTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("Invalid Zerodha trade timestamp.");
  const timestamp = value.trim();
  const match = timestamp.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})?$/);
  if (!match) throw new Error("Invalid Zerodha trade timestamp.");
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59 ||
    calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) {
    throw new Error("Invalid Zerodha trade timestamp.");
  }
  if (match[8] && match[8] !== "Z") {
    const [offsetHour, offsetMinute] = match[8].slice(1).split(":").map(Number);
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) {
      throw new Error("Invalid Zerodha trade timestamp.");
    }
  }
  const normalized = timestamp.replace(" ", "T") + (match[8] ? "" : "+05:30");
  if (!Number.isFinite(Date.parse(normalized))) throw new Error("Invalid Zerodha trade timestamp.");
  return normalized;
}

export function normalizeNiftyPositions(payload, expiry, { expiryKind = "unknown" } = {}) {
  if (!exactIsoDate(expiry)) throw new Error("Expiry must be an exact ISO date.");
  const rows = payload?.data?.net;
  assertPayload(payload, rows, "positions");
  const normalized = [];
  for (const row of rows) {
    if (row?.exchange !== "NFO") continue;
    const identity = canonicalIdentity(row.tradingsymbol, expiry, expiryKind);
    if (!identity) continue;
    const signedQuantity = finiteNumber(row.quantity, "position quantity");
    if (!Number.isInteger(signedQuantity)) throw new Error("Zerodha position quantity must be an integer.");
    if (signedQuantity === 0) continue;
    if (signedQuantity % LOT_SIZE !== 0) throw new Error("Zerodha position must use whole NIFTY lots.");
    normalized.push({
      contractId: identity.contractId,
      tradingsymbol: identity.tradingsymbol,
      expiry,
      exchange: "NFO",
      underlying: "NIFTY",
      strike: identity.strike,
      optionType: identity.optionType,
      signedQuantity,
      lotSize: LOT_SIZE,
      averagePrice: finiteNumber(row.average_price, "average price"),
      lastPrice: finiteNumber(row.last_price, "last price"),
      pnl: finiteNumber(row.pnl, "P&L")
    });
  }
  return normalized;
}
export function normalizeNiftyTrades(payload, expiry, { expiryKind = "unknown" } = {}) {
  if (!exactIsoDate(expiry)) throw new Error("Expiry must be an exact ISO date.");
  const rows = payload?.data;
  assertPayload(payload, rows, "trades");
  const normalized = [];
  for (const row of rows) {
    if (row?.exchange !== "NFO") continue;
    const identity = canonicalIdentity(row.tradingsymbol, expiry, expiryKind);
    if (!identity) continue;
    const transactionType = String(row.transaction_type || "").toUpperCase();
    if (transactionType !== "BUY" && transactionType !== "SELL") throw new Error("Zerodha trade must be BUY or SELL.");
    const quantity = finiteNumber(row.quantity, "trade quantity");
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("Zerodha trade quantity must be positive.");
    if (quantity % LOT_SIZE !== 0) throw new Error("Zerodha trade must use whole NIFTY lots.");
    if (typeof row.trade_id !== "string" || !row.trade_id) throw new Error("Invalid Zerodha trade ID.");
    normalized.push({
      id: row.trade_id,
      contractId: identity.contractId,
      tradingsymbol: identity.tradingsymbol,
      underlying: "NIFTY",
      exchange: "NFO",
      expiry,
      strike: identity.strike,
      optionType: identity.optionType,
      transactionType,
      quantity,
      price: finiteNumber(row.average_price, "trade price"),
      timestamp: normalizedTimestamp(row.fill_timestamp)
    });
  }
  return normalized;
}
