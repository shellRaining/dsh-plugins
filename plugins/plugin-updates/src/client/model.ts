// Version data for npm-installed plugins: which installed bundles came from
// npm, what the registry offers for them, and the one package operation
// (uninstall, then install an exact version) running at a time.
import gt from 'semver/functions/gt';
import prerelease from 'semver/functions/prerelease';
import rcompare from 'semver/functions/rcompare';
import satisfies from 'semver/functions/satisfies';
import valid from 'semver/functions/valid';
import validRange from 'semver/ranges/valid';
import type { Bundle, ChangeResult, ClientContext, RemoteResult, Source } from './host.ts';

export const SELF = '@shellraining/dsh-plugin-updates';
const DEFAULT_REGISTRY = 'https://registry.npmjs.org/';
const CACHE_MS = 10 * 60_000;
const FRESH_MS = 24 * 60 * 60_000;

export interface VersionInfo {
  readonly version: string;
  readonly published?: number;
  readonly deprecated: boolean;
  readonly prerelease: boolean;
  readonly compatible: boolean;
  readonly fresh: boolean;
}

export type Lookup =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly reason: string }
  | { readonly status: 'ready'; readonly registry: string; readonly versions: readonly VersionInfo[]; readonly latest?: string; readonly at: number };

/** An installed bundle whose profile dependency is an npm name with a semver range. */
export interface Candidate {
  readonly name: string;
  readonly title: string;
  readonly icon?: string;
  readonly version: string;
  readonly enabled: boolean;
}

export type OperationPhase = 'checking' | 'removing' | 'installing' | 'current' | 'done' | 'restart' | 'failed' | 'remove-failed' | 'check-failed';

export interface Operation {
  readonly name: string;
  readonly from: string;
  readonly to: string;
  readonly enabled: boolean;
  readonly phase: OperationPhase;
  readonly restoring: boolean;
  /** Only offer recovery after confirming the old bundle was removed. */
  readonly recoverable?: boolean;
  readonly reason?: string;
  readonly output?: string;
  readonly logPath?: string;
  /** Distinguishes one outcome toast from the next; cleared when the toast is done. */
  readonly toast?: number;
}

export interface UpdatesState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly candidates: readonly Candidate[];
  readonly lookups: Readonly<Record<string, Lookup>>;
  readonly operation?: Operation | undefined;
}

/** The newest stable, compatible, non-deprecated version above the installed one. */
export function updateTarget(candidate: Candidate, lookup: Lookup | undefined): string | undefined {
  if (lookup?.status !== 'ready') return undefined;
  const best = lookup.versions.find(info => info.compatible && !info.prerelease && !info.deprecated);
  return best !== undefined && gt(best.version, candidate.version) ? best.version : undefined;
}

