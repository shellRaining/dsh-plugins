import type { ClientContext } from './host.ts';
import { AppearanceStore, type Appearance } from './appearance.ts';
import { Highlights } from './highlights.ts';
import { installSelection } from './selection.ts';
import { AnnotationStore } from './storage.ts';
import { MAX_ITEMS, MAX_NOTE, type Annotation } from './model.ts';

import { floatingCard, type CardAnchor } from './floating.ts';
export interface Snapshot {
  sessionId: string | undefined;
  items: readonly Annotation[];
  pending: Annotation | null;
  error: string;
  loading: boolean;
  highlightSupported: boolean;
  appearance: Appearance;
  card: { item: Annotation | null; editing: boolean } | null;
}

export class Controller {
  private store = new AnnotationStore();
  private highlights = new Highlights(item => this.showItem(item));
  private listeners = new Set<() => void>();
  private appearance = new AppearanceStore(appearance => this.patch({ appearance }));
  private state: Snapshot = {
    sessionId: undefined, items: [], pending: null, error: '', loading: false,
    highlightSupported: this.highlights.supported, appearance: this.appearance.getSnapshot(), card: null,
  };
  private pendingBySession = new Map<string, Annotation>();
  private generation = 0;
  private disposed = false;
  private disposers: (() => void)[] = [];
  private selection: ReturnType<typeof installSelection>;

  private floating: ReturnType<typeof floatingCard>;
  private anchor: CardAnchor = { range: null, x: 24, y: 64 };
  private drafts = new Map<string, { item: Annotation; note: string }>();

