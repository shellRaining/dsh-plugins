import type { ComponentType } from 'react';

import type { ClientContext, Observable, PresentationPolicy } from '../host.ts';

const FALLBACK_POLICY: PresentationPolicy = { settledReasoningPreview: false };
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
 * collapsed default when the official entry or its shape is missing.
 */
export function presentationSource(slots: ClientContext['slots'], self: ComponentType<never>): Observable<PresentationPolicy> {
  for (const entry of slots.entries('conversation.chat.node')) {
    if (entry.options.key !== 'assistant-step' || entry.component === self || entry.inject === undefined) continue;
    try {
      const face: unknown = entry.inject();
      const hooks: unknown = typeof face === 'object' && face !== null ? (face as { hooks?: unknown }).hooks : undefined;
      const source: unknown = typeof hooks === 'object' && hooks !== null ? (hooks as { presentation?: unknown }).presentation : undefined;
      if (isObservable(source)) return source;
    } catch (error) {
      console.warn('dsh-streamdown: official presentation policy unavailable', error);
    }
  }
  return FALLBACK_SOURCE;
}
