// Click inline code in assistant output to copy its text, ported from the
// blog's CopyInlineCode.vue. Pure DOM delegation: no services, no settings.

// Everything lives inside the factory so nothing leaks into the page's
// global scope (the compiled output is a classic script, not a module).
window.__ModuleLoader__.load({
  id: '@shellraining/dsh-inline-code-copy',
  factory: () => {
    const PLUGIN_ID = 'dsh-inline-code-copy';
    // Assistant turns are flow items keyed by node kind; this attribute is the
    // stable hook (class names are hashed CSS modules).
    const SCOPE = '[data-chat-flow-kind="assistant-step"]';
    const PULSE_CLASS = 'dsh-inline-code-pulse';
    const PULSE_MS = 420;
    const TOAST_MS = 1200;

    const STYLES = `
    ${SCOPE} :not(pre) > code:not(:has(a, button)) {
      cursor: pointer;
      transition: background-color .2s ease, box-shadow .2s ease;
    }
    ${SCOPE} :not(pre) > code:not(:has(a, button)):hover {
      filter: brightness(.96);
    }
    .${PULSE_CLASS} {
      animation: dsh-inline-code-pulse ${PULSE_MS}ms ease-out;
    }
    @keyframes dsh-inline-code-pulse {
      0% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--dsw-alias-brand-primary, #4d6bfe) 40%, transparent); }
      70% { box-shadow: 0 0 0 6px color-mix(in oklab, var(--dsw-alias-brand-primary, #4d6bfe) 10%, transparent); }
      100% { box-shadow: 0 0 0 12px transparent; }
    }
    [data-inline-code-copy-toast] {
      position: fixed;
      top: 40px;
      left: 50%;
      z-index: 1100;
      transform: translateX(-50%);
      padding: 8px 16px;
      border-radius: var(--dsw-radius-lg, 8px);
      background: var(--dsw-alias-toast-bg, #333);
      color: var(--dsw-alias-toast-label, #fff);
      box-shadow: var(--dsw-shadow-lv3, 0 6px 16px rgba(0, 0, 0, .12));
      font-size: 13px;
      line-height: 20px;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transition: opacity .2s ease;
    }
    [data-inline-code-copy-toast][data-show] { opacity: 1; }
    @media (prefers-reduced-motion: reduce) {
      .${PULSE_CLASS} { animation: none; }
      [data-inline-code-copy-toast] { transition: none; }
    }
    `;

    function inlineCodeOf(target: EventTarget | null): HTMLElement | null {
      if (!(target instanceof Element)) return null;
      // Links and file-mention buttons inside code keep their native click.
      if (target.closest('a, button')) return null;
      const code = target.closest('code');
      if (!(code instanceof HTMLElement) || code.closest('pre')) return null;
      if (!code.closest(SCOPE) || code.querySelector('a, button')) return null;
      return code;
    }

    async function copyText(doc: Document, text: string): Promise<boolean> {
      const win = doc.defaultView;
      if (win?.navigator.clipboard && win.isSecureContext) {
        try {
          await win.navigator.clipboard.writeText(text);
          return true;
        } catch {
          // Fall through: Electron may deny the async API without focus.
        }
      }
      const ta = doc.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      doc.body.append(ta);
      try {
        ta.select();
        return doc.execCommand('copy');
      } catch {
        return false;
      } finally {
        ta.remove();
      }
    }

    function install(doc: Document): () => void {
      const win = doc.defaultView;
      if (!win) return () => {};
      const style = doc.createElement('style');
      style.dataset.plugin = PLUGIN_ID;
      style.textContent = STYLES;
      doc.head.append(style);

      const toast = doc.createElement('div');
      toast.dataset.inlineCodeCopyToast = '';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      doc.body.append(toast);

      let toastTimer: number | undefined;
      const pulses = new Map<HTMLElement, number>();

      const showToast = (message: string) => {
        toast.textContent = message;
        toast.dataset.show = '';
        win.clearTimeout(toastTimer);
        toastTimer = win.setTimeout(() => { delete toast.dataset.show; }, TOAST_MS);
      };

      const pulse = (code: HTMLElement) => {
        win.clearTimeout(pulses.get(code));
        // Restart the animation on repeated clicks.
        code.classList.remove(PULSE_CLASS);
        void code.offsetWidth;
        code.classList.add(PULSE_CLASS);
        pulses.set(code, win.setTimeout(() => {
          code.classList.remove(PULSE_CLASS);
          pulses.delete(code);
        }, PULSE_MS));
      };

      const onClick = (event: MouseEvent) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const code = inlineCodeOf(event.target);
        if (!code) return;
        // Keep drag-to-select usable: a non-empty selection inside the code wins.
        const selection = win.getSelection();
        if (selection && !selection.isCollapsed && code.contains(selection.anchorNode)) return;
        const text = code.textContent ?? '';
        if (!text) return;
        pulse(code);
        void copyText(doc, text).then(ok => showToast(ok ? '已复制' : '复制失败'));
      };

      doc.addEventListener('click', onClick);
      return () => {
        doc.removeEventListener('click', onClick);
        win.clearTimeout(toastTimer);
        for (const [code, timer] of pulses) {
          win.clearTimeout(timer);
          code.classList.remove(PULSE_CLASS);
        }
        pulses.clear();
        toast.remove();
        style.remove();
      };
    }

    return {
      name: PLUGIN_ID,
      inject: [],
      apply(ctx) {
        ctx.effect(() => install(document), 'inline-code-copy: click to copy');
      },
    };
  },
});
