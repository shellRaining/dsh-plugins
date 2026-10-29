import { createContext, memo, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { RemendOptions } from 'remend';
import type { Pluggable, PluggableList } from 'unified';

import { createBlockLexer } from './blockLexer.ts';
import { CachedMarkdown } from './CachedMarkdown.tsx';
import { getNow, isDeepEqual, useStableValue } from './internal.ts';
import type { MarkdownOptions as Options } from './options.ts';
import { rehypeStreamAnimated, type StreamAnimatedRuntime } from './rehypeStreamAnimated.ts';
import { type BlockAnimationMeta, resolveBlockAnimationMeta } from './streamAnimationMeta.ts';
import { STREAM_TAIL_TAG, StreamTail } from './StreamTail.tsx';
import { STREAM_FADE_DURATION, STREAMDOWN_ANIMATED_CLASS } from './styles.ts';
import type { StreamAnimationGranularity, StreamSmoothingPreset } from './types.ts';
import { countChars, useSmoothStreamContent } from './useSmoothStreamContent.ts';
import { type BlockInfo, type BlockState } from './useStreamQueue.ts';
import { usePageHidden, useReducedMotion } from './useReducedMotion.ts';

const EMPTY_PLUGINS: PluggableList = [];

const isSamePlugin = (prevPlugin: Pluggable | undefined, nextPlugin: Pluggable | undefined): boolean => {
  if (prevPlugin === undefined || nextPlugin === undefined) return prevPlugin === nextPlugin;
  const prevTuple = Array.isArray(prevPlugin) ? prevPlugin : [prevPlugin];
  const nextTuple = Array.isArray(nextPlugin) ? nextPlugin : [nextPlugin];

  if (prevTuple.length !== nextTuple.length) return false;
  if (prevTuple[0] !== nextTuple[0]) return false;

  return isDeepEqual(prevTuple.slice(1), nextTuple.slice(1));
};

const isSamePlugins = (
  prevPlugins?: PluggableList | null,
  nextPlugins?: PluggableList | null,
): boolean => {
  if (prevPlugins === nextPlugins) return true;
  if (!prevPlugins || !nextPlugins) return !prevPlugins && !nextPlugins;
  if (prevPlugins.length !== nextPlugins.length) return false;

  for (let i = 0; i < prevPlugins.length; i++) {
    if (!isSamePlugin(prevPlugins[i], nextPlugins[i])) return false;
  }

  return true;
};

const useStablePlugins = (plugins: PluggableList): PluggableList => {
  const stableRef = useRef<PluggableList>(plugins);

  if (!isSamePlugins(stableRef.current, plugins)) {
    stableRef.current = plugins;
  }

  return stableRef.current;
};

const StreamdownBlock = memo<Options>(
  ({ children, ...rest }) => {
    return <CachedMarkdown {...rest}>{children}</CachedMarkdown>;
  },
  (prevProps, nextProps) => isDeepEqual(prevProps, nextProps),
);

StreamdownBlock.displayName = 'StreamdownBlock';

// Fork: components rendered inside a block can read that block's queue
// state, e.g. to keep a code fence in its incremental streaming mode only
// while it is the open tail.
const StreamdownBlockContext = createContext<BlockState>('revealed');

/** Queue state of the Streamdown block that renders the calling component. */
export const useStreamdownBlockState = (): BlockState => useContext(StreamdownBlockContext);

interface BlockRuntime extends StreamAnimatedRuntime {
  blockBirth?: number | undefined;
  charCount: number;
  charDelay?: number | undefined;
  rawLength: number;
  settled: boolean;
}

interface BlockPluginsCacheEntry {
  base: PluggableList;
  granularity: StreamAnimationGranularity;
  value: PluggableList;
}

interface UpdateBlockAnimationArgs {
  blocks: BlockInfo[];
  charDelay: number;
  getBlockState: (index: number) => BlockState;
  pluginsCache: Map<number, BlockPluginsCacheEntry>;
  renderNow: number;
  revealClock: { lastTs: number };
  runtimes: Map<number, BlockRuntime>;
  baselineLength: number;
  finishing: boolean;
}

const MIN_STREAM_CHAR_PACE_MS = 2;
const MAX_REVEAL_GAP_MS = 160;

// Runs in the render phase: refreshes each visible block's birth pacing in
// place and resolves its animation meta in one pass. Births themselves are
// assigned lazily by rehypeStreamAnimated per *rendered* char, because the
// raw markdown length over-counts (link URLs, emphasis markers) and indexing
// births by raw offset made chars after such syntax look already faded.
// Mutations are idempotent for a given block content/length, so discarded
// or StrictMode double renders re-derive the same state.
const updateBlockAnimation = ({
  blocks,
  charDelay,
  getBlockState,
  pluginsCache,
  renderNow,
  revealClock,
  runtimes,
  baselineLength,
  finishing,
}: UpdateBlockAnimationArgs): Map<number, BlockAnimationMeta> => {
  const blockAnimationMeta = new Map<number, BlockAnimationMeta>();
  const alive = new Set<number>();
  let revealedNewChars = false;

  for (const [index, block] of blocks.entries()) {
    alive.add(block.startOffset);

    // Queued blocks are not rendered. Defer birth assignment so that
    // when the block later transitions to animating/streaming, its
    // chars start fading from that moment instead of having already
    // "aged out" of the fade window.
    const state = getBlockState(index);
    if (state === 'queued') continue;

    let runtime = runtimes.get(block.startOffset);
    if (!runtime) {
      runtime = {
        births: [],
        blockBirth: state === 'revealed' && block.startOffset >= baselineLength ? renderNow : undefined,
        baseline: block.startOffset < baselineLength,
        charCount: 0,
        rawLength: -1,
        settled: false,
        skipped: [],
      };
      runtimes.set(block.startOffset, runtime);
    }

    const births = runtime.births;

    if (runtime.rawLength !== block.content.length) {
      const nextCharCount = countChars(block.content);
      if (nextCharCount < runtime.charCount) {
        // Block content shrunk. Usually just marked dropping a paragraph's
        // trailing "\n" once the blank line completes, so only births past
        // the new raw length are stale; wiping them all would replay the
        // fade of every char in the block.
        births.length = Math.min(births.length, nextCharCount);
        runtime.skipped.length = births.length;
      }

      // Chain each new char monotonically after the previous one so fades
      // never race out of order. Cap how far the fade queue can run ahead
      // of "now" to prevent stream-faster-than-fade producing seconds of
      // invisible backlog at the tail.
      //
      // The streaming tail paces its stagger from the observed reveal-commit
      // gap instead of the queue's fixed charDelay: a commit's chars are
      // spread to land exactly until the next commit arrives, so the flow
      // stays per-char continuous no matter how far apart the throttled
      // commits are.
      const newChars = Math.max(1, nextCharCount - runtime.charCount);
      let pace = charDelay;
      let capMs = STREAM_FADE_DURATION;
      if (state === 'streaming') {
        revealedNewChars = true;
        const gapMs = Math.min(Math.max(renderNow - revealClock.lastTs, 16), MAX_REVEAL_GAP_MS);
        pace = Math.min(charDelay, Math.max(gapMs / newChars, MIN_STREAM_CHAR_PACE_MS));
        capMs = gapMs;
      }
      runtime.pacing = finishing ? { capMs: 0, pace: 0 } : { capMs, pace };
      runtime.charCount = nextCharCount;
      runtime.rawLength = block.content.length;
    }

    let meta: BlockAnimationMeta;
    if (runtime.settled) {
      // Settled is monotone: a revealed block's births are frozen, so once
      // its last fade completed it stays settled until the runtime is
      // pruned by a stream restart.
      meta = { charDelay: runtime.charDelay ?? charDelay, settled: true };
    } else {
      const lastBirthTs = runtime.blockBirth ?? births.at(-1) ?? renderNow;
      meta = resolveBlockAnimationMeta({
        currentCharDelay: charDelay,
        fadeDuration: STREAM_FADE_DURATION,
        lastElapsedMs: renderNow - lastBirthTs,
        previousCharDelay: runtime.charDelay,
        state,
      });
      runtime.settled = meta.settled;
    }
    runtime.charDelay = meta.charDelay;

    blockAnimationMeta.set(block.startOffset, meta);
  }

  if (revealedNewChars) {
    revealClock.lastTs = renderNow;
  }

  for (const key of runtimes.keys()) {
    if (!alive.has(key)) {
      runtimes.delete(key);
      pluginsCache.delete(key);
    }
  }

  return blockAnimationMeta;
};

interface StreamdownBlocksProps {
  className: string | undefined;
  content: string;
  granularity: StreamAnimationGranularity;
  markdownOptions: Omit<Options, 'children'>;
  remendOptions: RemendOptions | undefined;
  tailUnitsRef: { current: number };
  streaming: boolean;
  finishing: boolean;
  animate: boolean;
  revision: number;
}

const StreamdownBlocks = memo<StreamdownBlocksProps>(
  ({ className, content: smoothedContent, granularity, markdownOptions, remendOptions, tailUnitsRef, streaming, finishing, animate, revision }) => {
    const { components: baseComponents, ...rest } = markdownOptions;
    const baseRehypePlugins = useStablePlugins(markdownOptions.rehypePlugins ?? EMPTY_PLUGINS);
    const remarkPlugins = useStablePlugins(markdownOptions.remarkPlugins ?? EMPTY_PLUGINS);
    const generatedId = useId();
    const lexBlocks = useMemo(() => createBlockLexer(remendOptions), [remendOptions, revision]);

    const components = useMemo<Options['components']>(
      () => ({ ...baseComponents, [STREAM_TAIL_TAG]: StreamTail }),
      [baseComponents],
    );

    const { blocks } = useMemo(() => lexBlocks(smoothedContent, streaming), [lexBlocks, smoothedContent, streaming]);
    tailUnitsRef.current = blocks.at(-1)?.content.length ?? 0;

    const getBlockState = (index: number): BlockState => streaming && index === blocks.length - 1 ? 'streaming' : 'revealed';
    const blockRuntimesRef = useRef<Map<number, BlockRuntime>>(new Map());
    const blockPluginsRef = useRef<Map<number, BlockPluginsCacheEntry>>(new Map());
    const revealClockRef = useRef<{ lastTs: number }>({ lastTs: 0 });
    const animationSession = useRef({ revision, baselineLength: smoothedContent.length });
    if (animationSession.current.revision !== revision || !animate || !streaming) {
      blockRuntimesRef.current.clear();
      blockPluginsRef.current.clear();
      revealClockRef.current.lastTs = 0;
      animationSession.current = { revision, baselineLength: smoothedContent.length };
    }

    const blockAnimationMeta = animate && streaming ? updateBlockAnimation({
      blocks,
      charDelay: 18,
      getBlockState,
      pluginsCache: blockPluginsRef.current,
      renderNow: getNow(),
      revealClock: revealClockRef.current,
      runtimes: blockRuntimesRef.current,
      baselineLength: animationSession.current.baselineLength,
      finishing,
    }) : undefined;

    const resolveBlockPlugins = (startOffset: number, settled: boolean): PluggableList => {
      if (settled) return baseRehypePlugins;

      const cache = blockPluginsRef.current;
      const entry = cache.get(startOffset);
      if (entry && entry.base === baseRehypePlugins && entry.granularity === granularity) {
        return entry.value;
      }

      const runtime = blockRuntimesRef.current.get(startOffset);
      const value: PluggableList = [
        ...baseRehypePlugins,
        [
          rehypeStreamAnimated,
          {
            block: runtime?.blockBirth !== undefined,
            fadeDuration: STREAM_FADE_DURATION,
            granularity,
            runtime,
          },
        ],
      ];
      cache.set(startOffset, {
        base: baseRehypePlugins,
        granularity,
        value,
      });
      return value;
    };

    // Fork: upstream wraps the blocks in React Profiler elements and mounts a
    // React 19 hoisted <style> as the first child; both are dropped here.
    return (
      <div className={className ? `${STREAMDOWN_ANIMATED_CLASS} ${className}` : STREAMDOWN_ANIMATED_CLASS}>
        {blocks.map((block: BlockInfo, index) => {
          const animationMeta = blockAnimationMeta?.get(block.startOffset);
          const plugins = resolveBlockPlugins(block.startOffset, animationMeta?.settled ?? true);

          return (
            <StreamdownBlockContext.Provider
              key={`${generatedId}-${block.startOffset}`}
              value={getBlockState(index)}
            >
              <StreamdownBlock
                {...rest}
                components={components}
                rehypePlugins={plugins}
                remarkPlugins={remarkPlugins}
              >
                {block.content}
              </StreamdownBlock>
            </StreamdownBlockContext.Provider>
          );
        })}
      </div>
    );
  },
);

StreamdownBlocks.displayName = 'StreamdownBlocks';

export interface StreamdownProps extends Omit<Options, 'children'> {
  /** Fork: extra class for the root element, next to the animation scope class. */
  className?: string | undefined;
  content: string;
  /** Upstream production; the display may briefly drain after this becomes false. */
  streaming?: boolean | undefined;
  /** Cancellation bypasses both buffering and pending fades. */
  interrupted?: boolean | undefined;
  granularity?: StreamAnimationGranularity | undefined;
  preprocess?: ((text: string) => string) | undefined;
  /**
   * Options for the remend pass that completes the open tail block, e.g.
   * `{ htmlTags: false }` when `<` is prose or math rather than HTML.
   */
  remend?: RemendOptions | undefined;
  smoothing?: StreamSmoothingPreset | undefined;
}

// The outer component absorbs the upstream per-chunk prop churn: every
// streamed chunk re-renders it, but it only feeds the smoother and renders
// a memoized child keyed on the smoother's output — so the expensive block
// pipeline runs per reveal commit, not per chunk AND per commit.
export const Streamdown = memo<StreamdownProps>(
  ({ className, content, streaming = true, interrupted = false, granularity = 'char', preprocess, remend, smoothing, ...rest }) => {
    const preprocessed = useMemo(
      () => (preprocess ? preprocess(content) : content),
      [content, preprocess],
    );
    const reducedMotion = useReducedMotion();
    const hidden = usePageHidden();
    const animate = !reducedMotion && !hidden && !interrupted;
    const source = useRef({ content: preprocessed, revision: 0, streaming });
    if (!preprocessed.startsWith(source.current.content) || streaming && !source.current.streaming) source.current.revision++;
    source.current.content = preprocessed;
    source.current.streaming = streaming;
    const revision = source.current.revision;
    const tailUnitsRef = useRef(0);
    const remendOptions = useStableValue(remend);
    const smoothedContent = useSmoothStreamContent(preprocessed, {
      streaming,
      interrupted,
      preset: smoothing ?? 'balanced',
      remend: remendOptions,
      tailUnitsRef,
    });
    const draining = smoothedContent !== preprocessed;
    const wasActive = useRef(streaming || draining);
    const [fadeComplete, setFadeComplete] = useState(false);
    const finishDeadline = useRef<number | null>(null);
    // A finite final fade keeps the last reveal from being cut off. It shares
    // the completion budget even when the producer sends a late correction.
    useEffect(() => {
      if (streaming) {
        wasActive.current = true;
        finishDeadline.current = null;
        setFadeComplete(false);
        return;
      }
      if (!animate) {
        setFadeComplete(true);
        return;
      }
      if (!wasActive.current) return;
      finishDeadline.current ??= getNow() + 220 + STREAM_FADE_DURATION;
      if (draining) return;
      const delay = Math.min(MAX_REVEAL_GAP_MS + STREAM_FADE_DURATION, Math.max(0, finishDeadline.current - getNow()));
      const timer = setTimeout(() => setFadeComplete(true), delay);
      return () => clearTimeout(timer);
    }, [animate, draining, preprocessed, streaming]);
    const displayStreaming = !interrupted && (streaming || draining || animate && wasActive.current && !fadeComplete);
    const markdownOptions = useStableValue(rest);

    return (
      <StreamdownBlocks
        className={className}
        content={smoothedContent}
        granularity={granularity}
        markdownOptions={markdownOptions}
        remendOptions={remendOptions}
        tailUnitsRef={tailUnitsRef}
        streaming={displayStreaming}
        finishing={!streaming}
        animate={animate}
        revision={revision}
      />
    );
  },
);

Streamdown.displayName = 'Streamdown';

export default Streamdown;