// Host CSS-module class names carry a build-specific hash: the npm and darwin
// desktop builds of 0.2.1-rc.3 already differ (eGxaPq_frame vs _4if9eW_frame),
// and the web shell's Vite build uses another format again. Never write them
// literally (build.ts rejects it). Prefer the host's semantic attributes; for
// components that expose none, read the hashed name at runtime from one of:
// - a client plugin package's module tag: ui-chat, ui-workspace and the like
//   inject one <style data-plugin-css="<package>/<File>.module.css"> per
//   module, whose id is build-independent;
// - the web shell's own stylesheet, for packages it bundles (primitives),
//   which inject no module tag. Their rules carry Vite names
//   (_<local>_<hash>_<line>); SHELL_SIGNATURES picks a module's hash by exact
//   selectors that only that module has, and anything ambiguous stays
//   unresolved, so its rules are simply not applied.
import type { Dispose } from './context.ts';

/** Host components without a semantic anchor, as [module id, local class]. */
export const HOST_CLASSES = {
  // Only these primitive variants lack the ghost button's native :active fill.
  button: ['@deepseek-ai/dsh-client-ui-primitives/Button.module.css', 'button'],
  buttonOutline: ['@deepseek-ai/dsh-client-ui-primitives/Button.module.css', 'outline'],
  buttonToolbar: ['@deepseek-ai/dsh-client-ui-primitives/Button.module.css', 'toolbar'],
  buttonPrimary: ['@deepseek-ai/dsh-client-ui-primitives/Button.module.css', 'primary'],
  // Right-hand turn rail (an outline next to the conversation).
  turnRail: ['@deepseek-ai/dsh-client-ui-chat/TurnNavigator.module.css', 'frame'],
  // Sidebar search results: tree rows without data-row-key.
  searchResultRow: ['@deepseek-ai/dsh-client-ui-workspace/Rows.module.css', 'searchResultRow'],
} as const satisfies Record<string, readonly [string, string]>;

export type HostClassName = keyof typeof HOST_CLASSES;
type ModuleId = (typeof HOST_CLASSES)[HostClassName][0];

/**
 * Shell-bundled modules, as [local class, selector suffix] pairs that the
 * module's rules must all have under one shared hash (attribute values
 * unquoted). Exactly one hash may match.
 */
const SHELL_SIGNATURES: Partial<Record<ModuleId, readonly (readonly [string, string])[]>> = {
  '@deepseek-ai/dsh-client-ui-primitives/Button.module.css': [
    ['button', ''], ['button', ':disabled'], ['ghost', ':active:not(:disabled)'],
    ['outline', ''], ['toolbar', ''], ['primary', ''], ['sm', ''], ['md', ''], ['icon', ''],
  ],
};

export interface HostModules {
  /** `[class~="…"]` (no CSS escaping needed), or null while its module is not loaded. */
  select(name: HostClassName): string | null;
  /** Runs after a resolved selector changes (a module loaded, reloaded or left). */
  subscribe(listener: () => void): Dispose;
  dispose(): void;
}

const MODULE_TAG = 'style[data-plugin-css]';
const SHELL_SHEET = 'link[rel~="stylesheet"]';
const NAMES = Object.keys(HOST_CLASSES) as HostClassName[];
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const select = (found: string | null | undefined) => found ? `[class~="${found}"]` : null;

function fromModuleTag(document: Document, name: HostClassName): string | null {
  const [module, local] = HOST_CLASSES[name];
  const style = document.head.querySelector(`style[data-plugin-css=${JSON.stringify(module)}]`);
  return select(style?.textContent?.match(new RegExp(String.raw`\.([\w-]+_${local})(?![\w-])`))?.[1]);
}

