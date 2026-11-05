import type { MarkdownFileMentions } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ComponentType, HTMLAttributes, ReactNode, Ref } from 'react';

// Minimal structural slice of the DSH 0.2.1-rc.3 client contracts this
// plugin consumes: the keyed `conversation.chat.node` seat of ui-chat, its
// assistant-step node, and the root-scoped content Factories. Re-check these
// against ui-chat's AssistantNodeView on every DSH upgrade.

export interface Observable<T> {
  getSnapshot(): T;
  subscribe(listener: () => void): () => void;
}

export type AssistantBlock =
  | { kind: 'text'; text: string }
  | { kind: 'reasoning'; text: string }
  | { kind: 'image'; attachment: unknown }
  | { kind: 'tool-call' }
  | { kind: 'unknown'; block: unknown };

export interface TurnRef {
  status: string;
}

export interface AssistantStepNode {
  data: {
    blocks: readonly AssistantBlock[];
    status: 'running' | 'settled' | 'interrupted' | (string & {});
    step: number;
    /** `messageId` is absent only on synthetic interruption fallbacks. */
    finalNode?: { seq: number; messageId?: string | undefined } | undefined;
  };
  location: { kind: string; turn?: TurnRef | undefined };
}

export interface TurnProcess {
  foldable: boolean;
  open: boolean;
  spec: { answerStep: number | null; inlineReasoning: boolean };
  setOpen(open: boolean): void;
}

export interface TurnTail {
  closing?: { finalNode: { seq: number } } | undefined;
}

/** Slice of ui-chat's ChatPresentationPolicy this renderer reads. */
export interface PresentationPolicy {
  settledReasoningPreview: boolean;
  /** Replies kept visible while a completed Turn folds: every reply, or only the final answer. */
  foldedReplies: 'all' | 'final';
}

/** DOM handlers the context-menu plugin binds to one element. */
export type ContextMenuTriggerProps = Pick<HTMLAttributes<HTMLElement>, 'onContextMenu' | 'onKeyDown' | 'tabIndex'>;

/** Owner of one closing Turn's prose file links (ui-chat `TurnTailOwnerProps`). */
export interface TurnTailOwner {
  turn: TurnRef;
  seq: number;
  openFile: (path: string) => void;
}

/** File-mention resolver from the official assistant-step entry's private inject. */
export type FileMentionsSource = (
  owner: TurnTailOwner,
  getFileTriggerProps?: (path: string) => ContextMenuTriggerProps,
) => MarkdownFileMentions | undefined;

export type Translate = (key: string, params?: Record<string, unknown>) => string;
export type RenderFactorySlot = (name: string, props: object) => ReactNode;
export type OpenFile = (path: string, options?: { line: number }) => void;

/** What this plugin's entry inject returns; the renderer binds `hooks` to `use*` props. */
export interface AssistantInjected {
  hooks: { presentation: Observable<PresentationPolicy> };
  fileMentions: FileMentionsSource | undefined;
  resolveFilePath: ((path: string) => string) | undefined;
}

/**
 * Props the chat node seat hands an assistant-step renderer: owner props, the
 * session-scope `sessionId`, and this entry's own inject.
 */
export interface AssistantNodeProps {
  node: AssistantStepNode;
  groupPart?: 'reasoning' | 'response' | undefined;
  cwd?: string | undefined;
  openFile: OpenFile;
  loadImage: unknown;
  turnProcess?: TurnProcess | undefined;
  sessionId?: string | undefined;
  fileMentions?: FileMentionsSource | undefined;
  resolveFilePath?: ((path: string) => string) | undefined;
  useDisclosure: () => { expanded: boolean; toggle: () => void };
  useGroupAction: (hidden: boolean, reveal: () => void) => Ref<HTMLDivElement>;
  useTurnData: (key: 'turn-tail') => TurnTail | undefined;
  usePresentation: <T>(selector: (policy: PresentationPolicy) => T) => T;
  renderFactorySlot: RenderFactorySlot;
  t: Translate;
}

export interface SlotEntry {
  component: unknown;
  options: { key?: string; priority?: number };
  locale?: string;
  inject?: (...args: unknown[]) => unknown;
}

export interface ClientContext {
  effect(factory: () => (() => void) | void, label?: string): unknown;
  /** Optional service lookup; undeclared services resolve without parking the plugin. */
  get?(name: string): unknown;
  slots: {
    inject(name: 'conversation.chat.node', factory: () => () => void): () => void;
    register(
      definition: {
        name: 'conversation.chat.node';
        key: 'assistant-step';
        priority: number;
        locale: string;
        inject: (sessionId: string) => AssistantInjected;
      },
      component: ComponentType<AssistantNodeProps>,
    ): () => void;
    entries(name: 'conversation.chat.node'): readonly SlotEntry[];
  };
}
