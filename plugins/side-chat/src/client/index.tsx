// Client entry: a native right-sidebar tab type (`side-chat`) with its body
// and live title seats, a guide card, and a close handler that destroys the
// tab's side session. Copy follows the DSH language setting.
import { PluginArtworkSubagent } from '@deepseek-ai/dsh-client-ui-primitives';
import { useCallback, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { PLUGIN_NAME, TAB_KIND } from '../shared/protocol.ts';
import { sideChatSource } from './commands.ts';
import type { ClientContext, LocaleService, TabInfo, Translate } from './host.ts';
import { panelLabels } from './labels.ts';
import { EN, LOCALE_NS, ZH } from './locale.ts';
import { panelKey, Registry, type OpenParams } from './runtime.ts';
import { installStyle } from './styles.ts';
import { PanelView } from './view.tsx';

const FILE_ADDRESS_PREFIX = 'dsh-resource://file/';
const GUIDE_KIND = 'guide';

/** Navigation params are JSON-shaped and unchecked by the shell; keep only what this tab understands. */
function openParamsOf(value: unknown): OpenParams | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { prompt, focus } = value as Record<string, unknown>;
  return {
    ...(typeof prompt === 'string' ? { prompt } : {}),
    ...(focus === true ? { focus: true } : {}),
  };
}

/** `dsh-resource://file/session/<id>/<path>`, the address the main chat opens files with. */
function sessionFileAddress(sessionId: string, path: string): string {
  const segment = (value: string): string => encodeURIComponent(value).replace(/%3A/gi, ':');
  const normalized = path.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '');
  return `${FILE_ADDRESS_PREFIX}session/${segment(sessionId)}/${normalized.split('/').map(segment).join('/')}`;
}

interface SeatProps {
  readonly registry: Registry;
  readonly sessionId: string;
  readonly t: Translate;
  readonly locale: LocaleService;
  readonly useTabInfo?: () => TabInfo;
}

function useLocaleRevision(locale: LocaleService): number {
  // Service methods are not bound; keep `this` on the locale service.
  const subscribe = useCallback((listener: () => void) => locale.subscribe(listener), [locale]);
  const revision = useCallback(() => locale.getSnapshot().revision, [locale]);
  return useSyncExternalStore(subscribe, revision);
}

function SideChatBody({ registry, sessionId, t, locale, useTabInfo }: SeatProps): ReactNode {
  const revision = useLocaleRevision(locale);
  const info = useTabInfo?.();
  const tab = info?.tab;
  const key = panelKey(sessionId, tab?.id);
  const panel = useMemo(() => (key === '' ? null : registry.open(key, sessionId)), [registry, key, sessionId]);
  const visible = tab === undefined ? true : tab.visible;
  useEffect(() => {
    if (panel === null) return undefined;
    panel.setVisible(visible);
    return () => panel.setVisible(false);
  }, [panel, visible]);
  // A tab opened by `/side` or `/btw` carries its question (or a focus request).
  const navigation = tab?.navigation;
  useEffect(() => {
    if (panel !== null && navigation !== undefined) panel.navigate(navigation.revision, openParamsOf(navigation.params));
  }, [panel, navigation]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- labels follow the locale revision.
  const labels = useMemo(() => panelLabels(t), [t, revision]);
  const actions = tab?.actions;
  const onNew = useMemo(() => (actions === undefined ? null : () => actions.openTab(TAB_KIND)), [actions]);
  const openFile = useMemo(() => {
    if (actions === undefined) return undefined;
    return (path: string, options?: { line?: number }) => {
      const line = options?.line;
      actions.openResource(sessionFileAddress(sessionId, path), line === undefined ? undefined : { params: { line } });
    };
  }, [actions, sessionId]);
  if (panel === null) return null;
  return <PanelView panel={panel} t={t} labels={labels} onNew={onNew} openFile={openFile} />;
}

function SideChatTitle({ registry, sessionId, t, locale, useTabInfo }: SeatProps): ReactNode {
  useLocaleRevision(locale);
  useSyncExternalStore(registry.subscribe, registry.getVersion);
  const key = panelKey(sessionId, useTabInfo?.().tab.id);
  const ordinal = registry.get(key)?.getSnapshot().ordinal ?? 1;
  return <span>{ordinal > 1 ? t('tab.titleIndexed', { index: ordinal }) : t('tab.title')}</span>;
}

export const name = PLUGIN_NAME;
export const inject = ['slots', 'sidebarRight', 'sidebarRightTabs', 'locale'];

export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(LOCALE_NS);
  const registry = new Registry(document);
  ctx.effect(() => {
    const disposeZh = ctx.locale.register(LOCALE_NS, 'zh', ZH);
    const disposeEn = ctx.locale.register(LOCALE_NS, 'en', EN);
    return () => { disposeEn(); disposeZh(); };
  }, `${PLUGIN_NAME}: copy`);
  ctx.effect(() => installStyle(document), `${PLUGIN_NAME}: stylesheet`);
  ctx.effect(() => () => registry.dispose(), `${PLUGIN_NAME}: panels`);
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: PLUGIN_NAME,
    kind: TAB_KIND,
    priority: 'extension',
    title: () => t('tab.title'),
    guide: [{
      id: 'side-chat',
      order: 10,
      title: () => t('guide.title'),
      description: () => t('guide.description'),
      icon: PluginArtworkSubagent,
    }],
    // A visited body stays mounted (keeps scroll and draft); each open mints a new tab.
    keepMounted: true,
    multiple: true,
  }), `${PLUGIN_NAME}: tab type`);
  const seat = (sessionId: string): SeatProps => ({ registry, sessionId, t, locale: ctx.locale });
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: PLUGIN_NAME,
    locale: LOCALE_NS,
    inject: seat,
  }, SideChatBody)), `${PLUGIN_NAME}: tab body`);
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab.title',
    key: PLUGIN_NAME,
    locale: LOCALE_NS,
    inject: seat,
  }, SideChatTitle)), `${PLUGIN_NAME}: tab title`);
  ctx.effect(() => ctx.sidebarRight.registerCloseHandler(TAB_KIND, (sessionId, tab) => {
    void registry.close(panelKey(sessionId, tab.id), sessionId);
  }), `${PLUGIN_NAME}: tab close`);
  // `/side [question]` and `/btw [question]` in the main composer. Optional:
  // without the input-trigger service the sidebar entry still works.
  const onScreen = (sessionId: string): boolean => ctx.sidebarRight.mounted.getSnapshot() === sessionId;
  const open = (sessionId: string, prompt: string): void => {
    if (!onScreen(sessionId)) throw new Error(`${PLUGIN_NAME}: session ${sessionId} is not on screen`);
    const active = ctx.sidebarRight.active();
    const params: OpenParams = prompt === '' ? { focus: true } : { prompt };
    // Like the guide card: a guide page gives way to the tab it opens.
    ctx.sidebarRight.openTab(TAB_KIND, { params, ...(active?.kind === GUIDE_KIND ? { replaceTab: active.id } : {}) });
  };
  ctx.inject(['inputTriggers'], scope => {
    scope.effect(
      () => scope.inputTriggers.registerSource(sideChatSource({ t, eligible: onScreen, open })),
      `${PLUGIN_NAME}: slash commands`,
    );
  });
}
