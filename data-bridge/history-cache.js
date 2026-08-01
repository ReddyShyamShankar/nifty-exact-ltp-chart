export function createHistoryCache() {
  const values = new Map();
  const inFlight = new Map();
  return {
    clear(key) {
      if (key === undefined) values.clear();
      else values.delete(key);
    },
    get(key, load) {
      if (values.has(key)) return Promise.resolve(values.get(key));
      if (inFlight.has(key)) return inFlight.get(key);
      const pending = Promise.resolve()
        .then(load)
        .then((value) => {
          values.set(key, value);
          return value;
        })
        .finally(() => inFlight.delete(key));
      inFlight.set(key, pending);
      return pending;
    },
    has(key) { return values.has(key); }
  };
}
