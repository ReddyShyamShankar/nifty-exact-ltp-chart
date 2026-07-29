(function (root) {
  "use strict";

  const OPTION_TYPES = ["CALL", "PUT"];
  const DIRECTIONS = ["BUY", "SELL"];

  function number(value) {
    if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function snapshot(value) {
    const parsed = number(value);
    return parsed !== null && parsed >= 0 ? parsed : null;
  }

  function money(value) {
    const parsed = snapshot(value);
    return parsed === null ? "—" : parsed.toFixed(2);
  }

  function strikeLabel(value) {
    const parsed = number(value);
    return parsed === null ? "—" : parsed.toLocaleString("en-IN");
  }

  function createDraft({ expiry, row, entry } = {}) {
    const liveCall = snapshot(row?.call);
    const livePut = snapshot(row?.put);
    const optionType = OPTION_TYPES.includes(entry?.optionType) ? entry.optionType : null;
    const callSnapshot = snapshot(entry?.callSnapshot) ?? liveCall;
    const putSnapshot = snapshot(entry?.putSnapshot) ?? livePut;
    const premium = snapshot(entry?.premium) ?? (optionType === "CALL" ? callSnapshot : optionType === "PUT" ? putSnapshot : null);
    return {
      id: typeof entry?.id === "string" && entry.id ? entry.id : null,
      createdAt: typeof entry?.createdAt === "string" ? entry.createdAt : null,
      expiry: typeof expiry === "string" ? expiry : null,
      strike: number(row?.strike ?? entry?.strike),
      liveCall,
      livePut,
      optionType,
      direction: DIRECTIONS.includes(entry?.direction) ? entry.direction : null,
      lots: number(entry?.lots) ?? 1,
      premium,
      callSnapshot,
      putSnapshot
    };
  }

  function chooseAction(draft, optionType, direction) {
    const quote = optionType === "CALL" ? draft.liveCall : optionType === "PUT" ? draft.livePut : null;
    return {
      ...draft,
      optionType,
      direction,
      premium: quote,
      ...(optionType === "CALL" ? { callSnapshot: quote } : optionType === "PUT" ? { putSnapshot: quote } : {})
    };
  }

  function setLots(draft, lots) {
    return { ...draft, lots: number(lots) };
  }

  function setPremium(draft, premium) {
    const nextPremium = snapshot(premium);
    return {
      ...draft,
      premium: nextPremium,
      ...(draft.optionType === "CALL" ? { callSnapshot: nextPremium } : draft.optionType === "PUT" ? { putSnapshot: nextPremium } : {})
    };
  }

  function validateDraft(draft) {
    const errors = [];
    if (typeof draft?.expiry !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(draft.expiry)) errors.push("expiry");
    if (number(draft?.strike) === null || draft.strike <= 0) errors.push("strike");
    if (!OPTION_TYPES.includes(draft?.optionType)) errors.push("optionType");
    if (!DIRECTIONS.includes(draft?.direction)) errors.push("direction");
    if (!Number.isInteger(draft?.lots) || draft.lots <= 0) errors.push("lots");
    if (snapshot(draft?.premium) === null) errors.push("premium");
    if (snapshot(draft?.callSnapshot) === null) errors.push("callSnapshot");
    if (snapshot(draft?.putSnapshot) === null) errors.push("putSnapshot");
    return { ok: errors.length === 0, errors };
  }

  function entryFromDraft(draft, identity = {}) {
    if (!validateDraft(draft).ok) throw new Error("invalid manual draft");
    const id = typeof identity.id === "string" && identity.id ? identity.id : draft.id;
    const now = identity.now;
    if (typeof id !== "string" || !id || typeof now !== "string" || !now) throw new Error("manual entry identity required");
    return {
      id,
      underlying: "NIFTY",
      expiry: draft.expiry,
      strike: draft.strike,
      optionType: draft.optionType,
      direction: draft.direction,
      lots: draft.lots,
      premium: draft.premium,
      callSnapshot: draft.callSnapshot,
      putSnapshot: draft.putSnapshot,
      createdAt: draft.createdAt || now,
      updatedAt: now
    };
  }

  function previewEntries(saved, draft, identity) {
    const entries = Array.isArray(saved) ? saved.slice() : [];
    if (!validateDraft(draft).ok) return entries;
    const entry = entryFromDraft(draft, identity);
    const index = entries.findIndex((item) => item.id === entry.id);
    if (index === -1) return [...entries, entry];
    return entries.map((item, itemIndex) => itemIndex === index ? entry : item);
  }

  function rowModel({ liveRow, isAtm, entries = [], activeEntryId = null } = {}) {
    const list = (Array.isArray(entries) ? entries : []).filter((entry) => entry?.strike === liveRow?.strike);
    const active = list.find((entry) => entry.id === activeEntryId) || null;
    if (!active) return {
      columns: [`C ${money(liveRow?.call)}`, `P ${money(liveRow?.put)}`, strikeLabel(liveRow?.strike)],
      className: isAtm ? "is-atm" : "",
      count: list.length,
      visibleFaceCount: 1
    };
    const call = `C ${money(active.callSnapshot)}${active.optionType === "CALL" ? ` ×${active.lots}` : ""}`;
    const put = `P ${money(active.putSnapshot)}${active.optionType === "PUT" ? ` ×${active.lots}` : ""}`;
    return {
      columns: [call, put, strikeLabel(active.strike ?? liveRow?.strike)],
      className: `is-manual-entry is-${String(active.direction || "").toLowerCase()}`,
      count: list.length,
      visibleFaceCount: 1
    };
  }

  function editorModel(draft) {
    return {
      typeButtons: ["CALL", "PUT"],
      actions: ["BUY", "SELL"],
      lots: draft?.lots ?? 1,
      premium: money(draft?.premium),
      commitLabel: draft?.id ? "SAVE" : "ADD",
      canRemove: Boolean(draft?.id),
      visibleStrike: null,
      flipIcon: null
    };
  }

  function renderRow(document, element, view) {
    const model = rowModel(view);
    element.classList.remove("is-atm", "is-manual-entry", "is-buy", "is-sell");
    model.className.split(/\s+/).filter(Boolean).forEach((name) => element.classList.add(name));
    const cells = model.columns.map((value) => {
      const cell = document.createElement("span");
      cell.className = "nifty-axis-ladder__cell";
      cell.textContent = value;
      return cell;
    });
    if (model.count > 0) {
      const count = document.createElement("span");
      count.className = "nifty-axis-ladder__count";
      count.textContent = String(model.count);
      cells.push(count);
    }
    element.replaceChildren(...cells);
    return element;
  }

  function invoke(handlers, names, ...args) {
    const handler = names.map((name) => handlers?.[name]).find((value) => typeof value === "function");
    return handler?.(...args);
  }

  function renderEditor(document, draft, handlers = {}) {
    const model = editorModel(draft);
    const editor = document.createElement("div");
    editor.className = "nifty-manual-editor";
    let menu = null;

    function button(label, className, onClick) {
      const element = document.createElement("button");
      element.type = "button";
      element.className = className;
      element.textContent = label;
      element.addEventListener("click", onClick);
      return element;
    }

    function clearMenu() {
      if (!menu) return;
      if (typeof menu.remove === "function") menu.remove();
      else editor.replaceChildren(...editor.children.filter((child) => child !== menu));
      menu = null;
    }

    function toggleMenu(optionType) {
      if (menu?.dataset.optionType === optionType) return clearMenu();
      clearMenu();
      menu = document.createElement("div");
      menu.className = "nifty-manual-editor__actions";
      menu.dataset.optionType = optionType;
      model.actions.forEach((direction) => menu.append(button(direction, "nifty-manual-editor__action", () => {
        invoke(handlers, ["chooseAction", "onChooseAction", "action"], optionType, direction);
        clearMenu();
      })));
      editor.append(menu);
    }

    const call = button("CALL ▾", "nifty-manual-editor__menu", () => toggleMenu("CALL"));
    const put = button("PUT ▾", "nifty-manual-editor__menu", () => toggleMenu("PUT"));
    const decrement = button("−", "nifty-manual-editor__step", () => invoke(handlers, ["setLots", "onSetLots", "lots"], Math.max(1, (number(draft?.lots) || 1) - 1)));
    const lots = document.createElement("span");
    lots.className = "nifty-manual-editor__lots";
    lots.textContent = String(model.lots);
    const increment = button("+", "nifty-manual-editor__step", () => invoke(handlers, ["setLots", "onSetLots", "lots"], (number(draft?.lots) || 0) + 1));
    const premium = document.createElement("input");
    premium.type = "number";
    premium.className = "nifty-manual-editor__premium";
    premium.size = 6;
    premium.value = model.premium === "—" ? "" : model.premium;
    premium.addEventListener("change", () => invoke(handlers, ["setPremium", "onSetPremium", "premium"], number(premium.value)));
    const commit = button(model.commitLabel, "nifty-manual-editor__commit", () => invoke(handlers, ["save", "onSave", "commit"]));
    const controls = [call, put, decrement, lots, increment, premium, commit];
    if (model.canRemove) controls.push(button("REMOVE", "nifty-manual-editor__remove", () => invoke(handlers, ["remove", "onRemove"])));
    controls.push(button("×", "nifty-manual-editor__close", () => invoke(handlers, ["close", "onClose"])));
    editor.append(...controls);
    return editor;
  }

  const api = { createDraft, chooseAction, setLots, setPremium, validateDraft, entryFromDraft, previewEntries, rowModel, editorModel, renderRow, renderEditor };
  root.NiftyManualUi = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