/** Single selectors of the shell's linked stylesheets; unreadable (cross-origin) sheets are skipped. */
function shellSelectors(document: Document, window: Window & typeof globalThis): string[] {
  const selectors: string[] = [];
  const visit = (rules: CSSRuleList) => {
    for (const rule of rules) {
      if (rule instanceof window.CSSStyleRule) for (const part of rule.selectorText.split(',')) selectors.push(part.trim().replaceAll('"', ''));
      if (rule instanceof window.CSSGroupingRule) visit(rule.cssRules);
    }
  };
  for (const sheet of document.styleSheets) {
    if (!(sheet.ownerNode instanceof window.Element) || !sheet.ownerNode.matches(SHELL_SHEET)) continue;
    try { visit(sheet.cssRules); } catch { /* cross-origin or not loaded yet */ }
  }
  return selectors;
}

// `._<local>_<hash>_<line><suffix>` as a whole selector.
const viteSelector = (local: string, hash: string, suffix: string) =>
  new RegExp(String.raw`^\.(_${literal(local)}_(${hash})_\d+)${literal(suffix)}$`);

/** The shell names of every signed module's classes; a module matching no or several hashes is left out. */
function fromShell(selectors: readonly string[]): Map<HostClassName, string> {
  const names = new Map<HostClassName, string>();
  for (const [module, signature] of Object.entries(SHELL_SIGNATURES)) {
    const [first, ...rest] = signature ?? [];
    if (!first) continue;
    const pattern = viteSelector(first[0], '[\\w-]{5}', first[1]);
    const candidates = new Set(selectors.map(selector => selector.match(pattern)?.[2]).filter(hash => hash !== undefined));
    const hashes = [...candidates].filter(hash => rest.every(([local, suffix]) => {
      const exact = viteSelector(local, literal(hash), suffix);
      return selectors.some(selector => exact.test(selector));
    }));
    const hash = hashes.length === 1 ? hashes[0] : undefined;
    if (hash === undefined) continue;
    for (const name of NAMES) {
      const [owner, local] = HOST_CLASSES[name];
      if (owner !== module) continue;
      const exact = viteSelector(local, literal(hash), '');
      const found = new Set(selectors.map(selector => selector.match(exact)?.[1]).filter(value => value !== undefined));
      const [only] = found;
      if (found.size === 1 && only) names.set(name, only);
    }
  }
  return names;
}

export function createHostModules(document: Document, window: Window & typeof globalThis): HostModules {
  let shell = fromShell(shellSelectors(document, window));
  const current = (name: HostClassName) => fromModuleTag(document, name) ?? select(shell.get(name));
  const resolved = new Map(NAMES.map(name => [name, current(name)]));
  const listeners = new Set<() => void>();
  const matches = (selector: string) => (node: Node | null) => node instanceof window.Element && node.matches(selector);
  const isModuleTag = matches(MODULE_TAG), isShellSheet = matches(SHELL_SHEET);
  function refresh(rescan: boolean) {
    if (rescan) shell = fromShell(shellSelectors(document, window));
    let changed = false;
    for (const name of NAMES) {
      const next = current(name);
      if (next !== resolved.get(name)) { resolved.set(name, next); changed = true; }
    }
    if (changed) for (const listener of listeners) listener();
  }
  // Module tags are appended once per module, possibly after this plugin, and
  // HMR may replace or rewrite them. The shell's stylesheet links are usually
  // loaded before plugins run; a link added later is rescanned once it loads.
  // Head mutations are rare; plugin sheets toggling there are filtered out,
  // and listeners run only on a real change.
  const observer = new window.MutationObserver(records => {
    const touched = (test: (node: Node | null) => boolean) => records.some(record =>
      test(record.target) || test(record.target.parentElement) || [...record.addedNodes, ...record.removedNodes].some(test));
    const sheets = touched(isShellSheet);
    if (sheets || touched(isModuleTag)) refresh(sheets);
  });
  observer.observe(document.head, { childList: true, subtree: true, characterData: true });
  const onLoad = (event: Event) => { if (isShellSheet(event.target instanceof window.Node ? event.target : null)) refresh(true); };
  document.addEventListener('load', onLoad, true);
  return {
    select: name => resolved.get(name) ?? null,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    dispose() { observer.disconnect(); document.removeEventListener('load', onLoad, true); listeners.clear(); },
  };
}
