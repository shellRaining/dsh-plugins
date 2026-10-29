/**
 * Visual parity with the host Markdown sheet: ui-primitives
 * `MarkdownText.module.css` 0.2.1-rc.3 (MIT, Copyright (c) 2026 DeepSeek),
 * body variant only, with the CSS-module classes renamed to `dsh-sd-*`.
 * Re-diff this block against the host sheet on every DSH upgrade.
 */
export const MARKDOWN_CSS = `
.dsh-sd-md {
  min-width: 0;
  overflow-wrap: anywhere;
  font: var(--dsw-font-markdown-base);
  color: var(--dsw-alias-label-primary);
}
.dsh-sd-md strong { font-weight: 600; }
.dsh-sd-md h1 { font: var(--dsw-font-markdown-h1); margin: 32px 0 16px; }
.dsh-sd-md h2 { font: var(--dsw-font-markdown-h2); margin: 32px 0 16px; }
.dsh-sd-md h3 { font: var(--dsw-font-markdown-h3); margin: 32px 0 16px; }
.dsh-sd-md h4 { font: var(--dsw-font-markdown-h4); margin: 16px 0; }
.dsh-sd-md :where(h5, h6) { font: var(--dsw-font-markdown-base-strong); margin: 16px 0; }
.dsh-sd-md :where(h1, h2, h3, h4, h5, h6) strong { font-weight: inherit; }
.dsh-sd-md p { margin: 16px 0; }
.dsh-sd-md :where(h4, h5, h6) + :where(ul, ol) { margin-top: 8px; }
.dsh-sd-md :where(h4, h5, h6):has(+ :where(ul, ol)) { margin-bottom: 8px; }
.dsh-sd-md a,
.dsh-sd-md .dsh-sd-file-link {
  color: var(--dsw-alias-link);
  font-weight: 500;
  transition: box-shadow var(--ds-transition-duration) var(--ds-ease-in-out);
  position: relative;
  text-decoration: none;
  border-left: 3px solid rgb(255 255 255 / 0);
  border-right: 3px solid rgb(255 255 255 / 0);
  border-top: 2px solid rgb(255 255 255 / 0);
  border-bottom: 2px solid rgb(255 255 255 / 0);
  margin-left: -3px;
  margin-right: -3px;
}
.dsh-sd-md a:hover,
.dsh-sd-md a:focus {
  outline: none;
  text-decoration: underline dotted var(--dsw-alias-link);
  text-underline-offset: 3px;
}
.dsh-sd-md a[aria-disabled] { text-decoration: none; cursor: default; }
.dsh-sd-md a:focus-visible,
.dsh-sd-file-mention:focus-visible {
  box-shadow: 0 0 0 2px var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
}
.dsh-sd-link-icon {
  flex: none;
  width: 1.1em;
  height: 1.1em;
  vertical-align: -0.25em;
  margin-right: 5px;
}
.dsh-sd-md :where(ul, ol) { margin: 16px 0; padding-left: 18px; }
.dsh-sd-md li:not(:first-child) { margin-top: 6px; }
.dsh-sd-md li > :where(ul, ol) { margin-top: 4px; }
.dsh-sd-md li::marker { line-height: 24px; color: var(--dsw-alias-label-secondary); }
.dsh-sd-md :where(ul, ol) ol { list-style-position: inside; padding-left: 0; }
.dsh-sd-md :where(ul, ol) ol li p { display: inline; }
.dsh-sd-md li > p { margin: 8px 0; }
.dsh-sd-md li > *:first-child { margin-top: 0; }
.dsh-sd-md li > *:last-child:not(.md-code-block) { margin-bottom: 0; }
.dsh-sd-md hr {
  display: block;
  border: none;
  height: 0.5px;
  margin: 32px 0;
  background: var(--dsw-alias-border-l2);
}
.dsh-sd-md blockquote {
  border-left: 2px solid var(--dsw-alias-label-caption);
  margin: 16px 0 0;
  padding-left: 14px;
}
.dsh-sd-md pre { margin: 16px 0; font-family: var(--ds-font-family-code); overflow: auto; }
.dsh-sd-md :not(pre) > code {
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
  font: var(--dsw-font-markdown-code);
  font-family: var(--ds-font-family-code);
  font-size: 0.875em !important;
  background-color: var(--dsw-alias-markdown-inline-code);
  border: 0.5px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-sm);
  padding: 0 5px;
}
.dsh-sd-md :where(h1, h2, h3, h4, h5, h6) code { font: inherit; font-family: var(--ds-font-family-code); }
.dsh-sd-md .katex-display { max-width: 100%; overflow-x: auto; overflow-y: hidden; }
.dsh-sd-md input[type='checkbox'] { margin: 0 8px 0 0; accent-color: var(--dsw-alias-label-secondary); }
.dsh-sd-table-scroll { max-width: 100%; overflow-x: auto; overscroll-behavior-x: contain; }
.dsh-sd-table-scroll.md-table-wide { overflow-x: hidden; padding-bottom: var(--dsh-scrollbar-width, 5px); }
.dsh-sd-table-scroll.md-table-wide:hover,
.dsh-sd-table-scroll.md-table-wide:focus-visible { overflow-x: scroll; padding-bottom: 0; }
.dsh-sd-table-scroll:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
}
.dsh-sd-table-scroll table { border-collapse: collapse; width: max-content; max-width: max-content; }
.dsh-sd-table-fill table { width: 100%; max-width: none; }
.dsh-sd-table-scroll th {
  text-align: start;
  padding: 10px 16px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l3);
  border-top: none;
  font: var(--dsw-font-markdown-table-head);
  max-width: 320px;
  max-width: min(30vw, 320px);
  min-width: 100px;
}
.dsh-sd-table-scroll td {
  padding: 10px 16px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
  font: var(--dsw-font-markdown-table);
  max-width: 320px;
  max-width: min(30vw, 320px);
  min-width: 100px;
}
.dsh-sd-table-scroll th:first-child,
.dsh-sd-table-scroll td:first-child { padding-left: 0; }
.dsh-sd-table-scroll td:last-child { padding-right: 0; }
.dsh-sd-table-scroll table code { font-size: 11px; }
.dsh-sd-md > *:first-child,
.dsh-sd-md p:first-child { margin-top: 0 !important; }
.dsh-sd-md > *:last-child,
.dsh-sd-md p:last-child { margin-bottom: 0 !important; }
.dsh-sd-image-alt { color: var(--dsw-alias-label-tertiary); font-style: italic; }
.dsh-sd-image {
  display: block;
  width: auto;
  max-width: 100%;
  height: auto;
  margin: 0;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-base);
  object-fit: contain;
}
.dsh-sd-file-mention {
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  font-weight: 500;
  color: var(--dsw-alias-link);
  text-decoration: none;
  cursor: pointer;
}
.dsh-sd-file-link { max-width: 100%; text-align: inherit; }
.dsh-sd-file-mention:hover,
.dsh-sd-file-mention:focus {
  outline: none;
  text-decoration: underline dotted var(--dsw-alias-link);
  text-underline-offset: 3px;
}
.dsh-sd-image-button {
  display: inline-block;
  max-width: 100%;
  padding: 0;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  vertical-align: middle;
  cursor: zoom-in;
}
.dsh-sd-image-button .dsh-sd-image { max-width: min(100%, 640px); max-height: 360px; }
.dsh-sd-image-button:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 3px;
}
/* Plugin addition: TeX that has not parsed yet while its block streams. */
.dsh-sd-math-pending { color: var(--dsw-alias-label-tertiary); white-space: pre-wrap; }
`;
