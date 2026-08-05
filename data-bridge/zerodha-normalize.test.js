import assert from "node:assert/strict";
import test from "node:test";

import { normalizeNiftyPositions, normalizeNiftyTrades } from "./zerodha-normalize.js";

const MONTHLY_LOT_65 = Object.freeze({ expiryKind: "monthly", lotSize: 65 });
const WEEKLY_LOT_65 = Object.freeze({ expiryKind: "weekly", lotSize: 65 });
const UNCLASSIFIED_LOT_65 = Object.freeze({ lotSize: 65 });

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

  assert.deepEqual(normalizeNiftyPositions(payload, "2026-08-25", MONTHLY_LOT_65), [{
    contractId: "NFO:NIFTY:2026-08-25:24100:CE",
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

test("ignores recognized NIFTY futures mixed with monthly option positions", () => {
  const payload = {
    status: "success",
    data: {
      net: [
        position({ tradingsymbol: "NIFTY26AUGFUT", quantity: 65 }),
        position({ tradingsymbol: "NIFTY26AUG24100CE", quantity: -65 })
      ]
    }
  };

  const normalized = normalizeNiftyPositions(payload, "2026-08-25", MONTHLY_LOT_65);

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].contractId, "NFO:NIFTY:2026-08-25:24100:CE");
});

test("matches weekly symbol through exact expiry hint and preserves exact identity", () => {
  const payload = { status: "success", data: { net: [position({ tradingsymbol: "NIFTY2681824000PE", quantity: 65 })] } };

  assert.deepEqual(normalizeNiftyPositions(payload, "2026-08-18", UNCLASSIFIED_LOT_65), [{
    contractId: "NFO:NIFTY:2026-08-18:24000:PE",
    tradingsymbol: "NIFTY2681824000PE",
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
  assert.deepEqual(normalizeNiftyPositions(payload, "2026-08-11", UNCLASSIFIED_LOT_65), []);
});

test("does not accept same-month monthly symbol for a weekly August expiry", () => {
  const payload = { status: "success", data: { net: [position()] } };

  assert.deepEqual(normalizeNiftyPositions(payload, "2026-08-18", WEEKLY_LOT_65), []);
  assert.throws(
    () => normalizeNiftyPositions(payload, "2026-08-25", { expiryKind: "unknown", lotSize: 65 }),
    /monthly expiry.*cannot be proved/i
  );
});

test("fails closed when a matching NIFTY position is not a whole lot", () => {
  const payload = { status: "success", data: { net: [position({ quantity: -66 })] } };
  assert.throws(() => normalizeNiftyPositions(payload, "2026-08-25", MONTHLY_LOT_65), /whole NIFTY lots/i);
});

test("uses the exact 25-contract lot size supplied for position arithmetic and output", () => {
  const payload = { status: "success", data: { net: [position({ quantity: -50 })] } };

  const [normalized] = normalizeNiftyPositions(payload, "2026-08-25", { expiryKind: "monthly", lotSize: 25 });

  assert.equal(normalized.signedQuantity, -50);
  assert.equal(normalized.lotSize, 25);
});

test("position normalization fails closed without an exact positive integer lot size", () => {
  const payload = { status: "success", data: { net: [] } };
  for (const lotSize of [undefined, null, 0, -1, 25.5, "25"]) {
    assert.throws(
      () => normalizeNiftyPositions(payload, "2026-08-25", { expiryKind: "monthly", lotSize }),
      /lot size.*positive integer/i
    );
  }
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

  assert.deepEqual(normalizeNiftyTrades(payload, "2026-08-18", UNCLASSIFIED_LOT_65), [
    {
      id: "trade-1",
      contractId: "NFO:NIFTY:2026-08-18:24100:CE",
      tradingsymbol: "NIFTY2681824100CE",
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
      contractId: "NFO:NIFTY:2026-08-18:24000:PE",
      tradingsymbol: "NIFTY2681824000PE",
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

test("ignores recognized NIFTY futures mixed with monthly option trades", () => {
  const payload = {
    status: "success",
    data: [
      trade({ trade_id: "future-trade", tradingsymbol: "NIFTY26AUGFUT" }),
      trade({
        trade_id: "option-trade",
        tradingsymbol: "NIFTY26AUG24100CE",
        fill_timestamp: "2026-08-25 09:15:00"
      })
    ]
  };

  const normalized = normalizeNiftyTrades(payload, "2026-08-25", MONTHLY_LOT_65);

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].id, "option-trade");
  assert.equal(normalized[0].contractId, "NFO:NIFTY:2026-08-25:24100:CE");
});

test("rejects indivisible or unsigned matching NIFTY trade evidence atomically", () => {
  const indivisible = { status: "success", data: [trade(), trade({ trade_id: "bad", quantity: 64 })] };
  const unsigned = { status: "success", data: [trade({ transaction_type: "HOLD" })] };

  assert.throws(() => normalizeNiftyTrades(indivisible, "2026-08-18", UNCLASSIFIED_LOT_65), /whole NIFTY lots/i);
  assert.throws(() => normalizeNiftyTrades(unsigned, "2026-08-18", UNCLASSIFIED_LOT_65), /BUY or SELL/i);
});

test("uses the exact 25-contract lot size supplied for trade arithmetic", () => {
  const payload = { status: "success", data: [trade({ quantity: 25 })] };

  const [normalized] = normalizeNiftyTrades(payload, "2026-08-18", { expiryKind: "weekly", lotSize: 25 });

  assert.equal(normalized.quantity, 25);
});

test("trade normalization fails closed without an exact positive integer lot size", () => {
  const payload = { status: "success", data: [] };
  for (const lotSize of [undefined, null, 0, -1, 25.5, "25"]) {
    assert.throws(
      () => normalizeNiftyTrades(payload, "2026-08-18", { expiryKind: "weekly", lotSize }),
      /lot size.*positive integer/i
    );
  }
});

test("rejects non-number position fields before conversion and preserves numeric zero", () => {
  const invalidValues = [null, undefined, "", "   ", "0", false, [], {}];
  for (const field of ["quantity", "average_price", "last_price", "pnl"]) {
    for (const value of invalidValues) {
      const payload = { status: "success", data: { net: [position({ [field]: value })] } };
      assert.throws(
        () => normalizeNiftyPositions(payload, "2026-08-25", MONTHLY_LOT_65),
        /invalid Zerodha|must be an integer/i
      );
    }
  }

  const zeroPayload = { status: "success", data: { net: [position({ quantity: -65, average_price: 0, last_price: 0, pnl: 0 })] } };
  const [normalized] = normalizeNiftyPositions(zeroPayload, "2026-08-25", MONTHLY_LOT_65);
  assert.equal(normalized.averagePrice, 0);
  assert.equal(normalized.lastPrice, 0);
  assert.equal(normalized.pnl, 0);
});

test("rejects non-number trade fields before conversion and preserves numeric zero price", () => {
  const invalidValues = [null, undefined, "", "   ", "65", false, [], {}];
  for (const field of ["quantity", "average_price"]) {
    for (const value of invalidValues) {
      const payload = { status: "success", data: [trade({ [field]: value })] };
      assert.throws(() => normalizeNiftyTrades(payload, "2026-08-18", WEEKLY_LOT_65), /invalid Zerodha|must be positive/i);
    }
  }

  const [normalized] = normalizeNiftyTrades(
    { status: "success", data: [trade({ average_price: 0 })] },
    "2026-08-18",
    WEEKLY_LOT_65
  );
  assert.equal(normalized.price, 0);
});

test("canonical identities keep Aug-04 and Aug-11 weekly contracts isolated", () => {
  const august4 = normalizeNiftyPositions({
    status: "success",
    data: { net: [position({ tradingsymbol: "NIFTY2680424100CE", quantity: -65 })] }
  }, "2026-08-04", WEEKLY_LOT_65);
  const august11 = normalizeNiftyPositions({
    status: "success",
    data: { net: [position({ tradingsymbol: "NIFTY2681124100CE", quantity: -65 })] }
  }, "2026-08-11", WEEKLY_LOT_65);

  assert.equal(august4[0].contractId, "NFO:NIFTY:2026-08-04:24100:CE");
  assert.equal(august11[0].contractId, "NFO:NIFTY:2026-08-11:24100:CE");
  assert.notEqual(august4[0].contractId, august11[0].contractId);
  assert.equal(august4[0].tradingsymbol, "NIFTY2680424100CE");
  assert.equal(august11[0].tradingsymbol, "NIFTY2681124100CE");
});

test("trade timestamps reject impossible dates and trailing suffixes", () => {
  for (const fillTimestamp of [
    "2026-02-30 09:15:00",
    "2026-08-18T09:15:00+05:30junk",
    "2026-08-18T25:15:00+05:30"
  ]) {
    assert.throws(
      () => normalizeNiftyTrades({ status: "success", data: [trade({ fill_timestamp: fillTimestamp })] }, "2026-08-18", WEEKLY_LOT_65),
      /timestamp/i
    );
  }
});
