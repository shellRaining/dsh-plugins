/**
 * Pure matching logic that maps a drifted or proxy-aliased tool call name back
 * to one of the active tools declared on the current LLM request.
 */
import type { ToolSchema } from "@deepseek-ai/dsh-llm";

export type RecoveryStrategy =
  | "alias"
  | "normalized"
  | "mcp-prefix"
  | "alias-prefix"
  | "truncated-prefix"
  | "similarity";

export interface MatchResult {
  readonly target: string;
  readonly strategy: RecoveryStrategy;
  readonly score?: number;
}

export interface MatcherConfig {
  readonly aliases: Readonly<Record<string, string>>;
  readonly fuzzySimilarity: boolean;
  readonly minSimilarity: number;
  readonly minMargin: number;
  readonly minFuzzyLength: number;
  readonly minTruncatedPrefixLength: number;
}

export interface IndexedTool {
  readonly name: string;
  readonly normalized: string;
  readonly propKeys: ReadonlySet<string>;
}

export interface ToolCatalog {
  readonly entries: readonly IndexedTool[];
  readonly byExact: ReadonlyMap<string, IndexedTool>;
  readonly byNormalized: ReadonlyMap<string, readonly IndexedTool[]>;
}

const LEADING_WORD_PREFIX = /^[a-z][a-z0-9]{1,23}_(.+)$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Convert camelCase / PascalCase / kebab-case / mixed separators into a
 * canonical lowercase snake_case identifier for exact comparison.
 */
export function normalizeToolName(raw: string): string {
  return raw
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function extractSchemaPropertyKeys(parameters: Record<string, unknown>): ReadonlySet<string> {
  const properties = parameters["properties"];
  if (!isRecord(properties)) return new Set();
  return new Set(Object.keys(properties));
}

/** Pre-index the request's active tool declarations once per LLM stream. */
export function buildToolCatalog(tools: readonly ToolSchema[]): ToolCatalog {
  const entries: IndexedTool[] = [];
  const byExact = new Map<string, IndexedTool>();
  const normalizedBuckets = new Map<string, IndexedTool[]>();

  for (const tool of tools) {
    if (byExact.has(tool.name)) continue;
    const normalized = normalizeToolName(tool.name);
    const entry: IndexedTool = {
      name: tool.name,
      normalized,
      propKeys: extractSchemaPropertyKeys(tool.parameters),
    };
    entries.push(entry);
    byExact.set(tool.name, entry);
    if (normalized.length > 0) {
      const bucket = normalizedBuckets.get(normalized);
      if (bucket === undefined) {
        normalizedBuckets.set(normalized, [entry]);
      } else {
        bucket.push(entry);
      }
    }
  }

  return { entries, byExact, byNormalized: normalizedBuckets };
}

/** Parse top-level argument keys from a completed tool-call JSON string. */
export function extractArgKeys(rawArguments: string): readonly string[] | undefined {
  const trimmed = rawArguments.trim();
  if (trimmed.length === 0) return undefined;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!isRecord(parsed)) return undefined;
    return Object.keys(parsed);
  } catch {
    return undefined;
  }
}

function schemaCompatible(
  tool: IndexedTool,
  argKeys: readonly string[] | undefined,
  mode: "structural" | "fuzzy",
): boolean {
  if (argKeys === undefined || argKeys.length === 0 || tool.propKeys.size === 0) {
    return true;
  }
  let overlap = 0;
  for (const key of argKeys) {
    if (tool.propKeys.has(key)) overlap += 1;
  }
  if (overlap === 0) return false;
  return mode === "structural" ? true : overlap * 2 >= argKeys.length;
}

function stripLeadingWord(value: string): string | undefined {
  const match = LEADING_WORD_PREFIX.exec(value);
  return match?.[1];
}

function stripMcpNamespace(value: string): string | undefined {
  const separator = value.lastIndexOf("__");
  if (separator < 0) return undefined;
  const tail = value.slice(separator + 2);
  return tail.length > 0 ? tail : undefined;
}

/** Optimal string alignment (Damerau-Levenshtein) edit distance. */
export function damerauLevenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  if (a === b) return 0;

  const cols = n + 1;
  const dp = new Int32Array((m + 1) * cols);
  const at = (index: number): number => dp[index] ?? 0;

  for (let i = 0; i <= m; i += 1) dp[i * cols] = i;
  for (let j = 0; j <= n; j += 1) dp[j] = j;

  for (let i = 1; i <= m; i += 1) {
    const aPrev = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j += 1) {
      const bPrev = b.charCodeAt(j - 1);
      const cost = aPrev === bPrev ? 0 : 1;
      let best = Math.min(
        at((i - 1) * cols + j) + 1,
        at(i * cols + (j - 1)) + 1,
        at((i - 1) * cols + (j - 1)) + cost,
      );
      if (i > 1 && j > 1 && aPrev === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === bPrev) {
        const transposition = at((i - 2) * cols + (j - 2)) + 1;
        if (transposition < best) best = transposition;
      }
      dp[i * cols + j] = best;
    }
  }
  return at(m * cols + n);
}

export function stringSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - damerauLevenshtein(a, b) / maxLen;
}

