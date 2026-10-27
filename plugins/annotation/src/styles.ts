import { ICON_MASKS } from './icons.ts';
import { STROKES, highlightCSS } from './appearance.ts';

export const STYLE = `
:root { ${ICON_MASKS} }
::highlight(dsh-local-annotation) { background-color: var(--dsw-alias-bg-document-selection); }
[data-local-annotation-card] { position: fixed; z-index: 1000; top: 0; left: 0; width: fit-content; }
[data-local-annotation-card][hidden], [data-local-annotation-toolbar][hidden] { display: none; }
[data-local-annotation-toolbar], [data-local-annotation-panel], .dla-preview {
  box-sizing: border-box; color: var(--dsw-alias-label-primary); background: var(--dsw-menu-surface-fill);
  backdrop-filter: var(--dsw-menu-backdrop-filter); border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-panel); corner-shape: var(--dsw-corner-shape); box-shadow: var(--dsw-elevation-panel);
  font: var(--dsw-font-xs-13); font-family: var(--dsw-font-family); -webkit-app-region: no-drag;
}
[data-local-annotation-toolbar] { position: fixed; z-index: 1000; padding: 3px; max-width: calc(100vw - 16px); }
[data-local-annotation-panel] { width: min(320px, calc(100vw - 16px)); max-height: calc(100dvh - 64px); overflow: auto; padding: 12px; }
[data-local-annotation-panel] .dla-head { display: flex; align-items: center; gap: 6px; font: var(--dsw-font-xs-strong-13); }
[data-local-annotation-panel] .dla-close { margin-left: auto; }
[data-local-annotation-panel] .dla-quote { margin: 10px 0; padding: 4px 9px; border-left: 2px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-tertiary); font: var(--dsw-font-xxs-12); max-height: 76px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
[data-local-annotation-panel] textarea { box-sizing: border-box; width: 100%; min-height: 74px; resize: vertical; padding: 8px; font: inherit; color: var(--dsw-alias-label-primary); background: var(--dsw-specific-input-major); border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-md); corner-shape: var(--dsw-corner-shape); }
[data-local-annotation-panel] button, [data-local-annotation-toolbar] button, [data-local-annotation-status] button { font: inherit; color: inherit; border: 0; background: transparent; border-radius: var(--dsw-radius-sm); corner-shape: var(--dsw-corner-shape); cursor: pointer; padding: 4px 8px; -webkit-app-region: no-drag; }
:is([data-local-annotation-panel], [data-local-annotation-toolbar], [data-local-annotation-status]) button:hover { background: var(--dsw-alias-interactive-bg-hover); }
:is([data-local-annotation-panel], [data-local-annotation-status]) .dla-icon { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 24px; height: 24px; padding: 4px; }
:is([data-local-annotation-panel], [data-local-annotation-status]) .dla-danger { color: var(--dsw-alias-label-tertiary); }
:is([data-local-annotation-panel], [data-local-annotation-status]) .dla-danger:hover { color: var(--dsw-alias-state-error-primary); background: var(--dsw-alias-interactive-bg-hover-danger); }
:is([data-local-annotation-panel], [data-local-annotation-toolbar], [data-local-annotation-status]) :is(button,textarea):focus-visible, [data-local-annotation-marker]:focus-visible { outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color); outline-offset: 2px; }
[data-local-annotation-panel] button:disabled { opacity: .5; cursor: default; }
.dla-error { color: var(--dsw-alias-state-error-primary); font: var(--dsw-font-xxs-12); overflow-wrap: anywhere; }
[data-local-annotation-status] { position: relative; display: inline-flex; font: var(--dsw-font-xxs-12); color: var(--dsw-alias-label-secondary); }
[data-local-annotation-status] .dla-chip { border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-xl); padding: 2px 8px; white-space: nowrap; }
[data-local-annotation-status] .dla-preview { position: absolute; bottom: 100%; left: 0; z-index: 1000; width: min(300px,calc(100vw - 32px)); max-height: min(360px,50dvh); overflow: auto; padding: 8px 10px; }
[data-local-annotation-status] .dla-preview-item { display: flex; align-items: flex-start; gap: 4px; padding: 6px 0; border-bottom: 1px solid var(--dsw-alias-border-l2); }
[data-local-annotation-status] .dla-summary { flex: 1; min-width: 0; padding: 0; text-align: left; font: var(--dsw-font-xxs-12); color: var(--dsw-alias-label-tertiary); overflow-wrap: anywhere; }
[data-local-annotation-status] .dla-preview-note { display: block; color: var(--dsw-alias-label-secondary); margin: 3px 0 0 22px; }
[data-local-annotation-status] .dla-number { display: inline-grid; vertical-align: middle; width: 26px; height: 24px; margin-right: 6px; }
[data-local-annotation-status] .dla-attach { margin-top: 6px; color: var(--dsw-alias-brand-text); }
[data-local-annotation-marker] { display: grid; width: 26px; height: 24px; padding: 0; border: 0; background: transparent; cursor: pointer; pointer-events: auto; -webkit-app-region: no-drag; }
:is([data-local-annotation-marker], .dla-number, .dla-marker-sample) {
  position: relative; isolation: isolate; place-items: center; box-sizing: border-box;
  color: var(--dsw-alias-label-primary); font: var(--dsw-font-xxxs-strong-11); font-variant-numeric: tabular-nums;
}
:is([data-local-annotation-marker], .dla-number, .dla-marker-sample)::before,
:is([data-local-annotation-marker], .dla-number, .dla-marker-sample)::after {
  content: ''; position: absolute; inset: 0; pointer-events: none; z-index: -1;
  border-radius: var(--dla-marker-radius, 0);
  mask: var(--dla-marker-mask, var(--dla-mask-message)) center / 100% 100% no-repeat;
}
:is([data-local-annotation-marker], .dla-number, .dla-marker-sample)::before { background: color-mix(in srgb, var(--dla-ink) 26%, var(--dsw-specific-input-major)); }
:is([data-local-annotation-marker], .dla-number, .dla-marker-sample)::after {
  background: color-mix(in srgb, var(--dla-ink) 55%, var(--dsw-alias-label-primary));
  mask-image: var(--dla-marker-outline, var(--dla-outline-message));
}
[data-local-annotation-marker]:hover::before { background: color-mix(in srgb, var(--dla-ink) 45%, var(--dsw-specific-input-major)); }
[data-local-annotation-marker]:hover { filter: drop-shadow(0 1px 2px var(--dsw-alias-border-l2)); }
:is([data-local-annotation-marker], .dla-number, .dla-marker-sample) > span { position: relative; padding-bottom: 2px; }
:is([data-local-annotation-marker], .dla-number)[data-digits='3'] > span { font-size: 9px; }
[data-local-annotation-panel] .dla-footer { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-top: 8px; }
[data-local-annotation-panel] .dla-save { margin: 0; margin-left: auto; flex: none; }
.dla-appearance { min-width: 0; flex: 1; }
.dla-appearance summary { width: fit-content; padding: 4px 0; cursor: pointer; color: var(--dsw-alias-label-secondary); font: var(--dsw-font-xxs-12); }
.dla-appearance summary:focus-visible { outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color); outline-offset: 2px; }
.dla-appearance fieldset { border: 0; padding: 0; margin: 8px 0; min-width: 0; }
.dla-appearance legend { padding: 0; margin-bottom: 5px; font: var(--dsw-font-xxs-12); color: var(--dsw-alias-label-tertiary); }
.dla-appearance .dla-options { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
[data-local-annotation-panel] .dla-appearance button { border: 1px solid transparent; padding: 4px 6px; }
[data-local-annotation-panel] .dla-appearance button[aria-pressed='true'] { border-color: var(--dsw-alias-brand-primary); background: var(--dsw-alias-interactive-bg-hover); }
.dla-stroke-sample { display: inline-block; padding: 0 1px 3px; font: var(--dsw-font-xxs-12); }
${STROKES.map(option => `.dla-stroke-sample[data-stroke='${option.id}'] { ${highlightCSS(option.id, 'theme').replaceAll('var(--dsw-alias-brand-primary)', 'var(--dla-ink)')} }`).join('\n')}
[data-local-annotation-panel] .dla-appearance .dla-swatch { padding: 4px; width: 26px; height: 26px; border-radius: var(--dsw-radius-xl); }
.dla-swatch::before { content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dla-swatch); box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l2); }
.dla-custom-color { display: inline-flex; align-items: center; gap: 4px; font: var(--dsw-font-xxs-12); color: var(--dsw-alias-label-secondary); cursor: pointer; }
.dla-custom-color input { width: 24px; height: 24px; padding: 0; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-sm); background: transparent; cursor: pointer; }
.dla-custom-color input:focus-visible { outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color); outline-offset: 2px; }
.dla-marker-sample { display: inline-grid; width: 26px; height: 24px; }
.dla-appearance-hint { font: var(--dsw-font-xxxs-strong-11); color: var(--dsw-alias-label-tertiary); margin: 4px 0; }
`;
