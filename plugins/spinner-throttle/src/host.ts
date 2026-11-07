/**
 * DSH 0.2.2-rc.1 running-state spinner: dsh-web-frontend's StateDot renders
 * `state="ongoing"` as `<svg data-state="ongoing">`, spins its `<g>` with the
 * CSS animation `dsh-state-dot-spin` and breathes the arc circle with
 * `dsh-state-dot-dash` (stroke-dasharray / stroke-dashoffset). It also resets
 * every animation in the svg to `startTime = 0` on mount and on each
 * `animationstart`, so all spinners share one phase.
 *
 * CSS Modules hash the keyframe names (`_dsh-state-dot-spin_1i3xo_1`), so only
 * the source name between the module prefix and suffix is matched. Re-check
 * these on every DSH upgrade; anything that does not match is left to the host.
 */
export const SPINNER = 'svg[data-state="ongoing"]';

const ANIMATION = /(?:^|_)dsh-state-dot-(?:spin|dash)(?:_|$)/;

export function isSpinnerAnimation(animationName: string): boolean {
  return ANIMATION.test(animationName);
}
