import { memo, useMemo } from 'react';
import type { PluggableList } from 'unified';

import { Streamdown } from '../streamdown/index.ts';
import { components, md } from './components.tsx';
import { type MarkdownEnv, MarkdownEnvProvider } from './env.ts';
import { rehypeDshTables, remarkDshSyntax } from './plugins.ts';

const REMARK_PLUGINS: PluggableList = [remarkDshSyntax];
const REHYPE_PLUGINS: PluggableList = [rehypeDshTables];
// Single tildes stay literal only while remend runs on the open tail; the
// settled grammar may pair them into strikethrough, so leave them alone and
// let the tail render exactly what the finished block will.
const REMEND_OPTIONS = { singleTilde: false } as const;
// Components own every URL decision (see links.ts), so attributes pass through untouched here.
const keepUrl = (url: string): string => url;

/**
 * Assistant Markdown through the forked Streamdown engine: smoothed reveal,
 * per-character fade on the open tail, and the host grammar and typography for
 * every block. The same tree serves streaming and settled states, so a reply
 * never swaps renderers when it finishes.
 */
interface StreamMarkdownProps {
  text: string;
  env: MarkdownEnv;
  variant?: 'body' | 'compact';
  interrupted?: boolean;
}

export const StreamMarkdown = memo(function StreamMarkdown({ text, env, variant = 'body', interrupted = false }: StreamMarkdownProps) {
  const remarkRehypeOptions = useMemo(() => ({ footnoteLabel: env.labels.footnotes }), [env.labels.footnotes]);
  return (
    <MarkdownEnvProvider value={env}>
      <Streamdown
        className={variant === 'compact' ? `${md.root} dsh-sd-md-compact` : md.root}
        content={text}
        streaming={env.streaming}
        interrupted={interrupted}
        components={components}
        rehypePlugins={REHYPE_PLUGINS}
        remarkPlugins={REMARK_PLUGINS}
        remarkRehypeOptions={remarkRehypeOptions}
        remend={REMEND_OPTIONS}
        urlTransform={keepUrl}
      />
    </MarkdownEnvProvider>
  );
});
