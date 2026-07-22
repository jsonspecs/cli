"use strict";

/** Рендерит нативные RC.5 when-выражения для текстовых и HTML-представлений Studio. */

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripLeadingIf(text) {
  return String(text || "").replace(/^если\s+/i, "").trim();
}

function renderWhenText(expr, renderLeaf, opts) {
  const options = Object.assign({ joinAll: " и ", joinAny: " или ", wrapGroups: true, stripLeadingIf: false }, opts || {});

  function leafText(ref) {
    const raw = renderLeaf(ref);
    return options.stripLeadingIf ? stripLeadingIf(raw) : raw;
  }

  function walk(node, isRoot) {
    if (typeof node === "string") return leafText(node);
    if (!node || typeof node !== "object") return "";
    if (Object.prototype.hasOwnProperty.call(node, "not")) return `не (${walk(node.not, false)})`;
    const mode = Object.prototype.hasOwnProperty.call(node, "any") ? "any" : "all";
    const parts = (node[mode] || []).map((item) => walk(item, false)).filter(Boolean);
    if (parts.length === 0) return "";
    const body = parts.join(mode === "any" ? options.joinAny : options.joinAll);
    if (!options.wrapGroups || isRoot || parts.length === 1) return body;
    return `(${body})`;
  }

  return walk(expr, true);
}

function renderWhenTreeHtml(expr, renderLeafHtml, opts) {
  const options = Object.assign({
    className: "when-tree",
    labelAll: "Все условия",
    labelAny: "Любое из условий",
    labelNot: "Условие не выполнено",
    rootPrefixAll: "Выполнены все эти условия",
    rootPrefixAny: "Выполнено одно из этих условий",
  }, opts || {});

  function walk(node, depth) {
    if (typeof node === "string") {
      return `<li class="${options.className}__item ${options.className}__item--leaf"><div class="${options.className}__leaf">${renderLeafHtml(node)}</div></li>`;
    }
    if (!node || typeof node !== "object") return "";

    const mode = Object.prototype.hasOwnProperty.call(node, "not")
      ? "not"
      : Object.prototype.hasOwnProperty.call(node, "any") ? "any" : "all";
    const items = mode === "not" ? [node.not] : (node[mode] || []);
    if (depth === 0 && mode !== "not" && items.length === 1) return walk(items[0], depth);

    const labels = { all: options.labelAll, any: options.labelAny, not: options.labelNot };
    const rootLabels = { all: options.rootPrefixAll, any: options.rootPrefixAny, not: options.labelNot };
    const inner = items.map((item) => walk(item, depth + 1)).join("");
    const title = depth === 0 ? rootLabels[mode] : labels[mode];
    const badge = depth === 0 ? "" : `<div class="${options.className}__badge ${options.className}__badge--${mode}">${mode.toUpperCase()}</div>`;
    return [
      `<li class="${options.className}__item ${options.className}__item--group ${options.className}__item--group-${mode}">`,
      `<div class="${options.className}__group">`,
      `<div class="${options.className}__group-head">${badge}<div class="${options.className}__label">${escapeHtml(title)}</div></div>`,
      `<ul class="${options.className}__children">${inner}</ul>`,
      "</div>",
      "</li>",
    ].join("");
  }

  return `<ul class="${options.className} ${options.className}--root">${walk(expr, 0)}</ul>`;
}

function collectWhenLeafIds(expr, out = []) {
  if (typeof expr === "string") {
    out.push(expr);
    return out;
  }
  if (!expr || typeof expr !== "object") return out;
  if (Object.prototype.hasOwnProperty.call(expr, "not")) return collectWhenLeafIds(expr.not, out);
  const items = Object.prototype.hasOwnProperty.call(expr, "any") ? expr.any : expr.all;
  for (const item of items || []) collectWhenLeafIds(item, out);
  return out;
}

module.exports = { escapeHtml, stripLeadingIf, renderWhenText, renderWhenTreeHtml, collectWhenLeafIds };
