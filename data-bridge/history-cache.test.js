import test from "node:test";
import assert from "node:assert/strict";
import { createHistoryCache } from "./history-cache.js";

test("identical history loads deduplicate while in flight and after completion", async () => {
  let loads = 0;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const cache = createHistoryCache();
  const load = async () => { loads += 1; await pending; return [{ time: "2026-08-01T09:15:00+05:30" }]; };
  const left = cache.get("same", load);
  const right = cache.get("same", load);
  assert.equal(loads, 0);
  release();
  assert.deepEqual(await left, await right);
  assert.equal(loads, 1);
  await cache.get("same", load);
  assert.equal(loads, 1);
});

test("failed history load is evicted for later explicit retry", async () => {
  let loads = 0;
  const cache = createHistoryCache();
  await assert.rejects(cache.get("same", async () => { loads += 1; throw new Error("offline"); }), /offline/);
  assert.deepEqual(await cache.get("same", async () => { loads += 1; return [1]; }), [1]);
  assert.equal(loads, 2);
});

test("history cache isolates exact keys", async () => {
  const cache = createHistoryCache();
  assert.deepEqual(await cache.get("expiry-a", async () => [1]), [1]);
  assert.deepEqual(await cache.get("expiry-b", async () => [2]), [2]);
  assert.equal(cache.has("expiry-a"), true);
  cache.clear("expiry-a");
  assert.equal(cache.has("expiry-a"), false);
});
