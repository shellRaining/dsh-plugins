import { AssistantNodeView } from './chat/AssistantNodeView.tsx';
import { presentationSource } from './chat/presentation.ts';
import { CHAT_CSS } from './chat/styles.ts';
import { installToolMotion } from './chat/toolMotion.ts';
import type { ClientContext } from './host.ts';
import { MARKDOWN_CSS } from './markdown/styles.ts';
import { STREAMDOWN_CSS } from './streamdown/index.ts';

export const name = 'dsh-streamdown';
export const inject = ['slots'];

/**
 * ui-chat registers its assistant-step renderer at the default priority 0;
 * the lowest priority renders, so -1 shadows it. If this entry crashes, the
 * slot boundary retires it and the seat falls back to the official renderer.
 */
const SHADOW_PRIORITY = -1;

export function apply(ctx: ClientContext): void {
  if (typeof ctx.slots?.inject !== 'function' || typeof ctx.slots.register !== 'function' ||
    typeof ctx.slots.entries !== 'function') {
    console.warn('dsh-streamdown: unsupported slot API; keeping the host renderer');
    return;
  }
  ctx.effect(installToolMotion, `${name}: tool state motion`);
  ctx.effect(() => {
    const style = document.createElement('style');
    style.dataset.plugin = name;
    style.textContent = CHAT_CSS + MARKDOWN_CSS + STREAMDOWN_CSS;
    document.head.append(style);
    return () => {
      style.remove();
    };
  }, `${name}: styles`);
  ctx.effect(() => ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'assistant-step',
    priority: SHADOW_PRIORITY,
    locale: 'chat',
    inject: () => ({ hooks: { presentation: presentationSource(ctx.slots, AssistantNodeView) } }),
  }, AssistantNodeView)), `${name}: assistant-step renderer`);
}
