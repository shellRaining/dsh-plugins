// A plugin-owned <style> element that can be mounted, unmounted and disposed
// repeatedly. Feature modules never write host stylesheets or inline styles.
export interface StyleSheet {
  toggle(enabled: boolean): void;
  /** Replace the rules, e.g. after a host module class resolves (host/modules.ts). */
  set(css: string): void;
  dispose(): void;
}

export function createStyleSheet(document: Document, id: string, css: string): StyleSheet {
  const node = document.createElement('style');
  node.dataset.plugin = id;
  node.textContent = css;
  return {
    toggle(enabled) {
      if (!enabled) node.remove();
      else if (!node.isConnected) document.head.append(node);
    },
    set(next) { if (node.textContent !== next) node.textContent = next; },
    dispose() { node.remove(); },
  };
}
