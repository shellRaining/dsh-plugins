/**
 * ui-chat and ui-tool DOM anchors (DSH 0.2.2-rc.1) that block motion reads.
 * Only semantic data-* attributes and the plugin's own classes; re-check them
 * on every DSH upgrade. A missing anchor only disables the matching motion.
 */

/** The outer chat column. Process-group content also carries `data-chat-flow`. */
export const COLUMN = '[data-chat-flow]:not([data-step-process-content])';
/** The column's own row list; it renders as `display: contents`. */
export const FLOW_SLOT = '[data-slot="conversation.chat.flow"]';
/** Parents whose children are rows: the column's flow slot, process-group content, and subcall lists. */
export const ROW_PARENT = `${FLOW_SLOT}, [data-step-process-content], [data-subcalls]`;
/** Rows and process groups, tool calls including subcalls, and the running indicator. */
export const ROW = '[data-chat-flow-key], [data-chat-call-id], [data-chat-running]';
export const KEYED = '[data-chat-flow-key], [data-chat-call-id]';
export const CALL = '[data-chat-call-id]';
export const SUBCALLS = '[data-subcalls]';
export const NODE_SLOT = '[data-slot="conversation.chat.node"]';
/** Turn-end feature content such as action cards, plans, and deliverables. */
export const TAIL_SLOT = '[data-slot="conversation.chat.turnTail"]';
/** The plugin's assistant body (src/chat) and Markdown root (src/markdown). */
export const ASSISTANT_BODY = 'dsh-sd-body';
export const MARKDOWN_ROOT = 'dsh-sd-md';
/** Rows that may follow a live addition: the running indicator, local echoes, and hidden rows. */
export const TRAILING = '[data-chat-running], [data-submission-echo], [data-pending-steering], [hidden]';
/** ui-chat's own fold motion owns a row while it collapses or reveals. */
export const HOST_MOTION = '[data-chat-motion="collapse"], [data-chat-motion="reveal"]';
export const GROUP_TITLE = 'button[data-process-activity]';
export const TOOL_ROW = '[data-chat-call-id] [data-variant][data-state]';
/** ui-chat's fold room, a sibling after the column whose inline height it reclaims as content grows. */
const TURN_SPACER = '[data-chat-turn-spacer]';

/**
 * Identity of a row across remounts. A node keeps its node key when ui-chat
 * moves it into a process group or splits off its reasoning part; call ids get
 * a prefix so they never collide with node keys.
 */
export function keyOf(element: Element): string | null {
  const node = element.getAttribute('data-chat-node-key') ?? element.getAttribute('data-chat-flow-key');
  if (node !== null) return node;
  const call = element.getAttribute('data-chat-call-id');
  return call === null ? null : `call:${call}`;
}

/** A seat whose node renderer returned nothing; ui-chat gives it zero height. */
export function isEmptyRow(row: Element): boolean {
  const only = row.firstElementChild;
  return only === null || (row.childElementCount === 1 && only.matches(NODE_SLOT) && only.childElementCount === 0);
}

export function followingTail(column: Element): boolean {
  return column.closest('[data-chat-following-tail]') !== null;
}

/**
 * The element that scrolls `column`: ui-conversation's scroller, or the
 * column's own list when ChatView scrolls by itself.
 */
export function scrollerOf(column: Element): Element | null {
  return column.closest('[data-conversation-scroll]') ?? column.parentElement;
}

/** Fold room left below `column`; new content fills it before the scroll floor moves. */
export function foldRoomOf(column: Element): number {
  const spacer = column.parentElement?.querySelector(`:scope > ${TURN_SPACER}`);
  return spacer instanceof HTMLElement ? spacer.offsetHeight : 0;
}

/** The row of the column's own flow that holds `element`. */
export function flowRowOf(element: HTMLElement, column: Element): HTMLElement | null {
  for (let node: HTMLElement | null = element; node !== null && node !== column; node = node.parentElement) {
    const parent = node.parentElement;
    if (parent === column || (parent !== null && parent.matches(FLOW_SLOT))) return node;
  }
  return null;
}

export interface Bounds {
  top: number;
  bottom: number;
}

/** The visible band of the scroller that shows `column`, clipped to the window. */
export function boundsOf(column: Element): Bounds {
  const rect = scrollerOf(column)?.getBoundingClientRect();
  return {
    top: Math.max(0, rect?.top ?? 0),
    bottom: Math.min(window.innerHeight, rect?.bottom ?? window.innerHeight),
  };
}

export function intersects(box: { top: number; bottom: number; height: number }, bounds: Bounds): boolean {
  return box.height > 0 && box.bottom > bounds.top && box.top < bounds.bottom;
}
