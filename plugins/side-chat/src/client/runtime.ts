// Per-tab runtime: one `Panel` per side-chat tab occurrence owns one side
// session, its transport (SSE stream with a polling fallback) and an
// immutable snapshot for React. `Registry` maps tab keys to panels.
import {
  EVENTS_ROUTE,
  type LiveSnapshot,
  type SnapshotPayload,
  type StreamFrameMap,
  type WireEntry,
} from '../shared/protocol.ts';
import {
  createSseParser,
  foldEntries,
  liveBlocks,
  metricsOf,
  record,
  settles,
  type AssistantBlock,
  type ChatNode,
  type Metrics,
  type SseFrame,
} from './model.ts';
import { call, failureOf, routeUrl, toHostError, type ErrorCode, type HostError } from './transport.ts';

const POLL_RUNNING_MS = 400;
const POLL_IDLE_MS = 1500;
const HELLO_TIMEOUT_MS = 2500;
const RETRY_MS = [500, 1000, 2000, 4000, 8000] as const;
/** Stream attempts that may fail before any `hello` until polling takes over. */
const STREAM_FAILURES_BEFORE_POLL = 2;

export interface PendingMessage {
  readonly id: string;
  readonly text: string;
  readonly time: number;
  /** User-node seqs present when sent; the echo must be a newer node. */
  readonly seen: ReadonlySet<number>;
}

export interface PanelError {
  readonly code: ErrorCode;
  readonly message: string;
}

export interface PanelSnapshot {
  readonly key: string;
  readonly sourceId: string;
  readonly ordinal: number;
  readonly sessionId: string | null;
  /** The side session is gone on the host; the panel is read-only. */
  readonly gone: boolean;
  readonly nodes: readonly ChatNode[];
  readonly live: readonly AssistantBlock[];
  readonly metrics: Metrics | null;
  readonly contextWindow: number | null;
  readonly running: boolean;
  readonly sending: boolean;
  readonly draft: string;
  readonly pending: readonly PendingMessage[];
  readonly error: PanelError | null;
  readonly agentError: string | null;
  /** Bumped when an opener asks for the composer to take focus. */
  readonly focusRequest: number;
}

/** What `/side` and `/btw` hand a freshly opened tab through its navigation params. */
export interface OpenParams {
  readonly prompt?: string;
  readonly focus?: boolean;
}

interface StreamHandle {
  readonly abort: AbortController;
  hello: boolean;
  stopped: boolean;
  timedOut: boolean;
}

type Patch = { -readonly [K in keyof PanelSnapshot]?: PanelSnapshot[K] };

function panelError(error: HostError): PanelError {
  return { code: error.code, message: error.message };
}

export class Panel {
  private state: PanelSnapshot;
  private readonly entries = new Map<number, WireEntry>();
  private floor = 0;
  private liveState: LiveSnapshot | null = null;
  private readonly listeners = new Set<() => void>();
  private visible = false;
  private disposed = false;
  private mode: 'stream' | 'poll' = 'stream';
  private stream: StreamHandle | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private streamFailures = 0;
  private retryIndex = 0;
  private catchingUp = false;
  private attachTried = false;
  private navigationRevision = 0;
  private readonly onVisibility = (): void => {
    if (this.doc.hidden) this.stop();
    else this.connect();
  };

  constructor(readonly key: string, readonly sourceId: string, ordinal: number, private readonly doc: Document) {
    this.state = {
      key, sourceId, ordinal,
      sessionId: null, gone: false,
      nodes: [], live: [], metrics: null, contextWindow: null,
      running: false, sending: false, draft: '', pending: [],
      error: null, agentError: null, focusRequest: 0,
    };
    doc.addEventListener('visibilitychange', this.onVisibility);
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  readonly getSnapshot = (): PanelSnapshot => this.state;

  private update(patch: Patch): void {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    for (const listener of [...this.listeners]) {
      try { listener(); } catch { /* a broken subscriber must not stop publication */ }
    }
  }

  private get active(): boolean {
    return !this.disposed && this.visible && !this.state.gone && this.state.sessionId !== null && !this.doc.hidden;
  }

  private cursor(): number {
    let next = this.floor;
    for (const seq of this.entries.keys()) if (seq + 1 > next) next = seq + 1;
    return next;
  }

  // ---- public actions

  setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    if (!visible) { this.stop(); return; }
    if (this.state.sessionId === null) void this.attach();
    else this.connect();
  }

