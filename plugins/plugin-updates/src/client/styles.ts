// Stylesheet. Every color, radius and font comes from DSH design tokens
// (--dsw-*, --dsh-*, --ds-*), and controls are host primitives, so the Win10
// palette, square corners and reveal light from dsh-acrylic-wallpaper apply
// without rules of our own.
export const STYLE_ID = '@shellraining/dsh-plugin-updates';

export const CSS = `
.dpu-section { display: flex; flex-direction: column; gap: 12px; min-width: 0; color: var(--dsw-alias-label-primary); }
.dpu-head { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-height: 28px; }
.dpu-summary { flex: 1; min-width: 0; color: var(--dsw-alias-label-secondary); font-size: 13px; line-height: 20px; }
.dpu-caption { color: var(--dsw-alias-label-caption); font-size: 12px; line-height: 18px; }
.dpu-title { margin: 0; font-size: 14px; font-weight: 500; line-height: 20px; }
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
