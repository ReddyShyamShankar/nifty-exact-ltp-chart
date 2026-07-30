(function (root) {
  "use strict";

  const noop = () => {};

  function createController(options = {}) {
    const callbacks = {
      onOpen: typeof options.onOpen === "function" ? options.onOpen : noop,
      onSelection: typeof options.onSelection === "function" ? options.onSelection : noop,
      onCompare: typeof options.onCompare === "function" ? options.onCompare : noop,
      onClear: typeof options.onClear === "function" ? options.onClear : noop
    };
    let selectedIds = [];
    let compare = false;

    return {
      label(strategyId) {
        if (typeof strategyId === "string" && strategyId) callbacks.onOpen(strategyId);
      },
      square(strategyId) {
        if (typeof strategyId !== "string" || !strategyId) return;
        selectedIds = selectedIds.includes(strategyId)
          ? selectedIds.filter((id) => id !== strategyId)
          : [...selectedIds, strategyId];
        callbacks.onSelection([...selectedIds]);
      },
      selected() {
        return [...selectedIds];
      },
      isSelected(strategyId) {
        return selectedIds.includes(strategyId);
      },
      compare(value) {
        compare = value === true;
        callbacks.onCompare(compare);
      },
      comparing() {
        return compare;
      },
      clear() {
        selectedIds = [];
        compare = false;
        callbacks.onSelection([]);
        callbacks.onClear();
      }
    };
  }

  function projectBreakEven(exact, axisMap) {
    const price = Number(exact);
    const minPrice = Number(axisMap?.minPrice);
    const maxPrice = Number(axisMap?.maxPrice);
    const minY = Number(axisMap?.minY);
    const maxY = Number(axisMap?.maxY);
    const unsafe = ![price, minPrice, maxPrice, minY, maxY].every(Number.isFinite)
      || minPrice >= maxPrice || minY > maxY || typeof axisMap?.priceToY !== "function";
    if (unsafe) return { mode: "HIDDEN", exact: price, reason: "UNSAFE_AXIS" };
    if (price > maxPrice) return { mode: "EDGE", edge: "TOP", arrow: "↑", exact: price, markerY: minY };
    if (price < minPrice) return { mode: "EDGE", edge: "BOTTOM", arrow: "↓", exact: price, markerY: maxY };
    const railY = Number(axisMap.priceToY(price));
    if (!Number.isFinite(railY) || railY < minY || railY > maxY) {
      return { mode: "HIDDEN", exact: price, reason: "UNSAFE_AXIS" };
    }
    return { mode: "RAIL", exact: price, railY };
  }

  function stackCards(cards, options = {}) {
    const gap = Number.isFinite(Number(options.gap)) ? Math.max(0, Number(options.gap)) : 0;
    const minY = Number(options.minY);
    const maxY = Number(options.maxY);
    if (!Array.isArray(cards) || !Number.isFinite(minY) || !Number.isFinite(maxY) || minY > maxY) return [];
    const sorted = cards.map((card, index) => ({
      ...card,
      railY: Number(card.railY),
      height: Math.max(0, Number(card.height)),
      _index: index
    })).filter((card) => Number.isFinite(card.railY) && Number.isFinite(card.height))
      .sort((a, b) => a.railY - b.railY || a._index - b._index);
    if (!sorted.length) return [];

    let priorBottom = -Infinity;
    const placed = sorted.map((card) => {
      const desired = card.railY - card.height / 2;
      const cardY = Math.max(desired, priorBottom === -Infinity ? desired : priorBottom + gap);
      priorBottom = cardY + card.height;
      return { ...card, cardY };
    });

    const overflow = placed.at(-1).cardY + placed.at(-1).height - maxY;
    if (overflow > 0) placed.forEach((card) => { card.cardY -= overflow; });
    const underflow = minY - placed[0].cardY;
    if (underflow > 0) placed.forEach((card) => { card.cardY += underflow; });

    return placed.map(({ _index, ...card }) => ({
      ...card,
      connector: {
        fromY: card.cardY + card.height / 2,
        toY: card.railY,
        moved: Math.abs(card.cardY + card.height / 2 - card.railY) > 0.5
      }
    }));
  }

  function accessibleLabel(model) {
    const label = typeof model?.strategyLabel === "string" && model.strategyLabel ? model.strategyLabel : "Strategy";
    const exact = Number(model?.exact);
    const price = Number.isFinite(exact) ? Math.round(exact).toLocaleString("en-IN") : "unavailable";
    const location = model?.mode === "EDGE"
      ? `${model.edge === "BOTTOM" ? "below" : "above"} visible chart`
      : "visible on chart";
    const selection = model?.selected === true ? "selected" : "not selected";
    return `${label} break-even ${price}, ${location}, ${selection} for combined preview. Open positions and P&L.`;
  }

  const api = { createController, projectBreakEven, stackCards, accessibleLabel };
  root.OptionsStrategyChart = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
