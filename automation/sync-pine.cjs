#!/usr/bin/env node

const PORT = Number(process.env.TRADINGVIEW_CDP_PORT || 9222);
const BRIDGE = process.env.NIFTY_BRIDGE_URL || "http://127.0.0.1:8787";

let nextId = 0;
let socket;
const pending = new Map();

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function send(method, params = {}) {
  const id = ++nextId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function connect(url) {
  socket = new WebSocket(url);
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const job = pending.get(message.id);
    if (!job) return;
    pending.delete(message.id);
    if (message.error) job.reject(new Error(message.error.message)); else job.resolve(message.result);
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
}

async function evaluate(expression, awaitPromise = true) {
  const result = await send("Runtime.evaluate", { expression, awaitPromise, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
  return result.result?.value;
}

async function tree() {
  return (await send("DOM.getDocument", { depth: -1, pierce: true })).root;
}

function attrs(node) {
  const values = {};
  for (let i = 0; i < (node.attributes || []).length; i += 2) values[node.attributes[i]] = node.attributes[i + 1];
  return values;
}

function text(node) {
  return node.nodeName === "#text" ? node.nodeValue || "" : (node.childNodes || []).map(text).join("");
}

function normalize(value) {
  return value.replace(/[−–—]/g, "-").replace(/\s+/g, " ").trim();
}

function walk(node, visit, parent = null) {
  visit(node, parent);
  for (const child of node.childNodes || []) walk(child, visit, node);
  for (const shadow of node.shadowRoots || []) walk(shadow, visit, node);
}

function descendants(node) {
  const result = [];
  walk(node, (child) => result.push(child));
  return result;
}

function findLabel(root, value) {
  const wanted = normalize(value);
  return descendants(root).find((node) => node.nodeName !== "#text" && normalize(text(node)) === wanted);
}

function isControl(node) {
  const a = attrs(node);
  return ["INPUT", "TEXTAREA", "BUTTON"].includes(node.nodeName)
    || ["button", "combobox", "textbox"].includes(a.role)
    || a.contenteditable === "true";
}

function parentIndex(root) {
  const parents = new Map();
  walk(root, (node, parent) => { if (parent) parents.set(node.nodeId, parent); });
  return parents;
}

function rowFor(root, label, parents) {
  let node = findLabel(root, label);
  for (let depth = 0; node && depth < 8; depth += 1, node = parents.get(node.nodeId)) {
    if (descendants(node).some(isControl)) return node;
  }
  return null;
}

async function box(nodeId) {
  try { return (await send("DOM.getBoxModel", { nodeId })).model?.content; } catch { return null; }
}

async function frontendNode(backendDOMNodeId) {
  const result = await send("DOM.pushNodesByBackendIdsToFrontend", { backendNodeIds: [backendDOMNodeId] });
  return result.nodeIds?.[0];
}

function axName(node) { return node.name?.value || ""; }
function axRole(node) { return node.role?.value || ""; }

async function axEditButton(label) {
  const nodes = (await send("Accessibility.getFullAXTree")).nodes || [];
  const wanted = normalize(label);
  const labelNode = nodes.find((node) => normalize(axName(node)) === wanted && node.backendDOMNodeId);
  if (!labelNode) return null;
  const labelId = await frontendNode(labelNode.backendDOMNodeId);
  const labelBox = await box(labelId);
  if (!labelBox) return null;
  const labelX = (labelBox[0] + labelBox[2] + labelBox[4] + labelBox[6]) / 4;
  const labelY = (labelBox[1] + labelBox[3] + labelBox[5] + labelBox[7]) / 4;
  const candidates = [];
  for (const node of nodes.filter((entry) => axRole(entry) === "button" && entry.backendDOMNodeId)) {
    const nodeId = await frontendNode(node.backendDOMNodeId);
    const content = await box(nodeId);
    if (!content) continue;
    const x = (content[0] + content[2] + content[4] + content[6]) / 4;
    const y = (content[1] + content[3] + content[5] + content[7]) / 4;
    if (x > labelX && Math.abs(y - labelY) < 45) candidates.push({ nodeId, distance: x - labelX });
  }
  return candidates.sort((a, b) => a.distance - b.distance)[0]?.nodeId || null;
}

async function axEditor(before) {
  const nodes = (await send("Accessibility.getFullAXTree")).nodes || [];
  for (const node of nodes.filter((entry) => ["textbox", "combobox", "searchbox"].includes(axRole(entry)) && entry.backendDOMNodeId && !before.has(entry.backendDOMNodeId))) {
    const nodeId = await frontendNode(node.backendDOMNodeId);
    if (await box(nodeId)) return nodeId;
  }
  return null;
}

async function axEditorIds() {
  const nodes = (await send("Accessibility.getFullAXTree")).nodes || [];
  return new Set(nodes.filter((node) => ["textbox", "combobox", "searchbox"].includes(axRole(node)) && node.backendDOMNodeId).map((node) => node.backendDOMNodeId));
}

async function click(nodeId) {
  const content = await box(nodeId);
  if (!content?.length) return false;
  const xs = content.filter((_, i) => i % 2 === 0);
  const ys = content.filter((_, i) => i % 2 === 1);
  const x = xs.reduce((a, b) => a + b, 0) / xs.length;
  const y = ys.reduce((a, b) => a + b, 0) / ys.length;
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  return true;
}

async function setValue(nodeId, value) {
  const resolved = await send("DOM.resolveNode", { nodeId });
  const objectId = resolved.object.objectId;
  await send("Runtime.callFunctionOn", {
    objectId,
    functionDeclaration: `(value) => {
      const node = this;
      if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
        const proto = node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(node, value);
      } else if (node.isContentEditable) node.textContent = value;
      else throw new Error("Unsupported Pine editor");
      node.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
      node.dispatchEvent(new Event("change", { bubbles: true }));
      node.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
      node.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
    }`, arguments: [{ value }]
  });
}

async function main() {
  const version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
  const pages = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = pages.find((entry) => /tradingview\.com\/chart/i.test(entry.url));
  if (!page) throw new Error("No TradingView chart tab found.");
  await connect(page.webSocketDebuggerUrl);
  const chainResponse = await fetch(`${BRIDGE}/api/nifty-chain`);
  const chain = await chainResponse.json();
  if (!chainResponse.ok || !Array.isArray(chain.rows)) {
    throw new Error(chain.error || `Bridge returned invalid chain response (${chainResponse.status}).`);
  }
  const rows = chain.rows.filter((row) => Math.abs(row.strike - chain.atm) <= 100).sort((a, b) => a.strike - b.strike).slice(-5);
  if (rows.length !== 5) throw new Error(`Expected 5 option rows, received ${rows.length}.`);
  for (let i = 0; i < rows.length; i += 1) {
    const offset = i - 2;
    for (const [side, symbol] of [["Call", rows[i].callSymbol], ["Put", rows[i].putSymbol]]) {
      const root = await tree();
      const row = rowFor(root, `Strike ${offset >= 0 ? "+" : ""}${offset} ${side}`, parentIndex(root));
      const label = `Strike ${offset >= 0 ? "+" : ""}${offset} ${side}`;
      let editNodeId;
      if (!row) {
        const info = await evaluate(`JSON.stringify({ href: location.href, title: document.title, hasLabel: document.body.innerText.includes(${JSON.stringify(`Strike ${offset >= 0 ? "+" : ""}${offset} ${side}`)}), hasSettings: /Inputs.*Style.*Visibility/s.test(document.body.innerText) })`);
        editNodeId = await axEditButton(label);
        if (!editNodeId) throw new Error(`Pine row not found: ${label}. Page: ${info}`);
      }
      if (!editNodeId) {
        const controls = descendants(row).filter(isControl);
        const edit = controls.find((node) => /edit|pencil|symbol/i.test(`${attrs(node).aria-label || ""} ${attrs(node).title || ""}`)) || controls.find((node) => attrs(node).role === "button" || node.nodeName === "BUTTON");
        editNodeId = edit?.nodeId;
      }
      const beforeEditors = await axEditorIds();
      if (!editNodeId || !(await click(editNodeId))) throw new Error(`Pencil not found: ${label}`);
      await sleep(250);
      const after = await tree();
      const editor = await axEditor(beforeEditors) || descendants(after).find((node) => isControl(node) && ["INPUT", "TEXTAREA"].includes(node.nodeName));
      if (!editor) throw new Error(`Symbol editor not found: Strike ${offset} ${side}`);
      await setValue(editor.nodeId, symbol);
      await sleep(150);
    }
  }
  const finalTree = await tree();
  const apply = descendants(finalTree).find((node) => /^(apply|ok|done)$/i.test(text(node).trim()) && isControl(node));
  if (!apply || !(await click(apply.nodeId))) throw new Error("Apply button not found.");
  console.log(`Synced ${rows.length * 2} Pine fields for expiry ${chain.expiry}.`);
  socket.close();
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
