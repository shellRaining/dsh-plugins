import { createDisclosureMotion } from './disclosureMotion.ts';
import {
  ASSISTANT_BODY, boundsOf, CALL, COLUMN, flowRowOf, foldRoomOf, followingTail, GROUP_TITLE, HOST_MOTION, intersects, isEmptyRow,
  KEYED, keyOf, MARKDOWN_ROOT, NODE_SLOT, ROW, ROW_PARENT, scrollerOf, SUBCALLS, TAIL_SLOT, TOOL_ROW, TRAILING,
} from './flowDom.ts';
import { type Box, fadeFrames, lateFadeFrames, measure, MOTION_MS, Motions, px, slideFrames, translateY } from './motion.ts';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
/** Rows that render this soon after a column first shows rows belong to its opening load. */
const ARM_MS = 300;
/** Additions this soon after the running indicator leaves still belong to the run. */
const LIVE_TAIL_MS = 2000;
/** More entering blocks in one commit means a remount or mode switch, not live output. */
const MAX_UNITS = 12;
/** Removing this many rows at once replaces the transcript, as a session switch does. */
const REFRESH_ROWS = 3;
const TOOL_STATE_MS = 160;
/** Rows after an entering block that slide with it; the tail holds only the running indicator and echoes. */
const AFTER_ROWS = 4;
/** The reader's own messages: ui-chat lands them with its input scroll. */
const OWN_KINDS = new Set(['user', 'steering']);
const WATCHED = `${ROW_PARENT}, ${CALL}, ${NODE_SLOT}, ${TAIL_SLOT}, .${ASSISTANT_BODY}`;

interface ColumnState {
  /** Rows already shown; a remount or a regrouping under a known key never replays. */
  keys: Set<string>;
  armedAt: number;
  runningGoneAt: number;
}

/**
 * Layout movement that blocks entering a column in one frame cause, settled
 * after ui-chat has followed the tail for them.
 */
interface Shift {
  observer: ResizeObserver;
  scroller: Element;
  following: boolean;
  /** Height the blocks add; a follow scrolls at most this far for them. */
  grown: number;
  /** Height they push onto the rows after them; growth a scrolling process body absorbs is left out. */
  pushed: number;
  entering: Map<HTMLElement, number>;
  after: Set<HTMLElement>;
}

/**
 * `row` additions must sit at the tail and expand past remounted rows;
 * `filled` is an existing row whose empty slot just got content; `block` is
 * new content inside an existing assistant body or turn tail.
 */
type Source = 'row' | 'filled' | 'block';

function isLiveTransition(previous: string | null, current: string | null): boolean {
  return (previous === 'preparing' || previous === 'running') &&
    current !== previous &&
    (current === 'running' || current === 'ok' || current === 'error' || current === 'stopped');
}

function within(element: Element, set: ReadonlySet<Element>, stop: Element | null): boolean {
  for (let node: Element | null = element; node !== null && node !== stop; node = node.parentElement) {
    if (set.has(node)) return true;
  }
  return false;
}

/** Every following sibling is new in this commit, trailing chrome, or an empty seat. */
function atTail(element: Element, added: ReadonlySet<Element>): boolean {
  for (let next = element.nextElementSibling; next !== null; next = next.nextElementSibling) {
    if (!added.has(next) && !next.matches(TRAILING) && !isEmptyRow(next)) return false;
  }
  return true;
}

/**
 * Entering units of an added subtree. React remounts a row under a new parent
 * when a process group forms around it, so a subtree that holds known rows
 * contributes only its unknown rows.
 */
function unitsOf(root: HTMLElement, seen: ReadonlySet<string>): HTMLElement[] {
  const units: HTMLElement[] = [];
  for (const row of [root, ...root.querySelectorAll<HTMLElement>(`${KEYED}, ${SUBCALLS}`)]) {
    if (units.some((unit) => unit.contains(row))) continue;
    const key = keyOf(row);
    if (key !== null && seen.has(key)) continue;
    let known = false;
    for (const inner of row.querySelectorAll(KEYED)) {
      const innerKey = keyOf(inner);
      if (innerKey !== null && seen.has(innerKey)) {
        known = true;
        break;
      }
    }
    if (!known) units.push(row);
  }
  return units;
}

