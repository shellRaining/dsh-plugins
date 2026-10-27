export const STROKES = [
  { id: 'marker', label: '荧光笔' },
  { id: 'underline', label: '实线' },
  { id: 'dashed', label: '虚线' },
  { id: 'dotted', label: '点线' },
  { id: 'wavy', label: '波浪线' },
] as const;
export const ICONS = [
  { id: 'message', label: '气泡' },
  { id: 'bookmark', label: '书签' },
  { id: 'note', label: '便签' },
  { id: 'number', label: '纯编号' },
] as const;
export const COLORS = [
  { value: 'theme', label: '主题色' },
  { value: '#fbf719', label: '柠檬黄' },
  { value: '#77dba9', label: '薄荷绿' },
  { value: '#f5a6c8', label: '樱花粉' },
  { value: '#b9a3f5', label: '薰衣紫' },
  { value: '#80c8f5', label: '晴空蓝' },
] as const;
export interface Appearance {
  stroke: typeof STROKES[number]['id'];
  color: string;
  icon: typeof ICONS[number]['id'];
}
export const DEFAULT_APPEARANCE: Readonly<Appearance> = { stroke: 'marker', color: '#fbf719', icon: 'message' };
const PREFIX = 'dsh-local-annotation.appearance.v1.';
const FIELDS = ['stroke', 'color', 'icon'] as const;
type Field = typeof FIELDS[number];

function valid(field: Field, value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (field === 'color') return value === 'theme' || /^#[\da-f]{6}$/i.test(value);
  return (field === 'stroke' ? STROKES : ICONS).some(option => option.id === value);
}
export function ink(color: string): string {
  return color === 'theme' ? 'var(--dsw-alias-brand-primary)' : /^#[\da-f]{6}$/i.test(color) ? color : DEFAULT_APPEARANCE.color;
}
export function highlightCSS(stroke: Appearance['stroke'], color: string): string {
  const tint = ink(color);
  if (stroke === 'marker') return `background-color:color-mix(in srgb, ${tint} 32%, transparent);text-decoration:none;`;
  const line = stroke === 'underline' ? 'solid' : stroke;
  return `background-color:transparent;text-decoration:underline ${line} ${tint};text-decoration-thickness:2px;text-underline-offset:.2em;`;
}

// Only these small display preferences use localStorage; annotation records remain in IndexedDB.
// Separate keys prevent simultaneous edits to different preferences from overwriting each other.
export class AppearanceStore {
  private state: Appearance = { ...DEFAULT_APPEARANCE };
  private style = document.createElement('style');
  private sync = (event: StorageEvent): void => {
    if (event.key !== null && !FIELDS.some(field => event.key === PREFIX + field)) return;
    try { if (event.storageArea !== window.localStorage) return; } catch { return; }
    this.read(); this.render(); this.changed(this.state);
  };

  constructor(private changed: (value: Appearance) => void) {
    this.read();
    this.style.dataset.localAnnotationAppearance = '';
    this.render(); document.head.append(this.style);
    window.addEventListener('storage', this.sync);
  }
  getSnapshot(): Appearance { return this.state; }
  private read(): void {
    const next = { ...DEFAULT_APPEARANCE };
    try {
      for (const field of FIELDS) {
        const value = window.localStorage.getItem(PREFIX + field);
        if (valid(field, value)) Object.assign(next, { [field]: value });
      }
    } catch { /* Restricted storage must not prevent the plugin from starting. */ }
    this.state = next;
  }
  set<K extends Field>(field: K, value: Appearance[K]): void {
    if (!valid(field, value)) throw new Error('无效的批注外观设置。');
    try { window.localStorage.setItem(PREFIX + field, value); }
    catch { throw new Error('无法保存外观设置，请检查浏览器存储权限或可用空间。'); }
    // Read the latest peer values rather than writing a stale whole-settings snapshot.
    this.read(); this.render(); this.changed(this.state);
  }
  private render(): void {
    const { stroke, color, icon } = this.state;
    this.style.textContent = `
      ::highlight(dsh-local-annotation) { ${highlightCSS(stroke, color)} }
      [data-local-annotation-marker], [data-local-annotation-status] .dla-number {
        --dla-ink:${ink(color)}; --dla-marker-mask:var(--dla-mask-${icon});
        --dla-marker-outline:var(--dla-outline-${icon});
        --dla-marker-radius:${icon === 'number' ? 'var(--dsw-radius-sm)' : '0'};
      }
    `;
  }
  dispose(): void { window.removeEventListener('storage', this.sync); this.style.remove(); }
}
