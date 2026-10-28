// Client entry: update buttons on the Plugins page's installed list, plus a
// badge, an update action and a version list on each npm-installed plugin's
// detail page. All package operations go through the host's plugin manager.
import type { ComponentType } from 'react';
import type { ClientContext, DetailSubject, UseSource } from './host.ts';
import { EN, LOCALE_NS, ZH } from './locale.ts';
import { UpdatesStore, type UpdatesState } from './model.ts';
import { installStyle } from './styles.ts';
import { DetailAction, DetailBadge, DetailSection, ListControls, OperationToast, type Actions } from './view.tsx';

export const name = '@shellraining/dsh-plugin-updates';
export const inject = ['slots', 'locale', 'remote', 'remote.pluginManager'];

/** What every registration receives; `hooks.updates` arrives bound as `useUpdates`. */
interface Face {
  readonly hooks: { readonly updates: UpdatesStore };
  readonly actions: Actions;
}

type Bound<P> = ComponentType<P & { readonly useUpdates: UseSource<UpdatesState> }>;

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh: ZH, en: EN }), `${name}: copy`);
  ctx.effect(() => installStyle(document), `${name}: stylesheet`);
  const store = new UpdatesStore(ctx);
  ctx.effect(() => () => store.dispose(), `${name}: store`);
  ctx.effect(() => {
    const offs = [ctx.remote.$on('plugin-manager/changed', store.bundlesChanged), ctx.on('connection/reset', store.bundlesChanged)];
    return () => { for (const off of offs) off(); };
  }, `${name}: host invalidations`);

  const t = ctx.locale.bind(LOCALE_NS);
  const face: Face = {
    hooks: { updates: store },
    actions: {
      ensure: store.ensure,
      install: store.install,
      updateAll: store.updateAll,
      restore: store.restore,
      dismiss: store.dismiss,
      toastDone: store.toastDone,
    },
  };
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'plugin-updates.toast',
    locale: LOCALE_NS,
    inject: () => face,
  }, OperationToast as Bound<object>));
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'plugin-updates.list',
    locale: LOCALE_NS,
    inject: () => face,
  }, ListControls as Bound<object>));
  for (const [slot, component] of [
    ['plugins.detail.badge', DetailBadge],
    ['plugins.detail.actions', DetailAction],
    ['plugins.detail.section', DetailSection],
  ] as const) {
    ctx.slots.inject(slot, () => ctx.slots.register({
      name: slot,
      id: 'plugin-updates',
      locale: LOCALE_NS,
      inject: () => face,
    }, component as Bound<{ readonly subject: DetailSubject }>));
  }
}
