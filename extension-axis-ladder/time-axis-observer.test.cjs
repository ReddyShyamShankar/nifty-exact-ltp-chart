"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const api = require("./time-axis-observer.js");

test("parses exact date month-day and intraday labels against anchor", () => {
  const anchor = Date.parse("2026-08-01T00:00:00.000Z");
  assert.equal(api.parseTimeLabel("2026-07-30", anchor), Date.parse("2026-07-30T00:00:00.000Z"));
  assert.equal(api.parseTimeLabel("Jul 30", anchor), Date.parse("2026-07-30T00:00:00.000Z"));
  assert.equal(api.parseTimeLabel("09:15", anchor), Date.parse("2026-08-01T09:15:00.000Z"));
  assert.equal(api.parseTimeLabel("24,400", anchor), null);
});

test("stable monotonic pairs map timestamp to x", () => {
  const toX = api.timeToX([
    { time: Date.parse("2026-07-30T09:15:00Z"), x: 100 },
    { time: Date.parse("2026-07-30T10:15:00Z"), x: 300 },
    { time: Date.parse("2026-07-30T11:15:00Z"), x: 500 }
  ]);
  assert.equal(toX(Date.parse("2026-07-30T09:45:00Z")), 200);
});

test("ambiguous duplicate and non-monotonic evidence fails closed", () => {
  assert.equal(api.timeToX([{ time: 2, x: 100 }]), null);
  assert.equal(api.timeToX([{ time: 2, x: 100 }, { time: 1, x: 200 }]), null);
  assert.equal(api.timeToX([{ time: 1, x: 100 }, { time: 1, x: 200 }]), null);
});

test("observation becomes stable only after repeated signature", () => {
  const candidates = [{ time: 1, x: 100 }, { time: 2, x: 200 }];
  const first = api.observationEnvelope(candidates, null, 1);
  const second = api.observationEnvelope(candidates, first, 2);
  assert.equal(first.stableCount, 1);
  assert.equal(second.stableCount, 2);
  assert.equal(api.shouldPublish(second), true);
});

test("time-axis canvas must sit directly below matching chart", () => {
  const chart = {
    getAttribute: () => "Chart for NSE_DLY:NIFTY, 4 hours",
    getBoundingClientRect: () => ({ left: 50, top: 40, right: 900, bottom: 600 })
  };
  const documentRef = { querySelectorAll: () => [chart] };
  assert.equal(api.chartSourceLabel({ left: 50, top: 600, right: 900, bottom: 630 }, documentRef), "Chart for NSE_DLY:NIFTY, 4 hours");
  assert.equal(api.chartSourceLabel({ left: 920, top: 40, right: 980, bottom: 600 }, documentRef), null);
});
