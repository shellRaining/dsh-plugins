// DSH 客户端里本插件用到的最小接口，按 0.2.3-alpha.2 的源码核对。
// 只描述结构，不导入宿主内部包。
import type { ComponentType } from 'react';

export interface Store<T> {
  getSnapshot(): T;
  subscribe(listener: () => void): () => void;
}

export interface LocaleService {
  register(ns: string, locale: string, dict: Readonly<Record<string, string>>): () => void;
  bind(ns: string): (key: string) => string;
}

// ---- ui-model-selection：ctx.modelDirectories

export interface ModelSelection {
  readonly provider: string;
  readonly model: string;
  readonly reasoningEffort?: string;
}

export interface ReasoningEffort {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
}

export interface CatalogModel {
  readonly id: string;
  readonly reasoning?: { readonly efforts: readonly ReasoningEffort[]; readonly defaultEffort?: string };
}

export interface ModelDirectoryState {
  readonly current: ModelSelection | null;
  readonly groups: readonly { readonly id: string; readonly models: readonly CatalogModel[] }[];
  readonly status: 'idle' | 'loading' | 'ready' | 'selecting' | 'error';
  /** 本页面发起、尚未完成的选择。 */
  readonly pending: ModelSelection | null;
}

export type SelectResult = { readonly ok: true } | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } };

export interface ModelDirectory {
  readonly store: Store<ModelDirectoryState>;
  load(): Promise<ModelDirectoryState>;
  select(selection: ModelSelection): Promise<SelectResult>;
}

export interface ModelDirectories {
  directoryFor(sessionId: string): ModelDirectory;
}

// ---- ui-commands：ctx.commandUi

export interface SessionContext {
  readonly sessionId: string;
}

export interface SelectOption {
  readonly id: string;
  readonly label: string;
  readonly detail?: string;
  readonly active?: boolean;
}

export interface PopupSelectSpec {
  readonly kind: 'popupSelect';
  searchLabels(): { readonly placeholder: string; readonly empty: string; readonly noResults: string };
  options(session: SessionContext, signal: AbortSignal): Promise<readonly SelectOption[]>;
  onSelect(option: SelectOption, session: SessionContext): Promise<void>;
}

/** `popupFor()` 的返回值。公开契约声明为 unknown，这里只取用到的两个成员。 */
export interface PopupController {
  readonly state: Store<{ readonly open: boolean }>;
  open(command: string, spec: PopupSelectSpec, context: SessionContext, segment: { readonly via: 'enter'; readonly token: string }): void;
}

export interface CommandUi {
  register(contribution: {
    readonly name: string;
    label(): string;
    description(): string;
    readonly icon: ComponentType<{ size?: number }>;
    available(session: SessionContext): boolean;
    readonly ui: PopupSelectSpec;
  }): () => void;
  popupFor(sessionScope: unknown): unknown;
}

// ---- session-controller：ctx.sessions

export interface Sessions {
  readonly list: Store<{
    readonly byId: Readonly<Record<string, { readonly id: string; readonly retainedBy: Readonly<Partial<Record<string, number>>> }>>;
  }>;
  /** 会话作用域；未保留的会话返回 undefined。 */
  scope(sessionId: string): unknown;
  subagentAddress(sessionId: string): unknown;
}

export interface Scope {
  effect(factory: () => () => void, label: string): void;
}

export interface ServiceScope extends Scope {
  readonly commandUi: CommandUi;
  readonly modelDirectories: ModelDirectories;
  readonly sessions: Sessions;
}

export interface ClientContext extends Scope {
  readonly locale: LocaleService;
  inject(deps: readonly string[], apply: (scope: ServiceScope) => void): void;
}
