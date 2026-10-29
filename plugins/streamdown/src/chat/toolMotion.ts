/** Optional decoration of host tool rows; never takes ownership of their React tree. */
const TOOL_ROW = '[data-chat-call-id] [data-variant][data-state]';
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function isLiveTransition(previous: string | null, current: string | null): boolean {
  return (previous === 'preparing' || previous === 'running') &&
    current !== previous &&
    (current === 'running' || current === 'ok' || current === 'error' || current === 'stopped');
}

/** Animate only observed lifecycle transitions, not initial mounts or historical results. */
export function installToolMotion(): () => void {
  if (typeof MutationObserver === 'undefined' || typeof matchMedia === 'undefined' || document.body === null) {
    return () => {};
  }
  const preference = matchMedia(REDUCED_MOTION);
  const active = new Map<HTMLElement, Animation>();
  const cancelAll = () => {
    for (const animation of active.values()) animation.cancel();
    active.clear();
  };
  const observer = new MutationObserver((records) => {
    // Several state changes can be published in a single microtask. Decorate the
    // final state once, without queuing obsolete transitions ahead of the result.
    const changed = new Map<HTMLElement, string | null>();
    for (const record of records) {
      const element = record.target;
      if (element instanceof HTMLElement && !changed.has(element)) changed.set(element, record.oldValue);
    }
    for (const [element, previous] of changed) {
      if (!element.isConnected || element.closest('[hidden], [aria-hidden="true"]') !== null || !element.matches(TOOL_ROW) ||
        !isLiveTransition(previous, element.getAttribute('data-state')) || typeof element.animate !== 'function') continue;
      active.get(element)?.cancel();
      // Offscreen or collapsed results must not spend animation work or replay
      // an old transition when the reader later opens their process group.
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0 || rect.bottom <= 0 || rect.top >= window.innerHeight) continue;
      try {
        const opacity = Number.parseFloat(getComputedStyle(element).opacity);
        if (!Number.isFinite(opacity)) continue;
        const animation = element.animate(
          [{ opacity: opacity * 0.72 }, { opacity }],
          { duration: 160, easing: 'ease-out' },
        );
        active.set(element, animation);
        const release = () => {
          if (active.get(element) === animation) active.delete(element);
        };
        animation.onfinish = release;
        animation.oncancel = release;
      } catch {
        // A missing or changed host animation surface must never break a tool.
      }
    }
  });
  const synchronize = () => {
    observer.disconnect();
    cancelAll();
    if (!preference.matches && document.visibilityState !== 'hidden') {
      observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-state'], attributeOldValue: true });
    }
  };
  preference.addEventListener('change', synchronize);
  document.addEventListener('visibilitychange', synchronize);
  synchronize();
  return () => {
    observer.disconnect();
    preference.removeEventListener('change', synchronize);
    document.removeEventListener('visibilitychange', synchronize);
    cancelAll();
  };
}
