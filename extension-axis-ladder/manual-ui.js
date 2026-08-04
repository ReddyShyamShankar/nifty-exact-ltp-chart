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

  function word(value) {
    const text = String(value || "").toLowerCase();
    return text ? `${text[0].toUpperCase()}${text.slice(1)}` : "Unknown";
  }

  function savedCountLabel(count) {
    return `${count} saved ${count === 1 ? "entry" : "entries"}`;
  }

  function isIsoDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }

  function isIsoTimestamp(value) {
    if (typeof value !== "string") return false;
    const match = value.match(/^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(Z|([+-])(\d{2}):(\d{2}))$/);
    if (!match || !isIsoDate(match[1])) return false;
    if (match[3] !== "Z") {
      const offsetHours = Number(match[5]);
      const offsetMinutes = Number(match[6]);
      if (offsetHours > 14 || offsetMinutes > 59 || (offsetHours === 14 && offsetMinutes !== 0)) return false;
    }
    return Number.isFinite(Date.parse(value));
  }

  function createDraft({ expiry, row, entry, optionType: requestedOptionType } = {}) {
    const liveCall = snapshot(row?.call);
    const livePut = snapshot(row?.put);
    const editing = Boolean(entry && typeof entry === "object");
    const optionType = OPTION_TYPES.includes(entry?.optionType) ? entry.optionType : null;
    const actionOptionType = optionType || (OPTION_TYPES.includes(requestedOptionType) ? requestedOptionType : "CALL");
    const callSnapshot = editing ? snapshot(entry?.callSnapshot) : liveCall;
    const putSnapshot = editing ? snapshot(entry?.putSnapshot) : livePut;
    const premium = snapshot(entry?.premium) ?? (optionType === "CALL" ? callSnapshot : optionType === "PUT" ? putSnapshot : null);
    return {
      id: typeof entry?.id === "string" && entry.id ? entry.id : null,
      createdAt: isIsoTimestamp(entry?.createdAt) ? entry.createdAt : null,
      expiry: typeof expiry === "string" ? expiry : null,
      strike: number(row?.strike ?? entry?.strike),
      liveCall,
      livePut,
      optionType,
      actionOptionType,
      direction: DIRECTIONS.includes(entry?.direction) ? entry.direction : null,
      lots: number(entry?.lots) ?? 1,
      premium,
      callSnapshot,
      putSnapshot
    };
  }

  function chooseAction(draft, optionType, direction) {
    const quote = optionType === "CALL" ? draft.liveCall : optionType === "PUT" ? draft.livePut : null;
    const changingSavedSide = Boolean(draft.id && draft.optionType && draft.optionType !== optionType);
    return {
      ...draft,
      ...(changingSavedSide ? {
        id: null,
        createdAt: null,
        lots: 1,
        callSnapshot: draft.liveCall,
        putSnapshot: draft.livePut
      } : {}),
      optionType,
      actionOptionType: optionType,
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
    if (!isIsoDate(draft?.expiry)) errors.push("expiry");
    if (number(draft?.strike) === null || draft.strike <= 0) errors.push("strike");
    if (!OPTION_TYPES.includes(draft?.optionType)) errors.push("optionType");
    if (!DIRECTIONS.includes(draft?.direction)) errors.push("direction");
    if (!Number.isInteger(draft?.lots) || draft.lots <= 0) errors.push("lots");
    if (snapshot(draft?.premium) === null) errors.push("premium");
    if (draft?.optionType === "CALL" && snapshot(draft?.callSnapshot) === null) errors.push("callSnapshot");
    if (draft?.optionType === "PUT" && snapshot(draft?.putSnapshot) === null) errors.push("putSnapshot");
    return { ok: errors.length === 0, errors };
  }

  function entryFromDraft(draft, identity = {}) {
    if (!validateDraft(draft).ok) throw new Error("invalid manual draft");
    const id = typeof identity.id === "string" && identity.id ? identity.id : draft.id;
    const now = identity.now;
    if (typeof id !== "string" || !id || !isIsoTimestamp(now)) throw new Error("manual entry identity required");
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
      createdAt: isIsoTimestamp(draft.createdAt) ? draft.createdAt : now,
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

  function lotBadges(entries) {
    return OPTION_TYPES.flatMap((optionType) => ["BUY", "SELL"].flatMap((direction) => {
      const directional = entries.filter((entry) => entry?.optionType === optionType
        && entry?.direction === direction
        && Number.isInteger(entry?.lots)
        && entry.lots > 0);
      const sources = [...new Set(directional.map((entry) =>
        entry?.source === "BROKER_POSITION" ? "BROKER_POSITION" : "MANUAL"))];
      return sources.map((source) => {
        const matching = directional.filter((entry) =>
          (entry?.source === "BROKER_POSITION" ? "BROKER_POSITION" : "MANUAL") === source);
        const lots = matching.reduce((sum, entry) => sum + entry.lots, 0);
        return {
          optionType,
          direction,
          source,
          label: `${optionType[0]}${lots}`,
          entryId: source === "MANUAL" && matching.length === 1 ? matching[0].id : null
        };
      });
    }));
  }

  function compactOpenInterest(value) {
    const numeric = number(value);
    if (!Number.isFinite(numeric) || numeric < 0) return "—";
    if (numeric >= 10000000) return `${(numeric / 10000000).toFixed(numeric >= 100000000 ? 0 : 1).replace(/\.0$/, "")}Cr`;
    if (numeric >= 100000) return `${(numeric / 100000).toFixed(numeric >= 1000000 ? 1 : 2).replace(/\.0+$/, "")}L`;
    if (numeric >= 1000) return `${(numeric / 1000).toFixed(numeric >= 10000 ? 1 : 2).replace(/\.0+$/, "")}K`;
    return String(Math.round(numeric));
  }

  function openInterestBadges(row) {
    return OPTION_TYPES.flatMap((optionType) => {
      const prefix = optionType === "CALL" ? "call" : "put";
      const rank = Number(row?.[`${prefix}OiRank`]);
      const oi = number(row?.[`${prefix}Oi`]);
      if (![1, 2].includes(rank) || !Number.isFinite(oi) || oi <= 0) return [];
      return [{ optionType, label: `${optionType[0]} #${rank} · ${compactOpenInterest(oi)}` }];
    });
  }

  function rowModel({ liveRow, isAtm, entries = [], activeEntryId = null } = {}) {
    const list = (Array.isArray(entries) ? entries : []).filter((entry) => entry?.strike === liveRow?.strike);
    const badges = lotBadges(list.filter((entry) => entry?.source !== "BROKER_POSITION"));
    const oiBadges = openInterestBadges(liveRow);
    const active = list.find((entry) => entry.id === activeEntryId) || null;
    if (!active) return {
      columns: [`C ${money(liveRow?.call)}`, `P ${money(liveRow?.put)}`, strikeLabel(liveRow?.strike)],
      className: isAtm ? "is-atm" : "",
      count: list.length,
      badges,
      oiBadges,
      tradedCellIndex: null,
      accessibleName: `Call ${money(liveRow?.call)}, Put ${money(liveRow?.put)}, strike ${strikeLabel(liveRow?.strike)}, ${savedCountLabel(list.length)}`,
      visibleFaceCount: 1
    };
    const call = `C ${money(active.callSnapshot)}${active.optionType === "CALL" ? ` ×${active.lots}` : ""}`;
    const put = `P ${money(active.putSnapshot)}${active.optionType === "PUT" ? ` ×${active.lots}` : ""}`;
    const activeIndex = list.findIndex((entry) => entry.id === active.id);
    return {
      columns: [call, put, strikeLabel(active.strike ?? liveRow?.strike)],
      className: `is-manual-entry is-${String(active.direction || "").toLowerCase()}`,
      count: list.length,
      badges,
      oiBadges,
      tradedCellIndex: active.optionType === "CALL" ? 0 : active.optionType === "PUT" ? 1 : null,
      accessibleName: `${word(active.direction)} ${word(active.optionType)}, ${active.lots} ${active.lots === 1 ? "lot" : "lots"}, Call snapshot ${money(active.callSnapshot)}, Put snapshot ${money(active.putSnapshot)}, strike ${strikeLabel(active.strike ?? liveRow?.strike)}, saved entry ${activeIndex + 1} of ${list.length}`,
      visibleFaceCount: 1
    };
  }

  function editorModel(draft) {
    const validation = validateDraft(draft);
    const validationLabel = validation.errors.some((error) => ["optionType", "direction"].includes(error))
      ? "CHOOSE BUY / SELL"
      : validation.errors.includes("lots")
        ? "LOTS ≥ 1"
        : validation.errors.some((error) => ["premium", "callSnapshot", "putSnapshot"].includes(error))
          ? "ENTER PREMIUM"
          : validation.ok ? "" : "ENTRY INVALID";
    return {
      actionOptions: DIRECTIONS.map((direction) => ({
        optionType: OPTION_TYPES.includes(draft?.actionOptionType)
          ? draft.actionOptionType
          : OPTION_TYPES.includes(draft?.optionType) ? draft.optionType : "CALL",
        direction
      })),
      lots: draft?.lots ?? 1,
      premium: money(draft?.premium),
      commitLabel: draft?.id ? "SAVE" : "ADD",
      canRemove: Boolean(draft?.id),
      canCommit: validation.ok,
      validationLabel,
      selectedOptionType: draft?.optionType || null,
      selectedDirection: draft?.direction || null,
      visibleStrike: null,
      flipIcon: null
    };
  }

  function renderRow(document, element, view) {
    const model = rowModel(view);
    element.classList.remove("is-atm", "is-manual-entry", "is-buy", "is-sell", "has-lot-badges");
    model.className.split(/\s+/).filter(Boolean).forEach((name) => element.classList.add(name));
    const cells = model.columns.map((value, index) => {
      const strikeFace = index === model.columns.length - 1;
      const cell = document.createElement(strikeFace ? "button" : "span");
      cell.className = "nifty-axis-ladder__cell";
      if (strikeFace) {
        cell.type = "button";
        cell.classList.add("nifty-axis-ladder__strike-face");
        cell.setAttribute("aria-label", `Open ${value} premium history`);
      }
      if (!strikeFace && index < 2) cell.dataset.optionType = OPTION_TYPES[index];
      if (index === model.tradedCellIndex) cell.classList.add("is-traded");
      cell.textContent = value;
      return cell;
    });
    if (model.badges.length) {
      element.classList.add("has-lot-badges");
      const badges = document.createElement("span");
      badges.className = "nifty-axis-ladder__badges";
      model.badges.forEach((modelBadge) => {
        const badge = document.createElement("button");
        badge.type = "button";
        badge.className = `nifty-axis-ladder__badge is-${modelBadge.direction.toLowerCase()}`;
        badge.dataset.optionType = modelBadge.optionType;
        badge.dataset.direction = modelBadge.direction;
        badge.dataset.source = modelBadge.source;
        if (modelBadge.entryId) badge.dataset.entryId = modelBadge.entryId;
        badge.textContent = modelBadge.label;
        badge.setAttribute("aria-label", modelBadge.entryId
          ? `Edit saved ${word(modelBadge.direction)} ${word(modelBadge.optionType)} position`
          : `${modelBadge.source === "BROKER_POSITION" ? "Broker" : "Saved"} ${word(modelBadge.direction)} ${word(modelBadge.optionType)} positions`);
        badges.append(badge);
      });
      cells.unshift(badges);
    }
    if (model.oiBadges.length) {
      const badges = document.createElement("span");
      badges.className = "nifty-axis-ladder__oi-badges";
      model.oiBadges.forEach((modelBadge) => {
        const badge = document.createElement("span");
        const tone = modelBadge.optionType === "CALL" ? "is-call" : "is-put";
        badge.className = `nifty-axis-ladder__oi-badge ${tone}`;
        badge.textContent = modelBadge.label;
        const rank = modelBadge.label.match(/#(\d+)/)?.[1] || "";
        const value = modelBadge.label.split("·")[1]?.trim() || "";
        badge.setAttribute("aria-label", `${word(modelBadge.optionType)} open interest rank ${rank}, ${value} active contracts`);
        badges.append(badge);
      });
      const lotBadgeOffset = model.badges.length ? 1 : 0;
      cells.splice(lotBadgeOffset, 0, badges);
    }
    element.replaceChildren(...cells);
    element.setAttribute("aria-label", model.accessibleName);
    return element;
  }

  function invoke(handlers, names, ...args) {
    const handler = names.map((name) => handlers?.[name]).find((value) => typeof value === "function");
    return handler?.(...args);
  }

  function updateEditorState(editor, draft, { preservePremiumInput = false } = {}) {
    if (!editor) return editor;
    const model = editorModel(draft);
    editor.querySelectorAll?.(".nifty-manual-editor__action").forEach((action) => {
      const selected = action.dataset.optionType === model.selectedOptionType
        && action.dataset.direction === model.selectedDirection;
      action.classList.toggle("is-selected", selected);
      action.setAttribute("aria-pressed", String(selected));
    });
    const lots = editor.querySelector?.(".nifty-manual-editor__lots");
    if (lots) lots.textContent = String(model.lots);
    const premium = editor.querySelector?.(".nifty-manual-editor__premium");
    if (premium) {
      if (!preservePremiumInput) premium.value = model.premium === "—" ? "" : model.premium;
      premium.setAttribute("aria-invalid", String(model.validationLabel === "ENTER PREMIUM"));
    }
    const commit = editor.querySelector?.(".nifty-manual-editor__commit");
    if (commit) commit.disabled = !model.canCommit;
    const validation = editor.querySelector?.(".nifty-manual-editor__validation");
    if (validation) validation.textContent = model.validationLabel;
    return editor;
  }

  function renderEditor(document, draft, handlers = {}) {
    const model = editorModel(draft);
    const editor = document.createElement("div");
    editor.className = "nifty-manual-editor";
    editor.setAttribute("role", "group");
    editor.setAttribute("aria-label", `Manual entry editor for strike ${strikeLabel(draft?.strike)}`);

    function button(label, className, onClick) {
      const element = document.createElement("button");
      element.type = "button";
      element.className = className;
      element.textContent = label;
      element.addEventListener("click", onClick);
      return element;
    }

    const actions = document.createElement("div");
    actions.className = "nifty-manual-editor__direct-actions";
    actions.setAttribute("role", "group");
    actions.setAttribute("aria-label", `${word(model.actionOptions[0].optionType)} direction`);
    model.actionOptions.forEach(({ optionType, direction }) => {
      const action = button(`${direction} ${optionType}`, "nifty-manual-editor__action", () => {
        invoke(handlers, ["chooseAction", "onChooseAction", "action"], optionType, direction);
      });
      const selected = optionType === model.selectedOptionType && direction === model.selectedDirection;
      action.dataset.optionType = optionType;
      action.dataset.direction = direction;
      action.classList.toggle("is-selected", selected);
      action.setAttribute("aria-pressed", String(selected));
      actions.append(action);
    });
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
    premium.setAttribute("aria-label", "Premium");
    premium.setAttribute("aria-invalid", String(model.validationLabel === "ENTER PREMIUM"));
    premium.addEventListener("input", () => invoke(
      handlers,
      ["setPremium", "onSetPremium", "premium"],
      number(premium.value),
      premium
    ));
    const commit = button(model.commitLabel, "nifty-manual-editor__commit", () => invoke(handlers, ["save", "onSave", "commit"]));
    commit.disabled = !model.canCommit;
    const controls = [actions, decrement, lots, increment, premium, commit];
    if (model.canRemove) controls.push(button("REMOVE", "nifty-manual-editor__remove", () => invoke(handlers, ["remove", "onRemove"])));
    const close = button("×", "nifty-manual-editor__close", () => invoke(handlers, ["close", "onClose"]));
    close.setAttribute("aria-label", "Close editor");
    controls.push(close);
    const validation = document.createElement("span");
    validation.className = "nifty-manual-editor__validation";
    validation.setAttribute("role", "status");
    validation.setAttribute("aria-live", "polite");
    validation.textContent = model.validationLabel;
    controls.push(validation);
    editor.append(...controls);
    return editor;
  }

  const api = {
    createDraft,
    chooseAction,
    setLots,
    setPremium,
    validateDraft,
    entryFromDraft,
    previewEntries,
    lotBadges,
    compactOpenInterest,
    openInterestBadges,
    rowModel,
    editorModel,
    renderRow,
    renderEditor,
    updateEditorState
  };
  root.NiftyManualUi = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis === "undefined" ? this : globalThis);
