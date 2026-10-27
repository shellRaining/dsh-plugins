// Generated from TypeScript by pnpm run build.
window.__ModuleLoader__.load({
  id: "@shellraining/dsh-sidebar-session-preview",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.ts
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(client_exports);
var SESSION_ROW = '[data-row-key^="session:"]';
var ROW = ':is([data-row-key^="session:"], [data-row-key^="workspace:"])';
var OVERLAY = '[role="menu"], [role="dialog"], [role="alertdialog"], [aria-modal="true"]';
var CSS = `
/* rc.3 adapter: the second direct span is the title. No hashed class names. */
body[data-session-preview] ${SESSION_ROW} > span:nth-of-type(2) {
  overflow: clip !important;
  text-overflow: ellipsis !important;
  white-space: nowrap;
  mask-image: none !important;
}
[data-session-preview-card] {
  position: fixed;
  z-index: 100;
  box-sizing: border-box;
  width: min(340px, calc(100vw - 24px));
  max-height: calc(100vh - 24px);
  overflow: auto;
  padding: 12px 16px;
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-2));
  backdrop-filter: var(--dsw-menu-backdrop-filter, none);
  color: var(--dsw-alias-label-primary);
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l2);
  box-shadow: var(--dsw-elevation-panel);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  user-select: text;
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);
  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);
}
[data-session-preview-card][hidden], [data-session-preview-card] [hidden] { display: none; }
[data-sidebar-preview-path] { margin-top: 8px; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--dsw-alias-label-secondary); }
[data-sidebar-preview-copy] { margin-top: 8px; padding: 4px 8px; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-sm); background: transparent; color: inherit; font: inherit; cursor: pointer; }
[data-sidebar-preview-copy]:hover { background: var(--dsw-alias-interactive-bg-hover); }
[data-sidebar-preview-copy]:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
[data-session-preview-title] {
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  font-weight: 500;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
[data-session-preview-times] { display: grid; gap: 4px; margin: 10px 0 0; }
[data-session-preview-times] > div { display: grid; grid-template-columns: auto 1fr; gap: 12px; }
[data-session-preview-times] dt { color: var(--dsw-alias-label-tertiary); }
[data-session-preview-times] dd { margin: 0; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
`;
function validTime(value) {
  return typeof value === "number" && value > 0 && Number.isFinite(new Date(value).getTime());
}
function install(document2, sessions, workspaces) {
  const win = document2.defaultView;
  const style = document2.createElement("style");
  style.dataset.plugin = "dsh-sidebar-session-preview";
  style.textContent = CSS;
  document2.head.append(style);
  document2.body.setAttribute("data-session-preview", "");
  const card = document2.createElement("section");
  card.dataset.sessionPreviewCard = "";
  card.setAttribute("role", "region");
  card.setAttribute("aria-label", "会话预览");
  card.hidden = true;
  const title = document2.createElement("div");
  title.dataset.sessionPreviewTitle = "";
  const times = document2.createElement("dl");
  times.dataset.sessionPreviewTimes = "";
  const path = document2.createElement("div");
  path.dataset.sidebarPreviewPath = "";
  path.hidden = true;
  const copy = document2.createElement("button");
  copy.type = "button";
  copy.dataset.sidebarPreviewCopy = "";
  copy.textContent = "复制路径";
  copy.hidden = true;
  const status = document2.createElement("span");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  card.append(title, path, copy, status, times);
  document2.body.append(card);
  const formatter = new Intl.DateTimeFormat(document2.documentElement.lang || "zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  let active = null;
  let openTimer;
  let closeTimer;
  let unsubscribe;
  let disposed = false;
  let activeKey;
  let copyVersion = 0;
  let observer;
  const nativeTargets = /* @__PURE__ */ new Set();
  const forwarded = /* @__PURE__ */ new WeakSet();
  const cleanup = [];
  const listen = (target, type, handler, options) => {
    const settings = { capture: options === true };
    target.addEventListener(type, handler, settings);
    cleanup.push(() => target.removeEventListener(type, handler, settings));
  };
  const rowOf = (target) => {
    if (!(target instanceof win.Element)) return null;
    const row = target.closest(ROW);
    if (row) return row;
    return target.tagName === "SPAN" ? target.querySelector(`:scope > ${ROW}`) : null;
  };
  const blocked = () => document2.querySelector(OVERLAY) !== null;
  const insideCard = (target) => target instanceof win.Node && card.contains(target);
  function forwardBoundary(event) {
    event.stopPropagation();
    const replacement = new win.PointerEvent(event.type, {
      bubbles: true,
      cancelable: event.cancelable,
      composed: event.composed,
      relatedTarget: null,
      view: win,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      isPrimary: event.isPrimary,
      button: event.button,
      buttons: event.buttons,
      clientX: event.clientX,
      clientY: event.clientY,
      screenX: event.screenX,
      screenY: event.screenY,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey
    });
    forwarded.add(replacement);
    event.target.dispatchEvent(replacement);
  }
  function observe() {
    observer.observe(document2.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["role", "aria-modal", "data-row-key"] });
  }
  function releaseNative() {
    const targets = [...nativeTargets];
    nativeTargets.clear();
    for (const target of targets) {
      if (!target.isConnected) continue;
      const event = new win.PointerEvent("pointerout", { bubbles: true, relatedTarget: null, pointerType: "mouse" });
      forwarded.add(event);
      target.dispatchEvent(event);
    }
    if (!active) observer.disconnect();
  }
  function nativeAnchor(target) {
    const row = rowOf(target);
    if (!row) return null;
    return row.parentElement?.tagName === "SPAN" ? row.parentElement : row;
  }
  function yieldToOverlay(event) {
    close();
    for (const target of [event.target, event.relatedTarget]) {
      const anchor = nativeAnchor(target);
      if (anchor) nativeTargets.add(anchor);
    }
    if (nativeTargets.size) observe();
    else observer.disconnect();
  }
  const cancelClose = () => {
    win.clearTimeout(closeTimer);
  };
  function close() {
    win.clearTimeout(openTimer);
    cancelClose();
    unsubscribe?.();
    unsubscribe = void 0;
    if (!nativeTargets.size) observer?.disconnect();
    copyVersion += 1;
    copy.disabled = false;
    status.textContent = "";
    card.hidden = true;
    active = null;
    activeKey = void 0;
  }
  function position() {
    if (!active?.isConnected || active.dataset.rowKey !== activeKey) return close();
    const anchor = active.getBoundingClientRect();
    const rect = card.getBoundingClientRect();
    const margin = 12;
    let left = anchor.right + 8;
    if (left + rect.width > win.innerWidth - margin) left = anchor.left - rect.width - 8;
    card.style.left = `${Math.max(margin, Math.min(left, win.innerWidth - rect.width - margin))}px`;
    card.style.top = `${Math.max(margin, Math.min(anchor.top, win.innerHeight - rect.height - margin))}px`;
  }
  function render() {
    if (!active?.isConnected || active.dataset.rowKey !== activeKey) return close();
    if (blocked()) return close();
    const workspace = activeKey.startsWith("workspace:");
    const id = activeKey.slice(workspace ? "workspace:".length : "session:".length);
    const row = workspace ? workspaces.list.getSnapshot().items.find((item) => item.workspaceId === id) : sessions.list.getSnapshot().byId[id];
    if (!row || !workspace && row.blank) return close();
    card.setAttribute("aria-label", workspace ? "文件夹预览" : "会话预览");
    title.textContent = row.title || !workspace && row.displayTitle || (workspace ? "未命名文件夹" : "未命名会话");
    const nextPath = workspace && typeof row.path === "string" ? row.path : "";
    if (path.textContent !== nextPath) {
      copyVersion += 1;
      copy.disabled = false;
      status.textContent = "";
      path.textContent = nextPath;
    }
    path.hidden = copy.hidden = !nextPath;
    times.replaceChildren();
    const dates = workspace ? [["创建时间", Date.parse(row.createdAt)]] : [["创建时间", row.createdAt], ["最近活动", row.updatedAt]];
    for (const [label, value] of dates) {
      if (!validTime(value)) continue;
      const line = document2.createElement("div");
      const dt = document2.createElement("dt");
      const dd = document2.createElement("dd");
      const time = document2.createElement("time");
      dt.textContent = label;
      time.dateTime = new Date(value).toISOString();
      time.textContent = formatter.format(value);
      dd.append(time);
      line.append(dt, dd);
      times.append(line);
    }
    times.hidden = !times.childElementCount;
    if (!card.hidden) position();
  }
  function enter(row) {
    cancelClose();
    if (active === row && activeKey === row.dataset.rowKey) return;
    close();
    active = row;
    activeKey = row.dataset.rowKey;
    observe();
    openTimer = win.setTimeout(() => {
      if (disposed || active !== row || !row.isConnected || blocked()) return close();
      render();
      if (!active) return;
      card.hidden = false;
      position();
      unsubscribe = (activeKey.startsWith("workspace:") ? workspaces : sessions).list.subscribe(render);
    }, 350);
  }
  const leave = () => {
    if (card.hidden) return close();
    win.clearTimeout(openTimer);
    cancelClose();
    closeTimer = win.setTimeout(close, 160);
  };
  observer = new win.MutationObserver(() => {
    const overlay = blocked();
    for (const target of nativeTargets) if (!target.isConnected) nativeTargets.delete(target);
    if (nativeTargets.size && !overlay) releaseNative();
    if (!active && !nativeTargets.size) observer.disconnect();
    if (active && (!active.isConnected || active.dataset.rowKey !== activeKey || overlay)) close();
  });
  listen(document2, "pointerover", (event) => {
    if (forwarded.has(event)) return;
    const row = rowOf(event.target);
    if (!row && !rowOf(event.relatedTarget) && !active && !nativeTargets.size) return;
    if (blocked()) {
      yieldToOverlay(event);
      return;
    }
    if (nativeTargets.size) releaseNative();
    if (!row) {
      if (rowOf(event.relatedTarget) && event.pointerType !== "touch") forwardBoundary(event);
      return;
    }
    event.stopPropagation();
    if (event.pointerType === "touch" || event.buttons) {
      close();
      return;
    }
    enter(row);
  }, true);
  listen(document2, "pointerout", (event) => {
    if (forwarded.has(event)) return;
    const row = rowOf(event.target);
    if (!row && !rowOf(event.relatedTarget) && !active && !nativeTargets.size) return;
    if (blocked()) {
      yieldToOverlay(event);
      return;
    }
    if (nativeTargets.size) releaseNative();
    if (!row) {
      if (rowOf(event.relatedTarget) && event.pointerType !== "touch") forwardBoundary(event);
      return;
    }
    event.stopPropagation();
    if (rowOf(event.relatedTarget) === row) return;
    if (insideCard(event.relatedTarget)) {
      cancelClose();
      return;
    }
    leave();
  }, true);
  listen(copy, "click", async () => {
    const text = path.textContent;
    if (!text || copy.disabled) return;
    const version = ++copyVersion;
    copy.disabled = true;
    status.textContent = "";
    let ok = false;
    try {
      if (win.navigator.clipboard?.writeText) {
        await win.navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {
    }
    if (disposed || version !== copyVersion) return;
    if (!ok && typeof document2.execCommand === "function") {
      const input = document2.createElement("textarea");
      input.value = text;
      input.setAttribute("readonly", "");
      input.style.cssText = "position:fixed;left:-9999px;top:0";
      card.append(input);
      try {
        input.select();
        ok = document2.execCommand("copy");
      } catch {
      } finally {
        input.remove();
        if (!disposed && version === copyVersion) {
          copy.disabled = false;
          copy.focus({ preventScroll: true });
        }
      }
    }
    if (disposed || version !== copyVersion) return;
    copy.disabled = false;
    status.textContent = ok ? " 已复制" : " 复制失败，请手动选择路径";
  });
  listen(card, "pointerenter", cancelClose);
  listen(card, "pointerleave", leave);
  listen(document2, "pointerdown", (event) => {
    if (!card.contains(event.target)) close();
  }, true);
  listen(document2, "contextmenu", close, true);
  listen(document2, "dragstart", close, true);
  listen(document2, "pointercancel", close, true);
  listen(document2, "pointerout", (event) => {
    if (!forwarded.has(event) && !event.relatedTarget) close();
  }, true);
  listen(document2, "keydown", (event) => {
    if (event.key === "Escape") close();
  }, true);
  listen(document2, "scroll", (event) => {
    if (!card.contains(event.target)) close();
  }, true);
  listen(win, "resize", close);
  listen(win, "blur", close);
  listen(document2, "visibilitychange", () => {
    if (document2.hidden) close();
  });
  return () => {
    disposed = true;
    releaseNative();
    close();
    observer.disconnect();
    for (const off of cleanup) off();
    card.remove();
    style.remove();
    document2.body.removeAttribute("data-session-preview");
  };
}
var name = "dsh-sidebar-session-preview";
var inject = ["sessions", "workspaces"];
function apply(ctx) {
  ctx.effect(() => install(document, ctx.get("sessions"), ctx.get("workspaces")), "sidebar-session-preview: hover");
}

    return module.exports;
  }
});
