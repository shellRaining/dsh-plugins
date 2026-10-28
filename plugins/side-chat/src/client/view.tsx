// The side-chat tab body: header, transcript and composer.
import {
  Button,
  IconCloseOutlineRegular,
  IconContextInjectionOutlineRegular,
  IconNewChatOutlineRegular,
  MarkdownDelegateProvider,
  MarkdownText,
  PluginArtworkSubagent,
  StateDot,
  TextShimmer,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import type { Translate } from './host.ts';
import type { PanelLabels } from './labels.ts';
import { occupancyOf, type AssistantBlock, type ChatNode, type Metrics } from './model.ts';
import { ReasoningRow, ToolRow } from './process.tsx';
import type { Panel, PanelError, PanelSnapshot } from './runtime.ts';

const STICK_THRESHOLD_PX = 48;
const CONTEXT_LABELS: Record<Exclude<Extract<ChatNode, { kind: 'context' }>['tag'], 'skill'>, string> = {
  steering: 'context.steering',
  sessionReference: 'context.sessionReference',
  agentInstructions: 'context.agentInstructions',
  compactCheckpoint: 'context.compactCheckpoint',
  generic: 'context.generic',
};

export interface PanelViewProps {
  readonly panel: Panel;
  readonly t: Translate;
  readonly labels: PanelLabels;
  readonly onNew: (() => void) | null;
  readonly openFile: ((path: string, options?: { line?: number }) => void) | undefined;
}

function clock(time: number | null): string {
  if (time === null) return '';
  const date = new Date(time);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function openExternal(href: string): void {
  window.open(href, '_blank', 'noopener,noreferrer');
}

export function PanelView({ panel, t, labels, onNew, openFile }: PanelViewProps): ReactNode {
  const state = useSyncExternalStore(panel.subscribe, panel.getSnapshot);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const onScroll = useCallback(() => {
    const node = scrollRef.current;
    if (node !== null) stickRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < STICK_THRESHOLD_PX;
  }, []);
  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (node !== null && stickRef.current) node.scrollTop = node.scrollHeight;
  }, [state.nodes, state.live, state.pending, state.running, state.sending, state.error, state.agentError]);

  const busy = state.running || state.sending;
  const empty = state.nodes.length === 0 && state.pending.length === 0 && state.live.length === 0;
  return (
    <section data-side-chat="" className="dsc-root" aria-label={t('tab.title')}>
      <Header state={state} t={t} onNew={onNew} />
      <div ref={scrollRef} className="dsc-scroll" onScroll={onScroll}>
        {empty && state.error === null && state.agentError === null ? (
          <EmptyState created={state.sessionId !== null} t={t} />
        ) : (
          <MarkdownDelegateProvider openExternalLink={openExternal} openFile={openFile}>
            <div className="dsc-transcript" role="log" aria-live="polite" aria-busy={busy}>
              {state.nodes.map(node => <NodeView key={`${node.kind}-${node.seq}`} node={node} state={state} t={t} labels={labels} />)}
              {state.live.length > 0 ? (
                <AssistantView blocks={state.live} streaming running={state.running} t={t} labels={labels} />
              ) : null}
              {state.pending.map(pending => (
                <div key={pending.id} className="dsc-user">
                  <div className="dsc-bubble" data-pending="">{pending.text}</div>
                  <div className="dsc-meta">{busy && !state.sending ? t('pending.queued') : t('pending.sending')}</div>
                </div>
              ))}
              {busy && state.live.length === 0 ? (
                <TextShimmer active className="dsc-thinking">{t('thinking')}</TextShimmer>
              ) : null}
              <Notice error={state.error} agentError={state.agentError} t={t} onDismiss={() => panel.dismissError()} />
            </div>
          </MarkdownDelegateProvider>
        )}
      </div>
      <footer className="dsc-footer">
        <Composer panel={panel} state={state} t={t} />
        <UsageDock metrics={state.metrics} contextWindow={state.contextWindow} t={t} />
      </footer>
    </section>
  );
}

function Header({ state, t, onNew }: { state: PanelSnapshot; t: Translate; onNew: (() => void) | null }): ReactNode {
  const status = state.sessionId === null ? t('status.blank')
    : state.running ? t('status.running')
    : state.sending ? t('status.sending')
    : t('status.idle');
  const dot = state.gone || state.agentError !== null ? 'error'
    : state.running || state.sending ? 'ongoing'
    : 'idle';
  const queued = state.running ? state.pending.length : 0;
  return (
    <header className="dsc-header">
      <span className="dsc-status" role="status">
        <StateDot state={dot} />
        <span>{status}</span>
      </span>
      {queued > 0 ? <span className="dsc-queued">{t('status.queued', { count: queued })}</span> : null}
      <span className="dsc-header-actions">
        {onNew === null ? null : (
          <Tooltip label={t('tab.new')} side="bottom" align="end" delayMs={500} portal>
            <Button variant="ghost" size="sm" icon={<IconNewChatOutlineRegular size={16} />} aria-label={t('tab.new')} onClick={onNew} />
          </Tooltip>
        )}
      </span>
    </header>
  );
}

