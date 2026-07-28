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

test("token exchange failure preserves status and kind without carrying upstream secret text", async () => {
  const secrets = memorySecrets({
    [services.apiKey]: "public-key",
    [services.apiSecret]: "private-secret"
  });
  const upstreamSecret = "request_token=request-secret checksum=checksum-secret access_token=token-secret api_secret=body-secret";
  const store = createZerodhaSessionStore({
    ...secrets,
    services,
    fetchImpl: async () => jsonResponse(403, { status: "error", message: upstreamSecret })
  });

  await assert.rejects(store.exchangeRequestToken("request-secret"), (error) => {
    assert.equal(error.message, "Zerodha connection failed. Return to the extension and try again.");
    assert.equal(error.status, 403);
    assert.equal(error.kind, "auth");
    assert.doesNotMatch(`${error.message} ${error.stack} ${Object.values(error).join(" ")}`, /request-secret|checksum-secret|token-secret|body-secret/);
    assert.equal(Object.hasOwn(error, "body"), false);
    return true;
  });
});

test("token exchange network failure discards secret-bearing transport cause", async () => {
  const secrets = memorySecrets({
    [services.apiKey]: "public-key",
    [services.apiSecret]: "private-secret"
  });
  const store = createZerodhaSessionStore({
    ...secrets,
    services,
    fetchImpl: async () => {
      throw new Error("request_token=transport-request-secret access_token=transport-access-secret");
    }
  });

  await assert.rejects(store.exchangeRequestToken("one-time-request"), (error) => {
    const ownProperties = Object.getOwnPropertyNames(error);
    const exposed = [
      String(error),
      ...ownProperties.map((property) => `${property}:${String(error[property])}`)
    ].join("\n");

    assert.equal(error.message, "Cannot reach Zerodha for token exchange.");
    assert.equal(error.status, 502);
    assert.equal(error.kind, "network");
    assert.equal(Object.hasOwn(error, "cause"), false);
    assert.deepEqual(ownProperties.sort(), ["kind", "message", "stack", "status"]);
    assert.doesNotMatch(exposed, /transport-request-secret|transport-access-secret|request_token|access_token/);
    return true;
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
