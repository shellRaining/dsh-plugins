// 非公开宿主契约集中在这里；不读取 React 内部对象，不修改宿主方法。
export interface LayoutBridge {
  setWidth(width: number): void;
  subscribe(listener: () => void): () => void;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function connectLayout(value: unknown): LayoutBridge | null {
  if (!record(value) || !record(value.panels) || !record(value.panelInfo)) return null;
  const panels = value.panels;
  const info = value.panelInfo;
  const setWidth = panels.setRightbar;
  const subscribe = info.subscribe;
  if (typeof setWidth !== 'function' || typeof subscribe !== 'function') return null;
  return {
    setWidth(width) { setWidth.call(panels, width); },
    subscribe(listener) {
      const off: unknown = subscribe.call(info, listener);
      if (typeof off !== 'function') throw new Error('layout.panelInfo.subscribe did not return a disposer');
      return () => { off(); };
    },
  };
}

export interface FrameGeometry {
  frame: HTMLElement;
  handle: HTMLElement;
  available: number;
  right: number;
  viewport: number;
}

export function findFrame(): HTMLElement | null {
  const columns = document.querySelectorAll<HTMLElement>('[data-rightbar-col]');
  if (columns.length !== 1) return null;
  const frame = columns[0]?.parentElement;
  if (!frame || !frame.querySelector(':scope > [data-shell-overlay]')) return null;
  return frame;
}

export function rightHandle(target: EventTarget | null, frame: HTMLElement | null): HTMLElement | null {
  if (!(target instanceof Element) || !frame) return null;
  const handle = target.closest<HTMLElement>('[data-side="rightbar"]');
  return handle?.parentElement === frame ? handle : null;
}

export function measure(frame: HTMLElement): FrameGeometry | null {
  if (!frame.isConnected || frame.hasAttribute('data-rightbar-collapsed') || frame.hasAttribute('data-rightbar-fullscreen')) return null;
  const handles = frame.querySelectorAll<HTMLElement>(':scope > [data-side="rightbar"]');
  const handle = handles.length === 1 ? handles[0] : undefined;
  if (!handle || handle.getClientRects().length === 0) return null;
  // 使用未缩放的 CSS 网格轨道，而非 getBoundingClientRect，兼容整体 CSS zoom。
  const style = getComputedStyle(frame);
  if (style.display !== 'grid') return null;
  const tracks = style.gridTemplateColumns.trim().split(/\s+/);
  if (tracks.length !== 3 || tracks.some(track => !/^\d+(?:\.\d+)?px$/.test(track))) return null;
  const [left, center, right] = tracks.map(Number.parseFloat);
  if (left === undefined || center === undefined || right === undefined || center <= 0 || right <= 0) return null;
  return { frame, handle, available: center + right, right, viewport: left + center + right };
}

export function desiredWidth(geometry: FrameGeometry, ratio: number): number | null {
  // 0.2.1-rc.3 的边界：中栏至少 400px，右栏至少 300px，最多视口的 70%。
  const maximum = Math.min(geometry.available - 400, geometry.viewport * 0.7);
  if (maximum < 300) return null;
  return Math.max(300, Math.min(maximum, geometry.available * ratio));
}
