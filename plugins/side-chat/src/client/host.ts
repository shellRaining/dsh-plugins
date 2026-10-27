// Structural types for the slice of the DSH client runtime this plugin uses.
// Kept local (duck-typed) instead of importing the shell's internal packages.
import type { ComponentType } from 'react';

export type TranslateParams = Readonly<Record<string, string | number>>;
export type Translate = (key: string, params?: TranslateParams) => string;

export interface LocaleSnapshot {
  readonly active: string;
  readonly revision: number;
}

export interface LocaleService {
  register(ns: string, locale: string, dict: Readonly<Record<string, string>>): () => void;
  bind(ns: string): Translate;
  getSnapshot(): LocaleSnapshot;
  subscribe(listener: () => void): () => void;
}

export interface SlotsService {
  inject(name: string, factory: () => unknown): () => void;
  register<P>(definition: Readonly<Record<string, unknown>>, component: ComponentType<P>): unknown;
}

export interface IconProps {
  readonly size?: number | undefined;
  readonly className?: string | undefined;
}

export interface GuideEntry {
  readonly id: string;
  readonly order: number;
  readonly title: () => string;
  readonly description?: () => string;
  readonly icon?: ComponentType<IconProps>;
}

export interface TabDefinition {
  readonly id: string;
  readonly kind: string;
  readonly priority?: 'extension' | 'builtin' | 'fallback';
  readonly multiple?: boolean;
  readonly keepMounted?: boolean;
  readonly title: (address: string) => string;
  readonly guide?: readonly GuideEntry[];
}

export interface TabRecordLike {
  readonly id: string;
  readonly kind?: string;
}

export interface TabActions {
  openTab(kind: string, options?: Readonly<Record<string, unknown>>): void;
  openResource(address: string, options?: Readonly<Record<string, unknown>>): void;
  close(): void;
}

/** The last navigation that settled on a tab; `params` is what the opener passed. */
export interface TabNavigation {
  readonly address: string;
  readonly params?: unknown;
  readonly revision: number;
}

/** What `useTabInfo()` returns inside `sidebar.right.pane.tab` and its title seat. */
export interface TabInfo {
  readonly tab: TabRecordLike & {
    readonly visible: boolean;
    readonly actions: TabActions;
    readonly navigation?: TabNavigation;
  };
}

export interface ReadableStore<T> {
  getSnapshot(): T;
}

export interface OpenTabOptions {
  /** JSON-shaped; arrives at the body as `tab.navigation.params`. */
  readonly params?: object;
  readonly replaceTab?: string;
}

export interface SidebarRightService {
  /** The session whose conversation occupies the main column, if any. */
  readonly mounted: ReadableStore<string | undefined>;
  /** The active tab of the on-screen session's active pane. */
  active(): TabRecordLike | undefined;
  /** Open a page type in the on-screen session; throws without one. */
  openTab(kind: string, options?: OpenTabOptions): void;
  registerCloseHandler(kind: string, handler: (sessionId: string, tab: TabRecordLike) => void): () => void;
}

// ---- `/` input trigger pipeline (ctx.inputTriggers)

export interface TriggerSession {
  readonly sessionId: string;
}

export interface CommandOutcome {
  readonly kind: 'success' | 'error';
  readonly text?: string;
}

/** A leading command chip: the composer keeps `token` and submits what follows it. */
export interface CommandClaim {
  readonly name: string;
  readonly token: string;
  readonly hint?: string;
  submit(args: string, actx: unknown, attachments: readonly unknown[]): Promise<CommandOutcome>;
}

export type TriggerOutcome = 'handled' | { readonly claim: CommandClaim } | undefined;

export interface TriggerCandidate {
  readonly name: string;
  readonly label?: string;
  readonly description?: string;
  readonly icon?: ComponentType<IconProps>;
}

export interface CandidateRequest {
  readonly query: string;
  readonly position: 'leading' | 'inline';
  readonly signal: AbortSignal;
}

export interface TriggerPick {
  readonly candidate: TriggerCandidate;
  readonly session: TriggerSession;
}

export interface TriggerSource {
  readonly trigger: string;
  readonly name: string;
  readonly order?: number;
  readonly showGroupTitle?: boolean;
  candidates(session: TriggerSession, request: CandidateRequest): Promise<readonly TriggerCandidate[]>;
  onPick(pick: TriggerPick): TriggerOutcome;
  matchSpace?(session: TriggerSession, token: string): TriggerOutcome;
  matchClaim?(session: TriggerSession, token: string, signal: AbortSignal): Promise<CommandClaim | undefined>;
  matchEnter?(session: TriggerSession, line: string, signal: AbortSignal, envelope: { readonly attachments: number }): Promise<TriggerOutcome>;
}

export interface InputTriggersService {
  registerSource(source: TriggerSource): () => void;
}

export interface ClientContext {
  effect(factory: () => (() => void) | void, label?: string): void;
  /** Run `apply` once every named service is available; it rides a child scope. */
  inject(deps: readonly string[], apply: (scope: ClientContext & { readonly inputTriggers: InputTriggersService }) => void): void;
  readonly locale: LocaleService;
  readonly slots: SlotsService;
  readonly sidebarRightTabs: { register(definition: TabDefinition): () => void };
  readonly sidebarRight: SidebarRightService;
}
