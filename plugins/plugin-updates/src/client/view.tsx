// React views: update controls on the Plugins page's installed list, the
// three plugin-detail slots and the outcome toast. All controls are host
// primitives; the plugin owns no popups.
import { Button, Tag, Toast, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives';
import { IconDownloadOutlineRegular, IconWarningOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { NO_ANCHORS, watchAnchors, type Anchors } from './anchors.ts';
import type { DetailSubject, Translate, UseSource } from './host.ts';
import { isBusy, SELF, updateTarget, type Candidate, type Lookup, type Operation, type UpdatesState, type VersionInfo } from './model.ts';

export interface Actions {
  readonly ensure: () => void;
  readonly install: (name: string, version: string) => Promise<boolean>;
  readonly updateAll: () => Promise<void>;
  readonly restore: () => Promise<void>;
  readonly dismiss: () => void;
  readonly toastDone: () => void;
}

interface Shared {
  readonly t: Translate;
  readonly useUpdates: UseSource<UpdatesState>;
  readonly actions: Actions;
}

const VISIBLE_VERSIONS = 12;

/** The CLI command that updates this plugin, for the profile the page runs in. */
function selfCommand(version: string): string {
  const profile = document.documentElement.dataset['platform'] === undefined ? 'web' : 'desktop';
  return `dsh plugin --profile ${profile} add ${SELF}@${version} --save-exact`;
}

function dateText(stamp: number | undefined): string {
  return stamp === undefined ? '' : new Date(stamp).toLocaleDateString();
}

function SelfNotice({ t, version }: { readonly t: Translate; readonly version: string }): ReactNode {
  const [copied, setCopied] = useState(false);
  const command = selfCommand(version);
  return (
    <div className="dpu-banner">
      <strong>{t('self.title')}</strong>
      <span>{t('self.body')}</span>
      <div className="dpu-banner-row">
        <pre className="dpu-pre dpu-command">{command}</pre>
        <Button size="sm" variant="outline" onClick={() => { void writeClipboard(command).then(setCopied); }}>
          {copied ? t('self.copied') : t('self.copy')}
        </Button>
      </div>
    </div>
  );
}

function operationText(t: Translate, operation: Operation): string {
  const raw = operation.reason ?? '';
  const reason = raw.includes('ERR_PNPM_RESOLUTION_POLICY_VIOLATIONS_UNHANDLED') ? t('error.policy')
    : raw === 'installation-inconsistent' ? t('error.inconsistent')
    : raw === 'plugin-state-changed' ? t('error.stateChanged') : raw;
  const params = { name: operation.name, from: operation.from, to: operation.to, reason };
  switch (operation.phase) {
    case 'checking': return t('op.checking', params);
    case 'check-failed': return t('op.checkFailed', params);
    case 'current': return t('op.current', params);
    case 'removing': return t('op.removing', params);
    case 'installing': return t(operation.restoring ? 'op.restoring' : 'op.installing', params);
    case 'done': return t('op.done', params);
    case 'restart': return t('op.restart', params);
    case 'failed': return t('op.failed', params);
    case 'remove-failed': return t('op.removeFailed', params);
  }
}

/**
 * The outcome as a toast in the app overlay: a switch uninstalls the plugin
 * first, which takes the plugin page back to its list, so the detail page that
 * started it may be gone by the time it finishes.
 */
export function OperationToast({ t, useUpdates, actions }: Shared): ReactNode {
  const operation = useUpdates(state => state.operation);
  if (operation?.toast === undefined) return null;
  const failed = operation.phase === 'failed' || operation.phase === 'remove-failed' || operation.phase === 'check-failed';
  const restorable = operation.phase === 'failed' && operation.recoverable;
  return (
    <Toast
      key={operation.toast}
      text={operationText(t, operation)}
      {...failed ? { icon: <IconWarningOutlineRegular /> } : { tone: 'success' as const }}
      holdMs={failed ? 8000 : 4000}
      {...restorable ? { actions: [{ label: t('op.restore', { from: operation.from }), onClick: () => { void actions.restore(); } }] } : {}}
      onDone={actions.toastDone}
    />
  );
}

/** Progress and outcome of the running or last package operation. */
function OperationBanner({ t, operation, actions }: { readonly t: Translate; readonly operation: Operation; readonly actions: Actions }): ReactNode {
  const params = { from: operation.from };
  const busy = isBusy(operation);
  const failed = operation.phase === 'failed' || operation.phase === 'remove-failed' || operation.phase === 'check-failed';
  const text = operationText(t, operation);
  return (
    <div className="dpu-banner" role={failed ? 'alert' : 'status'} {...failed ? { 'data-tone': 'error' } : {}}>
      <div className="dpu-banner-row">
        <span>{text}</span>
        {operation.phase === 'failed' && operation.recoverable
          ? <Button size="sm" variant="outline" onClick={() => { void actions.restore(); }}>{t('op.restore', params)}</Button>
          : null}
        {busy ? null : <Button size="sm" variant="ghost" onClick={actions.dismiss}>{t('op.dismiss')}</Button>}
      </div>
      {failed && operation.output !== undefined ? <pre className="dpu-pre">{operation.output}</pre> : null}
      {failed && operation.logPath !== undefined ? <span className="dpu-caption">{t('op.log', { path: operation.logPath })}</span> : null}
    </div>
  );
}

interface DetailProps extends Shared {
  readonly subject: DetailSubject;
}

/** The npm candidate a detail page shows, or undefined for rows, official items and other sources. */
function useSubject({ subject, useUpdates, actions }: DetailProps): { candidate: Candidate; lookup: Lookup | undefined; operation: Operation | undefined } | undefined {
  const name = subject.kind === 'bundle' ? subject.pkg.name : undefined;
  const candidate = useUpdates(state => state.candidates.find(item => item.name === name));
  const lookup = useUpdates(state => name === undefined ? undefined : state.lookups[name]);
  const operation = useUpdates(state => state.operation);
  useEffect(() => { if (name !== undefined) actions.ensure(); }, [actions, name]);
  return candidate === undefined ? undefined : { candidate, lookup, operation };
}

export function DetailBadge(props: DetailProps): ReactNode {
  const found = useSubject(props);
  const target = found === undefined ? undefined : updateTarget(found.candidate, found.lookup);
  return target === undefined ? null : <Tag tone="info">{props.t('status.update', { version: target })}</Tag>;
}

export function DetailAction(props: DetailProps): ReactNode {
  const found = useSubject(props);
  const target = found === undefined ? undefined : updateTarget(found.candidate, found.lookup);
  if (found === undefined || target === undefined || found.candidate.name === SELF) return null;
  return (
    <Button size="sm" variant="primary" icon={<IconDownloadOutlineRegular size={13} />} disabled={isBusy(found.operation)} onClick={() => { void props.actions.install(found.candidate.name, target); }}>
      {props.t('updateTo', { version: target })}
    </Button>
  );
}

function VersionRow({ t, info, current, disabled, onInstall }: {
  readonly t: Translate;
  readonly info: VersionInfo;
  readonly current: boolean;
  readonly disabled: boolean;
  readonly onInstall: (() => void) | undefined;
}): ReactNode {
  const hint = !info.compatible ? t('hint.incompatible') : info.fresh ? t('hint.fresh') : undefined;
  return (
    <li className="dpu-row" {...hint === undefined ? {} : { title: hint }}>
      <span className="dpu-row-version dpu-mono">{info.version}</span>
      <span className="dpu-row-tags">
        {current ? <Tag tone="success">{t('tag.current')}</Tag> : null}
        {info.prerelease ? <Tag tone="neutral">{t('tag.prerelease')}</Tag> : null}
        {info.deprecated ? <Tag tone="warning">{t('tag.deprecated')}</Tag> : null}
        {!info.compatible ? <Tag tone="danger">{t('tag.incompatible')}</Tag> : null}
        {info.fresh ? <Tag tone="warning">{t('tag.fresh')}</Tag> : null}
      </span>
      <span className="dpu-caption">{dateText(info.published)}</span>
      {current || onInstall === undefined ? null : (
        <Button size="sm" variant="ghost" disabled={disabled || !info.compatible} onClick={onInstall}>{t('install')}</Button>
      )}
    </li>
  );
}

export function DetailSection(props: DetailProps): ReactNode {
  const found = useSubject(props);
  const [all, setAll] = useState(false);
  if (found === undefined) return null;
  const { t, actions } = props;
  const { candidate, lookup, operation } = found;
  const self = candidate.name === SELF;
  const target = updateTarget(candidate, lookup);
  let body: ReactNode;
  if (lookup === undefined || lookup.status === 'loading') body = <span className="dpu-caption">{t('versions.loading')}</span>;
  else if (lookup.status === 'error') body = <span className="dpu-error">{t('versions.failed', { reason: lookup.reason })}</span>;
  else if (lookup.versions.length === 0) body = <span className="dpu-caption">{t('versions.empty')}</span>;
  else {
    const shown = all ? lookup.versions : lookup.versions.slice(0, VISIBLE_VERSIONS);
    body = (
      <>
        <ul className="dpu-rows">
          {shown.map(info => (
            <VersionRow
              key={info.version}
              t={t}
              info={info}
              current={info.version === candidate.version}
              disabled={isBusy(operation)}
              onInstall={self ? undefined : () => { void actions.install(candidate.name, info.version); }}
            />
          ))}
        </ul>
        {shown.length < lookup.versions.length
          ? <div><Button size="sm" variant="ghost" onClick={() => setAll(true)}>{t('versions.showAll', { count: lookup.versions.length })}</Button></div>
          : null}
      </>
    );
  }
  return (
    <section className="dpu-section" data-plugin-updates-versions={candidate.name}>
      <div className="dpu-head">
        <h3 className="dpu-title">{t('versions.title')}</h3>
        <span className="dpu-summary">
          {t('version.current', { version: candidate.version })}
          {lookup?.status === 'ready' ? ` · ${t('versions.registry', { registry: new URL(lookup.registry).host })}` : ''}
        </span>
      </div>
      {operation?.name === candidate.name ? <OperationBanner t={t} operation={operation} actions={actions} /> : null}
      {self && target !== undefined ? <SelfNotice t={t} version={target} /> : null}
      {body}
    </section>
  );
}

/**
 * Update controls on the Plugins page's own "Installed plugins" list: "Update
 * all" beside the group heading and an update button on each card with a newer
 * version. Rendered from the app overlay into mount nodes the adapter keeps.
 */
export function ListControls({ t, useUpdates, actions }: Shared): ReactNode {
  const [anchors, setAnchors] = useState<Anchors>(NO_ANCHORS);
  useEffect(() => watchAnchors(document, setAnchors), []);
  const visible = anchors.head !== undefined || anchors.cards.size > 0;
  useEffect(() => { if (visible) actions.ensure(); }, [actions, visible]);
  const candidates = useUpdates(state => state.candidates);
  const lookups = useUpdates(state => state.lookups);
  const operation = useUpdates(state => state.operation);
  const busy = isBusy(operation);
  const targets = new Map<string, string>();
  for (const candidate of candidates) {
    const target = updateTarget(candidate, lookups[candidate.name]);
    if (target !== undefined && candidate.name !== SELF) targets.set(candidate.name, target);
  }
  const portals: ReactNode[] = [];
  if (anchors.status !== undefined && operation !== undefined) {
    portals.push(createPortal(
      <OperationBanner t={t} operation={operation} actions={actions} />,
      anchors.status,
      'operation',
    ));
  }
  if (anchors.head !== undefined && targets.size > 0) {
    portals.push(createPortal(
      <Button size="sm" variant="outline" icon={<IconDownloadOutlineRegular size={13} />} disabled={busy} onClick={() => { void actions.updateAll(); }}>
        {t('updateAllCount', { count: targets.size })}
      </Button>,
      anchors.head,
      'head',
    ));
  }
  for (const [name, node] of anchors.cards) {
    const target = targets.get(name);
    if (target === undefined) continue;
    const running = busy && operation?.name === name;
    portals.push(createPortal(
      <Button size="sm" variant="outline" disabled={busy} aria-label={t('updateLabel', { name, version: target })} onClick={() => { void actions.install(name, target); }}>
        {running ? t('updating') : t('updateTo', { version: target })}
      </Button>,
      node,
      name,
    ));
  }
  return <>{portals}</>;
}
