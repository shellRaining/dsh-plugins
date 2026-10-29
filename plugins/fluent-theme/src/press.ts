// WinUI 2 v2.8.0 RevealHoverLight: a separate press light, not a brighter hover.
// https://github.com/microsoft/microsoft-ui-xaml/blob/17bf1fc470bae72749998f2350cf19c9534da3f7/dev/Lights/RevealHoverLight.cpp
// Timing follows that implementation; CSS radii/alpha approximate Composition
// lighting. The maximum footprint is reserved during the entire pulse so its
// expansion needs no per-frame layout reads.
export const PRESS_RADIUS = 210;
export const PRESS_CSS = `
[data-acrylic-press] { position:absolute;inset:-1px;border-radius:inherit;overflow:hidden;pointer-events:none; }
[data-acrylic-press] > i { position:absolute;left:var(--reveal-x);top:var(--reveal-y);width:94.5px;height:94.5px;margin:-47.25px;border-radius:50%;opacity:0;scale:1;pointer-events:none;background:radial-gradient(47.25px circle,rgb(var(--reveal-rgb) / .065),transparent 70%); }
[data-acrylic-press] > i + i { background:radial-gradient(47.25px circle,rgb(var(--reveal-rgb) / .055),transparent); }
`;

export interface PressLight {
  release(): void;
  dispose(): void;
}

export function createPressLight(document: Document, window: Window, overlay: HTMLElement, onFinish: () => void): PressLight {
  const root = document.createElement('div');
  root.setAttribute('data-acrylic-press', '');
  const inner = document.createElement('i'), outer = document.createElement('i');
  root.append(inner, outer);
  overlay.append(root);
  let held = true, disposed = false, phase: 'pressing' | 'slow' | 'fast' = 'pressing', revision = 0;
  let animations: Animation[] = [];
  const releaseEase = 'cubic-bezier(.33,0,.67,1)';
  function cancel() {
    revision++;
    for (const animation of animations) animation.cancel();
    animations = [];
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    cancel(); root.remove();
  }
  function finish() { dispose(); onFinish(); }
  function settle(done: () => void) {
    const current = revision;
    void Promise.all(animations.map(animation => animation.finished)).then(() => {
      if (!disposed && current === revision) done();
    }, () => {}); // Cancellation is expected on leave, replacement or teardown.
  }
  function fade(fast: boolean) {
    // A release during slow decay starts from the current light, never flashes
    // back to full brightness or resets its already-expanded radius.
    const values = [inner, outer].map(node => {
      const css = window.getComputedStyle(node);
      return { opacity: css.opacity, scale: css.scale };
    });
    cancel(); phase = fast ? 'fast' : 'slow';
    const duration = fast ? 266 : 1500;
    for (const [index, node] of [inner, outer].entries()) {
      const from = values[index];
      if (!from) continue;
      animations.push(
        node.animate([{ opacity: from.opacity }, { opacity: 0 }], { duration: index === 0 ? fast ? 200 : 1000 : duration, easing: releaseEase, fill: 'forwards' }),
        node.animate([{ scale: from.scale }, { scale: 4.44 }], { duration, easing: releaseEase, fill: 'forwards' }),
      );
    }
    settle(finish);
  }
  animations = [
    inner.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 66, easing: 'linear', fill: 'forwards' }),
    outer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 66, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'forwards' }),
  ];
  // Even a very short tap completes the initial 66ms. A held pointer starts
  // slow decay immediately afterwards, rather than staying permanently bright.
  settle(() => fade(!held));
  return {
    release() {
      if (disposed || !held) return;
      held = false;
      if (phase === 'slow') fade(true);
    },
    dispose,
  };
}
