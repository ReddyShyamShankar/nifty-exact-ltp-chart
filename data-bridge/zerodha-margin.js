function csvRows(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let index = 0; index < String(text || "").length; index += 1) {
    const character = text[index];
    if (character === '"' && quoted && text[index + 1] === '"') { field += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) { row.push(field); field = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field); field = "";
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
    } else field += character;
  }
  row.push(field);
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

function exactNumber(value, label, { integer = false, positive = false, nonnegative = false } = {}) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || (integer && !Number.isInteger(number))
    || (positive && number <= 0) || (nonnegative && number < 0)) throw new Error(`${label} is unavailable.`);
  return number;
}

export function parseNfoInstruments(text) {
  const rows = csvRows(text);
  const header = rows.shift() || [];
  const required = ["tradingsymbol", "name", "expiry", "strike", "lot_size", "instrument_type", "exchange"];
  const indexes = Object.fromEntries(required.map((name) => [name, header.indexOf(name)]));
  if (required.some((name) => indexes[name] < 0)) throw new Error("Zerodha NFO instrument evidence is malformed.");
  return rows.flatMap((row) => {
    if (row[indexes.exchange] !== "NFO" || row[indexes.name] !== "NIFTY") return [];
    const strike = Number(row[indexes.strike]);
    const lotSize = Number(row[indexes.lot_size]);
    if (!Number.isFinite(strike) || !Number.isInteger(lotSize) || lotSize <= 0) return [];
    return [{
      tradingsymbol: row[indexes.tradingsymbol], expiry: row[indexes.expiry], strike,
      lotSize, instrumentType: row[indexes.instrument_type]
    }];
  });
}

export function buildBasketOrders(legs, instruments) {
  if (!Array.isArray(legs) || !legs.length) throw new Error("Margin basket has no saved legs.");
  return legs.map((leg) => {
    const right = leg?.optionType === "CALL" ? "CE" : leg?.optionType === "PUT" ? "PE" : "";
    const matches = (Array.isArray(instruments) ? instruments : []).filter((instrument) =>
      instrument.expiry === leg?.expiry && instrument.strike === leg?.strike && instrument.instrumentType === right);
    if (!matches.length) throw new Error(`No exact Zerodha instrument for saved leg ${leg?.entryId || "—"}.`);
    if (matches.length !== 1) throw new Error(`Found multiple Zerodha instruments for saved leg ${leg?.entryId || "—"}.`);
    const lotSize = exactNumber(leg?.lotSize, "Saved lot size", { integer: true, positive: true });
    if (matches[0].lotSize !== lotSize) throw new Error(`Saved lot size conflicts with Zerodha lot size for ${leg.entryId}.`);
    const lots = exactNumber(leg?.lots, "Saved lots", { integer: true, positive: true });
    const premium = exactNumber(leg?.premium, "Saved premium", { nonnegative: true });
    if (!leg?.entryId || !["BUY", "SELL"].includes(leg?.direction) || !["NRML", "MIS"].includes(leg?.product)) {
      throw new Error("Saved margin leg is invalid.");
    }
    return { entryId: leg.entryId, order: {
      exchange: "NFO", tradingsymbol: matches[0].tradingsymbol, transaction_type: leg.direction,
      variety: "regular", product: leg.product, order_type: "LIMIT", quantity: lots * lotSize,
      price: premium, trigger_price: 0
    } };
  });
}

export function normalizeBrokerFunds(payload) {
  const equity = payload?.data?.equity;
  try {
    return {
      availableMargin: exactNumber(equity?.net, "Available margin", { nonnegative: true }),
      usedMargin: exactNumber(equity?.utilised?.debits, "Used margin", { nonnegative: true }),
      availableCash: exactNumber(equity?.available?.cash, "Available cash", { nonnegative: true })
    };
  } catch {
    throw new Error("Broker fund evidence is unavailable.");
  }
}

export function normalizeBasketMargin(payload, entryIds) {
  const finalTotal = payload?.data?.final?.total;
  const orders = payload?.data?.orders;
  if (!Array.isArray(entryIds) || !Array.isArray(orders) || orders.length !== entryIds.length) {
    throw new Error("Individual-leg margin evidence is unavailable.");
  }
  let total;
  try { total = exactNumber(finalTotal, "Broker combined margin", { nonnegative: true }); }
  catch { throw new Error("Broker combined margin evidence is unavailable."); }
  return {
    total,
    legs: entryIds.map((entryId, index) => ({
      entryId,
      total: exactNumber(orders[index]?.total, `Margin for ${entryId}`, { nonnegative: true })
    }))
  };
}
