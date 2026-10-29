import katex from 'katex';
import { createElement, type CSSProperties, type ReactNode, useRef } from 'react';

/**
 * TeX → React through KaTeX, ported from ui-primitives `markdown/katex`
 * (MIT, Copyright (c) 2026 DeepSeek): the same strict / `strict: 'ignore'` /
 * error-span chain and a DOM-identical element tree. KaTeX output is a static
 * span/MathML/SVG vocabulary with no authored HTML.
 */
function styleObject(css: string): CSSProperties {
  const style: Record<string, string> = {};
  for (const declaration of css.split(';')) {
    const colon = declaration.indexOf(':');
    if (colon === -1) continue;
    const key = declaration.slice(0, colon).trim().replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    style[key] = declaration.slice(colon + 1).trim();
  }
  return style as CSSProperties;
}

function domToReact(node: ChildNode, key: number): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (!(node instanceof Element)) return null;
  const props: Record<string, unknown> = { key };
  for (const attribute of node.attributes) {
    if (attribute.name === 'class') props['className'] = attribute.value;
    else if (attribute.name === 'style') props['style'] = styleObject(attribute.value);
    else props[attribute.name] = attribute.value;
  }
  const children = [...node.childNodes].map(domToReact);
  return children.length === 0
    ? createElement(node.localName, props)
    : createElement(node.localName, props, ...children);
}

function toReact(html: string): ReactNode[] {
  return [...new DOMParser().parseFromString(html, 'text/html').body.childNodes].map(domToReact);
}

/** Strict KaTeX render, or undefined when the TeX does not parse. */
function renderStrict(value: string, displayMode: boolean): ReactNode[] | undefined {
  try {
    return toReact(katex.renderToString(value, { displayMode, throwOnError: true }));
  } catch {
    return undefined;
  }
}

/** The host's fallback arms: lenient render, then a red error span. */
function renderLenient(value: string, displayMode: boolean): ReactNode {
  try {
    return toReact(katex.renderToString(value, { displayMode, strict: 'ignore', throwOnError: false }));
  } catch (error) {
    return <span className="katex-error" style={{ color: '#cc0000' }} title={String(error)}>{value}</span>;
  }
}

/**
 * One formula. While its block is still streaming, TeX that does not parse
 * yet keeps the last formula that did (or the source before the first one),
 * so half-written commands never flash KaTeX errors; settled blocks use the
 * host's error chain unchanged.
 */
export function MathView({ value, display, streaming }: { value: string; display: boolean; streaming: boolean }) {
  const lastGood = useRef<{ value: string; nodes: ReactNode[] } | null>(null);
  if (lastGood.current?.value !== value) {
    const nodes = renderStrict(value, display);
    if (nodes !== undefined) lastGood.current = { value, nodes };
    else if (!streaming) return <>{renderLenient(value, display)}</>;
  }
  if (lastGood.current !== null) return <>{lastGood.current.nodes}</>;
  return display
    ? <div className="dsh-sd-math-pending">{value}</div>
    : <span className="dsh-sd-math-pending">{value}</span>;
}
