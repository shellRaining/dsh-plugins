import { MAX_ITEMS, type Annotation } from './model.ts';

export interface MarkerRange { item: Annotation; range: Range; root: HTMLElement; number: number }
const WIDTH = 26;
const HEIGHT = 24;
interface Marker { entry: MarkerRange; button: HTMLButtonElement }
interface Group {
  node: HTMLDivElement;
  markers: Marker[];
  visible: boolean;
  position: { value: string; priority: string } | null;
}

export class Markers {
  private groups = new Map<HTMLElement, Group>();
  private frame = 0;
  private disposed = false;
  private resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.schedule());
  private intersection = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
    for (const entry of entries) {
      const group = this.groups.get(entry.target as HTMLElement);
      if (!group) continue;
      group.visible = entry.isIntersecting;
      if (group.visible) this.schedule();
    }
  });
  private fonts = document.fonts;
  private schedule = (): void => {
    if (!this.disposed && this.groups.size && !this.frame) {
      this.frame = requestAnimationFrame(() => { this.frame = 0; this.position(); });
    }
  };

  constructor(private open: (item: Annotation) => void) {
    this.fonts?.addEventListener('loadingdone', this.schedule);
  }

  update(entries: readonly MarkerRange[]): void {
    if (this.disposed) return;
    const scrollable = new Map<HTMLElement, boolean>();
    const positionRoot = (node: Node, source: HTMLElement): HTMLElement => {
      let element = node instanceof HTMLElement ? node : node.parentElement;
      for (; element && element !== source && source.contains(element); element = element.parentElement) {
        let scroll = scrollable.get(element);
        if (scroll === undefined) {
          const style = getComputedStyle(element);
          scroll = /^(auto|scroll)$/.test(style.overflowX) || /^(auto|scroll)$/.test(style.overflowY);
          scrollable.set(element, scroll);
        }
        if (scroll) return element;
      }
      return source;
    };
    const limited: MarkerRange[] = [];
    for (const entry of entries.slice(0, MAX_ITEMS)) {
      const root = positionRoot(entry.range.startContainer, entry.root);
      if (root.contains(entry.range.endContainer) && root === positionRoot(entry.range.endContainer, entry.root)) {
        limited.push({ ...entry, root });
      }
    }
    const roots = new Set(limited.map(entry => entry.root));
    this.resize?.disconnect();
    for (const [root, group] of this.groups) {
      if (!roots.has(root)) this.remove(root, group);
      else { group.node.replaceChildren(); group.markers = []; }
    }
    const layout = new Set<Element>([document.documentElement]);
    for (const entry of limited) {
      const { root, item, number } = entry;
      let group = this.groups.get(root);
      if (!group) {
        const position = getComputedStyle(root).position === 'static'
          ? { value: root.style.getPropertyValue('position'), priority: root.style.getPropertyPriority('position') } : null;
        if (position) root.style.setProperty('position', 'relative');
        const node = document.createElement('div');
        node.dataset.localAnnotationMarkers = '';
        node.style.cssText = 'all:initial;position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;z-index:1;';
        root.append(node);
        group = { node, position, markers: [], visible: true };
        this.groups.set(root, group);
        this.intersection?.observe(root);
      }
      if (group.node.parentElement !== root) root.append(group.node);
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.localAnnotationMarker = '';
      button.dataset.digits = String(number).length.toString();
      const label = document.createElement('span');
      label.textContent = String(number);
      button.append(label);
      button.setAttribute('aria-label', `编辑批注 ${number}`);
      button.title = (item.note || item.text).slice(0, 240);
      button.style.cssText = `position:absolute;box-sizing:border-box;width:${WIDTH}px;height:${HEIGHT}px;`
        + 'pointer-events:auto;visibility:hidden;user-select:none;text-align:center;';
      // Keep the host selection intact; keyboard focus and activation remain native.
      button.onpointerdown = event => { event.preventDefault(); event.stopPropagation(); };
      button.onclick = event => { event.preventDefault(); event.stopPropagation(); this.open(item); };
      group.node.append(button);
      group.markers.push({ entry, button });
      for (let element: Element | null = root; element; element = element.parentElement) layout.add(element);
      // Watch the start's content layout too, including fixed-height source roots.
      for (let element = entry.range.startContainer.parentElement; element && root.contains(element); element = element.parentElement) {
        layout.add(element);
        if (element === root) break;
      }
    }
    if (this.groups.size) for (const element of layout) this.resize?.observe(element);
    if (!this.groups.size && this.frame) { cancelAnimationFrame(this.frame); this.frame = 0; }
    this.schedule();
  }

  private position(): void {
    const writes: Array<{ button: HTMLButtonElement; x?: number; y?: number }> = [];
    for (const [root, group] of this.groups) {
      if (!group.visible || !root.isConnected) continue;
      const box = root.getBoundingClientRect();
      const sx = root.offsetWidth ? box.width / root.offsetWidth : 0;
      const sy = root.offsetHeight ? box.height / root.offsetHeight : 0;
      const left = root.scrollLeft - root.clientLeft;
      const top = root.scrollTop - root.clientTop;
      const maxX = Math.max(0, root.scrollWidth - WIDTH);
      const maxY = Math.max(0, root.scrollHeight - HEIGHT);
      const overlaps = new Map<string, number>();
      for (const { entry, button } of group.markers) {
        const write: { button: HTMLButtonElement; x?: number; y?: number } = { button };
        writes.push(write);
        if (!sx || !sy || !root.contains(entry.range.startContainer) || !root.contains(entry.range.endContainer)) continue;
        const caret = entry.range.cloneRange();
        caret.collapse(true);
        const rect = caret.getClientRects()[0] ?? caret.getBoundingClientRect();
        if (!rect.height) continue;
        const x = (rect.left - box.left) / sx + left;
        const y = Math.max(0, Math.min(maxY, (rect.top - box.top) / sy + top - HEIGHT + 2));
        const key = `${Math.round(x / WIDTH)}:${Math.round(y / HEIGHT)}`;
        const count = overlaps.get(key) ?? 0;
        overlaps.set(key, count + 1);
        write.x = Math.max(0, Math.min(maxX, x + count * WIDTH));
        write.y = y;
      }
    }
    // Read all geometry first: marker writes must not cause repeated layouts.
    for (const { button, x, y } of writes) {
      button.style.visibility = x === undefined ? 'hidden' : 'visible';
      if (x !== undefined && y !== undefined) {
        button.style.left = `${x}px`;
        button.style.top = `${y}px`;
      }
    }
  }

  private remove(root: HTMLElement, group: Group): void {
    this.intersection?.unobserve(root);
    group.node.remove();
    if (group.position && root.style.getPropertyValue('position') === 'relative'
      && root.style.getPropertyPriority('position') === '') {
      if (group.position.value) root.style.setProperty('position', group.position.value, group.position.priority);
      else root.style.removeProperty('position');
    }
    this.groups.delete(root);
  }

  dispose(): void {
    this.disposed = true;
    this.resize?.disconnect();
    this.intersection?.disconnect();
    this.fonts?.removeEventListener('loadingdone', this.schedule);
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    for (const [root, group] of this.groups) this.remove(root, group);
  }
}
