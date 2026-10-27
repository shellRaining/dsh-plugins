// Per-session fold of the `agent/assistant-stream` frame sequence into one
// renderable live attempt. DSH emits a dense per-agent sequence whose
// `revision` starts at 1; a revision gap invalidates the baseline instead of
// being spliced in, so the client can treat every `live` payload as an
// authoritative replacement. `chunk` values are provider-neutral LLM
// `StreamChunk`s, folded by a minimal local assembler (dsh-llm's
// `BlockAssembler` is deliberately not imported).

import type { LiveBlock, LiveSnapshot } from '../shared/protocol.ts';
import { isRecord } from './util.ts';

/** Assembly state of one stream block index. */
export interface PartialBlock {
  readonly blockType: string | undefined;
  text: string;
  toolCallId: string | undefined;
  toolCallName: string | undefined;
  toolCallArgs: string;
  /** Set by `block-end`; later deltas for the index are ignored. */
  finalized: boolean;
}

interface ActiveAttempt {
  readonly attemptId: string;
  readonly turn: unknown;
  readonly step: unknown;
  nextIndex: number;
  readonly partials: Map<number, PartialBlock>;
  readonly order: number[];
}

export class LiveAttemptState {
  /** Last accepted frame revision; 0 before the first frame. */
  private revision = 0;
  /** The in-flight attempt, or undefined when no attempt is streaming. */
  private active: ActiveAttempt | undefined = undefined;

  /**
   * Fold one assistant-stream frame into the live state.
   * @param frame - an `agent/assistant-stream` frame (`start`, `chunk`, `end`).
   * @returns true when the frame was accepted; malformed frames are ignored.
   */
  accept(frame: unknown): boolean {
    if (!isRecord(frame)) return false;
    const { type, revision } = frame;
    if (type !== 'start' && type !== 'chunk' && type !== 'end') return false;
    if (typeof revision !== 'number' || !Number.isSafeInteger(revision)) return false;
    let startAttemptId = '';
    if (type === 'start') {
      const attemptId = frame.attemptId;
      if (typeof attemptId !== 'string' || attemptId === '') return false;
      startAttemptId = attemptId;
      // A new agent lifecycle restarts revisions at 1; drop the stale baseline.
      if (revision === 1 && this.revision !== 0) {
        this.revision = 0;
        this.active = undefined;
      }
    }
    if (revision !== this.revision + 1) {
      // A gap means a chunk was missed: the partial attempt is no longer a
      // faithful prefix, so clear it and adopt the new revision baseline.
      this.active = undefined;
      this.revision = revision;
      return true;
    }
    this.revision = revision;
    if (type === 'start') {
      this.active = {
        attemptId: startAttemptId,
        turn: frame.turn,
        step: frame.step,
        nextIndex: 0,
        partials: new Map(),
        order: [],
      };
      return true;
    }
    if (type === 'chunk') {
      const active = this.active;
      if (active === undefined || frame.attemptId !== active.attemptId || frame.index !== active.nextIndex) {
        this.active = undefined;
        return true;
      }
      pushStreamChunk(active.partials, active.order, frame.chunk);
      active.nextIndex += 1;
      return true;
    }
    this.active = undefined;
    return true;
  }

  /**
   * Drop the active attempt once its message committed. The loop commits the
   * complete `assistant/message` / `assistant/attempt` before emitting the
   * matching `end` frame, so the committed event is the first settlement signal.
   * @param turn - durable turn of the committed event.
   * @param step - durable step of the committed event.
   * @returns whether the active attempt was settled.
   */
  settle(turn: unknown, step: unknown): boolean {
    const active = this.active;
    if (active === undefined || active.turn !== turn || active.step !== step) return false;
    this.active = undefined;
    return true;
  }

  /** Snapshot the live state, both for `live` frames and the snapshot route. */
  snapshot(): LiveSnapshot {
    const active = this.active;
    if (active === undefined) return { revision: this.revision, activeAttempt: null };
    const blocks: LiveBlock[] = [];
    for (const index of active.order) {
      const partial = active.partials.get(index);
      if (partial === undefined) continue;
      const block = renderStreamBlock(partial);
      if (block !== undefined) blocks.push(block);
    }
    return {
      revision: this.revision,
      activeAttempt: {
        attemptId: active.attemptId,
        turn: active.turn,
        step: active.step,
        nextIndex: active.nextIndex,
        blocks,
      },
    };
  }
}

/**
 * Fold one `StreamChunk` into the per-index partial block map, mirroring the
 * minimal behavior of dsh-llm's BlockAssembler: `block-start` opens a block,
 * deltas extend it, `block-end` finalizes it, and deltas after finalize (or
 * unknown block types) never render.
 * @param partials - stream index -> partial block state.
 * @param order - stream indexes in first-seen order.
 * @param chunk - one provider-neutral LLM stream chunk.
 */
export function pushStreamChunk(partials: Map<number, PartialBlock>, order: number[], chunk: unknown): void {
  if (!isRecord(chunk) || typeof chunk.type !== 'string') return;
  const index = chunk.index;
  if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0) return;
  const create = (blockType: string | undefined): PartialBlock => {
    const partial: PartialBlock = {
      blockType,
      text: '',
      toolCallId: undefined,
      toolCallName: undefined,
      toolCallArgs: '',
      finalized: false,
    };
    partials.set(index, partial);
    order.push(index);
    return partial;
  };
  const ensure = (blockType: string): PartialBlock => partials.get(index) ?? create(blockType);
  switch (chunk.type) {
    case 'block-start':
      if (!partials.has(index)) create(typeof chunk.blockType === 'string' ? chunk.blockType : undefined);
      return;
    case 'text-delta':
    case 'reasoning-delta': {
      const partial = ensure(chunk.type === 'text-delta' ? 'text' : 'reasoning');
      if (partial.finalized) return;
      if (typeof chunk.text === 'string') partial.text += chunk.text;
      return;
    }
    case 'tool-call-delta': {
      const partial = ensure('tool-call');
      if (partial.finalized) return;
      if (typeof chunk.id === 'string') partial.toolCallId = chunk.id;
      if (typeof chunk.name === 'string' && chunk.name !== '') partial.toolCallName = chunk.name;
      if (typeof chunk.argumentsDelta === 'string') partial.toolCallArgs += chunk.argumentsDelta;
      return;
    }
    case 'block-end': {
      const block = chunk.block;
      const blockType = isRecord(block) ? block.type : undefined;
      if (typeof blockType !== 'string') return;
      ensure(blockType).finalized = true;
      return;
    }
    default:
      return;
  }
}

/**
 * Project one partial block into the client's live wire block shape.
 * @param partial - the assembled partial block.
 * @returns a renderable block, or undefined for empty or unsupported blocks.
 */
export function renderStreamBlock(partial: PartialBlock): LiveBlock | undefined {
  switch (partial.blockType) {
    case 'text':
      return partial.text === '' ? undefined : { kind: 'text', text: partial.text };
    case 'reasoning':
      return partial.text === '' ? undefined : { kind: 'reasoning', text: partial.text };
    case 'tool-call':
      return {
        kind: 'tool-call',
        callId: partial.toolCallId ?? '',
        name: partial.toolCallName ?? '',
        argsRaw: partial.toolCallArgs,
      };
    default:
      return undefined;
  }
}
