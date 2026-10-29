import { POPUP_ATTRIBUTE } from './contract.ts';
import type { Feature } from './feature.ts';
import { createStyleSheet } from './style.ts';

// Win10-style popup motion. Host popups mount and unmount without phases, so:
// - Enter: a CSS hold keeps each new popup transparent for its first frame;
//   its animationstart event hands over to Web Animations that slide it away
//   from the trigger (flyouts), zoom it in (modal dialogs) or fade (tooltips).
// - Exit: a removed popup is replaced in its old parent by an inert clone that
//   host code cannot find and that keeps the popup's last computed look,
//   which plays the exit and removes itself.
// Popups with an acrylic layer fade that layer and their content separately:
// opacity < 1 on an ancestor is a backdrop root and would drop the blur.
const HOLD = 'acrylic-popup-hold';
export const POPUP_SELECTOR = [
  '[data-menu-material]', // MenuSurface: menus, pickers, command lists, dock tab menus
  'body > [role="presentation"]:has(> [role="dialog"][aria-modal="true"])', // modals
  'body > :is([role="dialog"], [role="menu"], [role="listbox"]):not([aria-modal="true"])', // portaled panels
  'body > div[style*="--dsh-hover-preview-fade"]', // HoverCard
  'body > ul', 'body > div:has(> [role="tree"])', // portaled catalogs without a popup role
  '[role="tooltip"]',
  '[data-session-preview-card]',
  `[${POPUP_ATTRIBUTE}]`, // self-drawn popups that opt in (contract.ts)
].join(',');
const MOTION = Object.freeze({
  enter: 'cubic-bezier(.1, .9, .2, 1)', // Fluent decelerate
  exit: 'cubic-bezier(.4, 0, 1, 1)', // Fluent accelerate
  slide: 250, fade: 167, leave: 120, tooltipIn: 120, tooltipOut: 83, dialogOut: 167,
});
// Clones skip media and large trees: iframes and webviews would reload.
const GHOST_SKIP = 'iframe, webview, video, audio, object, embed, canvas';
const GHOST_MAX_NODES = 1500;
// Removed before insertion: no stylesheet selects them, and they would act on
// insertion (focus, forms and radio groups, popovers, window drag regions) or
// answer host id lookups.
const GHOST_DETACH = /^(?:id|autofocus|popover|name|for|form|aria-(?:activedescendant|controls|owns)|data-(?:modal-autofocus|shortcut-modal|window-drag(?:-recall)?|element-id|plugin-package|team-panel))$/;
// Removed after insertion, once their styling is pinned: host code queries them
// document-wide (the modal stack and shortcut context match [role="menu"] and
// aria-modal; pane, composer and rightbar lookups), yet stylesheets select them.
// Other roles stay: menus style rows and tooltips by role.
const isHook = ({ name, value }: Attr): boolean => name === 'aria-modal' || (name === 'role' && value === 'menu') || /^data-(?:dockkit|sidebar-right|composer)-/.test(name);
// Paint that hover and focus give a clone's rows, read on the inputs that may
// close a popup (presses, clicks, closing keys): the clone is inert and
// pointer-transparent. Readings older than STATE_TTL are dropped.
const STATE_PROPS = ['background-color', 'background-image', 'color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'box-shadow', 'outline-color', 'outline-style', 'outline-width', 'outline-offset', 'text-decoration-color', 'fill', 'stroke'];
const STATE_CONTROL = 'button, a[href], summary, [tabindex], [role^="menuitem"], [role="option"], [role="treeitem"], [role="tab"]';
const STATE_MAX_NODES = 40;
const STATE_TTL = 1000;
const CLOSE_KEYS = new Set(['Escape', 'Enter', ' ', 'Tab']);
// Hook owners compare every property. Their descendants compare box, text and
// paint properties, which hook selectors such as [role=menu] .row reach;
// clones above PIN_MAX_NODES compare the owners only.
const PIN_PROPS = [
  'display', 'position', 'box-sizing', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  ...['top', 'right', 'bottom', 'left'].flatMap(side => [`margin-${side}`, `padding-${side}`, `border-${side}-width`, `border-${side}-style`]),
  'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
  'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis', 'align-items', 'justify-content', 'row-gap', 'column-gap',
  'font-size', 'font-weight', 'line-height', 'letter-spacing', 'white-space', 'text-align', 'overflow-x', 'overflow-y',
  'opacity', 'visibility', 'transform', 'z-index', ...STATE_PROPS,
];
const PIN_MAX_NODES = 120;

export const MOTION_CSS = `
@media (prefers-reduced-motion: no-preference) {
  body[data-acrylic-fluent] :is(${POPUP_SELECTOR}):not([data-acrylic-ghost]) { animation: ${HOLD} 300ms linear; }
  body[data-acrylic-fluent] > [data-menu-backing] { animation: acrylic-backing-in ${MOTION.fade}ms linear; }
  /* Preview HoverCards own a closing phase that unmounts after 100ms. */
  body[data-acrylic-fluent] > div[style*="--dsh-hover-preview-fade"] { transition: opacity 90ms ${MOTION.exit}; }
}
@keyframes ${HOLD} { from, to { opacity: 0; } }
@keyframes acrylic-backing-in { from { opacity: 0; } }
/* Clones never anchor: a reopened menu reuses its anchor-name. */
[data-acrylic-ghost] { pointer-events: none !important; }
[data-acrylic-ghost], [data-acrylic-ghost] *, [data-acrylic-ghost] ::before, [data-acrylic-ghost] ::after {
  animation: none !important; transition: none !important; anchor-name: none !important;
}
`;

type Scroll = Map<string, readonly [top: number, left: number]>;
type StyleValues = (readonly [name: string, value: string])[];
interface StateNode { readonly path: string; readonly tag: string; readonly values: StyleValues }
type View = Window & typeof globalThis;

const indexIn = (parent: Element, child: Element) => Array.prototype.indexOf.call(parent.children, child);
// Every element in an HTML document carries an inline style; others are skipped.
const inlineStyle = (node: Element): CSSStyleDeclaration | undefined => (node as Partial<ElementCSSInlineStyle>).style;

function pathTo(root: Element, node: Element): string {
  const path: number[] = [];
  for (let current: Element | null = node; current && current !== root; current = current.parentElement) {
    if (current.parentElement) path.unshift(indexIn(current.parentElement, current));
  }
  return path.join('/');
}

function nodeAt(root: Element, path: string): Element | undefined {
  let node: Element | undefined = root;
  for (const index of path ? path.split('/') : []) node = node?.children[Number(index)];
  return node;
}

// Scroll offsets do not survive cloning. Record them when tracking starts
// (layout effects may already have scrolled a selection into view) and on scroll.
function scrollState(popup: Element): Scroll {
  const state: Scroll = new Map();
  const nodes = popup.getElementsByTagName('*');
  if (nodes.length > GHOST_MAX_NODES) return state;
  for (const node of [popup, ...nodes]) {
    if (node.scrollTop || node.scrollLeft) state.set(pathTo(popup, node), [node.scrollTop, node.scrollLeft]);
  }
  return state;
}

const attributesOf = (node: Element) => [...node.attributes];

// Without names: every computed property, custom ones included, so tokens a
// hook selector sets on an owner still reach its descendants.
function readStyle(view: View, node: Element, names: readonly string[] | null): StyleValues {
  const style = view.getComputedStyle(node);
  return (names ?? [...style]).map(name => [name, style.getPropertyValue(name)] as const);
}

// The hover and focus chains inside a popup, plus the rows under them, with
// the paint those states give them. The popup itself is left out: entrance
// animations may still be running on it.
function interactionState(view: View, popup: Element): StateNode[] | null {
  const nodes = new Set<Element>();
  const follow = (start: Element | null | undefined) => {
    if (!start || start === popup || !popup.contains(start)) return;
    for (let node: Element | null = start; node && node !== popup; node = node.parentElement) nodes.add(node);
    const control = start.closest(STATE_CONTROL);
    if (control && control !== popup && popup.contains(control)) {
      for (const node of [...control.getElementsByTagName('*')].slice(0, STATE_MAX_NODES)) nodes.add(node);
    }
  };
  const hovered = popup.querySelectorAll(':hover');
  follow(hovered[hovered.length - 1]);
  follow(popup.ownerDocument.activeElement);
  if (!nodes.size) return null;
  return [...nodes].map(node => ({ path: pathTo(popup, node), tag: node.tagName, values: readStyle(view, node, STATE_PROPS) }));
}

function detachGhost(root: HTMLElement) {
  for (const node of [root, ...root.getElementsByTagName('*')]) {
    for (const { name } of attributesOf(node)) if (GHOST_DETACH.test(name)) node.removeAttribute(name);
  }
  root.setAttribute('data-acrylic-ghost', '');
  root.setAttribute('aria-hidden', 'true');
  root.inert = true;
}

// Runs synchronously right after insertion, while the clone still matches
// every host selector: read the computed style of the hook owners (of all
// nodes when the clone is small, which also covers descendant and sibling
// selectors), remove the hooks, then pin each value that changed. The
// captured hover and focus paint is pinned last. Reads precede all writes.
function pinGhost(view: View, root: Element, state: readonly StateNode[] | null) {
  const nodes = [root, ...root.getElementsByTagName('*')];
  const owners = nodes.filter(node => attributesOf(node).some(isHook));
  const scope = owners.length && nodes.length <= PIN_MAX_NODES ? nodes : owners;
  const before = scope.map(node => readStyle(view, node, owners.includes(node) ? null : PIN_PROPS));
  for (const node of owners) {
    for (const attribute of attributesOf(node)) if (isHook(attribute)) node.removeAttribute(attribute.name);
  }
  const pins: [Element, StyleValues][] = [];
  scope.forEach((node, index) => {
    const style = view.getComputedStyle(node);
    const changed = (before[index] ?? []).filter(([name, value]) => style.getPropertyValue(name) !== value);
    if (changed.length) pins.push([node, changed]);
  });
  for (const { path, tag, values } of state ?? []) {
    const node = nodeAt(root, path);
    if (node?.tagName === tag) pins.push([node, values]);
  }
  for (const [node, values] of pins) for (const [name, value] of values) inlineStyle(node)?.setProperty(name, value);
}

function restoreScroll(root: Element, scroll: Scroll) {
  for (const [path, [top, left]] of scroll) {
    const node = nodeAt(root, path);
    if (node) { node.scrollTop = top; node.scrollLeft = left; }
  }
}

// macOS menus paint an opaque backing under the translucent surface: a body
// child anchored to the surface's anchor-name, unmounted with it. Clones get
// no anchor-name, so each surface in the clone gets a copy of the popup's
// backing at its own box.
function backingOf(view: View, popup: Element): Element | null {
  const anchor = inlineStyle(popup)?.getPropertyValue('--dsh-menu-anchor');
  if (!anchor) return null;
  for (const node of popup.ownerDocument.body.children) {
    if (node.hasAttribute('data-menu-backing') && inlineStyle(node)?.getPropertyValue('--dsh-menu-anchor') === anchor) {
      return view.getComputedStyle(node).display === 'none' ? null : node;
    }
  }
  return null;
}

function ghostBackings(view: View, template: Element, root: Element): Element[] {
  const surfaces = [root, ...root.querySelectorAll('[data-menu-material]')];
  const boxes = surfaces.map(surface => [surface.getBoundingClientRect(), view.getComputedStyle(surface).borderRadius] as const);
  return boxes.map(([rect, radius]) => {
    const clone = template.cloneNode(false) as Element;
    clone.setAttribute('data-acrylic-ghost', '');
    const box = { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
    const style = inlineStyle(clone);
    for (const [name, value] of Object.entries(box)) style?.setProperty(name, `${value}px`);
    style?.setProperty('border-radius', radius);
    root.ownerDocument.body.append(clone);
    return clone;
  });
}

// Entry direction from the trigger point: below it slides down, above it up,
// beside it sideways. Unknown origins slide down.
type Point = { readonly x: number; readonly y: number };
type Direction = readonly [x: number, y: number];

function slideFrom(rect: DOMRect, point: Point | null): { direction: Direction; distance: number } {
  const slack = 4;
  let direction: Direction = [0, 1];
  if (point) {
    if (rect.top >= point.y - slack) direction = [0, 1];
    else if (rect.bottom <= point.y + slack) direction = [0, -1];
    else if (rect.left >= point.x - slack) direction = [1, 0];
    else if (rect.right <= point.x + slack) direction = [-1, 0];
  }
  const extent = direction[1] ? rect.height : rect.width;
  return { direction, distance: Math.round(Math.min(24, Math.max(8, extent * .15))) };
}

type Shape =
  | { readonly kind: 'tooltip' }
  | { readonly kind: 'dialog' }
  | { readonly kind: 'modal'; readonly dialog: number }
  | { readonly kind: 'flyout'; readonly direction: Direction; readonly distance: number };
type Tracked = Shape & {
  readonly scroll: Scroll;
  readonly backing: Element | null;
  state: { readonly time: number; readonly nodes: StateNode[] } | null;
};
type Keyframe = Record<string, string | number>;

export interface MotionOptions {
  /** Called once each entrance animation has finished. */
  readonly onSettle?: (() => void) | undefined;
}

export function createMotion(document: Document, window: View, { onSettle }: MotionOptions = {}): Feature<boolean> {
  const sheet = createStyleSheet(document, 'dsh-acrylic-wallpaper-motion', MOTION_CSS);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const tracked = new Map<Element, Tracked>();
  const ghosts = new Set<Element>();
  let enabled = false;
  let pointer: (Point & { readonly time: number }) | null = null;
  let keyboard: { readonly element: Element | null; readonly time: number } | null = null;
  const removals = new window.MutationObserver(onRemovals);

  // One-sided keyframes: the other end is the popup's own computed style.
  // Fades are two-sided so host entrance fades underneath cannot slow them.
  const from = (target: Element, keyframe: Keyframe, duration: number, easing: string) => target.animate([{ ...keyframe, offset: 0 }], { duration, easing, fill: 'backwards' });
  const fadeIn = (target: Element, duration: number, easing: string) => target.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing, fill: 'backwards' });
  const to = (target: Element, keyframe: Keyframe, duration: number, easing: string) => target.animate([{ ...keyframe, offset: 1 }], { duration, easing, fill: 'forwards' });
  function layerOf(popup: Element): Element | null {
    const first = popup.firstElementChild;
    return first?.getAttribute('aria-hidden') === 'true' && window.getComputedStyle(first).backdropFilter !== 'none' ? first : null;
  }
  // Opacity targets: the acrylic layer and content separately, else the popup.
  const faders = (popup: Element) => layerOf(popup) ? [...popup.children] : [popup];

  function origin(popup: Element): Point | null {
    if (keyboard && (!pointer || keyboard.time > pointer.time)) {
      const element = keyboard.element;
      if (element?.isConnected && element !== document.body && !popup.contains(element)) {
        const rect = element.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }
    }
    return pointer;
  }

  // A declared kind (contract.ts) wins over the host structure checks.
  function describe(popup: Element): Shape {
    const declared = popup.getAttribute(POPUP_ATTRIBUTE);
    if (declared === 'tooltip' || (declared === null && popup.matches('[role="tooltip"]'))) return { kind: 'tooltip' };
    if (declared === 'dialog') return { kind: 'dialog' };
    const dialog = declared === null && popup.matches('[role="presentation"]') && popup.querySelector(':scope > [role="dialog"][aria-modal="true"]');
    if (dialog) return { kind: 'modal', dialog: indexIn(popup, dialog) };
    return { kind: 'flyout', ...slideFrom(popup.getBoundingClientRect(), origin(popup)) };
  }

  function enter(popup: Element, info: Shape): Animation[] {
    const { enter: ease, slide, fade } = MOTION;
    if (info.kind === 'tooltip') return [fadeIn(popup, MOTION.tooltipIn, 'linear')];
    if (info.kind === 'dialog') return [from(popup, { scale: 1.05 }, slide, ease), fadeIn(popup, fade, ease)];
    if (info.kind === 'modal') {
      return [...popup.children].flatMap((child, index) => index === info.dialog
        ? [from(child, { scale: 1.05 }, slide, ease), fadeIn(child, fade, ease)]
        : [fadeIn(child, fade, 'linear')]);
    }
    const [x, y] = info.direction;
    const list = [from(popup, { translate: `${-x * info.distance}px ${-y * info.distance}px` }, slide, ease)];
    if (layerOf(popup)) list.push(from(popup, { boxShadow: 'none' }, fade, ease));
    for (const target of faders(popup)) list.push(fadeIn(target, fade, ease));
    return list;
  }

  function leave(ghost: Element, info: Shape, backings: readonly Element[]): Animation[] {
    const { exit: ease, leave: duration } = MOTION;
    const out = (target: Element, keyframe: Keyframe, time: number = duration) => to(target, keyframe, time, ease);
    if (info.kind === 'tooltip') return [out(ghost, { opacity: 0 }, MOTION.tooltipOut)];
    if (info.kind === 'dialog') return [out(ghost, { scale: 1.05 }, MOTION.dialogOut), out(ghost, { opacity: 0 })];
    if (info.kind === 'modal') {
      return [...ghost.children].flatMap((child, index) => index === info.dialog
        ? [out(child, { scale: 1.05 }, MOTION.dialogOut), out(child, { opacity: 0 })]
        : [out(child, { opacity: 0 }, MOTION.dialogOut)]);
    }
    const [x, y] = info.direction;
    const back = Math.round(info.distance / 3);
    const translate = `${-x * back}px ${-y * back}px`;
    const list = [out(ghost, { translate })];
    if (layerOf(ghost)) list.push(out(ghost, { boxShadow: 'none' }));
    for (const target of faders(ghost)) list.push(out(target, { opacity: 0 }));
    for (const backing of backings) list.push(out(backing, { translate, opacity: 0 }));
    return list;
  }

  function settle(animations: readonly Animation[], done: () => void) {
    let finished = false;
    const finish = () => { if (!finished) { finished = true; done(); } };
    const timer = window.setTimeout(finish, MOTION.slide + 200);
    Promise.all(animations.map(animation => animation.finished)).then(() => { window.clearTimeout(timer); finish(); }, () => {});
  }

  function start(popup: Element) {
    if (!enabled || !popup.isConnected) return;
    const info: Tracked = { ...describe(popup), scroll: scrollState(popup), backing: backingOf(window, popup), state: null };
    const animations = enter(popup, info);
    for (const [element] of tracked) if (!element.isConnected) tracked.delete(element);
    tracked.set(popup, info);
    if (popup.parentNode) removals.observe(popup.parentNode, { childList: true });
    if (onSettle) settle(animations, onSettle);
  }

  // Popups measured while visibility:hidden are positioned a frame or two
  // later (tooltips, anchored panels). Keep them transparent until placed so
  // the direction comes from the final rect and no frame shows unanimated.
  function whenPlaced(popup: Element) {
    if (window.getComputedStyle(popup).visibility !== 'hidden') return start(popup);
    const hold = popup.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 1000 });
    const poll = (frames: number) => window.requestAnimationFrame(() => {
      if (!popup.isConnected) return hold.cancel();
      if (frames && window.getComputedStyle(popup).visibility === 'hidden') return poll(frames - 1);
      hold.cancel();
      start(popup);
    });
    poll(12);
  }

  function onStart(event: AnimationEvent) {
    const popup = event.target;
    if (event.animationName !== HOLD || !(popup instanceof window.Element)) return;
    for (const animation of popup.getAnimations()) if ((animation as Partial<CSSAnimation>).animationName === HOLD) animation.cancel();
    if (!enabled || reduce.matches || !popup.isConnected || popup.hasAttribute('data-acrylic-ghost')) return;
    whenPlaced(popup);
  }

  function ghost(node: Element, info: Tracked, record: MutationRecord) {
    const parent = record.target;
    if (!enabled || reduce.matches || document.hidden || !parent.isConnected) return;
    // Preview HoverCards already faded in their host-owned closing phase.
    if (node.hasAttribute('hidden') || node.hasAttribute('data-closing')) return;
    if (node.querySelector(GHOST_SKIP) || node.getElementsByTagName('*').length > GHOST_MAX_NODES) return;
    const clone = node.cloneNode(true) as HTMLElement;
    detachGhost(clone);
    const next = record.nextSibling?.parentNode === parent ? record.nextSibling : null;
    parent.insertBefore(clone, next);
    const state = info.state && window.performance.now() - info.state.time < STATE_TTL ? info.state.nodes : null;
    try {
      pinGhost(window, clone, state);
    } catch (error) {
      clone.remove(); // a half-pinned clone may still carry host hooks
      throw error;
    }
    restoreScroll(clone, info.scroll);
    const backings = info.kind === 'flyout' && info.backing && !info.backing.isConnected ? ghostBackings(window, info.backing, clone) : [];
    const parts = [clone, ...backings];
    for (const part of parts) ghosts.add(part);
    settle(leave(clone, info, backings), () => { for (const part of parts) { part.remove(); ghosts.delete(part); } });
  }

  function onRemovals(records: MutationRecord[]) {
    for (const record of records) {
      for (const node of record.removedNodes) {
        const info = node instanceof window.Element ? tracked.get(node) : undefined;
        if (!info || !(node instanceof window.Element)) continue;
        if (node.isConnected) { // moved, not dismissed
          if (node.parentNode) removals.observe(node.parentNode, { childList: true });
          continue;
        }
        tracked.delete(node);
        ghost(node, info, record);
      }
    }
    if (!tracked.size) removals.disconnect();
  }

  function onScroll(event: Event) {
    const target = event.target;
    if (!tracked.size || !(target instanceof window.Element)) return;
    for (const [popup, info] of tracked) {
      if (popup.contains(target)) { info.scroll.set(pathTo(popup, target), [target.scrollTop, target.scrollLeft]); return; }
    }
  }
  function capture() {
    const time = window.performance.now();
    for (const [popup, info] of tracked) {
      const nodes = popup.isConnected ? interactionState(window, popup) : null;
      info.state = nodes && { time, nodes };
    }
  }
  const onPointer = (event: PointerEvent) => {
    pointer = { x: event.clientX, y: event.clientY, time: event.timeStamp };
    if (event.type === 'pointerdown') capture();
  };
  const onKey = (event: KeyboardEvent) => {
    keyboard = { element: document.activeElement, time: event.timeStamp };
    if (CLOSE_KEYS.has(event.key)) capture();
  };
  const LISTENERS: [string, EventListener][] = [
    ['animationstart', onStart as EventListener], ['pointerdown', onPointer as EventListener], ['pointermove', onPointer as EventListener],
    ['click', capture], ['keydown', onKey as EventListener], ['scroll', onScroll],
  ];

  function update(next: boolean) {
    if (next === enabled) return;
    enabled = next;
    sheet.toggle(enabled);
    for (const [type, listener] of LISTENERS) {
      if (enabled) document.addEventListener(type, listener, { capture: true, passive: true });
      else document.removeEventListener(type, listener, { capture: true });
    }
    if (enabled) return;
    removals.disconnect(); tracked.clear();
    for (const clone of ghosts) clone.remove();
    ghosts.clear();
  }
  return { update, dispose() { update(false); sheet.dispose(); } };
}
