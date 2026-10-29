/**
 * Pure title-format logic: configuration, preset expansion, the model prompt,
 * model-output parsing, and rendering. Nothing here touches the Harness, so it
 * is unit-testable without a Cordis context.
 */

/** Parts a title can be assembled from. `summary` is the only mandatory one. */
export const SEGMENTS = ["type", "date", "summary"] as const;
export type Segment = (typeof SEGMENTS)[number];

/** Built-in layouts. A preset only supplies defaults for `segments` and `separator`. */
export const PRESETS = {
  /** `feat/261022/add login flow` */
  conventional: { segments: ["type", "date", "summary"], separator: "/" },
  /** `feat/add login flow` */
  "type-summary": { segments: ["type", "summary"], separator: "/" },
  /** `add login flow` */
  summary: { segments: ["summary"], separator: " " },
} as const satisfies Record<string, { segments: readonly Segment[]; separator: string }>;

export type PresetName = keyof typeof PRESETS;

export const DEFAULT_TYPES: readonly string[] = [
  "feat",
  "fix",
  "refactor",
  "docs",
  "chore",
  "style",
  "test",
  "perf",
  "build",
  "ci",
  "revert",
];

export type DateSource = "session-created" | "now";
export type AutomaticMode = "first-prompt" | "all-prompts";

/** User-facing plugin configuration; every field is optional. */
export interface Config {
  /** Layout defaults. Default `conventional`. */
  preset?: PresetName;
  /** Explicit segment order; overrides the preset. Must contain `summary`. */
  segments?: Segment[];
  /** Text placed between segments; overrides the preset. */
  separator?: string;
  /** Allowed values of the `type` segment. Ignored when `type` is not a segment. */
  types?: string[];
  /** Tokens: YYYY YY MM DD. Default `YYMMDD`. Ignored when `date` is not a segment. */
  dateFormat?: string;
  /** Which instant `date` shows. `session-created` keeps it stable across regenerations. */
  dateSource?: DateSource;
  /** Soft cap, in characters, requested for the summary and enforced on the result. */
  summaryMaxLength?: number;
  /** Language the summary is written in, e.g. `中文` or `English`. Default: the language the user wrote in. */
  summaryLanguage?: string;
  /** When new prompts trigger regeneration. */
  automatic?: AutomaticMode;
  /** Auxiliary model route; both or neither. Default: the session's main route. */
  provider?: string;
  model?: string;
  /** Budget, in characters, of user text sent to the model. */
  maxInputChars?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

export interface ResolvedConfig {
  readonly segments: readonly Segment[];
  readonly separator: string;
  readonly types: readonly string[];
  readonly dateFormat: string;
  readonly dateSource: DateSource;
  readonly summaryMaxLength: number;
  readonly summaryLanguage: string | undefined;
  readonly automatic: AutomaticMode;
  readonly route: { readonly provider: string; readonly model: string } | undefined;
  readonly maxInputChars: number;
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
}

function positiveInt(value: number | undefined, fallback: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1) {
    throw new Error(`session-title-layout: ${label} must be a positive safe integer`);
  }
  return resolved;
}

/** Validate user configuration and expand the preset. Throws on any invalid field. */
export function resolveConfig(config: Config = {}): ResolvedConfig {
  const presetName = config.preset ?? "conventional";
  const preset = Object.hasOwn(PRESETS, presetName) ? PRESETS[presetName] : undefined;
  if (preset === undefined) {
    throw new Error(`session-title-layout: unknown preset "${String(presetName)}"`);
  }

  const segments: readonly Segment[] = config.segments ?? preset.segments;
  if (segments.length === 0 || new Set(segments).size !== segments.length) {
    throw new Error("session-title-layout: segments must be non-empty and unique");
  }
  for (const segment of segments) {
    if (!SEGMENTS.includes(segment)) {
      throw new Error(`session-title-layout: unknown segment "${String(segment)}"`);
    }
  }
  if (!segments.includes("summary")) {
    throw new Error('session-title-layout: segments must include "summary"');
  }

  const types = (config.types ?? DEFAULT_TYPES).map((type) => type.trim().toLowerCase());
  if (segments.includes("type") && (types.length === 0 || types.some((type) => type === ""))) {
    throw new Error("session-title-layout: types must contain non-empty strings");
  }

  const automatic = config.automatic ?? "first-prompt";
  if (automatic !== "first-prompt" && automatic !== "all-prompts") {
    throw new Error('session-title-layout: automatic must be "first-prompt" or "all-prompts"');
  }
  const summaryLanguage = config.summaryLanguage?.trim();
  if (config.summaryLanguage !== undefined && summaryLanguage === "") {
    throw new Error("session-title-layout: summaryLanguage must not be empty");
  }
  const dateSource = config.dateSource ?? "session-created";
  if (dateSource !== "session-created" && dateSource !== "now") {
    throw new Error('session-title-layout: dateSource must be "session-created" or "now"');
  }
  if ((config.provider === undefined) !== (config.model === undefined)) {
    throw new Error("session-title-layout: provider and model must be set together");
  }

  return {
    segments,
    separator: config.separator ?? preset.separator,
    types,
    dateFormat: config.dateFormat ?? "YYMMDD",
    dateSource,
    summaryMaxLength: positiveInt(config.summaryMaxLength, 40, "summaryMaxLength"),
    summaryLanguage,
    automatic,
    route:
      config.provider !== undefined && config.model !== undefined
        ? { provider: config.provider, model: config.model }
        : undefined,
    maxInputChars: positiveInt(config.maxInputChars, 8000, "maxInputChars"),
    maxOutputTokens: positiveInt(config.maxOutputTokens, 2048, "maxOutputTokens"),
    timeoutMs: positiveInt(config.timeoutMs, 60_000, "timeoutMs"),
  };
}

