"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const csv = require("./tradebook-csv.js");

test("parses BOM, mixed-case Zerodha headers, quoted commas, and normalized directions", () => {
  const result = csv.parseTradebookCsv("\ufeffTrAdE_ID,Order_ID,Exchange,TradingSymbol,TRANSACTION_TYPE,Quantity,Average_Price,Fill_Timestamp,Expiry,Remarks\n" +
    "t-1,o-1,NFO,NIFTY26AUG24100CE,sell,65,358.80,2026-08-01T09:15:00+05:30,2026-08-25,\"weekly, entry\"\n" +
    "t-2,o-2,NFO,NIFTY26AUG24000PE,BUY,65,210.50,2026-08-01T09:16:00+05:30,2026-08-25,\"weekly, hedge\"\n");

  assert.deepEqual(result.errors, []);
  assert.equal(result.trades.length, 2);
  assert.deepEqual(result.trades.map((trade) => trade.transactionType), ["SELL", "BUY"]);
  assert.equal(result.trades[0].tradingsymbol, "NIFTY26AUG24100CE");
  assert.equal(result.trades[0].strike, 24100);
  assert.equal(result.trades[1].optionType, "PE");
  assert.equal(result.sourceKind, "ZERODHA_TRADEBOOK_CSV");
  assert.equal(result.batchFingerprint, csv.tradebookBatchFingerprint(result.trades));
});

test("ignores duplicate trade IDs and content fingerprints", () => {
  const result = csv.parseTradebookCsv("trade_id,order_id,exchange,tradingsymbol,transaction_type,quantity,average_price,fill_timestamp,expiry\n" +
    "t-1,o-1,NFO,NIFTY26AUG24100CE,SELL,65,358.80,2026-08-01T09:15:00+05:30,2026-08-25\n" +
    "t-1,o-1,NFO,NIFTY26AUG24100CE,SELL,65,358.80,2026-08-01T09:15:00+05:30,2026-08-25\n" +
    ",o-2,NFO,NIFTY26AUG24100CE,SELL,65,358.80,2026-08-01T09:16:00+05:30,2026-08-25\n" +
    ",o-2,NFO,NIFTY26AUG24100CE,SELL,65,358.80,2026-08-01T09:16:00+05:30,2026-08-25\n" +
    "t-3,o-3,NFO,NIFTY26AUG24200CE,SELL,65,100,2026-08-01T09:17:00+05:30,2026-08-25\n");

  assert.deepEqual(result.errors, []);
  assert.equal(result.trades.length, 3);
  assert.deepEqual(result.summary, {
    accepted: 3,
    ignoredNonNifty: 0,
    ignoredOutOfScope: 0,
    ignoredAccount: 0,
    ignoredUnderlying: 0,
    ignoredExpiry: 0,
    ignoredExchange: 0,
    duplicateIds: 1,
    duplicateFingerprints: 1
  });
  assert.notEqual(result.trades[1].id, "");
  assert.equal(result.trades[1].id, csv.tradeFingerprint(result.trades[1]));
});

test("preserves distinct stable trade IDs even when normalized content is identical", () => {
  const result = csv.parseTradebookCsv("trade_id,order_id,exchange,tradingsymbol,transaction_type,quantity,average_price,fill_timestamp,expiry\n" +
    "stable-a,o-1,NFO,NIFTY26AUG24100CE,SELL,65,100,2026-08-01T09:15:00+05:30,2026-08-25\n" +
    "stable-b,o-1,NFO,NIFTY26AUG24100CE,SELL,65,100,2026-08-01T09:15:00+05:30,2026-08-25\n");

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.trades.map((trade) => trade.id), ["stable-a", "stable-b"]);
  assert.equal(result.summary.accepted, 2);
  assert.equal(result.summary.duplicateFingerprints, 0);
});

test("rejects a stable trade ID reused with conflicting normalized content", () => {
  const result = csv.parseTradebookCsv("trade_id,order_id,exchange,tradingsymbol,transaction_type,quantity,average_price,fill_timestamp,expiry\n" +
    "stable-a,o-1,NFO,NIFTY26AUG24100CE,SELL,65,100,2026-08-01T09:15:00+05:30,2026-08-25\n" +
    "stable-a,o-1,NFO,NIFTY26AUG24100CE,SELL,65,101,2026-08-01T09:15:00+05:30,2026-08-25\n");

  assert.deepEqual(result.trades, []);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].row, 3);
  assert.match(result.errors[0].reason, /stable trade ID.*conflicting content/i);
});

