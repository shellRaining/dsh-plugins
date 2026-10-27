// Wire contract between the host half (src/host) and the client half
// (src/client). Both halves are bundled separately; this module is type-only
// plus a few constants, so it carries no runtime dependency in either bundle.

/** Package name: the Cordis entry, the client ModuleLoader id and the tab type id. */
export const PLUGIN_NAME = 'dsh-side-chat';
/** Right-sidebar tab kind. Kept identical to the previous plugin so restored tabs still resolve. */
export const TAB_KIND = 'side-chat';

/** Every route lives under this prefix on the DSH web server (distinct from the previous plugin's `/side-chat/api/`). */
export const API_PREFIX = '/dsh-side-chat/api/';
/** POST JSON routes: request body is a JSON object, response is a `Result`. */
export const JSON_ROUTES = ['create', 'prompt', 'cancel', 'close', 'snapshot'] as const;
export type JsonRoute = (typeof JSON_ROUTES)[number];
/** POST route answering `text/event-stream` (or a JSON `Failure` before the stream starts). */
export const EVENTS_ROUTE = 'events';

/** Side sessions use this id prefix; artifact cleanup refuses anything else. */
export const SESSION_ID_PREFIX = 'side-chat-';
/** Producer-owned source kind of the injected boundary message (format v4). */
export const BOUNDARY_SOURCE_KIND = 'plugin:side-chat';
/** Fixed first line of the boundary message; the client hides messages starting with it. */
export const BOUNDARY_FIRST_LINE = 'Side conversation boundary.';

export type FailureCode =
  | 'unknown-source'
  | 'not-found'
  | 'empty-prompt'
  | 'create-failed'
  | 'prompt-failed'
  | 'dispose-failed'
  | 'internal';

export interface Failure {
  readonly ok: false;
  readonly code: FailureCode;
  readonly message?: string;
}

export type Success<T extends object = Record<never, never>> = { readonly ok: true } & T;
export type Result<T extends object = Record<never, never>> = Success<T> | Failure;

/**
 * Committed event types the client folds. Everything else (system prompts,
 * request headers with full tool schemas, job bookkeeping) stays on the host,
 * which keeps every `hello` and snapshot small.
 */
export const CLIENT_EVENT_TYPES: ReadonlySet<string> = new Set([
  'user/message',
  'assistant/message',
  'assistant/attempt',
  'tool/result',
  'request/context',
  'llm/retry-started',
]);

/** One committed session event as sent to the client. */
export interface WireEntry {
  readonly seq: number;
  readonly type: string;
  readonly time?: number | string;
  readonly data: unknown;
  readonly surfaceOp?: string;
  readonly sourceEventSeqs?: readonly number[];
}

/** Renderable block of the in-flight assistant attempt. */
export type LiveBlock =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'reasoning'; readonly text: string }
  | { readonly kind: 'tool-call'; readonly callId: string; readonly name: string; readonly argsRaw: string };

export interface LiveAttempt {
  readonly attemptId: string;
  readonly turn: unknown;
  readonly step: unknown;
  readonly nextIndex: number;
  readonly blocks: readonly LiveBlock[];
}

/** Authoritative live state: every `live` frame replaces the previous one. */
export interface LiveSnapshot {
  readonly revision: number;
  readonly activeAttempt: LiveAttempt | null;
}

export interface CreateArgs {
  readonly sourceId: string;
  /** Opaque client tab identity: one side session per tab occurrence. */
  readonly instanceKey?: string;
  /** Only re-attach to a live side session of this identity; never create one (`not-found` otherwise). */
  readonly attachOnly?: boolean;
}
export interface CreateResult {
  readonly sessionId: string;
  readonly inheritedEventCount: number;
}
export interface PromptArgs {
  readonly sessionId: string;
  readonly text: string;
}
export interface SessionArgs {
  readonly sessionId: string;
}
export interface SnapshotArgs {
  readonly sessionId: string;
  /** First sequence the client still needs; never below the fork floor. */
  readonly fromSeq?: number;
}

/** Baseline shared by the `snapshot` route and the stream's `hello` frame. */
export interface SnapshotPayload {
  readonly inheritedEventCount: number;
  readonly status: string;
  readonly running: boolean;
  readonly lastError: string | null;
  /** Context window of the side session's current route, when known. */
  readonly contextWindow?: number;
  readonly entries: readonly WireEntry[];
  readonly truncated: boolean;
  readonly live: LiveSnapshot | null;
}

/** Route name -> [request body, success payload]. */
export interface RouteMap {
  create: [CreateArgs, CreateResult];
  prompt: [PromptArgs, Record<never, never>];
  cancel: [SessionArgs, Record<never, never>];
  close: [SessionArgs, Record<never, never>];
  snapshot: [SnapshotArgs, SnapshotPayload];
}

/** SSE frame name -> JSON `data:` payload. */
export interface StreamFrameMap {
  hello: Success<SnapshotPayload>;
  event: { readonly entry: WireEntry };
  live: { readonly live: LiveSnapshot | null };
  status: { readonly status: string; readonly running: boolean };
  error: { readonly message: string };
}
export type StreamFrameName = keyof StreamFrameMap;