  constructor(private ctx: ClientContext, host: HTMLElement) {
    this.floating = floatingCard(host, () => this.close());
    this.selection = installSelection(() => this.state.sessionId, (item, range) => {
      this.anchor = { range, x: 24, y: 64 };
      if (this.state.loading) return;
      if (this.state.pending) { this.showItem(this.state.pending); return; }
      if (this.state.items.length >= MAX_ITEMS) { this.error(new Error(`每个会话最多 ${MAX_ITEMS} 条批注。`)); this.showError(); return; }
      if (this.pendingBySession.size >= 8 && !this.pendingBySession.has(item.sessionId)) {
        this.error(new Error('已有 8 个会话保留未保存批注，请先保存或取消其中一条。')); this.showError(); return;
      }
      this.pendingBySession.set(item.sessionId, item);
      this.patch({ pending: item, error: '', card: { item, editing: true } });
      this.paint();
      this.floating.show(this.anchor);
    }, error => { this.error(error); this.showError(); });
    const click = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey
        || !(event.target instanceof Element) || event.target.closest('a,button,input,textarea,[contenteditable="true"],[data-local-annotation-card]')) return;
      if (!window.getSelection()?.isCollapsed) return;
      const item = this.highlights.hit(event.target, event.clientX, event.clientY);
      if (!item) return;
      this.anchor = { range: this.highlights.range(item), x: event.clientX, y: event.clientY };
      this.showItem(item);
    };
    document.addEventListener('click', click);
    this.disposers.push(() => document.removeEventListener('click', click));
    const sync = () => {
      const id = this.ctx.uiSession.adapter.current.getSnapshot().key;
      if (id === this.state.sessionId) return;
      ++this.generation;
      this.selection.hide();
      this.close();
      this.patch({ sessionId: id, items: [], pending: id ? this.pendingBySession.get(id) ?? null : null, error: '', loading: !!id });
      this.paint();
      if (id) void this.refresh(id);
    };
    this.disposers.push(ctx.uiSession.adapter.current.subscribe(sync));
    this.disposers.push(this.store.subscribe(id => { if (id === this.state.sessionId) void this.refresh(id); }));
    const onFocus = () => { if (this.state.sessionId) void this.refresh(this.state.sessionId); };
    window.addEventListener('focus', onFocus);
    this.disposers.push(() => window.removeEventListener('focus', onFocus));
    sync();
  }

  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  getSnapshot = (): Snapshot => this.state;
  setAppearance<K extends keyof Appearance>(field: K, value: Appearance[K]): void { this.appearance.set(field, value); }
  private patch(patch: Partial<Snapshot>): void {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  private error(error: unknown): void { this.patch({ error: error instanceof Error ? error.message : String(error) }); }
  private paint(): void {
    this.highlights.update(this.state.sessionId ?? '', this.state.pending ? [...this.state.items, this.state.pending] : this.state.items);
  }
  private async refresh(id: string): Promise<void> {
    const generation = ++this.generation;
    try {
      const items = await this.store.list(id);
      if (this.disposed || generation !== this.generation || id !== this.state.sessionId) return;
      this.patch({ items, loading: false });
      this.paint();
    } catch (error) {
      if (!this.disposed && generation === this.generation && id === this.state.sessionId) {
        this.patch({ loading: false });
        this.error(error);
      }
    }
  }

  close(): void {
    // Empty unsaved selections can be discarded; typed drafts remain recoverable via their marker.
    const pending = this.state.pending;
    if (pending && !this.draft(pending).trim()) {
      this.pendingBySession.delete(pending.sessionId);
      this.drafts.delete(this.draftKey(pending));
      this.patch({ pending: null });
      this.paint();
    }
    this.floating.hide(); this.patch({ card: null });
  }
  private showError(): void {
    if (!this.state.sessionId) return;
    this.patch({ card: { item: null, editing: false } });
    if (!this.anchor.range?.endContainer.isConnected) this.anchor = { range: null, x: Math.min(window.innerWidth / 2, 480), y: 80 };
    this.floating.show(this.anchor);
  }
  showItem(item: Annotation): void {
    if (item.sessionId !== this.state.sessionId) return;
    const base = this.drafts.get(this.draftKey(item))?.item ?? item;
    this.patch({ card: { item: base, editing: true }, error: '' });
    this.anchor = { ...this.anchor, range: this.highlights.range(item) };
    this.floating.show(this.anchor);
  }
  private draftKey(item: Annotation): string { return JSON.stringify([item.sessionId, item.id]); }
  draft(item: Annotation): string { return this.drafts.get(this.draftKey(item))?.note ?? item.note; }
  setDraft(item: Annotation, note: string): void {
    const key = this.draftKey(item);
    // A bounded in-memory draft cache survives closing or scrolling away from a card.
    if (!this.drafts.has(key) && this.drafts.size >= 32) this.drafts.delete(this.drafts.keys().next().value!);
    this.drafts.set(key, { item, note: note.slice(0, MAX_NOTE) });
  }

  async save(item: Annotation, note: string): Promise<void> {
    if (item.sessionId !== this.state.sessionId || this.disposed) return;
    const id = item.sessionId;
    try {
      if (note.length > MAX_NOTE) throw new Error(`批注最多 ${MAX_NOTE} 个字符。`);
      const pending = this.state.pending?.id === item.id;
      const saved = await this.store.put({ ...item, note }, pending ? undefined : item.updatedAt);
      this.drafts.delete(this.draftKey(item));
      if (this.pendingBySession.get(id)?.id === item.id) this.pendingBySession.delete(id);
      if (this.disposed || id !== this.state.sessionId) return;
      if (this.state.pending?.id === item.id) this.patch({ pending: null });
      const items = this.state.items.filter(value => value.id !== saved.id);
      items.push(saved);
      items.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
      this.patch({ items, error: '' });
      if (this.state.card?.item?.id === item.id) this.close();
      this.paint();
      await this.refresh(id);
    } catch (error) { if (id === this.state.sessionId) this.error(error); throw error; }
  }

  cancelPending(): void {
    if (this.state.sessionId) this.pendingBySession.delete(this.state.sessionId);
    if (this.state.pending) this.drafts.delete(this.draftKey(this.state.pending));
    this.close();
    this.patch({ pending: null, error: '' }); this.paint();
  }
  async remove(item: Annotation): Promise<void> {
    if (item.sessionId !== this.state.sessionId || this.disposed) return;
    try {
      await this.store.remove(item.sessionId, item.id, item.updatedAt);
      this.drafts.delete(this.draftKey(item));
      if (this.state.card?.item?.id === item.id) this.close();
      if (item.sessionId === this.state.sessionId) { this.patch({ error: '' }); await this.refresh(item.sessionId); }
    } catch (error) { if (item.sessionId === this.state.sessionId) this.error(error); throw error; }
  }

  insert(items: readonly Annotation[]): boolean {
    try {
      const binding = this.ctx.uiSession.adapter.current.getSnapshot();
      if (!items.length || !binding.key || binding.key !== this.state.sessionId || items.some(item => item.sessionId !== binding.key)) return false;
      const actions = binding.props.inputActions;
      if (!actions) throw new Error('输入框尚未就绪，请稍后重试。');
      const span = actions.captureInsertion();
      // An explicit insertion uses the host's selection/revision and keeps chips and Undo.
      const text = '\n\n' + items.map((item, index) => {
        const source = item.source.kind === 'file' ? `文件：${item.source.path}\n` : '';
        return `批注 ${index + 1}\n${source}${item.text.split('\n').map(line => `> ${line}`).join('\n')}`
          + (item.note.trim() ? `\n批注：${item.note}` : '');
      }).join('\n\n') + '\n\n';
      if (text.length > 256_000) throw new Error('引用总量过大，请分批插入。');
      if (this.ctx.uiSession.adapter.current.getSnapshot().key !== binding.key || !actions.insertText(text, span)) {
        throw new Error('输入框正在更新，未插入批注；请稍后重试。');
      }
      this.patch({ error: '' });
      return true;
    } catch (error) { this.error(error); return false; }
  }

  dispose(): void {
    this.disposed = true;
    ++this.generation;
    this.selection.dispose();
    this.floating.dispose();
    this.drafts.clear();
    for (const dispose of this.disposers) dispose();
    this.highlights.dispose();
    this.appearance.dispose();
    this.store.dispose();
    this.pendingBySession.clear();
    this.listeners.clear();
  }
}
