(function (root) {
  "use strict";

  function createController(options) {
    let pending = null;
    let generation = 0;
    const faces = new Map();

    function cancel() {
      generation += 1;
      if (pending !== null) options.clearTimer(pending);
      pending = null;
    }

    function click(context) {
      cancel();
      const scheduledGeneration = generation;
      let timer = null;
      timer = options.setTimer(() => {
        if (generation !== scheduledGeneration || pending !== timer) return;
        pending = null;
        const entries = Array.isArray(context.entries) ? context.entries : [];
        if (!entries.length) return options.onQuick(context);

        const currentId = faces.get(context.strike) || null;
        const currentIndex = entries.findIndex((entry) => entry.id === currentId);
        const index = currentIndex + 1;
        const entry = entries[index] || null;
        faces.clear();
        if (entry) faces.set(context.strike, entry.id);
        options.onFace({ ...context, entryId: entry?.id || null });
      }, options.delay ?? 240);
      pending = timer;
    }

    function doubleClick(context) {
      cancel();
      const activeEntryId = faces.get(context.strike) || null;
      const editableEntries = (Array.isArray(context?.entries) ? context.entries : [])
        .filter((entry) => entry?.source !== "BROKER_POSITION");
      const optionType = ["CALL", "PUT"].includes(context?.optionType) ? context.optionType : null;
      const matchingEntries = optionType
        ? editableEntries.filter((entry) => entry?.optionType === optionType)
        : editableEntries;
      const entryId = activeEntryId || (matchingEntries.length === 1 ? matchingEntries[0].id : null);
      faces.clear();
      options.onEditor({ ...context, entryId });
    }

    function openFace(context, entryId) {
      cancel();
      const entries = Array.isArray(context?.entries) ? context.entries : [];
      const entry = entries.find((candidate) => candidate?.id === entryId) || null;
      if (!entry) return false;
      faces.clear();
      faces.set(context.strike, entry.id);
      options.onFace({ ...context, entryId: entry.id });
      return true;
    }

    function reset() {
      cancel();
      faces.clear();
      options.onReset();
    }

    function dispose() {
      cancel();
      faces.clear();
    }

    return {
      click,
      doubleClick,
      openFace,
      outside: reset,
      escape: reset,
      reset,
      dispose,
      activeEntryId(strike) {
        return faces.get(strike) || null;
      }
    };
  }

  const api = { createController };
  root.NiftyManualInteraction = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
