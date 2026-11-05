/**
 * URL and local-path rules of the host Markdown renderer, ported from
 * @deepseek-ai/dsh-client-ui-primitives and @deepseek-ai/dsh-client-ui-chat
 * 0.2.2-rc.1 (MIT, Copyright (c) 2026 DeepSeek). Components must pass every
 * authored destination through these helpers before it reaches the DOM.
 */
import { normalizeUri } from 'micromark-util-sanitize-uri';

export { normalizeUri };

/**
 * Recognize a relative, rooted, or absolute Windows path before URL parsing.
 * Such a destination is a file, never a URL (`C:\x` is not a `c:` scheme).
 */
export function isExplicitFilePath(value: string): boolean {
  return /^(?:[\\/]|\.{1,2}[\\/]|[a-z]:[\\/])/i.test(value);
}

/** Absolute URLs except script and inline-data protocols; file paths render as text. */
export function sanitizeUrl(url: string): string {
  if (isExplicitFilePath(url)) return '';
  try {
    switch (new URL(url).protocol) {
      case 'javascript:':
      case 'vbscript:':
      case 'data:':
      case 'blob:':
        return '';
      default:
        return url;
    }
  } catch {
    return '';
  }
}

function remoteImageUrl(url: string): string | undefined {
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'http:' || protocol === 'https:' ? url : undefined;
  } catch {
    return undefined;
  }
}

/** Authenticated Host media routes as the Desktop application addresses them. */
const DESKTOP_MEDIA_ROUTES = [
  'dsh-app://app/api/file?',
  'dsh-app://app/api/plugin-market/detail-file?',
  'dsh-app://app/api/plugin-manager/detail-file?',
];

/** Rewritten images may use Web media protocols or the Desktop application's media routes. */
function vocabularyImageUrl(url: string): string | undefined {
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'http:' || protocol === 'https:' || protocol === 'blob:' || protocol === 'data:' ||
      DESKTOP_MEDIA_ROUTES.some((route) => url.startsWith(route))
      ? url
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Displayable source for an authored image destination, or undefined for alt text.
 * @param load - the mounted image's load number, see {@link freshImageUrl}.
 */
export function imageSource(url: string, load: number): string | undefined {
  const remote = remoteImageUrl(sanitizeUrl(normalizeUri(url)));
  if (remote !== undefined) return remote;
  const rewritten = localPathMediaUrl(document.baseURI, url);
  const allowed = rewritten === undefined ? undefined : vocabularyImageUrl(rewritten);
  return allowed === undefined ? undefined : freshImageUrl(allowed, load);
}

let imageLoads = 0;
/** Allocate one load number per mounted image (use as a `useState` initializer). */
export const nextImageLoad = (): number => ++imageLoads;

/**
 * Tag a Host `api/file` image URL with its mount's load number. Browsers reuse a
 * same-URL image within one document despite `no-store`, so without the tag a
 * newly rendered image of a rewritten file would show the earlier bytes.
 */
export function freshImageUrl(url: string, load: number): string {
  let fresh: URL;
  try {
    fresh = new URL(url);
  } catch {
    return url;
  }
  if (!fresh.pathname.endsWith('/api/file')) return url;
  fresh.search = `${fresh.search === '' ? '?' : `${fresh.search}&`}load=${load}`;
  return fresh.href;
}

export interface FileLink {
  path: string;
  line?: number;
}

/**
 * Decode a file destination with a `#L24` / `#L24-L30` fragment or a `:24` /
 * `:24-30` / `:24:5` suffix. Explicit relative, rooted, and Windows drive paths
 * take precedence over URLs; other parseable absolute URLs are not file links.
 * Fragments take precedence over colon suffixes; invalid locations open the
 * file without a line. Columns are consumed but not selected.
 * @returns undefined for URLs, fragment-only links, queries, malformed escapes, or control characters.
 */
export function parseFileLink(value: string): FileLink | undefined {
  const hash = value.indexOf('#');
  const destination = hash < 0 ? value : value.slice(0, hash);
  if (destination.includes('?')) return undefined;
  let path: string;
  try {
    path = decodeURIComponent(destination);
  } catch {
    return undefined;
  }
  if (path.length === 0 || /[\u0000-\u001f\u007f]/.test(path)) return undefined;
  if (!isExplicitFilePath(path) && URL.canParse(path)) return undefined;
  const suffix = hash < 0 ? /:(\d+)(?::\d+|-(\d+))?$/.exec(destination) : null;
  if (suffix !== null) path = path.slice(0, -suffix[0].length);
  if (path.length === 0) return undefined;
  const match = suffix ?? (hash < 0 ? null : /^L(\d+)(?:-L(\d+))?$/.exec(value.slice(hash + 1)));
  if (match === null) return { path };
  const line = Number(match[1]);
  const end = match[2] === undefined ? line : Number(match[2]);
  if (!Number.isSafeInteger(line) || !Number.isSafeInteger(end) || line < 1 || end < line) return { path };
  return { path, line };
}

/** The inline-code value when it is exactly an absolute HTTP(S) URL. */
export function inlineCodeHttpUrl(value: string): string | undefined {
  if (value.trim() !== value) return undefined;
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:' ? value : undefined;
  } catch {
    return undefined;
  }
}

function isWindowsStylePath(value: string): boolean {
  return /^[A-Za-z]:[/\\]/.test(value) || value.startsWith('\\\\');
}

function isAbsoluteWorkspacePath(path: string): boolean {
  return path.startsWith('/') || isWindowsStylePath(path);
}

/** Resolve a workspace-relative path against the session cwd, when known. */
export function resolveWorkspacePath(cwd: string | undefined, path: string): string {
  if (isAbsoluteWorkspacePath(path)) return path;
  if (cwd === undefined || cwd === '') return path;
  const separator = isWindowsStylePath(cwd) && cwd.includes('\\') ? '\\' : '/';
  return `${cwd.replace(/[/\\]+$/, '')}${separator}${path.replace(/^(?:\.?[/\\])+/, '')}`;
}

/** Address a decoded absolute file path through the authenticated file route. */
export function fileMediaUrl(base: string, path: string): string | undefined {
  if ((!/^https?:/u.test(base) && !base.startsWith('dsh-app://app/')) || !isAbsoluteWorkspacePath(path) ||
    /^[/\\]{2}/u.test(path) || /[\u0000-\u001f\u007f]/u.test(path)) return undefined;
  return new URL(`api/file?path=${encodeURIComponent(path)}`, base).href;
}

/** The host's settled `pathImages` vocabulary for the official MarkdownText. */
export const localPathImages = {
  resolve: (value: string): string | undefined => localPathMediaUrl(document.baseURI, value),
};

/** Authored absolute image path → file-route URL (query/fragment suffixes are ignored). */
function localPathMediaUrl(base: string, value: string): string | undefined {
  let path: string;
  try {
    path = decodeURIComponent(value.split(/[?#]/u)[0] ?? '');
  } catch {
    return undefined;
  }
  return fileMediaUrl(base, path);
}
