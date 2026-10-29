import { useId, useRef, useSyncExternalStore, type ComponentType } from 'react';
import { SegmentedControl } from '@deepseek-ai/dsh-client-ui-primitives';
import type { Controller } from './controller.ts';
import { LIMITS, type Amount, type Fit, type Switch } from './settings.ts';

// Settings section UI. Reads the controller snapshot; never touches the material.
export const PANEL_CSS = `
[data-acrylic-settings] { padding: 24px; max-width: 640px; margin: auto; color: var(--dsw-alias-label-primary); font: inherit; }
[data-acrylic-settings] h2 { margin: 0 0 12px; font-size: 18px; }
[data-acrylic-settings] p { color: var(--dsw-alias-label-secondary); line-height: 1.6; }
[data-acrylic-settings] .acrylic-row { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin: 20px 0; }
[data-acrylic-settings] .acrylic-row label { min-width: 100px; }
[data-acrylic-settings] input[type=range] { flex: 1; min-width: 120px; accent-color: var(--dsw-alias-brand-primary); }
[data-acrylic-settings] output { min-width: 48px; font-variant-numeric: tabular-nums; }
[data-acrylic-settings] button:not([role=tab]) { border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-md, 2px); padding: 7px 12px; color: inherit; background: var(--dsw-alias-bg-layer-2); font: inherit; cursor: pointer; }
[data-acrylic-settings] button:not([role=tab]):hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
[data-acrylic-settings] button:not([role=tab]):active:not(:disabled) { background: var(--dsw-alias-interactive-bg-active); }
[data-acrylic-settings] button:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
[data-acrylic-settings] button:disabled { opacity: .5; cursor: default; }
[data-acrylic-settings] .acrylic-preview { width: 100%; max-height: 180px; object-fit: cover; border-radius: var(--dsw-radius-lg, 0px); }
[data-acrylic-settings] [role=alert] { color: var(--dsw-alias-state-error-primary); }
[data-acrylic-settings] .acrylic-filename { overflow-wrap: anywhere; }
`;

const FIT_HINTS: Readonly<Record<Fit, string>> = { cover: '保持比例，裁去多余部分。', contain: '显示整张图片，边缘可能留空。', stretch: '铺满窗口，图片可能变形。', tile: '按原尺寸重复排列。' };
const FIT_OPTIONS: readonly { value: Fit; label: string }[] = [{ value: 'cover', label: '填满' }, { value: 'contain', label: '适应' }, { value: 'stretch', label: '拉伸' }, { value: 'tile', label: '平铺' }];

export function createSettingsPanel(controller: Controller): ComponentType {
  return function AcrylicSettings() {
    const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
    const input = useRef<HTMLInputElement>(null);
    const id = useId();
    const locked = state.loading || state.busy;
    function toggle(key: Switch, title: string, disabled = locked) {
      return (
        <div className="acrylic-row">
          <label><input
            type="checkbox" checked={state.settings[key]} disabled={disabled}
            onChange={event => void controller.commit({ [key]: event.target.checked })}
          />{` ${title}`}</label>
        </div>
      );
    }
    function slider(key: Amount, title: string, unit: string) {
      return (
        <div className="acrylic-row" key={key}>
          <label htmlFor={`${id}-${key}`}>{title}</label>
          <input
            id={`${id}-${key}`} type="range" min={0} max={LIMITS[key]} step={1}
            value={state.settings[key]} disabled={locked}
            onChange={event => controller.preview({ [key]: Number(event.target.value) })}
            onPointerUp={() => void controller.commitPreview(key)}
            onKeyUp={() => void controller.commitPreview(key)}
            onBlur={() => void controller.commitPreview(key)}
          />
          <output htmlFor={`${id}-${key}`}>{`${state.settings[key]}${unit}`}</output>
        </div>
      );
    }
    return (
      <section data-acrylic-settings="">
        <h2>Win10 Fluent 主题</h2>
        {toggle('enabled', '启用主题')}
        {toggle('fluent', 'Win10 风格')}
        {toggle('reveal', '悬停与按压光效', locked || !state.settings.fluent)}
        {state.url ? <img className="acrylic-preview" src={state.url} alt="壁纸预览" /> : null}
        <p className="acrylic-filename">{state.name || '未选择图片'}</p>
        <input
          ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden
          onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void controller.upload(file);
          }}
        />
        <div className="acrylic-row">
          <button type="button" disabled={locked} onClick={() => input.current?.click()}>{state.busy ? '正在处理…' : '选择图片'}</button>
          <button type="button" disabled={locked || !state.url} onClick={() => void controller.remove()}>移除图片</button>
          <button type="button" disabled={locked} onClick={() => void controller.reset()}>恢复默认</button>
        </div>
        <div className="acrylic-row">
          <span>填充方式</span>
          <SegmentedControl
            id={`${id}-fit`} label="填充方式" value={state.settings.fit}
            disabled={locked}
            onChange={fit => void controller.commit({ fit })}
            options={FIT_OPTIONS}
          />
        </div>
        {(Object.entries(FIT_HINTS) as [Fit, string][]).map(([fit, text]) => (
          <p key={fit} id={`${id}-fit-${fit}-panel`} role="tabpanel" aria-labelledby={`${id}-fit-${fit}`} hidden={state.settings.fit !== fit}>{text}</p>
        ))}
        {slider('blur', '模糊', 'px')}
        {slider('tint', '遮罩', '%')}
        {slider('noise', '颗粒', '%')}
        <p>支持 PNG、JPEG、WebP，最大 20 MiB。图片仅保存在本机。</p>
        {state.error ? <p role="alert">{`未能保存，请重试。${state.error}`}</p> : null}
        {state.loading ? <p role="status">正在加载…</p> : null}
      </section>
    );
  };
}