  setDraft(draft: string): void {
    this.update({ draft });
  }

  dismissError(): void {
    this.update({ error: null, agentError: null });
  }

  /**
   * Answer one navigation of this tab once. The tab domain rebuilds
   * occurrences without params after a page refresh, so a question handed
   * over by `/side` or `/btw` is sent exactly once.
   */
  navigate(revision: number, params: OpenParams | undefined): void {
    if (this.disposed || revision <= this.navigationRevision) return;
    this.navigationRevision = revision;
    const prompt = params?.prompt?.trim() ?? '';
    if (prompt !== '') void this.deliver(prompt, false);
    else if (params?.focus === true) this.update({ focusRequest: this.state.focusRequest + 1 });
  }

  async send(): Promise<void> {
    await this.deliver(this.state.draft.trim(), true);
  }

  private async deliver(text: string, fromDraft: boolean): Promise<void> {
    if (text === '' || this.state.sending || this.state.gone || this.disposed) return;
    const seen = new Set<number>();
    for (const node of this.state.nodes) if (node.kind === 'user') seen.add(node.seq);
    const pending: PendingMessage = { id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, text, time: Date.now(), seen };
    this.update({ sending: true, error: null, draft: fromDraft ? '' : this.state.draft, pending: [...this.state.pending, pending] });
    try {
      let sessionId = this.state.sessionId;
      if (sessionId === null) {
        const created = await call('create', { sourceId: this.sourceId, instanceKey: this.key });
        if (this.disposed) {
          void call('close', { sessionId: created.sessionId }).catch(() => undefined);
          return;
        }
        sessionId = created.sessionId;
        // The refresh re-attach may have adopted the same session meanwhile.
        if (this.state.sessionId !== sessionId) this.adopt(sessionId, created.inheritedEventCount);
      }
      await call('prompt', { sessionId, text });
      this.update({ sending: false });
      if (this.mode === 'poll') this.schedule(0);
    } catch (error) {
      if (this.disposed) return;
      const failure = toHostError(error);
      this.update({
        sending: false,
        pending: this.state.pending.filter(item => item.id !== pending.id),
        draft: this.state.draft === '' ? text : this.state.draft,
        error: panelError(failure),
      });
      if (failure.code === 'not-found') this.lost(failure);
    }
  }

  async cancel(): Promise<void> {
    const sessionId = this.state.sessionId;
    if (sessionId === null || this.state.gone) return;
    try {
      await call('cancel', { sessionId });
    } catch (error) {
      this.update({ error: panelError(toHostError(error)) });
    }
  }

