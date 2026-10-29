import { DisclosureRow, IconThinkOutlineRegular, TextShimmer } from '@deepseek-ai/dsh-client-ui-primitives';
import { memo, useMemo } from 'react';

import type { AssistantNodeProps } from '../host.ts';

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

type ReasoningRowProps = Pick<AssistantNodeProps, 'usePresentation' | 'useDisclosure' | 'renderFactorySlot' | 't'> & {
  text: string;
  running: boolean;
};

/**
 * Port of ui-chat's ReasoningRow (0.2.1-rc.3, MIT, DeepSeek). The body renders
 * through the root `conversation.chat.reasoning.content` Factory, the same
 * content the official body slot uses; this entry cannot own that child slot.
 */
export const ReasoningRow = memo(function ReasoningRow({ text, running, usePresentation, useDisclosure, renderFactorySlot, t }: ReasoningRowProps) {
  const { expanded, toggle } = useDisclosure();
  const summaryText = running ? latestCompletedParagraphFirstLine(text) : firstLine(text);
  const summary = useMemo(() => summaryText.replaceAll('**', ''), [summaryText]);
  const preview = usePresentation((policy) => !expanded && summary !== '' && (running || policy.settledReasoningPreview));
  const collapsedContent = useMemo(() => (
    <>
      <span className="dsh-sd-think-separator" data-shimmer-decoration aria-hidden />
      <span className="dsh-sd-think-summary" data-streaming={running || undefined}>
        <span className="dsh-sd-think-summary-text">
          <TextShimmer>{summary}</TextShimmer>
        </span>
      </span>
    </>
  ), [running, summary]);
  const content = useMemo(() => expanded
    ? <div className="dsh-sd-think-body">{renderFactorySlot('conversation.chat.reasoning.content', { text, running })}</div>
    : undefined, [expanded, renderFactorySlot, running, text]);
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
