import { desiredWidth, type FrameGeometry } from './host';

export const presets = [
  { label: '1:2', ratio: 2 / 3 },
  { label: '1:1', ratio: 0.5 },
  { label: '2:1', ratio: 1 / 3 },
] as const;

export function reachablePresets(geometry: FrameGeometry) {
  return presets.filter(({ ratio }) => {
    const width = desiredWidth(geometry, ratio);
    return width !== null && Math.abs(width - geometry.available * ratio) < 1;
  });
}

export function createGuides() {
  const root = document.createElement('div');
  root.dataset.layoutGuides = '';
  root.hidden = true;
  root.setAttribute('aria-hidden', 'true');
  const style = document.createElement('style');
  style.dataset.plugin = 'layout-presets';
  style.textContent = `
    [data-layout-presets-dragging] { cursor:col-resize; user-select:none; transition:none !important; }
    [data-layout-presets-dragging] > [data-side="rightbar"] { cursor:col-resize; }
    [data-layout-guides] { position:fixed; inset:0; z-index:100; pointer-events:none;
      font:var(--dsw-font-xxs-12, 12px/1.5 sans-serif); color:var(--dsw-alias-label-secondary); }
    [data-layout-guides][hidden], [data-layout-guides] [hidden] { display:none; }
    [data-layout-guide] { position:absolute; width:0; border-left:1px dashed var(--dsw-alias-border-l2); }
    [data-layout-guide] > span { position:absolute; top:var(--guide-label-top); left:0;
      transform:translateX(-50%); white-space:nowrap; padding:3px 7px;
      border:1px solid var(--dsw-alias-border-l2); border-radius:min(2px, var(--dsw-radius-sm, 2px));
      background:var(--dsw-alias-bg-base); box-shadow:var(--dsw-elevation-soft, var(--dsw-shadow-lv1)); }
    [data-layout-guide][data-active] { border-left:2px solid var(--dsw-alias-brand-primary); }
    [data-layout-guide][data-active] > span { border-color:var(--dsw-alias-brand-primary);
      color:var(--dsw-alias-brand-text, var(--dsw-alias-brand-primary)); }
  `;
  const markers = presets.map(preset => {
    const line = document.createElement('div');
    line.dataset.layoutGuide = '';
    const label = document.createElement('span');
    label.textContent = preset.label;
    line.append(label);
    root.append(line);
    return { ...preset, line };
  });
  return {
    mount() { document.head.append(style); document.body.append(root); },
    hide() { root.hidden = true; },
    show(geometry: FrameGeometry, pointerY: number, active: number | null) {
      const bounds = geometry.frame.getBoundingClientRect();
      const scale = bounds.width / geometry.viewport;
      const top = Math.max(0, bounds.top);
      const bottom = Math.min(window.innerHeight, bounds.bottom);
      const targets = reachablePresets(geometry);
      root.hidden = false;
      root.style.setProperty('--guide-label-top', `${Math.max(4, Math.min(bottom - top - 30, pointerY - top - 40))}px`);
      for (const marker of markers) {
        marker.line.hidden = !targets.some(target => target.ratio === marker.ratio);
        marker.line.style.left = `${bounds.right - geometry.available * marker.ratio * scale}px`;
        marker.line.style.top = `${top}px`;
        marker.line.style.height = `${Math.max(0, bottom - top)}px`;
        marker.line.toggleAttribute('data-active', active === marker.ratio);
      }
    },
    dispose() { root.remove(); style.remove(); },
  };
}
