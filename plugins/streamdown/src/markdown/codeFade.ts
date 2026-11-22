import { useLayoutEffect, useRef, useState } from 'react';

import {
  MAX_REVEAL_GAP_MS, MIN_STREAM_CHAR_PACE_MS, STREAM_CHAR_DELAY, type StreamdownBlockFade,
} from '../streamdown/index.ts';

/**
 * Token fade-in for the host CodeBlock while its fence streams, after
 * lobe-ui's `SyntaxHighlighter/tokenFade` (MIT, LobeHub). CodeBlock owns its
 * DOM, so instead of rendering spans this decorates the highlighted runs it
 * renders (`span.line > span`, shared by its streaming arm and shiki's HTML)
 * with Web Animations, which leave React-managed attributes untouched.
 *
 * Births are kept per UTF-16 offset of the code text, so a re-tokenized or
 * remounted span resumes its fade instead of replaying it. A token fades from
 * the earliest birth of its visible characters (CodeBlock folds indentation
 * into the following token, and that whitespace often arrives a commit
 * earlier) and births only move earlier: a character that was already on
 * screen never drops back in opacity. Text shown before highlighting (plain
 * fallback, unknown language, grammar still loading) counts as already
 * visible.
 */

// Longer than the prose fade: a token fades as one unit, without the per-char
// stagger that makes the prose edge visible, and code streams more characters
// per second than prose.
const CODE_FADE_DURATION = 300;
const MIN_GAP_MS = 16;
const FLOW_MASK_IMAGE = 'linear-gradient(180deg, #000 calc(100% - 1.35em), transparent calc(100% - 1.35em)), linear-gradient(90deg, #000 33.333%, transparent 66.667%)';
const FLOW_MASK_SIZE = '100% 100%, 300% 100%';
// Same curve as the prose fade in STREAMDOWN_CSS.
const EASING = 'cubic-bezier(0.33, 0, 0.67, 1)';

interface RunningFade {
  lastBirth: number;
  end: number;
  animation: Animation;
}

interface FadeStore {
  /** Birth per offset of the code text; -Infinity for text shown without a fade. */
  births: number[];
  /** Every offset below this has finished fading. */
  settled: number;
  lastRevealTs: number;
  /** The next pass treats newly found text as already seen. */
  seen: boolean;
  running: WeakMap<Element, RunningFade>;
}

const createStore = (seen: boolean): FadeStore => ({
  births: [], settled: 0, lastRevealTs: 0, seen, running: new WeakMap(),
});

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

interface Run {
  token: HTMLElement | null;
  start: number;
  end: number;
  text: string;
}

/**
 * Target element for one text node inside `<code>`: a highlighted token span
 * (`span.line > span`), a plain/diff line (`span.line`), or the plain `<code>`
 * fallback before syntax highlighting activates.
 */
function tokenOf(text: Node, code: Element): HTMLElement | null {
  const parent = text.parentElement;
  if (parent === null) return null;
  if (parent.parentElement?.classList.contains('line') === true) return parent;
  if (parent.classList.contains('line')) return parent;
  if (parent === code && parent instanceof HTMLElement) return parent;
  return null;
}

function collectRuns(code: Element): { runs: Run[]; length: number } {
  const runs: Run[] = [];
  const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
  let length = 0;
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const value = node.nodeValue ?? '';
    if (value === '') continue;
    const token = tokenOf(node, code);
    const last = runs.at(-1);
    if (token !== null && last?.token === token) {
      last.end += value.length;
      last.text += value;
    } else {
      runs.push({ token, start: length, end: length + value.length, text: value });
    }
    length += value.length;
  }
  return { runs, length };
}

const isBlank = (code: number): boolean => code === 32 || code === 9 || code === 10 || code === 13;

function flowKeyframes(fromOpacity: number, fromPos: number): Keyframe[] {
  return [
    {
      opacity: fromOpacity,
      maskImage: FLOW_MASK_IMAGE,
      maskSize: FLOW_MASK_SIZE,
      maskRepeat: 'no-repeat',
      maskComposite: 'add',
      maskPosition: `0 0, ${fromPos.toFixed(1)}% 0`,
    },
    {
      opacity: 1,
      maskImage: FLOW_MASK_IMAGE,
      maskSize: FLOW_MASK_SIZE,
      maskRepeat: 'no-repeat',
      maskComposite: 'add',
      maskPosition: '0 0, 0% 0',
    },
  ];
}

