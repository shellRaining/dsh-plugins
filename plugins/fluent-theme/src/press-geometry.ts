// Native Threshold pointer mapping (later public Microsoft source):
// https://github.com/microsoft/microsoft-ui-xaml/blob/4a5d99f46230f25599a190b12d34ccb7daaeaaa8/dxaml/xcp/dxaml/lib/ThemeAnimations.cpp
// https://github.com/microsoft/microsoft-ui-xaml/blob/4a5d99f46230f25599a190b12d34ccb7daaeaaa8/dxaml/xcp/core/animation/PointerAnimationUsingKeyFrames.cpp
// The CSS camera is an approximation, not a port of PlaneProjection's full
// native viewport matrix. CSS axis signs make the pressed edge recede.
export interface Depression { scale: number; x: number; y: number }
export function depression(width: number, height: number, u: number, v: number): Depression {
  const angle = (d: number) => d > 925 ? 0 : Math.max(0, -.00000007 * d ** 3 + .00015904 * d ** 2 - .12506463 * d + 35.27311191);
  u = Math.max(0, Math.min(1, u)); v = Math.max(0, Math.min(1, v));
  return { scale: .97 + .03 * (Math.abs(u - .5) + Math.abs(v - .5)), x: -(v - .5) * angle(height), y: (u - .5) * angle(width) };
}

interface Projection { width: number; height: number; matrix: DOMMatrix; inverse: DOMMatrix; transform: string }
const projections = new WeakMap<Element, Projection>();
export function forgetProjection(target: Element) { projections.delete(target); }
export function insideProjection(target: Element): boolean {
  for (let parent = target.parentElement; parent; parent = parent.parentElement) if (projections.has(parent)) return true;
  return false;
}

export function project(window: Window & typeof globalThis, target: HTMLElement, width: number, height: number, pose: Depression, amount: number): Projection {
  const camera = new window.DOMMatrix(); camera.m34 = -1 / 999;
  const rotation = new window.DOMMatrix().rotate(pose.x * amount, pose.y * amount).scale(1 + (pose.scale - 1) * amount);
  const m = camera.multiply(rotation);
  // Keep the exact planar perspective mapping, with z=0 on the resulting
  // surface. Its inverse also works for a pseudo in a flattened CSS subtree,
  // without preserve-3d changing host descendants' stacking/clipping behavior.
  const matrix = new window.DOMMatrix([m.m11,m.m12,0,m.m14, m.m21,m.m22,0,m.m24, 0,0,1,0, 0,0,0,1]);
  const projection = { width, height, matrix, inverse: matrix.inverse(), transform: matrix.toString() };
  projections.set(target, projection);
  return projection;
}

function point(matrix: DOMMatrix, width: number, height: number, x: number, y: number) {
  const p = matrix.transformPoint({ x: x - width / 2, y: y - height / 2 });
  return { x: p.x / p.w + width / 2, y: p.y / p.w + height / 2 };
}

/** Recover the layout box from the projected bounds; no layout-style toggles. */
export function pressGeometry(target: Element, bounds: DOMRect) {
  const projection = projections.get(target);
  if (!projection) return null;
  const { matrix, inverse, width, height, transform } = projection;
  const corners = [[0,0],[width,0],[width,height],[0,height]].map(([x = 0,y = 0]) => point(matrix, width, height, x, y));
  const left = bounds.left - Math.min(...corners.map(p => p.x));
  const top = bounds.top - Math.min(...corners.map(p => p.y));
  return { left, top, width, height, transform, local: (x: number, y: number) => point(inverse, width, height, x - left, y - top) };
}

/** Native up KeySpline (.1,.25,.75,.9), solved for time rather than parameter. */
export function releaseEase(time: number): number {
  if (time <= 0) return 0;
  if (time >= 1) return 1;
  const curve = (t: number, a: number, b: number) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
  let low = 0, high = 1;
  for (let i = 0; i < 12; i++) {
    const mid = (low + high) / 2;
    if (curve(mid, .1, .75) < time) low = mid; else high = mid;
  }
  return curve((low + high) / 2, .25, .9);
}
