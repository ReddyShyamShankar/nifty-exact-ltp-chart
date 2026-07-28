import { createHash } from "node:crypto";

const TOKEN_URL = "https://api.kite.trade/session/token";
const LOGIN_URL = "https://kite.zerodha.com/connect/login";
export const ZERODHA_CALLBACK_FAILURE_MESSAGE = "Zerodha connection failed. Return to the extension and try again.";

function nextSixIst(now) {
  const instant = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(instant.getTime())) throw new Error("Invalid session clock.");
  const ist = new Date(instant.getTime() + 330 * 60 * 1000);
  let expiry = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 0, 30, 0, 0);
  if (expiry <= instant.getTime()) expiry += 24 * 60 * 60 * 1000;
  return new Date(expiry).toISOString();
}

function tokenRecord(raw) {
  try {
    const parsed = JSON.parse(raw || "");
    if (typeof parsed.accessToken !== "string" || !parsed.accessToken ||
      typeof parsed.expiresAt !== "string" || !Number.isFinite(Date.parse(parsed.expiresAt))) return null;
    return parsed;
  } catch {
    return null;
  }
}

function sessionError(message, status = 503, kind = "auth") {
  const error = new Error(message);
  error.status = status;
  error.kind = kind;
  return error;
}

export function createZerodhaSessionStore({
  readSecret,
  writeSecret,
  deleteSecret,
  now = () => new Date(),
  fetchImpl = fetch,
  services = {
    apiKey: "NIFTY Options Zerodha API Key",
    apiSecret: "NIFTY Options Zerodha API Secret",
    accessToken: "NIFTY Options Zerodha Daily Access Token"
  }
}) {
  if ([readSecret, writeSecret, deleteSecret, fetchImpl].some((dependency) => typeof dependency !== "function") ||
    !services?.apiKey || !services?.apiSecret || !services?.accessToken) {
    throw new Error("Invalid Zerodha session dependencies.");
  }

  async function configuredSecrets() {
    const [apiKey, apiSecret] = await Promise.all([
      readSecret(services.apiKey),
      readSecret(services.apiSecret)
    ]);
    return { apiKey, apiSecret };
  }

  async function activeToken() {
    const raw = await readSecret(services.accessToken);
    if (!raw) return null;
    const record = tokenRecord(raw);
    if (!record || Date.parse(record.expiresAt) <= new Date(now()).getTime()) {
      await deleteSecret(services.accessToken);
      return null;
    }
    return record;
  }

  async function status() {
    const [{ apiKey, apiSecret }, token] = await Promise.all([configuredSecrets(), activeToken()]);
    return {
      configured: Boolean(apiKey && apiSecret),
      connected: Boolean(apiKey && apiSecret && token),
      expiresAt: apiKey && apiSecret && token ? token.expiresAt : null
    };
  }

  async function loginUrl() {
    const { apiKey } = await configuredSecrets();
    if (!apiKey) throw sessionError("Zerodha API key is not configured. Run bin/nifty-bridge zerodha-setup.");
    const url = new URL(LOGIN_URL);
    url.searchParams.set("v", "3");
    url.searchParams.set("api_key", apiKey);
    return url.toString();
  }

  async function exchangeRequestToken(requestToken) {
    if (typeof requestToken !== "string" || !requestToken.trim()) {
      throw sessionError("Zerodha callback did not include a request token.", 400, "invalid_request");
    }
    const { apiKey, apiSecret } = await configuredSecrets();
    if (!apiKey || !apiSecret) {
      throw sessionError("Zerodha API credentials are not configured. Run bin/nifty-bridge zerodha-setup.");
    }
    const checksum = createHash("sha256").update(apiKey + requestToken + apiSecret).digest("hex");
    const form = new URLSearchParams({ api_key: apiKey, request_token: requestToken, checksum });
    let response;
    try {
      response = await fetchImpl(TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Kite-Version": "3"
        },
        body: form.toString()
      });
    } catch (cause) {
      const error = sessionError("Cannot reach Zerodha for token exchange.", 502, "network");
      error.cause = cause;
      throw error;
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok || typeof body.data?.access_token !== "string" || !body.data.access_token) {
      throw sessionError(ZERODHA_CALLBACK_FAILURE_MESSAGE, response.status || 502,
        response.status === 401 || response.status === 403 ? "auth" : "upstream");
    }
    const expiresAt = nextSixIst(now());
    await writeSecret(services.accessToken, JSON.stringify({ accessToken: body.data.access_token, expiresAt }));
    return { configured: true, connected: true, expiresAt };
  }

  async function credentials() {
    const [{ apiKey, apiSecret }, token] = await Promise.all([configuredSecrets(), activeToken()]);
    if (!apiKey || !apiSecret || !token) throw sessionError("Connect Zerodha for today's session.", 401);
    return {
      apiKey,
      accessToken: token.accessToken,
      onUnauthorized: () => deleteSecret(services.accessToken)
    };
  }

  return { status, loginUrl, exchangeRequestToken, credentials };
}
