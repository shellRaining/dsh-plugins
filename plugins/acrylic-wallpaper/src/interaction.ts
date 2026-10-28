import type { HostModules } from './host/modules.ts';

// One semantic action boundary for press geometry and Reveal. Do not use all
// tabindex/cursor:pointer nodes: editors, JSON tree groups and resize handles
// are not discrete actions. An unavailable inner action never falls back to
// its containing row.
export const ACTION_TARGETS = [
  'button,summary',
  '[role="button"],[role="tab"],[role="switch"],[role="checkbox"],[role="radio"]',
  '[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"],[role="option"]',
  '[role="treeitem"][data-row-key],[role="treeitem"][tabindex][aria-level]',
  '[role="gridcell"][tabindex][aria-selected]',
  'nav a[href],[role="navigation"] a[href]',
  'tr[data-trajectory-row-key][tabindex="0"]',
].join(',');
export const ACTION_FIELDS = 'input,textarea,select,[role="textbox"],[role="searchbox"],[role="combobox"],[contenteditable]:not([contenteditable="false"])';
export const ACTION_EXCLUDED = '[hidden],[inert],[aria-hidden="true"],[data-closing],[data-acrylic-ghost],[data-acrylic-reveal],[data-width-handle],[data-dockkit-divider],[data-dockkit-float-resize],.monaco-editor,.xterm';
export const ACTION_DISABLED = ':disabled,[aria-disabled="true"],[aria-busy="true"],[data-unavailable]';

export function actionSelector(modules: HostModules): string {
  const search = modules.select('searchResultRow');
  return search ? `${ACTION_TARGETS},${search}` : ACTION_TARGETS;
}
