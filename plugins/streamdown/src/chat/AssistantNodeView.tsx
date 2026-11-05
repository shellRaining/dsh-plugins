import { JsonBlock, MarkdownText, type MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives';
import { Fragment, memo, type ReactNode, useCallback, useMemo, useState } from 'react';

import type { AssistantBlock, AssistantNodeProps, Translate } from '../host.ts';
import type { ImageLabels, MarkdownEnv } from '../markdown/env.ts';
import { localPathImages, resolveWorkspacePath } from '../markdown/links.ts';
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

const NO_CONTEXT_MENU = (): undefined => undefined;

function ProcessReasoning({ hidden, reveal, useGroupAction, children }: {
  hidden: boolean;
  reveal: () => void;
  useGroupAction: AssistantNodeProps['useGroupAction'];
  children: ReactNode;
}) {
  return <div ref={useGroupAction(hidden, reveal)} data-turn-process-inline={hidden || undefined}>{children}</div>;
}

/**
 * Port of ui-chat's AssistantNodeView + AssistantMarkdown (0.2.2-rc.1, MIT,
 * DeepSeek). Text of a step that was producing output when this instance
 * mounted renders through StreamMarkdown for its whole lifetime, so the reply
 * never swaps renderers when it settles. Steps that were already settled at
 * mount (history, remounts) keep the official MarkdownText.
 */
export const AssistantNodeView = memo(function AssistantNodeView({
  node, groupPart, cwd, openFile, loadImage, fileMentions, turnProcess, sessionId, useContextMenu, resolveFilePath,
  useDisclosure, useGroupAction, useTurnData, usePresentation, renderFactorySlot, t,
}: AssistantNodeProps) {
  // ui-context-menu provides this prop at the root through provideRoot. It is
  // a plain getter with no React hooks inside, so calling a fallback when the
  // plugin is absent is safe.
  const menu = (useContextMenu ?? NO_CONTEXT_MENU)();
  const getTriggerProps = menu?.getTriggerProps;
  const getFileTriggerProps = useMemo(() => {
    if (getTriggerProps === undefined || sessionId === undefined) return undefined;
    // Degraded path only: without the official resolveFilePath this joins the
    // owner cwd, whereas ui-chat's sessionFilePath prefers the session's live
    // workingDirectory projection.
    const resolve = resolveFilePath ?? ((path: string) => resolveWorkspacePath(cwd, path));
    return (path: string) => getTriggerProps(() => ({ kind: 'file', value: { sessionId, path: resolve(path) } }));
  }, [cwd, getTriggerProps, resolveFilePath, sessionId]);
  const data = node.data;
  const [live] = useState(() => data.status === 'running');
  const turn = node.location.kind === 'turn' || node.location.kind === 'step' ? node.location.turn : undefined;
  const tail = useTurnData('turn-tail');
  const owner = useMemo(() => {
    if (turn?.status !== 'closed' || data.finalNode === undefined) return undefined;
    if (tail?.closing?.finalNode.seq !== data.finalNode.seq) return undefined;
    return { turn, seq: data.finalNode.seq, openFile };
  }, [data.finalNode, openFile, tail, turn]);
  // ui-chat 0.2.2 moved this resolver from owner props into the entry inject;
  // guard it so a missing or reshaped source leaves inline code inert.
  const mentions = useMemo(
    () => owner === undefined || typeof fileMentions !== 'function' ? undefined : fileMentions(owner, getFileTriggerProps),
    [fileMentions, getFileTriggerProps, owner],
  );
  // ui-chat 0.2.2: when folded Turns keep every reply, reasoning outside the
  // seat's 'reasoning' part hides behind the Turn disclosure.
  const keepReplies = usePresentation((policy) => policy.foldedReplies === 'all');
  const reasoningHidden = turnProcess !== undefined && turnProcess.foldable &&
    (keepReplies ? groupPart !== 'reasoning' : turnProcess.spec.answerStep === data.step && turnProcess.spec.inlineReasoning) &&
    !turnProcess.open;
  const revealProcess = useCallback(() => {
    turnProcess?.setOpen(true);
  }, [turnProcess]);

  const streaming = data.status === 'running';
  // Same gate as ui-chat: only a settled reply with a durable message id.
  const textInteractionSource = data.status === 'settled' && data.finalNode?.messageId !== undefined;
  const interrupted = data.status === 'interrupted';
  const blocks = data.blocks;
  const labels = useMemo(() => markdownLabels(t), [t]);
  const images = useMemo(() => imageLabels(t), [t]);
  const settledEnv = useMemo<MarkdownEnv>(() => ({
    streaming: false, labels, imageLabels: images, mentions, openFile, cwd,
  }), [cwd, images, labels, mentions, openFile]);
  const streamingEnv = useMemo<MarkdownEnv>(() => ({ ...settledEnv, streaming: true }), [settledEnv]);

  if (!(streaming || interrupted || blocks.some((block) => block.kind !== 'tool-call'))) return null;
  const last = blocks.length - 1;
  const rendered: ReactNode[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block === undefined) continue;
    if (groupPart === 'reasoning' && block.kind !== 'reasoning') continue;
    if (groupPart === 'response' && block.kind === 'reasoning') continue;
    const blockStreaming = streaming && i === last;
    const env = blockStreaming ? streamingEnv : settledEnv;
    switch (block.kind) {
      case 'text':
        rendered.push(live
          ? <StreamMarkdown key={i} text={block.text} env={env} interrupted={interrupted} textInteractionSource={textInteractionSource} />
          : <MarkdownText key={i} text={block.text} streaming={blockStreaming} labels={labels} fileMentions={mentions} pathImages={localPathImages} textInteractionSource={textInteractionSource} />);
        break;
      case 'reasoning':
        if (block.text.trim() === '') break;
        rendered.push(
          <ProcessReasoning key={i} hidden={reasoningHidden} reveal={revealProcess} useGroupAction={useGroupAction}>
            <ReasoningRow
              text={block.text}
              running={blockStreaming}
              env={env}
              interrupted={interrupted}
              textInteractionSource={textInteractionSource}
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
