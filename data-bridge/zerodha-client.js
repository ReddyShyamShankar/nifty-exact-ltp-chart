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

  async function request(path, { method = "GET", body, responseType = "json" } = {}) {
    let response;
    try {
      response = await fetchImpl(`${API_BASE}${path}`, {
        method,
        headers: {
          Accept: responseType === "text" ? "text/csv" : "application/json",
          Authorization: `token ${apiKey}:${accessToken}`,
          "X-Kite-Version": "3",
          ...(body === undefined ? {} : { "Content-Type": "application/json" })
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
    } catch (cause) {
      const error = new Error("Cannot reach Zerodha. Check the internet connection.");
      error.status = 502;
      error.kind = "network";
      error.cause = cause;
      throw error;
    }

    const responseBody = responseType === "text"
      ? await response.text().catch(() => "")
      : await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) await onUnauthorized();
      throw kiteError(responseBody, response.status);
    }
    return responseBody;
  }

  return {
    getPositions: () => request("/portfolio/positions"),
    getTrades: () => request("/trades"),
    getFunds: () => request("/user/margins"),
    getInstrumentsNfo: () => request("/instruments/NFO", { responseType: "text" }),
    calculateBasketMargins: (orders) => request("/margins/basket?consider_positions=false", {
      method: "POST",
      body: orders
    })
  };
}
