import assert from "node:assert/strict";
import test from "node:test";

import { createZerodhaSessionStore } from "./zerodha-session.js";

const services = {
  apiKey: "test.zerodha.api-key",
  apiSecret: "test.zerodha.api-secret",
  accessToken: "test.zerodha.access-token"
};

function memorySecrets(initial = {}) {
  const values = new Map(Object.entries(initial));
  const deleted = [];
  return {
    values,
    deleted,
    readSecret: async (service) => values.get(service) || null,
    writeSecret: async (service, value) => { values.set(service, value); },
    deleteSecret: async (service) => { deleted.push(service); values.delete(service); }
  };
}

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload; }
  };
}

test("builds official v3 login URL and reports no secret material", async () => {
  const secrets = memorySecrets({
    [services.apiKey]: "public key with space",
    [services.apiSecret]: "private-secret"
  });
  const store = createZerodhaSessionStore({ ...secrets, services, now: () => new Date("2026-07-28T18:00:00.000Z") });

  assert.equal(await store.loginUrl(), "https://kite.zerodha.com/connect/login?v=3&api_key=public+key+with+space");
  const status = await store.status();
  assert.deepEqual(status, { configured: true, connected: false, expiresAt: null });
  assert.doesNotMatch(JSON.stringify(status), /public key|private-secret|access.?token/i);
  assert.deepEqual(Object.keys(store).sort(), ["credentials", "exchangeRequestToken", "loginUrl", "status"]);
});

test("exchanges request token with literal SHA-256 checksum and stores token until next 06:00 IST", async () => {
  const secrets = memorySecrets({
    [services.apiKey]: "public-key",
    [services.apiSecret]: "private-secret"
  });
  let request;
  const store = createZerodhaSessionStore({
    ...secrets,
    services,
    now: () => new Date("2026-07-28T18:00:00.000Z"),
    fetchImpl: async (url, options) => {
      request = { url, options };
      return jsonResponse(200, { status: "success", data: { access_token: "daily-access-token", user_id: "AB1234" } });
    }
  });

  const result = await store.exchangeRequestToken("request-token");
  assert.equal(request.url, "https://api.kite.trade/session/token");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers["X-Kite-Version"], "3");
  assert.equal(request.options.headers["Content-Type"], "application/x-www-form-urlencoded");
  assert.deepEqual(Object.fromEntries(new URLSearchParams(request.options.body)), {
    api_key: "public-key",
    request_token: "request-token",
    checksum: "a3fcf6a7b997c733a1e5685a77dade71f26b1fc240ce272425af2375267d6f37"
  });
  assert.deepEqual(result, { configured: true, connected: true, expiresAt: "2026-07-29T00:30:00.000Z" });
  assert.doesNotMatch(JSON.stringify(result), /daily-access-token|private-secret/);
  assert.deepEqual(JSON.parse(secrets.values.get(services.accessToken)), {
    accessToken: "daily-access-token",
    expiresAt: "2026-07-29T00:30:00.000Z"
  });
});

test("expired credentials fail closed and unauthorized callback deletes only access token", async () => {
  const secrets = memorySecrets({
    [services.apiKey]: "public-key",
    [services.apiSecret]: "private-secret",
    [services.accessToken]: JSON.stringify({ accessToken: "stale-token", expiresAt: "2026-07-28T00:30:00.000Z" })
  });
  const store = createZerodhaSessionStore({ ...secrets, services, now: () => new Date("2026-07-28T00:31:00.000Z") });

  assert.deepEqual(await store.status(), { configured: true, connected: false, expiresAt: null });
  await assert.rejects(store.credentials(), /connect Zerodha/i);
  assert.deepEqual(secrets.deleted, [services.accessToken]);

  secrets.values.set(services.accessToken, JSON.stringify({ accessToken: "fresh-token", expiresAt: "2026-07-29T00:30:00.000Z" }));
  const credentials = await store.credentials();
  assert.equal(credentials.apiKey, "public-key");
  assert.equal(credentials.accessToken, "fresh-token");
  await credentials.onUnauthorized();
  assert.deepEqual(secrets.deleted, [services.accessToken, services.accessToken]);
  assert.equal(secrets.values.has(services.apiKey), true);
  assert.equal(secrets.values.has(services.apiSecret), true);
});
