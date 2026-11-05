import type { ComponentType } from 'react';

import type { ClientContext, FileMentionsSource, Observable, PresentationPolicy } from '../host.ts';

// One shared object per combination keeps getSnapshot referentially stable.
const POLICIES = {
  all: { true: { settledReasoningPreview: true, foldedReplies: 'all' }, false: { settledReasoningPreview: false, foldedReplies: 'all' } },
  final: { true: { settledReasoningPreview: true, foldedReplies: 'final' }, false: { settledReasoningPreview: false, foldedReplies: 'final' } },
} as const satisfies Record<PresentationPolicy['foldedReplies'], Record<'true' | 'false', PresentationPolicy>>;
// ui-chat defaults foldedReplies to 'all'.
const FALLBACK_POLICY: PresentationPolicy = POLICIES.all.false;
const FALLBACK_SOURCE: Observable<PresentationPolicy> = {
  getSnapshot: () => FALLBACK_POLICY,
  subscribe: () => () => {},
};

function isObservable(value: unknown): value is Observable<PresentationPolicy> {
  return typeof value === 'object' && value !== null &&
    typeof (value as Partial<Observable<unknown>>).getSnapshot === 'function' &&
    typeof (value as Partial<Observable<unknown>>).subscribe === 'function';
}

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined;
}

/**
 * The work-details policy, file mentions, and path resolver reach ui-chat's own
 * assistant-step renderer through that entry's private `inject(sessionId)`.
 * Read it through the registry's inspection view so this entry follows the
 * same settings; callers fall back when the host entry or its shape is missing.
 * @returns the official entry's inject face for this session, or undefined.
 */
export function officialAssistantFace(slots: ClientContext['slots'], self: ComponentType<never>, sessionId: string): unknown {
  try {
    // Restrict the compatibility bridge to the host's known default seat. Do
    // not invoke arbitrary higher-priority replacement plugins' injectors.
    const entry = slots.entries('conversation.chat.node').find((candidate) =>
      candidate.options.key === 'assistant-step' && candidate.component !== self &&
      (candidate.options.priority ?? 0) === 0 && candidate.locale === 'chat');
    return entry?.inject?.(sessionId);
  } catch (error) {
    console.warn('dsh-streamdown: official assistant-step inject unavailable', error);
    return undefined;
  }
}

/** Presentation policy from the official face, or the host defaults without a settled preview. */
export function presentationSource(face: unknown): Observable<PresentationPolicy> {
  const source = field(field(face, 'hooks'), 'presentation');
  if (!isObservable(source)) return FALLBACK_SOURCE;
  let warned = false;
  const warn = (error: unknown) => {
    if (warned) return;
    warned = true;
    console.warn('dsh-streamdown: presentation policy unavailable; using default preview', error);
  };
  return {
    getSnapshot: () => {
      try {
        const policy: unknown = source.getSnapshot();
        const preview = field(policy, 'settledReasoningPreview');
        const replies = field(policy, 'foldedReplies');
        if (typeof preview !== 'boolean' || (replies !== 'all' && replies !== 'final')) {
          warn('unexpected presentation snapshot');
          return FALLBACK_POLICY;
        }
        return POLICIES[replies][preview ? 'true' : 'false'];
      } catch (error) {
        warn(error);
        return FALLBACK_POLICY;
      }
    },
    subscribe: (listener) => {
      try {
        const dispose: unknown = source.subscribe(listener);
        if (typeof dispose !== 'function') {
          warn('unexpected presentation subscription');
          return () => {};
        }
        return () => {
          try { dispose(); } catch (error) { warn(error); }
        };
      } catch (error) {
        warn(error);
        return () => {};
      }
    },
  };
}

interface ChatFileMentionsService {
  forClosing: (...args: unknown[]) => unknown;
}

function isFileMentionsService(value: unknown): value is ChatFileMentionsService {
  return typeof field(value, 'forClosing') === 'function';
}

/**
 * Closing-Turn file mentions: the official entry's resolver when present,
 * otherwise the optional `chatFileMentions` service ui-chat itself consults.
 */
export function fileMentionsSource(face: unknown, ctx: ClientContext, sessionId: string): FileMentionsSource {
  const official = field(face, 'fileMentions');
  if (typeof official === 'function') return official as FileMentionsSource;
  return (owner, getFileTriggerProps) => {
    const service = ctx.get?.('chatFileMentions');
    if (!isFileMentionsService(service)) return undefined;
    return service.forClosing(owner, sessionId, getFileTriggerProps) as ReturnType<FileMentionsSource>;
  };
}

/** The official session path resolver, when the face provides one. */
export function filePathResolver(face: unknown): ((path: string) => string) | undefined {
  const resolve = field(face, 'resolveFilePath');
  return typeof resolve === 'function' ? resolve as (path: string) => string : undefined;
}
