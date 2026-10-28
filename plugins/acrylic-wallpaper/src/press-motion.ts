import type { Feature } from './feature.ts';
import type { HostModules } from './host/modules.ts';
import { createStyleSheet } from './style.ts';
import { actionSelector, ACTION_DISABLED, ACTION_EXCLUDED, ACTION_FIELDS } from './interaction.ts';
import { depression, forgetProjection, project, releaseEase, type Depression } from './press-geometry.ts';

const MARKER = 'data-acrylic-press-motion';
const INVERSE = '--acrylic-press-inverse';
const SIDES = ['top', 'right', 'bottom', 'left'] as const;
const CSS = `
[${MARKER}="static"] { position:relative; }
[${MARKER}]::after {
  content:''; position:absolute; display:block; pointer-events:auto; z-index:-1;
  inset:var(--acrylic-press-top) var(--acrylic-press-right) var(--acrylic-press-bottom) var(--acrylic-press-left);
  transform:var(${INVERSE}); transform-origin:50% 50%; transform-box:border-box;
  border-radius:inherit; background:transparent; border:0; padding:0; margin:0;
}
`;

type View = Window & typeof globalThis;
type Input = { pointerId: number; x: number; y: number } | { key: string };
type Value = readonly [string, string];
interface Press {
  target: HTMLElement;
  input: Input;
  held: boolean;
  geometric: boolean;
  drag: boolean;
  width: number;
  height: number;
  pose: Depression;
  amount: number;
  releasedAt: number;
  saved: Map<string, Value>;
  owned: Map<string, Value>;
  geometry: string;
  pseudo: string;
  hostStyle: string;
  background: string;
}
const GEOMETRY = ['display','visibility','pointer-events','position','scale','rotate','translate','transform-origin','transform-box','zoom','overflow-x','overflow-y','clip-path','mask-image','contain','anchor-name', ...SIDES.map(side => `border-${side}-width`)];
const geometry = (css: CSSStyleDeclaration) => GEOMETRY.map(name => css.getPropertyValue(name)).join(';');
const pseudoGeometry = (css: CSSStyleDeclaration) => ['content','position','display','pointer-events','z-index','top','right','bottom','left','width','height','transform-origin','background-image','background-color','border-width'].map(name => css.getPropertyValue(name)).join(';');

