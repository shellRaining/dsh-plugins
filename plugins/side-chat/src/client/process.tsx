// Process rows (reasoning, tool calls) built on the shell's DisclosureRow so
// they look and behave like the main transcript's process rows.
import {
  DiffBlock,
  DisclosureRow,
  IconApiOutlineRegular,
  IconBrowseOutlineRegular,
  IconEditOutlineRegular,
  IconGlobeOutlineRegular,
  IconSearchOutlineRegular,
  IconSparkleRegular,
  IconThinkOutlineRegular,
  MarkdownText,
  Tag,
  TerminalBlock,
  type DiffHunk,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { memo, useCallback, useMemo, useState, type ReactNode } from 'react';
import type { MarkdownLabels, PanelLabels } from './labels.ts';
import type { AssistantBlock } from './model.ts';
import type { Translate } from './host.ts';

type ToolBlock = Extract<AssistantBlock, { kind: 'tool-call' }>;
type Variant = 'bash' | 'read' | 'edit' | 'search' | 'web' | 'others';

const VARIANT_ICONS: Record<Variant, ReactNode> = {
  bash: <IconApiOutlineRegular size={14} />,
  read: <IconBrowseOutlineRegular size={14} />,
  edit: <IconEditOutlineRegular size={14} />,
  search: <IconSearchOutlineRegular size={14} />,
  web: <IconGlobeOutlineRegular size={14} />,
  others: <IconSparkleRegular size={14} />,
};

function variantOf(name: string): Variant {
  const tool = name.toLowerCase();
  if (/^(bash|pwsh|shell|terminal)/.test(tool)) return 'bash';
  if (tool === 'read' || tool === 'read_image') return 'read';
  if (tool === 'write' || tool === 'edit' || tool.includes('replace')) return 'edit';
  if (tool === 'grep' || tool === 'glob' || tool.includes('search')) return 'search';
  if (tool.startsWith('web')) return 'web';
  return 'others';
}

const SUMMARY_FIELDS = ['command', 'file_path', 'path', 'pattern', 'query', 'url', 'description', 'prompt', 'objective'] as const;
/** Tools with a localized title (`tool.<name>`); others show their own name. */
const TITLED_TOOLS: ReadonlySet<string> = new Set(['bash', 'read', 'write', 'edit', 'glob', 'grep', 'web_fetch', 'web_search']);

function parseArgs(raw: string): Record<string, unknown> | null {
  if (raw.trim() === '') return null;
  try {
    const value: unknown = JSON.parse(raw);
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function firstLine(text: string, max = 160): string {
  const line = text.trim().split('\n', 1)[0] ?? '';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

function useToggle(): [boolean, () => void] {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen(value => !value), []);
  return [open, toggle];
}

export const ReasoningRow = memo(function ReasoningRow(props: {
  text: string;
  running: boolean;
  labels: MarkdownLabels;
  t: Translate;
}) {
  const { text, running, labels, t } = props;
  const [open, toggle] = useToggle();
  const preview = useMemo(() => firstLine(text.replace(/[*_#>`]/g, '')), [text]);
  return (
    <DisclosureRow
      icon={<IconThinkOutlineRegular size={14} />}
      title={running ? t('reasoning.running') : t('reasoning.done')}
      open={open}
      expandable
      onToggle={toggle}
      running={running}
      expandOnRowClick
      previewChevron
      collapsedContent={preview === '' ? undefined : (
        <span className="dsc-row-collapsed">
          <span className="dsc-sep" aria-hidden="true" />
          <span className="dsc-row-summary">{preview}</span>
        </span>
      )}
    >
      <div className="dsc-detail dsc-reasoning">
        <MarkdownText text={text} streaming={running} labels={labels} variant="compact" />
      </div>
    </DisclosureRow>
  );
});

export const ToolRow = memo(function ToolRow(props: {
  block: ToolBlock;
  running: boolean;
  labels: PanelLabels;
  t: Translate;
}) {
  const { block, running, labels, t } = props;
  const [open, toggle] = useToggle();
  const variant = variantOf(block.name);
  const args = useMemo(() => parseArgs(block.argsRaw), [block.argsRaw]);
  const summary = useMemo(() => {
    for (const field of SUMMARY_FIELDS) {
      const value = args?.[field];
      if (typeof value === 'string' && value.trim() !== '') return firstLine(value);
    }
    return '';
  }, [args]);
  const failed = block.result?.isError === true;
  const title = block.name === '' ? t('tool.fallback') : TITLED_TOOLS.has(block.name) ? t(`tool.${block.name}`) : block.name;
  const command = typeof args?.command === 'string' ? args.command : null;
  const path = typeof args?.file_path === 'string' ? args.file_path : typeof args?.path === 'string' ? args.path : '';
  const diffs = useMemo((): DiffHunk[] => {
    if (variant !== 'edit' || args === null || path === '') return [];
    if (typeof args.old_string === 'string' && typeof args.new_string === 'string') {
      return [{ path, oldText: args.old_string, newText: args.new_string }];
    }
    if (typeof args.content === 'string') return [{ path, oldText: null, newText: args.content }];
    return [];
  }, [args, path, variant]);

  const result = block.result === null ? null : (
    <pre className="dsc-pre" data-error={failed ? '' : undefined}>
      {block.result.text === '' ? t('tool.emptyOutput') : block.result.text}
    </pre>
  );
  let body: ReactNode;
  if (variant === 'bash' && command !== null) {
    body = (
      <TerminalBlock
        command={command}
        output={block.result?.text}
        running={running}
        maxLines={16}
        labels={labels.terminal}
      />
    );
  } else if (diffs.length > 0) {
    body = (
      <>
        <DiffBlock diffs={diffs} labels={labels.diff} maxLines={16} />
        {failed ? result : null}
      </>
    );
  } else {
    const pretty = args === null ? block.argsRaw : JSON.stringify(args, null, 2);
    body = (
      <>
        {pretty.trim() === '' || pretty === '{}' ? null : (
          <>
            <span className="dsc-caption">{t('tool.arguments')}</span>
            <pre className="dsc-pre">{pretty}</pre>
          </>
        )}
        {result === null ? null : (
          <>
            <span className="dsc-caption">{t('tool.result')}</span>
            {result}
          </>
        )}
      </>
    );
  }

  const collapsed = failed || summary !== '' ? (
    <span className="dsc-row-collapsed">
      <span className="dsc-sep" aria-hidden="true" />
      {failed ? <Tag tone="danger">{t('tool.failed')}</Tag> : null}
      {summary === '' ? null : <span className="dsc-row-summary">{summary}</span>}
    </span>
  ) : undefined;

  return (
    <DisclosureRow
      icon={VARIANT_ICONS[variant]}
      title={title}
      open={open}
      expandable
      onToggle={toggle}
      running={running}
      expandOnRowClick
      previewChevron
      keepContentWhenOpen
      collapsedContent={collapsed}
    >
      <div className="dsc-detail">{body}</div>
    </DisclosureRow>
  );
});