function fadeRun(
  run: Run & { token: HTMLElement },
  births: readonly number[],
  now: number,
  running: FadeStore['running'],
): void {
  let firstVisible = Number.POSITIVE_INFINITY;
  let lastVisible = Number.NEGATIVE_INFINITY;
  for (let i = run.start; i < run.end; i++) {
    if (isBlank(run.text.charCodeAt(i - run.start))) continue;
    const charBirth = births[i];
    if (charBirth === undefined) continue;
    firstVisible = Math.min(firstVisible, charBirth);
    lastVisible = Math.max(lastVisible, charBirth);
  }
  const current = running.get(run.token);
  if (firstVisible === Number.POSITIVE_INFINITY || now - lastVisible >= CODE_FADE_DURATION) {
    if (current !== undefined && now - current.lastBirth >= CODE_FADE_DURATION) {
      current.animation.cancel();
      running.delete(run.token);
    }
    return;
  }
  if (current?.lastBirth === lastVisible && current.end === run.end) return;
  current?.animation.cancel();
  running.delete(run.token);
  if (typeof run.token.animate !== 'function') return;

  const lineOffset = run.text.lastIndexOf('\n') + 1;
  const lineStart = run.start + lineOffset;
  const lineLength = run.end - lineStart;
  let firstLineVisible = Number.POSITIVE_INFINITY;
  for (let i = lineStart; i < run.end; i++) {
    if (!isBlank(run.text.charCodeAt(i - run.start))) {
      firstLineVisible = births[i] ?? firstVisible;
      break;
    }
  }
  if (firstLineVisible === Number.POSITIVE_INFINITY) firstLineVisible = firstVisible;

  let progressSum = 0;
  let sawVisible = false;
  for (let i = lineStart; i < run.end; i++) {
    if (!isBlank(run.text.charCodeAt(i - run.start))) sawVisible = true;
    const charBirth = sawVisible ? (births[i] ?? firstLineVisible) : firstLineVisible;
    progressSum += clamp((now - charBirth) / CODE_FADE_DURATION, 0, 1);
  }
  const settledRatio = lineLength > 0 ? progressSum / lineLength : 0;
  const firstProgress = clamp((now - firstLineVisible) / CODE_FADE_DURATION, 0, 1);

  const freshToken = firstProgress === 0;
  const startTime = freshToken ? firstLineVisible : now;
  const duration = freshToken
    ? Math.min(CODE_FADE_DURATION + Math.max(0, lastVisible - firstLineVisible), CODE_FADE_DURATION * 1.5)
    : Math.max(80, lastVisible + CODE_FADE_DURATION - now);
  const fromOpacity = freshToken ? 0 : Math.max(0.25, firstProgress);
  const fromPos = freshToken ? 82 : clamp(65 * (1 - settledRatio) + 15, 18, 82);

  try {
    const animation = run.token.animate(flowKeyframes(fromOpacity, fromPos), {
      duration,
      easing: EASING,
      fill: 'backwards',
    });
    animation.startTime = startTime;
    running.set(run.token, { lastBirth: lastVisible, end: run.end, animation });
  } catch {
    // A changed host animation surface must never break the code block.
  }
}

function reveal(root: HTMLElement, store: FadeStore): void {
  const code = root.querySelector('code');
  if (code === null) return;
  const now = performance.now();
  const { runs, length } = collectRuns(code);
  const { births } = store;
  if (length < births.length) {
    births.length = length;
    store.settled = Math.min(store.settled, length);
  }
  const added = length - births.length;
  if (added > 0) {
    // Spread this commit's characters until the next one is due, as the
    // prose tail does, so throttled commits still read as a continuous flow.
    const gap = store.lastRevealTs === 0 ? MIN_GAP_MS : clamp(now - store.lastRevealTs, MIN_GAP_MS, MAX_REVEAL_GAP_MS);
    const pace = clamp(gap / added, MIN_STREAM_CHAR_PACE_MS, STREAM_CHAR_DELAY);
    while (births.length < length) {
      const previous = births.at(-1);
      const base = previous === undefined || !Number.isFinite(previous) ? now : previous + pace;
      births.push(store.seen
        ? Number.NEGATIVE_INFINITY
        : Math.min(now + gap, Math.max(base, now)));
    }
    store.lastRevealTs = now;
  }
  store.seen = false;
  for (const run of runs) {
    if (run.token === null || run.end <= store.settled) continue;
    fadeRun({ ...run, token: run.token }, births, now, store.running);
  }
  while (store.settled < births.length && now - (births[store.settled] ?? now) >= CODE_FADE_DURATION) store.settled++;
}

/**
 * Fade the code a streaming block reveals.
 * @param fade - the enclosing block's fade mode; `off` stops observing and lets running fades finish.
 * @param code - fence text; a non-append change treats the current text as already seen.
 * @returns a ref for CodeBlock's `contentRef`.
 */
export function useCodeFade(fade: StreamdownBlockFade, code: string): (element: HTMLDivElement | null) => void {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const store = useRef<FadeStore | null>(null);
  const source = useRef(code);
  if (!code.startsWith(source.current)) store.current = createStore(true);
  source.current = code;

  useLayoutEffect(() => {
    if (fade === 'off' || root === null || typeof MutationObserver === 'undefined') return;
    const current = store.current ??= createStore(false);
    if (fade === 'seen') current.seen = true;
    // CodeBlock also re-renders on its own (viewport highlighting, grammar
    // loads), so DOM mutations drive the passes rather than this component.
    const run = () => {
      reveal(root, store.current ??= createStore(false));
    };
    run();
    const observer = new MutationObserver(run);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => {
      // The commit that ends a block's streaming state may append its last text.
      if (observer.takeRecords().length > 0) run();
      observer.disconnect();
    };
  }, [fade, root]);

  return setRoot;
}
