import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildSystemPrompt,
  formatDate,
  parseModelOutput,
  renderTitle,
  resolveConfig,
  selectMessages,
} from "../src/format.ts";

test("default preset is conventional with a date", () => {
  const config = resolveConfig();
  assert.deepEqual(config.segments, ["type", "date", "summary"]);
  assert.equal(config.separator, "/");
  assert.equal(config.dateFormat, "YYMMDD");
});

test("presets drop the date and the type", () => {
  assert.deepEqual(resolveConfig({ preset: "type-summary" }).segments, ["type", "summary"]);
  const plain = resolveConfig({ preset: "summary" });
  assert.deepEqual(plain.segments, ["summary"]);
  assert.equal(renderTitle({ type: undefined, summary: "修复登录跳转" }, "", plain), "修复登录跳转");
});

test("explicit segments and separator override the preset", () => {
  const config = resolveConfig({ preset: "summary", segments: ["date", "summary"], separator: " | " });
  assert.equal(renderTitle({ type: undefined, summary: "add login" }, "261022", config), "261022 | add login");
});

test("invalid configuration is rejected", () => {
  assert.throws(() => resolveConfig({ segments: ["type", "date"] }), /include "summary"/);
  assert.throws(() => resolveConfig({ segments: ["summary", "summary"] }), /unique/);
  assert.throws(() => resolveConfig({ provider: "a" }), /together/);
  assert.throws(() => resolveConfig({ summaryMaxLength: 0 }), /positive/);
  assert.throws(() => resolveConfig({ preset: "nope" as never }), /unknown preset/);
});

test("prompt asks only for the segments in use", () => {
  assert.match(buildSystemPrompt(resolveConfig()), /"type"/);
  assert.doesNotMatch(buildSystemPrompt(resolveConfig({ preset: "summary" })), /"type"/);
});

test("summary keeps the user's language and is not slugified", () => {
  const config = resolveConfig();
  const parts = parseModelOutput('{"type":"Feat","summary":"重命名 侧边栏 会话标题"}', config);
  assert.deepEqual(parts, { type: "feat", summary: "重命名 侧边栏 会话标题" });
});

test("model output is tolerated inside a fence or with commentary", () => {
  const config = resolveConfig({ preset: "summary" });
  assert.equal(parseModelOutput('```json\n{"summary":"  “Fix the build”  "}\n```', config).summary, "Fix the build");
});

test("summary is truncated by characters, not bytes", () => {
  const config = resolveConfig({ preset: "summary", summaryMaxLength: 4 });
  assert.equal(parseModelOutput('{"summary":"一二三四五六"}', config).summary, "一二三四");
});

test("unusable replies throw so the previous title stays", () => {
  const config = resolveConfig();
  assert.throws(() => parseModelOutput("feat/add-login", config), /no JSON/);
  assert.throws(() => parseModelOutput("{not json}", config), /not valid JSON/);
  assert.throws(() => parseModelOutput('{"type":"feat"}', config), /no summary/);
  assert.throws(() => parseModelOutput('{"type":"magic","summary":"x"}', config), /not allowed/);
  assert.throws(() => parseModelOutput("[]", config), /no JSON|not a JSON object/);
});

test("type is not required when it is not a segment", () => {
  const config = resolveConfig({ preset: "summary" });
  assert.equal(parseModelOutput('{"summary":"hello"}', config).type, undefined);
});

test("date formats", () => {
  const instant = new Date(2026, 9, 22, 12).getTime();
  assert.equal(formatDate(instant, "YYMMDD"), "261022");
  assert.equal(formatDate(instant, "YYYY-MM-DD"), "2026-10-22");
});

test("message selection keeps the first and the newest that fit", () => {
  const messages = ["a".repeat(10), "b".repeat(10), "c".repeat(10), "d".repeat(10)].map((text, seq) => ({ seq, text }));
  const picked = selectMessages(messages, 25).map((entry) => entry.message.seq);
  assert.deepEqual(picked, [0, 3]);
  assert.deepEqual(selectMessages(messages, 1000).map((entry) => entry.message.seq), [0, 1, 2, 3]);
  assert.deepEqual(selectMessages([], 10), []);
});

test("summary language is optional and appears in the prompt only when set", () => {
  assert.match(buildSystemPrompt(resolveConfig()), /language the user wrote in/);
  const prompt = buildSystemPrompt(resolveConfig({ summaryLanguage: "中文" }));
  assert.match(prompt, /in 中文, whatever language/);
  assert.doesNotMatch(prompt, /in the language the user wrote in/);
  assert.throws(() => resolveConfig({ summaryLanguage: "  " }), /must not be empty/);
});

test("the configured user format renders as feat：摘要", () => {
  const config = resolveConfig({ preset: "type-summary", separator: "：", summaryLanguage: "中文" });
  const parts = parseModelOutput('{"type":"feat","summary":"重命名侧边栏会话标题"}', config);
  assert.equal(renderTitle(parts, "", config), "feat：重命名侧边栏会话标题");
});