function EmptyState({ created, t }: { created: boolean; t: Translate }): ReactNode {
  return (
    <div className="dsc-empty">
      <PluginArtworkSubagent size={40} className="dsc-empty-art" />
      <div className="dsc-empty-title">{t('empty.title')}</div>
      <div>{created ? t('empty.created') : t('empty.blank')}</div>
    </div>
  );
}

const NodeView = memo(function NodeView({ node, state, t, labels }: { node: ChatNode; state: PanelSnapshot; t: Translate; labels: PanelLabels }) {
  if (node.kind === 'user') {
    const time = clock(node.time);
    return (
      <div className="dsc-user">
        <div className="dsc-bubble">{node.text}</div>
        {time === '' ? null : <div className="dsc-meta">{time}</div>}
      </div>
    );
  }
  if (node.kind === 'context') {
    const label = node.tag === 'skill'
      ? node.name === '' ? t('context.skill') : t('context.skillNamed', { name: node.name })
      : t(CONTEXT_LABELS[node.tag]);
    return (
      <div className="dsc-context" title={node.text.slice(0, 400)}>
        <IconContextInjectionOutlineRegular size={14} />
        <span>{label}</span>
      </div>
    );
  }
  return <AssistantView blocks={node.blocks} streaming={false} running={state.running} t={t} labels={labels} />;
}, (previous, next) => previous.node === next.node && previous.t === next.t && previous.labels === next.labels
  && (previous.node.kind !== 'assistant' || previous.state.running === next.state.running));

/** Group consecutive process blocks; text blocks render as Markdown between them. */
function AssistantView({ blocks, streaming, running, t, labels }: {
  blocks: readonly AssistantBlock[];
  streaming: boolean;
  running: boolean;
  t: Translate;
  labels: PanelLabels;
}): ReactNode {
  const groups: ReactNode[] = [];
  let process: ReactNode[] = [];
  const flush = (key: number): void => {
    if (process.length === 0) return;
    groups.push(<div key={`p${key}`} className="dsc-process">{process}</div>);
    process = [];
  };
  blocks.forEach((block, index) => {
    const last = index === blocks.length - 1;
    if (block.kind === 'reasoning') {
      process.push(<ReasoningRow key={index} text={block.text} running={streaming && last} labels={labels.markdown} t={t} />);
    } else if (block.kind === 'tool-call') {
      process.push(<ToolRow key={index} block={block} running={block.result === null && running} labels={labels} t={t} />);
    } else {
      flush(index);
      groups.push(
        <div key={index} className="dsc-markdown">
          <MarkdownText text={block.text} streaming={streaming && last} labels={labels.markdown} />
        </div>,
      );
    }
  });
  flush(blocks.length);
  return <div className="dsc-assistant">{groups}</div>;
}

function Notice({ error, agentError, t, onDismiss }: { error: PanelError | null; agentError: string | null; t: Translate; onDismiss: () => void }): ReactNode {
  if (error === null && agentError === null) return null;
  const title = error !== null ? t(`error.${error.code}`) : t('error.agent');
  const detail = error !== null ? error.message : agentError ?? '';
  return (
    <div className="dsc-notice" role="alert">
      <div className="dsc-notice-body">
        <span>{title}</span>
        {detail === '' || detail === title ? null : <span className="dsc-notice-detail">{detail}</span>}
      </div>
      <Button variant="ghost" size="sm" icon={<IconCloseOutlineRegular size={14} />} aria-label={t('notice.dismiss')} onClick={onDismiss} />
    </div>
  );
}

function isComposing(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
  // IME candidates (Chinese, Japanese…) confirm with Enter; never send then.
  return event.nativeEvent.isComposing || event.keyCode === 229;
}

