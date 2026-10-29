import {
  classifyLinkPath, CodeBlock, ImageLightbox, LinkIconMedium,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { Element, ElementContent } from 'hast';
import { type ReactNode, useCallback, useState } from 'react';
import type { Components } from 'hast-util-to-jsx-runtime';

import { useStreamdownBlockState } from '../streamdown/index.ts';
import { InLinkProvider, useInLink, useMarkdownEnv } from './env.ts';
import {
  imageSource, inlineCodeHttpUrl, normalizeUri, parseFileLink, resolveWorkspacePath, fileMediaUrl, sanitizeUrl,
  type FileLink,
} from './links.ts';
import { MathView } from './math.tsx';
import { WIDE_TABLE_PROPERTY } from './plugins.ts';

/** Class names of the ported host Markdown sheet (see styles.ts). */
export const md = {
  root: 'dsh-sd-md',
  linkIcon: 'dsh-sd-link-icon',
  tableScroll: 'dsh-sd-table-scroll',
  tableFill: 'dsh-sd-table-fill',
  imageAlt: 'dsh-sd-image-alt',
  image: 'dsh-sd-image',
  imageButton: 'dsh-sd-image-button',
  fileMention: 'dsh-sd-file-mention',
  fileLink: 'dsh-sd-file-link',
} as const;

const INCOMPLETE_LINK = 'streamdown:incomplete-link';

interface HastProps {
  node?: Element | undefined;
  children?: ReactNode;
}

function classList(node: Element | undefined): string[] {
  const value = node?.properties.className;
  return Array.isArray(value) ? value.map(String) : [];
}

function hastText(node: Element | ElementContent | undefined): string {
  if (node === undefined) return '';
  if (node.type === 'text') return node.value;
  if (node.type !== 'element') return '';
  return node.children.map(hastText).join('');
}

/** Fences keep incremental highlighting only while they are the open tail of a running message. */
function useBlockStreaming(): boolean {
  const { streaming } = useMarkdownEnv();
  return useStreamdownBlockState() === 'streaming' && streaming;
}

function Pre({ node }: HastProps) {
  const env = useMarkdownEnv();
  const streaming = useBlockStreaming();
  const code = node?.children.find(
    (child): child is Element => child.type === 'element' && child.tagName === 'code',
  );
  const classes = classList(code);
  const value = hastText(code);
  if (classes.includes('math-display')) return <MathView value={value} display streaming={streaming} />;
  const language = classes.find((name) => name.startsWith('language-'))?.slice('language-'.length);
  if (value === '') return <pre><code className={language === undefined ? undefined : `language-${language}`} /></pre>;
  const lang = language === undefined ? undefined : /^[\w-]+/.exec(language)?.[0];
  if (lang === 'math') return <MathView value={value} display streaming={streaming} />;
  return (
    <CodeBlock
      code={value}
      lang={lang}
      streaming={streaming}
      copyLabel={env.labels.code.copyLabel}
      copiedLabel={env.labels.code.copiedLabel}
      toolbarLabels={env.labels.code.toolbarLabels}
    />
  );
}

function Code({ node }: HastProps) {
  const env = useMarkdownEnv();
  const inLink = useInLink();
  const streaming = useBlockStreaming();
  const value = hastText(node);
  if (classList(node).includes('math-inline')) return <MathView value={value} display={false} streaming={streaming} />;
  const href = inlineCodeHttpUrl(value);
  if (href !== undefined) return <code><SafeLink href={href} glyph>{value}</SafeLink></code>;
  const mention = inLink ? undefined : env.mentions?.resolve(value);
  if (mention === undefined) return <code>{value}</code>;
  return (
    <code>
      <button type="button" className={md.fileMention} title={mention.title} aria-label={mention.label} onClick={mention.open}>
        <LinkIconMedium kind={classifyLinkPath(value)} className={md.linkIcon} />
        {value}
      </button>
    </code>
  );
}

function SafeLink({ href, glyph, children }: { href: string; glyph: boolean; children: ReactNode }) {
  const safe = sanitizeUrl(href);
  if (safe === '') return <>{children}</>;
  const external = ['http:', 'https:'].includes(new URL(safe).protocol);
  return (
    <a href={safe} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {glyph && <LinkIconMedium kind="url" href={safe} className={md.linkIcon} />}
      {children}
    </a>
  );
}

function FileLinkButton({ file, glyph, children }: { file: FileLink; glyph: boolean; children: ReactNode }) {
  const { openFile } = useMarkdownEnv();
  if (openFile === undefined) return <>{children}</>;
  return (
    <button
      type="button"
      className={`${md.fileMention} ${md.fileLink}`}
      title={file.path}
      onClick={() => {
        if (file.line === undefined) openFile(file.path);
        else openFile(file.path, { line: file.line });
      }}
    >
      {glyph && <LinkIconMedium kind={classifyLinkPath(file.path)} className={md.linkIcon} />}
      {children}
    </button>
  );
}

function Anchor({ node, href, children }: HastProps & { href?: string | undefined }) {
  const url = href ?? '';
  // Anchors around pictures (badges, thumbnails) skip the leading glyph.
  const elements = node?.children.filter((child): child is Element => child.type === 'element') ?? [];
  const glyph = !(elements.length > 0 && elements.length === node?.children.length && elements.every((child) => child.tagName === 'img'));
  const content = <InLinkProvider value>{children}</InLinkProvider>;
  // remend completes a half-written `[text](` to this marker; keep the link
  // look (glyph included) so the finished link does not shift the line.
  if (url === INCOMPLETE_LINK) {
    return <a aria-disabled="true">{glyph && <LinkIconMedium kind="url" className={md.linkIcon} />}{content}</a>;
  }
  const file = parseFileLink(url);
  if (file !== undefined) return <FileLinkButton file={file} glyph={glyph}>{content}</FileLinkButton>;
  return <SafeLink href={normalizeUri(url)} glyph={glyph}>{content}</SafeLink>;
}

function Image({ src, alt }: HastProps & { src?: string | undefined; alt?: string | undefined }) {
  const { cwd } = useMarkdownEnv();
  const inLink = useInLink();
  const destination = src ?? '';
  const file = parseFileLink(destination);
  const source = (file === undefined ? undefined : fileMediaUrl(document.baseURI, resolveWorkspacePath(cwd, file.path))) ??
    imageSource(destination);
  if (source === undefined) return <span className={md.imageAlt}>{alt ?? ''}</span>;
  return <LoadedImage key={source} src={source} alt={alt ?? ''} destination={destination} preview={!inLink} />;
}

function LoadedImage({ src, alt, destination, preview }: { src: string; alt: string; destination: string; preview: boolean }) {
  const { imageLabels } = useMarkdownEnv();
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => {
    setOpen(false);
  }, []);
  if (failed) {
    return <span className={md.imageAlt}>{preview ? `${imageLabels.failed} · ` : ''}{alt || destination}</span>;
  }
  const img = (
    <img
      className={md.image}
      src={src}
      alt={alt}
      onError={() => {
        setFailed(true);
      }}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
    />
  );
  if (!preview) return img;
  return (
    <>
      <button
        type="button"
        className={md.imageButton}
        title={imageLabels.open}
        aria-label={alt ? `${imageLabels.open}: ${alt}` : imageLabels.open}
        onClick={() => {
          setOpen(true);
        }}
      >
        {img}
      </button>
      {open && <ImageLightbox src={src} alt={alt} labels={imageLabels} onClose={close} />}
    </>
  );
}

function Table({ node, children }: HastProps) {
  const wide = node?.properties[WIDE_TABLE_PROPERTY] === true;
  return (
    <div className={`${md.tableScroll} ${wide ? 'md-table-wide' : md.tableFill}`} tabIndex={wide ? 0 : undefined}>
      <table>{children}</table>
    </div>
  );
}

/** Host-equivalent renderers for the elements the default hast mapping does not cover. */
export const components: Partial<Components> = {
  a: Anchor,
  code: Code,
  img: Image,
  pre: Pre,
  table: Table,
};
