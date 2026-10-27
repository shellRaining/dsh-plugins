// Small value helpers shared by the host modules. Host payloads are untrusted
// `unknown` values; these helpers narrow them without throwing.

import type { Failure, FailureCode, Success } from '../shared/protocol.ts';
import type { Disposer } from './types.ts';

/** Read-only property view of an untrusted object value. */
export type UnknownRecord = Readonly<Record<string, unknown>>;

/** Whether a value is a non-null object (arrays included, like `typeof === 'object'`). */
export function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object';
}

/** The value as a read-only list, or undefined when it is not an array. */
export function asArray(value: unknown): readonly unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

/** Collapse any thrown value into one short, log-safe line. */
export function errorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.length > 500 ? `${text.slice(0, 499)}…` : text;
}

/** Clip a string to `max` characters with an ellipsis; non-strings become ''. */
export function clip(text: unknown, max: number): string {
  if (typeof text !== 'string') return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** The text blocks of one message content list, in order. */
export function textBlocks(content: unknown): string[] {
  const list = asArray(content);
  if (list === undefined) return [];
  const out: string[] = [];
  for (const block of list) {
    if (isRecord(block) && block.type === 'text' && typeof block.text === 'string') out.push(block.text);
  }
  return out;
}

export function failure(code: FailureCode, message?: string): Failure {
  return message === undefined ? { ok: false, code } : { ok: false, code, message };
}

export function success<T extends object>(fields: T): Success<T> {
  return { ok: true as const, ...fields };
}

/** Wrap a host-returned disposer; anything that is not a function yields undefined. */
export function toDisposer(value: unknown): Disposer | undefined {
  if (typeof value !== 'function') return undefined;
  return () => {
    Reflect.apply(value, undefined, []);
  };
}
