const assert = require("node:assert/strict");
const test = require("node:test");

const margin = require("./margin-evidence.js");

const leg = (id, overrides = {}) => ({
  id,
  source: "MANUAL",
  underlying: "NIFTY",
  expiry: "2026-08-25",
  strike: 25000,
  optionType: "CALL",
  direction: "SELL",
  lots: 1,
  lotSize: 65,
  premium: 440,
  ...overrides
});

test("builds individual and selected-basket requests from original saved legs and premiums", () => {
  const book = {
    strategies: {
      s1: { id: "s1", label: "T43", status: "ACTIVE", legIds: ["a", "b"] },
      s2: { id: "s2", label: "T44", status: "ACTIVE", legIds: ["c"] }
    },
    legs: {
      a: leg("a"),
      b: leg("b", { strike: 25200, direction: "BUY", premium: 120 }),
      c: leg("c", { optionType: "PUT", strike: 24800, premium: 300 })
    }
  };

  const requests = margin.requestsForBook(book, ["s1", "s2"]);
  assert.deepEqual(requests.map((request) => request.key), ["strategy:s1", "strategy:s2", "selection:s1+s2"]);
  assert.deepEqual(requests[0].legs.map((item) => [item.entryId, item.premium]), [["a", 440], ["b", 120]]);
  assert.deepEqual(requests[2].legs.map((item) => item.entryId), ["a", "b", "c"]);
  assert.equal(requests[2].fingerprint, margin.fingerprint(requests[2].legs));
});

test("normalizes broker basket and funds evidence without estimating missing values", () => {
  const normalized = margin.normalizeRefreshEvidence({
    updatedAt: "2026-08-08T10:00:00.000Z",
    funds: { availableMargin: 99725.05, usedMargin: 145706.55, availableCash: 245431.6 },
    baskets: [{
      key: "strategy:s1", fingerprint: "fp", total: 34786.725,
      legs: [{ entryId: "a", total: 95983.725 }, { entryId: "b", total: 521.25 }]
    }]
  });
  assert.equal(normalized.baskets["strategy:s1"].total, 34786.725);
  assert.deepEqual(normalized.funds, {
    availableMargin: 99725.05, usedMargin: 145706.55, availableCash: 245431.6
  });
  assert.equal(margin.formatMoney(120000), "₹1.20L");
  assert.equal(margin.formatMoney(39000), "₹39.00K");

  assert.equal(margin.normalizeRefreshEvidence({
    updatedAt: "2026-08-08T10:00:00.000Z", funds: null,
    baskets: [{ key: "strategy:s1", fingerprint: "fp", legs: [] }]
  }).baskets["strategy:s1"], undefined, "missing broker total stays unavailable");
});

test("resolves evidence only when saved-leg fingerprint still matches", () => {
  const legs = [leg("a")];
  const evidence = margin.normalizeRefreshEvidence({
    updatedAt: "2026-08-08T10:00:00.000Z",
    funds: null,
    baskets: [{ key: "strategy:s1", fingerprint: margin.fingerprint(legs), total: 120000,
      legs: [{ entryId: "a", total: 450000 }] }]
  });
  assert.equal(margin.resolveBasket(evidence, "strategy:s1", legs).total, 120000);
  assert.equal(margin.resolveBasket(evidence, "strategy:s1", [{ ...legs[0], premium: 441 }]), null);
  assert.equal(margin.resolveExactBasket(evidence, legs).total, 120000,
    "virtual B selections can reuse broker evidence only for exact same saved legs");
  assert.equal(margin.resolveExactBasket(evidence, [{ ...legs[0], premium: 441 }]), null);
});
