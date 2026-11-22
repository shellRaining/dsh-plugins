/**
 * Recovers drifted or proxy-aliased tool call names during LLM streaming by
 * matching unknown tool names against the active request's registered tools.
 */
import type { Context } from "@deepseek-ai/cordis";
import type { GenerateOptions, StreamChunk } from "@deepseek-ai/dsh-llm";
import {
  buildToolCatalog,
  extractArgKeys,
  matchToolName,
  type MatcherConfig,
  type MatchResult,
  type ToolCatalog,
} from "./matcher.ts";

export {
  buildToolCatalog,
  damerauLevenshtein,
  extractArgKeys,
  matchToolName,
  normalizeToolName,
  stringSimilarity,
  type IndexedTool,
  type MatchOptions,
  type MatchResult,
  type MatcherConfig,
  type RecoveryStrategy,
  type ToolCatalog,
} from "./matcher.ts";

export const name = "tool-name-recovery";

export const inject = ["llm"];

export interface Config {
  /** Restrict recovery to specific provider route ids. Empty applies to all providers. */
  providers?: readonly string[];
  /** Restrict recovery to specific model ids. Empty applies to all models. */
  models?: readonly string[];
  /** Explicit raw-name -> registered-tool-name overrides checked before heuristics. */
  aliases?: Readonly<Record<string, string>>;
  /** Enable high-confidence Damerau-Levenshtein similarity fallback at block-end. */
  fuzzySimilarity?: boolean;
  /** Minimum normalized similarity score (0..1) required for fuzzy matching. */
  minSimilarity?: number;
  /** Minimum score gap over the second-best candidate required for fuzzy matching. */
  minMargin?: number;
  /** Minimum normalized stem length eligible for fuzzy matching. */
  minFuzzyLength?: number;
  /** Minimum normalized stem length eligible for unique truncated-prefix matching. */
  minTruncatedPrefixLength?: number;
  /** Emit an info log entry whenever a tool call name is recovered. */
  logRecoveries?: boolean;
}

export interface ResolvedConfig extends MatcherConfig {
  readonly providers: ReadonlySet<string>;
  readonly models: ReadonlySet<string>;
  readonly logRecoveries: boolean;
}

function unitInterval(value: number | undefined, fallback: number, field: string): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved < 0 || resolved > 1) {
    throw new Error(`${name}: ${field} must be a finite number between 0 and 1`);
  }
  return resolved;
}

function positiveInt(value: number | undefined, fallback: number, field: string): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1) {
    throw new Error(`${name}: ${field} must be a positive integer`);
  }
  return resolved;
}

function stringSet(values: readonly string[] | undefined, field: string): ReadonlySet<string> {
  if (values === undefined) return new Set();
  const result = new Set<string>();
  for (const item of values) {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new Error(`${name}: ${field} entries must be non-empty strings`);
    }
    result.add(item.trim());
  }
  return result;
}

function normalizeAliases(raw: Readonly<Record<string, string>> | undefined): Readonly<Record<string, string>> {
  if (raw === undefined) return {};
  const result: Record<string, string> = {};
  for (const [from, to] of Object.entries(raw)) {
    if (from.length === 0 || typeof to !== "string" || to.length === 0) {
      throw new Error(`${name}: aliases must map non-empty tool names to non-empty target names`);
    }
    result[from] = to;
  }
  return result;
}

export function resolveConfig(raw: Config | undefined): ResolvedConfig {
  const c = raw ?? {};
  return {
    providers: stringSet(c.providers, "providers"),
    models: stringSet(c.models, "models"),
    aliases: normalizeAliases(c.aliases),
    fuzzySimilarity: c.fuzzySimilarity ?? true,
    minSimilarity: unitInterval(c.minSimilarity, 0.78, "minSimilarity"),
    minMargin: unitInterval(c.minMargin, 0.12, "minMargin"),
    minFuzzyLength: positiveInt(c.minFuzzyLength, 4, "minFuzzyLength"),
    minTruncatedPrefixLength: positiveInt(c.minTruncatedPrefixLength, 6, "minTruncatedPrefixLength"),
    logRecoveries: c.logRecoveries ?? true,
  };
}

function matchesRoute(options: GenerateOptions, config: ResolvedConfig): boolean {
  if (config.providers.size > 0 && !config.providers.has(options.provider)) return false;
  if (config.models.size > 0 && !config.models.has(options.model)) return false;
  return true;
}

interface RecoveryLogger {
  info(message: string): void;
}

function formatRecoveryLog(
  options: GenerateOptions,
  rawName: string,
  match: MatchResult,
): string {
  const score = match.score === undefined ? "" : ` score=${match.score.toFixed(2)}`;
  return `${name}: recovered tool "${rawName}" -> "${match.target}" (${match.strategy}${score}) on ${options.provider}/${options.model}`;
}

async function* recoverStream(
  source: AsyncIterable<StreamChunk>,
  options: GenerateOptions,
  catalog: ToolCatalog,
  config: ResolvedConfig,
  logger: RecoveryLogger,
): AsyncGenerator<StreamChunk> {
  // Memoize deterministic name lookups for repeated tool-call-delta chunks.
  const deltaCache = new Map<string, string | null>();

  for await (const chunk of source) {
    if (chunk.type === "tool-call-delta" && chunk.name !== undefined && chunk.name.length > 0) {
      let mapped = deltaCache.get(chunk.name);
      if (mapped === undefined) {
        const hit = matchToolName(chunk.name, catalog, config, { allowFuzzy: false });
        mapped = hit === undefined ? null : hit.target;
        deltaCache.set(chunk.name, mapped);
      }
      if (mapped !== null && mapped !== chunk.name) {
        yield { ...chunk, name: mapped };
        continue;
      }
    } else if (chunk.type === "block-end" && chunk.block.type === "tool-call") {
      const rawName = chunk.block.name;
      const argKeys = extractArgKeys(chunk.block.arguments);
      const hit = matchToolName(rawName, catalog, config, {
        allowFuzzy: config.fuzzySimilarity,
        argKeys,
      });
      if (hit !== undefined && hit.target !== rawName) {
        if (config.logRecoveries) {
          logger.info(formatRecoveryLog(options, rawName, hit));
        }
        yield {
          ...chunk,
          block: {
            ...chunk.block,
            name: hit.target,
          },
        };
        continue;
      }
    }
    yield chunk;
  }
}

export function apply(ctx: Context, raw: Config | undefined): void {
  const config = resolveConfig(raw);
  ctx.on("llm/stream", (options, next) => {
    const tools = options.tools;
    if (tools === undefined || tools.length === 0 || !matchesRoute(options, config)) {
      return next();
    }
    const catalog = buildToolCatalog(tools);
    return recoverStream(next(), options, catalog, config, ctx.logger);
  });
}
