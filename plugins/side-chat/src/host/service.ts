// Side-session lifecycle: creation from a parent agent, prompting, cancel,
// close with artifact cleanup, the committed-event snapshot, and the SSE
// stream of the live attempt plus newly committed events.

import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { basename, dirname, isAbsolute } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type {
  CreateResult,
  LiveSnapshot,
  Result,
  SnapshotPayload,
  StreamFrameMap,
  StreamFrameName,
} from '../shared/protocol.ts';
import { BOUNDARY_SOURCE_KIND, SESSION_ID_PREFIX } from '../shared/protocol.ts';
import { projectEntry, snapshotEntries } from './entries.ts';
import { isJsonObject, readJsonBody, SSE_HEADERS, SSE_HEARTBEAT, sseFrame, trySendJson } from './http.ts';
import { LiveAttemptState } from './live.ts';
import {
  completedTurnPrefix,
  recentMainContext,
  sideConversationBoundaryPrompt,
  sideDeveloperInstructions,
} from './seed.ts';
import type {
  Agent,
  AgentContext,
  AgentHandle,
  AgentRouteOptions,
  Disposer,
  HostContext,
  SessionHeader,
  SideSessionMeta,
  SystemPromptService,
  UserMessage,
} from './types.ts';
import type { UnknownRecord } from './util.ts';
import { errorMessage, failure, isRecord, success, toDisposer } from './util.ts';

type Empty = Record<never, never>;

const DRAIN_DELAY_MS = 300;
const SSE_HEARTBEAT_MS = 15_000;
const DEVELOPER_SECTION_NAME = 'side-chat:instructions';
const DEVELOPER_SECTION_ORDER_FALLBACK = 9000;
const APPROVAL_OVERRIDE_SOURCE = 'delegation';
const SANDBOX_OVERRIDE_SOURCE = 'delegation';
const UNLOADING = 'side-chat plugin is unloading';
/**
 * Durable producer attribution of the injected boundary message. The V4
 * session format refuses retired `{ kind: 'plugin', plugin }` message sources,
 * so the producer-owned kind is written directly.
 */
const BOUNDARY_SOURCE = Object.freeze({ kind: BOUNDARY_SOURCE_KIND });

interface SideSession {
  readonly sessionId: string;
  /** `instanceKey` when the client sent one, otherwise `source:<sourceId>`. */
  readonly identity: string;
  readonly handle: AgentHandle;
  readonly inheritedEventCount: number;
}

interface EventStream {
  readonly sessionId: string;
  readonly res: ServerResponse;
  readonly floor: number;
  /** Highest committed seq already delivered on this stream. */
  cursor: number;
  heartbeat: ReturnType<typeof setInterval> | undefined;
  detach: Disposer | undefined;
  closed: boolean;
}

