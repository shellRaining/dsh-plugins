window.__ModuleLoader__.load({
  id: 'dsh-sidebar-session-preview',
  factory: () => {
    const SESSION_ROW = '[data-row-key^="session:"]';
    const ROW = ':is([data-row-key^="session:"], [data-row-key^="workspace:"])';
    const OVERLAY = '[role="menu"], [role="dialog"], [role="alertdialog"], [aria-modal="true"]';
    const CSS = `
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
      return typeof value === 'number' && value > 0 && Number.isFinite(new Date(value).getTime());
    }

    function install(document, sessions, workspaces) {
      const win = document.defaultView;
      const style = document.createElement('style');
      style.dataset.plugin = 'dsh-sidebar-session-preview';
      style.textContent = CSS;
      document.head.append(style);
      document.body.setAttribute('data-session-preview', '');
      const card = document.createElement('section');
      card.dataset.sessionPreviewCard = '';
      card.setAttribute('role', 'region');
      card.setAttribute('aria-label', '会话预览');
      card.hidden = true;
      const title = document.createElement('div');
      title.dataset.sessionPreviewTitle = '';
      const times = document.createElement('dl');
      times.dataset.sessionPreviewTimes = '';
      const path = document.createElement('div');
      path.dataset.sidebarPreviewPath = '';
      path.hidden = true;
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.dataset.sidebarPreviewCopy = '';
      copy.textContent = '复制路径';
      copy.hidden = true;
      const status = document.createElement('span');
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      card.append(title, path, copy, status, times);
      document.body.append(card);
      const formatter = new Intl.DateTimeFormat(document.documentElement.lang || 'zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      });
      let active = null;
      let openTimer;
      let closeTimer;
      let unsubscribe;
      let disposed = false;
      let activeKey;
      let copyVersion = 0;
      let observer;
      const nativeTargets = new Set();
      const forwarded = new WeakSet();
      const cleanup = [];
      const listen = (target, type, handler, options) => {
        const settings = { capture: options === true };
        target.addEventListener(type, handler, settings);
        cleanup.push(() => target.removeEventListener(type, handler, settings));
      };
      const rowOf = target => {
        if (!(target instanceof win.Element)) return null;
        const row = target.closest(ROW);
        if (row) return row;
        // rc.3 HoverCard wraps its anchor in a direct span. Its padding/gaps
        // must be owned too, otherwise entering the wrapper starts native hover.
        return target.tagName === 'SPAN' ? target.querySelector(`:scope > ${ROW}`) : null;
      };
      const blocked = () => document.querySelector(OVERLAY) !== null;
      const insideCard = target => target instanceof win.Node && card.contains(target);
      // React synthesizes BOTH ends from pointerout. Forward only the unowned
      // side at a boundary, rather than swallowing another component's leave.
      // This rc.3 adapter can produce extra ancestor enter/leave; overlays are
      // deliberately left to React so portalled menus keep their own lifecycle.
      function forwardBoundary(event) {
        event.stopPropagation();
        const replacement = new win.PointerEvent(event.type, {
          bubbles: true, cancelable: event.cancelable, composed: event.composed,
          relatedTarget: null, view: win,
          pointerId: event.pointerId, pointerType: event.pointerType, isPrimary: event.isPrimary,
          button: event.button, buttons: event.buttons,
          clientX: event.clientX, clientY: event.clientY, screenX: event.screenX, screenY: event.screenY,
          altKey: event.altKey, ctrlKey: event.ctrlKey, shiftKey: event.shiftKey, metaKey: event.metaKey,
        });
        forwarded.add(replacement);
        event.target.dispatchEvent(replacement);
      }
      function observe() {
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['role', 'aria-modal', 'data-row-key'] });
      }
      function releaseNative() {
        const targets = [...nativeTargets];
        nativeTargets.clear();
        for (const target of targets) {
          if (!target.isConnected) continue;
          const event = new win.PointerEvent('pointerout', { bubbles: true, relatedTarget: null, pointerType: 'mouse' });
          forwarded.add(event);
          target.dispatchEvent(event);
        }
        if (!active) observer.disconnect();
      }
      function nativeAnchor(target) {
        const row = rowOf(target);
        if (!row) return null;
        return row.parentElement?.tagName === 'SPAN' ? row.parentElement : row;
      }
      function yieldToOverlay(event) {
        close();
        // Remember hover allowed through during an overlay. When it closes,
        // cancel that native timer/card BEFORE we resume swallowing row events.
        // A native card is portalled but still belongs to its React wrapper.
        // Keep all touched wrappers until the overlay ends, even after DOM out.
        for (const target of [event.target, event.relatedTarget]) {
          const anchor = nativeAnchor(target);
          if (anchor) nativeTargets.add(anchor);
        }
        if (nativeTargets.size) observe();
        else observer.disconnect();
      }
      const cancelClose = () => { win.clearTimeout(closeTimer); };
      function close() {
        win.clearTimeout(openTimer);
        cancelClose();
        unsubscribe?.();
        unsubscribe = undefined;
        if (!nativeTargets.size) observer?.disconnect();
        copyVersion += 1;
        copy.disabled = false;
        status.textContent = '';
        card.hidden = true;
        active = null;
        activeKey = undefined;
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
        const workspace = activeKey.startsWith('workspace:');
        const id = activeKey.slice(workspace ? 'workspace:'.length : 'session:'.length);
        const row = workspace
          ? workspaces.list.getSnapshot().items.find(item => item.workspaceId === id)
          : sessions.list.getSnapshot().byId[id];
        // The ungrouped bucket (workspace:) has no workspace record or preview.
        if (!row || (!workspace && row.blank)) return close();
        card.setAttribute('aria-label', workspace ? '文件夹预览' : '会话预览');
        title.textContent = row.title || (!workspace && row.displayTitle) || (workspace ? '未命名文件夹' : '未命名会话');
        const nextPath = workspace && typeof row.path === 'string' ? row.path : '';
        if (path.textContent !== nextPath) {
          copyVersion += 1;
          copy.disabled = false;
          status.textContent = '';
          path.textContent = nextPath;
        }
        path.hidden = copy.hidden = !nextPath;
        times.replaceChildren();
        // Session list snapshots currently omit createdAt; never infer it.
        const dates = workspace
          ? [['创建时间', Date.parse(row.createdAt)]]
          : [['创建时间', row.createdAt], ['最近活动', row.updatedAt]];
        for (const [label, value] of dates) {
          if (!validTime(value)) continue;
          const line = document.createElement('div');
          const dt = document.createElement('dt');
          const dd = document.createElement('dd');
          const time = document.createElement('time');
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
        // Observe only while a preview is pending/open; never scan mutations.
        observe();
        openTimer = win.setTimeout(() => {
          if (disposed || active !== row || !row.isConnected || blocked()) return close();
          render();
          if (!active) return;
          card.hidden = false;
          position();
          unsubscribe = (activeKey.startsWith('workspace:') ? workspaces : sessions).list.subscribe(render);
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
      // Own both row types, including their native HoverCard wrapper. Never
      // intercept clicks, drag events, or an open menu/dialog's portal events.
      listen(document, 'pointerover', event => {
        if (forwarded.has(event)) return;
        const row = rowOf(event.target);
        if (!row && !rowOf(event.relatedTarget) && !active && !nativeTargets.size) return;
        if (blocked()) { yieldToOverlay(event); return; }
        if (nativeTargets.size) releaseNative();
        if (!row) {
          if (rowOf(event.relatedTarget) && event.pointerType !== 'touch') forwardBoundary(event);
          return;
        }
        event.stopPropagation();
        if (event.pointerType === 'touch' || event.buttons) { close(); return; }
        enter(row);
      }, true);
      listen(document, 'pointerout', event => {
        if (forwarded.has(event)) return;
        const row = rowOf(event.target);
        if (!row && !rowOf(event.relatedTarget) && !active && !nativeTargets.size) return;
        if (blocked()) { yieldToOverlay(event); return; }
        if (nativeTargets.size) releaseNative();
        if (!row) {
          if (rowOf(event.relatedTarget) && event.pointerType !== 'touch') forwardBoundary(event);
          return;
        }
        event.stopPropagation();
        if (rowOf(event.relatedTarget) === row) return;
        if (insideCard(event.relatedTarget)) { cancelClose(); return; }
        leave();
      }, true);
      listen(copy, 'click', async () => {
        const text = path.textContent;
        if (!text || copy.disabled) return;
        const version = ++copyVersion;
        copy.disabled = true;
        status.textContent = '';
        let ok = false;
        try {
          if (win.navigator.clipboard?.writeText) {
            await win.navigator.clipboard.writeText(text);
            ok = true;
          }
        } catch { /* Use the user-initiated legacy fallback below. */ }
        if (disposed || version !== copyVersion) return;
        if (!ok && typeof document.execCommand === 'function') {
          const input = document.createElement('textarea');
          input.value = text;
          input.setAttribute('readonly', '');
          input.style.cssText = 'position:fixed;left:-9999px;top:0';
          card.append(input);
          try { input.select(); ok = document.execCommand('copy'); }
          catch { /* Report failure without claiming a successful copy. */ }
          finally {
            input.remove();
            if (!disposed && version === copyVersion) {
              copy.disabled = false;
              copy.focus({ preventScroll: true });
            }
          }
        }
        if (disposed || version !== copyVersion) return;
        copy.disabled = false;
        status.textContent = ok ? ' 已复制' : ' 复制失败，请手动选择路径';
      });
      listen(card, 'pointerenter', cancelClose);
      listen(card, 'pointerleave', leave);
      listen(document, 'pointerdown', event => { if (!card.contains(event.target)) close(); }, true);
      listen(document, 'contextmenu', close, true);
      listen(document, 'dragstart', close, true);
      listen(document, 'pointercancel', close, true);
      listen(document, 'pointerout', event => { if (!forwarded.has(event) && !event.relatedTarget) close(); }, true);
      listen(document, 'keydown', event => { if (event.key === 'Escape') close(); }, true);
      listen(document, 'scroll', event => { if (!card.contains(event.target)) close(); }, true);
      listen(win, 'resize', close);
      listen(win, 'blur', close);
      listen(document, 'visibilitychange', () => { if (document.hidden) close(); });
      return () => {
        disposed = true;
        releaseNative();
        close();
        observer.disconnect();
        for (const off of cleanup) off();
        card.remove();
        style.remove();
        document.body.removeAttribute('data-session-preview');
      };
    }
    return {
      name: 'dsh-sidebar-session-preview',
      inject: ['sessions', 'workspaces'],
      apply(ctx) {
        ctx.effect(() => install(document, ctx.get('sessions'), ctx.get('workspaces')), 'sidebar-session-preview: hover');
      },
    };
  },
});
