export const css = `
/* Scoped to a single detected Mermaid block; never alter ordinary code blocks. */
[data-dsh-mmd-banner], [data-dsh-mmd-host] :has(> [data-dsh-mmd-banner]):not(:has(pre)){display:none!important}
[data-dsh-mmd-surface]{background:transparent!important;background-image:none!important;box-shadow:none!important;border:0!important}
[data-dsh-mmd-host]{position:relative!important;isolation:isolate;border-radius:var(--dsw-radius-md,2px)!important;padding:0!important;--mmd-node-opacity:1;--mmd-cluster-opacity:.55}
[data-dsh-mmd-host]::before{content:'';position:absolute;inset:0;z-index:-1;pointer-events:none;border-radius:inherit;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l3)}
.dsh-mmd{position:relative;color:var(--dsw-alias-label-primary);background:transparent;border-radius:inherit;overflow:hidden}
.dsh-mmd-controls{position:absolute;z-index:2;inset-block-start:6px;inset-inline-end:6px;display:flex;align-items:center;gap:2px;padding:2px;border-radius:var(--dsw-radius-sm,2px);background:var(--dsw-menu-surface-fill,var(--dsw-alias-bg-layer-1));opacity:0;pointer-events:none;transition:opacity 100ms linear}
[data-dsh-mmd-host]:is(:hover,:has(:focus-visible))>.dsh-mmd-controls{opacity:1;pointer-events:auto}
.dsh-mmd-button{appearance:none;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:4px;border:0;border-radius:var(--dsw-radius-sm,2px);background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer}
.dsh-mmd-button:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsh-mmd-button[aria-pressed=true]{background:var(--dsw-alias-interactive-bg-active);color:var(--dsw-alias-label-primary)}
.dsh-mmd-button:focus-visible{outline:1px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-1px}
.dsh-mmd-button svg{width:14px;height:14px;pointer-events:none}
.dsh-mmd-pane{padding:32px 20px 24px;overflow:auto;max-height:70vh}
.dsh-mmd-pane>svg{display:block;margin:auto;max-width:100%;height:auto;background:transparent!important;font-family:inherit}
.dsh-mmd-pane svg :is(.node rect,.node circle,.node ellipse,.node polygon,.node path,rect.actor,rect.labelBox){fill-opacity:var(--mmd-node-opacity);stroke-width:1px}
.dsh-mmd-pane svg .cluster rect{fill-opacity:var(--mmd-cluster-opacity);stroke-width:1px}
.dsh-mmd-pane svg .edgeLabel :is(rect,.labelBkg){fill-opacity:var(--mmd-node-opacity)}
.dsh-mmd-error{padding:32px 12px 8px;color:var(--dsw-alias-state-error-primary);font:inherit;font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}
.dsh-mmd-status{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.dsh-mmd[hidden],.dsh-mmd [hidden],pre[data-dsh-mmd-hidden]{display:none!important}
[data-dsh-mmd-host] pre:not([data-dsh-mmd-hidden]){background:transparent!important;margin:0!important;padding-top:34px!important}
/* Match the existing Win10 plugin: neutral tint, square geometry, thin strokes.
   The wallpaper already provides blur/noise; do not stack per-node filters. */
body[data-acrylic-wallpaper] [data-dsh-mmd-host]{--mmd-node-opacity:.36;--mmd-cluster-opacity:.12}
body[data-acrylic-wallpaper] [data-dsh-mmd-host]::before{background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 24%,transparent)}
body[data-acrylic-fluent] .dsh-mmd-pane svg :is(.node rect,rect.actor,rect.labelBox){rx:2px;ry:2px}
body[data-acrylic-fluent] .dsh-mmd-pane svg :is(.flowchart-link,.messageLine0,.messageLine1){stroke-width:1px}
@media(hover:none){.dsh-mmd-controls{opacity:1;pointer-events:auto}}
@media(prefers-reduced-motion:reduce){.dsh-mmd-controls{transition:none}}
@media(prefers-reduced-transparency:reduce){body[data-acrylic-wallpaper] [data-dsh-mmd-host]{--mmd-node-opacity:1;--mmd-cluster-opacity:1}body[data-acrylic-wallpaper] [data-dsh-mmd-host]::before{background:var(--dsw-alias-bg-layer-1)}}
@media(forced-colors:active){[data-dsh-mmd-host]::before{background:Canvas;border-color:CanvasText}[data-dsh-mmd-host]{--mmd-node-opacity:1;--mmd-cluster-opacity:1}.dsh-mmd-button{color:ButtonText}.dsh-mmd-button[aria-pressed=true]{outline:1px solid Highlight}.dsh-mmd-pane svg{forced-color-adjust:none}}
`;
