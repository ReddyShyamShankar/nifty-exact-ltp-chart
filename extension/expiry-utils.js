(function exposeExpiryUtils(root) {
  "use strict";

  const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

  function parts(expiry) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(expiry || ""));
    if (!match) return null;
    const month = Number(match[2]);
    if (month < 1 || month > 12) return null;
    return { year: match[1], month: MONTHS[month - 1], day: String(Number(match[3])) };
  }

  function matches(text, expiry) {
    const wanted = parts(expiry);
    if (!wanted) return false;
    const value = String(text || "")
      .toLowerCase()
      .replace(/[.,/\-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return value.includes(wanted.year)
      && value.includes(wanted.month)
      && new RegExp(`(?:^|\\s)0?${wanted.day}(?:\\s|$)`).test(value);
  }

  const api = { matches, parts };
  root.NiftyExpiry = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
