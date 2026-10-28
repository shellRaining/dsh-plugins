// Adapter for the Plugins page's "Installed plugins" group, which offers no
// slot for per-card actions. Only semantic attributes are read, never hashed
// class names:
// - section[data-plugin-group="bundles"] is the group, and its first child
//   the heading row (an h3 that grows to fill the row);
// - li[data-plugin-package] is one card;
// - the card's [role="switch"] sits in its trailing area, which stays
//   clickable above the overlay that opens the card's page.
// Each anchor gets one mount node of ours; React portals render into it.
// When the page changes shape the anchors just stop matching.
const GROUP = 'section[data-plugin-group="bundles"]';
const MOUNT = 'data-plugin-updates-mount';

export interface Anchors {
  readonly head?: HTMLElement;
  readonly cards: ReadonlyMap<string, HTMLElement>;
}

export const NO_ANCHORS: Anchors = { cards: new Map() };

function mountIn(parent: Element, key: string, first: boolean): HTMLElement {
  for (const child of parent.children) {
    if (child instanceof HTMLElement && child.getAttribute(MOUNT) === key) return child;
  }
  const node = parent.ownerDocument.createElement('span');
  node.setAttribute(MOUNT, key);
  node.style.display = 'contents';
  if (first) parent.prepend(node);
  else parent.append(node);
  return node;
}

function scan(document: Document): Anchors {
  const group = document.querySelector(GROUP);
  if (group === null) return NO_ANCHORS;
  const row = group.firstElementChild;
  const head = row?.querySelector(':scope > h3') ? mountIn(row, 'head', false) : undefined;
  const cards = new Map<string, HTMLElement>();
  for (const card of group.querySelectorAll('li[data-plugin-package]')) {
    const name = card.getAttribute('data-plugin-package');
    const end = card.querySelector('[role="switch"]')?.parentElement;
    if (name && end) cards.set(name, mountIn(end, 'card', true));
  }
  return { ...head === undefined ? {} : { head }, cards };
}

function same(a: Anchors, b: Anchors): boolean {
  if (a.head !== b.head || a.cards.size !== b.cards.size) return false;
  for (const [name, node] of a.cards) if (b.cards.get(name) !== node) return false;
  return true;
}

/** Report the anchors now and whenever the page re-renders them; the disposer removes every mount node. */
export function watchAnchors(document: Document, onChange: (anchors: Anchors) => void): () => void {
  const view = document.defaultView;
  if (view === null) return () => {};
  let current = NO_ANCHORS;
  let frame = 0;
  const run = (): void => {
    frame = 0;
    const next = scan(document);
    if (same(current, next)) return;
    current = next;
    onChange(next);
  };
  const observer = new view.MutationObserver(() => {
    if (frame === 0) frame = view.requestAnimationFrame(run);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  run();
  return () => {
    observer.disconnect();
    if (frame !== 0) view.cancelAnimationFrame(frame);
    for (const node of document.querySelectorAll(`[${MOUNT}]`)) node.remove();
  };
}
