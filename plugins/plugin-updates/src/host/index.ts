// Host half: one authenticated route on the Host Connection that starts and
// reports a self-update. Every other operation runs in the browser through the
// plugin manager's remote methods.
import { SELF, SELF_UPDATE_PATH, type SelfUpdateResponse } from '../shared/protocol.ts';
import { SelfUpdater } from './self-update.ts';
import type { HostContext, PluginManager } from './types.ts';

export const name = SELF;
export const inject = ['connection', 'pluginManager', 'profileContext'];

const ORIGINAL = Symbol.for('cordis.original');

/**
 * The plugin manager itself, not the proxy bound to this plugin's context:
 * the job outlives this context, and calls through a disposed context's proxy
 * could resolve services against it.
 */
function unwrap(service: PluginManager): PluginManager {
  const original: unknown = Reflect.get(service, ORIGINAL);
  return typeof original === 'object' && original !== null ? original as PluginManager : service;
}

function json(body: SelfUpdateResponse): Response {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

export function apply(ctx: HostContext): void {
  const updater = new SelfUpdater(ctx.profileContext.dir, unwrap(ctx.pluginManager), ctx.logger);
  // Connection.fetch.register ties the route to this context's lifetime.
  ctx.connection.fetch.register({
    path: SELF_UPDATE_PATH,
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      try {
        if (request.method === 'GET') return json({ ok: true, status: await updater.status() });
        const body: unknown = await request.json().catch(() => null);
        const version = typeof body === 'object' && body !== null ? Reflect.get(body, 'version') : undefined;
        return json(await updater.start(version));
      } catch (error) {
        ctx.logger.warn('[plugin-updates] self-update route failed: %s', error instanceof Error ? error.message : String(error));
        return json({ ok: false, code: 'internal', message: error instanceof Error ? error.message : String(error) });
      }
    },
  });
}
