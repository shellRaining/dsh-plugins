import { HoverCard } from '@deepseek-ai/dsh-client-ui-primitives';
import type { SentAnnotation } from './composer.ts';
import type { UserTextNodeProps } from './host.ts';

/** A sent annotation block inside a user message: one chip, its quote and note on hover. */
export function SentAnnotationChip({ node }: UserTextNodeProps<SentAnnotation>) {
  const { number, quote, note, path } = node.data;
  return <HoverCard inline openDelayMs={200}
    anchor={<span className="dla-sent-chip" tabIndex={0} aria-label={`批注 ${number}`}>批注 {number}</span>}
    content={<div className="dla-sent-card">
      <div className="dla-sent-head">批注 {number}{path ? <span className="dla-sent-path">{path}</span> : null}</div>
      <blockquote>{quote}</blockquote>
      {note ? <p>{note}</p> : null}
    </div>} />;
}
