import type { Feature } from './feature.ts';
import type { HostModules } from './host/modules.ts';
import { createStyleSheet } from './style.ts';
import { COMPOSER_CARD, COMPOSER_INPUT } from './composer.ts';

// The shell frame, by the semantic children the host gives it.
const FRAME = 'div:has(> [data-shell-bottom]):has(> [data-rightbar-col])';

// Fluent exceptions for host components that bypass semantic tokens (local
// variables, hard-coded colors, missing rails). Scope every override to a known
// component marker; never change static color swatches or arbitrary card classes.
// `searchRows` is resolved at runtime (host/modules.ts); null until it loads.
export const adapterCss = (searchRows: string | null) => `
/* HoverCard declares its own fill (#2C2C2E in both schemes) instead of a token. */
body[data-acrylic-fluent] > div[style*="--dsh-hover-preview-fade"] { --dsw-hovercard-bg: #2b2b2b; }
/* The macOS sidebar column layers a hard-coded blue vibrancy gradient over its
   fill. Keep the neutral fill (frame anchors, not module hashes). */
html[data-platform="darwin"] body[data-acrylic-fluent] ${FRAME} > div:first-child { background-image: none; }
body[data-acrylic-fluent] [data-changed-files],
body[data-acrylic-fluent][data-ds-dark-theme] [data-changed-files] {
  --changes-fill: var(--dsw-alias-bg-layer-1);
  --changes-hover: var(--dsw-alias-bg-module-platform);
}
body[data-acrylic-fluent] [data-presented-file],
body[data-acrylic-fluent][data-ds-dark-theme] [data-presented-file] {
  --deliverable-fill: var(--dsw-alias-bg-layer-1);
  --deliverable-hover: var(--dsw-alias-bg-module-platform);
}
/* The changed-files header owns the first icon span. HoverCard may insert one
   wrapper for a single-file preview; list-row spans must never be matched. */
body[data-acrylic-fluent] [data-changed-files] > button:first-child > span:first-child,
body[data-acrylic-fluent] [data-changed-files] > :first-child > button:first-child > span:first-child,
body[data-acrylic-fluent] [data-presented-file] > button:first-child + span {
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-layer-2);
}
/* An editor gets a stable focus boundary, not a moving fill over text. Keep
   the host's elevation and workspace-picker dashed pseudo-element intact. */
body[data-acrylic-fluent] ${COMPOSER_CARD}:has(${COMPOSER_INPUT}:focus) {
  --dsw-elevation-stroke-color: var(--dsw-alias-state-business-primary);
  outline: 1px solid var(--dsw-alias-state-business-primary);
  outline-offset: -1px;
}
/* Sidebar tree rows have mouse semantics but no tab stop. Indicate focus in
   their existing action buttons without changing the host keyboard model. */
body[data-acrylic-fluent] :is([role="treeitem"][data-row-key]${searchRows ? `, ${searchRows}` : ''}):has(:focus-visible:not([data-dsh-automatic-focus])) {
  outline: 1px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -1px;
}
@media (forced-colors: active) {
  body[data-acrylic-fluent] ${COMPOSER_CARD}:has(${COMPOSER_INPUT}:focus) { outline-color: Highlight; }
}
/* rc.3 shell resize handles (frame children named by data-side) lack a visual
   rail. Decorate their existing hit box; never change drag geometry, pointer
   capture or keyboard semantics. */
body[data-acrylic-fluent] ${FRAME} > :is([data-side="sidebar"],[data-side="rightbar"])::after {
  content: ''; position: absolute; inset-block: 0; left: 3px; width: 2px;
  pointer-events: none; opacity: 0;
  background: linear-gradient(transparent, var(--dsw-alias-state-business-primary), transparent);
}
body[data-acrylic-fluent] ${FRAME} > :is([data-side="sidebar"],[data-side="rightbar"]):hover::after { opacity: .45; }
body[data-acrylic-fluent] ${FRAME} > :is([data-side="sidebar"],[data-side="rightbar"])[data-dragging]::after { opacity: .75; }
body[data-acrylic-fluent] [data-dockkit-divider]:hover::before,
body[data-acrylic-fluent] [data-dockkit-divider]:active::before {
  background: var(--dsw-alias-state-business-primary);
}
body[data-acrylic-fluent] [data-dockkit-float-resize]:is(:hover,:active)::after {
  border-color: var(--dsw-alias-state-business-primary);
}
/* Native macOS menu backing stays opaque and anchored by the host. Only align
   its color with the neutral menu family; never remove it or alter its z-index. */
html[data-platform="darwin"] body[data-acrylic-fluent] [data-menu-backing] {
  background: #f8f8f8;
}
html[data-platform="darwin"] body[data-acrylic-fluent][data-ds-dark-theme] [data-menu-backing] {
  background: #202020;
}
`;

export function createAdapters(document: Document, modules: HostModules): Feature<boolean> {
  const render = () => adapterCss(modules.select('searchResultRow'));
  const sheet = createStyleSheet(document, 'dsh-acrylic-wallpaper-adapters', render());
  const unsubscribe = modules.subscribe(() => sheet.set(render()));
  return { update: sheet.toggle, dispose() { unsubscribe(); sheet.dispose(); } };
}
