// HTTP carrier helpers: bounded body reading, JSON responses, the JSON route
// wrapper and SSE framing. Every route answers 200; failures travel inside the
// protocol `Result` so the client has one decoding path.

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Result, StreamFrameMap, StreamFrameName } from '../shared/protocol.ts';
import type { Logger, RouteHandler } from './types.ts';
import type { UnknownRecord } from './util.ts';
import { errorMessage, failure, isRecord } from './util.ts';

export const MAX_REQUEST_BODY_BYTES = 1024 * 1024;

/**
 * Headers of a raw `text/event-stream` response. `no-transform` and
 * `X-Accel-Buffering: no` keep intermediate proxies from buffering the stream
 * into batches, and `Connection: keep-alive` keeps the response open.
 */
export const SSE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
});

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return isRecord(value) && typeof Reflect.get(value, Symbol.asyncIterator) === 'function';
}

/**
 * Read the whole request body as UTF-8. Bytes are counted before decoding, and
 * decoding happens once so a multi-byte character split across chunks survives.
 * @param req - the raw Node request.
 * @returns the decoded body; '' when the request is not readable.
 * @throws when the body exceeds {@link MAX_REQUEST_BODY_BYTES}.
 */
export async function readRequestBody(req: IncomingMessage): Promise<string> {
  if (!isAsyncIterable(req)) return '';
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    let bytes: Buffer;
    if (typeof chunk === 'string') bytes = Buffer.from(chunk, 'utf8');
    else if (chunk instanceof Uint8Array) bytes = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    else throw new Error('request body chunk is not binary or text');
    size += bytes.byteLength;
    if (size > MAX_REQUEST_BODY_BYTES) throw new Error('request body exceeds the size limit');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, size).toString('utf8');
}

/**
 * Read and parse a JSON request body; a blank body is an empty object.
 * @param req - the raw Node request.
 * @returns the parsed value, not yet checked to be an object.
 */
export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const body = await readRequestBody(req);
  return body.trim() === '' ? {} : JSON.parse(body);
}

/** Whether a parsed body is a JSON object (not an array). */
export function isJsonObject(value: unknown): value is UnknownRecord {
  return isRecord(value) && !Array.isArray(value);
}

/** Write one protocol result as a 200 JSON response. */
export function sendJson(res: ServerResponse, value: Result<object>): void {
  let body: string;
  try {
    body = JSON.stringify(value);
  } catch {
    body = JSON.stringify(failure('internal', 'response is not JSON-serializable'));
  }
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

/** `sendJson` for paths that must never throw: a gone carrier is only logged. */
export function trySendJson(res: ServerResponse, value: Result<object>, logger?: Logger): void {
  try {
    sendJson(res, value);
  } catch (error) {
    logger?.warn?.(`[side-chat] response write failed: ${errorMessage(error)}`);
  }
}

/**
 * Wrap one service call as a POST JSON route handler. Request parsing failures
 * and thrown handler errors are folded into `{ ok: false, code, message }` on a
 * 200 JSON response; the handler never throws into the HTTP carrier.
 * @param handler - async `(args) => result`; a non-object body yields `{}`.
 * @param logger - optional logger used for contained internal failures.
 * @returns the `(req, res)` route handler.
 */
export function routeHandler(
  handler: (args: UnknownRecord) => Promise<Result<object>>,
  logger?: Logger,
): RouteHandler {
  return async function sideChatRoute(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let args: UnknownRecord = {};
    try {
      const parsed = await readJsonBody(req);
      if (isJsonObject(parsed)) args = parsed;
    } catch (error) {
      logger?.warn?.(`[side-chat] rejected request: ${errorMessage(error)}`);
      trySendJson(res, failure('internal', `invalid request body: ${errorMessage(error)}`), logger);
      return;
    }
    let result: Result<object>;
    try {
      result = await handler(args);
    } catch (error) {
      logger?.warn?.(`[side-chat] route handler failed: ${errorMessage(error)}`);
      result = failure('internal', errorMessage(error));
    }
    trySendJson(res, result, logger);
  };
}

/**
 * One SSE frame: a named event with one line of JSON data.
 * @param eventName - the SSE `event:` name.
 * @param value - the JSON-serializable `data:` payload.
 * @returns the complete frame text.
 * @throws when the payload is not JSON-serializable.
 */
export function sseFrame<K extends StreamFrameName>(eventName: K, value: StreamFrameMap[K]): string {
  return `event: ${eventName}\ndata: ${JSON.stringify(value)}\n\n`;
}

/** SSE comment line keeping idle connections and intermediary proxies alive. */
export const SSE_HEARTBEAT = ': ping\n\n';