  /** Tab closed: stop everything and destroy the host side session. */
  async close(): Promise<void> {
    const sessionId = this.state.sessionId;
    this.dispose();
    if (sessionId === null) return;
    try {
      await call('close', { sessionId });
    } catch (error) {
      console.warn('[dsh-side-chat] close failed:', toHostError(error).message);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.stop();
    this.doc.removeEventListener('visibilitychange', this.onVisibility);
    this.disposed = true;
    this.listeners.clear();
  }

  // ---- session lifecycle

  /** After a page refresh the host may still own this tab's side session. */
  private async attach(): Promise<void> {
    if (this.attachTried) return;
    this.attachTried = true;
    try {
      const found = await call('create', { sourceId: this.sourceId, instanceKey: this.key, attachOnly: true });
      if (this.disposed || this.state.sessionId !== null) return;
      this.adopt(found.sessionId, found.inheritedEventCount);
    } catch {
      // Nothing to re-attach to: the side session starts on the first message.
    }
  }

  private adopt(sessionId: string, inheritedEventCount: number): void {
    this.floor = inheritedEventCount;
    this.update({ sessionId });
    this.connect();
  }

  private lost(error: HostError): void {
    this.stop();
    this.liveState = null;
    this.update({ gone: true, running: false, live: [], error: panelError(error) });
  }

  // ---- state folding

  private merge(entries: readonly WireEntry[]): boolean {
    let added = false;
    let settled = false;
    for (const entry of entries) {
      if (typeof entry?.seq !== 'number' || this.entries.has(entry.seq)) continue;
      this.entries.set(entry.seq, entry);
      added = true;
      if (settles(this.liveState, entry)) settled = true;
    }
    if (!added) return false;
    if (settled) this.liveState = null;
    const ordered = [...this.entries.values()].sort((a, b) => a.seq - b.seq);
    const nodes = foldEntries(ordered, this.floor);
    this.state = {
      ...this.state,
      nodes,
      metrics: metricsOf(ordered, this.floor),
      pending: this.reconcile(nodes),
      live: liveBlocks(this.liveState),
    };
    return true;
  }

  /** Drop pending rows whose echo arrived as a newer user node with the same text. */
  private reconcile(nodes: readonly ChatNode[]): readonly PendingMessage[] {
    if (this.state.pending.length === 0) return this.state.pending;
    const used = new Set<number>();
    const remaining = this.state.pending.filter(pending => {
      const match = nodes.find(node => node.kind === 'user' && node.text === pending.text && !used.has(node.seq) && !pending.seen.has(node.seq));
      if (match === undefined) return true;
      used.add(match.seq);
      return false;
    });
    return remaining.length === this.state.pending.length ? this.state.pending : remaining;
  }

  private applyBaseline(payload: SnapshotPayload): void {
    if (typeof payload.inheritedEventCount === 'number') this.floor = payload.inheritedEventCount;
    this.merge(payload.entries ?? []);
    if (payload.live !== undefined) this.liveState = payload.live;
    this.update({
      live: liveBlocks(this.liveState),
      running: payload.running === true || payload.status === 'running',
      agentError: payload.lastError ?? null,
      ...(typeof payload.contextWindow === 'number' && payload.contextWindow > 0 ? { contextWindow: payload.contextWindow } : {}),
      ...(this.state.error?.code === 'network' ? { error: null } : {}),
    });
  }

  private onFrame(frame: SseFrame): void {
    const data = record(frame.data);
    switch (frame.event) {
      case 'hello':
        this.applyBaseline(data as unknown as StreamFrameMap['hello']);
        return;
      case 'event': {
        const entry = (data as unknown as StreamFrameMap['event']).entry;
        if (entry !== undefined && this.merge([entry])) this.update({});
        return;
      }
      case 'live': {
        const hadAttempt = Boolean(this.liveState?.activeAttempt);
        this.liveState = (data as unknown as StreamFrameMap['live']).live ?? null;
        this.update({ live: liveBlocks(this.liveState) });
        // The attempt ended: make sure its settlement is not missed.
        if (hadAttempt && !this.liveState?.activeAttempt) this.catchUp();
        return;
      }
      case 'status':
        this.update({ running: data.running === true || data.status === 'running' });
        return;
      case 'error':
        this.update({ agentError: typeof data.message === 'string' ? data.message : null });
        return;
      default:
        return;
    }
  }

  // ---- transport

  private stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const stream = this.stream;
    if (stream !== null) {
      stream.stopped = true;
      this.stream = null;
      stream.abort.abort();
    }
  }

  private connect(): void {
    if (this.stream !== null || this.timer !== null) return;
    if (!this.active) return;
    if (this.mode === 'stream') void this.openStream();
    else void this.poll();
  }

