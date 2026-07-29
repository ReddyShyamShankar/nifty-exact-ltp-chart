(function (root) {
  "use strict";

  function createController(options) {
    let pending = null;
    const faces = new Map();

    function cancel() {
      if (pending !== null) options.clearTimer(pending);
      pending = null;
    }

    function click(context) {
      cancel();
      pending = options.setTimer(() => {
        pending = null;
        const entries = Array.isArray(context.entries) ? context.entries : [];
        if (!entries.length) return options.onQuick(context);

        const currentId = faces.get(context.strike) || null;
        const currentIndex = entries.findIndex((entry) => entry.id === currentId);
        const index = currentIndex + 1;
        const entry = entries[index] || null;
        if (entry) faces.set(context.strike, entry.id);
        else faces.delete(context.strike);
        options.onFace({ ...context, entryId: entry?.id || null });
      }, options.delay ?? 240);
    }

    function doubleClick(context) {
      cancel();
      options.onEditor({ ...context, entryId: faces.get(context.strike) || null });
    }

    function reset() {
      cancel();
      faces.clear();
      options.onReset();
    }

    return {
      click,
      doubleClick,
      outside: reset,
      escape: reset,
      reset,
      activeEntryId(strike) {
        return faces.get(strike) || null;
      }
    };
  }

  const api = { createController };
  root.NiftyManualInteraction = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
