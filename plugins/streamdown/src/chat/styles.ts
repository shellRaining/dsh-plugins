/**
 * Layout of the official assistant message and reasoning row, ported from
 * ui-chat 0.2.1-rc.3 `AssistantMarkdown.module.css` and
 * `ReasoningRow.module.css` (MIT, Copyright (c) 2026 DeepSeek) with the
 * CSS-module classes renamed to `dsh-sd-*`. Re-diff on every DSH upgrade.
 */
export const CHAT_CSS = `
.dsh-sd-root {
  font-size: var(--dsh-content-font-size, 14px);
  line-height: calc(24px + var(--dsh-content-font-delta, 0px));
  color: var(--dsw-alias-label-primary);
  flex-direction: column;
  display: flex;
}
.dsh-sd-body { flex-direction: column; gap: 16px; display: flex; }
.dsh-sd-body .md-table-wide {
  --dsh-table-spare: max(0px, calc((100cqw - var(--dsh-chat-content-width)) / 2));
  --dsh-table-lead: calc(var(--dsh-table-spare) + min(var(--dsh-chat-content-width), 100cqw) - 100%);
  box-sizing: border-box;
  width: calc(100% + var(--dsh-table-lead) + var(--dsh-table-spare));
  max-width: none;
  margin-left: calc(-1 * var(--dsh-table-lead));
  padding-left: var(--dsh-table-lead);
}
.dsh-sd-body .md-table-wide > table { z-index: 1; position: relative; }
.dsh-sd-body > [data-turn-process-inline][hidden] { margin-bottom: -16px; }
.dsh-sd-stopped {
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-tertiary);
  align-self: flex-start;
  padding: 0 6px;
  font-size: 11px;
  line-height: 18px;
}
.dsh-sd-think { flex-direction: column; display: flex; }
.dsh-sd-think:not([data-expanded]) {
  contain: size layout;
  height: calc(24px + var(--dsh-content-font-delta, 0px));
}
.dsh-sd-think-row { overflow: hidden; }
.dsh-sd-think[data-expanded] [data-open] [data-disclosure-header] {
  z-index: 1;
  background: var(--dsw-alias-bg-base);
  position: sticky;
  top: 0;
}
.dsh-sd-think-leading { flex-shrink: 0; }
.dsh-sd-think-title { font-weight: 400; }
.dsh-sd-think-separator {
  background: var(--dsw-alias-label-caption);
  border-radius: 1px;
  flex: none;
  width: 2px;
  height: 2px;
  margin: 0 8px;
}
.dsh-sd-think-summary {
  min-width: 0;
  font-size: var(--dsh-content-font-size-secondary, 13px);
  line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px));
  white-space: nowrap;
  flex: auto;
  overflow: hidden;
}
.dsh-sd-think-summary-text { text-overflow: ellipsis; display: block; overflow: hidden; }
.dsh-sd-think-summary[data-streaming] { mask-image: linear-gradient(90deg, #000 calc(100% - 48px), #0000); }
.dsh-sd-think-summary[data-streaming] .dsh-sd-think-summary-text { text-overflow: clip; overflow: visible; }
.dsh-sd-think:not([data-preview]) .dsh-sd-think-separator,
.dsh-sd-think:not([data-preview]) .dsh-sd-think-summary { display: none; }
.dsh-sd-think-body { padding: 4px 0 4px calc(22px + var(--dsh-content-font-delta, 0px)); min-width: 0; }
.dsh-sd-visually-hidden {
  clip: rect(0 0 0 0);
  white-space: nowrap;
  width: 1px;
  height: 1px;
  position: absolute;
  overflow: hidden;
}
`;
