/** Structural service contracts; no runtime dependency on DSH internals. */
export interface Observable<T> {
  getSnapshot(): T;
  subscribe(listener: () => void): () => void;
}
export interface SessionRow {
  title?: string;
  displayTitle?: string;
  blank?: boolean;
  createdAt?: number;
  updatedAt?: number;
}
export interface WorkspaceRow {
  workspaceId: string;
  title?: string;
  path?: string;
  createdAt: string;
}
/** Common rendering view of either service's row. */
export interface PreviewRow {
  title?: string;
  displayTitle?: string;
  blank?: boolean;
  path?: string;
  createdAt?: string | number;
  updatedAt?: number;
}
export interface Sessions { list: Observable<{ byId: Record<string, SessionRow | undefined> }> }
export interface Workspaces { list: Observable<{ items: WorkspaceRow[] }> }
export interface ClientContext {
  get(name: 'sessions'): Sessions;
  get(name: 'workspaces'): Workspaces;
  effect(factory: () => (() => void), label: string): unknown;
}
