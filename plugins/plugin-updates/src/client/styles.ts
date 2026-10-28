// Stylesheet. Every color, radius and font comes from DSH design tokens
// (--dsw-*, --dsh-*, --ds-*), and controls are host primitives, so the Win10
// palette, square corners and reveal light from dsh-acrylic-wallpaper apply
// without rules of our own. Card metrics follow the Plugins page's own cards.
export const STYLE_ID = '@shellraining/dsh-plugin-updates';

export const CSS = `
.dpu-tab, .dpu-section { display: flex; flex-direction: column; gap: 12px; min-width: 0; color: var(--dsw-alias-label-primary); }
.dpu-head { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-height: 28px; }
.dpu-summary { flex: 1; min-width: 0; color: var(--dsw-alias-label-secondary); font-size: 13px; line-height: 20px; }
.dpu-caption { color: var(--dsw-alias-label-caption); font-size: 12px; line-height: 18px; }
.dpu-title { margin: 0; font-size: 14px; font-weight: 500; line-height: 20px; }
.dpu-list { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; }
.dpu-card { display: flex; align-items: center; gap: 14px; min-width: 0; margin: 0 -8px; padding: 8px; border-radius: var(--dsw-radius-xl); }
.dpu-card:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dpu-icon { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; overflow: hidden; border: .5px solid var(--dsw-alias-border-l3); border-radius: var(--dsw-radius-lg); color: var(--dsw-alias-label-secondary); }
.dpu-icon img { width: 100%; height: 100%; object-fit: cover; }
.dpu-main { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.dpu-name-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-width: 0; }
.dpu-name { min-width: 0; padding: 0; overflow: hidden; border: 0; background: none; color: inherit; font: inherit; font-size: 14px; font-weight: 500; line-height: 20px; text-align: left; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.dpu-name:hover { text-decoration: underline; }
.dpu-name:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dpu-meta { color: var(--dsw-alias-label-tertiary); font-size: 13px; line-height: 18px; font-variant-numeric: tabular-nums; }
.dpu-end { flex: none; display: inline-flex; align-items: center; gap: 8px; }
.dpu-mono { font-family: var(--ds-font-family-code); font-variant-numeric: tabular-nums; }
.dpu-rows { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; border-top: .5px solid var(--dsw-alias-border-l2); }
.dpu-row { display: flex; align-items: center; gap: 8px; min-height: 36px; padding: 2px 0; border-bottom: .5px solid var(--dsw-alias-border-l2); }
.dpu-row-version { min-width: 96px; font-size: 13px; }
.dpu-row-tags { flex: 1; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-width: 0; }
.dpu-banner { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border: .5px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-layer-1); font-size: 13px; line-height: 20px; }
.dpu-banner[data-tone="error"] { color: var(--dsw-alias-state-error-primary); background: var(--dsw-alias-interactive-bg-hover-danger, var(--dsw-alias-bg-layer-1)); }
.dpu-banner-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.dpu-banner-row > span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.dpu-pre { max-height: 160px; margin: 0; padding: 8px 10px; overflow: auto; border-radius: var(--dsw-radius-md); background: var(--dsw-alias-markdown-code-block); color: var(--dsw-alias-label-secondary); font: 400 12px / 1.6 var(--ds-font-family-code); white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; }
.dpu-command { flex: 1; min-width: 0; }
.dpu-error { color: var(--dsw-alias-state-error-primary); font-size: 13px; line-height: 20px; overflow-wrap: anywhere; }
@media (forced-colors: active) { .dpu-banner { border-color: CanvasText; } }
`;

export function installStyle(document: Document): () => void {
  const node = document.createElement('style');
  node.dataset.plugin = STYLE_ID;
  node.textContent = CSS;
  document.head.append(node);
  return () => node.remove();
}
