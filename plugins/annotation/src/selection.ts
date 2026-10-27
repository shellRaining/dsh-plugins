import { capture, sourceOf } from './anchors.ts';
import type { Annotation } from './model.ts';

export function installSelection(
  current: () => string | undefined,
  onSelect: (item: Annotation, range: Range) => void,
  onError: (error: unknown) => void,
): { hide(): void; dispose(): void } {
  const events = new AbortController();
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = '批注';
  button.title = '批注所选文字';
  const toolbar = document.createElement('div');
  toolbar.dataset.localAnnotationToolbar = '';
  toolbar.hidden = true;
  toolbar.append(button);
  document.body.append(toolbar); // Bounded toolbar only; no fullscreen portal/backdrop.
  let pointerDown = false;
  let composing = false;
  let frame = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let range: Range | null = null;
  let sessionId: string | undefined;
  let scrollEvents: AbortController | null = null;
  const hide = () => {
    toolbar.hidden = true;
    range = null;
    sessionId = undefined;
    scrollEvents?.abort();
    scrollEvents = null;
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    frame = 0;
  };
  const show = () => {
    frame = 0;
    if (pointerDown || composing) return;
    const selection = window.getSelection();
    const id = current();
    if (!id || !selection?.rangeCount || selection.isCollapsed) { hide(); return; }
    const selected = selection.getRangeAt(0);
    const start = sourceOf(selected.startContainer, id);
    const end = sourceOf(selected.endContainer, id);
    if (!start || !end || start.root !== end.root) { hide(); return; }
    hide();
    // Measure one caret, not every rectangle of a long selection.
    const caret = document.createRange();
    if (!selection.focusNode) return;
    caret.setStart(selection.focusNode, selection.focusOffset);
    caret.collapse(true);
    const rect = caret.getBoundingClientRect();
    if (!rect.height || rect.bottom < 40 || rect.top > window.innerHeight) return;
    range = selected.cloneRange();
    sessionId = id;
    toolbar.style.left = `${Math.max(8, Math.min(window.innerWidth - 80, rect.right + 8))}px`;
    toolbar.style.top = `${Math.max(48, Math.min(window.innerHeight - 44, rect.bottom + 6))}px`;
    toolbar.hidden = false;
    // Listen only while visible. A scroll closes the toolbar; no layout read/write loop.
    scrollEvents = new AbortController();
    document.addEventListener('scroll', hide, { capture: true, passive: true, signal: scrollEvents.signal });
    window.addEventListener('resize', hide, { passive: true, signal: scrollEvents.signal });
  };
  const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(show); };
  const signal = events.signal;
  document.addEventListener('pointerdown', event => {
    if (toolbar.contains(event.target as Node)) return;
    pointerDown = true;
    hide();
  }, { capture: true, signal });
  document.addEventListener('pointerup', () => { pointerDown = false; schedule(); }, { signal });
  document.addEventListener('pointercancel', () => { pointerDown = false; hide(); }, { signal });
  document.addEventListener('selectionchange', () => {
    if (pointerDown || composing || toolbar.contains(document.activeElement)) return;
    hide();
    timer = setTimeout(schedule, 120); // Keyboard selection settles once; no text reads while dragging.
  }, { signal });
  document.addEventListener('compositionstart', () => { composing = true; hide(); }, { signal });
  document.addEventListener('compositionend', () => { composing = false; }, { signal });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); }, { signal });
  window.addEventListener('blur', () => { pointerDown = false; hide(); }, { signal });
  toolbar.addEventListener('pointerdown', event => event.preventDefault(), { signal });

  button.addEventListener('click', () => {
    if (!range || !sessionId || current() !== sessionId || !range.startContainer.isConnected) { hide(); return; }
    try {
      const selected = range.cloneRange();
      const item = capture(selected, sessionId);
      hide();
      if (!item) throw new Error('这段选区无法批注，请只选择同一条回复或同一个文件里的正文。');
      window.getSelection()?.removeAllRanges();
      onSelect(item, selected);
    } catch (error) { hide(); onError(error); }
  }, { signal });
  return { hide, dispose() { hide(); events.abort(); toolbar.remove(); } };
}