/** System prompt asking only for the model-written segments (`type`, `summary`). */
export function buildSystemPrompt(config: ResolvedConfig): string {
  const wantsType = config.segments.includes("type");
  const shape = wantsType ? '{"type": "...", "summary": "..."}' : '{"summary": "..."}';
  const lines = [
    "Generate a title for an AI coding-assistant session from the user's messages.",
    `Reply with ONLY one JSON object of exactly this shape, with no code fence and no commentary: ${shape}`,
  ];
  if (wantsType) {
    lines.push(`- "type" is exactly one of: ${config.types.join(", ")}.`);
  }
  lines.push(
    `- "summary" is a short plain phrase, at most ${config.summaryMaxLength} characters, that lets a reader tell what the session is about.`,
    config.summaryLanguage === undefined
      ? '- Write "summary" in the language the user wrote in. No Markdown, no surrounding quotes, no trailing punctuation.'
      : `- Write "summary" in ${config.summaryLanguage}, whatever language the user wrote in. No Markdown, no surrounding quotes, no trailing punctuation.`,
    "Do not reason or explain. Output the JSON object immediately.",
  );
  return lines.join("\n");
}

function truncateChars(input: string, max: number): string {
  const chars = Array.from(input);
  return chars.length <= max ? input : chars.slice(0, max).join("").trimEnd();
}

function cleanSummary(input: string, max: number): string {
  const collapsed = input.replace(/\s+/gu, " ").trim();
  const unquoted = collapsed.replace(/^["'`“”‘’]+|["'`“”‘’]+$/gu, "").trim();
  return truncateChars(unquoted, max);
}

/** The model-written parts of a title. */
export interface ModelParts {
  readonly type: string | undefined;
  readonly summary: string;
}

/**
 * Parse the model reply. Throws when it is unusable, so the caller keeps the
 * previous title instead of writing a guess.
 */
export function parseModelOutput(raw: string, config: ResolvedConfig): ModelParts {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("session-title-layout: model reply contains no JSON object");
  }
  let value: unknown;
  try {
    value = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new Error("session-title-layout: model reply is not valid JSON");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("session-title-layout: model reply is not a JSON object");
  }
  const record = value as Record<string, unknown>;

  const summary =
    typeof record["summary"] === "string"
      ? cleanSummary(record["summary"], config.summaryMaxLength)
      : "";
  if (summary === "") {
    throw new Error("session-title-layout: model reply has no summary");
  }

  let type: string | undefined;
  if (config.segments.includes("type")) {
    const candidate = typeof record["type"] === "string" ? record["type"].trim().toLowerCase() : "";
    if (!config.types.includes(candidate)) {
      throw new Error(`session-title-layout: model reply type "${candidate}" is not allowed`);
    }
    type = candidate;
  }
  return { type, summary };
}

/** Format an epoch-millisecond instant in local time using YYYY, YY, MM, DD tokens. */
export function formatDate(epochMs: number, format: string): string {
  const date = new Date(epochMs);
  const year = String(date.getFullYear());
  const values: Record<string, string> = {
    YYYY: year,
    YY: year.slice(-2),
    MM: String(date.getMonth() + 1).padStart(2, "0"),
    DD: String(date.getDate()).padStart(2, "0"),
  };
  return format.replace(/YYYY|YY|MM|DD/gu, (token) => values[token] ?? token);
}

/** Join the enabled segments in configured order. `date` is rendered by the caller's clock. */
export function renderTitle(parts: ModelParts, dateText: string, config: ResolvedConfig): string {
  const pieces = config.segments.map((segment) => {
    switch (segment) {
      case "type":
        return parts.type ?? "";
      case "date":
        return dateText;
      case "summary":
        return parts.summary;
    }
  });
  return pieces.join(config.separator);
}

/**
 * Choose which messages to send: the first one, then the newest that fit the
 * character budget. Returned in log order.
 */
export function selectMessages<T extends { readonly text: string }>(
  messages: readonly T[],
  budget: number,
  perMessageLimit = 2000,
): { message: T; text: string }[] {
  const clip = (message: T) => ({ message, text: message.text.slice(0, perMessageLimit) });
  const first = messages[0];
  if (first === undefined) return [];
  const chosen = [clip(first)];
  let used = chosen[0]?.text.length ?? 0;
  const tail: { message: T; text: string }[] = [];
  for (let index = messages.length - 1; index > 0; index -= 1) {
    const message = messages[index];
    if (message === undefined) continue;
    const entry = clip(message);
    if (used + entry.text.length > budget) break;
    used += entry.text.length;
    tail.unshift(entry);
  }
  return [...chosen, ...tail];
}
