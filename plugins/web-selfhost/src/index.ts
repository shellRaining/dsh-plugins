/**
 * Search and fetch providers backed by a self-hosted crawl service: SearXNG
 * behind `/search` and Crawl4AI (with its route proxy) behind `/crawl`.
 *
 * The API key is read from `apiKey` in config when set, otherwise resolved per
 * request from the DSH credential store or the launching environment under the
 * `apiKeyEnv` reference.
 */
import type { Context } from "@deepseek-ai/cordis";

export const name = "web-selfhost";

export const inject = ["web"];

export interface Config {
  baseURL?: string;
  /** Inline API key. Takes precedence over the credential reference below. */
  apiKey?: string;
  apiKeyEnv?: string;
  searchResults?: number;
  timeoutMs?: number;
  maxBodyChars?: number;
  /** Fetched bodies shorter than this many characters get a quality hint. */
  minContentChars?: number;
  /** Append a hint asking the agent to tell the user when a result looks poor. */
  qualityHints?: boolean;
}

interface ResolvedConfig {
  baseURL: string;
  apiKey: string;
  apiKeyEnv: string;
  searchResults: number;
  timeoutMs: number;
  maxBodyChars: number;
  minContentChars: number;
  qualityHints: boolean;
}

function positive(value: number | undefined, fallback: number, field: string): number {
  const v = value ?? fallback;
  if (!Number.isSafeInteger(v) || v < 1) throw new Error(`web-selfhost: ${field} must be a positive integer`);
  return v;
}

export function resolveConfig(raw: Config | undefined): ResolvedConfig {
  const c = raw ?? {};
  const baseURL = (c.baseURL ?? "").replace(/\/+$/, "");
  if (baseURL !== "" && !URL.canParse(baseURL)) throw new Error("web-selfhost: baseURL must be an absolute URL");
  const apiKeyEnv = c.apiKeyEnv ?? "CRAWL_API_KEY";
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(apiKeyEnv)) throw new Error("web-selfhost: apiKeyEnv must be an identifier");
  return {
    baseURL,
    apiKey: (c.apiKey ?? "").trim(),
    apiKeyEnv,
    searchResults: positive(c.searchResults, 10, "searchResults"),
    timeoutMs: positive(c.timeoutMs, 90000, "timeoutMs"),
    maxBodyChars: positive(c.maxBodyChars, 100000, "maxBodyChars"),
    minContentChars: positive(c.minContentChars, 200, "minContentChars"),
    qualityHints: c.qualityHints ?? true,
  };
}

export const SEARCH_PROVIDER_ID = "selfhost-searxng";
export const FETCH_PROVIDER_ID = "selfhost-crawl4ai";

// Minimal contract of the parts of ctx.web and ctx.credentials used here.
interface SearchSource {
  url: string;
  title?: string;
  snippet?: string;
  publishedAt?: string;
}
interface SearchResult {
  content?: string;
  sources: SearchSource[];
  truncated: boolean;
}
interface FetchResult {
  url: string;
  statusCode: number;
  body: { kind: "text"; content: string };
  truncated: boolean;
}
interface LocalizedText {
  en: string;
  [lang: string]: string;
}
interface ProviderBase {
  id: string;
  title?: LocalizedText;
  description?: LocalizedText;
  available(): boolean;
}
interface WebService {
  registerSearchProvider(
    p: ProviderBase & { search(r: { query: string; maxResults?: number }, s?: AbortSignal): Promise<SearchResult> },
  ): () => void;
  registerFetchProvider(
    p: ProviderBase & { fetch(r: { url: string }, s?: AbortSignal): Promise<FetchResult> },
  ): () => void;
}
interface Credentials {
  resolve(ref: string): Promise<{ value: string } | undefined>;
}
interface HostContext {
  web: WebService;
  get(name: "credentials"): Credentials | undefined;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export function mapSearxng(payload: unknown, limit: number): SearchResult {
  if (!isRecord(payload) || !Array.isArray(payload.results)) {
    throw new Error("web-selfhost: SearXNG returned no results array");
  }
  const sources: SearchSource[] = [];
  for (const item of payload.results) {
    if (!isRecord(item)) continue;
    const url = str(item.url);
    if (url === undefined) continue;
    const title = str(item.title);
    const snippet = str(item.content);
    const publishedAt = str(item.publishedDate);
    sources.push({
      url,
      ...(title === undefined ? {} : { title }),
      ...(snippet === undefined ? {} : { snippet }),
      ...(publishedAt === undefined ? {} : { publishedAt }),
    });
  }
  return { sources: sources.slice(0, limit), truncated: sources.length > limit };
}

export function mapCrawl(payload: unknown, url: string, maxChars: number): FetchResult {
  const first = isRecord(payload) && Array.isArray(payload.results) ? payload.results[0] : undefined;
  if (!isRecord(first)) throw new Error("web-selfhost: crawl service returned no result");
  const markdown = isRecord(first.markdown) ? str(first.markdown.raw_markdown)?.trim() : undefined;
  if (first.success !== true || markdown === undefined || markdown.length === 0) {
    const reason = str(first.error_message) ?? "empty content";
    throw new Error(`web-selfhost: crawl failed for ${url}: ${reason.slice(0, 500)}`);
  }
  const statusCode = typeof first.status_code === "number" ? first.status_code : 200;
  const truncated = markdown.length > maxChars;
  return {
    url: str(first.redirected_url) ?? str(first.url) ?? url,
    statusCode,
    body: { kind: "text", content: truncated ? markdown.slice(0, maxChars) : markdown },
    truncated,
  };
}

/** Markers of challenge, login, or error pages that came back as "content". */
const BLOCK_MARKERS: [RegExp, string][] = [
  [/just a moment|checking your browser|cf-chl|attention required.*cloudflare/i, "cloudflare_challenge"],
  [/enable javascript (and cookies )?to continue|requires javascript|please enable javascript/i, "javascript_required"],
  [/captcha|are you a robot|unusual traffic/i, "captcha"],
  [/access denied|403 forbidden|request blocked/i, "access_denied"],
  [/sign in to (continue|view)|log in to (continue|see)|login required/i, "login_wall"],
];

export type Issue =
  | "thin_content"
  | "cloudflare_challenge"
  | "javascript_required"
  | "captcha"
  | "access_denied"
  | "login_wall";

/** Hosts whose pages are short by nature, so length alone says nothing. */
const SHORT_FORM_HOSTS = /(^|\.)(x\.com|twitter\.com)$/i;

/** Classify a fetched body; returns undefined when it looks like a usable page. */
export function judgeFetch(content: string, minChars: number, url = ""): Issue | undefined {
  const head = content.slice(0, 3000);
  for (const [re, issue] of BLOCK_MARKERS) {
    if (re.test(head) && content.length < 5000) return issue as Issue;
  }
  const host = URL.canParse(url) ? new URL(url).hostname : "";
  return content.length < minChars && !SHORT_FORM_HOSTS.test(host) ? "thin_content" : undefined;
}

const ISSUE_TEXT: Record<Issue, string> = {
  thin_content: "the page body is unusually short",
  cloudflare_challenge: "the page looks like a Cloudflare challenge",
  javascript_required: "the page looks like a JavaScript-required placeholder",
  captcha: "the page looks like a CAPTCHA",
  access_denied: "the page looks like an access-denied page",
  login_wall: "the page looks like a login wall",
};

const FEEDBACK =
  "If the result is not good enough for the task, tell the user in your reply, naming the URL or query and what " +
  "was wrong, so the self-hosted search and crawl service can be fixed later.";

/** Model-facing hint for a doubtful result. */
export function qualityHint(what: string): string {
  return `[web-selfhost note: ${what}. ${FEEDBACK}]`;
}

export function apply(ctx: Context, raw: Config | undefined): void {
  const host = ctx as unknown as HostContext;
  const config = resolveConfig(raw);
  const base = config.baseURL;

  /** Run one provider call; on a non-abort failure, append the feedback request to the error. */
  async function hinted<T>(signal: AbortSignal | undefined, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (!config.qualityHints || signal?.aborted === true || !(error instanceof Error)) throw error;
      error.message = `${error.message}\n${FEEDBACK}`;
      throw error;
    }
  }

