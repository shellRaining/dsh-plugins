export interface CardAnchor { range: Range | null; x: number; y: number }

// A single, bounded card. Only its live Range is measured during scroll; no text search.
export function floatingCard(host: HTMLElement, close: () => void) {
  let anchor: CardAnchor | null = null;
  let frame = 0;
  let events: AbortController | null = null;
  const position = () => {
    frame = 0;
    if (!anchor || host.hidden) return;
    let { x, y } = anchor;
    if (anchor.range) {
      if (!anchor.range.endContainer.isConnected) { close(); return; }
      const caret = anchor.range.cloneRange();
      caret.collapse(false);
      let rect = caret.getBoundingClientRect();
      if (!rect.height || rect.bottom < 48 || rect.top > window.innerHeight) {
        caret.setStart(anchor.range.startContainer, anchor.range.startOffset);
        caret.collapse(true);
        rect = caret.getBoundingClientRect();
      }
      if (!rect.height || rect.bottom < 48 || rect.top > window.innerHeight) { close(); return; }
      x = rect.right; y = rect.bottom;
    }
    const width = host.offsetWidth;
    const height = host.offsetHeight;
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, x + 8));
    const below = y + 8;
    const top = Math.max(48, Math.min(window.innerHeight - height - 8,
      below + height <= window.innerHeight - 8 ? below : y - height - 24));
    host.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(position); };
  const observer = new ResizeObserver(schedule);
  const hide = () => {
    host.hidden = true;
    anchor = null;
    events?.abort(); events = null;
    observer.disconnect();
    cancelAnimationFrame(frame); frame = 0;
  };
  return {
    show(next: CardAnchor) {
      anchor = next;
      host.hidden = false;
      if (!events) {
        events = new AbortController();
        const signal = events.signal;
        document.addEventListener('scroll', event => {
          if (event.target instanceof Node && host.contains(event.target)) return;
          schedule();
        }, { capture: true, passive: true, signal });
        window.addEventListener('resize', schedule, { passive: true, signal });
        document.addEventListener('pointerdown', event => {
          const target = event.target;
          if (target instanceof Element && !host.contains(target) && !target.closest('[data-local-annotation-toolbar]')) close();
        }, { capture: true, signal });
        document.addEventListener('keydown', event => {
          if (event.key === 'Escape' && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); close(); }
        }, { signal });
        observer.observe(host);
      }
      schedule();
    },
    hide,
    dispose: hide,
  };
}
