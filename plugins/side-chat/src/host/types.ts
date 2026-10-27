// Minimal structural view of the DSH host surface this plugin touches. Every
// shape is duck-typed: host values are read defensively, so optional members
// mirror the defensive reads rather than the full upstream types.

import type { IncomingMessage, ServerResponse } from 'node:http';

export type Disposer = () => void;

export interface Logger {
  warn?(message: string): void;
}

/** A raw Node route handler; the handler owns the full response lifecycle. */
export type RouteHandler = (req: IncomingMessage, res: ServerResponse) => unknown;

export interface ExactRoute {
  readonly kind: 'exact';
  readonly path: string;
  readonly handler: RouteHandler;
}

export interface WebServerService {
  /** Throws on a duplicate path; returns the route disposer. */
  register?(route: ExactRoute): unknown;
}

/** Durable session header; `locate()` derives the artifact path from it. */
export interface SessionHeader {
  readonly id?: unknown;
  readonly cwd?: unknown;
}

export interface TextContent {
  readonly type: 'text';
  readonly text: string;
}

export interface UserMessage {
  readonly id: string;
  readonly role: 'user';
  readonly content: readonly TextContent[];
  readonly source: { readonly kind: string };
}

export interface AppendOptions {
  readonly surfaceOp?: string;
}

export interface AgentSession {
  readonly id?: unknown;
  readonly header?: SessionHeader;
  readonly inheritedEventCount?: unknown;
  /** Committed events in log order, optionally from one sequence onward. */
  snapshotEvents?(fromSeq?: number): unknown;
  /** Current request header; its `config` carries the resolved model route. */
  requestHeader?(): unknown;
  /** Current request context; its `contextWindow` is the route's window. */
  requestContext?(): unknown;
  append(type: string, data: unknown, options?: AppendOptions): unknown;
}

export interface Agent {
  readonly id: string;
  readonly status: string;
  /** Constructor agent options; the route fallback when the request header has none. */
  readonly options?: unknown;
  /** The agent's own Cordis context, passed through opaquely to preset composition. */
  readonly ctx?: unknown;
  readonly session?: AgentSession;
  followup(message: UserMessage): void;
  cancel(reason: { readonly kind: 'user' }): void;
}

export interface AgentHandle {
  readonly agent: Agent;
  dispose(): Promise<unknown>;
}

export interface SideSessionMeta {
  readonly cwd?: string;
  readonly agentPreset?: string;
  readonly isSeeded?: true;
  readonly origin: 'subagent';
}

export interface AgentRouteOptions {
  readonly provider?: string;
  readonly model?: string;
  readonly reasoningEffort?: string;
  readonly maxTokens?: number;
}

export interface AgentCreateOptions {
  readonly sessionId: string;
  readonly meta: SideSessionMeta;
  readonly seed?: readonly unknown[];
  readonly inheritedEventCount?: number;
  readonly agentOptions: AgentRouteOptions;
  /** Runs before the agent is published; a throw rejects `create`. */
  readonly setup: (childCtx: AgentContext, agent: Agent) => void;
}

export interface AgentsService {
  get(id: string): Agent | undefined;
  create(options: AgentCreateOptions): Promise<AgentHandle>;
}

export interface AgentPresetsService {
  composedPreset?(agentCtx: unknown): unknown;
  composeFrom?(target: AgentContext, source: unknown): unknown;
}

/** `sandboxPolicy` and `approval`: the per-session override, if one is set. */
export interface OverrideService {
  overrideOf?(session: unknown): unknown;
}

export interface SessionPersistenceService {
  /** The artifact location of one session, `{ path }` for file backends. */
  locate?(header: SessionHeader): unknown;
}

export interface SystemPromptSection {
  readonly name: string;
  readonly order: number;
  readonly text: string;
}

export interface SystemPromptService {
  section(section: SystemPromptSection): unknown;
  getSectionOrder?(name: string): unknown;
}

/** Services read through `ctx.get` because they are not injected. */
export interface OptionalServices {
  agentPresets: AgentPresetsService;
  sandboxPolicy: OverrideService;
  approval: OverrideService;
  sessionPersistence: SessionPersistenceService;
}

export interface ServiceLookup {
  get<K extends keyof OptionalServices>(name: K): OptionalServices[K] | undefined;
}

/** The plugin's own Cordis context. */
export interface HostContext extends ServiceLookup {
  readonly logger?: Logger;
  readonly webServer?: WebServerService;
  readonly agents: AgentsService;
  /** Subscribe to a host event; returns the listener disposer. */
  on?(name: string, listener: (...args: unknown[]) => void): unknown;
  effect(execute: () => Disposer, label?: string): unknown;
}

/** The side agent's child context handed to `setup`. */
export interface AgentContext extends ServiceLookup {
  readonly systemPrompt: SystemPromptService;
}
