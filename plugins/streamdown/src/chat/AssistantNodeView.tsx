import { JsonBlock, MarkdownText, type MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives';
import { Fragment, memo, type ReactNode, useCallback, useMemo, useState } from 'react';

import type { AssistantBlock, AssistantNodeProps, Translate } from '../host.ts';
import type { ImageLabels, MarkdownEnv } from '../markdown/env.ts';
import { localPathImages } from '../markdown/links.ts';
import { StreamMarkdown } from '../markdown/StreamMarkdown.tsx';
import { ReasoningRow } from './ReasoningRow.tsx';

function markdownLabels(t: Translate): MarkdownLabels {
  return {
    code: {
      copyLabel: t('copy'),
      copiedLabel: t('copied'),
      toolbarLabels: { codeLabel: t('codeBlock.title'), wrapLabel: t('codeBlock.wrap'), unwrapLabel: t('codeBlock.unwrap') },
    },
    footnotes: t('markdown.footnotes'),
  };
}

function imageLabels(t: Translate): ImageLabels {
  return { open: t('image.open'), failed: t('image.failed'), dialog: t('image.dialog'), close: t('image.close') };
}

function ProcessReasoning({ hidden, reveal, useGroupAction, children }: {
  hidden: boolean;
  reveal: () => void;
  useGroupAction: AssistantNodeProps['useGroupAction'];
  children: ReactNode;
}) {
  return <div ref={useGroupAction(hidden, reveal)} data-turn-process-inline={hidden || undefined}>{children}</div>;
}

/**
 * Port of ui-chat's AssistantNodeView + AssistantMarkdown (0.2.1-rc.3, MIT,
 * DeepSeek). Text of a step that was producing output when this instance
 * mounted renders through StreamMarkdown for its whole lifetime, so the reply
 * never swaps renderers when it settles. Steps that were already settled at
 * mount (history, remounts) keep the official MarkdownText.
 */
export const AssistantNodeView = memo(function AssistantNodeView({
  node, groupPart, cwd, openFile, loadImage, fileMentions, turnProcess,
  useDisclosure, useGroupAction, useTurnData, usePresentation, renderFactorySlot, t,
}: AssistantNodeProps) {
  const data = node.data;
  const [live] = useState(() => data.status === 'running');
  const turn = node.location.kind === 'turn' || node.location.kind === 'step' ? node.location.turn : undefined;
  const tail = useTurnData('turn-tail');
  const owner = useMemo(() => {
    if (turn?.status !== 'closed' || data.finalNode === undefined) return undefined;
    if (tail?.closing?.finalNode.seq !== data.finalNode.seq) return undefined;
    return { turn, seq: data.finalNode.seq, openFile };
  }, [data.finalNode, openFile, tail, turn]);
  const mentions = useMemo(() => owner === undefined ? undefined : fileMentions(owner), [fileMentions, owner]);
  const reasoningHidden = turnProcess !== undefined && turnProcess.foldable &&
    turnProcess.spec.answerStep === data.step && turnProcess.spec.inlineReasoning && !turnProcess.open;
  const revealProcess = useCallback(() => {
    turnProcess?.setOpen(true);
  }, [turnProcess]);

  const streaming = data.status === 'running';
  const interrupted = data.status === 'interrupted';
  const blocks = data.blocks;
  const labels = useMemo(() => markdownLabels(t), [t]);
  const images = useMemo(() => imageLabels(t), [t]);
  const env = useMemo<MarkdownEnv>(() => ({
    streaming, labels, imageLabels: images, mentions, openFile, cwd,
  }), [cwd, images, labels, mentions, openFile, streaming]);

  if (!(streaming || interrupted || blocks.some((block) => block.kind !== 'tool-call'))) return null;
  const last = blocks.length - 1;
  const rendered: ReactNode[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block === undefined) continue;
    if (groupPart === 'reasoning' && block.kind !== 'reasoning') continue;
    if (groupPart === 'response' && block.kind === 'reasoning') continue;
    switch (block.kind) {
      case 'text':
        rendered.push(live
          ? <StreamMarkdown key={i} text={block.text} env={env} />
          : <MarkdownText key={i} text={block.text} streaming={streaming} labels={labels} fileMentions={mentions} pathImages={localPathImages} />);
        break;
      case 'reasoning':
        if (block.text.trim() === '') break;
        rendered.push(
          <ProcessReasoning key={i} hidden={reasoningHidden} reveal={revealProcess} useGroupAction={useGroupAction}>
            <ReasoningRow
              text={block.text}
              running={streaming && i === last}
              usePresentation={usePresentation}
              useDisclosure={useDisclosure}
              renderFactorySlot={renderFactorySlot}
              t={t}
            />
          </ProcessReasoning>,
        );
        break;
      case 'image': {
        const start = i;
        const group: { attachment: unknown }[] = [{ attachment: block.attachment }];
        for (let next = blocks[i + 1]; next?.kind === 'image'; next = blocks[i + 1]) {
          group.push({ attachment: next.attachment });
          i += 1;
        }
        rendered.push(
          <Fragment key={start}>
            {renderFactorySlot('conversation.images.content', { images: group, loadImage, align: 'start' })}
          </Fragment>,
        );
        break;
      }
      case 'tool-call':
        break;
      default:
        rendered.push(
          <JsonBlock
            key={i}
            label={t('message.unknownBlock')}
            payload={unknownPayload(block)}
            truncatedLabel={(total) => t('json.truncated', { total })}
          />,
        );
    }
  }
  const stopped = interrupted && (groupPart === undefined || groupPart === 'response' ||
    !blocks.some((block) => block.kind !== 'reasoning' && block.kind !== 'tool-call'));
  return (
    <div className="dsh-sd-root" data-streaming={streaming || undefined}>
      <div className="dsh-sd-body">
        {rendered}
        {stopped && <span className="dsh-sd-stopped">{t('message.stopped')}</span>}
      </div>
    </div>
  );
});

function unknownPayload(block: AssistantBlock): unknown {
  return 'block' in block ? block.block : block;
}
