// Wire projection of committed session events for the snapshot route, the
// stream's `hello` baseline and `event` frames.

import { CLIENT_EVENT_TYPES, type WireEntry } from '../shared/protocol.ts';
import { asArray, isRecord } from './util.ts';

export const SNAPSHOT_PAGE_LIMIT = 2000;

function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

/**
 * Shape one committed session event for the wire: sequence, type, time and
 * data, plus the optional surface projection fields.
 * @param event - one committed session event.
 * @returns the wire entry, or undefined when the value is not an event the client folds.
 */
export function projectEntry(event: unknown): WireEntry | undefined {
  if (!isRecord(event)) return undefined;
  const { seq, type, time, surfaceOp } = event;
  if (typeof seq !== 'number' || typeof type !== 'string' || !CLIENT_EVENT_TYPES.has(type)) return undefined;
  const sourceEventSeqs = asArray(event.sourceEventSeqs);
  return {
    seq,
    type,
    ...(typeof time === 'number' || typeof time === 'string' ? { time } : {}),
    data: event.data,
    ...(typeof surfaceOp === 'string' ? { surfaceOp } : {}),
    ...(sourceEventSeqs !== undefined && sourceEventSeqs.every(isNumber) ? { sourceEventSeqs } : {}),
  };
}

/**
 * Shape and page committed session events for the client.
 * @param events - committed session events in log order.
 * @param floor - inclusive lower bound; events below it are never re-sent.
 * @param limit - maximum number of trailing entries returned.
 * @returns the trailing entries and whether older entries were dropped.
 */
export function snapshotEntries(
  events: unknown,
  floor = 0,
  limit = SNAPSHOT_PAGE_LIMIT,
): { entries: WireEntry[]; truncated: boolean } {
  const list: WireEntry[] = [];
  for (const event of asArray(events) ?? []) {
    const entry = projectEntry(event);
    if (entry !== undefined && entry.seq >= floor) list.push(entry);
  }
  if (limit > 0 && list.length > limit) return { entries: list.slice(list.length - limit), truncated: true };
  return { entries: list, truncated: false };
}
