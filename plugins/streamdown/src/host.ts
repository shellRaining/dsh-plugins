import type { MarkdownFileMentions } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ComponentType, ReactNode, Ref } from 'react';

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
    finalNode?: { seq: number } | undefined;
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

export interface PresentationPolicy {
  settledReasoningPreview: boolean;
}

export type Translate = (key: string, params?: Record<string, unknown>) => string;
export type RenderFactorySlot = (name: string, props: object) => ReactNode;
export type OpenFile = (path: string, options?: { line: number }) => void;

/** Props the chat node seat hands an assistant-step renderer. */
export interface AssistantNodeProps {
  node: AssistantStepNode;
  groupPart?: 'reasoning' | 'response' | undefined;
  cwd?: string | undefined;
  openFile: OpenFile;
  loadImage: unknown;
  fileMentions: (owner: { turn: TurnRef; seq: number; openFile: OpenFile }) => MarkdownFileMentions | undefined;
  turnProcess?: TurnProcess | undefined;
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
  inject?: (...args: unknown[]) => unknown;
}

export interface ClientContext {
  effect(factory: () => (() => void) | void, label?: string): unknown;
  slots: {
    inject(name: 'conversation.chat.node', factory: () => () => void): () => void;
    register(
      definition: {
        name: 'conversation.chat.node';
        key: 'assistant-step';
        priority: number;
        locale: string;
        inject: () => { hooks: { presentation: Observable<PresentationPolicy> } };
      },
      component: ComponentType<AssistantNodeProps>,
    ): () => void;
    entries(name: 'conversation.chat.node'): readonly SlotEntry[];
  };
}
