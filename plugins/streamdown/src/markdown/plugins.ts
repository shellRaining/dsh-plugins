import { classifyFileType } from '@deepseek-ai/dsh-client-ui-primitives';
import type { Element, ElementContent, Root as HastRoot } from 'hast';
import type { Nodes, Root } from 'mdast';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { mathFromMarkdown } from 'mdast-util-math';
import { gfm } from 'micromark-extension-gfm';
import type { Token } from 'micromark-util-types';
import { math } from 'micromark-extension-math';
import type { Processor } from 'unified';
import type { VFile } from 'vfile';

import { cjkFriendlyStrong } from './syntax/cjkFriendlyStrong.ts';
import { mathCompatibility } from './syntax/mathCompatibility.ts';

/**
 * The host's settled grammar (`parseGfmWithMath` in ui-primitives): GFM with
 * literal single tildes, CJK friendly strong emphasis, TeX delimiters, math,
 * and literal Windows path destinations, plus the local image recovery pass.
 * Streaming and settled renders share it, so a block never changes structure
 * when its message finishes.
 */
export function remarkDshSyntax(this: Processor): (tree: Root, file: VFile) => void {
  const data = this.data();
  // GFM strikethrough requires `~~`; a single `~` stays literal, as in ranges such as `10~20`.
  (data.micromarkExtensions ??= []).push(gfm({ singleTilde: false }), cjkFriendlyStrong(), mathCompatibility(), math());
  (data.fromMarkdownExtensions ??= []).push(gfmFromMarkdown(), mathFromMarkdown(), windowsPathDestinations());
  return (tree, file) => {
    recoverLocalImages(tree, String(file.value));
  };
}

/**
 * Ported from ui-primitives `markdown/local-image-syntax` (MIT, DeepSeek):
 * recover unescaped image-only paragraphs whose local path contains spaces.
 */
function recoverLocalImages(root: Root, source: string): void {
  const visit = (node: Nodes): void => {
    if (node.type === 'paragraph' && node.children.length === 1) {
      const [child] = node.children;
      if (child?.type === 'text' && child.position !== undefined &&
        source.slice(child.position.start.offset, child.position.end.offset) === child.value) {
        const match = /^!\[([^\]\n]*)\]\(((?:\/(?!\/)|\.{1,2}\/|[a-z]:[\\/])[^\n<>()[\]"']+\.[a-z\d]+)\)$/iu.exec(child.value);
        const url = match?.[2];
        if (match !== null && url !== undefined && url.includes(' ') && classifyFileType(url) === 'image') {
          node.children = [{ type: 'image', alt: match[1] ?? '', url, position: child.position }];
        }
      }
    } else if ('children' in node) {
      for (const child of node.children) visit(child);
    }
  };
  visit(root);
}

/**
 * Ported from ui-primitives `markdown/windows-path-destinations` (MIT,
 * DeepSeek). A raw destination is a Windows path when it has a backslash and
 * no URL scheme, and either has no `/` or has a backslash before a letter or
 * digit, which CommonMark cannot read as an escape. A drive letter is not a scheme.
 */
function isWindowsPath(raw: string): boolean {
  return raw.includes('\\') && !/^[a-z][a-z\d+.-]+:/iu.test(raw) && (!raw.includes('/') || /\\[\p{L}\p{N}]/u.test(raw));
}

/**
 * Decode character references only, keeping backslashes: the host's
 * `decodeString(raw.replaceAll('\\', '\\\\'))` result. Rules follow
 * micromark-util-decode-string and the browser build of
 * decode-named-character-reference (MIT, Titus Wormer), which this package
 * does not depend on directly.
 */
function decodeReferences(raw: string): string {
  let element: HTMLElement | undefined;
  return raw.replace(/&(#(?:\d{1,7}|x[\da-f]{1,6})|[\da-z]{1,31});/gi, (match, reference: string) => {
    if (reference.startsWith('#')) {
      const hex = reference[1] === 'x' || reference[1] === 'X';
      const code = Number.parseInt(reference.slice(hex ? 2 : 1), hex ? 16 : 10);
      return code < 9 || code === 11 || (code > 13 && code < 32) || (code > 126 && code < 160) ||
        (code > 55_295 && code < 57_344) || (code > 64_975 && code < 65_008) ||
        (code & 65_535) === 65_535 || (code & 65_535) === 65_534 || code > 1_114_111
        ? '\uFFFD'
        : String.fromCodePoint(code);
    }
    // `reference` is ASCII alphanumerics only, so this cannot inject markup.
    element ??= document.createElement('i');
    element.innerHTML = match;
    const character = element.textContent;
    if (character.endsWith(';') && reference !== 'semi') return match;
    return character === match ? match : character;
  });
}

/** Structural slice of mdast-util-from-markdown's CompileContext. */
interface DestinationContext {
  resume(): string;
  sliceSerialize(token: Token): string;
  readonly stack: readonly object[];
}

function exitDestination(this: DestinationContext, token: Token): undefined {
  const parsed = this.resume();
  const raw = this.sliceSerialize(token);
  const node = this.stack.at(-1);
  if (node !== undefined && 'url' in node) (node as { url: string }).url = isWindowsPath(raw) ? decodeReferences(raw) : parsed;
}

/**
 * CommonMark reads `\.` or `\_` in a destination as an escape, so
 * `D:\repo\.github` would parse as `D:\repo.github`. For Windows path
 * destinations keep every backslash literally while character references
 * still decode; other destinations parse unchanged.
 */
function windowsPathDestinations(): { exit: Record<string, typeof exitDestination> } {
  return { exit: { resourceDestinationString: exitDestination, definitionDestinationString: exitDestination } };
}

/** hast property set on tables that keep their natural width and scroll. */
export const WIDE_TABLE_PROPERTY = 'dataDshTableWide';

/** Mark tables with four or more columns outside blockquotes, like the host renderer. */
export function rehypeDshTables(): (tree: HastRoot) => void {
  const walk = (children: readonly ElementContent[] | HastRoot['children'], inBlockquote: boolean): void => {
    for (const child of children) {
      if (child.type !== 'element') continue;
      if (child.tagName === 'table' && !inBlockquote && columnCount(child) >= 4) {
        child.properties[WIDE_TABLE_PROPERTY] = true;
      }
      walk(child.children, inBlockquote || child.tagName === 'blockquote');
    }
  };
  return (tree) => {
    walk(tree.children, false);
  };
}

function columnCount(table: Element): number {
  for (const section of table.children) {
    if (section.type !== 'element') continue;
    const row = section.tagName === 'tr' ? section : section.children.find(
      (candidate): candidate is Element => candidate.type === 'element' && candidate.tagName === 'tr',
    );
    if (row !== undefined) return row.children.filter((cell) => cell.type === 'element').length;
  }
  return 0;
}
