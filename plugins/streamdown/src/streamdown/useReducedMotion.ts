import { useSyncExternalStore } from 'react';

let motionQuery: MediaQueryList | undefined;

function reducedMotionQuery(): MediaQueryList | undefined {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
  return motionQuery ??= window.matchMedia('(prefers-reduced-motion: reduce)');
}

function subscribeMotion(listener: () => void): () => void {
  const query = reducedMotionQuery();
  query?.addEventListener('change', listener);
  return () => query?.removeEventListener('change', listener);
}

const motionSnapshot = () => reducedMotionQuery()?.matches ?? false;
const serverSnapshot = () => false;

/** One shared media query, with subscriptions owned by each mounted consumer. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeMotion, motionSnapshot, serverSnapshot);
}

function subscribeVisibility(listener: () => void): () => void {
  if (typeof document === 'undefined') return () => {};
  document.addEventListener('visibilitychange', listener);
  return () => document.removeEventListener('visibilitychange', listener);
}

const visibilitySnapshot = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

/** Hidden pages do not accumulate a reveal backlog to replay on return. */
export function usePageHidden(): boolean {
  return useSyncExternalStore(subscribeVisibility, visibilitySnapshot, serverSnapshot);
}
