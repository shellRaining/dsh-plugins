import type { Feature } from './feature.ts';

// The shell frame animates its columns with a CSS transition that it turns on
// (data-animating) one React commit after the commit that changes
// grid-template-columns. In 0.2.1-rc.3 the right panel's DockLayout measures
// its panes in a layout effect that runs on every render, between those two
// commits; the forced style pass applies the new columns before the transition
// exists. The left sidebar then always snaps, right-panel toggles often do, and
// the conversation jumps. When a toggle lands without the host transition,
// replay it with the frame's own computed timing; a host transition that did
// start is replaced by the same replay, so every toggle runs one way. Drags,
// viewport solves and the host's instant and fullscreen presentations stay
// unanimated, as in the host.
//
// Each conversation body also publishes its width to its parent from a
// ResizeObserver, and the whole transcript inherits that custom property: on
// every animated frame the host recalculated the style of every message and
// re-wrapped its text, about 40% of the frame's main-thread time in a long
// conversation. During the replay each body carries its final width itself,
// measured before the motion starts, so those writes stop at the body. The
// text takes its final width at once and the column then only moves.
const PROPERTY = 'grid-template-columns';
const STILL = '[data-dragging],[data-rightbar-fullscreen],[data-rightbar-instant]';
const BODY = '[data-conversation-content]';
const COLUMN_WIDTH = '--dsh-conversation-column-width';

type View = Window & typeof globalThis;

/** Split a computed list at top-level commas; easing functions contain commas. */
function items(value: string): string[] {
  const parts: string[] = [];
  let depth = 0, start = 0;
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (char === '(') depth++;
    else if (char === ')') depth--;
    else if (char === ',' && depth === 0) { parts.push(value.slice(start, index).trim()); start = index + 1; }
  }
  parts.push(value.slice(start).trim());
  return parts;
}

const milliseconds = (value: string) => (value.endsWith('ms') ? 1 : 1000) * (parseFloat(value) || 0);

export function createFrameMotion(document: Document, window: View): Feature<boolean> {
  const probe = document.createElement('div');
  const observer = new window.MutationObserver(onChange);
  // Looks for the frame while it is missing, e.g. before the root slot renders.
  const finder = new window.MutationObserver(() => { if (acquire()) finder.disconnect(); });
  let enabled = false;
  let frame: HTMLElement | null = null;
  let replay: Animation | null = null;
  // Bodies holding their final width, with the inline value each had before.
  let pinned: (readonly [body: HTMLElement, value: string, priority: string])[] = [];

  function release() {
    for (const [body, value, priority] of pinned) {
      if (value) body.style.setProperty(COLUMN_WIDTH, value, priority);
      else body.style.removeProperty(COLUMN_WIDTH);
    }
    pinned = [];
  }
  function stop() { replay?.cancel(); replay = null; release(); }
  // Called at the new columns before the replay starts: the reads share one
  // forced layout of the final state, then the writes follow.
  function pin(target: HTMLElement) {
    const widths: (readonly [HTMLElement, number])[] = [];
    for (const body of target.querySelectorAll(BODY)) {
      if (body instanceof window.HTMLElement && body.offsetWidth) widths.push([body, body.offsetWidth]);
    }
    for (const [body, width] of widths) {
      pinned.push([body, body.style.getPropertyValue(COLUMN_WIDTH), body.style.getPropertyPriority(COLUMN_WIDTH)]);
      body.style.setProperty(COLUMN_WIDTH, `${width}px`);
    }
  }
  function acquire(): boolean {
    if (frame?.isConnected) return true;
    stop(); observer.disconnect(); frame = null;
    const candidate = document.querySelector('[data-shell-bottom]')?.parentElement;
    if (!(candidate instanceof window.HTMLElement) || !candidate.querySelector(':scope > [data-rightbar-col]')) return false;
    frame = candidate;
    observer.observe(frame, { attributes: true, attributeOldValue: true, attributeFilter: ['style', 'data-animating', 'data-dragging'] });
    return true;
  }
  // The frame's declared transition for its columns, which the host turns off
  // for reduced motion; null when it would not animate.
  function timing(target: HTMLElement): KeyframeAnimationOptions | null {
    const css = window.getComputedStyle(target);
    const index = items(css.transitionProperty).findIndex(name => name === PROPERTY || name === 'all');
    if (index < 0) return null;
    const at = (value: string) => { const list = items(value); return list[index % list.length] ?? ''; };
    const duration = milliseconds(at(css.transitionDuration));
    return duration > 0 ? { duration, delay: milliseconds(at(css.transitionDelay)), easing: at(css.transitionTimingFunction) || 'ease' } : null;
  }
  function onChange(records: MutationRecord[]) {
    const target = frame;
    if (!enabled || !target) return;
    if (target.matches(STILL)) return stop();
    // The first style record holds the columns from before this commit batch.
    const change = records.find(record => record.attributeName === 'style');
    if (!change) return;
    probe.setAttribute('style', change.oldValue ?? '');
    const from = probe.style.gridTemplateColumns, to = target.style.gridTemplateColumns;
    if (!from || !to || from === to) return;
    stop();
    if (!target.hasAttribute('data-animating')) return;
    // Reading computed style starts a host transition that survived the
    // commit; cancel it so that the replay below runs in its place.
    const options = timing(target);
    if (!options) return;
    for (const animation of target.getAnimations()) {
      if (animation instanceof window.CSSTransition && animation.transitionProperty === PROPERTY) animation.cancel();
    }
    pin(target);
    const current = target.animate([{ gridTemplateColumns: from }, { gridTemplateColumns: to }], options);
    current.addEventListener('finish', () => { if (replay === current) { replay = null; release(); } });
    replay = current;
  }
  // Toggles follow input; re-find a frame the host replaced since.
  function ensure() {
    if (acquire()) finder.disconnect();
    else finder.observe(document.body, { childList: true, subtree: true });
  }
  const onInput = () => { if (!frame?.isConnected) ensure(); };
  const LISTENERS = ['pointerdown', 'keydown'] as const;

  function update(next: boolean) {
    if (next === enabled) return;
    enabled = next;
    for (const type of LISTENERS) {
      if (enabled) document.addEventListener(type, onInput, { capture: true, passive: true });
      else document.removeEventListener(type, onInput, { capture: true });
    }
    if (enabled) return ensure();
    stop(); observer.disconnect(); finder.disconnect(); frame = null;
  }
  return { update, dispose() { update(false); } };
}
