import assert from "node:assert/strict";
import test from "node:test";

import { createAsyncCache } from "./chain-cache.js";

test("deduplicates concurrent and near-duplicate loads by key", async () => {
  let now = 1000;
  let loads = 0;
  let release;
  const firstLoad = new Promise((resolve) => { release = resolve; });
  const cache = createAsyncCache({ ttlMs: 2000, now: () => now });
  const load = async () => { loads += 1; return firstLoad; };

  const first = cache.get("current_month", load);
  const duplicate = cache.get("current_month", load);
  release({ spot: 23900 });

  assert.deepEqual(await first, { spot: 23900 });
  assert.deepEqual(await duplicate, { spot: 23900 });
  assert.equal(loads, 1);

  assert.deepEqual(await cache.get("current_month", async () => {
    loads += 1;
    return { spot: 24000 };
  }), { spot: 23900 });
  assert.equal(loads, 1);

  now += 2001;
  assert.deepEqual(await cache.get("current_month", async () => {
    loads += 1;
    return { spot: 24000 };
  }), { spot: 24000 });
  assert.equal(loads, 2);
});
