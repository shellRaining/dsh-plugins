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
const KEYFRAMES: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];
// Same curve as the prose fade in STREAMDOWN_CSS.
const EASING = 'cubic-bezier(0.33, 0, 0.67, 1)';

interface FadeStore {
  /** Birth per offset of the code text; -Infinity for text shown without a fade. */
  births: number[];
  /** Every offset below this has finished fading. */
  settled: number;
  lastRevealTs: number;
  /** The next pass treats newly found text as already seen. */
  seen: boolean;
  running: WeakMap<Element, { birth: number; animation: Animation }>;
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

/** A highlighted token is a span directly inside one `span.line`. */
function tokenOf(text: Node): HTMLElement | null {
  const parent = text.parentElement;
  return parent?.parentElement?.classList.contains('line') === true ? parent : null;
}

function collectRuns(code: Element): { runs: Run[]; length: number } {
  const runs: Run[] = [];
  const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
  let length = 0;
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const value = node.nodeValue ?? '';
    if (value === '') continue;
    const token = tokenOf(node);
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

function fadeToken(token: HTMLElement, birth: number, now: number, running: FadeStore['running']): void {
  const current = running.get(token);
  if (current?.birth === birth) return;
  current?.animation.cancel();
  running.delete(token);
  if (now - birth >= CODE_FADE_DURATION || typeof token.animate !== 'function') return;
  try {
    const animation = token.animate(KEYFRAMES, { duration: CODE_FADE_DURATION, easing: EASING, fill: 'backwards' });
    // Births use performance.now(), the document timeline's clock, so the
    // fade starts at the character's real age, also on a fresh span.
    animation.startTime = birth;
    running.set(token, { birth, animation });
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
    for (const run of runs) {
      while (births.length < run.end) {
        const previous = births.at(-1);
        births.push(store.seen || run.token === null
          ? Number.NEGATIVE_INFINITY
          : Math.min(now + gap, Math.max(previous === undefined ? now : previous + pace, now)));
      }
    }
    store.lastRevealTs = now;
  }
  store.seen = false;
  for (const run of runs) {
    if (run.token === null || run.end <= store.settled) continue;
    let birth = Number.POSITIVE_INFINITY;
    let visible = Number.POSITIVE_INFINITY;
    for (let i = run.start; i < run.end; i++) {
      const charBirth = births[i] ?? birth;
      birth = Math.min(birth, charBirth);
      if (!isBlank(run.text.charCodeAt(i - run.start))) visible = Math.min(visible, charBirth);
    }
    if (visible !== Number.POSITIVE_INFINITY) {
      birth = visible;
      // Only visible characters adopt the token birth, so none moves later.
      for (let i = run.start; i < run.end; i++) {
        if (!isBlank(run.text.charCodeAt(i - run.start))) births[i] = birth;
      }
    }
    fadeToken(run.token, birth, now, store.running);
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
