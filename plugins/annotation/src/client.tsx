import { createRoot } from 'react-dom/client';
import { Controller } from './controller.ts';
import type { ClientContext } from './host.ts';
import { Card, ComposerStatus } from './view.tsx';
import { STYLE } from './styles.ts';

export const name = 'dsh-local-annotation';
export const inject = ['uiSession', 'slots'];

export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    const style = document.createElement('style');
    style.dataset.plugin = name;
    style.textContent = STYLE;
    document.head.append(style);
    const host = document.createElement('div');
    host.dataset.localAnnotationCard = '';
    host.hidden = true;
    document.body.append(host);
    let controller: Controller | undefined;
    let root: ReturnType<typeof createRoot> | undefined;
    let disposeStatus: (() => void) | undefined;
    const dispose = () => { disposeStatus?.(); root?.unmount(); controller?.dispose(); host.remove(); style.remove(); };
    try {
      controller = new Controller(ctx, host);
      root = createRoot(host);
      root.render(<Card controller={controller} />);
      const active = controller;
      disposeStatus = ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
        name: 'conversation.input.left', id: name,
        inject: (sessionId: string) => ({ controller: active, sessionId }),
      }, ComposerStatus));
      return dispose;
    } catch (error) { dispose(); throw error; }
  }, `${name}: inline annotation card`);
}
