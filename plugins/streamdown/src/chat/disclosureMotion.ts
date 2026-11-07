import { boundsOf, COLUMN, followingTail, HOST_MOTION, intersects } from './flowDom.ts';
import { type Box, collapsed, enterFrames, exitFrames, measure, type Motions, sizeOf, trackingHeight } from './motion.ts';

/** Commits this soon after a toggle belong to it; React applies one within a frame or two. */
const INTENT_MS = 400;
/** Bound the walk that remembers scroll offsets inside content about to collapse. */
const SCROLL_SCAN_LIMIT = 2000;

interface Intent {
  at: number;
  column: Element;
  control: Element;
  /** Parent of the toggle; expanded content mounts and unmounts as its child. */
  scope: Element;
  /** Boxes a `hidden`-attribute fold is about to change, measured before the commit. */
  boxes: Map<Element, Box>;
  scrolls: Map<Element, readonly [number, number]>;
}

export interface DisclosureMotion {
  start(): void;
  stop(): void;
  /** Animate what the latest reader toggle changed in this observer batch. */
  handle(records: readonly MutationRecord[], now: number): void;
}

/**
 * Elements a toggle folds through the `hidden` attribute rather than by
 * unmounting: a collapsed-mode process group's body, and the rows (plus inline
 * reasoning) behind a Turn's duration row.
 */
function foldTargets(control: Element): Element[] {
  if (control.matches('button[data-process-activity]')) {
    const body = control.closest('[data-chat-group-key]')?.querySelector(':scope > [data-step-process-body]');
    return body === null || body === undefined ? [] : [body];
  }
  if (!control.matches('[data-turn-process]')) return [];
  const row = control.closest('[data-chat-flow-key]');
  const turn = row?.getAttribute('data-chat-turn');
  const parent = row?.parentElement;
  if (row === null || row === undefined || turn === null || turn === undefined || parent === null || parent === undefined) return [];
  const targets: Element[] = [];
  for (const sibling of parent.children) {
    if (sibling === row || sibling.getAttribute('data-chat-turn') !== turn) continue;
    targets.push(sibling, ...sibling.querySelectorAll('[data-sd-process-reasoning]'));
  }
  return targets;
}

/** A re-inserted node starts unscrolled; keep terminal or diff bodies where the reader left them. */
function rememberScrolls(root: Element, scrolls: Map<Element, readonly [number, number]>): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node: Node | null = root;
  for (let count = 0; node !== null && count < SCROLL_SCAN_LIMIT; count++, node = walker.nextNode()) {
    const element = node as Element;
    if (element.scrollTop !== 0 || element.scrollLeft !== 0) scrolls.set(element, [element.scrollTop, element.scrollLeft]);
  }
}

/**
 * Expand and collapse motion for disclosures the reader toggles in the chat
 * column. Only toggles that follow a click or Enter/Space on an
 * `[aria-expanded]` control animate, so history, mode switches, automatic
 * folds, and find-in-page reveals stay instant.
 *
 * DisclosureRow and the other chat disclosures unmount their content on
 * collapse. The removed node is no longer React's, so it is put back as an
 * inert ghost for the exit and removed afterwards; nothing React still owns is
 * touched.
 */
