export function createAsyncCache({ ttlMs, now = Date.now }) {
  const entries = new Map();
  const inFlight = new Map();

  return {
    get(key, load) {
      const cached = entries.get(key);
      if (cached && now() - cached.storedAt <= ttlMs) return Promise.resolve(cached.value);
      if (inFlight.has(key)) return inFlight.get(key);

      const pending = Promise.resolve()
        .then(load)
        .then((value) => {
          entries.set(key, { storedAt: now(), value });
          return value;
        })
        .finally(() => { inFlight.delete(key); });
      inFlight.set(key, pending);
      return pending;
    }
  };
}
