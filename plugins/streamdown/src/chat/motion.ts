/**
 * Web Animations helpers shared by chat block motion. Effects only run on
 * existing boxes: nothing here writes inline styles or attributes, and a
 * finished effect leaves the element exactly as the host rendered it.
 */

/** Entry, disclosure, and title motion share LobeHub's 200 ms accordion timing. */
export const MOTION_MS = 200;
/** The standard curve ui-chat's own fold motion uses. */
export const MOTION_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';
const RISE = '0 6px';

/** Laid-out geometry of one box, read in a single pass before any effect starts. */
export interface Box {
  top: number;
  bottom: number;
  height: number;
  marginTop: string;
  marginBottom: string;
  display: string;
  opacity: number;
  /** Already clips its content, as a scroll container does; such a box must keep its own overflow. */
  clips: boolean;
}

/** Height and vertical margins of one keyframe. */
export interface Size {
  height: string;
  marginTop: string;
  marginBottom: string;
}

export function measure(element: Element): Box {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  const opacity = Number.parseFloat(style.opacity);
  return {
    top: rect.top,
    bottom: rect.bottom,
    height: rect.height,
    marginTop: style.marginTop,
    marginBottom: style.marginBottom,
    display: style.display,
    opacity: Number.isFinite(opacity) ? opacity : 1,
    clips: style.overflowX !== 'visible' || style.overflowY !== 'visible',
  };
}

export function sizeOf(box: Box): Size {
  return { height: `${box.height}px`, marginTop: box.marginTop, marginBottom: box.marginBottom };
}

/** A box folded to nothing; margins default to zero. */
export function collapsed(marginTop = '0px', marginBottom = '0px'): Size {
  return { height: '0px', marginTop, marginBottom };
}

let tracking: string | null | undefined;

/**
 * Final height for a box whose content may keep growing during the entry.
 * `calc-size()` follows the live content; without it the measured size is
 * used and later growth lands when the effect ends.
 */
export function trackingHeight(box: Box): string {
  tracking ??= typeof CSS !== 'undefined' && CSS.supports('height', 'calc-size(auto, size)') ? 'calc-size(auto, size)' : null;
  return tracking ?? `${box.height}px`;
}

/**
 * Overflow for a box whose height animates. A box that already clips keeps
 * its overflow: switching a scroll container to `clip` would drop its scroll
 * offset.
 */
function clipOf(box: Box): Keyframe {
  return box.clips ? {} : { overflow: 'clip' };
}

/** Grow from `from` to `box`'s own size while fading in and settling a 6 px rise. */
export function enterFrames(from: Size, to: Size, box: Box): Keyframe[] {
  return [
    { ...clipOf(box), ...from, opacity: 0, translate: RISE },
    { ...clipOf(box), ...to, opacity: box.opacity, translate: '0 0' },
  ];
}

/**
 * Shrink from `box`'s own size while fading out. `keep` holds discrete properties, such as
 * `display` or `content-visibility`, at their visible values until the end.
 */
export function exitFrames(from: Size, to: Size, box: Box, keep: Keyframe = {}): Keyframe[] {
  return [
    { ...keep, ...clipOf(box), ...from, opacity: box.opacity },
    { ...keep, ...clipOf(box), ...to, opacity: 0 },
  ];
}

/** Fade in while settling a 6 px rise; opacity and translate run on the compositor. */
export function fadeFrames(opacity: number): Keyframe[] {
  return [{ opacity: 0, translate: RISE }, { opacity, translate: '0 0' }];
}

/** The same fade, held transparent while a row slides off the box during the first third. */
export function lateFadeFrames(opacity: number): Keyframe[] {
  return [{ opacity: 0, translate: RISE }, { opacity: 0, offset: 0.35 }, { opacity, translate: '0 0' }];
}

/** Move from `by` px below the laid-out position back to it. */
export function slideFrames(by: number): Keyframe[] {
  return [{ translate: `0 ${by}px` }, { translate: '0 0' }];
}

/** Vertical offset the element's animated `translate` currently adds. */
export function translateY(element: Element): number {
  const value = getComputedStyle(element).translate;
  if (value === 'none') return 0;
  const y = Number.parseFloat(value.split(' ')[1] ?? '0');
  return Number.isFinite(y) ? y : 0;
}

/** A computed length such as a margin or gap in px; `normal` and `auto` count as zero. */
export function px(value: string): number {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : 0;
}

interface PlayOptions {
  duration?: number;
  easing?: string;
  /** `forwards` holds the last frame until `onEnd` runs, then the effect is removed. */
  fill?: FillMode;
  onEnd?: () => void;
}

/** At most one running effect per element; a newer motion replaces the older one. */
export class Motions {
  private readonly active = new Map<Element, Animation>();

  play(element: Element, keyframes: Keyframe[], options: PlayOptions = {}): void {
    this.active.get(element)?.cancel();
    const fill = options.fill ?? 'none';
    let animation: Animation;
    try {
      animation = element.animate(keyframes, {
        duration: options.duration ?? MOTION_MS,
        easing: options.easing ?? MOTION_EASING,
        fill,
      });
    } catch {
      // A changed host animation surface must never break the block itself.
      options.onEnd?.();
      return;
    }
    this.active.set(element, animation);
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      if (this.active.get(element) === animation) this.active.delete(element);
      options.onEnd?.();
    };
    animation.addEventListener('finish', () => {
      end();
      if (fill !== 'none') animation.cancel();
    });
    animation.addEventListener('cancel', end);
  }

  running(element: Element): boolean {
    return this.active.has(element);
  }

  cancel(element: Element): void {
    this.active.get(element)?.cancel();
  }

  /** Stop every effect inside `root`, for example when ui-chat starts a fold there. */
  cancelWithin(root: Element): void {
    for (const [element, animation] of [...this.active]) {
      if (root.contains(element)) animation.cancel();
    }
  }

  cancelAll(): void {
    for (const animation of [...this.active.values()]) animation.cancel();
    this.active.clear();
  }
}