/** Semantic actions share one lifecycle; geometry is a separately checked capability. */
export function createPressMotion(document: Document, window: View, modules: HostModules, refresh: () => void): Feature<boolean> {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const sheet = createStyleSheet(document, 'dsh-acrylic-wallpaper-press-motion', CSS);
  let requested = false, running = false, disposed = false, frame = 0, timer = 0;
  let press: Press | null = null;
  function resolve(node: EventTarget | null): HTMLElement | null {
    if (!(node instanceof window.Element) || node.closest(ACTION_FIELDS)) return null;
    const quiet = modules.select('turnRail');
    if (quiet && node.closest(quiet)) return null;
    const target = node.closest(actionSelector(modules));
    return target instanceof window.HTMLElement ? target : null;
  }
  function available(target: HTMLElement): boolean {
    return target.isConnected && !target.matches(ACTION_DISABLED) && !target.closest(ACTION_EXCLUDED)
      && window.getComputedStyle(target).getPropertyValue('-webkit-app-region') !== 'drag';
  }
  function childrenSafe(target: HTMLElement, positioned: boolean): boolean {
    const children = target.querySelectorAll('*');
    if (children.length > 160 || target.querySelector(ACTION_FIELDS)) return false;
    for (const child of children) {
      const css = window.getComputedStyle(child);
      if (css.display === 'none') continue;
      if (/^(fixed|sticky)$/.test(css.position)) return false;
      if (css.position === 'absolute' && !positioned) {
        // Screen-reader status labels on history rows are not popup anchors.
        const clippedLabel = parseFloat(css.width) <= 1 && parseFloat(css.height) <= 1 && (css.clip !== 'auto' || css.clipPath !== 'none');
        const contained = child instanceof window.HTMLElement && child.offsetParent && target.contains(child.offsetParent);
        if (!clippedLabel && !contained) return false;
      }
    }
    return true;
  }
  function moving(target: HTMLElement): boolean {
    return target.getAnimations().some(animation => animation.playState === 'running'
      && animation.effect instanceof window.KeyframeEffect
      && animation.effect.getKeyframes().some(key => ['transform','scale','rotate','translate','width','height','opacity'].some(name => key[name] !== undefined)));
  }
  function flatAncestors(target: HTMLElement): boolean {
    for (let parent = target.parentElement; parent; parent = parent.parentElement) {
      const css = window.getComputedStyle(parent);
      if (css.transform !== 'none' || css.scale !== 'none' || css.rotate !== 'none' || css.perspective !== 'none'
        || !['', '1', 'normal'].includes(css.getPropertyValue('zoom'))) return false;
    }
    return true;
  }
  function canTransform(target: HTMLElement, css: CSSStyleDeclaration): boolean {
    if (target.hasAttribute(MARKER) || css.display.startsWith('table') || css.display === 'inline'
      || css.transform !== 'none' || css.scale !== 'none' || css.rotate !== 'none' || css.translate !== 'none'
      || css.clipPath !== 'none' || css.maskImage !== 'none' || css.overflowX !== 'visible' || css.overflowY !== 'visible'
      || /paint|strict|content/.test(css.contain) || css.animationName !== 'none'
      || !['', '1', 'normal'].includes(css.getPropertyValue('zoom'))
      || (css.getPropertyValue('anchor-name').trim() && css.getPropertyValue('anchor-name').trim() !== 'none')
      || moving(target)
      || (css.transitionDuration.split(',').some(value => parseFloat(value) > 0)
        && css.transitionProperty.split(',').some(name => /^(all|scale|transform)$/.test(name.trim())))) return false;
    const pseudo = window.getComputedStyle(target, '::after');
    if (pseudo.content !== 'none' && pseudo.content !== 'normal') return false;
    // A tilted ancestor would require composing its projection as well as ours
    // to position the body-mounted Reveal. Fall back rather than misalign it.
    return flatAncestors(target) && childrenSafe(target, css.position !== 'static');
  }
  function own(current: Press, name: string, value: string, priority = '') {
    const style = current.target.style;
    if (!current.saved.has(name)) current.saved.set(name, [style.getPropertyValue(name), style.getPropertyPriority(name)]);
    style.setProperty(name, value, priority);
    current.owned.set(name, [style.getPropertyValue(name), style.getPropertyPriority(name)]);
  }
  function hostStyle(current: Press): string {
    const style = current.target.style;
    return [...style].filter(name => !current.owned.has(name)).sort()
      .map(name => `${name}:${style.getPropertyValue(name)}!${style.getPropertyPriority(name)}`).join(';');
  }
  function intact(current: Press): boolean {
    return [...current.owned].every(([name, [value, priority]]) => current.target.style.getPropertyValue(name) === value && current.target.style.getPropertyPriority(name) === priority);
  }
  function clear() {
    if (frame) window.cancelAnimationFrame(frame);
    if (timer) window.clearTimeout(timer);
    frame = 0; timer = 0; observer.disconnect(); sizes.disconnect();
    const current = press; press = null;
    if (!current) return;
    forgetProjection(current.target);
    if (current.geometric) current.target.removeAttribute(MARKER);
    for (const [name, [value, priority]] of current.saved) {
      const owned = current.owned.get(name);
      if (!owned || current.target.style.getPropertyValue(name) !== owned[0] || current.target.style.getPropertyPriority(name) !== owned[1]) continue;
      if (value) current.target.style.setProperty(name, value, priority); else current.target.style.removeProperty(name);
    }
    refresh();
  }
  function paint(current: Press, amount: number) {
    current.amount = amount;
    if (current.geometric) {
      const projection = project(window, current.target, current.width, current.height, current.pose, amount);
      own(current, 'transform', projection.transform, 'important');
      own(current, INVERSE, projection.inverse.toString());
    } else {
      // Clipped, stretched-hit, table and already transformed controls retain
      // their native geometry but still get a pressed surface, never silence.
      const tint = `color-mix(in srgb,var(--dsw-alias-interactive-bg-active) ${Math.round(amount * 100)}%,transparent)`;
      own(current, 'background-image', `linear-gradient(${tint},${tint}),${current.background}`, 'important');
    }
    refresh();
  }
  function tick(now: number) {
    frame = 0;
    const current = press;
    if (!current) return;
    if (!available(current.target) || document.hidden) return clear();
    const progress = Math.max(0, Math.min(1, (now - current.releasedAt - 150) / 200));
    if (progress === 1) return clear();
    paint(current, 1 - releaseEase(progress));
    frame = window.requestAnimationFrame(tick);
  }
  function release() {
    const current = press;
    if (!current?.held) return;
    current.held = false;
    if (timer) window.clearTimeout(timer);
    timer = 0;
    if (!current.geometric) return clear();
    // Do not let a delayed down happen after release. Very short gestures may
    // have no geometry; this web lifecycle choice is not a native tap guarantee.
    if (!current.amount) return clear();
    current.releasedAt = window.performance.now();
    timer = window.setTimeout(() => {
      timer = 0;
      if (press === current) frame = window.requestAnimationFrame(tick);
    }, 150);
  }
  function begin(target: HTMLElement, input: Input) {
    clear();
    if (!available(target)) return;
    const css = window.getComputedStyle(target), rect = target.getBoundingClientRect();
    if (!rect.width || !rect.height || css.visibility !== 'visible' || css.pointerEvents === 'none') return;
    const geometric = !reduced.matches && canTransform(target, css);
    const borders = SIDES.map(side => css.getPropertyValue(`border-${side}-width`));
    const position = css.position;
    const u = 'pointerId' in input ? (input.x - rect.left) / rect.width : .5;
    const v = 'pointerId' in input ? (input.y - rect.top) / rect.height : .5;
    const current: Press = { target, input, held: true, geometric, drag: Boolean(target.closest('[draggable="true"],[data-dockkit-tab]')), width: rect.width, height: rect.height, pose: depression(rect.width, rect.height, u, v), amount: 0, releasedAt: 0, saved: new Map(), owned: new Map(), geometry: '', pseudo: '', hostStyle: '', background: css.backgroundImage };
    press = current;
    if (geometric) {
      own(current, 'transform-origin', '50% 50%', 'important');
      own(current, 'transform-box', 'border-box', 'important');
      SIDES.forEach((side, index) => own(current, `--acrylic-press-${side}`, `-${borders[index]}`));
      target.setAttribute(MARKER, position === 'static' ? 'static' : '');
      paint(current, 0);
      if (position === 'static' && window.getComputedStyle(target).position !== 'relative') return clear();
    }
    if (!geometric) paint(current, 1);
    current.geometry = geometry(window.getComputedStyle(target));
    current.pseudo = pseudoGeometry(window.getComputedStyle(target, '::after'));
    current.hostStyle = hostStyle(current);
    sizes.observe(target, { box: 'border-box' });
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true });
    if (!geometric) return;
    // Native pointer down uses a 10ms BeginTime, not a timed shrink tween.
    timer = window.setTimeout(() => {
      timer = 0;
      if (press === current && current.held && available(target)) paint(current, 1);
    }, 10);
  }
  const sizes = new window.ResizeObserver(entries => {
    const current = press;
    if (!current?.geometric) return;
    const entry = entries.find(entry => entry.target === current.target);
    const box = entry?.borderBoxSize[0];
    if (!box) return;
    const vertical = window.getComputedStyle(current.target).writingMode.startsWith('vertical');
    const width = vertical ? box.blockSize : box.inlineSize, height = vertical ? box.inlineSize : box.blockSize;
    if (Math.abs(width - current.width) > .1 || Math.abs(height - current.height) > .1) clear();
  });
  const observer = new window.MutationObserver(records => {
    const current = press;
    if (!current) return;
    if (!available(current.target) || !intact(current)) return clear();
    const relevant = records.filter(record => record.attributeName !== MARKER
      && record.target instanceof window.Element
      && (record.target.contains(current.target) || current.target.contains(record.target)));
    const related = relevant.length > 0;
    if (!related) return;
    const css = window.getComputedStyle(current.target);
    if (geometry(css) !== current.geometry || css.visibility !== 'visible' || css.display === 'none') return clear();
    if (current.geometric && (hostStyle(current) !== current.hostStyle
      || relevant.some(record => record.target !== current.target || record.attributeName !== 'style'))) {
      // Temporarily remove only our selector while inspecting host-state pseudo
      // ownership. Restore synchronously before paint; never do this per frame.
      const marker = current.target.getAttribute(MARKER);
      current.target.removeAttribute(MARKER);
      const hostContent = window.getComputedStyle(current.target, '::after').content;
      if (marker !== null) current.target.setAttribute(MARKER, marker);
      if (hostContent !== 'none' && hostContent !== 'normal') return clear();
      if (!childrenSafe(current.target, true) || !flatAncestors(current.target) || moving(current.target)
        || pseudoGeometry(window.getComputedStyle(current.target, '::after')) !== current.pseudo) return clear();
      current.hostStyle = hostStyle(current);
    }
    // Opening a popup can measure its anchor during React's click commit. Stop
    // before leaving a transformed anchor beneath a newly opened surface.
    if (records.some(record => record.attributeName === 'aria-expanded' && record.target === current.target && current.target.getAttribute('aria-expanded') === 'true')) clear();
  });
  function down(event: PointerEvent) {
    if (!event.isPrimary || event.button !== 0 || document.hidden) return;
    const target = resolve(event.target);
    if (target) begin(target, { pointerId: event.pointerId, x: event.clientX, y: event.clientY }); else clear();
  }
  function up(event: PointerEvent) {
    if (press && 'pointerId' in press.input && press.input.pointerId === event.pointerId) release();
  }
  function move(event: PointerEvent) {
    if (!press?.held || !('pointerId' in press.input) || press.input.pointerId !== event.pointerId) return;
    if (press.drag && (Math.abs(event.clientX - press.input.x) >= 4 || Math.abs(event.clientY - press.input.y) >= 4)) return clear();
    if (!(event.buttons & 1) || resolve(document.elementFromPoint(event.clientX, event.clientY)) !== press.target) clear();
  }
  function out(event: PointerEvent) {
    if (press?.held && 'pointerId' in press.input && press.input.pointerId === event.pointerId && resolve(event.relatedTarget) !== press.target) clear();
  }
  function cancel(event: PointerEvent) {
    if (press?.held && 'pointerId' in press.input && press.input.pointerId === event.pointerId) clear();
  }
  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape') return clear();
    if (event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || ![' ', 'Enter'].includes(event.key)) return;
    const target = resolve(event.target);
    if (target && document.activeElement === target) begin(target, { key: event.key });
  }
  function keyup(event: KeyboardEvent) { if (press && 'key' in press.input && press.input.key === event.key) release(); }
  function focusout(event: FocusEvent) { if (press && 'key' in press.input && event.target === press.target) clear(); }
  function click() {
    // Popup/disclosure anchors return to their original box before host click
    // handlers measure them. Selection rows retain their return animation.
    if (press?.target.matches('[aria-haspopup]:not([aria-haspopup="false"]),[aria-expanded],[popovertarget]')) clear();
  }
  const events: readonly (readonly [string, EventListener])[] = [
    ['pointerdown', down as EventListener], ['pointerup', up as EventListener],
    ['pointermove', move as EventListener], ['pointerout', out as EventListener],
    ['pointercancel', cancel as EventListener], ['lostpointercapture', cancel as EventListener],
    ['keydown', keydown as EventListener], ['keyup', keyup as EventListener], ['focusout', focusout as EventListener],
    ['click', click], ['dragstart', clear], ['visibilitychange', clear], ['scroll', clear],
  ];
  function reconcile() {
    const next = requested && !disposed;
    if (next === running) return;
    running = next;
    const method = next ? 'addEventListener' : 'removeEventListener';
    for (const [type, listener] of events) document[method](type, listener, true);
    window[method]('blur', clear); window[method]('resize', clear);
    if (!next) clear();
    sheet.toggle(next);
  }
  const unsubscribe = modules.subscribe(clear);
  reduced.addEventListener('change', clear);
  return {
    update(enabled) { requested = enabled; reconcile(); },
    dispose() { disposed = true; reconcile(); unsubscribe(); reduced.removeEventListener('change', clear); sheet.dispose(); },
  };
}
