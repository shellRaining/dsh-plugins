import { NO_REVEAL_ATTRIBUTE, POPUP_ATTRIBUTE } from './contract.ts';
import type { Feature } from './feature.ts';
import { createStyleSheet } from './style.ts';
import { COMPOSER_CARD, COMPOSER_INPUT } from './composer.ts';
import type { HostModules } from './host/modules.ts';
import { createPressLight, PRESS_CSS, PRESS_RADIUS, type PressLight } from './press.ts';
import { ACTION_TARGETS, actionSelector } from './interaction.ts';
import { insideProjection, pressGeometry } from './press-geometry.ts';

// Resolve real controls at the pointer, not component names or whole DOM lists.
// Host nodes/pseudo-elements/event handlers stay untouched, including titlebar
// drag regions whose attribute mutations are monitored by the desktop host.
const REVEAL_FIELDS = 'input:not([type="hidden"]):not([type="file"]):not([type="range"]):not([type="color"]),textarea,select,[role="textbox"],[role="searchbox"],[role="combobox"],[contenteditable="true"]';
export const REVEAL_TARGETS = `${ACTION_TARGETS},${REVEAL_FIELDS}`;
const REVEAL_LAYERS = `[${POPUP_ATTRIBUTE}],[data-menu-material],[role="menu"],[role="dialog"],[role="alertdialog"],[role="listbox"],[role="tooltip"],[data-composer-overlay],[data-dockkit-float],[style*="--dsh-hover-preview-fade"]`;
// Opted out by other plugins (contract.ts), or not a live control.
const REVEAL_EXCLUDED = `[${NO_REVEAL_ATTRIBUTE}],[hidden],[inert],[aria-hidden="true"],[data-closing],[data-acrylic-ghost],[data-acrylic-reveal],[data-width-handle],[data-dockkit-divider],[data-dockkit-float-resize],.monaco-editor,.xterm`;
export const REVEAL_CSS = `
[data-acrylic-reveal] { --reveal-rgb:255 255 255;position:fixed;pointer-events:none;z-index:var(--reveal-z,0);box-sizing:border-box;border:1px solid transparent;border-radius:var(--reveal-radius,2px);background:radial-gradient(72px circle at var(--reveal-x) var(--reveal-y),rgb(var(--reveal-rgb) / var(--reveal-surface)),transparent) padding-box; }
[data-acrylic-reveal]::before { content:'';position:absolute;inset:-1px;border-radius:inherit;padding:1px;background:radial-gradient(80px circle at var(--reveal-x) var(--reveal-y),rgb(var(--reveal-rgb) / var(--reveal-border)),transparent);mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);mask-composite:exclude; }
body:not([data-ds-dark-theme]) [data-acrylic-reveal] { --reveal-rgb:0 0 0; }
${PRESS_CSS}
@media (prefers-reduced-motion:reduce),(forced-colors:active) { [data-acrylic-reveal]{display:none} }
`;

type Box = Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom'>;

export function revealStrength(x: number, y: number, rect: Box): number {
  const dx = Math.max(rect.left - x, 0, x - rect.right);
  const dy = Math.max(rect.top - y, 0, y - rect.bottom);
  return Math.max(0, 1 - Math.hypot(dx, dy) / 64);
}

interface Ancestor { clipsX: boolean; clipsY: boolean; opacity: number; z: number; context: boolean; bounds: DOMRect | null }
interface Row { target: Element; rect: DOMRect; strength: number; borderOnly: boolean; z: number; hover: boolean; radius: string; clip: string; projection: ReturnType<typeof pressGeometry> }

/** Reveal is a Win10 feature with a refresh hook for popups that settle without pointer movement. */
export interface Reveal extends Feature<boolean> {
  refresh(): void;
  /** Redraw after button geometry changes, within the same animation frame. */
  sync(): void;
}

