// 在弹出的列表里用 Ctrl-n / Ctrl-p（以及 Ctrl-j / Ctrl-k）上下移动，和 Neovim 补全菜单一致。
// 做法是把按键换成同一位置的 ↓ / ↑，交给各个菜单原有的键盘处理，不碰它们的状态。

export const name = 'vim-menu-keys';
export const inject: string[] = [];

const ARROWS: Readonly<Record<string, 'ArrowDown' | 'ArrowUp'>> = {
  n: 'ArrowDown', j: 'ArrowDown', p: 'ArrowUp', k: 'ArrowUp',
};

// 焦点在菜单、列表、菜单搜索框里，或者在已展开菜单的触发按钮上。
const IN_LIST = '[role="menu"], [role="listbox"], [role="searchbox"], [aria-expanded="true"]';

/** 焦点所在位置有展开的列表。`/` 和 `@` 菜单、命令选择框的焦点留在输入框，靠页面上可见的 listbox 判断。 */
function listOpen(focused: Element): boolean {
  if (focused.closest(IN_LIST) !== null) return true;
  for (const listbox of document.querySelectorAll('[role="listbox"]')) {
    if (listbox.getClientRects().length > 0) return true;
  }
  return false;
}

function onKeyDown(event: KeyboardEvent): void {
  if (!event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.isComposing) return;
  const arrow = ARROWS[event.key.toLowerCase()];
  const focused = document.activeElement;
  if (arrow === undefined || focused === null || focused === document.body || !listOpen(focused)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  // 合成事件不带 ctrlKey，不会再进这里。
  focused.dispatchEvent(new KeyboardEvent('keydown', {
    key: arrow, code: arrow, bubbles: true, cancelable: true, composed: true, repeat: event.repeat,
  }));
}

interface ClientContext {
  effect(factory: () => () => void, label: string): void;
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    window.addEventListener('keydown', onKeyDown, true);
    return () => { window.removeEventListener('keydown', onKeyDown, true); };
  }, `${name}: keydown`);
}
