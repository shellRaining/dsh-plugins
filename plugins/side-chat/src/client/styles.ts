// Panel stylesheet. Every color, radius, font and elevation comes from DSH
// design tokens (--dsw-*, --dsh-*, --ds-*), so theme overrides — the Win10
// acrylic palette and corner shape included — apply without plugin-specific
// rules. The composer card and its editor carry `data-side-chat-composer` /
// `data-side-chat-input` (never the host's `data-composer-*` markers, which
// host code queries for the main composer); the acrylic plugin maps these to
// the same input material, focus boundary and reveal border as the main card.
export const STYLE_ID = 'dsh-side-chat';

export const CSS = `
[data-side-chat] {
  --dsc-gutter: 16px;
  --dsc-indent: calc(22px + var(--dsh-content-font-delta, 0px));
  --dsc-secondary-size: var(--dsh-content-font-size-secondary, 13px);
  --dsc-secondary-line: calc(20px + var(--dsh-content-font-delta-secondary, 0px));
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family);
  font-size: var(--dsh-content-font-size, 14px);
  line-height: calc(24px + var(--dsh-content-font-delta, 0px));
  background: transparent;
}

/* Header: run state, queue and the new-tab action. Not sticky, nothing scrolls under it. */
.dsc-header {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 4px 8px 4px var(--dsc-gutter);
  border-bottom: .5px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-tertiary);
  font-size: var(--dsc-secondary-size);
  line-height: var(--dsc-secondary-line);
}
.dsc-status { display: inline-flex; align-items: center; gap: 8px; min-width: 0; white-space: nowrap; }
.dsc-queued { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-caption); }
.dsc-header-actions { display: flex; align-items: center; gap: 4px; margin-left: auto; }

.dsc-scroll {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.dsc-transcript {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
  padding: 16px var(--dsc-gutter) 20px;
}

/* Empty state */
.dsc-empty {
  margin: auto;
  max-width: 320px;
  padding: 40px var(--dsc-gutter);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
  color: var(--dsw-alias-label-secondary);
  font-size: var(--dsc-secondary-size);
  line-height: var(--dsc-secondary-line);
}
.dsc-empty-art { color: var(--dsw-alias-label-tertiary); margin-bottom: 4px; }
.dsc-empty-title { color: var(--dsw-alias-label-primary); font: var(--dsw-font-markdown-h4, 600 14px / 24px var(--dsw-font-family)); }
.dsc-empty-hint { color: var(--dsw-alias-label-caption); font-size: 12px; line-height: 18px; }

/* User turns mirror the main chat bubble. */
.dsc-user { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; min-width: 0; }
.dsc-bubble {
  max-width: min(88%, 560px);
  padding: 10px 16px;
  border-radius: var(--dsw-radius-xl);
  background: var(--dsw-specific-bubble);
  color: var(--dsw-alias-label-primary);
  line-height: calc(22px + var(--dsh-content-font-delta, 0px));
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  user-select: text;
}
.dsc-bubble[data-pending] { opacity: .64; }
.dsc-meta { padding: 0 4px; color: var(--dsw-alias-label-caption); font-size: 12px; line-height: 18px; font-variant-numeric: tabular-nums; }

/* Assistant turns: process rows (reasoning, tools) and Markdown text. */
.dsc-assistant { display: flex; flex-direction: column; gap: 12px; min-width: 0; overflow-wrap: anywhere; }
.dsc-process { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.dsc-row-summary {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-tertiary);
  font-size: var(--dsc-secondary-size);
}
.dsc-row-collapsed { display: flex; align-items: center; gap: 8px; min-width: 0; }
/* Title-to-summary separator, as in the main transcript's process rows. */
.dsc-sep { flex: none; width: 2px; height: 2px; margin-left: 8px; border-radius: 1px; background: var(--dsw-alias-label-caption); }
.dsc-detail { display: flex; flex-direction: column; gap: 8px; min-width: 0; margin: 4px 0 4px var(--dsc-indent); }
.dsc-reasoning { color: var(--dsw-alias-label-tertiary); }
.dsc-pre {
  margin: 0;
  max-height: 240px;
  overflow: auto;
  padding: 10px 12px;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-markdown-code-block);
  color: var(--dsw-alias-label-secondary);
  font: 400 calc(11px + var(--dsh-code-font-delta, 0px)) / 1.6 var(--ds-font-family-code);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  tab-size: 2;
  user-select: text;
}
.dsc-pre[data-error] { color: var(--dsw-alias-state-error-primary); }
.dsc-caption { color: var(--dsw-alias-label-caption); font-size: 12px; line-height: 18px; }
.dsc-markdown { min-width: 0; }
.dsc-context { display: flex; align-items: center; gap: 6px; min-width: 0; color: var(--dsw-alias-label-tertiary); font-size: var(--dsc-secondary-size); line-height: var(--dsc-secondary-line); }
.dsc-context > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsc-thinking { align-self: flex-start; color: var(--dsw-alias-label-tertiary); font-size: var(--dsc-secondary-size); line-height: var(--dsc-secondary-line); }

.dsc-notice {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 8px 8px 12px;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-interactive-bg-hover-danger, var(--dsw-alias-interactive-bg-hover));
  color: var(--dsw-alias-state-error-primary);
  font-size: var(--dsc-secondary-size);
  line-height: var(--dsc-secondary-line);
}
.dsc-notice-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.dsc-notice-detail { color: var(--dsw-alias-label-secondary); font: 400 12px / 18px var(--ds-font-family-code); white-space: pre-wrap; overflow-wrap: anywhere; }

/* Composer: same token recipe as the main input bar card. */
.dsc-footer { flex: none; display: flex; flex-direction: column; padding: 0 12px 8px; }
.dsc-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 8px;
  border: 0;
  border-radius: var(--dsw-radius-panel);
  background: var(--dsw-specific-input-major);
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l2);
  box-shadow: var(--dsw-elevation-soft);
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);
  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);
}
.dsc-input {
  display: block;
  box-sizing: border-box;
  width: 100%;
  min-height: 36px;
  max-height: 40vh;
  margin: 0;
  padding: 4px 14px 0;
  border: 0;
  outline: none;
  resize: none;
  overflow-y: auto;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  caret-color: var(--dsw-alias-state-business-primary);
  font: inherit;
  font-family: var(--dsw-font-family);
}
.dsc-input::placeholder { color: var(--dsw-alias-label-caption); }
.dsc-input:disabled { color: var(--dsw-alias-label-tertiary); cursor: not-allowed; }
.dsc-composer-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; padding: 2px 8px 8px 14px; }
.dsc-hint { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-caption); font-size: 12px; line-height: 18px; }
.dsc-primary {
  flex: none;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  corner-shape: round;
  background: var(--dsw-alias-button-info-fill);
  color: var(--dsw-static-neutral-00);
  cursor: pointer;
  transition: background-color var(--ds-transition-duration-fast, .1s) var(--ds-ease-in-out, ease);
}
.dsc-primary:hover:not(:disabled) { background: var(--dsw-alias-button-info-hover); }
.dsc-primary:disabled { opacity: .4; cursor: default; }

/* Usage dock under the composer, styled like the main chat's stat pills. */
.dsc-dock {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 2px 4px;
  padding-top: 4px;
  color: var(--dsw-alias-label-tertiary);
  font-size: calc(var(--dsc-secondary-size) - 1px);
  line-height: var(--dsc-secondary-line);
  font-variant-numeric: tabular-nums;
}
.dsc-dock-item { display: inline-flex; align-items: center; gap: 6px; padding: 1px 8px; border-radius: var(--dsw-radius-sm); white-space: nowrap; }
.dsc-dock-item:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary); }
.dsc-ring-track { fill: none; stroke: var(--dsw-alias-border-l3); stroke-width: 2; }
.dsc-ring-fill { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }

.dsc-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

@media (prefers-reduced-motion: reduce) {
  .dsc-primary { transition: none; }
}
@media (forced-colors: active) {
  .dsc-card { border: 1px solid CanvasText; }
  .dsc-primary { border: 1px solid ButtonText; }
}
`;

export function installStyle(document: Document): () => void {
  const node = document.createElement('style');
  node.dataset.plugin = STYLE_ID;
  node.textContent = CSS;
  document.head.append(node);
  return () => node.remove();
}
