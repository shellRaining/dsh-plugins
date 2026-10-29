import { classifyFileType } from '@deepseek-ai/dsh-client-ui-primitives';
import type { Element, ElementContent, Root as HastRoot } from 'hast';
import type { Nodes, Root } from 'mdast';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { mathFromMarkdown } from 'mdast-util-math';
import { gfm } from 'micromark-extension-gfm';
import { math } from 'micromark-extension-math';
import type { Processor } from 'unified';
import type { VFile } from 'vfile';

import { cjkFriendlyStrong } from './syntax/cjkFriendlyStrong.ts';
import { mathCompatibility } from './syntax/mathCompatibility.ts';

/**
 * The host's settled grammar (`parseGfmWithMath` in ui-primitives): GFM, CJK
 * friendly strong emphasis, TeX delimiters, and math, plus the local image
 * recovery pass. Streaming and settled renders share it, so a block never
 * changes structure when its message finishes.
 */
export function remarkDshSyntax(this: Processor): (tree: Root, file: VFile) => void {
  const data = this.data();
  (data.micromarkExtensions ??= []).push(gfm(), cjkFriendlyStrong(), mathCompatibility(), math());
  (data.fromMarkdownExtensions ??= []).push(gfmFromMarkdown(), mathFromMarkdown());
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
