// `/effort`：在当前模型公布的思考强度之间选择。
// 本页面刚把会话切到另一个模型时（无论来自 /model 还是输入框的模型菜单），
// 立即弹出同一个选择框，选完模型就能接着用键盘选强度。
import { IconThinkOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import type {
  ClientContext, CommandUi, ModelDirectories, ModelDirectoryState, ModelSelection,
  PopupController, PopupSelectSpec, SelectOption, Sessions,
} from './host.ts';

export const name = 'effort-picker';
export const inject = ['locale'];

const NS = 'dsh-effort-picker';
const COMMAND = 'effort';

const ZH = {
  label: '思考强度',
  description: '切换当前模型的思考强度',
  search: '搜索思考强度',
  empty: '当前模型没有可选的思考强度',
  noResults: '没有匹配的思考强度',
  noModel: '还没有选择模型',
  sessionInUse: '会话正被其他正在运行的 DSH 占用，退出后重试',
};
const EN: typeof ZH = {
  label: 'Reasoning effort',
  description: 'Change the reasoning effort of the current model',
  search: 'Search efforts',
  empty: 'The current model has no reasoning efforts',
  noResults: 'No matching effort',
  noModel: 'No model is selected',
  sessionInUse: 'Another running DSH holds this session; quit it and try again',
};

function sameRoute(a: ModelSelection | null, b: ModelSelection | null): boolean {
  return a !== null && b !== null && a.provider === b.provider && a.model === b.model;
}

function reasoningOf(state: ModelDirectoryState, route: ModelSelection) {
  return state.groups.find(group => group.id === route.provider)
    ?.models.find(model => model.id === route.model)?.reasoning;
}

function effortOptions(state: ModelDirectoryState): SelectOption[] {
  const current = state.current;
  if (current === null) return [];
  const reasoning = reasoningOf(state, current);
  const active = current.reasoningEffort ?? reasoning?.defaultEffort;
  return (reasoning?.efforts ?? []).map(effort => ({
    id: effort.id,
    label: effort.name,
    ...effort.description === undefined ? {} : { detail: effort.description },
    ...effort.id === active ? { active: true } : {},
  }));
}

function mainSessionId(sessions: Sessions): string | undefined {
  return Object.values(sessions.list.getSnapshot().byId).find(row => (row.retainedBy['mainView'] ?? 0) > 0)?.id;
}

/** 跟随主视图会话，对当前会话调用 attach，切换或卸载时释放。 */
function followMainSession(sessions: Sessions, attach: (sessionId: string) => () => void): () => void {
  let id: string | undefined;
  let release = (): void => {};
  const sync = (): void => {
    const next = mainSessionId(sessions);
    if (next === id) return;
    release();
    release = () => {};
    id = next;
    if (next !== undefined) release = attach(next);
  };
  const unsubscribe = sessions.list.subscribe(sync);
  sync();
  return () => { unsubscribe(); release(); };
}

/**
 * 本页面的一次选择成功且换了模型时调用 onSwitch。
 * `pending` 只记录本页面发起的选择，其他窗口或宿主改动不会触发。
 */
function watchModelSwitch(directories: ModelDirectories, sessionId: string, onSwitch: () => void): () => void {
  const store = directories.directoryFor(sessionId).store;
  let previous = store.getSnapshot();
  // 选择开始时的模型，用于判断这次选择是否换了模型。
  let base = previous.current;
  return store.subscribe(() => {
    const next = store.getSnapshot();
    const picked = previous.pending;
    if (picked === null && next.pending !== null) base = next.current;
    previous = next;
    if (picked === null || next.pending !== null || next.status !== 'ready' || sameRoute(base, picked)) return;
    if ((reasoningOf(next, picked)?.efforts.length ?? 0) > 1) onSwitch();
  });
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    const disposeZh = ctx.locale.register(NS, 'zh', ZH);
    const disposeEn = ctx.locale.register(NS, 'en', EN);
    return () => { disposeEn(); disposeZh(); };
  }, `${name}: copy`);
  const t = ctx.locale.bind(NS);

  ctx.inject(['commandUi', 'modelDirectories', 'sessions'], (scope) => {
    const commandUi: CommandUi = scope.commandUi;
    const models = scope.modelDirectories;
    const sessions = scope.sessions;
    const usable = (sessionId: string): boolean => sessions.subagentAddress(sessionId) === undefined;

    const spec: PopupSelectSpec = {
      kind: 'popupSelect',
      searchLabels: () => ({ placeholder: t('search'), empty: t('empty'), noResults: t('noResults') }),
      options: async session => effortOptions(await models.directoryFor(session.sessionId).load()),
      onSelect: async (option, session) => {
        const directory = models.directoryFor(session.sessionId);
        const current = directory.store.getSnapshot().current;
        if (current === null) throw new Error(t('noModel'));
        const result = await directory.select({ provider: current.provider, model: current.model, reasoningEffort: option.id });
        if (!result.ok) throw new Error(result.error.code === 'session/writer-held' ? t('sessionInUse') : result.error.message);
      },
    };

    scope.effect(() => commandUi.register({
      name: COMMAND,
      label: () => t('label'),
      description: () => t('description'),
      icon: IconThinkOutlineRegular,
      available: session => usable(session.sessionId),
      ui: spec,
    }), `${name}: /${COMMAND}`);

    const openPicker = (sessionId: string): void => {
      const sessionScope = sessions.scope(sessionId);
      if (sessionScope === undefined) return;
      const popup = commandUi.popupFor(sessionScope) as PopupController;
      // 用户已经打开了别的选择框，不去抢。
      if (popup.state.getSnapshot().open) return;
      // 无草稿时 token 不匹配，选完后输入框保持原样。
      popup.open(COMMAND, spec, { sessionId }, { via: 'enter', token: `/${COMMAND}` });
    };

    scope.effect(() => followMainSession(sessions, (sessionId) => {
      if (!usable(sessionId) || sessions.scope(sessionId) === undefined) return () => {};
      let timer: ReturnType<typeof setTimeout> | undefined;
      const stop = watchModelSwitch(models, sessionId, () => {
        clearTimeout(timer);
        // /model 的选择框在 onSelect 返回后的微任务里才关闭并把焦点还给输入框，
        // 推迟到下一个任务再打开，避免被它当成同一次选择收尾。
        timer = setTimeout(() => { openPicker(sessionId); }, 0);
      });
      return () => { clearTimeout(timer); stop(); };
    }), `${name}: ask after model switch`);
  });
}
