// Update this plugin from inside the host process. Uninstalling a plugin
// unloads it, so a browser-driven "remove, then install" loses its second
// step when it removes itself. The job here starts on a request, keeps the
// plugin manager it was given, and finishes after this plugin's own context is
// gone: remove, install the exact version, and on failure put the previous
// version back. Progress lives in a file beside the profile so the next
// loaded copy of the plugin can report the outcome.
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { errorLine, isRunning, SELF, type SelfUpdatePhase, type SelfUpdateResponse, type SelfUpdateStatus } from '../shared/protocol.ts';
import type { Bundle, ChangeResult, Logger, PluginManager } from './types.ts';

/** A run whose file still says running after this long was cut short by a host exit. */
const STALE_MS = 15 * 60_000;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

interface Stored extends SelfUpdateStatus {
  readonly startedAt: number;
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null ? value as Readonly<Record<string, unknown>> : {};
}

function text(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function failed(result: ChangeResult): boolean {
  return result.application === 'failed' || result.application === 'cancelled';
}

/** The first error line, then the refusal code, then the outcome. */
function reasonOf(result: ChangeResult): string {
  const output = result.error?.diagnostic ?? result.packageResult?.output ?? '';
  return errorLine(output) ?? result.error?.code ?? (output.trim() || result.application);
}

/** The full output and log of a failed step, kept for the page to show. */
function details(result: ChangeResult): Pick<SelfUpdateStatus, 'output' | 'logPath'> {
  const output = (result.packageResult?.output.trim() || result.error?.diagnostic)?.slice(-8000);
  const logPath = result.packageResult?.logPath;
  return { ...output ? { output } : {}, ...logPath ? { logPath } : {} };
}

/** A registry dependency recorded as `name@exact-or-range`; other sources are not ours to replace. */
function npmVersion(bundle: Bundle | undefined): string | undefined {
  if (bundle === undefined || !bundle.installed || !bundle.removable) return undefined;
  if (bundle.source?.startsWith(`${SELF}@`) !== true || bundle.version === undefined) return undefined;
  return VERSION.test(bundle.version) ? bundle.version : undefined;
}

export class SelfUpdater {
  private readonly file: string;
  private running = false;

  constructor(profileDir: string, private readonly manager: PluginManager, private readonly logger: Logger) {
    this.file = join(profileDir, '.dsh-plugin-updates', 'self-update.json');
  }

  async status(): Promise<SelfUpdateStatus | null> {
    let stored: Readonly<Record<string, unknown>>;
    try {
      stored = record(JSON.parse(await readFile(this.file, 'utf8')));
    } catch {
      return null;
    }
    const { id, from, to, phase, startedAt } = stored;
    if (typeof id !== 'string' || typeof from !== 'string' || typeof to !== 'string' || typeof phase !== 'string') return null;
    const status = stored as unknown as SelfUpdateStatus;
    // A host exit in the middle leaves "running" behind; report it as unfinished.
    if (isRunning(status) && !this.running && typeof startedAt === 'number' && Date.now() - startedAt > STALE_MS) {
      return { ...status, phase: 'failed', reason: 'interrupted' };
    }
    return status;
  }

  async start(version: unknown): Promise<SelfUpdateResponse> {
    if (typeof version !== 'string' || !VERSION.test(version)) return { ok: false, code: 'invalid-version' };
    if (this.running || isRunning(await this.status())) return { ok: false, code: 'busy' };
    const from = npmVersion((await this.manager.listBundles()).find(bundle => bundle.name === SELF));
    if (from === undefined) return { ok: false, code: 'not-npm' };
    if (from === version) return { ok: false, code: 'current' };
    const id = randomUUID();
    const startedAt = Date.now();
    const base = { id, from, to: version, startedAt };
    this.running = true;
    await this.save({ ...base, phase: 'removing' });
    // Not awaited: removing this plugin disposes the context that serves this request.
    void this.run(base).finally(() => { this.running = false; });
    return { ok: true, status: { id, from, to: version, phase: 'removing' } };
  }

  private async run(base: Omit<Stored, 'phase'>): Promise<void> {
    const step = (phase: SelfUpdatePhase, extra: Partial<SelfUpdateStatus> = {}): Promise<void> =>
      this.save({ ...base, ...extra, phase, ...isRunning({ ...base, phase }) ? {} : { finishedAt: Date.now() } });
    try {
      const removed = await this.manager.removeBundle(SELF);
      if (failed(removed)) {
        // Removal deselects the bundle before pnpm runs; turn it back on if pnpm then failed.
        await this.reselect();
        await step('failed', { reason: reasonOf(removed), ...details(removed) });
        return;
      }
      await step('installing');
      const installed = await this.manager.installBundle(`${SELF}@${base.to}`, { enabled: true, saveExact: true });
      if (!failed(installed)) {
        await step(installed.application === 'restart-required' ? 'restart' : 'done', { to: installed.version ?? base.to });
        return;
      }
      const failure = { reason: reasonOf(installed), ...details(installed) };
      await step('restoring', failure);
      const restored = await this.manager.installBundle(`${SELF}@${base.from}`, { enabled: true, saveExact: true });
      if (failed(restored)) {
        this.logger.warn('[plugin-updates] could not restore %s@%s: %s', SELF, base.from, reasonOf(restored));
        await step('failed', { ...failure, reason: `${failure.reason}\n${reasonOf(restored)}` });
        return;
      }
      await step('restored', failure);
    } catch (error) {
      this.logger.warn('[plugin-updates] self-update stopped: %s', text(error));
      await step('failed', { reason: text(error) }).catch(() => undefined);
    }
  }

  private async reselect(): Promise<void> {
    const bundle = (await this.manager.listBundles()).find(item => item.name === SELF);
    if (bundle?.installed === true && !bundle.enabled) await this.manager.setBundleEnabled(SELF, true);
  }

  private async save(status: Stored): Promise<void> {
    const dir = join(this.file, '..');
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const temp = `${this.file}.${process.pid}.tmp`;
    await writeFile(temp, `${JSON.stringify(status, null, 2)}\n`, { mode: 0o600 });
    await rename(temp, this.file);
  }
}
