import type { Element, Parents } from 'hast';
import type { Components } from 'hast-util-to-jsx-runtime';
import type { Options as RemarkRehypeOptions } from 'remark-rehype';
import type { PluggableList } from 'unified';

// Fork: upstream imports these from react-markdown@10, whose React peer
// would pull a second React into the workspace. The shapes mirror its
// synchronous `Options`; keep them in sync with CachedMarkdown's `post`.

export type UrlTransform = (url: string, key: string, node: Readonly<Element>) => string | null | undefined;

export type AllowElement = (element: Readonly<Element>, index: number, parent: Readonly<Parents> | undefined) => boolean | null | undefined;

export interface MarkdownOptions {
  allowElement?: AllowElement | null | undefined;
  allowedElements?: readonly string[] | null | undefined;
  children?: string | null | undefined;
  components?: Partial<Components> | null | undefined;
  disallowedElements?: readonly string[] | null | undefined;
  rehypePlugins?: PluggableList | null | undefined;
  remarkPlugins?: PluggableList | null | undefined;
  remarkRehypeOptions?: Readonly<RemarkRehypeOptions> | null | undefined;
  skipHtml?: boolean | null | undefined;
  unwrapDisallowed?: boolean | null | undefined;
  urlTransform?: UrlTransform | null | undefined;
}

const safeProtocol = /^(https?|ircs?|mailto|xmpp)$/i;

/** react-markdown's default: keep relative URLs and safe protocols, drop the rest. */
export function defaultUrlTransform(value: string): string {
  const colon = value.indexOf(':');
  const questionMark = value.indexOf('?');
  const numberSign = value.indexOf('#');
  const slash = value.indexOf('/');

  if (
    colon === -1 ||
    (slash !== -1 && colon > slash) ||
    (questionMark !== -1 && colon > questionMark) ||
    (numberSign !== -1 && colon > numberSign) ||
    safeProtocol.test(value.slice(0, colon))
  ) {
    return value;
  }

  return '';
}
