import type { ClientContext } from './host/context.ts';
import { PLUGIN_ID } from './settings.ts';
import { createStyleSheet } from './style.ts';
import { createController } from './controller.ts';
import { createAppearance } from './appearance.ts';
import { createSettingsPanel, PANEL_CSS } from './panel.tsx';

// Client entry: wire the controller to the appearance and the settings slot.
export const inject = ['slots', 'theme'];
export function apply(ctx: ClientContext) {
  const controller = createController(window);
  const appearance = createAppearance(document, window, ctx.theme);
  const render = () => appearance.update(controller.getSnapshot());
  const unsubscribe = controller.subscribe(render);
  render();
  ctx.effect(() => () => {
    unsubscribe();
    appearance.dispose();
    controller.dispose();
  }, 'acrylic wallpaper lifecycle');
  ctx.effect(() => {
    const sheet = createStyleSheet(document, `${PLUGIN_ID}-settings`, PANEL_CSS);
    sheet.toggle(true);
    return sheet.dispose;
  });
  ctx.effect(() => {
    // Hide the portal container too, avoiding an empty floating border/shadow.
    // This is visual only: the host may still load the comparison on hover.
    const sheet = createStyleSheet(document, `${PLUGIN_ID}-hide-diff-hover`, `
      body > div:has(> [data-changes-hover-preview]) {
        display: none !important;
      }
    `);
    sheet.toggle(true);
    return sheet.dispose;
  });
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'acrylic-wallpaper', order: 32, label: 'Win10 Fluent 主题',
  }, createSettingsPanel(controller)));
}