function stringArg(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function toNonNegativeInteger(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : undefined;
}

/**
 * Resolve the persisted session's own artifact directory from a persistence
 * location, with the guardrails that keep deletion scoped: an absolute log
 * path whose directory is exactly a side-chat session id (no parent or sibling).
 * @param header - the session header (its id names the directory).
 * @param location - a backend `locate()` result, `{ path }` when it has one.
 * @returns the absolute directory to remove, or undefined when the location
 *   cannot be attributed to this exact side session.
 */
export function artifactDirectory(header: SessionHeader | undefined, location: unknown): string | undefined {
  const path = isRecord(location) ? location.path : undefined;
  const id = header?.id;
  if (typeof path !== 'string' || !isAbsolute(path)) return undefined;
  if (typeof id !== 'string' || !id.startsWith(SESSION_ID_PREFIX)) return undefined;
  const dir = dirname(path);
  return basename(dir) === id ? dir : undefined;
}

/**
 * Current request context window of one side session. A seeded side session
 * usually inherits the parent's `request/context` and never appends its own,
 * so the host reports the denominator on the baseline payloads instead.
 * @param agent - the side session's Agent.
 * @returns the positive context window in tokens, or undefined.
 */
export function requestContextWindow(agent: Agent): number | undefined {
  const session = agent.session;
  if (session === undefined || typeof session.requestContext !== 'function') return undefined;
  let context: unknown;
  try {
    context = session.requestContext();
  } catch {
    return undefined;
  }
  const value = isRecord(context) ? context.contextWindow : undefined;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function developerSectionOrder(systemPrompt: SystemPromptService): number {
  const suffixOrder = systemPrompt.getSectionOrder?.('DEPLOYMENT_PERSONA_SUFFIX');
  return typeof suffixOrder === 'number' && Number.isFinite(suffixOrder)
    ? suffixOrder - 10
    : DEVELOPER_SECTION_ORDER_FALLBACK;
}

/**
 * The parent's model route: the request header's resolved config when it names
 * a provider and model, otherwise the parent's constructor options.
 */
function routeOptions(parent: Agent): AgentRouteOptions {
  const session = parent.session;
  const requestHeader = typeof session?.requestHeader === 'function' ? session.requestHeader() : undefined;
  const config = isRecord(requestHeader) ? requestHeader.config : undefined;
  const route: UnknownRecord = isRecord(config) && nonEmptyString(config.provider) && nonEmptyString(config.model)
    ? config
    : isRecord(parent.options) ? parent.options : {};
  const { provider, model, reasoningEffort, maxTokens } = route;
  return {
    ...(typeof provider === 'string' ? { provider } : {}),
    ...(typeof model === 'string' ? { model } : {}),
    ...(typeof reasoningEffort === 'string' ? { reasoningEffort } : {}),
    ...(typeof maxTokens === 'number' ? { maxTokens } : {}),
  };
}

export class SideChatService {
  private readonly ctx: HostContext;
  private readonly entries = new Map<string, SideSession>();
  /** identity -> sessionId (idempotent create and attach). */
  private readonly byIdentity = new Map<string, string>();
  /** identity -> in-flight create result (deduplicates concurrent creates). */
  private readonly pendingCreates = new Map<string, Promise<Result<CreateResult>>>();
  /** sessionId -> last contained agent failure, for the panel error banner. */
  private readonly lastErrors = new Map<string, string>();
  /** sessionId -> live attempt fold (fed even with no stream client connected). */
  private readonly liveStates = new Map<string, LiveAttemptState>();
  /** sessionId -> open SSE streams. */
  private readonly streams = new Map<string, Set<EventStream>>();
  /** Disposers of the Cordis event listeners, called at plugin unload. */
  private readonly listenerDisposers: Disposer[] = [];
  /** Set at plugin unload so a creation still in flight cannot leak its agent. */
  private closing = false;

  constructor(ctx: HostContext) {
    this.ctx = ctx;
    this.listen('agent/error', (payload) => this.onAgentError(payload));
    this.listen('agent/status', (payload) => this.onAgentStatus(payload));
    // A root-level listener receives every agent's frames; filter by owned id.
    this.listen('agent/assistant-stream', (payload) => this.onAssistantStream(payload));
    this.listen('session/event', (session, event) => this.onSessionEvent(session, event));
  }

  private listen(eventName: string, listener: (...args: unknown[]) => void): void {
    const dispose = toDisposer(this.ctx.on?.(eventName, listener));
    if (dispose !== undefined) this.listenerDisposers.push(dispose);
  }

  private warn(message: string): void {
    this.ctx.logger?.warn?.(`[side-chat] ${message}`);
  }

  private entryOf(sessionId: string): SideSession | undefined {
    return sessionId === '' ? undefined : this.entries.get(sessionId);
  }

  /** The id of an owned side agent named by an `agent/*` event payload. */
  private ownedAgentId(payload: unknown): string | undefined {
    const agent = isRecord(payload) ? payload.agent : undefined;
    const id = isRecord(agent) ? agent.id : undefined;
    return typeof id === 'string' && this.entries.has(id) ? id : undefined;
  }

  /** Record one contained side-session failure and push it to open streams. */
  private onAgentError(payload: unknown): void {
    const id = this.ownedAgentId(payload);
    if (id === undefined) return;
    const error = isRecord(payload) ? payload.error : undefined;
    const message = error instanceof Error
      ? error.message
      : String((isRecord(error) ? error.message : undefined) ?? error);
    this.lastErrors.set(id, message);
    this.broadcast(id, 'error', { message });
  }

  /** Push one agent status transition to open streams of an owned session. */
  private onAgentStatus(payload: unknown): void {
    const id = this.ownedAgentId(payload);
    if (id === undefined) return;
    const status = isRecord(payload) ? payload.status : undefined;
    this.broadcast(id, 'status', { status: stringArg(status), running: status === 'running' });
  }

  /**
   * Fold one attempt frame into the session's live state. State is kept even
   * without a stream client because the snapshot route serves it as fallback.
   */
  private onAssistantStream(payload: unknown): void {
    const id = this.ownedAgentId(payload);
    if (id === undefined) return;
    let state = this.liveStates.get(id);
    if (state === undefined) {
      state = new LiveAttemptState();
      this.liveStates.set(id, state);
    }
    if (state.accept(isRecord(payload) ? payload.frame : undefined)) this.broadcastLive(id);
  }

  /**
   * Observe committed session events: settle the active live attempt when its
   * message commits (before the matching `end` frame arrives) and forward every
   * new committed event to open streams in sequence order.
   */
  private onSessionEvent(session: unknown, event: unknown): void {
    const record = isRecord(session) ? session : undefined;
    const header = isRecord(record?.header) ? record.header : undefined;
    const id = typeof record?.id === 'string' ? record.id : header?.id;
    if (typeof id !== 'string' || !this.entries.has(id)) return;
    if (!isRecord(event)) return;
    const state = this.liveStates.get(id);
    if (state !== undefined && (event.type === 'assistant/message' || event.type === 'assistant/attempt')) {
      const data = isRecord(event.data) ? event.data : undefined;
      if (state.settle(data?.turn, data?.step)) this.broadcastLive(id);
    }
    this.broadcastEvent(id, event);
  }

  /** Push an authoritative replacement of one session's live state to streams. */
  private broadcastLive(sessionId: string): void {
    const streams = this.streams.get(sessionId);
    if (streams === undefined || streams.size === 0) return;
    this.broadcast(sessionId, 'live', { live: this.liveOf(sessionId) });
  }

  /** Write one SSE frame to every open stream of one side session. */
  private broadcast<K extends StreamFrameName>(sessionId: string, eventName: K, value: StreamFrameMap[K]): void {
    const streams = this.streams.get(sessionId);
    if (streams === undefined || streams.size === 0) return;
    let frame: string;
    try {
      frame = sseFrame(eventName, value);
    } catch (error) {
      this.warn(`${eventName} frame not serializable: ${errorMessage(error)}`);
      return;
    }
    for (const stream of [...streams]) this.writeStream(stream, frame);
  }

  /** Write one committed session event to streams that have not seen its seq. */
  private broadcastEvent(sessionId: string, event: unknown): void {
    const streams = this.streams.get(sessionId);
    if (streams === undefined || streams.size === 0) return;
    const entry = projectEntry(event);
    if (entry === undefined) return;
    let frame: string;
    try {
      frame = sseFrame('event', { entry });
    } catch (error) {
      this.warn(`event frame not serializable: ${errorMessage(error)}`);
      return;
    }
    for (const stream of [...streams]) {
      if (entry.seq < stream.floor || entry.seq <= stream.cursor) continue;
      if (this.writeStream(stream, frame)) stream.cursor = entry.seq;
    }
  }

  /** Write raw SSE text to one stream; a failed or ended carrier ends the stream. */
  private writeStream(stream: EventStream, text: string): boolean {
    if (stream.closed) return false;
    if (stream.res.writableEnded || stream.res.destroyed) {
      this.endStream(stream);
      return false;
    }
    try {
      stream.res.write(text);
      return true;
    } catch (error) {
      this.warn(`event stream write failed: ${errorMessage(error)}`);
      this.endStream(stream);
      return false;
    }
  }

  /** Tear down one stream: clear its heartbeat, detach listeners, end the response. */
  private endStream(stream: EventStream): void {
    if (stream.closed) return;
    stream.closed = true;
    if (stream.heartbeat !== undefined) {
      clearInterval(stream.heartbeat);
      stream.heartbeat = undefined;
    }
    const streams = this.streams.get(stream.sessionId);
    if (streams !== undefined) {
      streams.delete(stream);
      if (streams.size === 0) this.streams.delete(stream.sessionId);
    }
    const detach = stream.detach;
    stream.detach = undefined;
    try {
      detach?.();
    } catch {
      // Detaching a listener must never keep the response open.
    }
    try {
      if (!stream.res.writableEnded) stream.res.end();
    } catch {
      // The client may already have gone away; closing is best effort.
    }
  }

  /** End every open stream of one side session (close / unload). */
  private endStreamsFor(sessionId: string): void {
    const streams = this.streams.get(sessionId);
    if (streams === undefined) return;
    for (const stream of [...streams]) this.endStream(stream);
    this.streams.delete(sessionId);
  }

  /** Current live state of one side session for `live` frames and snapshots. */
  private liveOf(sessionId: string): LiveSnapshot | null {
    return this.liveStates.get(sessionId)?.snapshot() ?? null;
  }

  /**
   * Create (or re-attach to) the side session of one identity. The identity is
   * the opaque client `instanceKey` when one was sent (one side session per
   * client tab instance), otherwise `source:<sourceId>` (one per parent). With
   * `attachOnly`, an existing or in-flight session is returned and a missing
   * one is `not-found`: no agent is ever created, and the parent need not be live.
   */
  async create(args: UnknownRecord): Promise<Result<CreateResult>> {
    if (this.closing) return failure('internal', UNLOADING);
    const sourceId = stringArg(args.sourceId);
    if (sourceId === '') return failure('unknown-source', 'missing sourceId');
    const attachOnly = args.attachOnly === true;
    let parent: Agent | undefined;
    if (!attachOnly) {
      parent = this.ctx.agents.get(sourceId);
      if (parent === undefined) return failure('unknown-source', `unknown source session "${sourceId}"`);
    }
    const instanceKey = args.instanceKey;
    const identity = nonEmptyString(instanceKey) ? instanceKey : `source:${sourceId}`;
    const existingId = this.byIdentity.get(identity);
    if (existingId !== undefined) {
      const existing = this.entries.get(existingId);
      if (existing !== undefined) {
        return success({ sessionId: existingId, inheritedEventCount: existing.inheritedEventCount });
      }
      this.byIdentity.delete(identity);
    }
    const inflight = this.pendingCreates.get(identity);
    if (inflight !== undefined) return await inflight;
    if (parent === undefined) return failure('not-found');
    const started = this.createSession(sourceId, parent, identity);
    this.pendingCreates.set(identity, started);
    try {
      return await started;
    } finally {
      if (this.pendingCreates.get(identity) === started) this.pendingCreates.delete(identity);
    }
  }

  private async createSession(sourceId: string, parent: Agent, identity: string): Promise<Result<CreateResult>> {
    const ctx = this.ctx;
    const parentSession = parent.session;
    try {
      const events = typeof parentSession?.snapshotEvents === 'function' ? parentSession.snapshotEvents() : [];
      const seed = completedTurnPrefix(events);
      const inheritedEventCount = seed.length;
      const recentContext = recentMainContext(events, inheritedEventCount);
      const header: SessionHeader = parentSession?.header ?? {};
      const agentPreset = ctx.get('agentPresets')?.composedPreset?.(parent.ctx);
      const sandboxMode = ctx.get('sandboxPolicy')?.overrideOf?.(parentSession);
      const approvalPolicy = ctx.get('approval')?.overrideOf?.(parentSession);
      const sessionId = `${SESSION_ID_PREFIX}${randomUUID()}`;
      const boundaryText = sideConversationBoundaryPrompt(String(header.id ?? sourceId), recentContext);
      const meta: SideSessionMeta = {
        ...(typeof header.cwd === 'string' ? { cwd: header.cwd } : {}),
        ...(nonEmptyString(agentPreset) ? { agentPreset } : {}),
        ...(inheritedEventCount > 0 ? { isSeeded: true as const } : {}),
        origin: 'subagent',
      };
      const boundary: UserMessage = {
        id: `${SESSION_ID_PREFIX}boundary-${randomUUID()}`,
        role: 'user',
        content: [{ type: 'text', text: boundaryText }],
        source: BOUNDARY_SOURCE,
      };
      const setup = (childCtx: AgentContext, agent: Agent): void => {
        childCtx.get('agentPresets')?.composeFrom?.(childCtx, parent.ctx);
        const session = agent.session;
        if (session === undefined) throw new Error('side agent has no session');
        if (sandboxMode !== undefined) {
          session.append('sandbox/mode', { mode: sandboxMode, source: SANDBOX_OVERRIDE_SOURCE });
        }
        if (approvalPolicy !== undefined) {
          session.append('approval/policy', { policy: approvalPolicy, source: APPROVAL_OVERRIDE_SOURCE });
        }
        session.append('user/message', boundary, { surfaceOp: 'append' });
        childCtx.systemPrompt.section({
          name: DEVELOPER_SECTION_NAME,
          order: developerSectionOrder(childCtx.systemPrompt),
          text: sideDeveloperInstructions(),
        });
      };
      const handle = await ctx.agents.create({
        sessionId,
        meta,
        ...(inheritedEventCount > 0 ? { seed, inheritedEventCount } : {}),
        agentOptions: routeOptions(parent),
        setup,
      });
      if (this.closing) {
        await this.retire(sessionId, handle);
        return failure('internal', UNLOADING);
      }
      this.entries.set(sessionId, { sessionId, identity, handle, inheritedEventCount });
      this.byIdentity.set(identity, sessionId);
      return success({ sessionId, inheritedEventCount });
    } catch (error) {
      return failure('create-failed', errorMessage(error));
    }
  }

  async prompt(args: UnknownRecord): Promise<Result> {
    const sessionId = stringArg(args.sessionId);
    const text = typeof args.text === 'string' ? args.text : '';
    if (text.trim() === '') return failure('empty-prompt');
    const entry = this.entryOf(sessionId);
    if (entry === undefined) return failure('not-found');
    try {
      entry.handle.agent.followup({
        id: `${SESSION_ID_PREFIX}message-${randomUUID()}`,
        role: 'user',
        content: [{ type: 'text', text }],
        source: { kind: 'user' },
      });
    } catch (error) {
      return failure('prompt-failed', errorMessage(error));
    }
    return success<Empty>({});
  }

  async cancel(args: UnknownRecord): Promise<Result> {
    const entry = this.entryOf(stringArg(args.sessionId));
    if (entry === undefined) return failure('not-found');
    entry.handle.agent.cancel({ kind: 'user' });
    return success<Empty>({});
  }

  async snapshot(args: UnknownRecord): Promise<Result<SnapshotPayload>> {
    const sessionId = stringArg(args.sessionId);
    const entry = this.entryOf(sessionId);
    if (entry === undefined) return failure('not-found');
    return success(this.baseline(entry, args.fromSeq).payload);
  }

  async close(args: UnknownRecord): Promise<Result> {
    const sessionId = stringArg(args.sessionId);
    const entry = this.entryOf(sessionId);
    if (entry === undefined) return failure('not-found');
    this.entries.delete(sessionId);
    // Remove the identity mapping only when it still points at this session: a
    // recreated instance key may already own a newer side session.
    if (this.byIdentity.get(entry.identity) === sessionId) this.byIdentity.delete(entry.identity);
    this.lastErrors.delete(sessionId);
    this.liveStates.delete(sessionId);
    this.endStreamsFor(sessionId);
    const artifactDir = this.locateArtifact(entry.handle.agent);
    try {
      await entry.handle.dispose();
    } catch (error) {
      return failure('dispose-failed', errorMessage(error));
    }
    if (artifactDir !== undefined) await this.removeArtifact(sessionId, artifactDir);
    return success<Empty>({});
  }

  /**
   * The event floor of one owned session: never below the inherited prefix,
   * never below an explicitly requested sequence.
   */
  private eventFloor(entry: SideSession, fromSeq: unknown): { inheritedEventCount: number; floor: number } {
    const fromSession = entry.handle.agent.session?.inheritedEventCount;
    const inheritedEventCount = Number.isSafeInteger(entry.inheritedEventCount)
      ? entry.inheritedEventCount
      : typeof fromSession === 'number' && Number.isSafeInteger(fromSession) ? fromSession : 0;
    const requested = toNonNegativeInteger(fromSeq);
    return { inheritedEventCount, floor: Math.max(inheritedEventCount, requested ?? inheritedEventCount) };
  }

  /** The baseline shared by the `snapshot` route and the stream's `hello` frame. */
  private baseline(entry: SideSession, fromSeq: unknown): { payload: SnapshotPayload; floor: number } {
    const { sessionId, handle: { agent } } = entry;
    const { inheritedEventCount, floor } = this.eventFloor(entry, fromSeq);
    const session = agent.session;
    const events = typeof session?.snapshotEvents === 'function' ? session.snapshotEvents(floor) : [];
    const { entries, truncated } = snapshotEntries(events, floor);
    const status = stringArg(agent.status);
    const contextWindow = requestContextWindow(agent);
    return {
      floor,
      payload: {
        inheritedEventCount,
        status,
        running: status === 'running',
        lastError: this.lastErrors.get(sessionId) ?? null,
        ...(contextWindow === undefined ? {} : { contextWindow }),
        entries,
        truncated,
        live: this.liveOf(sessionId),
      },
    };
  }

  /**
   * Serve one `text/event-stream` stream of the live assistant attempt and newly
   * committed events. `webServer.register` hands this a raw Node request and
   * response with direct ownership, so failure before the stream starts is a
   * normal JSON response (the client then falls back to polling) and every
   * write/cleanup is contained here.
   */
  async openEventStream(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let args: UnknownRecord;
    try {
      const parsed = await readJsonBody(req);
      if (!isJsonObject(parsed)) throw new Error('request body must be a JSON object');
      args = parsed;
    } catch (error) {
      this.warn(`rejected event stream request: ${errorMessage(error)}`);
      trySendJson(res, failure('internal', `invalid request body: ${errorMessage(error)}`), this.ctx.logger);
      return;
    }
    const entry = this.entryOf(stringArg(args.sessionId));
    if (entry === undefined) {
      trySendJson(res, failure('not-found'), this.ctx.logger);
      return;
    }
    try {
      this.startEventStream(req, res, entry, args.fromSeq);
    } catch (error) {
      this.warn(`event stream setup failed: ${errorMessage(error)}`);
      try {
        res.end();
      } catch {
        // Already torn down by the failure that got us here.
      }
    }
  }

  /**
   * Write the stream headers and the `hello` baseline, then register the stream
   * for subsequent committed events, live frames and status/error frames. Runs
   * synchronously so no session event can slip between the hello snapshot and
   * the stream's registration.
   */
  private startEventStream(req: IncomingMessage, res: ServerResponse, entry: SideSession, fromSeq: unknown): void {
    const { sessionId } = entry;
    const { payload, floor } = this.baseline(entry, fromSeq);
    const last = payload.entries.at(-1);
    const stream: EventStream = {
      sessionId,
      res,
      floor,
      // Everything at or below this seq is already represented in the hello frame.
      cursor: last === undefined ? floor - 1 : last.seq,
      heartbeat: undefined,
      detach: undefined,
      closed: false,
    };
    res.writeHead(200, SSE_HEADERS);
    // Observe disconnects before writing: the response may close while the
    // hello frame is written.
    const onClose = (): void => this.endStream(stream);
    req.on('close', onClose);
    res.on('close', onClose);
    stream.detach = () => {
      req.off('close', onClose);
      res.off('close', onClose);
    };
    this.writeStream(stream, sseFrame('hello', success(payload)));
    if (stream.closed) return;
    let streams = this.streams.get(sessionId);
    if (streams === undefined) {
      streams = new Set();
      this.streams.set(sessionId, streams);
    }
    streams.add(stream);
    // Heartbeat comments keep idle connections (and intermediary proxies)
    // alive; unref so shutdown never waits on the interval.
    const heartbeat = setInterval(() => this.writeStream(stream, SSE_HEARTBEAT), SSE_HEARTBEAT_MS);
    heartbeat.unref();
    stream.heartbeat = heartbeat;
  }

  /** Resolve the persisted artifact directory before disposal, while the header is still live. */
  private locateArtifact(agent: Agent): string | undefined {
    try {
      const persistence = this.ctx.get('sessionPersistence');
      const header = agent.session?.header;
      if (typeof persistence?.locate !== 'function' || header === undefined) return undefined;
      return artifactDirectory(header, persistence.locate(header));
    } catch {
      return undefined;
    }
  }

  /**
   * Delete only this plugin's own persisted session directory, after a short
   * drain delay. Runs in the host process (no shell, no sandbox escalation);
   * `force` + `recursive` make a missing artifact a no-op, and any failure only
   * warns because the agent is already disposed.
   */
  private async removeArtifact(sessionId: string, dir: string): Promise<void> {
    if (!sessionId.startsWith(SESSION_ID_PREFIX) || !isAbsolute(dir) || basename(dir) !== sessionId) {
      this.warn(`artifact cleanup for "${sessionId}" refused: unexpected directory "${dir}"`);
      return;
    }
    try {
      await delay(DRAIN_DELAY_MS);
      await rm(dir, { recursive: true, force: true });
    } catch (error) {
      this.warn(`artifact cleanup for "${sessionId}" failed: ${errorMessage(error)}`);
    }
  }

  /**
   * Dispose one side agent during unload and, once disposal succeeded, remove
   * its artifact in the background. The directory is located before disposal.
   * Never rejects.
   */
  private async retire(sessionId: string, handle: AgentHandle): Promise<void> {
    const dir = this.locateArtifact(handle.agent);
    try {
      await handle.dispose();
    } catch (error) {
      this.warn(`dispose of "${sessionId}" during unload failed: ${errorMessage(error)}`);
      return;
    }
    if (dir !== undefined) void this.removeArtifact(sessionId, dir);
  }

  /** Plugin unload: detach listeners, end streams, dispose every side agent. */
  disposeAll(): void {
    this.closing = true;
    for (const dispose of this.listenerDisposers) {
      try {
        dispose();
      } catch {
        // Listener teardown must not block the rest of plugin unload.
      }
    }
    this.listenerDisposers.length = 0;
    for (const sessionId of [...this.streams.keys()]) this.endStreamsFor(sessionId);
    this.streams.clear();
    this.liveStates.clear();
    for (const entry of this.entries.values()) void this.retire(entry.sessionId, entry.handle);
    this.entries.clear();
    this.byIdentity.clear();
    this.pendingCreates.clear();
    this.lastErrors.clear();
  }
}
