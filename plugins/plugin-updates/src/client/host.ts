// Structural types for the slice of the DSH client runtime this plugin uses:
// the plugin manager's remote methods, slots and locale. Kept local instead
// of importing the shell's internal packages.
import type { ComponentType } from 'react';

export type TranslateParams = Readonly<Record<string, string | number>>;
export type Translate = (key: string, params?: TranslateParams) => string;

export type RemoteResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly message: string } };

/** One bundle as `pluginManager.listBundles` reports it; only the fields this plugin reads. */
export interface Bundle {
  readonly name: string;
  readonly official: boolean;
  readonly availability: 'profile' | 'installation' | 'missing';
  readonly version?: string;
  readonly source?: string;
  readonly enabled: boolean;
  readonly installed: boolean;
  readonly removable: boolean;
  readonly readOnlyReason?: string;
  readonly meta?: { readonly title?: string | Readonly<Record<string, string>>; readonly icon?: string };
}

export interface ManagementError {
  readonly code: string;
  readonly diagnostic?: string;
}

/** What `installBundle` and `removeBundle` answer; only the fields this plugin reads. */
export interface ChangeResult {
  readonly application: 'cancelled' | 'failed' | 'applied' | 'restart-required' | 'overridden';
  readonly error?: ManagementError;
  readonly version?: string;
  readonly packageResult?: { readonly output: string; readonly logPath: string };
}

export interface InstallOptions {
  readonly enabled?: boolean;
  readonly saveExact?: boolean;
  readonly requestId?: string;
}

export interface Registries {
  readonly registry: string | null;
  readonly fallbackRegistries: readonly string[];
  readonly resolved: string | null;
}

export interface PluginManagerRemote {
  listBundles(): Promise<RemoteResult<readonly Bundle[]>>;
  registries(): Promise<RemoteResult<Registries>>;
  listVersionExemptions(): Promise<RemoteResult<{ readonly exemptions: Readonly<Record<string, readonly string[]>> }>>;
  removeBundle(name: string): Promise<RemoteResult<ChangeResult>>;
  installBundle(spec: string, options?: InstallOptions): Promise<RemoteResult<ChangeResult>>;
}

export interface RemoteService {
  readonly pluginManager: PluginManagerRemote;
  $on(event: string, listener: () => void): () => void;
}

export interface LocaleService {
  register(ns: string, dicts: Readonly<Record<string, Readonly<Record<string, string>>>>): () => void;
  bind(ns: string): Translate;
  resolveText(text: string | Readonly<Record<string, string>>): string;
}

export interface SlotsService {
  inject(name: string, factory: () => unknown): () => void;
  register<P>(definition: Readonly<Record<string, unknown>>, component: ComponentType<P>): unknown;
}

export interface ClientContext {
  effect(factory: () => (() => void) | void, label?: string): void;
  on(event: string, listener: () => void): () => void;
  get(name: string): unknown;
  readonly locale: LocaleService;
  readonly slots: SlotsService;
  readonly remote: RemoteService;
}

/** The bundle a plugin detail page shows, as `plugins.detail.*` entries receive it. */
export type DetailSubject =
  | { readonly kind: 'bundle'; readonly pkg: { readonly name: string } }
  | { readonly kind: 'row' | 'item' };

/** An observable store the slot renderer binds as a `use<Name>(selector)` prop. */
export interface Source<T> {
  getSnapshot(): T;
  subscribe(listener: () => void): () => void;
}

export type UseSource<T> = <R>(selector: (snapshot: T) => R) => R;