export function createReveal(document: Document, window: Window & typeof globalThis, modules: HostModules): Reveal {
  const media = [window.matchMedia('(prefers-reduced-motion: reduce)'), window.matchMedia('(forced-colors: active)'), window.matchMedia('(hover: hover) and (pointer: fine)')];
  let requested = false, running = false, disposed = false, frame = 0;
  let point: { x: number; y: number } | null = null;
  let press: { target: Element; pointerId: number; released: boolean; light: PressLight | null } | null = null;
  function cancelPress() { press?.light?.dispose(); press = null; }
  // Host components without semantic anchors, resolved when their modules
  // load (host/modules.ts). The turn rail's 2px marks sit in 28x10 hit areas
  // next to a pointer-transparent preview: an outline, not a Win10 control
  // surface, so it never lights and hovering it lights nothing nearby.
  let controls = REVEAL_TARGETS, quiet: string | null = null;
  let surfaces = COMPOSER_CARD;
  function resolve() {
    controls = `${actionSelector(modules)},${REVEAL_FIELDS}`;
    const bubble = modules.select('userBubble');
    surfaces = `${COMPOSER_CARD},[data-testid="todo-panel"],[data-side-chat] .dsc-bubble:not([data-pending])${bubble ? `,:is([data-chat-flow-kind="user"],[data-chat-flow-kind="steering"]) ${bubble}` : ''}`;
    quiet = modules.select('turnRail');
  }
  const borderOnly = (target: Element) => target.matches(`${REVEAL_FIELDS},${surfaces}`);
  resolve();
  const unsubscribe = modules.subscribe(() => { resolve(); schedule(); });
  const overlays = new Map<Element, HTMLDivElement>();
  const portals = new Set<Element>();
  const portalSelector = `[${POPUP_ATTRIBUTE}],[role="tooltip"],[role="dialog"],[role="alertdialog"],[data-menu-material],[style*="--dsh-hover-preview-fade"]`;
  const activeObserver = new window.MutationObserver(() => schedule());
  const sizes = new window.ResizeObserver(() => schedule());
  function watchActive() {
    activeObserver.disconnect(); sizes.disconnect();
    const seen = new Set<Element>();
    for (const target of overlays.keys()) {
      sizes.observe(target);
      for (let node: Element | null = target; node && node !== document.body; node = node.parentElement) {
        if (seen.has(node)) break;
        seen.add(node);
        activeObserver.observe(node, { attributes: true, childList: true, attributeFilter: ['disabled','aria-disabled','aria-hidden','aria-invalid','hidden','inert','class','style','data-closing'] });
      }
    }
  }
  const sheet = createStyleSheet(document, 'dsh-acrylic-wallpaper-reveal', REVEAL_CSS);
  function clear() {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0; point = null; cancelPress();
    activeObserver.disconnect(); sizes.disconnect();
    for (const node of overlays.values()) node.remove();
    overlays.clear();
  }
  function control(node: Element | null): Element | null {
    // Icons commonly carry aria-hidden=true inside a valid button; check the
    // resolved control's ancestors below, not the decorative event target.
    if (!node || node.closest(`[${NO_REVEAL_ATTRIBUTE}],[hidden],[inert],[data-closing],[data-acrylic-ghost],.monaco-editor,.xterm`) || (quiet && node.closest(quiet))) return null;
    const editor = node.closest(COMPOSER_INPUT);
    if (editor) return editor.closest(COMPOSER_CARD);
    const target = node.closest(controls);
    // TodoPanel's header is inset by body padding; its visual surface is the
    // enclosing card, not that inner button. Keep this decoration border-only
    // and leave the host's click/focus targets and expanded list untouched.
    const todo = node.closest('[data-testid="todo-panel"]');
    if (todo && (!target || target.matches('[data-testid="todo-panel"] > div > button[aria-expanded]'))) return todo;
    if (target) return target;
    const labelControl = node.closest('label')?.control;
    if (labelControl?.matches('input:is([type="checkbox"],[type="radio"])')) return labelControl;
    return node.closest(surfaces);
  }
  function layer(node: Element | null | undefined): Element { return node?.closest(REVEAL_LAYERS) ?? document.body; }
  // Nine candidate samples, followed by bounded visibility probes, independent
  // of history/list length. The innermost
  // control wins over its containing tree row or tab; content cards may add an
  // independent border, never a fill across their text.
  function candidates(x: number, y: number, hit: Element | null): Set<Element> {
    const targets = new Set<Element>(), surface = layer(hit), direct = control(hit);
    if (direct) targets.add(direct);
    const content = hit?.closest(surfaces);
    if (content && layer(content) === surface) targets.add(content);
    // Retain the last few targets through the full proximity falloff, so
    // leaving a narrow button/card does not abruptly lose its sampled edge.
    for (const target of overlays.keys()) if (target.isConnected && layer(target) === surface) targets.add(target);
    for (const dx of [0, -48, 48]) for (const dy of [0, -48, 48]) {
      const node = dx || dy ? document.elementFromPoint(x + dx, y + dy) : hit;
      if (!node || layer(node) !== surface) continue;
      const target = control(node);
      if (target && !(direct && target !== direct && target.contains(direct))) targets.add(target);
    }
    for (const target of targets) {
      if (target === direct || target.matches(surfaces)) continue;
      if (direct && !direct.matches(surfaces) && (target.contains(direct) || direct.contains(target))) targets.delete(target);
      else if ([...targets].some(other => other !== target && target.contains(other))) targets.delete(target);
    }
    return targets;
  }
  function draw() {
    frame = 0;
    if (!point || !running || document.hidden) return clear();
    const { x, y } = point;
    const hit = document.elementFromPoint(x, y);
    if (press && (!press.target.isConnected || control(hit) !== press.target || borderOnly(press.target))) cancelPress();
    const rows: Row[] = [], ancestors = new Map<Element, Ancestor>();
    // Lights are appended to body, outside the target's stacking context.
    // Even a small popup missed by the visibility probes must block them;
    // pointer-transparent tooltips cannot be found by hit testing at all.
    const blockers: DOMRect[] = [];
    for (const portal of portals) {
      if (!portal.isConnected) { portals.delete(portal); continue; }
      if (portal.contains(hit) || portal.closest('[hidden]')) continue;
      const css = window.getComputedStyle(portal);
      if (css.visibility === 'hidden' || css.display === 'none' || Number(css.opacity) === 0) continue;
      blockers.push(portal.getBoundingClientRect());
    }
    function geometry(element: Element): Ancestor {
      const known = ancestors.get(element);
      if (known) return known;
      {
        const css = window.getComputedStyle(element);
        const clipsX = /(auto|scroll|hidden|clip)/.test(css.overflowX);
        const clipsY = /(auto|scroll|hidden|clip)/.test(css.overflowY);
        const entry: Ancestor = { clipsX, clipsY, opacity: Number(css.opacity), z: css.zIndex === 'auto' ? 0 : Number(css.zIndex), context: css.zIndex !== 'auto' || Number(css.opacity) < 1 || css.transform !== 'none' || css.scale !== 'none' || css.rotate !== 'none' || css.translate !== 'none' || css.filter !== 'none' || css.backdropFilter !== 'none' || css.isolation === 'isolate' || /(paint|layout|strict|content)/.test(css.contain) || css.position === 'fixed' || css.position === 'sticky', bounds: clipsX || clipsY ? element.getBoundingClientRect() : null };
        ancestors.set(element, entry);
        return entry;
      }
    }
    let inspected = 0;
    const found = quiet && hit?.closest(quiet) ? [] : candidates(x, y, hit);
    for (const target of found) {
      if (rows.length >= 4 || inspected++ >= 10) break;
      if (!target.isConnected || insideProjection(target) || target.matches(':disabled,[aria-disabled="true"],[aria-invalid="true"],[readonly]') || target.closest(REVEAL_EXCLUDED)) continue;
      const rect = target.getBoundingClientRect();
      if (!rect.width || !rect.height || rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) continue;
      const strength = revealStrength(x, y, rect);
      if (!strength) continue;
      const computed = window.getComputedStyle(target);
      if (computed.visibility !== 'visible' || computed.pointerEvents === 'none') continue;
      let opacity = Number(computed.opacity), z = computed.zIndex === 'auto' ? 0 : Number(computed.zIndex);
      // Paint only the light's local footprint, not a screen-sized editor/row.
      const footprint = press?.target === target ? PRESS_RADIUS + 2 : 84;
      let left = Math.max(0, rect.left, x - footprint), top = Math.max(0, rect.top, y - footprint);
      let right = Math.min(window.innerWidth, rect.right, x + footprint), bottom = Math.min(window.innerHeight, rect.bottom, y + footprint);
      for (let parent = target.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        const { clipsX, clipsY, bounds, opacity: alpha, context, z: parentZ } = geometry(parent);
        opacity *= alpha;
        if (context) z = parentZ;
        if (bounds && clipsX) { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right); }
        if (bounds && clipsY) { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); }
      }
      if (opacity < .99 || right <= left || bottom <= top) continue;
      if (blockers.some(rect => rect.width && rect.height && rect.left < right && rect.right > left && rect.top < bottom && rect.bottom > top)) continue;
      const owns = (px: number, py: number) => {
        const probe = document.elementFromPoint(px, py);
        return (probe === target || target.contains(probe)) && layer(probe) === layer(target);
      };
      if (!owns(Math.max(left + .5, Math.min(right - .5, x)), Math.max(top + .5, Math.min(bottom - .5, y)))) continue;
      const radius = computed.borderTopLeftRadius.includes('%') ? Math.min(rect.width, rect.height) / 2 : parseFloat(computed.borderTopLeftRadius) || 0;
      const inset = Math.min(Math.max(6, radius * .4), (right - left) / 2, (bottom - top) / 2);
      const probes: [number, number][] = [[left + inset, top + inset], [right - inset, top + inset], [left + inset, bottom - inset], [right - inset, bottom - inset], [(left + right) / 2, (top + bottom) / 2]];
      if (!probes.every(([px, py]) => owns(px, py))) continue;
      // Multiline inline file links are real buttons too; their union box may
      // cover unrelated prose. Keep the host's underline rather than light it.
      if (computed.display === 'inline' && target.getClientRects().length > 1) continue;
      const projection = pressGeometry(target, rect);
      // Perspective turns a rectangle into a quadrilateral. Map viewport clip
      // corners back through the same homography instead of outlining its AABB.
      const polygon = projection ? [[left,top],[right,top],[right,bottom],[left,bottom]].map(([px = 0,py = 0]) => {
        const local = projection.local(px, py); return `${local.x}px ${local.y}px`;
      }).join(',') : null;
      rows.push({ target, rect, strength, borderOnly: borderOnly(target), z, hover: hit === target || target.contains(hit), radius: computed.borderRadius, projection, clip: polygon ? `polygon(${polygon})` : `inset(${top - rect.top}px ${rect.right - right}px ${rect.bottom - bottom}px ${left - rect.left}px)` });
    }
    // Batch geometry reads above, then overlay writes. No host style mutation.
    const active = new Set(rows.map(row => row.target));
    if (press && !active.has(press.target)) cancelPress();
    const changed = active.size !== overlays.size || [...active].some(target => !overlays.has(target));
    for (const [target, node] of overlays) if (!active.has(target)) { node.remove(); overlays.delete(target); }
    for (const { target, rect, strength, hover, borderOnly, radius, clip, z, projection } of rows) {
      let node = overlays.get(target);
      if (!node) { node = document.createElement('div'); node.setAttribute('data-acrylic-reveal', ''); node.setAttribute('aria-hidden', 'true'); document.body.append(node); overlays.set(target, node); }
      const box = projection ?? rect;
      const local = projection?.local(x, y) ?? { x: x - rect.left, y: y - rect.top };
      Object.assign(node.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`, clipPath: clip, transform: projection?.transform ?? 'none', transformOrigin: '50% 50%' });
      node.style.setProperty('--reveal-z', String(z));
      node.style.setProperty('--reveal-radius', radius);
      node.style.setProperty('--reveal-x', `${local.x}px`);
      node.style.setProperty('--reveal-y', `${local.y}px`);
      node.style.setProperty('--reveal-border', String(strength * (borderOnly ? .48 : .38)));
      node.style.setProperty('--reveal-surface', String(!borderOnly && hover ? .045 : 0));
      const current = press;
      if (current?.target === target && !current.light) {
        current.light = createPressLight(document, window, node, () => {
          if (press !== current) return;
          press = null; schedule();
        });
        if (current.released) current.light.release();
      }
    }
    if (changed) watchActive();
  }
  function schedule() { if (running && point && !frame) frame = window.requestAnimationFrame(draw); }
  function pointer(event: PointerEvent) {
    if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return clear();
    if (!event.isPrimary || (press && press.pointerId !== event.pointerId)) return;
    point = { x: event.clientX, y: event.clientY };
    const target = control(document.elementFromPoint(point.x, point.y));
    if (press && target !== press.target) cancelPress();
    if (event.type === 'pointerdown') {
      cancelPress();
      if (event.button === 0 && target && !borderOnly(target)) {
        press = { target, pointerId: event.pointerId, released: false, light: null };
      }
    } else if (press && !press.released && !(event.buttons & 1)) {
      press.released = true;
      press.light?.release();
    }
    schedule();
  }
  function leave(event: PointerEvent) {
    if (!event.relatedTarget) return clear();
    if (press && event.pointerId === press.pointerId) {
      const next = event.relatedTarget instanceof window.Element ? event.relatedTarget : null;
      if (control(next) !== press.target) { cancelPress(); schedule(); }
    }
  }
  function lostCapture(event: PointerEvent) {
    // Normal pointerup also releases host capture. Let its release light finish;
    // only losing capture while still held is an interruption.
    if (press?.pointerId === event.pointerId && !press.released) { cancelPress(); schedule(); }
  }
  function collectPortals(root: Element): boolean {
    let found = false;
    if (root.matches(portalSelector)) { portals.add(root); found = true; }
    for (const node of root.querySelectorAll(portalSelector)) { portals.add(node); found = true; }
    return found;
  }
  const observer = new window.MutationObserver(records => {
    let dirty = false;
    for (const record of records) {
      const target = record.target;
      // These renderers churn through rows/text continuously and cannot host
      // reveal controls. Skip their batches before any descendant queries.
      if (!(target instanceof window.Element) || target.closest('.xterm,.monaco-editor,[data-acrylic-reveal]')) continue;
      if (record.type === 'attributes') {
        const known = portals.delete(target);
        const matches = target.matches(portalSelector);
        if (matches) portals.add(target);
        if (known || matches || [...portals].some(portal => target.contains(portal))) dirty = true;
        continue;
      }
      if (target.closest(portalSelector)) dirty = true;
      for (const node of record.removedNodes) if (node instanceof window.Element && !node.hasAttribute('data-acrylic-reveal')) {
        for (const portal of portals) if (node.contains(portal)) { portals.delete(portal); dirty = true; }
        if ([...overlays.keys()].some(control => node.contains(control))) dirty = true;
      }
      for (const node of record.addedNodes) if (node instanceof window.Element && !node.matches('[data-acrylic-reveal],.xterm,.monaco-editor')) {
        if (collectPortals(node)) dirty = true;
      }
    }
    if (dirty) schedule();
  });
  function reconcile() {
    const [reduced, forced, fine] = media.map(query => query.matches);
    const next = !disposed && requested && !reduced && !forced && Boolean(fine);
    if (next === running) return;
    running = next;
    const method = next ? 'addEventListener' : 'removeEventListener';
    const on = (target: EventTarget, type: string, listener: EventListener, capture = false) => target[method](type, listener, capture);
    for (const type of ['pointermove', 'pointerdown', 'pointerup']) on(document, type, pointer as EventListener, true);
    on(document, 'pointerout', leave as EventListener, true);
    on(document, 'pointercancel', clear, true);
    on(document, 'lostpointercapture', lostCapture as EventListener, true);
    on(document, 'keydown', clear, true);
    on(document, 'dragstart', clear, true);
    on(document, 'scroll', schedule, true);
    // Refresh once when an entering surface settles; never track its frames.
    on(document, 'animationend', schedule, true);
    on(document, 'transitionend', schedule, true);
    on(document, 'visibilitychange', clear);
    on(window, 'blur', clear); on(window, 'resize', schedule);
    if (next) {
      sheet.toggle(true);
      collectPortals(document.body);
      // React can mount a dialog inside an existing portal wrapper (annotation
      // cards also reuse a hidden wrapper). Observe insertion and visibility,
      // not style: our own per-frame light writes must not schedule more frames.
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'inert', 'aria-hidden', 'role', POPUP_ATTRIBUTE] });
    } else { observer.disconnect(); portals.clear(); sheet.toggle(false); clear(); }
  }
  media.forEach(query => query.addEventListener('change', reconcile));
  return {
    update(enabled) { requested = enabled; reconcile(); },
    // Entering popups settle without pointer movement; redraw once they stop.
    refresh: schedule,
    sync() {
      if (!running || !point) return;
      if (frame) window.cancelAnimationFrame(frame);
      draw();
    },
    dispose() { disposed = true; unsubscribe(); reconcile(); media.forEach(query => query.removeEventListener('change', reconcile)); sheet.dispose(); },
  };
}
