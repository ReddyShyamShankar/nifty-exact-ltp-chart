import assert from "node:assert/strict";
import test from "node:test";

import { normalizeNiftyPositions, normalizeNiftyTrades } from "./zerodha-normalize.js";

function position(overrides = {}) {
  return {
    tradingsymbol: "NIFTY26AUG24100CE",
    exchange: "NFO",
    quantity: -130,
    average_price: 358.8,
    last_price: 320,
    pnl: 5044,
    ...overrides
  };
}

function trade(overrides = {}) {
  return {
    trade_id: "trade-1",
    order_id: "order-1",
    exchange: "NFO",
    tradingsymbol: "NIFTY2681824100CE",
    transaction_type: "SELL",
    quantity: 65,
    average_price: 358.8,
    fill_timestamp: "2026-08-18 09:15:00",
    ...overrides
  };
}

test("normalizes strict monthly NIFTY net positions and removes all out-of-scope rows", () => {
  const payload = {
    status: "success",
    data: {
      net: [
        position(),
        position({ tradingsymbol: "NIFTY2681824000PE", quantity: 65 }),
        position({ tradingsymbol: "NIFTY26AUG24200CE", quantity: 0 }),
        position({ exchange: "BFO" }),
        position({ tradingsymbol: "BANKNIFTY26AUG55000CE" })
      ],
      day: []
    }
  };

  assert.deepEqual(normalizeNiftyPositions(payload, "2026-08-25"), [{
    contractId: "NFO:NIFTY26AUG24100CE",
    tradingsymbol: "NIFTY26AUG24100CE",
    expiry: "2026-08-25",
    exchange: "NFO",
    underlying: "NIFTY",
    strike: 24100,
    optionType: "CE",
    signedQuantity: -130,
    lotSize: 65,
    averagePrice: 358.8,
    lastPrice: 320,
    pnl: 5044
  }]);
});

test("matches weekly symbol through exact expiry hint and canonicalizes ledger identity", () => {
  const payload = { status: "success", data: { net: [position({ tradingsymbol: "NIFTY2681824000PE", quantity: 65 })] } };

  assert.deepEqual(normalizeNiftyPositions(payload, "2026-08-18"), [{
    contractId: "NFO:NIFTY26AUG24000PE",
    tradingsymbol: "NIFTY26AUG24000PE",
    expiry: "2026-08-18",
    exchange: "NFO",
    underlying: "NIFTY",
    strike: 24000,
    optionType: "PE",
    signedQuantity: 65,
    lotSize: 65,
    averagePrice: 358.8,
    lastPrice: 320,
    pnl: 5044
  }]);
  assert.deepEqual(normalizeNiftyPositions(payload, "2026-08-11"), []);
});

test("fails closed when a matching NIFTY position is not a whole lot", () => {
  const payload = { status: "success", data: { net: [position({ quantity: -66 })] } };
  assert.throws(() => normalizeNiftyPositions(payload, "2026-08-25"), /whole NIFTY lots/i);
});

test("normalizes NFO NIFTY BUY and SELL fills with exact signed directions", () => {
  const payload = {
    status: "success",
    data: [
      trade(),
      trade({ trade_id: "trade-2", transaction_type: "BUY", tradingsymbol: "NIFTY2681824000PE", average_price: 315.45 }),
      trade({ trade_id: "ignored-exchange", exchange: "BFO" }),
      trade({ trade_id: "ignored-underlying", tradingsymbol: "BANKNIFTY2681855000CE" })
    ]
  };

  assert.deepEqual(normalizeNiftyTrades(payload, "2026-08-18"), [
    {
      id: "trade-1",
      contractId: "NFO:NIFTY26AUG24100CE",
      tradingsymbol: "NIFTY26AUG24100CE",
      underlying: "NIFTY",
      exchange: "NFO",
      expiry: "2026-08-18",
      strike: 24100,
      optionType: "CE",
      transactionType: "SELL",
      quantity: 65,
      price: 358.8,
      timestamp: "2026-08-18T09:15:00+05:30"
    },
    {
      id: "trade-2",
      contractId: "NFO:NIFTY26AUG24000PE",
      tradingsymbol: "NIFTY26AUG24000PE",
      underlying: "NIFTY",
      exchange: "NFO",
      expiry: "2026-08-18",
      strike: 24000,
      optionType: "PE",
      transactionType: "BUY",
      quantity: 65,
      price: 315.45,
      timestamp: "2026-08-18T09:15:00+05:30"
    }
  ]);
});

test("rejects indivisible or unsigned matching NIFTY trade evidence atomically", () => {
  const indivisible = { status: "success", data: [trade(), trade({ trade_id: "bad", quantity: 64 })] };
  const unsigned = { status: "success", data: [trade({ transaction_type: "HOLD" })] };

  assert.throws(() => normalizeNiftyTrades(indivisible, "2026-08-18"), /whole NIFTY lots/i);
  assert.throws(() => normalizeNiftyTrades(unsigned, "2026-08-18"), /BUY or SELL/i);
});