  private schedule(delay: number): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (!this.active || this.stream !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.mode === 'stream') void this.openStream();
      else void this.poll();
    }, Math.max(0, delay));
  }

  /** One snapshot pull. Returns false when the panel should stop updating. */
  private async fetchSnapshot(): Promise<boolean> {
    const sessionId = this.state.sessionId;
    if (sessionId === null || this.disposed) return false;
    try {
      const payload = await call('snapshot', { sessionId, fromSeq: this.cursor() });
      if (this.disposed || this.state.sessionId !== sessionId) return false;
      this.applyBaseline(payload);
      return true;
    } catch (error) {
      if (this.disposed) return false;
      const failure = toHostError(error);
      if (failure.code === 'not-found') {
        this.lost(failure);
        return false;
      }
      this.update({ error: panelError(failure) });
      return true;
    }
  }

  private async poll(): Promise<void> {
    if (!this.active || this.stream !== null) return;
    const alive = await this.fetchSnapshot();
    if (alive && this.mode === 'poll') this.schedule(this.state.running ? POLL_RUNNING_MS : POLL_IDLE_MS);
  }

  private catchUp(): void {
    if (this.catchingUp) return;
    this.catchingUp = true;
    void this.fetchSnapshot().finally(() => { this.catchingUp = false; });
  }

  private degrade(): void {
    this.mode = 'poll';
    this.schedule(0);
  }

  private async openStream(): Promise<void> {
    const sessionId = this.state.sessionId;
    if (!this.active || this.stream !== null || sessionId === null) return;
    const stream: StreamHandle = { abort: new AbortController(), hello: false, stopped: false, timedOut: false };
    this.stream = stream;
    const helloTimer = setTimeout(() => {
      if (stream.hello) return;
      stream.timedOut = true;
      stream.abort.abort();
    }, HELLO_TIMEOUT_MS);
    try {
      const response = await fetch(routeUrl(EVENTS_ROUTE), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ sessionId, fromSeq: this.cursor() }),
        credentials: 'same-origin',
        signal: stream.abort.signal,
      });
      const type = response.headers.get('content-type') ?? '';
      if (!type.includes('text/event-stream') || response.body === null) {
        // A JSON answer is the documented "cannot stream" reply.
        const payload: unknown = await response.json().catch(() => null);
        const failure = failureOf(payload, response.status);
        if (stream.stopped) return;
        this.stream = null;
        if (failure.code === 'not-found') this.lost(failure);
        else this.degrade();
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const parser = createSseParser();
      for (;;) {
        const { done, value } = await reader.read();
        if (done || stream.stopped) break;
        for (const frame of parser.push(decoder.decode(value, { stream: true }))) {
          if (frame.event === 'hello') {
            stream.hello = true;
            clearTimeout(helloTimer);
            this.streamFailures = 0;
            this.retryIndex = 0;
          }
          this.onFrame(frame);
          if (stream.stopped) break;
        }
      }
    } catch {
      // Classified below from the handle's flags.
    } finally {
      clearTimeout(helloTimer);
    }
    if (stream.stopped) return;
    if (this.stream === stream) this.stream = null;
    if (this.disposed || this.state.gone) return;
    if (stream.timedOut) {
      this.degrade();
      return;
    }
    if (stream.hello) {
      // A healthy stream ended (host restart, proxy timeout): catch up, then reconnect.
      this.catchUp();
    } else if (++this.streamFailures >= STREAM_FAILURES_BEFORE_POLL) {
      this.degrade();
      return;
    }
    const delay = RETRY_MS[Math.min(this.retryIndex, RETRY_MS.length - 1)] ?? 1000;
    this.retryIndex += 1;
    this.schedule(delay);
  }
}

/** Tab key -> panel, plus per-parent ordinals for distinguishable tab titles. */
export class Registry {
  private readonly panels = new Map<string, Panel>();
  private readonly ordinals = new Map<string, number>();
  private readonly listeners = new Set<() => void>();
  private version = 0;

  constructor(private readonly doc: Document) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  readonly getVersion = (): number => this.version;

  private emit(): void {
    this.version += 1;
    for (const listener of [...this.listeners]) {
      try { listener(); } catch { /* keep publishing */ }
    }
  }

  /** Get or create the panel of one tab occurrence. */
  open(key: string, sourceId: string): Panel {
    const existing = this.panels.get(key);
    if (existing !== undefined) return existing;
    const ordinal = (this.ordinals.get(sourceId) ?? 0) + 1;
    this.ordinals.set(sourceId, ordinal);
    const panel = new Panel(key, sourceId, ordinal, this.doc);
    this.panels.set(key, panel);
    queueMicrotask(() => this.emit());
    return panel;
  }

  get(key: string): Panel | undefined {
    return this.panels.get(key);
  }

  /**
   * A tab closed. A panel that never mounted in this page (restored tab after
   * a refresh) still owns a host side session under its key: resolve it
   * without creating one, then destroy it.
   */
  async close(key: string, sourceId: string): Promise<void> {
    const panel = this.panels.get(key);
    if (panel === undefined) {
      try {
        const found = await call('create', { sourceId, instanceKey: key, attachOnly: true });
        await call('close', { sessionId: found.sessionId });
      } catch {
        // Nothing live under this key.
      }
      return;
    }
    this.panels.delete(key);
    // The last tab of a parent releases its ordinal so a fresh one is untitled again.
    if (![...this.panels.values()].some(other => other.sourceId === panel.sourceId)) this.ordinals.delete(panel.sourceId);
    this.emit();
    await panel.close();
  }

  dispose(): void {
    for (const panel of this.panels.values()) panel.dispose();
    this.panels.clear();
    this.ordinals.clear();
    this.emit();
    this.listeners.clear();
  }
}

/** Runtime key of one tab: the parent id disambiguates tab ids repeated across sessions. */
export function panelKey(sessionId: string, tabId: string | undefined): string {
  return tabId === undefined || tabId === '' ? sessionId : `${sessionId}#${tabId}`;
}