  async function request(path: string, init: RequestInit, signal?: AbortSignal): Promise<unknown> {
    const key =
      config.apiKey ||
      (await host.get("credentials")?.resolve(config.apiKeyEnv))?.value ||
      process.env[config.apiKeyEnv];
    if (!key) throw new Error(`web-selfhost: no API key in config apiKey or under ${config.apiKeyEnv}`);
    const timeout = AbortSignal.timeout(config.timeoutMs);
    const res = await fetch(base + path, {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), "X-API-Key": key },
      signal: signal === undefined ? timeout : AbortSignal.any([signal, timeout]),
    });
    if (!res.ok) {
      const text = (await res.text()).slice(0, 300);
      throw new Error(`web-selfhost: ${path.split("?")[0]} HTTP ${res.status}: ${text}`);
    }
    return await res.json();
  }

  // Unconfigured: stay registered but unavailable, so installing the package changes nothing.
  const available = () => base.length > 0;

  ctx.effect(
    () =>
      host.web.registerSearchProvider({
        id: SEARCH_PROVIDER_ID,
        title: { en: "Self-hosted SearXNG", zh: "自建 SearXNG" },
        description: {
          en: "Searches through the self-hosted SearXNG instance; no per-request charge.",
          zh: "通过自建 SearXNG 搜索，不按次计费。",
        },
        available,
        search: (req, signal) => hinted(signal, async () => {
          const limit = Math.min(config.searchResults, req.maxResults ?? config.searchResults);
          const query = new URLSearchParams({ q: req.query, format: "json" });
          const result = mapSearxng(await request(`/search?${query}`, { method: "GET" }, signal), limit);
          if (config.qualityHints && result.sources.length === 0) {
            return { ...result, content: qualityHint("the self-hosted search returned no results") };
          }
          return result;
        }),
      }),
    "web-selfhost search provider",
  );

  ctx.effect(
    () =>
      host.web.registerFetchProvider({
        id: FETCH_PROVIDER_ID,
        title: { en: "Self-hosted Crawl4AI", zh: "自建 Crawl4AI" },
        description: {
          en: "Renders pages with the self-hosted Crawl4AI service and its X/Twitter route; no per-request charge.",
          zh: "通过自建 Crawl4AI 渲染网页（含推文专用路由），不按次计费。",
        },
        available,
        fetch: (req, signal) => hinted(signal, async () => {
          const body = JSON.stringify({ urls: [req.url], crawler_config: { cache_mode: "bypass" } });
          const result = mapCrawl(
            await request("/crawl", { method: "POST", headers: { "Content-Type": "application/json" }, body }, signal),
            req.url,
            config.maxBodyChars,
          );
          const issue = config.qualityHints ? judgeFetch(result.body.content, config.minContentChars, req.url) : undefined;
          if (issue === undefined) return result;
          return { ...result, body: { kind: "text", content: `${result.body.content}\n\n${qualityHint(ISSUE_TEXT[issue])}` } };
        }),
      }),
    "web-selfhost fetch provider",
  );
}