function enters(element: Element): boolean {
  const kind = element.getAttribute('data-chat-flow-kind');
  if (kind === null) return true;
  if (OWN_KINDS.has(kind)) return false;
  if (kind === 'assistant-step') {
    // Streamed text has its own fade; only a step that opens with reasoning, images, or a JSON block enters.
    const first = element.querySelector(`.${ASSISTANT_BODY}`)?.firstElementChild;
    return first !== null && first !== undefined && !first.classList.contains(MARKDOWN_ROOT);
  }
  return true;
}

/** Height an entering box adds to its parent, including its margins and the gap before it. */
function extentOf(element: HTMLElement, box: Box): number {
  const parent = element.parentElement;
  const gap = parent !== null && element.previousElementSibling !== null ? px(getComputedStyle(parent).rowGap) : 0;
  return box.height + px(box.marginTop) + px(box.marginBottom) + gap;
}

/** Whether a scrolling box between `element` and `column` takes its growth, as a capped process body does. */
function scrollsWithin(element: Element, column: Element): boolean {
  for (let node = element.parentElement; node !== null && node !== column; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if (overflow === 'auto' || overflow === 'scroll') return true;
  }
  return false;
}

interface Entering {
  element: HTMLElement;
  box: Box;
}

/** Add what entering boxes grow and push to the frame's shift; read before any effect starts. */
function track(shift: Shift, column: Element, boxes: readonly Entering[]): void {
  for (const { element, box } of boxes) {
    const extent = extentOf(element, box);
    shift.grown += extent;
    if (!scrollsWithin(element, column)) shift.pushed += extent;
    shift.entering.set(element, box.opacity);
    let next = flowRowOf(element, column)?.nextElementSibling ?? null;
    for (let count = 0; next !== null && count < AFTER_ROWS; next = next.nextElementSibling, count++) {
      const row = next;
      if (row instanceof HTMLElement && !row.hasAttribute('hidden') && !boxes.some((entry) => row.contains(entry.element))) {
        shift.after.add(row);
      }
    }
  }
}

/** Slot anchors use `display: contents` and have no box; animate what they hold. */
function boxesOf(element: HTMLElement, depth = 0): HTMLElement[] {
  if (depth > 2 || getComputedStyle(element).display !== 'contents') return [element];
  return [...element.children].flatMap((child) => child instanceof HTMLElement ? boxesOf(child, depth + 1) : []);
}

function titleText(button: Element): string {
  return button.lastElementChild?.firstElementChild?.textContent ?? '';
}

interface Candidate {
  element: HTMLElement;
  source: Source;
}

/**
 * Entry and transition motion for host-owned chat blocks. Rows that arrive
 * during a run fade in, tool rows brighten as their state settles, the live
 * process-group title fades to each new value, and reader toggles expand or
 * collapse (disclosureMotion.ts). It decorates ui-chat and ui-tool DOM through
 * the anchors in flowDom.ts with Web Animations only.
 *
 * Entries animate only opacity and translate, so they stay on the compositor
 * while a live run keeps the main thread busy. An entering block takes its
 * full height at once and ui-chat's follow scroll stays instant; rows it pushes
 * down without a scroll slide back from where they were instead of jumping.
 *
 * Motion is for live output. A column arms 300 ms after it first shows rows,
 * and rows animate only while its running indicator is present or within 2 s
 * after it leaves. Opening a session, loading older turns, switching modes,
 * and remounts stay instant.
 */
