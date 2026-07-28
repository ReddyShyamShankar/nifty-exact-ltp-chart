const API_BASE = "https://api.kite.trade";

function kiteError(body, status) {
  const upstreamMessage = body?.message || `Zerodha returned HTTP ${status}.`;
  const error = new Error(status === 401
    ? "Zerodha session expired. Connect Zerodha again."
    : upstreamMessage);
  error.status = status;
  error.kind = status === 401 || status === 403 ? "auth" : status === 429 ? "rate_limit" : "upstream";
  return error;
}

export function createZerodhaClient({ apiKey, accessToken, fetchImpl = fetch, onUnauthorized = async () => {} }) {
  if (typeof apiKey !== "string" || !apiKey || typeof accessToken !== "string" || !accessToken) {
    throw new Error("Zerodha credentials are unavailable.");
  }
  if (typeof fetchImpl !== "function" || typeof onUnauthorized !== "function") {
    throw new Error("Invalid Zerodha client dependencies.");
  }

  async function get(path) {
    let response;
    try {
      response = await fetchImpl(`${API_BASE}${path}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `token ${apiKey}:${accessToken}`,
          "X-Kite-Version": "3"
        }
      });
    } catch (cause) {
      const error = new Error("Cannot reach Zerodha. Check the internet connection.");
      error.status = 502;
      error.kind = "network";
      error.cause = cause;
      throw error;
    }

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) await onUnauthorized();
      throw kiteError(body, response.status);
    }
    return body;
  }

  return {
    getPositions: () => get("/portfolio/positions"),
    getTrades: () => get("/trades")
  };
}
