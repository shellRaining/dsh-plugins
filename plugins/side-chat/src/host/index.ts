// dsh-side-chat host half: mounts the side-chat JSON routes and the SSE route
// on the DSH web server and owns the ephemeral side sessions.
//
// Each side conversation is an ephemeral Agent seeded with the parent's
// completed-turn prefix. It inherits the parent's preset composition, working
// directory, model route, sandbox mode and approval policy, can really modify
// files in the same workspace, never writes the parent's transcript and never
// appears in the session list.

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { JsonRoute, Result, RouteMap } from '../shared/protocol.ts';
import { API_PREFIX, EVENTS_ROUTE, JSON_ROUTES, PLUGIN_NAME } from '../shared/protocol.ts';
import { routeHandler } from './http.ts';
import { SideChatService } from './service.ts';
import type { Disposer, ExactRoute, HostContext } from './types.ts';
import type { UnknownRecord } from './util.ts';
import { errorMessage, toDisposer } from './util.ts';

export const name = PLUGIN_NAME;

export const inject = ['webServer', 'agents'];

type JsonRouteTable = {
  readonly [R in JsonRoute]: (args: UnknownRecord) => Promise<Result<RouteMap[R][1]>>;
};

/**
 * Mount the side-chat routes and lifecycle cleanup.
 * @param ctx - the plugin context; `webServer` and `agents` are injected.
 */
export function apply(ctx: HostContext): void {
  const warn = (message: string): void => ctx.logger?.warn?.(`[side-chat] ${message}`);
  const service = new SideChatService(ctx);
  const webServer = ctx.webServer;
  if (webServer !== undefined && typeof webServer.register === 'function') {
    const routeDisposers: Disposer[] = [];
    const register = (route: ExactRoute): void => {
      try {
        const dispose = toDisposer(webServer.register?.(route));
        if (dispose !== undefined) routeDisposers.push(dispose);
      } catch (error) {
        warn(`route ${route.path} not registered: ${errorMessage(error)}`);
      }
    };
    const table: JsonRouteTable = {
      create: (args) => service.create(args),
      prompt: (args) => service.prompt(args),
      cancel: (args) => service.cancel(args),
      close: (args) => service.close(args),
      snapshot: (args) => service.snapshot(args),
    };
    for (const route of JSON_ROUTES) {
      register({ kind: 'exact', path: `${API_PREFIX}${route}`, handler: routeHandler(table[route], ctx.logger) });
    }
    // The event stream owns its response directly and is not a JSON route.
    register({
      kind: 'exact',
      path: `${API_PREFIX}${EVENTS_ROUTE}`,
      handler: (req: IncomingMessage, res: ServerResponse) =>
        service.openEventStream(req, res).catch((error: unknown) => {
          warn(`event stream failed: ${errorMessage(error)}`);
          try {
            res.end();
          } catch {
            // The carrier is already gone; there is nothing left to close.
          }
        }),
    });
    ctx.effect(() => () => {
      for (const dispose of routeDisposers) {
        try {
          dispose();
        } catch (error) {
          warn(`route disposal failed: ${errorMessage(error)}`);
        }
      }
      routeDisposers.length = 0;
    }, 'side-chat: routes');
  } else {
    warn('webServer is unavailable; the client RPC surface is not mounted');
  }
  ctx.effect(() => () => service.disposeAll(), 'side-chat: sessions');
}
