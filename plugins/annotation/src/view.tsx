import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type CSSProperties } from 'react';
import type { Controller } from './controller.ts';
import { MAX_NOTE, type Annotation } from './model.ts';
import { COLORS, ICONS, STROKES, ink, type Appearance } from './appearance.ts';

function Trash() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></svg>;
}
function Close() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>;
}
function brief(text: string, length: number): string { return text.length > length ? text.slice(0, length) + '…' : text; }

export function Card({ controller }: { controller: Controller }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  if (!state.card) return null;
  if (!state.card.item) return state.error ? <div data-local-annotation-panel="" role="alert">{state.error}<button type="button" className="dla-icon" aria-label="关闭" onClick={() => controller.close()}><Close /></button></div> : null;
  return <Editor key={JSON.stringify([state.sessionId, state.card.item.id])} controller={controller} item={state.card.item} />;
}

function Editor({ controller, item }: { controller: Controller; item: Annotation }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [base] = useState(item);
  const [note, setNote] = useState(() => controller.draft(item));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const textarea = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const inFlight = useRef(false);
  const newItem = state.pending?.id === item.id;
  const quote = (item.source.kind === 'file' ? `${item.source.path}\n` : '') + item.text;
  useEffect(() => {
    textarea.current?.focus({ preventScroll: true });
    textarea.current?.setSelectionRange(note.length, note.length);
  }, []);
  async function run(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '操作失败，请重试。'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (composing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault(); event.stopPropagation(); void run(() => controller.save(base, note));
    } else if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); controller.close();
    }
  }
  return <section data-local-annotation-panel="" role="dialog" aria-label={newItem ? '添加批注' : '编辑批注'} aria-modal={false}>
    <header className="dla-head"><span>{newItem ? '添加批注' : '编辑批注'}</span>
      {!newItem ? <button type="button" className="dla-icon dla-danger" title="删除批注" aria-label="删除批注" disabled={busy} onClick={() => { void run(() => controller.remove(base)); }}><Trash /></button> : null}
      <button type="button" className="dla-icon dla-close" title="关闭" aria-label="关闭批注" onClick={() => controller.close()}><Close /></button>
    </header>
    <blockquote className="dla-quote" title={quote}>{brief(quote, 200)}</blockquote>
    <textarea ref={textarea} aria-label="批注内容" placeholder="写下批注（可留空，仅标记原文）" value={note} maxLength={MAX_NOTE} rows={3} disabled={busy} spellCheck={false}
      onChange={event => { setNote(event.target.value); controller.setDraft(base, event.target.value); }} onKeyDown={keyDown}
      onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} />
    <footer className="dla-footer">
      <AppearancePicker controller={controller} disabled={busy} />
      <div className="dla-save"><button type="button" disabled={busy || state.loading} onClick={() => { void run(() => controller.save(base, note)); }}>✓ {busy ? '保存中…' : '保存'}</button></div>
    </footer>
    {error || state.error ? <p className="dla-error" role="alert">{error || state.error}</p> : null}
  </section>;
}

function AppearancePicker({ controller, disabled }: { controller: Controller; disabled: boolean }) {
  const { appearance } = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [error, setError] = useState('');
  function change<K extends keyof Appearance>(field: K, value: Appearance[K]) {
    try { controller.setAppearance(field, value); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '外观设置未保存。'); }
  }
  return <details className="dla-appearance" style={{ '--dla-ink': ink(appearance.color) } as CSSProperties}>
    <summary>批注外观</summary>
    <fieldset disabled={disabled}><legend>划线</legend><div className="dla-options">
      {STROKES.map(option => <button key={option.id} type="button" aria-pressed={appearance.stroke === option.id} onClick={() => change('stroke', option.id)}><span className="dla-stroke-sample" data-stroke={option.id}>{option.label}</span></button>)}
    </div></fieldset>
    <fieldset disabled={disabled}><legend>颜色</legend><div className="dla-options">
      {COLORS.map(option => <button key={option.value} type="button" className="dla-swatch" title={option.label} aria-label={option.label} aria-pressed={appearance.color.toLowerCase() === option.value} style={{ '--dla-swatch': ink(option.value) } as CSSProperties} onClick={() => change('color', option.value)} />)}
      <label className="dla-custom-color" title="自定义荧光色"><input type="color" aria-label="自定义荧光色" value={appearance.color === 'theme' ? COLORS[1].value : appearance.color} onChange={event => change('color', event.target.value)} />自选</label>
    </div></fieldset>
    <fieldset disabled={disabled}><legend>旁注图标</legend><div className="dla-options">
      {ICONS.map(option => <button key={option.id} type="button" title={option.label} aria-label={option.label} aria-pressed={appearance.icon === option.id} onClick={() => change('icon', option.id)}>
        <span aria-hidden="true" className="dla-marker-sample" style={{ '--dla-marker-mask': `var(--dla-mask-${option.id})`, '--dla-marker-outline': `var(--dla-outline-${option.id})`, '--dla-marker-radius': option.id === 'number' ? 'var(--dsw-radius-sm)' : '0' } as CSSProperties}><span>1</span></span>
      </button>)}
    </div></fieldset>
    <p className="dla-appearance-hint">立即生效，应用于所有批注</p>
    {error ? <p className="dla-error" role="alert">{error}</p> : null}
  </details>;
}

// Only present when the current composer has annotations; not a permanent entry button.
export function ComposerStatus({ controller, sessionId }: { controller: Controller; sessionId: string }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setOpen(false); setError(''); }, [sessionId, state.sessionId]);
  if (sessionId !== state.sessionId || !state.items.length) return null;
  return <div data-local-annotation-status="" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
    onFocus={() => setOpen(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
    onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); } }}>
    <button type="button" className="dla-chip" aria-expanded={open} onClick={() => setOpen(value => !value)}>批注 ×{state.items.length}</button>
    {open ? <div className="dla-preview" role="region" aria-label="已保存批注">
      {state.items.map((item, index) => <div className="dla-preview-item" key={item.id}>
        <button type="button" className="dla-summary" onClick={() => { setOpen(false); controller.showItem(item); }}><span className="dla-number" data-digits={String(index + 1).length}><span>{index + 1}</span></span>{brief(item.text, 100)}{item.note ? <span className="dla-preview-note">{brief(item.note, 60)}</span> : null}</button>
        <button type="button" className="dla-icon dla-danger" aria-label={`删除批注 ${index + 1}`} onClick={() => { void controller.remove(item).catch(cause => setError(String(cause))); }}><Trash /></button>
      </div>)}
      <button type="button" className="dla-attach" onClick={() => { if (controller.insert(state.items)) setOpen(false); }}>附加到输入框</button>
      {error || state.error ? <p className="dla-error" role="alert">{error || state.error}</p> : null}
    </div> : null}
  </div>;
}