test("rejects a blank account scope field as ambiguous", () => {
  const blankAccount = csv.parseTradebookCsv(
    "trade_id,order_id,client_id,exchange,tradingsymbol,transaction_type,quantity,average_price,fill_timestamp,expiry\n" +
    "stable-a,o-1,,NFO,NIFTY26AUG24100CE,SELL,65,100,2026-08-01T09:15:00+05:30,2026-08-25\n",
    { accountId: "ACC1", underlying: "NIFTY", expiry: "2026-08-25" }
  );

  assert.deepEqual(blankAccount.trades, []);
  assert.deepEqual(blankAccount.errors, [{ row: 2, reason: "blank account scope is ambiguous" }]);
});

test("rejects a blank exchange scope field as ambiguous", () => {
  const blankExchange = csv.parseTradebookCsv(
    "trade_id,order_id,exchange,tradingsymbol,transaction_type,quantity,average_price,fill_timestamp,expiry\n" +
    "stable-a,o-1,,NIFTY26AUG24100CE,SELL,65,100,2026-08-01T09:15:00+05:30,2026-08-25\n",
    { underlying: "NIFTY", expiry: "2026-08-25" }
  );

  assert.deepEqual(blankExchange.trades, []);
  assert.deepEqual(blankExchange.errors, [{ row: 2, reason: "blank exchange scope is ambiguous" }]);
});

test("returns row-level reasons and no trades when any NIFTY row is malformed", () => {
  const result = csv.parseTradebookCsv("trade_id,order_id,exchange,tradingsymbol,transaction_type,quantity,average_price,fill_timestamp,expiry\n" +
    "t-1,o-1,NFO,NIFTY26AUG24100CE,SELL,65,358.80,2026-08-01T09:15:00+05:30,2026-08-25\n" +
    "t-2,o-2,NFO,NIFTY26AUG24000PE,HOLD,65,210.50,2026-08-01T09:16:00+05:30,2026-08-25\n" +
    "t-3,o-3,NFO,NIFTY26AUG23900PE,BUY,not-a-number,100,2026-08-01T09:17:00+05:30,2026-08-25\n");

  assert.deepEqual(result.trades, []);
  assert.deepEqual(result.errors, [
    { row: 3, reason: "transaction type must be BUY or SELL" },
    { row: 4, reason: "quantity must be a positive integer" }
  ]);
  assert.deepEqual(result.summary, {
    accepted: 0,
    ignoredNonNifty: 0,
    ignoredOutOfScope: 0,
    ignoredAccount: 0,
    ignoredUnderlying: 0,
    ignoredExpiry: 0,
    ignoredExchange: 0,
    duplicateIds: 0,
    duplicateFingerprints: 0
  });
});

test("rejects missing required headers before committing any row", () => {
  const result = csv.parseTradebookCsv("trade_id,order_id,exchange,tradingsymbol,quantity,average_price,fill_timestamp\n" +
    "t-1,o-1,NFO,NIFTY26AUG24100CE,65,358.80,2026-08-01T09:15:00+05:30\n");

  assert.deepEqual(result.trades, []);
  assert.deepEqual(result.errors, [{ row: 1, reason: "untrusted Zerodha tradebook header" }]);
});

