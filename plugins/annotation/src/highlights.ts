import { Anchors, findRoot, FILE_TEXT, MESSAGE, sourceKey, sourceOf } from './anchors.ts';
import { Markers, type MarkerRange } from './markers.ts';
import type { Annotation, Source } from './model.ts';

const NAME = 'dsh-local-annotation';
interface HighlightSet { add(range: Range): void; delete(range: Range): void; clear(): void }
interface HighlightAPI { highlights: Map<string, HighlightSet> }
const api = CSS as typeof CSS & Partial<HighlightAPI>;
const HighlightClass = (globalThis as unknown as { Highlight?: new () => HighlightSet }).Highlight;
interface Group { source: Source; items: Annotation[]; root: HTMLElement | null; ranges: Map<string, Range> }

export class Highlights {
  readonly supported = !!api.highlights && !!HighlightClass;
  private highlight = HighlightClass ? new HighlightClass() : null;
  private groups = new Map<string, Group>();
  private anchors = new Anchors();
  private dirty = new Set<Group>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private sessionId = '';
  private markers: Markers;
  private numbers = new Map<string, number>();
  private observer = new MutationObserver(records => {
    let addedSource = false;
    for (const record of records) {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      if (target?.closest('[data-local-annotation-markers],[data-local-annotation-status]')) continue;
      const changed = [...record.addedNodes, ...record.removedNodes];
      if (record.type === 'childList' && changed.length && changed.every(node => node instanceof Element && node.matches('[data-local-annotation-markers]'))) continue;
      for (const group of this.groups.values()) {
        if (group.root && (!group.root.isConnected || group.root.contains(record.target)
          || (record.type === 'attributes' && record.target instanceof Element && record.target.contains(group.root)))) this.dirty.add(group);
      }
      if (record.type === 'attributes') addedSource = true;
      if (!addedSource) for (const node of record.addedNodes) {
        if (node instanceof Element && (node.matches(`${MESSAGE},[data-textpreview-url],${FILE_TEXT}`) || node.querySelector(`${MESSAGE},[data-textpreview-url],${FILE_TEXT}`))) {
          addedSource = true;
          break;
        }
      }
    }
    if (addedSource) for (const group of this.groups.values()) if (!group.root?.isConnected) this.dirty.add(group);
    // Mutations are batched, never scroll events. Streaming cannot starve this timer.
    if (this.dirty.size && this.timer === undefined) this.timer = setTimeout(() => this.flush(), 100);
  });

  constructor(open: (item: Annotation) => void) {
    this.markers = new Markers(open);
    if (this.highlight) api.highlights?.set(NAME, this.highlight);
  }

  update(sessionId: string, items: readonly Annotation[]): void {
    this.reset();
    this.sessionId = sessionId;
    items.forEach((item, index) => this.numbers.set(item.id, index + 1));
    for (const item of items) {
      const key = sourceKey(item.source);
      let group = this.groups.get(key);
      if (!group) {
        group = { source: item.source, items: [], root: null, ranges: new Map() };
        this.groups.set(key, group);
      }
      group.items.push(item);
      this.dirty.add(group);
    }
    this.flush();
    if (this.groups.size) this.observer.observe(document.getElementById('root') ?? document.body, {
      subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ['hidden', 'aria-hidden', 'data-turn-process-hidden', 'data-textpreview-state', 'data-textpreview-url'],
    });
  }

  private flush(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    for (const group of this.dirty) {
      for (const range of group.ranges.values()) this.highlight?.delete(range);
      group.ranges.clear();
      if (group.root) this.anchors.invalidate(group.root);
      group.root = findRoot(group.source, this.sessionId);
      if (!group.root) continue;
      for (const item of group.items) {
        const range = this.anchors.resolve(item, group.root);
        if (range) { group.ranges.set(item.id, range); this.highlight?.add(range); }
      }
    }
    this.dirty.clear();
    const entries: MarkerRange[] = [];
    for (const group of this.groups.values()) {
      if (!group.root) continue;
      for (const item of group.items) {
        const range = group.ranges.get(item.id);
        if (range) entries.push({ item, range, root: group.root, number: this.numbers.get(item.id) ?? 1 });
      }
    }
    this.markers.update(entries);
  }

  range(item: Annotation): Range | null {
    const root = findRoot(item.source, item.sessionId);
    if (!root) return null;
    this.anchors.invalidate(root);
    return this.anchors.resolve(item, root);
  }

  // Hit testing only on a click inside one source, never on pointermove/scroll.
  hit(target: Node, x: number, y: number): Annotation | null {
    const source = sourceOf(target, this.sessionId);
    if (!source) return null;
    const group = this.groups.get(sourceKey(source.source));
    if (!group) return null;
    if (this.dirty.has(group)) this.flush();
    for (const item of group.items) {
      const range = group.ranges.get(item.id);
      if (!range?.startContainer.isConnected) continue;
      for (const rect of range.getClientRects()) {
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return item;
      }
    }
    return null;
  }

  locate(item: Annotation): boolean {
    const root = findRoot(item.source, item.sessionId);
    if (!root) return false;
    this.anchors.invalidate(root);
    const range = this.anchors.resolve(item, root);
    if (!range) return false;
    // Only an explicit “locate” measures geometry; ordinary scrolling does no work.
    const element = range.startContainer.parentElement;
    element?.scrollIntoView({ block: 'center', behavior: 'instant' });
    if (!this.supported) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    return true;
  }

  private reset(): void {
    this.observer.disconnect();
    clearTimeout(this.timer);
    this.timer = undefined;
    this.markers.update([]);
    this.numbers.clear();
    this.groups.clear();
    this.dirty.clear();
    this.anchors.clear();
    this.highlight?.clear();
  }

  dispose(): void {
    this.reset();
    this.markers.dispose();
    if (api.highlights?.get(NAME) === this.highlight) api.highlights.delete(NAME);
  }
}
