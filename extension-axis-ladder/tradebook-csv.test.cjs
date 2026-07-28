"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const csv = require("./tradebook-csv.js");

test("parses BOM, mixed-case Zerodha headers, quoted commas, and normalized directions", () => {
  const result = csv.parseTradebookCsv("\ufeffTrAdE_ID,TradingSymbol,TRANSACTION_TYPE,Quantity,Price,Trade_Time,Expiry,Remarks\n" +
    "t-1,NIFTY26AUG24100CE,sell,65,358.80,2026-08-01T09:15:00+05:30,2026-08-25,\"weekly, entry\"\n" +
    "t-2,NIFTY26AUG24000PE,BUY,65,210.50,2026-08-01T09:16:00+05:30,2026-08-25,\"weekly, hedge\"\n");

  assert.deepEqual(result.errors, []);
  assert.equal(result.trades.length, 2);
  assert.deepEqual(result.trades.map((trade) => trade.transactionType), ["SELL", "BUY"]);
  assert.equal(result.trades[0].tradingsymbol, "NIFTY26AUG24100CE");
  assert.equal(result.trades[0].strike, 24100);
  assert.equal(result.trades[1].optionType, "PE");
});

test("filters non-NIFTY rows and ignores duplicate trade IDs and content fingerprints", () => {
  const result = csv.parseTradebookCsv("trade_id,tradingsymbol,transaction_type,quantity,price,timestamp,expiry\n" +
    "t-1,NIFTY26AUG24100CE,SELL,65,358.80,2026-08-01T09:15:00+05:30,2026-08-25\n" +
    "t-1,NIFTY26AUG24100CE,SELL,65,358.80,2026-08-01T09:15:00+05:30,2026-08-25\n" +
    ",NIFTY26AUG24100CE,SELL,65,358.80,2026-08-01T09:16:00+05:30,2026-08-25\n" +
    ",NIFTY26AUG24100CE,SELL,65,358.80,2026-08-01T09:16:00+05:30,2026-08-25\n" +
    "bank-1,BANKNIFTY26AUG50000CE,SELL,25,100,2026-08-01T09:15:00+05:30,2026-08-25\n");

  assert.deepEqual(result.errors, []);
  assert.equal(result.trades.length, 2);
  assert.deepEqual(result.summary, {
    accepted: 2,
    ignoredNonNifty: 1,
    duplicateIds: 1,
    duplicateFingerprints: 1
  });
  assert.notEqual(result.trades[1].id, "");
  assert.equal(result.trades[1].id, csv.tradeFingerprint(result.trades[1]));
});

test("returns row-level reasons and no trades when any NIFTY row is malformed", () => {
  const result = csv.parseTradebookCsv("trade_id,tradingsymbol,transaction_type,quantity,price,timestamp,expiry\n" +
    "t-1,NIFTY26AUG24100CE,SELL,65,358.80,2026-08-01T09:15:00+05:30,2026-08-25\n" +
    "t-2,NIFTY26AUG24000PE,HOLD,65,210.50,2026-08-01T09:16:00+05:30,2026-08-25\n" +
    "t-3,NIFTY26AUG23900PE,BUY,not-a-number,100,2026-08-01T09:17:00+05:30,2026-08-25\n");

  assert.deepEqual(result.trades, []);
  assert.deepEqual(result.errors, [
    { row: 3, reason: "transaction type must be BUY or SELL" },
    { row: 4, reason: "quantity must be a positive number" }
  ]);
  assert.deepEqual(result.summary, {
    accepted: 0,
    ignoredNonNifty: 0,
    duplicateIds: 0,
    duplicateFingerprints: 0
  });
});

test("rejects missing required headers before committing any row", () => {
  const result = csv.parseTradebookCsv("trade_id,tradingsymbol,quantity,price,timestamp\n" +
    "t-1,NIFTY26AUG24100CE,65,358.80,2026-08-01T09:15:00+05:30\n");

  assert.deepEqual(result.trades, []);
  assert.deepEqual(result.errors, [{ row: 1, reason: "missing required header: transaction type" }]);
});