test("rejects blank raw price atomically instead of converting it to zero", () => {
  const result = csv.parseTradebookCsv("trade_id,order_id,exchange,tradingsymbol,transaction_type,quantity,average_price,fill_timestamp,expiry\n" +
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

test("filters proven BSE rows but rejects NIFTYJUNK and noncanonical price headers", () => {
  const wrongExchange = csv.parseTradebookCsv("trade_id,order_id,exchange,tradingsymbol,transaction_type,quantity,average_price,fill_timestamp,expiry\n" +
    "t-1,o-1,BSE,NIFTY26AUG24100CE,SELL,65,358.80,2026-08-01T09:15:00+05:30,2026-08-25\n");
  const junkSymbol = csv.parseTradebookCsv("trade_id,order_id,exchange,tradingsymbol,transaction_type,quantity,average_price,fill_timestamp,expiry\n" +
    "t-1,o-1,NFO,NIFTYJUNK26AUG24100CE,SELL,65,358.80,2026-08-01T09:15:00+05:30,2026-08-25\n");
  const priceAlias = csv.parseTradebookCsv("trade_id,order_id,exchange,tradingsymbol,transaction_type,quantity,price,fill_timestamp,expiry\n" +
    "t-1,o-1,NFO,NIFTY26AUG24100CE,SELL,65,358.80,2026-08-01T09:15:00+05:30,2026-08-25\n");

  assert.deepEqual(wrongExchange.trades, []);
  assert.deepEqual(wrongExchange.errors, []);
  assert.equal(wrongExchange.summary.ignoredExchange, 1);
  assert.deepEqual(junkSymbol.trades, []);
  assert.deepEqual(junkSymbol.errors, [{ row: 2, reason: "invalid NIFTY option identity" }]);
  assert.deepEqual(priceAlias.errors, [{ row: 1, reason: "untrusted Zerodha tradebook header" }]);
});

test("parses weekly exact expiry identity without same-strike collisions", () => {
  const result = csv.parseTradebookCsv("trade_id,order_id,exchange,tradingsymbol,transaction_type,quantity,average_price,fill_timestamp,expiry\n" +
    "aug-4,o-1,NFO,NIFTY2680424100CE,SELL,65,100,2026-08-01T09:15:00+05:30,2026-08-04\n" +
    "aug-11,o-2,NFO,NIFTY2681124100CE,SELL,65,110,2026-08-01T09:16:00+05:30,2026-08-11\n");

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.trades.map((trade) => trade.contractId), [
    "NFO:NIFTY:2026-08-04:24100:CE",
    "NFO:NIFTY:2026-08-11:24100:CE"
  ]);
});

test("filters proven account/index/expiry rows and reports each reason", () => {
  const text = "trade_id,order_id,client_id,exchange,tradingsymbol,transaction_type,quantity,average_price,fill_timestamp,expiry\n" +
    "target,o-1,ACC1,NFO,NIFTY2680424100CE,SELL,65,100,2026-08-01T09:15:00+05:30,2026-08-04\n" +
    "other-account,o-2,ACC2,NFO,NIFTY2680424100CE,SELL,65,100,2026-08-01T09:15:00+05:30,2026-08-04\n" +
    "other-index,o-3,ACC1,NFO,BANKNIFTY2680450000CE,SELL,15,100,2026-08-01T09:15:00+05:30,2026-08-04\n" +
    "other-expiry,o-4,ACC1,NFO,NIFTY2681124100CE,SELL,65,100,2026-08-01T09:15:00+05:30,2026-08-11\n" +
    "other-exchange,o-5,ACC1,BFO,SENSEX2680470000CE,SELL,20,100,2026-08-01T09:15:00+05:30,2026-08-04\n";
  const result = csv.parseTradebookCsv(text, {
    accountId: "ACC1", underlying: "NIFTY", expiry: "2026-08-04"
  });

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.trades.map((trade) => trade.id), ["target"]);
  assert.deepEqual({
    account: result.summary.ignoredAccount,
    index: result.summary.ignoredUnderlying,
    expiry: result.summary.ignoredExpiry,
    exchange: result.summary.ignoredExchange
  }, { account: 1, index: 1, expiry: 1, exchange: 1 });
});

test("rejects mixed-account export when account scope is ambiguous", () => {
  const result = csv.parseTradebookCsv("trade_id,order_id,client_id,exchange,tradingsymbol,transaction_type,quantity,average_price,fill_timestamp,expiry\n" +
    "a,o-1,ACC1,NFO,NIFTY2680424100CE,SELL,65,100,2026-08-01T09:15:00+05:30,2026-08-04\n" +
    "b,o-2,ACC2,NFO,NIFTY2680424100CE,SELL,65,100,2026-08-01T09:16:00+05:30,2026-08-04\n", {
    underlying: "NIFTY", expiry: "2026-08-04"
  });

  assert.deepEqual(result.trades, []);
  assert.match(result.errors[0].reason, /mixed account.*explicit account/i);
});

test("reports physical source lines after blanks and strictly validates timestamps", () => {
  const prefix = "trade_id,order_id,exchange,tradingsymbol,transaction_type,quantity,average_price,fill_timestamp,expiry\n" +
    "ok,o-1,NFO,NIFTY2680424100CE,SELL,65,100,2026-08-01T09:15:00+05:30,2026-08-04\n\n";
  const impossible = csv.parseTradebookCsv(prefix +
    "bad,o-2,NFO,NIFTY2680424100CE,SELL,65,100,2026-02-30T09:15:00+05:30,2026-08-04\n");
  const suffix = csv.parseTradebookCsv(prefix +
    "bad,o-2,NFO,NIFTY2680424100CE,SELL,65,100,2026-08-01T09:15:00+05:30junk,2026-08-04\n");

  assert.deepEqual(impossible.errors, [{ row: 4, reason: "invalid fill timestamp" }]);
  assert.deepEqual(suffix.errors, [{ row: 4, reason: "invalid fill timestamp" }]);
});
