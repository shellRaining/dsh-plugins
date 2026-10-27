import assert from "node:assert/strict";
import { test } from "node:test";
import type { Context } from "@deepseek-ai/cordis";
import type { StreamChunk } from "@deepseek-ai/dsh-llm";
import type {
  SessionTitleProvider,
  SessionTitleProviderRequest,
} from "@deepseek-ai/dsh-session-title";
import { apply, inject, name, type Config } from "../src/index.ts";

interface Harness {
  provider: SessionTitleProvider;
  calls: Record<string, unknown>[];
  unregistered: () => boolean;
  dispose: () => void;
}

/** Mount the plugin on a fake context whose model replies with `reply`. */
function mount(config: Config, reply: string | Error): Harness {
  const calls: Record<string, unknown>[] = [];
  let provider: SessionTitleProvider | undefined;
  let unregistered = false;
  let dispose: () => void = () => {};

  const ctx = {
    effect(setup: () => () => unknown) {
      const teardown = setup();
      dispose = () => void teardown();
      return dispose;
    },
    sessionTitle: {
      register(candidate: SessionTitleProvider) {
        provider = candidate;
        return async () => {
          unregistered = true;
        };
      },
    },
    llm: {
      stream(options: Record<string, unknown>): AsyncIterable<StreamChunk> {
        calls.push(options);
        return (async function* () {
          if (reply instanceof Error) {
            yield {
              type: "finish",
              reason: { kind: "error", failure: { message: reply.message } },
            } as unknown as StreamChunk;
            return;
          }
          yield { type: "text-delta", index: 0, text: reply };
          yield { type: "finish", reason: { kind: "stop" } };
        })();
      },
    },
  } as unknown as Context;

  apply(ctx, config);
  assert.ok(provider, "provider registered");
  return { provider, calls, unregistered: () => unregistered, dispose: () => dispose() };
}

function request(options: { route?: boolean } = {}): SessionTitleProviderRequest {
  const withRoute = options.route ?? true;
  return {
    session: { id: "s-1", header: { createdAt: new Date(2026, 9, 22, 9).getTime() } },
    messages: [
      { seq: 1, text: "please rename the sidebar session title" },
      { seq: 4, text: "also support a fullwidth colon" },
    ],
    ...(withRoute ? { route: { provider: "main", model: "main-model" } } : {}),
    signal: new AbortController().signal,
  } as unknown as SessionTitleProviderRequest;
}

test("exports the Loader contract", () => {
  assert.equal(name, "session-title-layout");
  assert.deepEqual(inject, ["sessionTitle", "llm"]);
});

test("renders the configured layout from a model reply", async () => {
  const { provider, calls } = mount(
    { preset: "type-summary", separator: "：", summaryLanguage: "中文", automatic: "all-prompts" },
    '{"type":"feat","summary":"重命名侧边栏会话标题"}',
  );
  assert.equal(provider.automatic, "all-prompts");

  const result = await provider.generate(request());
  assert.equal(result.title, "feat：重命名侧边栏会话标题");
  assert.deepEqual(result.messageSeqs, [1, 4]);
  assert.deepEqual(result.model, { provider: "main", model: "main-model" });

  const call = calls[0];
  assert.equal(call?.["provider"], "main");
  assert.equal(call?.["purpose"], "session-title");
  assert.match(String(call?.["system"]), /in 中文/);
});

test("the date segment uses the session creation time by default", async () => {
  const { provider } = mount({}, '{"type":"fix","summary":"x"}');
  const result = await provider.generate(request());
  assert.equal(result.title, "fix/261022/x");
});

test("an explicit route overrides the session route", async () => {
  const { provider, calls } = mount(
    { provider: "aux", model: "small", preset: "summary" },
    '{"summary":"hello"}',
  );
  const result = await provider.generate(request());
  assert.equal(calls[0]?.["provider"], "aux");
  assert.deepEqual(result.model, { provider: "aux", model: "small" });
});

test("an unusable reply rejects so the service keeps the old title", async () => {
  const { provider } = mount({}, "sorry, I cannot do that");
  await assert.rejects(provider.generate(request()), /no JSON/);
});

test("a failed model call rejects with its message", async () => {
  const { provider } = mount({}, new Error("upstream 500"));
  await assert.rejects(provider.generate(request()), /upstream 500/);
});

test("missing route is an error, not a guess", async () => {
  const { provider } = mount({}, '{"type":"feat","summary":"x"}');
  await assert.rejects(
    provider.generate(request({ route: false })),
    /no model route/,
  );
});

test("invalid configuration fails at activation", () => {
  assert.throws(() => mount({ segments: ["type"] }, "{}"), /include "summary"/);
});

test("disposing the effect unregisters the provider", async () => {
  const harness = mount({}, "{}");
  assert.equal(harness.unregistered(), false);
  harness.dispose();
  assert.equal(harness.unregistered(), true);
});