export function createDisclosureMotion(motions: Motions): DisclosureMotion {
  let intent: Intent | null = null;
  const ghosts = new WeakSet<Node>();
  const live = new Set<HTMLElement>();

  const capture = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return;
    const control = target.closest('[aria-expanded]');
    if (control === null || control.hasAttribute('aria-haspopup')) return;
    const column = control.closest(COLUMN);
    const scope = control.closest('[data-disclosure-header]')?.parentElement ?? control.parentElement;
    if (column === null || scope === null) return;
    const boxes = new Map<Element, Box>();
    for (const element of foldTargets(control)) {
      // Inside an already folded row the layout is skipped; measuring would force it.
      if ((element.parentElement?.closest('[hidden]') ?? null) === null) boxes.set(element, measure(element));
    }
    const scrolls = new Map<Element, readonly [number, number]>();
    if (control.getAttribute('aria-expanded') === 'true') {
      for (const child of scope.children) if (!child.contains(control)) rememberScrolls(child, scrolls);
    }
    intent = { at: performance.now(), column, control, scope, boxes, scrolls };
  };
  const onClick = (event: MouseEvent) => {
    capture(event.target);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') capture(event.target);
  };

  const dropGhosts = (scope: Element) => {
    for (const ghost of [...live]) {
      if (ghost.parentNode !== scope) continue;
      live.delete(ghost);
      ghost.remove();
      motions.cancel(ghost);
    }
  };

  const expandContent = (current: Intent, node: HTMLElement) => {
    if (ghosts.has(node) || !node.isConnected || node.contains(current.control)) return;
    dropGhosts(current.scope);
    const box = measure(node);
    if (box.opacity === 0 || !intersects(box, boundsOf(current.column))) return;
    motions.play(node, enterFrames(collapsed(), { ...sizeOf(box), height: trackingHeight(box) }, box));
  };

  const collapseContent = (current: Intent, node: HTMLElement, next: Node | null) => {
    if (ghosts.has(node) || node.isConnected || node.contains(current.control)) return;
    const { scope } = current;
    scope.insertBefore(node, next !== null && next.parentNode === scope ? next : null);
    ghosts.add(node);
    node.inert = true;
    node.setAttribute('aria-hidden', 'true');
    // Lets the plugin's own CSS keep a collapsing reasoning row unclipped.
    node.setAttribute('data-sd-exit', '');
    for (const [element, [top, left]] of current.scrolls) {
      if (!node.contains(element)) continue;
      element.scrollTop = top;
      element.scrollLeft = left;
    }
    const box = measure(node);
    if (box.opacity === 0 || !intersects(box, boundsOf(current.column))) {
      node.remove();
      return;
    }
    live.add(node);
    motions.play(node, exitFrames(sizeOf(box), collapsed(), box), {
      fill: 'forwards',
      onEnd: () => {
        live.delete(node);
        node.remove();
      },
    });
  };

  const foldHidden = (current: Intent, element: HTMLElement, before: Box, wasHidden: boolean) => {
    const hidden = element.hasAttribute('hidden');
    if (hidden === wasHidden || element.closest(HOST_MOTION) !== null) return;
    const bounds = boundsOf(current.column);
    if (!hidden) {
      const box = measure(element);
      if (box.opacity === 0 || !intersects(box, bounds)) return;
      // `before` holds the folded margins, such as inline reasoning's -16px bottom.
      motions.play(element, enterFrames(collapsed(before.marginTop, before.marginBottom), sizeOf(box), box));
      return;
    }
    // ui-chat keeps a following reader's rows still when a fold hides them at
    // once, and animates folds itself inside its motion scope.
    if (followingTail(current.column) || current.column.hasAttribute('data-chat-motion')) return;
    if (before.opacity === 0 || !intersects(before, bounds)) return;
    const after = getComputedStyle(element);
    // `hidden="until-found"` hides through content-visibility, plain `hidden` through display.
    const keep: Keyframe = element.getAttribute('hidden') === 'until-found' ? { contentVisibility: 'visible' } : { display: before.display };
    motions.play(element, exitFrames(sizeOf(before), collapsed(after.marginTop, after.marginBottom), before, keep), { fill: 'forwards' });
  };

  return {
    start() {
      document.addEventListener('click', onClick, true);
      document.addEventListener('keydown', onKeyDown, true);
    },
    stop() {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKeyDown, true);
      intent = null;
      for (const ghost of live) ghost.remove();
      live.clear();
    },
    handle(records, now) {
      if (intent !== null && now - intent.at > INTENT_MS) intent = null;
      const current = intent;
      if (current === null || !current.scope.isConnected || !current.control.isConnected ||
        current.column.hasAttribute('data-input-fold')) return;
      const open = current.control.getAttribute('aria-expanded') === 'true';
      const hostMotion = new Set<Node>();
      const folds = new Map<HTMLElement, boolean>();
      for (const record of records) {
        if (record.type !== 'attributes') continue;
        if (record.attributeName === 'data-chat-motion') hostMotion.add(record.target);
        else if (record.attributeName === 'hidden' && record.target instanceof HTMLElement && !folds.has(record.target)) {
          folds.set(record.target, record.oldValue !== null);
        }
      }
      for (const record of records) {
        if (record.type !== 'childList' || record.target !== current.scope) continue;
        if (open) {
          for (const node of record.addedNodes) if (node instanceof HTMLElement) expandContent(current, node);
        } else {
          for (const node of record.removedNodes) if (node instanceof HTMLElement) collapseContent(current, node, record.nextSibling);
        }
      }
      for (const [element, wasHidden] of folds) {
        const before = current.boxes.get(element);
        if (before !== undefined && !hostMotion.has(element)) foldHidden(current, element, before, wasHidden);
      }
    },
  };
}
