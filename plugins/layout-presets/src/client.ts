import { connectLayout, desiredWidth, findFrame, measure, rightHandle } from './host';

interface Context {
  layout: unknown;
  effect(effect: () => () => void, label: string): void;
}

export const name = 'layout-presets';
export const inject = ['layout'];
const STORAGE_KEY = '@shellraining/dsh-layout-presets:right-ratio:v1';

function loadRatio(): number {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 1) return value;
  } catch { /* 存储不可用时仅保留内存状态。 */ }
  return 0.5;
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
  let settleRaf = 0;
  let off: (() => void) | undefined;
  let warnedGeometry = false;
  let lastRequest = '';
  let drag: { id: number; x: number; moved: boolean; frame: HTMLElement } | null = null;
  const select = document.createElement('select');
  select.dataset.layoutPresets = '';
  const presets = [['2:1', 1 / 3], ['1:1', 0.5], ['1:2', 2 / 3]] as const;
  for (const [label, value] of presets) select.add(new Option(label, String(value)));
  const custom = new Option('', 'custom');
  custom.disabled = true;
  select.add(custom);
  select.hidden = true;
  const style = document.createElement('style');
  style.dataset.plugin = name;
  style.textContent = `
    [data-layout-presets] { position:fixed; z-index:100; max-width:180px; padding:4px 8px;
      border:1px solid var(--dsw-alias-border-l3); border-radius:6px;
      background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary);
      font:inherit; font-size:12px; cursor:pointer; }
    [data-layout-presets][hidden] { display:none; }
    [data-layout-presets]:focus-visible { outline:2px solid var(--dsw-alias-brand-primary); outline-offset:2px; }
  `;

  function updateLabel(): void {
    const chinese = document.documentElement.lang.toLowerCase().startsWith('zh');
    const label = chinese ? '对话区 : 右栏（保持比例）' : 'Chat : right panel (keep ratio)';
    select.title = label;
    select.setAttribute('aria-label', label);
    custom.textContent = `${chinese ? '自定义' : 'Custom'} ${Math.round((1 - ratio) * 100)}:${Math.round(ratio * 100)}`;
    select.value = presets.find(([, value]) => Math.abs(value - ratio) < 0.001)?.[1].toString() ?? 'custom';
  }

  function save(next: number): void {
    lastRequest = '';
    ratio = next;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ratio)); } catch { /* 内存模式。 */ }
    updateLabel();
  }

  function schedule(): void {
    if (!disposed && !raf) raf = requestAnimationFrame(sync);
  }
  const resize = new ResizeObserver(schedule);
  const mutations = new MutationObserver(schedule);
  const discovery = new MutationObserver(() => {
    if (!frame?.isConnected || !select.isConnected) schedule();
  });
  const language = new MutationObserver(updateLabel);

  function sync(): void {
    raf = 0;
    if (disposed) return;
    const nextFrame = findFrame();
    if (nextFrame !== frame) {
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
    const geometry = frame && measure(frame);
    select.hidden = !geometry;
    if (!geometry) {
      if (frame?.querySelector(':scope > [data-side="rightbar"]') && !frame.hasAttribute('data-rightbar-fullscreen') && !warnedGeometry) {
        warnedGeometry = true;
        console.warn('[layout-presets] Unsupported or hidden frame geometry; width updates paused.');
      }
      return;
    }
    const bounds = geometry.frame.getBoundingClientRect();
    // 控件独立于 React 管理的节点，卸载时可直接移除。
    select.style.left = `${Math.max(8, Math.min(window.innerWidth - select.offsetWidth - 8, bounds.right - select.offsetWidth - 16))}px`;
    select.style.top = `${Math.max(8, Math.min(window.innerHeight - select.offsetHeight - 8, bounds.bottom - select.offsetHeight - 12))}px`;
    if (drag || settleRaf || geometry.frame.hasAttribute('data-dragging') || geometry.frame.hasAttribute('data-animating')) return;
    const width = desiredWidth(geometry, ratio);
    if (width === null || Math.abs(width - geometry.right) < 1) {
      lastRequest = '';
      return;
    }
    const request = `${geometry.viewport}:${geometry.available}:${width}`;
    // 宿主拒绝或进一步钳制宽度时，不在每次订阅回调中重复写入。
    if (request === lastRequest) return;
    lastRequest = request;
    try { bridge?.setWidth(width); } catch (error) {
      console.warn('[layout-presets] Width API failed; plugin disabled.', error);
      cleanup();
    }
  }

  function cancelSettlement(): void {
    cancelAnimationFrame(settleRaf);
    settleRaf = 0;
  }
  function onChange(): void {
    cancelSettlement();
    const next = Number(select.value);
    if (!Number.isFinite(next) || next <= 0 || next >= 1) return;
    save(next);
    schedule();
  }
  function onDoubleClick(event: MouseEvent): void {
    if (!rightHandle(event.target, frame)) return;
    cancelSettlement();
    save(0.5);
    schedule();
  }
  function onDown(event: PointerEvent): void {
    if (event.button !== 0 || !frame || !rightHandle(event.target, frame)) return;
    cancelSettlement();
    drag = { id: event.pointerId, x: event.clientX, moved: false, frame };
  }
  function onMove(event: PointerEvent): void {
    if (drag?.id === event.pointerId && Math.abs(event.clientX - drag.x) > 2) drag.moved = true;
  }
  function onEnd(event: PointerEvent): void {
    if (!drag || drag.id !== event.pointerId) return;
    const finished = drag;
    drag = null;
    if (settleRaf) cancelAnimationFrame(settleRaf);
    // 等待宿主 pointerup 的最后一次 setRightbar 完成 React 提交。
    settleRaf = requestAnimationFrame(() => {
      settleRaf = requestAnimationFrame(() => {
        settleRaf = 0;
        if (disposed) return;
        const geometry = frame === finished.frame && frame && measure(frame);
        if (event.type === 'pointerup' && finished.moved && geometry) save(geometry.right / geometry.available);
        schedule();
      });
    });
  }
  function onBlur(): void {
    cancelSettlement();
    drag = null;
    schedule();
  }
  function onStorage(event: StorageEvent): void {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    cancelSettlement();
    lastRequest = '';
    ratio = loadRatio();
    updateLabel();
    schedule();
  }
  function cleanup(): void {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    cancelAnimationFrame(settleRaf);
    resize.disconnect(); mutations.disconnect(); discovery.disconnect(); language.disconnect();
    off?.();
    document.removeEventListener('dblclick', onDoubleClick);
    document.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('pointermove', onMove, true);
    document.removeEventListener('pointerup', onEnd, true);
    document.removeEventListener('pointercancel', onEnd, true);
    document.removeEventListener('lostpointercapture', onEnd, true);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('storage', onStorage);
    select.removeEventListener('change', onChange);
    select.remove(); style.remove();
  }

  try {
    off = bridge.subscribe(schedule);
    document.head.append(style);
    document.body.append(select);
    updateLabel();
    select.addEventListener('change', onChange);
    document.addEventListener('dblclick', onDoubleClick);
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onEnd, true);
    document.addEventListener('pointercancel', onEnd, true);
    document.addEventListener('lostpointercapture', onEnd, true);
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', schedule);
    window.addEventListener('storage', onStorage);
    discovery.observe(document.body, { childList: true, subtree: true });
    language.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
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
