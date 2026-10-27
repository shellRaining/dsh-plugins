import type { Binding, ClientContext, InputState, Observable, ReferenceSource, SessionScope } from './host.ts';
import { AppearanceStore, type Appearance } from './appearance.ts';
import { Highlights } from './highlights.ts';
import { installSelection } from './selection.ts';
import { AnnotationStore } from './storage.ts';
import { MAX_ITEMS, MAX_NOTE, type Annotation } from './model.ts';
import { CHIP_SOURCE, annotationBlock, annotationChip, attachedIds, chipSpan, chipText, parseChipRef } from './composer.ts';

import { floatingCard, type CardAnchor } from './floating.ts';
export interface Snapshot {
  sessionId: string | undefined;
  items: readonly Annotation[];
  /** Annotation ids whose chips the current composer carries, in draft order. */
  attached: readonly string[];
  pending: Annotation | null;
  error: string;
  loading: boolean;
  highlightSupported: boolean;
  appearance: Appearance;
  card: { item: Annotation | null; editing: boolean } | null;
}
interface Composer { binding: Binding; scope: SessionScope; input: InputState }
const SENT_CACHE = 64;

export class Controller {
  private store = new AnnotationStore();
  private highlights = new Highlights(item => this.showItem(item));
  private listeners = new Set<() => void>();
  private appearance = new AppearanceStore(appearance => this.patch({ appearance }));
  private state: Snapshot = {
    sessionId: undefined, items: [], attached: [], pending: null, error: '', loading: false,
    highlightSupported: this.highlights.supported, appearance: this.appearance.getSnapshot(), card: null,
  };
  private pendingBySession = new Map<string, Annotation>();
  private generation = 0;
  private disposed = false;
  private disposers: (() => void)[] = [];
  private selection: ReturnType<typeof installSelection>;
  private input: Observable<InputState | undefined> | undefined;
  private disposeInput: (() => void) | undefined;
  /** Model text of chips already sent; a failed send restores chips whose rows are gone. */
  private sent = new Map<string, string>();

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
      const binding = this.ctx.uiSession.adapter.current.getSnapshot();
      const id = binding.key;
      if (id !== this.state.sessionId) {
        ++this.generation;
        this.selection.hide();
        this.close();
        this.patch({ sessionId: id, items: [], pending: id ? this.pendingBySession.get(id) ?? null : null, error: '', loading: !!id });
        this.paint();
        if (id) void this.refresh(id);
      }
      this.watchInput(binding);
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
  /** Follow the current Session's composer; the status chip reads only this state. */
  private watchInput(binding: Binding): void {
    const source = binding.key ? binding.hooks.input : undefined;
    if (source !== this.input) {
      this.disposeInput?.();
      this.input = source;
      this.disposeInput = source?.subscribe(() => this.readInput());
    }
    this.readInput();
  }
  private readInput(): void {
    const attached = attachedIds(this.input?.getSnapshot(), this.state.sessionId);
    const previous = this.state.attached;
    if (attached.length !== previous.length || attached.some((id, index) => id !== previous[index])) this.patch({ attached });
  }
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
      // A new annotation rides the next message; saving is committed even if the composer refuses.
      if (pending && !this.attach(saved) && this.state.error) this.showError();
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
      if (item.sessionId === this.state.sessionId) {
        this.patch({ error: '' });
        if (!this.detach(item)) this.error(new Error(`批注 ${item.number} 已删除，但输入框里的引用未能移除，请手动删除。`));
        await this.refresh(item.sessionId);
      }
    } catch (error) { if (item.sessionId === this.state.sessionId) this.error(error); throw error; }
  }

  /** Chips are serialized by this source when the composer submits. */
  readonly source: ReferenceSource = {
    trigger: '@', name: CHIP_SOURCE, showGroupTitle: false,
    candidates: () => Promise.resolve([]),
    onPick: () => undefined,
    openReference: (session, { ref }) => {
      const key = parseChipRef(ref);
      const item = key?.sessionId === session.sessionId ? this.state.items.find(value => value.id === key.id) : undefined;
      if (!item) return false;
      this.showItem(item);
      return true;
    },
    codec: {
      clipboardText: ref => { const key = parseChipRef(ref); return key ? chipText(key.number) : ref; },
      serialize: ref => this.serialize(ref),
    },
  };

  /** Resolve one chip at submit time, then clear the sent annotation. */
  private async serialize(ref: string): Promise<string> {
    const key = parseChipRef(ref);
    if (!key) throw new Error('批注引用无效，请从输入框删除后重试。');
    const item = (await this.store.list(key.sessionId)).find(value => value.id === key.id);
    if (!item) {
      const sent = this.sent.get(ref);
      if (sent !== undefined) return sent;
      throw new Error('有一条批注已被删除，请从输入框删除它的引用后再发送。');
    }
    const block = annotationBlock(item);
    if (!this.sent.has(ref) && this.sent.size >= SENT_CACHE) this.sent.delete(this.sent.keys().next().value!);
    this.sent.set(ref, block);
    // The cache keeps a restored chip sendable after the row is gone.
    void this.store.remove(item.sessionId, item.id).then(() => {
      this.drafts.delete(this.draftKey(item));
      if (this.state.card?.item?.id === item.id) this.close();
    }, (error: unknown) => console.error('清理已发送批注失败', error));
    return block;
  }

  private composer(sessionId: string): Composer | undefined {
    const binding = this.ctx.uiSession.adapter.current.getSnapshot();
    if (!binding.key || binding.key !== sessionId || binding.key !== this.state.sessionId) return undefined;
    const input = binding.hooks.input?.getSnapshot();
    if (!binding.ctx || !input) throw new Error('输入框尚未就绪，请稍后重试。');
    return { binding, scope: binding.ctx, input };
  }

  /** Put this annotation's chip after the composer caret; returns whether the draft carries it. */
  attach(item: Annotation): boolean {
    try {
      const composer = this.composer(item.sessionId);
      if (!composer) return false;
      const { binding, scope, input } = composer;
      if (attachedIds(input, binding.key).includes(item.id)) return true;
      const actions = binding.props.inputActions;
      if (!actions || item.number < 1) throw new Error('输入框尚未就绪，请稍后重试。');
      if (input.phase !== 'plain' || input.claim !== undefined) throw new Error('输入框正在提交或处于命令模式，批注已保存但未附加。');
      // Insert without replacing a selection; the revision CAS rejects stale spans.
      const { end, draftRev } = actions.captureInsertion();
      const applied = scope.bail(scope, 'slash/input-insert-reference', {
        reference: annotationChip(item), span: { start: end, end, draftRev },
      });
      if (applied !== true) throw new Error('输入框正在更新，批注已保存但未附加；请稍后重试。');
      return true;
    } catch (error) { this.error(error); return false; }
  }

  /** Remove this annotation's chips from the composer; returns whether none remain. */
  detach(item: Annotation): boolean {
    try {
      const composer = this.composer(item.sessionId);
      if (!composer) return true;
      const { binding, scope } = composer;
      let input: InputState | undefined = composer.input;
      for (let guard = 0; input && guard < MAX_ITEMS; guard++) {
        const chip = input.occurrences.find(occurrence => occurrence.source === CHIP_SOURCE
          && parseChipRef(occurrence.ref)?.id === item.id);
        if (!chip) return true;
        if (input.phase !== 'plain' || input.claim !== undefined) throw new Error('输入框正在提交或处于命令模式，暂时无法移除批注引用。');
        const span = chipSpan(input, chip);
        if (scope.bail(scope, 'slash/input-insert-text', { text: '', span: { ...span, draftRev: input.draftRev } }) !== true) {
          throw new Error('输入框正在更新，未能移除批注引用；请稍后重试。');
        }
        const next = binding.hooks.input?.getSnapshot();
        if (next?.draftRev === input.draftRev) return true;
        input = next;
      }
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
    this.disposeInput?.();
    this.input = undefined;
    this.sent.clear();
    this.highlights.dispose();
    this.appearance.dispose();
    this.store.dispose();
    this.pendingBySession.clear();
    this.listeners.clear();
  }
}
