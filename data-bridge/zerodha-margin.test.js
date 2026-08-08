import assert from "node:assert/strict";
import test from "node:test";

import { buildBasketOrders, normalizeBasketMargin, normalizeBrokerFunds, parseNfoInstruments } from "./zerodha-margin.js";

const csv = `instrument_token,exchange_token,tradingsymbol,name,last_price,expiry,strike,tick_size,lot_size,instrument_type,segment,exchange
1,11,NIFTY2682525000CE,NIFTY,0,2026-08-25,25000,0.05,65,CE,NFO-OPT,NFO
2,12,NIFTY2682525000PE,NIFTY,0,2026-08-25,25000,0.05,65,PE,NFO-OPT,NFO
3,13,BANKNIFTY2682525000CE,BANKNIFTY,0,2026-08-25,25000,0.05,30,CE,NFO-OPT,NFO`;

test("resolves exact NIFTY instrument and builds original-premium basket orders", () => {
  const instruments = parseNfoInstruments(csv);
  const legs = [{
    entryId: "leg-1", underlying: "NIFTY", expiry: "2026-08-25", strike: 25000,
    optionType: "CALL", direction: "SELL", lots: 2, lotSize: 65, premium: 440, product: "NRML"
  }];
  assert.deepEqual(buildBasketOrders(legs, instruments), [{
    entryId: "leg-1",
    order: {
      exchange: "NFO", tradingsymbol: "NIFTY2682525000CE", transaction_type: "SELL",
      variety: "regular", product: "NRML", order_type: "LIMIT", quantity: 130,
      price: 440, trigger_price: 0
    }
  }]);
});

test("fails closed for missing, duplicate, or conflicting contract evidence", () => {
  const leg = {
    entryId: "leg-1", underlying: "NIFTY", expiry: "2026-08-25", strike: 25000,
    optionType: "CALL", direction: "BUY", lots: 1, lotSize: 65, premium: 12, product: "NRML"
  };
  assert.throws(() => buildBasketOrders([{ ...leg, strike: 24950 }], parseNfoInstruments(csv)), /exact Zerodha instrument/);
  assert.throws(() => buildBasketOrders([{ ...leg, lotSize: 50 }], parseNfoInstruments(csv)), /lot size/);
  assert.throws(() => buildBasketOrders([leg], parseNfoInstruments(`${csv}\n4,14,NIFTY-DUP,NIFTY,0,2026-08-25,25000,0.05,65,CE,NFO-OPT,NFO`)), /multiple Zerodha instruments/);
});

test("normalizes broker funds and hedge-aware final basket total only", () => {
  assert.deepEqual(normalizeBrokerFunds({ status: "success", data: { equity: {
    net: 250000, available: { cash: 125000 }, utilised: { debits: 75000 }
  } } }), { availableMargin: 250000, usedMargin: 75000, availableCash: 125000 });
  assert.deepEqual(normalizeBasketMargin({ status: "success", data: {
    final: { total: 120000 }, orders: [{ total: 450000 }, { total: 39000 }]
  } }, ["leg-1", "leg-2"]), {
    total: 120000,
    legs: [{ entryId: "leg-1", total: 450000 }, { entryId: "leg-2", total: 39000 }]
  });
  assert.throws(() => normalizeBasketMargin({ status: "success", data: { orders: [] } }, []), /combined margin/);
  assert.throws(() => normalizeBrokerFunds({ status: "success", data: { equity: { net: 1 } } }), /fund evidence/);
});
