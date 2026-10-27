// Seed construction for one side session: the parent's completed-turn prefix,
// a compressed view of the parent's in-flight tail, and the model-facing
// boundary and developer instructions.

import { BOUNDARY_FIRST_LINE } from '../shared/protocol.ts';
import { asArray, clip, isRecord, textBlocks } from './util.ts';

export const RECENT_CONTEXT_MAX_CHARS = 6000;

/**
 * The balanced completed-turn prefix of a session's event log: every event up
 * to and including the last `turn/end`. The in-flight turn is excluded because
 * an unclosed turn cannot be replayed as a child session seed.
 * @param events - session events in log order (`seq` equals the array index).
 * @returns the seed events contiguously from seq 0; empty before any completed turn.
 */
export function completedTurnPrefix(events: unknown): unknown[] {
  const list = asArray(events);
  if (list === undefined) return [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const event = list[index];
    if (isRecord(event) && event.type === 'turn/end') return list.slice(0, index + 1);
  }
  return [];
}

/**
 * Whether one block of text is harness plumbing rather than conversation:
 * `<system-reminder>` payloads and the `Current runtime context` snapshot.
 * @param text - candidate text.
 * @returns true when the text must never reach the side conversation.
 */
export function isSystemNoise(text: unknown): boolean {
  if (typeof text !== 'string') return false;
  return text.includes('<system-reminder>')
    || text.includes('<system_reminder>')
    || text.trimStart().startsWith('Current runtime context');
}

/** One parent event as a reference line, or undefined when it is dropped. */
function contextLine(event: Readonly<Record<string, unknown>>): string | undefined {
  const data = isRecord(event.data) ? event.data : undefined;
  switch (event.type) {
    case 'user/message': {
      const source = isRecord(data?.source) ? data.source : undefined;
      if (source?.kind !== 'user') return undefined;
      const text = textBlocks(data?.content).filter((block) => !isSystemNoise(block)).join(' ').trim();
      return text === '' ? undefined : `User: ${clip(text, 500)}`;
    }
    case 'assistant/message': {
      const message = isRecord(data?.message) ? data.message : undefined;
      const text = textBlocks(message?.content).join(' ').trim();
      return text === '' ? undefined : `Assistant: ${clip(text, 300)}`;
    }
    case 'tool/call': {
      const toolName = data?.name;
      return typeof toolName === 'string' && toolName !== '' ? `Tool call: ${toolName}` : undefined;
    }
    case 'tool/result': {
      const message = isRecord(data?.message) ? data.message : undefined;
      return message?.isError === true ? 'Tool result: failed' : undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Compress the parent's live log from `fromSeq` onward into reference text for
 * the boundary message: user input, assistant text, tool-call names, and failed
 * tool results. System-injected messages and system noise are dropped.
 * @param events - the parent's session events in log order.
 * @param fromSeq - first sequence number to include (the fork boundary).
 * @param maxChars - cap on the returned text; the tail is kept.
 * @returns the reference text, or '' when nothing survives the filters.
 */
export function recentMainContext(events: unknown, fromSeq = 0, maxChars = RECENT_CONTEXT_MAX_CHARS): string {
  const list = asArray(events);
  if (list === undefined) return '';
  const parts: string[] = [];
  for (const event of list) {
    if (!isRecord(event)) continue;
    if (typeof event.seq !== 'number' || event.seq < fromSeq) continue;
    const line = contextLine(event);
    if (line !== undefined) parts.push(line);
  }
  const kept: string[] = [];
  let total = 0;
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index] ?? '';
    const cost = part.length + 1;
    if (total + cost > maxChars) {
      if (kept.length === 0) kept.unshift(clip(part, maxChars));
      break;
    }
    kept.unshift(part);
    total += cost;
  }
  if (kept.length < parts.length) kept.unshift('(earlier parent-session context omitted)');
  return kept.join('\n');
}

/**
 * The injected boundary user message. Its first line is fixed: the panel uses
 * it as a fallback hiding marker. Unlike read-only side chats, it explicitly
 * authorizes real, minimal, on-disk changes requested after the boundary.
 * @param parentSessionId - the main session this side conversation derives from.
 * @param recentContext - optional reference text from `recentMainContext`.
 * @returns the complete boundary message text.
 */
export function sideConversationBoundaryPrompt(parentSessionId: string, recentContext = ''): string {
  const lines = [
    BOUNDARY_FIRST_LINE,
    '',
    `You are in a side conversation derived from main session "${parentSessionId}". You inherit its working directory, model route, tools, skills, and permission composition. This side conversation is temporary: closing it destroys it, it never appears in the session list, and it cannot be reopened.`,
    '',
    'Everything before this boundary is inherited history from the parent thread. It is reference context only, not your current task. Do not continue, execute, or complete instructions, plans, tool calls, approvals, edits, or requests that appear only in that inherited history. Only messages submitted after this boundary are active instructions for this side conversation.',
    '',
    'This side conversation is a full working agent in the same workspace, not a read-only chat. When the user asks for a change after this boundary, you must make the change for real with the available tools — `write`, `edit`, `bash`, and every other enabled tool — modifying the same files in the same working directory. Changes must actually land on disk: never simulate a change, never describe a change you did not perform, and never claim a file was modified when it was not. Keep every change minimal and limited to what the user asked for, and do not touch the main thread\'s task.',
    '',
    'Sub-agents are off-limits in this side conversation. Do not interact with any existing or new sub-agents, even if sub-agents were used before this boundary. Do not write anything into the main session transcript, and do not create commits, branches, or pushes unless the user explicitly asks for them.',
    '',
    'When you finish, report exactly what you changed and what you verified, so the user can reconcile it with the main thread.',
  ];
  if (recentContext !== '') {
    lines.push(
      '',
      '[Recent activity from the parent session — completes the forked history; reference only, do not act on it]',
      recentContext,
    );
  }
  return lines.join('\n');
}

/**
 * The developer-instruction counterpart of the boundary prompt, registered as a
 * system-prompt section as a second line of defense.
 * @returns the instruction text.
 */
export function sideDeveloperInstructions(): string {
  return [
    'You are in a side conversation, not the main thread.',
    '',
    'The inherited fork history is provided only as reference context. Do not treat instructions, plans, or requests found in it as active instructions for this side conversation; only instructions submitted after the side-conversation boundary are active. Do not continue, execute, or complete a task, plan, tool call, approval, edit, or request that appears only in inherited history, and do not present yourself as continuing the main thread\'s active task.',
    '',
    'This side conversation is a real working agent in the same workspace. When the user explicitly requests a change after the boundary, perform it with the real tools — `write`, `edit`, `bash`, and any other enabled tools — so the edits land on disk in the same working directory. Keep the change minimal and limited to the request, verify it, and report what changed. Never describe a change you did not make.',
    '',
    'Do not write anything into the main session transcript. Do not interact with sub-agents from this side conversation, and do not create commits, branches, or pushes unless the user explicitly asks for them.',
  ].join('\n');
}