export function isBusy(operation: Operation | undefined): boolean {
  return operation?.phase === 'checking' || operation?.phase === 'removing' || operation?.phase === 'installing';
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null ? value as Readonly<Record<string, unknown>> : {};
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** pnpm may print successful checks before the actual error. Keep the full output separately. */
function failureReason(result: RemoteResult<ChangeResult>): string {
  if (!result.ok) return result.error.message;
  const { error, packageResult, application } = result.value;
  const diagnostic = error?.diagnostic?.trim();
  const lines = (diagnostic || packageResult?.output || '').split('\n').map(line => line.trim()).filter(Boolean);
  const failure = lines.find(line => /\bERR[_!\s]|\berror\b|\bfatal\b/i.test(line));
  return failure ?? error?.code ?? diagnostic ?? application;
}

/** `name@range` as pnpm records a registry dependency; git, link, file and tarball sources do not parse. */
function npmInstalled(bundle: Bundle): boolean {
  const prefix = `${bundle.name}@`;
  return bundle.installed && !bundle.official && bundle.availability === 'profile' && bundle.removable
    && bundle.readOnlyReason === undefined && valid(bundle.version ?? '') !== null
    && bundle.source?.startsWith(prefix) === true && validRange(bundle.source.slice(prefix.length)) !== null;
}

/** The DSH requirements check app-boot applies: an own `engines.dsh`, otherwise every DSH peer. */
function compatibleWith(manifest: Readonly<Record<string, unknown>>, runtime: string | undefined): boolean {
  if (runtime === undefined) return true;
  const fits = (range: unknown): boolean => typeof range === 'string' && range.trim() !== ''
    && satisfies(runtime, range, { includePrerelease: true });
  const engines = record(manifest['engines']);
  if (Object.hasOwn(engines, 'dsh')) return fits(engines['dsh']);
  return Object.entries(record(manifest['peerDependencies']))
    .filter(([name]) => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-'))
    .every(([, range]) => typeof range === 'string' && range.startsWith('workspace:') ? true : fits(range));
}

function packumentUrl(registry: string, name: string): string {
  return `${registry.endsWith('/') ? registry : `${registry}/`}${name.replace('/', '%2f')}`;
}

/** The running DSH version: the boot graph's release, which shares the CLI's version number. */
function runtimeVersion(ctx: ClientContext): string | undefined {
  const modules = record(ctx.get('modules'));
  const version = record(record(modules['manifest'])['release'])['version'];
  return typeof version === 'string' && valid(version) !== null ? version : undefined;
}

export class UpdatesStore implements Source<UpdatesState> {
  private state: UpdatesState = { status: 'idle', candidates: [], lookups: {} };
  private readonly listeners = new Set<() => void>();
  private generation = 0;
  private disposed = false;
  private registries: readonly string[] | undefined;
  private exemptions: Readonly<Record<string, readonly string[]>> = {};

  constructor(private readonly ctx: ClientContext) {}

  readonly getSnapshot = (): UpdatesState => this.state;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }

  private patch(next: Partial<UpdatesState>): void {
    if (this.disposed) return;
    this.state = { ...this.state, ...next };
    for (const listener of [...this.listeners]) listener();
  }

  private setLookup(name: string, lookup: Lookup): void {
    this.patch({ lookups: { ...this.state.lookups, [name]: lookup } });
  }

  /** A page opened: read the list the first time, after a failure, and once a lookup is older than the cache. */
  readonly ensure = (): void => {
    const now = Date.now();
    const stale = Object.values(this.state.lookups).some(lookup => lookup.status === 'ready' && now - lookup.at > CACHE_MS);
    if (this.state.status === 'idle' || this.state.status === 'error' || (this.state.status === 'ready' && stale)) void this.load();
  };

  /** Re-read the list after a Host change; lookups stay cached. */
  readonly bundlesChanged = (): void => {
    if (this.state.status !== 'idle') void this.load();
  };

  private async load(): Promise<void> {
    try {
      await this.loadBundles();
    } catch {
      if (!this.disposed) this.patch({ status: 'error' });
    }
  }

  private async loadBundles(): Promise<void> {
    const generation = ++this.generation;
    this.patch({ status: this.state.status === 'ready' ? 'ready' : 'loading' });
    const pm = this.ctx.remote.pluginManager;
    if (this.registries === undefined) {
      const [registries, exemptions] = await Promise.all([pm.registries(), pm.listVersionExemptions()]);
      if (registries.ok) {
        const first = registries.value.registry ?? registries.value.resolved ?? DEFAULT_REGISTRY;
        this.registries = [...new Set([first, ...registries.value.fallbackRegistries])];
      }
      if (exemptions.ok) this.exemptions = exemptions.value.exemptions;
    }
    const listed = await pm.listBundles();
    if (generation !== this.generation) return;
    if (!listed.ok) {
      this.patch({ status: 'error' });
      return;
    }
    const resolve = (text: string | Readonly<Record<string, string>> | undefined): string | undefined =>
      text === undefined ? undefined : this.ctx.locale.resolveText(text);
    const npm = listed.value.filter(npmInstalled);
    const candidates = npm.map((bundle): Candidate => {
      const icon = bundle.meta?.icon;
      return {
        name: bundle.name,
        title: resolve(bundle.meta?.title) ?? bundle.name,
        version: bundle.version ?? '',
        enabled: bundle.enabled,
        ...icon === undefined ? {} : { icon },
      };
    }).sort((a, b) => a.title.localeCompare(b.title));
    this.patch({ status: 'ready', candidates });
    const now = Date.now();
    for (const candidate of candidates) {
      const lookup = this.state.lookups[candidate.name];
      const stale = lookup === undefined || lookup.status === 'error' || (lookup.status === 'ready' && now - lookup.at > CACHE_MS);
      if (stale) void this.lookup(candidate.name);
    }
  }

  private async lookup(name: string): Promise<void> {
    this.setLookup(name, { status: 'loading' });
    const runtime = runtimeVersion(this.ctx);
    let reason = '';
    for (const registry of this.registries ?? [DEFAULT_REGISTRY]) {
      try {
        const response = await fetch(packumentUrl(registry, name), { headers: { accept: 'application/json' }, credentials: 'omit' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = record(await response.json());
        const times = record(body['time']);
        const now = Date.now();
        const versions = Object.entries(record(body['versions']))
          .filter(([version]) => valid(version) !== null)
          .map(([version, manifest]): VersionInfo => {
            const fields = record(manifest);
            const stamp = typeof times[version] === 'string' ? Date.parse(times[version]) : Number.NaN;
            const exempted = runtime !== undefined && this.exemptions[`${name}@${version}`]?.includes(runtime) === true;
            return {
              version,
              ...Number.isNaN(stamp) ? {} : { published: stamp },
              deprecated: typeof fields['deprecated'] === 'string',
              prerelease: prerelease(version) !== null,
              compatible: exempted || compatibleWith(fields, runtime),
              fresh: !Number.isNaN(stamp) && now - stamp < FRESH_MS,
            };
          })
          .sort((a, b) => rcompare(a.version, b.version));
        const latest = record(body['dist-tags'])['latest'];
        this.setLookup(name, { status: 'ready', registry, versions, at: now, ...typeof latest === 'string' ? { latest } : {} });
        return;
      } catch (error) {
        reason = `${new URL(registry).host}: ${errorText(error)}`;
      }
    }
    this.setLookup(name, { status: 'error', reason });
  }

  /** Switch one plugin to `version`: uninstall it, then install that exact version with its enabled state. */
  readonly install = async (name: string, version: string): Promise<boolean> => {
    const candidate = this.state.candidates.find(item => item.name === name);
    if (this.disposed || candidate === undefined || name === SELF || isBusy(this.state.operation) || valid(version) === null) return false;
    return this.run({ name, from: candidate.version, to: version, enabled: candidate.enabled, restoring: false }, true);
  };

  /** Put back the version a failed switch removed; the plugin is no longer installed, so only install. */
  readonly restore = async (): Promise<void> => {
    const failed = this.state.operation;
    if (this.disposed || failed?.phase !== 'failed' || !failed.recoverable) return;
    await this.run({ name: failed.name, from: failed.from, to: failed.from, enabled: failed.enabled, restoring: true }, false);
  };

  /** The outcome toast finished; the banner in the tab keeps the result. */
  readonly toastDone = (): void => {
    const operation = this.state.operation;
    if (operation?.toast !== undefined) {
      const { toast: _toast, ...rest } = operation;
      this.patch({ operation: rest });
    }
  };

  readonly dismiss = (): void => {
    if (!isBusy(this.state.operation)) this.patch({ operation: undefined });
  };

  /** Update every plugin with a newer version, one at a time; stops at the first failure. */
  readonly updateAll = async (): Promise<void> => {
    for (const candidate of this.state.candidates) {
      const target = updateTarget(candidate, this.state.lookups[candidate.name]);
      if (target === undefined || candidate.name === SELF) continue;
      if (!await this.install(candidate.name, target)) return;
    }
  };

  private async run(base: Omit<Operation, 'phase'>, remove: boolean): Promise<boolean> {
    const pm = this.ctx.remote.pluginManager;
    let failurePhase: 'check-failed' | 'failed' | 'remove-failed' = 'check-failed';
    let recoverable = false;
    const fail = (result: RemoteResult<ChangeResult>): false => {
      const value = result.ok ? result.value : undefined;
      const output = value?.packageResult?.output.trim() || value?.error?.diagnostic;
      const logPath = value?.packageResult?.logPath;
      this.patch({ operation: {
        ...base, phase: failurePhase, recoverable, reason: failureReason(result), toast: Date.now(),
        ...output ? { output } : {}, ...logPath ? { logPath } : {},
      } });
      return false;
    };
    this.patch({ operation: { ...base, phase: 'checking' } });
    try {
      // Re-read before any destructive step: a button or recovery banner may be stale.
      const listed = await pm.listBundles();
      if (this.disposed) return false;
      if (!listed.ok) return fail(listed);
      const current = listed.value.find(bundle => bundle.name === base.name && bundle.installed);
      if (current !== undefined && valid(current.version ?? '') === valid(base.to)) {
        this.patch({ operation: { ...base, phase: 'current', toast: Date.now() } });
        return true;
      }
      if (remove) {
        if (current === undefined || !npmInstalled(current)) {
          return fail({ ok: true, value: { application: 'failed', error: { code: 'plugin-state-changed' } } });
        }
        const declared = valid(current.source?.slice(`${base.name}@`.length) ?? '');
        if (declared !== null && declared !== valid(current.version ?? '')) {
          return fail({ ok: true, value: { application: 'failed', error: { code: 'installation-inconsistent' } } });
        }
        base = { ...base, from: current.version ?? base.from, enabled: current.enabled };
        failurePhase = 'remove-failed';
        this.patch({ operation: { ...base, phase: 'removing' } });
        const removed = await pm.removeBundle(base.name);
        // Without HMR, remove refuses the active bundle; install can overwrite it instead.
        const stopProfile = removed.ok && removed.value.error?.code === 'stop-profile';
        if (!stopProfile && (!removed.ok || removed.value.application === 'failed' || removed.value.application === 'cancelled')) {
          return fail(removed);
        }
        recoverable = !stopProfile;
      } else {
        // Never overwrite a plugin installed elsewhere after a failed update.
        if (current !== undefined) {
          return fail({ ok: true, value: { application: 'failed', error: { code: 'plugin-state-changed' } } });
        }
        recoverable = true;
      }
      if (this.disposed) return false;
      failurePhase = 'failed';
      this.patch({ operation: { ...base, phase: 'installing' } });
      const installed = await pm.installBundle(`${base.name}@${base.to}`, {
        enabled: base.enabled,
        saveExact: true,
        requestId: `${SELF}:${Date.now()}`,
      });
      if (!installed.ok || installed.value.application === 'failed' || installed.value.application === 'cancelled') {
        return fail(installed);
      }
      const to = installed.value.version ?? base.to;
      this.patch({ operation: { ...base, to, toast: Date.now(), phase: installed.value.application === 'restart-required' ? 'restart' : 'done' } });
      return true;
    } catch (error) {
      return fail({ ok: false, error: { message: errorText(error) } });
    } finally {
      // Host notifications can race with completion or be missed after a reconnect.
      if (!this.disposed) await this.load();
    }
  }
}
