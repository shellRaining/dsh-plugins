// Host CSS-module class names carry a build-specific hash: the npm and darwin
// desktop builds of 0.2.1-rc.3 already differ (eGxaPq_frame vs _4if9eW_frame),
// and the web shell's Vite build uses another format again. Never write them
// literally (build.mjs rejects it). Prefer the host's semantic attributes; for
// components that expose none, read the hashed name at runtime: each package
// module injects one <style data-plugin-css="<package>/<File>.module.css">
// whose id is build-independent.
import type { Dispose } from './context.ts';

/** Host components without a semantic anchor, as [module id, local class]. */
export const HOST_CLASSES = {
  // Right-hand turn rail (an outline next to the conversation).
  turnRail: ['@deepseek-ai/dsh-client-ui-chat/TurnNavigator.module.css', 'frame'],
  // Sidebar search results: tree rows without data-row-key.
  searchResultRow: ['@deepseek-ai/dsh-client-ui-workspace/Rows.module.css', 'searchResultRow'],
} as const satisfies Record<string, readonly [string, string]>;

export type HostClassName = keyof typeof HOST_CLASSES;

export interface HostModules {
  /** `[class~="…"]` (no CSS escaping needed), or null while its module is not loaded. */
  select(name: HostClassName): string | null;
  /** Runs after a resolved selector changes (a module loaded, reloaded or left). */
  subscribe(listener: () => void): Dispose;
  dispose(): void;
}

const MODULE_TAG = 'style[data-plugin-css]';
const NAMES = Object.keys(HOST_CLASSES) as HostClassName[];

function resolve(document: Document, name: HostClassName): string | null {
  const [module, local] = HOST_CLASSES[name];
  const style = document.head.querySelector(`style[data-plugin-css=${JSON.stringify(module)}]`);
  const found = style?.textContent?.match(new RegExp(String.raw`\.([\w-]+_${local})(?![\w-])`))?.[1];
  return found ? `[class~="${found}"]` : null;
}

export function createHostModules(document: Document, window: Window & typeof globalThis): HostModules {
  const resolved = new Map(NAMES.map(name => [name, resolve(document, name)]));
  const listeners = new Set<() => void>();
  const isModuleTag = (node: Node | null) => node instanceof window.Element && node.matches(MODULE_TAG);
  // Module tags are appended once per module, possibly after this plugin, and
  // HMR may replace or rewrite them. Head mutations are rare; plugin sheets
  // toggling there are filtered out, and listeners run only on a real change.
  const observer = new window.MutationObserver(records => {
    const touched = records.some(record =>
      isModuleTag(record.target) || isModuleTag(record.target.parentElement)
      || [...record.addedNodes, ...record.removedNodes].some(isModuleTag));
    if (!touched) return;
    let changed = false;
    for (const name of NAMES) {
      const next = resolve(document, name);
      if (next !== resolved.get(name)) { resolved.set(name, next); changed = true; }
    }
    if (changed) for (const listener of listeners) listener();
  });
  observer.observe(document.head, { childList: true, subtree: true, characterData: true });
  return {
    select: name => resolved.get(name) ?? null,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    dispose() { observer.disconnect(); listeners.clear(); },
  };
}
