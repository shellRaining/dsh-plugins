import type { ComponentType } from 'react';

export interface Observable<T> { getSnapshot(): T; subscribe(listener: () => void): () => void }
export interface InputActions {
  captureInsertion(): { start: number; end: number; draftRev: number };
  insertText(text: string, span: { start: number; end: number; draftRev: number }): boolean;
}
export interface Binding { key: string | undefined; props: { inputActions?: InputActions } }
export interface ClientContext {
  effect(factory: () => (() => void) | void, label?: string): unknown;
  slots: {
    inject(name: 'conversation.input.left', factory: () => (() => void)): () => void;
    register<P extends object>(definition: { name: 'conversation.input.left'; id: string; inject: (sessionId: string) => P }, component: ComponentType<P>): () => void;
  };
  uiSession: { adapter: { current: Observable<Binding> } };
}
