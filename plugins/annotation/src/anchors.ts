import { MAX_TEXT, type Annotation, type Source } from './model.ts';

export const MESSAGE = '[data-chat-flow-kind="assistant-step"][data-chat-anchor-key]';
export const FILE_TEXT = '[data-document-markdown], [data-textpreview-plain], [data-code-preview] [data-code-block-content]';
const EXCLUDED = 'button,input,textarea,select,[contenteditable="true"],[hidden],[aria-hidden="true"],[data-turn-process-hidden="true"],[data-local-annotation-panel],[data-local-annotation-card],[data-local-annotation-toolbar],[data-local-annotation-markers],[data-local-annotation-status]';
const MAX_SOURCE_TEXT = 2_000_000;
const MAX_NODES = 50_000;

export interface SourceRoot { root: HTMLElement; source: Source }
interface Segment { node: Text; start: number; end: number }
interface TextIndex { text: string; segments: Segment[] }

export function sourceKey(source: Source): string {
  return source.kind === 'message' ? `message:${source.key}` : `file:${source.url}`;
}

export function sourceOf(node: Node, sessionId: string): SourceRoot | null {
  const element = node instanceof Element ? node : node.parentElement;
  if (!element || element.closest(EXCLUDED)) return null;
  const file = element.closest<HTMLElement>(FILE_TEXT);
  if (file) {
    const preview = file.closest('[data-textpreview-state="text"][data-textpreview-url]');
    const url = preview?.getAttribute('data-textpreview-url') ?? '';
    const match = /^dsh-resource:\/\/file\/session\/([^/]+)\/(.+)$/.exec(url);
    if (!match?.[1] || !match[2] || /[?#\u0000-\u001f]/.test(url)) return null;
    try {
      if (decodeURIComponent(match[1]) !== sessionId) return null;
      const path = match[2].split('/').map(decodeURIComponent).join('/');
      if (/[\u0000-\u001f\u007f]/.test(path)) return null;
      return { root: file, source: { kind: 'file', url, path } };
    } catch { return null; }
  }
  const root = element.closest<HTMLElement>(MESSAGE);
  if (!root || root.dataset.chatGroupPart === 'reasoning' || root.closest(EXCLUDED)) return null;
  if (root.closest('[data-conversation-session]')?.getAttribute('data-conversation-session') !== sessionId) return null;
  return { root, source: { kind: 'message', key: root.dataset.chatAnchorKey! } };
}

export function findRoot(source: Source, sessionId: string): HTMLElement | null {
  const selector = source.kind === 'message'
    ? `${MESSAGE}[data-chat-anchor-key="${CSS.escape(source.key)}"]`
    : `[data-textpreview-url="${CSS.escape(source.url)}"] :is(${FILE_TEXT})`;
  for (const element of document.querySelectorAll<HTMLElement>(selector)) {
    const found = sourceOf(element, sessionId);
    if (found && sourceKey(found.source) === sourceKey(source)) return found.root;
  }
  return null;
}

function indexText(root: HTMLElement): TextIndex | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: node => node.parentElement?.closest(EXCLUDED) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  const segments: Segment[] = [];
  const parts: string[] = [];
  let length = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!(node instanceof Text)) continue;
    if (segments.length >= MAX_NODES || length + node.length > MAX_SOURCE_TEXT) return null;
    segments.push({ node, start: length, end: length + node.length });
    parts.push(node.data);
    length += node.length;
  }
  return { text: parts.join(''), segments };
}

function offsetAt(index: TextIndex, node: Node, offset: number): number {
  const point = document.createRange();
  point.setStart(node, offset);
  point.collapse(true);
  for (const segment of index.segments) {
    if (segment.node === node) return segment.start + offset;
    if (point.comparePoint(segment.node, 0) >= 0) return segment.start;
  }
  return index.text.length;
}

function rangeAt(index: TextIndex, start: number, end: number): Range | null {
  const first = index.segments.find(s => s.start <= start && s.end > start);
  const last = index.segments.find(s => s.start < end && s.end >= end);
  if (!first || !last) return null;
  const range = document.createRange();
  range.setStart(first.node, start - first.start);
  range.setEnd(last.node, end - last.start);
  return range;
}

export function capture(range: Range, sessionId: string): Annotation | null {
  const startRoot = sourceOf(range.startContainer, sessionId);
  const endRoot = sourceOf(range.endContainer, sessionId);
  if (!startRoot || !endRoot || startRoot.root !== endRoot.root) return null;
  const index = indexText(startRoot.root);
  if (!index) throw new Error('这段正文过大，请在较短的消息或文件预览中批注。');
  const start = offsetAt(index, range.startContainer, range.startOffset);
  const end = offsetAt(index, range.endContainer, range.endOffset);
  if (end <= start || end - start > MAX_TEXT) throw new Error(`每条引文最多 ${MAX_TEXT} 个字符。`);
  const text = index.text.slice(start, end);
  if (!text.trim() || range.toString() !== text) return null;
  const now = Date.now();
  return {
    id: crypto.randomUUID(), sessionId, text, note: '', source: startRoot.source, start, end,
    before: index.text.slice(Math.max(0, start - 32), start), after: index.text.slice(end, end + 32),
    createdAt: now, updatedAt: now,
  };
}

// No global fuzzy search: an unmounted or ambiguous source stays unresolved.
export class Anchors {
  private indices = new WeakMap<HTMLElement, TextIndex | null>();
  invalidate(root: HTMLElement): void { this.indices.delete(root); }
  clear(): void { this.indices = new WeakMap(); }
  resolve(item: Annotation, root: HTMLElement): Range | null {
    let index = this.indices.get(root);
    if (index === undefined) { index = indexText(root); this.indices.set(root, index); }
    if (!index) return null;
    let start = item.start;
    if (start < 0 || index.text.slice(start, item.end) !== item.text) {
      let found = -1;
      let from = 0;
      while (from <= index.text.length) {
        const pos = index.text.indexOf(item.text, from);
        if (pos < 0) break;
        const before = index.text.slice(Math.max(0, pos - item.before.length), pos);
        const after = index.text.slice(pos + item.text.length, pos + item.text.length + item.after.length);
        if ((!item.before || before === item.before) && (!item.after || after === item.after)) {
          if (found >= 0) return null;
          found = pos;
        }
        from = pos + 1;
      }
      if (found < 0) return null;
      start = found;
    }
    return rangeAt(index, start, start + item.text.length);
  }
}
