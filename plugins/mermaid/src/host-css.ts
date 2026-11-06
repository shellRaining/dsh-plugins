// DSH 0.2.2 ships two unanchored :has() rules in sidebar-files
// (packages/client/ui-sidebar-files/src/client/FilesBody.module.css):
//   :has(> .navigator.fill) > :not(.navigator) { visibility: hidden }
// With them, every light-DOM insertion followed by a layout read restyles the
// whole page (about 20 ms). Mermaid measures text that way dozens of times per
// diagram, so one render froze the page for up to 1.4 s.
//
// The sheet is found by the host's CSS module id and the rules by their shape,
// never by hashed class names. When neither matches (e.g. the host fixed it),
// this does nothing.
const SHEET = 'style[data-plugin-css="@deepseek-ai/dsh-client-ui-sidebar-files/FilesBody.module.css"]';
const NEVER = ':not(*)';

/**
 * Swap those selectors for a non-matching one until the returned function
 * runs. Mermaid renders with promises only, so callers restore within the same
 * task; a frame callback restores first if a render ever spans a frame, so the
 * page is never painted without the host rules.
 */
export function suspendUnanchoredHas(document: Document): () => void {
  const window = document.defaultView;
  if (!window) return () => {};
  const suspended: [CSSStyleRule, string][] = [];
  const visit = (rules: CSSRuleList) => {
    for (const rule of rules) {
      if (rule instanceof window.CSSStyleRule) {
        if (rule.selectorText.startsWith(':has(')) {suspended.push([rule,rule.selectorText]);rule.selectorText=NEVER;}
      } else if (rule instanceof window.CSSGroupingRule) visit(rule.cssRules);
    }
  };
  for (const element of document.querySelectorAll<HTMLStyleElement>(SHEET)) if (element.sheet) visit(element.sheet.cssRules);
  if (!suspended.length) return () => {};
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true; window.cancelAnimationFrame(frame);
    for (const [rule,selector] of suspended) rule.selectorText = selector;
  };
  const frame = window.requestAnimationFrame(restore);
  return restore;
}
