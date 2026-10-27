import type { ComponentType } from 'react';

// Minimal structural slice of the DSH client contracts this plugin uses
// (ui-session binding, ui-conversation input and user text, ui-input-trigger source).
export interface Observable<T> { getSnapshot(): T; subscribe(listener: () => void): () => void }

/** Revision-guarded span in the composer's detect coordinates. */
export interface TokenSpan { readonly start: number; readonly end: number; readonly draftRev: number }
export interface ReferenceInsert {
  readonly source: string;
  readonly ref: string;
  readonly label: string;
  readonly clipboardText: string;
}
/** One reference chip; offset and length are in the clipboard projection (`draft`). */
export interface Occurrence { readonly source: string; readonly ref: string; readonly offset: number; readonly length: number }
export interface InputState {
  readonly draft: string;
  readonly draftRev: number;
  readonly phase: 'plain' | 'adjudicating' | 'claimed' | 'submitting';
  readonly claim?: unknown;
  readonly occurrences: readonly Occurrence[];
}
export interface InputActions { captureInsertion(): TokenSpan }
/** Session-scope context; the scoped input events are its public mutation channel. */
export interface SessionScope {
  bail(thisArg: SessionScope, name: 'slash/input-insert-reference', request: { reference: ReferenceInsert; span: TokenSpan }): true | undefined;
  bail(thisArg: SessionScope, name: 'slash/input-insert-text', request: { text: string; span: TokenSpan }): true | undefined;
}
export interface Binding {
  key: string | undefined;
  ctx?: SessionScope;
  hooks: { input?: Observable<InputState | undefined> };
  props: { inputActions?: InputActions };
}

/** Reference-only input trigger source: it never offers menu candidates. */
export interface ReferenceSource {
  readonly trigger: '@';
  readonly name: string;
  readonly showGroupTitle: false;
  candidates(): Promise<readonly never[]>;
  onPick(): undefined;
  openReference(session: { readonly sessionId: string }, reference: { readonly ref: string }): boolean;
  readonly codec: { clipboardText(ref: string): string; serialize(ref: string, signal: AbortSignal): Promise<string> };
}

export interface UserTextCandidate<D> { id: string; start: number; end: number; data: D }
export interface UserTextRule<D> {
  readonly id: string;
  readonly order: number;
  match(text: string, from: number): UserTextCandidate<D> | undefined;
}
/** Props of a `conversation.user.text.node` renderer. */
export interface UserTextNodeProps<D> { node: { data: D }; raw: string; interactive: boolean }

type SlotName = 'conversation.input.left' | 'conversation.user.text.node';
export interface ClientContext {
  effect(factory: () => (() => void) | void, label?: string): unknown;
  slots: {
    inject(name: SlotName, factory: () => (() => void)): () => void;
    register<P extends object>(definition: { name: 'conversation.input.left'; id: string; inject: (sessionId: string) => P }, component: ComponentType<P>): () => void;
    register<P extends object>(definition: { name: 'conversation.user.text.node'; key: string; priority: number }, component: ComponentType<P>): () => void;
  };
  uiSession: { adapter: { current: Observable<Binding> } };
  uiConversation: { userText: { register<D>(rule: UserTextRule<D>): () => void } };
  inputTriggers: { registerSource(source: ReferenceSource): () => void };
}
