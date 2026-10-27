// Pure folds from wire data to the render model. No React, no DOM, no I/O.
import {
  BOUNDARY_FIRST_LINE,
  BOUNDARY_SOURCE_KIND,
  type LiveBlock,
  type LiveSnapshot,
  type WireEntry,
} from '../shared/protocol.ts';

export interface ToolResult {
  readonly text: string;
  readonly isError: boolean;
}

export type AssistantBlock =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'reasoning'; readonly text: string }
  | {
      readonly kind: 'tool-call';
      readonly callId: string;
      readonly name: string;
      readonly argsRaw: string;
      readonly result: ToolResult | null;
    };

export type ContextTag = 'skill' | 'steering' | 'sessionReference' | 'agentInstructions' | 'compactCheckpoint' | 'generic';

export type ChatNode =
  | { readonly kind: 'user'; readonly seq: number; readonly time: number | null; readonly text: string }
  | { readonly kind: 'assistant'; readonly seq: number; readonly blocks: readonly AssistantBlock[] }
  | { readonly kind: 'context'; readonly seq: number; readonly tag: ContextTag; readonly name: string; readonly text: string };

type Json = Readonly<Record<string, unknown>>;
const EMPTY: Json = Object.freeze({});

export function record(value: unknown): Json {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : EMPTY;
}

