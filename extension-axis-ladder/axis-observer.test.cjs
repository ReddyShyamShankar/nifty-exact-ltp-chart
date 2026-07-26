"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const observer = require("./axis-observer.js");

test("observer accepts plain axis numbers and rejects chart prose", () => {
  assert.equal(observer.numericAxisText("24,000.00"), 24000);
  assert.equal(observer.numericAxisText("−250"), -250);
  assert.equal(observer.numericAxisText("C 12 | P 20"), null);
});

test("observer projects canvas coordinates into CSS viewport coordinates", () => {
  const context = {
    canvas: {
      width: 400,
      height: 200,
      getBoundingClientRect: () => ({ left: 800, top: 40, width: 200, height: 100 })
    },
    getTransform: () => ({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 })
  };
  assert.deepEqual(observer.projectedFill(context, "24,000", 50, 30, 1000), { price: 24000, y: 70 });
  assert.equal(observer.projectedFill(context, "24,000", -300, 30, 1000), null);
});

test("observer converts TradingView text baseline to visual tick center", () => {
  const context = {
    canvas: {
      width: 200,
      height: 100,
      getBoundingClientRect: () => ({ left: 900, top: 20, width: 200, height: 100 })
    },
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    measureText: () => ({ actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 })
  };
  assert.deepEqual(observer.projectedFill(context, "24,000", 50, 40, 1000), { price: 24000, y: 57 });
});