function Composer({ panel, state, t }: { panel: Panel; state: PanelSnapshot; t: Translate }): ReactNode {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (input === null) return;
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
  }, [state.draft]);
  // `/side` without a question hands the keyboard to this tab once it has painted.
  useEffect(() => {
    if (state.focusRequest === 0) return undefined;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [state.focusRequest]);
  const canSend = state.draft.trim() !== '' && !state.sending && !state.gone;
  const stops = !canSend && state.running && !state.gone;
  const label = stops ? t('composer.stop') : t('composer.send');
  const placeholder = state.gone ? t('composer.gone')
    : state.sessionId === null ? t('composer.placeholderBlank')
    : t('composer.placeholder');
  const submit = (): void => {
    if (canSend) void panel.send();
    else if (stops) void panel.cancel();
  };
  return (
    <div className="dsc-card" data-side-chat-composer="">
      <textarea
        ref={inputRef}
        className="dsc-input"
        data-side-chat-input=""
        rows={1}
        value={state.draft}
        placeholder={placeholder}
        aria-label={t('composer.label')}
        disabled={state.gone}
        onChange={event => panel.setDraft(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey && !isComposing(event)) {
            event.preventDefault();
            if (canSend) void panel.send();
          } else if (event.key === 'Escape' && state.running && state.draft === '') {
            event.preventDefault();
            void panel.cancel();
          }
        }}
      />
      <div className="dsc-composer-row">
        <span className="dsc-hint">{t('empty.hint')}</span>
        <Tooltip label={label} side="top" delayMs={500} disabled={!canSend && !stops} portal>
          <button
            type="button"
            className="dsc-primary"
            aria-label={label}
            disabled={!canSend && !stops}
            onMouseDown={event => event.preventDefault()}
            onClick={submit}
          >
            {stops ? (
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <rect x="3" y="3" width="10" height="10" rx="3" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <path d="M8.3125 0.980183C8.66767 1.0531 8.97902 1.20418 9.2627 1.43233C9.48724 1.61297 9.73029 1.85793 9.97949 2.10714L14.707 6.83468L13.293 8.24874L9 3.95577V15.0417H7V3.95577L2.70703 8.24874L1.29297 6.83468L6.02051 2.10714C6.26971 1.85793 6.51277 1.61297 6.7373 1.43233C6.97662 1.23986 7.28445 1.04402 7.6875 0.980183C7.8973 0.947006 8.1031 0.95516 8.3125 0.980183Z" fill="currentColor" />
              </svg>
            )}
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

function compact(t: Translate, value: number): string {
  const scaled = (n: number): string => (n >= 100 ? String(Math.round(n)) : String(Math.round(n * 10) / 10));
  if (!(value > 0)) return '0';
  if (value < 1000) return String(Math.round(value));
  if (value < 1_000_000) return t('dock.thousand', { value: scaled(value / 1000) });
  return t('dock.million', { value: scaled(value / 1_000_000) });
}

const exact = (value: number): string => Math.max(0, Math.round(value)).toLocaleString('en-US');

function UsageDock({ metrics, contextWindow, t }: { metrics: Metrics | null; contextWindow: number | null; t: Translate }): ReactNode {
  const occupancy = useMemo(() => occupancyOf(metrics, contextWindow), [metrics, contextWindow]);
  if (metrics === null) return <div className="dsc-dock" aria-hidden="true" />;
  const usage = t(metrics.cacheWriteTokens > 0 ? 'dock.usageTitleWithWrite' : 'dock.usageTitle', {
    input: exact(metrics.uncachedInputTokens),
    cacheRead: exact(metrics.cacheReadTokens),
    cacheWrite: exact(metrics.cacheWriteTokens),
    output: exact(metrics.outputTokens),
  });
  const circumference = 2 * Math.PI * 5.5;
  return (
    <div className="dsc-dock">
      <Tooltip label={usage} side="top" delayMs={300} portal>
        <span className="dsc-dock-item">
          {t('dock.tokens', { count: compact(t, metrics.totalTokens) })}
          {metrics.cacheHitPercent === null ? null : (
            <>
              <span aria-hidden="true">·</span>
              {t('dock.cacheHit', { percent: metrics.cacheHitPercent })}
            </>
          )}
        </span>
      </Tooltip>
      {occupancy === null ? null : (
        <Tooltip label={t('dock.contextTitle', { used: exact(occupancy.usedTokens), window: exact(occupancy.contextWindow) })} side="top" delayMs={300} portal>
          <span className="dsc-dock-item" role="img" aria-label={t('dock.contextAria', { percent: occupancy.percent })}>
            <svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true">
              <circle className="dsc-ring-track" cx="7" cy="7" r="5.5" />
              <circle
                className="dsc-ring-fill"
                cx="7"
                cy="7"
                r="5.5"
                transform="rotate(-90 7 7)"
                strokeDasharray={`${circumference * occupancy.percent / 100} ${circumference}`}
              />
            </svg>
            <span>{`${occupancy.percent}%`}</span>
          </span>
        </Tooltip>
      )}
    </div>
  );
}
