import { connectLayout, desiredWidth, findFrame, measure, rightHandle } from './host';
import { createGuides, reachablePresets } from './guides';

interface Context {
  layout: unknown;
  effect(effect: () => () => void, label: string): void;
}

export const name = 'layout-presets';
export const inject = ['layout'];
const STORAGE_KEY = '@shellraining/dsh-layout-presets:right-ratio:v1';
// 进入和脱离使用不同阈值，避免指针在吸附边缘来回跳动。单位为屏幕 CSS px。
const SNAP_ENTER = 8;
const SNAP_LEAVE = 22;

function loadRatio(): number {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 1) return value;
  } catch { /* 存储不可用时仅保留内存状态。 */ }
  return 0.5;
}

interface Drag {
  id: number;
  x: number;
  y: number;
  startX: number;
  startWidth: number;
  scale: number;
  moved: boolean;
  snapped: number | null;
  frame: HTMLElement;
  handle: HTMLElement;
}

function install(layout: unknown): () => void {
  const bridge = connectLayout(layout);
  if (!bridge) {
    console.warn('[layout-presets] Unsupported layout service; plugin disabled.');
    return () => {};
  }
  let disposed = false;
  let ratio = loadRatio();
  let frame: HTMLElement | null = null;
  let raf = 0;
  let off: (() => void) | undefined;
  let lastRequest = '';
  let drag: Drag | null = null;
  const guides = createGuides();
  const events = new AbortController();
  const capture = { capture: true, signal: events.signal };

  function save(next: number): void {
    lastRequest = '';
    ratio = next;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ratio)); } catch { /* 内存模式。 */ }
  }
  function schedule(): void {
    if (!disposed && !raf) raf = requestAnimationFrame(sync);
  }
  function setWidth(width: number): void {
    try { bridge?.setWidth(width); } catch (error) {
      console.warn('[layout-presets] Width API failed; plugin disabled.', error);
      cleanup();
    }
  }
  const resize = new ResizeObserver(schedule);
  const mutations = new MutationObserver(schedule);
  const discovery = new MutationObserver(() => { if (!frame?.isConnected) schedule(); });

  function releaseDrag(): void {
    const finished = drag;
    drag = null;
    guides.hide();
    if (!finished) return;
    finished.frame.removeAttribute('data-layout-presets-dragging');
    if (finished.handle.hasPointerCapture(finished.id)) finished.handle.releasePointerCapture(finished.id);
  }

  function updateDrag(): number | null {
    const current = drag;
    if (!current) return null;
    const geometry = current.frame === frame && measure(current.frame);
    if (!geometry || current.frame.hasAttribute('data-animating')) {
      releaseDrag();
      schedule();
      return null;
    }
    // 与当前面板宽度无关，脱离吸附后继续跟随原始指针轨迹，不累计误差。
    const raw = current.startWidth - (current.x - current.startX) / current.scale;
    const targets = reachablePresets(geometry);
    const retained = targets.find(target => target.ratio === current.snapped
      && Math.abs(raw - geometry.available * target.ratio) * current.scale <= SNAP_LEAVE);
    const nearest = targets.reduce<(typeof targets)[number] | undefined>((best, target) =>
      !best || Math.abs(raw - geometry.available * target.ratio) < Math.abs(raw - geometry.available * best.ratio)
        ? target : best, undefined);
    const snap = retained ?? (nearest && Math.abs(raw - geometry.available * nearest.ratio) * current.scale <= SNAP_ENTER ? nearest : undefined);
    current.snapped = current.moved ? snap?.ratio ?? null : null;
    guides.show(geometry, current.y, current.snapped);
    if (!current.moved) return null;
    const next = current.snapped ?? raw / geometry.available;
    const width = desiredWidth(geometry, next);
    if (width === null) return null;
    const request = `drag:${geometry.viewport}:${geometry.available}:${width}`;
    if (request !== lastRequest) {
      lastRequest = request;
      setWidth(width);
    }
    return current.snapped ?? width / geometry.available;
  }

  function sync(): void {
    raf = 0;
    if (disposed) return;
    const nextFrame = findFrame();
    if (nextFrame !== frame) {
      releaseDrag();
      resize.disconnect();
      mutations.disconnect();
      frame = nextFrame;
      if (frame) {
        resize.observe(frame);
        mutations.observe(frame, { attributes: true, childList: true, attributeFilter: [
          'style', 'data-sidebar-collapsed', 'data-rightbar-collapsed', 'data-rightbar-fullscreen', 'data-animating', 'data-dragging',
        ] });
      }
    }
    if (drag) { updateDrag(); return; }
    const geometry = frame && measure(frame);
    if (!geometry || geometry.frame.hasAttribute('data-dragging') || geometry.frame.hasAttribute('data-animating')) return;
    const width = desiredWidth(geometry, ratio);
    if (width === null || Math.abs(width - geometry.right) < 1) { lastRequest = ''; return; }
    const request = `${geometry.viewport}:${geometry.available}:${width}`;
    if (request === lastRequest) return;
    lastRequest = request;
    setWidth(width);
  }

  function onDoubleClick(event: MouseEvent): void {
    if (!rightHandle(event.target, frame)) return;
    releaseDrag();
    save(0.5);
    schedule();
  }
  function onDown(event: PointerEvent): void {
    if (event.button !== 0 || !event.isPrimary || drag || !frame) return;
    const handle = rightHandle(event.target, frame);
    const geometry = handle && measure(frame);
    if (!handle || !geometry || frame.hasAttribute('data-animating') || frame.hasAttribute('data-dragging')) return;
    const scale = frame.getBoundingClientRect().width / geometry.viewport;
    if (!Number.isFinite(scale) || scale <= 0) return;
    // 在宿主 React 处理前接管这一条手柄，避免两个 rAF 写入者争抢宽度。
    try { handle.setPointerCapture(event.pointerId); } catch { return; }
    event.preventDefault();
    event.stopImmediatePropagation();
    lastRequest = '';
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX,
      startWidth: geometry.right, scale, moved: false, snapped: null, frame, handle };
    frame.setAttribute('data-layout-presets-dragging', '');
    guides.show(geometry, event.clientY, null);
  }
  function onMove(event: PointerEvent): void {
    if (!drag || drag.id !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (Math.abs(drag.x - drag.startX) > 2) drag.moved = true;
    schedule();
  }
  function onEnd(event: PointerEvent): void {
    if (!drag || drag.id !== event.pointerId) return;
    event.stopImmediatePropagation();
    if (event.type === 'pointerup') {
      drag.x = event.clientX;
      drag.y = event.clientY;
      if (Math.abs(drag.x - drag.startX) > 2) drag.moved = true;
      const next = updateDrag();
      if (!disposed && next !== null) save(next);
    }
    releaseDrag();
    lastRequest = '';
    schedule();
  }
  function cancelDrag(): void { releaseDrag(); lastRequest = ''; schedule(); }
  function onKey(event: KeyboardEvent): void {
    if (!drag || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    cancelDrag();
  }
  function onStorage(event: StorageEvent): void {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    releaseDrag();
    lastRequest = '';
    ratio = loadRatio();
    schedule();
  }
  function cleanup(): void {
    if (disposed) return;
    disposed = true;
    events.abort();
    releaseDrag();
    cancelAnimationFrame(raf);
    resize.disconnect(); mutations.disconnect(); discovery.disconnect();
    off?.();
    guides.dispose();
  }

  try {
    off = bridge.subscribe(schedule);
    guides.mount();
    document.addEventListener('dblclick', onDoubleClick, { signal: events.signal });
    document.addEventListener('pointerdown', onDown, capture);
    document.addEventListener('pointermove', onMove, { ...capture, passive: false });
    document.addEventListener('pointerup', onEnd, capture);
    document.addEventListener('pointercancel', onEnd, capture);
    document.addEventListener('lostpointercapture', onEnd, capture);
    document.addEventListener('keydown', onKey, capture);
    window.addEventListener('blur', cancelDrag, { signal: events.signal });
    window.addEventListener('resize', cancelDrag, { signal: events.signal });
    window.addEventListener('storage', onStorage, { signal: events.signal });
    discovery.observe(document.body, { childList: true, subtree: true });
    schedule();
  } catch (error) {
    console.warn('[layout-presets] Initialization failed; plugin disabled.', error);
    cleanup();
  }
  return cleanup;
}

export function apply(ctx: Context): void {
  ctx.effect(() => install(ctx.layout), 'layout-presets: proportional right panel');
}
