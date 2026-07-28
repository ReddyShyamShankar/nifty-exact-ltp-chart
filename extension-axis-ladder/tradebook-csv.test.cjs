"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const csv = require("./tradebook-csv.js");

test("parses BOM, mixed-case Zerodha headers, quoted commas, and normalized directions", () => {
  const result = csv.parseTradebookCsv("\ufeffTrAdE_ID,Order_ID,Exchange,TradingSymbol,TRANSACTION_TYPE,Quantity,Price,Fill_Timestamp,Expiry,Remarks\n" +
    "t-1,o-1,NFO,NIFTY26AUG24100CE,sell,65,358.80,2026-08-01T09:15:00+05:30,2026-08-25,\"weekly, entry\"\n" +
    "t-2,o-2,NFO,NIFTY26AUG24000PE,BUY,65,210.50,2026-08-01T09:16:00+05:30,2026-08-25,\"weekly, hedge\"\n");

  assert.deepEqual(result.errors, []);
  assert.equal(result.trades.length, 2);
  assert.deepEqual(result.trades.map((trade) => trade.transactionType), ["SELL", "BUY"]);
  assert.equal(result.trades[0].tradingsymbol, "NIFTY26AUG24100CE");
  assert.equal(result.trades[0].strike, 24100);
  assert.equal(result.trades[1].optionType, "PE");
});

test("filters non-NIFTY rows and ignores duplicate trade IDs and content fingerprints", () => {
  const result = csv.parseTradebookCsv("trade_id,order_id,exchange,tradingsymbol,transaction_type,quantity,price,fill_timestamp,expiry\n" +
    "t-1,o-1,NFO,NIFTY26AUG24100CE,SELL,65,358.80,2026-08-01T09:15:00+05:30,2026-08-25\n" +
    "t-1,o-1,NFO,NIFTY26AUG24100CE,SELL,65,358.80,2026-08-01T09:15:00+05:30,2026-08-25\n" +
    ",o-2,NFO,NIFTY26AUG24100CE,SELL,65,358.80,2026-08-01T09:16:00+05:30,2026-08-25\n" +
    ",o-2,NFO,NIFTY26AUG24100CE,SELL,65,358.80,2026-08-01T09:16:00+05:30,2026-08-25\n" +
    "bank-1,o-3,NFO,BANKNIFTY26AUG50000CE,SELL,25,100,2026-08-01T09:15:00+05:30,2026-08-25\n");

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
  const result = csv.parseTradebookCsv("trade_id,order_id,exchange,tradingsymbol,transaction_type,quantity,price,fill_timestamp,expiry\n" +
    "t-1,o-1,NFO,NIFTY26AUG24100CE,SELL,65,358.80,2026-08-01T09:15:00+05:30,2026-08-25\n" +
    "t-2,o-2,NFO,NIFTY26AUG24000PE,HOLD,65,210.50,2026-08-01T09:16:00+05:30,2026-08-25\n" +
    "t-3,o-3,NFO,NIFTY26AUG23900PE,BUY,not-a-number,100,2026-08-01T09:17:00+05:30,2026-08-25\n");

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
  const result = csv.parseTradebookCsv("trade_id,order_id,exchange,tradingsymbol,quantity,price,fill_timestamp\n" +
    "t-1,o-1,NFO,NIFTY26AUG24100CE,65,358.80,2026-08-01T09:15:00+05:30\n");

  assert.deepEqual(result.trades, []);
  assert.deepEqual(result.errors, [{ row: 1, reason: "missing required header: transaction type" }]);
});

test("rejects blank raw price atomically instead of converting it to zero", () => {
  const result = csv.parseTradebookCsv("trade_id,order_id,exchange,tradingsymbol,transaction_type,quantity,price,fill_timestamp,expiry\n" +
    "t-1,o-1,NFO,NIFTY26AUG24100CE,SELL,65,358.80,2026-08-01T09:15:00+05:30,2026-08-25\n" +
    "t-2,o-2,NFO,NIFTY26AUG24000PE,BUY,65,,2026-08-01T09:16:00+05:30,2026-08-25\n");

  assert.deepEqual(result.trades, []);
  assert.deepEqual(result.errors, [{ row: 3, reason: "price is required" }]);
});

test("rejects generic lookalike CSV without Zerodha tradebook signature", () => {
  const result = csv.parseTradebookCsv("trade_id,symbol,side,quantity,price,timestamp\n" +
    "t-1,NIFTY26AUG24100CE,SELL,65,358.80,2026-08-01T09:15:00+05:30\n");

  assert.deepEqual(result.trades, []);
  assert.deepEqual(result.errors, [{ row: 1, reason: "untrusted Zerodha tradebook header" }]);
});
