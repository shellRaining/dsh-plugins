/**
 * Session-title provider that asks the model for the meaningful parts of a
 * title (an optional `type` and a plain-language `summary`) and assembles them
 * with the segments, separator and date format the user configured.
 *
 * When the model reply is unusable the call throws, and the session service
 * keeps whatever title it already has.
 */
import type { Context } from "@deepseek-ai/cordis";
import type { RequestUserInput, StreamChunk } from "@deepseek-ai/dsh-llm";
import type {
  SessionTitleProviderId,
  SessionTitleProviderRequest,
  SessionTitleProviderResult,
} from "@deepseek-ai/dsh-session-title";
import {
  buildSystemPrompt,
  formatDate,
  parseModelOutput,
  renderTitle,
  resolveConfig,
  selectMessages,
  type Config,
  type ResolvedConfig,
} from "./format.ts";

export type { Config } from "./format.ts";

export const name = "session-title-layout";

export const inject = ["sessionTitle", "llm"];

// The brand constructor is an identity function; a cast keeps the built output
// free of runtime imports from Harness packages.
const PROVIDER_ID = name as SessionTitleProviderId;

async function collectText(stream: AsyncIterable<StreamChunk>): Promise<string> {
  let text = "";
  for await (const chunk of stream) {
    if (chunk.type === "text-delta") {
      text += chunk.text;
    } else if (chunk.type === "finish") {
      const reason = chunk.reason;
      if (reason.kind === "error" || reason.kind === "aborted") {
        throw new Error(`${name}: title model call failed: ${reason.failure.message}`);
      }
      if (reason.kind !== "stop" && reason.kind !== "max-tokens") {
        throw new Error(`${name}: unexpected finish reason "${reason.kind}"`);
      }
    }
  }
  return text;
}

function resolveRoute(
  config: ResolvedConfig,
  request: SessionTitleProviderRequest,
): { provider: string; model: string } {
  const route = config.route ?? request.route;
  if (route === undefined) {
    throw new Error(`${name}: no model route; set provider and model in the plugin config`);
  }
  return { provider: route.provider, model: route.model };
}

async function generate(
  ctx: Context,
  config: ResolvedConfig,
  request: SessionTitleProviderRequest,
): Promise<SessionTitleProviderResult> {
  const route = resolveRoute(config, request);
  const selected = selectMessages(request.messages, config.maxInputChars);
  if (selected.length === 0) {
    throw new Error(`${name}: no eligible messages`);
  }

  const input: RequestUserInput = {
    role: "user",
    content: [
      {
        type: "text",
        text: JSON.stringify(selected.map((entry) => ({ text: entry.text }))),
      },
    ],
  };

  const stream = ctx.llm.stream({
    provider: route.provider,
    model: route.model,
    messages: [input],
    system: buildSystemPrompt(config),
    maxTokens: config.maxOutputTokens,
    sessionId: request.session.id,
    purpose: "session-title",
    signal: AbortSignal.any([request.signal, AbortSignal.timeout(config.timeoutMs)]),
  });

  const parts = parseModelOutput(await collectText(stream), config);

  const dateInstant =
    config.dateSource === "now" ? Date.now() : request.session.header.createdAt;

  return {
    title: renderTitle(parts, formatDate(dateInstant, config.dateFormat), config),
    messageSeqs: selected.map((entry) => entry.message.seq),
    model: route,
  };
}

export function apply(ctx: Context, rawConfig: Config = {}): void {
  const config = resolveConfig(rawConfig);

  ctx.effect(
    () =>
      ctx.sessionTitle.register({
        id: PROVIDER_ID,
        automatic: config.automatic,
        generate: (request) => generate(ctx, config, request),
      }),
    `${name}: provider`,
  );
}