function matchCandidate(
  candidate: string,
  catalog: ToolCatalog,
  strategy: RecoveryStrategy,
  argKeys: readonly string[] | undefined,
): MatchResult | undefined {
  const exact = catalog.byExact.get(candidate);
  if (exact !== undefined && schemaCompatible(exact, argKeys, "structural")) {
    return { target: exact.name, strategy };
  }
  const normalized = normalizeToolName(candidate);
  if (normalized.length === 0) return undefined;
  const bucket = catalog.byNormalized.get(normalized);
  if (bucket === undefined) return undefined;
  const compatible = bucket.filter(entry => schemaCompatible(entry, argKeys, "structural"));
  if (compatible.length !== 1) return undefined;
  const only = compatible[0];
  return only === undefined ? undefined : { target: only.name, strategy };
}

function matchTruncatedPrefix(
  stems: readonly string[],
  catalog: ToolCatalog,
  minLength: number,
  argKeys: readonly string[] | undefined,
): MatchResult | undefined {
  for (const stem of stems) {
    const normalized = normalizeToolName(stem);
    if (normalized.length < minLength) continue;
    const matches = catalog.entries.filter(
      entry => entry.normalized.startsWith(normalized) && schemaCompatible(entry, argKeys, "structural"),
    );
    if (matches.length === 1) {
      const only = matches[0];
      if (only !== undefined) return { target: only.name, strategy: "truncated-prefix" };
    }
  }
  return undefined;
}

function matchBySimilarity(
  stems: readonly string[],
  catalog: ToolCatalog,
  config: MatcherConfig,
  argKeys: readonly string[] | undefined,
): MatchResult | undefined {
  const normalizedStems: string[] = [];
  for (const stem of stems) {
    const normalized = normalizeToolName(stem);
    if (normalized.length >= config.minFuzzyLength && !normalizedStems.includes(normalized)) {
      normalizedStems.push(normalized);
    }
  }
  if (normalizedStems.length === 0) return undefined;

  let bestTool: IndexedTool | undefined;
  let bestScore = -1;
  let secondScore = -1;

  for (const entry of catalog.entries) {
    if (entry.normalized.length < config.minFuzzyLength) continue;
    if (!schemaCompatible(entry, argKeys, "fuzzy")) continue;

    let score = -1;
    for (const candidate of normalizedStems) {
      const value = stringSimilarity(candidate, entry.normalized);
      if (value > score) score = value;
    }

    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      bestTool = entry;
    } else if (score > secondScore) {
      secondScore = score;
    }
  }

  if (bestTool === undefined) return undefined;
  if (bestScore < config.minSimilarity) return undefined;
  if (secondScore >= 0 && bestScore - secondScore < config.minMargin) return undefined;

  return { target: bestTool.name, strategy: "similarity", score: bestScore };
}

export interface MatchOptions {
  readonly allowFuzzy: boolean;
  readonly argKeys?: readonly string[] | undefined;
}

/**
 * Resolve an unknown tool call name against the active request's tool catalog.
 * Returns `undefined` when the name is already valid or cannot be recovered
 * safely without ambiguity.
 */
export function matchToolName(
  rawName: string,
  catalog: ToolCatalog,
  config: MatcherConfig,
  options: MatchOptions,
): MatchResult | undefined {
  if (rawName.length === 0 || catalog.byExact.has(rawName)) return undefined;
  const { argKeys, allowFuzzy } = options;

  // 1. User-configured explicit alias map.
  const configuredTarget = config.aliases[rawName];
  if (configuredTarget !== undefined && catalog.byExact.has(configuredTarget)) {
    return { target: configuredTarget, strategy: "alias" };
  }

  // 2. Exact case / camelCase / separator normalization (e.g. WebSearch -> web_search).
  const normalizedHit = matchCandidate(rawName, catalog, "normalized", argKeys);
  if (normalizedHit !== undefined) return normalizedHit;

  // 3. Strip leaked MCP namespace (`mcp__<server>__<rest>`) and CPA single-word alias (`<word>_<rest>`).
  const mcpTail = stripMcpNamespace(rawName);
  const mcpWordStem = mcpTail === undefined ? undefined : stripLeadingWord(mcpTail);
  const singleWordStem = mcpTail === undefined ? stripLeadingWord(rawName) : undefined;

  if (mcpTail !== undefined) {
    const tailHit = matchCandidate(mcpTail, catalog, "mcp-prefix", argKeys);
    if (tailHit !== undefined) return tailHit;
    if (mcpWordStem !== undefined) {
      const stemHit = matchCandidate(mcpWordStem, catalog, "mcp-prefix", argKeys);
      if (stemHit !== undefined) return stemHit;
    }
  }

  if (singleWordStem !== undefined) {
    const prefixHit = matchCandidate(singleWordStem, catalog, "alias-prefix", argKeys);
    if (prefixHit !== undefined) return prefixHit;
  }

  // 4. Unique truncated semantic prefix (e.g. CPA truncating long tool names to fit 64 chars).
  const strippedStems: string[] = [];
  if (mcpWordStem !== undefined) strippedStems.push(mcpWordStem);
  if (mcpTail !== undefined) strippedStems.push(mcpTail);
  if (singleWordStem !== undefined) strippedStems.push(singleWordStem);

  if (strippedStems.length > 0) {
    const truncatedHit = matchTruncatedPrefix(
      strippedStems,
      catalog,
      config.minTruncatedPrefixLength,
      argKeys,
    );
    if (truncatedHit !== undefined) return truncatedHit;
  }

  // 5. High-confidence Damerau-Levenshtein similarity fallback (block-end with schema check).
  if (allowFuzzy && config.fuzzySimilarity) {
    const fuzzyStems = [...strippedStems, rawName];
    return matchBySimilarity(fuzzyStems, catalog, config, argKeys);
  }

  return undefined;
}
