// Wire contract between the host half (src/host) and the client half
// (src/client) for updating this plugin itself. Type-only plus constants.

export const SELF = '@shellraining/dsh-plugin-updates';

/**
 * Authenticated Connection route: GET reads the last self-update, POST starts
 * one. Browser-relative, like the host's own `/api/*` routes.
 */
export const SELF_UPDATE_PATH = '/api/dsh-plugin-updates.self-update';

export type SelfUpdatePhase =
  | 'removing'
  | 'installing'
  | 'restoring'
  | 'done'
  | 'restart'
  | 'restored'
  | 'failed';

export interface SelfUpdateStatus {
  /** Distinguishes one run from the next, so a reloaded page reports a result once. */
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly phase: SelfUpdatePhase;
  readonly reason?: string;
  readonly output?: string;
  readonly logPath?: string;
  readonly finishedAt?: number;
}

export type SelfUpdateRefusal = 'invalid-version' | 'busy' | 'not-npm' | 'current' | 'internal';

export type SelfUpdateResponse =
  | { readonly ok: true; readonly status: SelfUpdateStatus | null }
  | { readonly ok: false; readonly code: SelfUpdateRefusal; readonly message?: string };

export function isRunning(status: SelfUpdateStatus | null | undefined): boolean {
  return status?.phase === 'removing' || status?.phase === 'installing' || status?.phase === 'restoring';
}

/** pnpm may print successful checks before the actual error; pick the first error line. */
export function errorLine(text: string): string | undefined {
  return text.split('\n').map(line => line.trim()).filter(Boolean)
    .find(line => /\bERR[_!\s]|\berror\b|\bfatal\b/i.test(line));
}
