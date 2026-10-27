// HTTP access to the host half. Every JSON route answers 200 with a `Result`;
// a non-ok result or a transport failure surfaces as `HostError`.
import { API_PREFIX, type FailureCode, type RouteMap } from '../shared/protocol.ts';

export type ErrorCode = FailureCode | 'network' | 'unknown';

export class HostError extends Error {
  constructor(readonly code: ErrorCode, message = '') {
    super(message);
    this.name = 'HostError';
  }
}

const KNOWN_CODES: ReadonlySet<string> = new Set<FailureCode>([
  'unknown-source', 'not-found', 'empty-prompt', 'create-failed', 'prompt-failed', 'dispose-failed', 'internal',
]);

/** Narrow any thrown value to a `HostError`. */
export function toHostError(error: unknown): HostError {
  if (error instanceof HostError) return error;
  if (error instanceof DOMException && error.name === 'AbortError') return new HostError('network', 'aborted');
  if (error instanceof TypeError) return new HostError('network', error.message);
  return new HostError('unknown', error instanceof Error ? error.message : String(error));
}

/** Map a non-ok payload (or none) to a `HostError`. */
export function failureOf(payload: unknown, status?: number): HostError {
  const value = payload !== null && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const code = typeof value.code === 'string' && KNOWN_CODES.has(value.code) ? value.code as FailureCode : 'unknown';
  const message = typeof value.message === 'string' ? value.message : status !== undefined ? `HTTP ${status}` : '';
  return new HostError(code, message);
}

export function routeUrl(name: string): string {
  return `${API_PREFIX}${name}`;
}

/** POST one JSON route and return its success payload. */
export async function call<K extends keyof RouteMap>(name: K, body: RouteMap[K][0], signal?: AbortSignal): Promise<RouteMap[K][1]> {
  let response: Response;
  try {
    response = await fetch(routeUrl(name), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
      ...(signal === undefined ? {} : { signal }),
    });
  } catch (error) {
    throw toHostError(error);
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const ok = payload !== null && typeof payload === 'object' && (payload as { ok?: unknown }).ok === true;
  if (!response.ok || !ok) throw failureOf(payload, response.ok ? undefined : response.status);
  return payload as RouteMap[K][1];
}