function list(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function textOf(content: unknown): string {
  return list(content)
    .map(block => {
      const item = record(block);
      return item.type === 'text' ? str(item.text) : '';
    })
    .filter(text => text !== '')
    .join('\n');
}

function toolTextOf(content: unknown): string {
  const text = textOf(content);
  if (text !== '') return text;
  const blocks = list(content).filter(block => block !== null && typeof block === 'object');
  if (blocks.length === 0) return '';
  try {
    return blocks.map(block => JSON.stringify(block)).join('\n');
  } catch {
    return '';
  }
}

/** Time of an event as epoch milliseconds, when it carries one. */
export function timeOf(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/** The injected boundary message: the producer source kind, or its fixed first line. */
export function isBoundary(source: unknown, text: string): boolean {
  const kind = record(source).kind;
  if (kind === BOUNDARY_SOURCE_KIND) return true;
  const firstLine = text.split('\n', 1)[0] ?? '';
  return firstLine.trim() === BOUNDARY_FIRST_LINE;
}

function contextOf(source: Json): { tag: ContextTag; name: string } {
  switch (source.kind) {
    case 'skill-invocation':
      return { tag: 'skill', name: str(source.name) };
    case 'session-reference':
      return { tag: 'sessionReference', name: '' };
    case 'agent-instructions':
      return { tag: 'agentInstructions', name: '' };
    case 'compact-checkpoint':
      return { tag: 'compactCheckpoint', name: '' };
    case 'steering':
      return { tag: 'steering', name: '' };
    default:
      return { tag: 'generic', name: '' };
  }
}

function assistantBlock(value: unknown): AssistantBlock | null {
  const block = record(value);
  if (block.type === 'text' || block.type === 'reasoning') {
    const text = str(block.text);
    return text === '' ? null : { kind: block.type, text };
  }
  if (block.type === 'tool-call') {
    return {
      kind: 'tool-call',
      callId: block.id === undefined || block.id === null ? '' : String(block.id),
      name: str(block.name),
      argsRaw: typeof block.arguments === 'string' ? block.arguments : JSON.stringify(block.arguments ?? {}),
      result: null,
    };
  }
  return null;
}

const MAX_CONTEXT_TEXT = 4000;
const MAX_TOOL_TEXT = 16000;

/**
 * Fold committed events above the fork floor into render nodes. Replacement
 * surface ops and `tool/call` (duplicated by the assistant message) are
 * skipped; `tool/result` attaches to its call block by call id.
 */
export function foldEntries(entries: readonly WireEntry[], floor: number): ChatNode[] {
  const nodes: ChatNode[] = [];
  const results = new Map<string, ToolResult>();
  const sorted = [...entries].sort((a, b) => a.seq - b.seq);
  for (const event of sorted) {
    if (event.seq < floor) continue;
    if (event.surfaceOp !== undefined && event.surfaceOp !== 'append' && (event.type === 'user/message' || event.type === 'assistant/message')) continue;
    const data = record(event.data);
    if (event.type === 'user/message') {
      const text = textOf(data.content);
      if (text === '' || isBoundary(data.source, text)) continue;
      const source = record(data.source);
      if (source.kind === undefined || source.kind === 'user') {
        nodes.push({ kind: 'user', seq: event.seq, time: timeOf(event.time), text });
      } else {
        nodes.push({ kind: 'context', seq: event.seq, ...contextOf(source), text: text.slice(0, MAX_CONTEXT_TEXT) });
      }
    } else if (event.type === 'assistant/message') {
      const blocks = list(record(data.message).content).map(assistantBlock).filter(block => block !== null);
      if (blocks.length > 0) nodes.push({ kind: 'assistant', seq: event.seq, blocks });
    } else if (event.type === 'tool/result') {
      const message = record(data.message);
      const id = record(message.source).callId ?? data.callId;
      if (id === undefined || id === null) continue;
      results.set(String(id), { text: toolTextOf(message.content).slice(0, MAX_TOOL_TEXT), isError: message.isError === true });
    }
  }
  if (results.size === 0) return nodes;
  return nodes.map(node => node.kind !== 'assistant' ? node : {
    ...node,
    blocks: node.blocks.map(block => block.kind === 'tool-call' && results.has(block.callId)
      ? { ...block, result: results.get(block.callId) ?? null }
      : block),
  });
}

/** Blocks of the attempt the host is streaming; empty when idle. */
export function liveBlocks(live: LiveSnapshot | null): AssistantBlock[] {
  const attempt = live?.activeAttempt;
  if (!attempt) return [];
  return attempt.blocks.flatMap((block: LiveBlock): AssistantBlock[] => {
    if (block.kind === 'tool-call') return [{ ...block, result: null }];
    return block.text === '' ? [] : [block];
  });
}

/** A committed assistant event settles the live attempt with the same turn and step. */
export function settles(live: LiveSnapshot | null, entry: WireEntry): boolean {
  const attempt = live?.activeAttempt;
  if (!attempt || (entry.type !== 'assistant/message' && entry.type !== 'assistant/attempt')) return false;
  if (attempt.turn === undefined || attempt.turn === null || attempt.step === undefined || attempt.step === null) return false;
  const data = record(entry.data);
  return data.turn === attempt.turn && data.step === attempt.step;
}

// ---- Usage dock

interface Buckets {
  uncachedInputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface Metrics extends Readonly<Buckets> {
  readonly totalTokens: number;
  readonly billedInputTokens: number;
  /** Prompt-side tokens of the newest sample: the current context pressure. */
  readonly pressureTokens: number | null;
  readonly cacheHitPercent: string | null;
  readonly contextWindow: number | null;
}

const USAGE_FIELDS = [
  ['inputTokens', 'uncachedInputTokens'],
  ['outputTokens', 'outputTokens'],
  ['cacheReadTokens', 'cacheReadTokens'],
  ['cacheWriteTokens', 'cacheWriteTokens'],
] as const;

function bucketsOf(value: unknown): Buckets | null {
  const usage = record(value);
  const buckets: Buckets = { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  let recognized = false;
  for (const [field, bucket] of USAGE_FIELDS) {
    const raw = usage[field];
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) continue;
    buckets[bucket] = raw;
    recognized = true;
  }
  return recognized ? buckets : null;
}

function usageOf(entry: WireEntry): Buckets | null {
  if (entry.type !== 'assistant/message' && entry.type !== 'assistant/attempt') return null;
  const data = record(entry.data);
  const direct = bucketsOf(data.usage);
  if (direct !== null) return direct;
  const stream = list(data.stream);
  for (let index = stream.length - 1; index >= 0; index -= 1) {
    const frame = record(stream[index]);
    const chunk = record(frame.chunk);
    if (frame.type === 'chunk' && chunk.type === 'usage') {
      const buckets = bucketsOf(chunk.usage);
      if (buckets !== null) return buckets;
    }
  }
  return null;
}

/** Cache-hit percent text; a partial hit never rounds up to 100. */
export function cacheHitText(cacheRead: number, billedInput: number): string | null {
  if (!(billedInput > 0)) return null;
  if (cacheRead >= billedInput) return '100';
  const percent = cacheRead / billedInput * 100;
  const whole = Math.round(percent);
  return whole < 100 ? String(whole) : String(Math.floor(percent * 10) / 10);
}

/**
 * This side chat's own spend: only events above the fork floor are folded, a
 * re-settled turn/step replaces its previous sample and a retry closes it.
 */
export function metricsOf(entries: readonly WireEntry[], floor: number): Metrics | null {
  const totals: Buckets = { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  let last: { turn: unknown; step: unknown; buckets: Buckets } | null = null;
  let pressureTokens: number | null = null;
  let contextWindow: number | null = null;
  for (const entry of entries) {
    if (entry.seq < floor) continue;
    const data = record(entry.data);
    if (entry.type === 'request/context') {
      const window = data.contextWindow;
      if (typeof window === 'number' && Number.isFinite(window) && window > 0) contextWindow = window;
      continue;
    }
    if (entry.type === 'llm/retry-started') {
      if (last !== null && last.turn === data.turn && last.step === data.step) last = null;
      continue;
    }
    const buckets = usageOf(entry);
    if (buckets === null) continue;
    const keyed = typeof data.turn === 'number' && typeof data.step === 'number';
    if (keyed && last !== null && last.turn === data.turn && last.step === data.step) {
      for (const [, bucket] of USAGE_FIELDS) totals[bucket] -= last.buckets[bucket];
    }
    for (const [, bucket] of USAGE_FIELDS) totals[bucket] += buckets[bucket];
    last = keyed ? { turn: data.turn, step: data.step, buckets } : null;
    pressureTokens = buckets.uncachedInputTokens + buckets.cacheReadTokens + buckets.cacheWriteTokens;
  }
  const billedInputTokens = totals.uncachedInputTokens + totals.cacheReadTokens + totals.cacheWriteTokens;
  const totalTokens = billedInputTokens + totals.outputTokens;
  if (totalTokens === 0) return null;
  return {
    ...totals,
    billedInputTokens,
    totalTokens,
    pressureTokens,
    cacheHitPercent: cacheHitText(totals.cacheReadTokens, billedInputTokens),
    contextWindow,
  };
}

export interface Occupancy {
  readonly percent: number;
  readonly usedTokens: number;
  readonly contextWindow: number;
}

/** Absolute context occupancy; the window falls back to the host baseline. */
export function occupancyOf(metrics: Metrics | null, baseline: number | null): Occupancy | null {
  if (metrics === null || metrics.pressureTokens === null) return null;
  const contextWindow = metrics.contextWindow ?? baseline;
  if (contextWindow === null || !(contextWindow > 0)) return null;
  const usedTokens = metrics.pressureTokens;
  return { percent: Math.min(100, Math.round(usedTokens / contextWindow * 100)), usedTokens, contextWindow };
}

// ---- Server-Sent Events

export interface SseFrame {
  readonly event: string;
  readonly data: unknown;
}

/** Incremental SSE parser: feed decoded text, collect the frames each chunk completes. */
export function createSseParser(): { push(chunk: string): SseFrame[] } {
  let buffer = '';
  function parse(block: string): SseFrame | null {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line === '' || line.startsWith(':')) continue;
      const colon = line.indexOf(':');
      const field = colon < 0 ? line : line.slice(0, colon);
      let value = colon < 0 ? '' : line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);
      if (field === 'event') event = value;
      else if (field === 'data') data.push(value);
    }
    if (data.length === 0) return null;
    const raw = data.join('\n');
    try {
      return { event, data: JSON.parse(raw) as unknown };
    } catch {
      return { event, data: raw };
    }
  }
  return {
    push(chunk) {
      buffer += chunk;
      if (buffer.includes('\r')) buffer = buffer.replace(/\r\n?/g, '\n');
      const frames: SseFrame[] = [];
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const frame = parse(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        if (frame !== null) frames.push(frame);
        boundary = buffer.indexOf('\n\n');
      }
      return frames;
    },
  };
}
