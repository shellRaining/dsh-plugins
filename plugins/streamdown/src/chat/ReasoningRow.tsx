import { DisclosureRow, IconThinkOutlineRegular, TextShimmer } from '@deepseek-ai/dsh-client-ui-primitives';
import { memo, useMemo, useState } from 'react';

import type { AssistantNodeProps } from '../host.ts';
import type { MarkdownEnv } from '../markdown/env.ts';
import { StreamMarkdown } from '../markdown/StreamMarkdown.tsx';

const THINK_ICON = <IconThinkOutlineRegular size={14} />;

function firstLine(text: string): string {
  const newline = text.indexOf('\n');
  return newline === -1 ? text : text.slice(0, newline);
}

function latestCompletedParagraphFirstLine(text: string): string {
  let summary = '';
  let paragraphStart = 0;
  const separator = /\r?\n(?:[\t ]*\r?\n)+/g;
  while (true) {
    const nextParagraph = separator.exec(text);
    const paragraphEnd = nextParagraph === null ? text.length : nextParagraph.index + nextParagraph[0].indexOf('\n');
    const newline = text.indexOf('\n', paragraphStart);
    if (newline !== -1 && newline <= paragraphEnd) {
      const candidate = text.slice(paragraphStart, newline).trim();
      if (candidate !== '') summary = candidate;
    }
    if (nextParagraph === null) return summary;
    paragraphStart = nextParagraph.index + nextParagraph[0].length;
  }
}

type ReasoningBodyProps = Pick<AssistantNodeProps, 'renderFactorySlot'> & {
  text: string;
  running: boolean;
  env: MarkdownEnv;
  interrupted: boolean;
};

// 每次展开独立选择渲染器；结束不换树，收起则卸载，避免隐藏正文继续解析。
const ReasoningBody = memo(function ReasoningBody({ text, running, env, interrupted, renderFactorySlot }: ReasoningBodyProps) {
  const [live] = useState(() => running);
  return live
    ? <StreamMarkdown text={text} env={env} variant="compact" interrupted={interrupted} />
    : renderFactorySlot('conversation.chat.reasoning.content', { text, running });
});

type ReasoningRowProps = ReasoningBodyProps & Pick<AssistantNodeProps, 'usePresentation' | 'useDisclosure' | 't'>;

/**
 * Port of ui-chat's ReasoningRow (0.2.1-rc.3, MIT, DeepSeek). Reasoning opened
 * while running keeps StreamMarkdown until collapsed. Already settled content
 * uses the root Factory; this entry still cannot own the official body slot.
 */
export const ReasoningRow = memo(function ReasoningRow({ text, running, env, interrupted, usePresentation, useDisclosure, renderFactorySlot, t }: ReasoningRowProps) {
  const { expanded, toggle } = useDisclosure();
  const summary = useMemo(() => (
    running ? latestCompletedParagraphFirstLine(text) : firstLine(text)
  ).replaceAll('**', ''), [running, text]);
  const preview = usePresentation((policy) => !expanded && summary !== '' && (running || policy.settledReasoningPreview));
  const collapsedContent = useMemo(() => (
    <>
      <span className="dsh-sd-think-separator" data-shimmer-decoration aria-hidden />
      <span className="dsh-sd-think-summary" data-streaming={running || undefined}>
        <span key={summary} className="dsh-sd-think-summary-text">
          <TextShimmer>{summary}</TextShimmer>
        </span>
      </span>
    </>
  ), [running, summary]);
  const content = expanded ? (
    <div className="dsh-sd-think-body">
      <ReasoningBody text={text} running={running} env={env} interrupted={interrupted} renderFactorySlot={renderFactorySlot} />
    </div>
  ) : undefined;
  return (
    <div
      className="dsh-sd-think"
      data-variant="think"
      data-state={running ? 'running' : 'ok'}
      data-expanded={expanded || undefined}
      data-preview={preview || undefined}
    >
      {running && <span className="dsh-sd-visually-hidden">{t('row.running')}</span>}
      <DisclosureRow
        rowClassName="dsh-sd-think-row"
        leadingClassName="dsh-sd-think-leading"
        titleClassName="dsh-sd-think-title"
        icon={THINK_ICON}
        title={t('message.think')}
        running={running}
        open={expanded}
        expandable
        expandOnRowClick
        onToggle={toggle}
        collapsedContent={collapsedContent}
      >
        {content}
      </DisclosureRow>
    </div>
  );
});
