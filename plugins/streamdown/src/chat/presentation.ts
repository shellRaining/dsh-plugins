import type { ComponentType } from 'react';

import type { ClientContext, Observable, PresentationPolicy } from '../host.ts';

const FALLBACK_POLICY: PresentationPolicy = { settledReasoningPreview: false };
const PREVIEW_POLICY: PresentationPolicy = { settledReasoningPreview: true };
const FALLBACK_SOURCE: Observable<PresentationPolicy> = {
  getSnapshot: () => FALLBACK_POLICY,
  subscribe: () => () => {},
};

function isObservable(value: unknown): value is Observable<PresentationPolicy> {
  return typeof value === 'object' && value !== null &&
    typeof (value as Partial<Observable<unknown>>).getSnapshot === 'function' &&
    typeof (value as Partial<Observable<unknown>>).subscribe === 'function';
}

/**
 * The work-details policy reaches ui-chat's own assistant-step renderer through
 * that entry's private `inject`. Read it through the registry's inspection view
 * so the reasoning preview follows the same setting; fall back to the
 * no-settled-preview default when the host entry or its shape is missing.
 */
export function presentationSource(slots: ClientContext['slots'], self: ComponentType<never>): Observable<PresentationPolicy> {
  try {
    // Restrict the compatibility bridge to the host's known default seat. Do
    // not invoke arbitrary higher-priority replacement plugins' injectors.
    const entry = slots.entries('conversation.chat.node').find((candidate) =>
      candidate.options.key === 'assistant-step' && candidate.component !== self &&
      (candidate.options.priority ?? 0) === 0 && candidate.locale === 'chat');
    const face: unknown = entry?.inject?.();
    const hooks: unknown = typeof face === 'object' && face !== null ? (face as { hooks?: unknown }).hooks : undefined;
    const source: unknown = typeof hooks === 'object' && hooks !== null ? (hooks as { presentation?: unknown }).presentation : undefined;
    if (isObservable(source)) {
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
            if (typeof policy !== 'object' || policy === null ||
              typeof (policy as Partial<PresentationPolicy>).settledReasoningPreview !== 'boolean') {
              warn('unexpected presentation snapshot');
              return FALLBACK_POLICY;
            }
            return (policy as PresentationPolicy).settledReasoningPreview ? PREVIEW_POLICY : FALLBACK_POLICY;
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
  } catch (error) {
    console.warn('dsh-streamdown: official presentation policy unavailable', error);
  }
  return FALLBACK_SOURCE;
}
