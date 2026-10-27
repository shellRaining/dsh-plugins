import type { Annotation } from './model.ts';
import type { InputState, Occurrence, ReferenceInsert, UserTextCandidate } from './host.ts';

/** Input-trigger source name, chip serializer routing key, and user-text rule ID. */
export const CHIP_SOURCE = 'local-annotation';
const CLOSE = '\n</annotation>';
const INDENT = '  ';

export interface ChipKey { sessionId: string; id: string; number: number }
/** JSON data of one sent annotation recovered from user text. */
export interface SentAnnotation { number: number; quote: string; note: string; path?: string }

export function chipRef(item: Pick<Annotation, 'sessionId' | 'id' | 'number'>): string {
  return JSON.stringify([item.sessionId, item.id, item.number]);
}
export function parseChipRef(ref: string): ChipKey | undefined {
  try {
    const value: unknown = JSON.parse(ref);
    if (!Array.isArray(value) || value.length !== 3) return undefined;
    const [sessionId, id, number] = value as unknown[];
    if (typeof sessionId !== 'string' || !sessionId || typeof id !== 'string' || !id) return undefined;
    return typeof number === 'number' && Number.isSafeInteger(number) && number > 0 ? { sessionId, id, number } : undefined;
  } catch { return undefined; }
}
export function chipText(number: number): string { return `[批注 ${number}]`; }

/** One composer chip per annotation; its label and clipboard text are fixed at insertion. */
export function annotationChip(item: Annotation): ReferenceInsert {
  return { source: CHIP_SOURCE, ref: chipRef(item), label: `批注 ${item.number}`, clipboardText: chipText(item.number) };
}

/** Annotation ids the composer currently carries, in draft order. */
export function attachedIds(input: InputState | undefined, sessionId: string | undefined): string[] {
  const ids: string[] = [];
  for (const occurrence of input?.occurrences ?? []) {
    if (occurrence.source !== CHIP_SOURCE) continue;
    const key = parseChipRef(occurrence.ref);
    if (key && key.sessionId === sessionId && !ids.includes(key.id)) ids.push(key.id);
  }
  return ids;
}

/**
 * Detect-coordinate span of one chip plus the separator inserted after it.
 * Every chip is one detect character; plain text maps 1:1. Valid only in the
 * plain phase, where no command chip leads the draft.
 */
export function chipSpan(input: InputState, target: Occurrence): { start: number; end: number } {
  let shift = 0;
  for (const occurrence of input.occurrences) {
    if (occurrence === target) break;
    shift += occurrence.length - 1;
  }
  const start = target.offset - shift;
  const after = input.draft.charAt(target.offset + target.length);
  return { start, end: start + (after === ' ' ? 2 : 1) };
}

function instruction(number: number): string { return `请在回复中以「Annotation ${number}：」开头回应这条批注。`; }

/** Model form of one chip; the user-text rule below parses exactly this layout. */
export function annotationBlock(item: Annotation): string {
  const source = item.source.kind === 'file' ? `原文（文件 ${item.source.path}）：` : '原文：';
  const quote = item.text.split('\n').map(line => `> ${line}`).join('\n');
  // Continuation lines are indented, so no line inside the block can read as its close tag.
  const note = item.note.trim() ? `\n批注：${item.note.trim().split('\n').join(`\n${INDENT}`)}` : '';
  return `\n<annotation n="${item.number}">\n${instruction(item.number)}\n${source}\n${quote}${note}${CLOSE}\n`;
}

function parseBlock(body: string, number: number): SentAnnotation | undefined {
  const lines = body.split('\n');
  if (lines[0] !== instruction(number)) return undefined;
  const head = /^原文(?:（文件 (.+)）)?：$/.exec(lines[1] ?? '');
  if (!head) return undefined;
  let index = 2;
  const quote: string[] = [];
  for (; index < lines.length && lines[index]!.startsWith('>'); index++) quote.push(lines[index]!.replace(/^> ?/, ''));
  if (!quote.length) return undefined;
  const notes: string[] = [];
  if (index < lines.length) {
    if (!lines[index]!.startsWith('批注：')) return undefined;
    notes.push(lines[index]!.slice(3));
    for (index++; index < lines.length; index++) {
      if (!lines[index]!.startsWith(INDENT)) return undefined;
      notes.push(lines[index]!.slice(INDENT.length));
    }
  }
  const data: SentAnnotation = { number, quote: quote.join('\n'), note: notes.join('\n') };
  if (head[1] !== undefined) data.path = head[1];
  return data;
}

/** Recognizes sent annotation blocks in user messages so the bubble renders a chip. */
export const annotationRule = {
  id: CHIP_SOURCE,
  order: 20,
  match(text: string, from: number): UserTextCandidate<SentAnnotation> | undefined {
    const heads = /<annotation n="([1-9]\d{0,6})">\n/g;
    heads.lastIndex = from;
    for (let head = heads.exec(text); head; head = heads.exec(text)) {
      const body = head.index + head[0].length;
      const close = text.indexOf(CLOSE, body);
      if (close < 0) return undefined;
      const data = parseBlock(text.slice(body, close), Number(head[1]));
      if (!data) continue;
      // The block's own surrounding newlines exist for the model; the bubble keeps the chip inline as in the composer.
      const start = head.index > from && text.charAt(head.index - 1) === '\n' ? head.index - 1 : head.index;
      const end = close + CLOSE.length + (text.charAt(close + CLOSE.length) === '\n' ? 1 : 0);
      return { id: CHIP_SOURCE, start, end, data };
    }
    return undefined;
  },
};
