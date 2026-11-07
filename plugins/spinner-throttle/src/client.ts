import { isSpinnerAnimation, SPINNER } from './host.ts';

export const name = 'spinner-throttle';
export const inject: string[] = [];

interface Context {
  effect(factory: () => () => void, label?: string): unknown;
}

/** Spinner updates per second: a 14 px icon turns 8 degrees per update, under 1 px at the arc. */
const FPS = 30;
/** setTimeout fires late; leave room so the next display frame still lands on time. */
const TIMER_SLACK_MS = 4;

interface Stepped {
  animation: CSSAnimation;
  /** Timeline time at which the host animation started, so stepping keeps its phase. */
  origin: number;
}

const timelineNow = (): number => {
  const time = document.timeline.currentTime;
  return typeof time === 'number' ? time : performance.now();
};

function originOf(animation: CSSAnimation, now: number): number {
  if (typeof animation.startTime === 'number') return animation.startTime;
  return typeof animation.currentTime === 'number' ? now - animation.currentTime : now;
}

/**
 * ui spinners turn an SVG group and change the arc's stroke-dasharray with
 * CSS animations that update every display frame, about a third of a core on
 * a 120 Hz screen for two 14 px icons in a long conversation. Each spinner
 * keeps its look: both animations are paused and stepped FPS times a second
 * from one shared timer, so every spinner updates in the same frame. Moving
 * the turn to a `rotate` animation on the svg box saved nothing in Chrome.
 */
function install(): () => void {
  if (typeof CSSAnimation === 'undefined') return () => {};
  const spinners = new Map<SVGSVGElement, Stepped[]>();
  let timer = 0;
  let frame = 0;

  /** Give the spinner back to the host: resume its animations in the shared phase. */
  const release = (stepped: readonly Stepped[]) => {
    for (const { animation, origin } of stepped) {
      if (animation.playState === 'idle') continue;
      animation.play();
      animation.startTime = origin;
    }
  };

  const step = (stepped: readonly Stepped[], now: number) => {
    for (const entry of stepped) {
      const { animation } = entry;
      if (animation.playState !== 'paused') {
        // The host's phase reset plays the animation again; follow its phase and pause once more.
        entry.origin = originOf(animation, now);
        animation.pause();
      }
      animation.currentTime = now - entry.origin;
    }
  };

  const tick = () => {
    frame = 0;
    const now = timelineNow();
    for (const [svg, stepped] of spinners) {
      if (!svg.isConnected || stepped.some(({ animation }) => animation.playState === 'idle')) {
        // Unmounted, or a host animation was replaced or turned off (reduced motion): hand back the rest.
        release(stepped);
        spinners.delete(svg);
        continue;
      }
      step(stepped, now);
    }
    schedule();
  };
  const schedule = () => {
    if (timer !== 0 || frame !== 0 || spinners.size === 0) return;
    timer = window.setTimeout(() => {
      timer = 0;
      frame = requestAnimationFrame(tick);
    }, 1000 / FPS - TIMER_SLACK_MS);
  };

  const take = (svg: SVGSVGElement) => {
    const now = timelineNow();
    const animations = svg.getAnimations({ subtree: true }).filter((animation): animation is CSSAnimation =>
      animation instanceof CSSAnimation && animation.playState !== 'idle' && isSpinnerAnimation(animation.animationName));
    if (animations.length === 0) return;
    const known = new Map((spinners.get(svg) ?? []).map((entry) => [entry.animation, entry.origin]));
    const stepped = animations.map((animation) => ({ animation, origin: known.get(animation) ?? originOf(animation, now) }));
    spinners.set(svg, stepped);
    try {
      step(stepped, now);
    } catch (error) {
      // An unexpected animation shape: leave this spinner to the host.
      release(stepped);
      spinners.delete(svg);
      console.warn(`[${name}] left a spinner to the host`, error);
      return;
    }
    schedule();
  };

  // Bubble phase on document: runs after the svg's own listener has reset the phase.
  const onStart = (event: AnimationEvent) => {
    if (!isSpinnerAnimation(event.animationName) || !(event.target instanceof Element)) return;
    const svg = event.target.closest(SPINNER);
    if (svg instanceof SVGSVGElement) take(svg);
  };
  document.addEventListener('animationstart', onStart);
  for (const svg of document.querySelectorAll(SPINNER)) if (svg instanceof SVGSVGElement) take(svg);

  return () => {
    document.removeEventListener('animationstart', onStart);
    window.clearTimeout(timer);
    cancelAnimationFrame(frame);
    for (const [svg, stepped] of spinners) if (svg.isConnected) release(stepped);
    spinners.clear();
  };
}

export function apply(ctx: Context): void {
  ctx.effect(install, `${name}: spinners`);
}