export function installBlockMotion(): () => void {
  if (typeof MutationObserver === 'undefined' || typeof ResizeObserver === 'undefined' || typeof matchMedia === 'undefined' ||
    document.body === null || typeof Element.prototype.animate !== 'function') {
    return () => {};
  }
  const preference = matchMedia(REDUCED_MOTION);
  const motions = new Motions();
  const disclosure = createDisclosureMotion(motions);
  let columns = new WeakMap<Element, ColumnState>();
  let titles = new WeakMap<Element, { text: string; at: number }>();
  const shifts = new Map<Element, Shift>();

  const isLive = (column: Element, state: ColumnState, now: number) =>
    column.querySelector('[data-chat-running]') !== null || now - state.runningGoneAt < LIVE_TAIL_MS;
  const ready = (column: Element, now: number) => {
    const state = columns.get(column);
    return state !== undefined && now >= state.armedAt && isLive(column, state, now) &&
      !column.hasAttribute('data-input-fold') && column.querySelector(HOST_MOTION) === null;
  };

  const titleObserver = new MutationObserver((records) => {
    const now = performance.now();
    const buttons = new Set<Element>();
    for (const record of records) {
      const node = record.target;
      const button = (node instanceof Element ? node : node.parentElement)?.closest(GROUP_TITLE);
      if (button !== null && button !== undefined) buttons.add(button);
    }
    for (const button of buttons) {
      const title = titles.get(button);
      const text = titleText(button);
      if (title === undefined || title.text === text) continue;
      title.text = text;
      const label = button.lastElementChild;
      const column = button.closest(COLUMN);
      // ui-chat may swap the live title every 150 ms; let a running fade finish.
      if (label === null || column === null || now - title.at < MOTION_MS || button.closest('[hidden]') !== null ||
        !ready(column, now)) continue;
      const box = measure(label);
      if (box.opacity === 0 || !intersects(box, boundsOf(column))) continue;
      title.at = now;
      motions.play(label, fadeFrames(box.opacity));
    }
  });
  const watchTitle = (group: Element) => {
    const button = group.querySelector(GROUP_TITLE);
    if (button === null || titles.has(button)) return;
    titles.set(button, { text: titleText(button), at: 0 });
    titleObserver.observe(button, { subtree: true, childList: true, characterData: true });
  };

  const remember = (state: ColumnState, row: Element) => {
    const key = keyOf(row);
    if (key !== null) state.keys.add(key);
    if (row.hasAttribute('data-chat-group-key')) watchTitle(row);
  };
  const stateOf = (column: Element, added: ReadonlySet<Element>, now: number): ColumnState => {
    const known = columns.get(column);
    if (known !== undefined) return known;
    const state: ColumnState = { keys: new Set(), armedAt: Number.POSITIVE_INFINITY, runningGoneAt: Number.NEGATIVE_INFINITY };
    for (const row of column.querySelectorAll(KEYED)) {
      if (within(row, added, column)) continue;
      remember(state, row);
      // Rows were already on screen, so this column is past its opening load.
      state.armedAt = now;
    }
    columns.set(column, state);
    return state;
  };

  const settleTools = (changed: ReadonlyMap<HTMLElement, string | null>) => {
    for (const [element, previous] of changed) {
      if (!element.isConnected || !element.matches(TOOL_ROW) || !isLiveTransition(previous, element.getAttribute('data-state')) ||
        element.closest('[hidden], [aria-hidden="true"]') !== null) continue;
      // Offscreen or folded results must not spend work or replay an old transition when opened later.
      const box = measure(element);
      if (box.height === 0 || box.bottom <= 0 || box.top >= window.innerHeight) continue;
      motions.play(element, [{ opacity: box.opacity * 0.72 }, { opacity: box.opacity }], { duration: TOOL_STATE_MS, easing: 'ease-out' });
    }
  };

  /** Move `element` back from `by` px, continuing from any offset a running slide still holds. */
  const slide = (element: HTMLElement, by: number) => {
    const from = by + (motions.running(element) ? translateY(element) : 0);
    motions.play(element, slideFrames(from));
  };

  const dropShift = (column: Element) => {
    shifts.get(column)?.observer.disconnect();
    shifts.delete(column);
  };

  /**
   * Runs at the end of this frame's resize step, so ui-chat's follow scroll
   * for these blocks has already happened and nothing has been painted yet.
   */
  const settle = (column: Element) => {
    const shift = shifts.get(column);
    dropShift(column);
    if (shift === undefined || !column.isConnected) return;
    const { scroller } = shift;
    // ui-chat's follow scroll stays instant and may already have run while it committed these
    // blocks, so read it from where the scroll ends instead of from an earlier offset. A follow
    // that keeps the tail pinned scrolled the growth away, up to the whole scroll range, unless
    // fold room below took it and the floor never moved. A reader's own scrolling never counts.
    const top = scroller.scrollTop;
    const pinned = shift.following && scroller.scrollHeight - scroller.clientHeight - top <= 1;
    const scrolled = pinned && foldRoomOf(column) === 0 ? Math.min(top, shift.grown) : 0;
    // What the follow did not scroll away pushes the rows below; they slide down from where they were.
    const pushed = shift.pushed - scrolled;
    const after = [...shift.after].filter((row) => row.isConnected);
    if (pushed <= 0.5 || after.length === 0) return;
    for (const row of after) slide(row, -pushed);
    // Keep each block clear until the pushed rows have moved off it.
    for (const [element, opacity] of shift.entering) if (element.isConnected) motions.play(element, lateFadeFrames(opacity));
  };

  const shiftOf = (column: Element, following: boolean): Shift | null => {
    const known = shifts.get(column);
    if (known !== undefined) return known;
    const scroller = scrollerOf(column);
    if (scroller === null) return null;
    let deferred = false;
    const observer = new ResizeObserver(() => {
      const shift = shifts.get(column);
      const deeper = shift?.entering.keys().next().value;
      if (!deferred && deeper !== undefined && deeper.isConnected) {
        // Its first report comes in the frame's first round. A box deeper than every target
        // of that round reports in the next one, after ui-chat's observer has followed the tail.
        deferred = true;
        observer.observe(deeper);
        return;
      }
      settle(column);
    });
    const shift: Shift = {
      observer, scroller, following, grown: 0, pushed: 0, entering: new Map(), after: new Set(),
    };
    shifts.set(column, shift);
    observer.observe(column);
    return shift;
  };

  const enter = (column: Element, state: ColumnState, candidates: readonly Candidate[], added: ReadonlySet<Element>) => {
    const units = new Set<HTMLElement>();
    for (const { element, source } of candidates) {
      if (source === 'block') {
        for (const box of boxesOf(element)) units.add(box);
        continue;
      }
      const roots = source === 'row' ? unitsOf(element, state.keys).filter((unit) => atTail(unit, added)) : [element];
      for (const unit of roots) if (enters(unit)) units.add(unit);
    }
    if (units.size === 0 || units.size > MAX_UNITS) return;
    const bounds = boundsOf(column);
    const following = followingTail(column);
    // Measuring inside a folded subtree would force its skipped layout, so filter first;
    // then read every box before the first effect starts.
    const boxes = [...units]
      .filter((element) => element.closest(`[hidden], ${HOST_MOTION}`) === null)
      .map((element) => ({ element, box: measure(element) }))
      // A following reader is about to land on the tail, so a row just below the band still counts.
      .filter(({ box }) => box.height > 0 && box.opacity > 0 && (intersects(box, bounds) || (following && box.top >= bounds.top)));
    if (boxes.length === 0) return;
    const shift = shiftOf(column, following);
    if (shift !== null) track(shift, column, boxes);
    for (const { element, box } of boxes) motions.play(element, fadeFrames(box.opacity));
  };

  const observer = new MutationObserver((records) => {
    const now = performance.now();
    disclosure.handle(records, now);
    const added = new Set<Element>();
    const additions = new Map<HTMLElement, HTMLElement[]>();
    const replaced = new Set<Element>();
    const removedRows = new Map<Element, number>();
    const states = new Map<HTMLElement, string | null>();
    for (const record of records) {
      const target = record.target;
      if (!(target instanceof HTMLElement)) continue;
      if (record.type === 'attributes') {
        const name = record.attributeName;
        const value = name === null ? null : target.getAttribute(name);
        if (name === 'data-state') {
          if (!states.has(target)) states.set(target, record.oldValue);
        } else if ((name === 'data-input-fold' && value !== null) || (name === 'data-chat-motion' && (value === 'collapse' || value === 'reveal'))) {
          // ui-chat starts a fold and writes inline geometry that these effects must not override.
          const column = target.closest(COLUMN);
          motions.cancelWithin(column ?? target);
          if (column !== null) dropShift(column);
        }
        continue;
      }
      if (!target.matches(WATCHED)) continue;
      for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        added.add(node);
        const list = additions.get(target);
        if (list === undefined) additions.set(target, [node]);
        else list.push(node);
      }
      for (const node of record.removedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        replaced.add(target);
        const column = target.closest(COLUMN);
        if (column === null) continue;
        if (node.hasAttribute('data-chat-running')) stateOf(column, added, now).runningGoneAt = now;
        else if (node.matches(KEYED)) removedRows.set(column, (removedRows.get(column) ?? 0) + 1);
      }
    }
    settleTools(states);

    const byColumn = new Map<Element, Candidate[]>();
    for (const [parent, nodes] of additions) {
      const column = parent.closest(COLUMN);
      if (column === null || !parent.isConnected || within(parent, added, column)) continue;
      let list = byColumn.get(column);
      if (list === undefined) byColumn.set(column, list = []);
      if (parent.matches(ROW_PARENT) || parent.matches(CALL)) {
        for (const node of nodes) {
          if (node.isConnected && (node.matches(ROW) || node.matches(SUBCALLS))) list.push({ element: node, source: 'row' });
        }
      } else if (parent.matches(NODE_SLOT)) {
        const row = parent.parentElement;
        if (row !== null && row.hasAttribute('data-chat-flow-kind') && !replaced.has(parent) &&
          [...parent.children].every((child) => added.has(child))) list.push({ element: row, source: 'filled' });
      } else if (parent.classList.contains(ASSISTANT_BODY) || !replaced.has(parent)) {
        // New blocks of an assistant body, or turn-tail content that just filled an empty slot.
        const fills = parent.classList.contains(ASSISTANT_BODY) || [...parent.children].every((child) => added.has(child));
        for (const node of nodes) {
          if (fills && node.isConnected && !node.classList.contains(MARKDOWN_ROOT)) list.push({ element: node, source: 'block' });
        }
      }
    }
    for (const [column, candidates] of byColumn) {
      const state = stateOf(column, added, now);
      if ((removedRows.get(column) ?? 0) >= REFRESH_ROWS) state.armedAt = now + ARM_MS;
      else if (candidates.length > 0 && ready(column, now)) enter(column, state, candidates, added);
      for (const { element } of candidates) {
        remember(state, element);
        for (const row of element.querySelectorAll(KEYED)) remember(state, row);
      }
      if (state.armedAt === Number.POSITIVE_INFINITY && column.querySelector(KEYED) !== null) state.armedAt = now + ARM_MS;
    }
    // Drop the records of ghost nodes the disclosure motion just put back.
    observer.takeRecords();
  });

  const stop = () => {
    observer.disconnect();
    titleObserver.disconnect();
    for (const column of [...shifts.keys()]) dropShift(column);
    disclosure.stop();
    motions.cancelAll();
  };
  const synchronize = () => {
    stop();
    if (preference.matches || document.visibilityState === 'hidden') return;
    // Output that arrived while hidden was never observed; start from what is on the page now.
    columns = new WeakMap();
    titles = new WeakMap();
    const now = performance.now();
    for (const column of document.querySelectorAll(COLUMN)) stateOf(column, new Set(), now);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-state', 'hidden', 'data-chat-motion', 'data-input-fold'],
      attributeOldValue: true,
    });
    disclosure.start();
  };
  preference.addEventListener('change', synchronize);
  document.addEventListener('visibilitychange', synchronize);
  synchronize();
  return () => {
    stop();
    preference.removeEventListener('change', synchronize);
    document.removeEventListener('visibilitychange', synchronize);
  };
}
