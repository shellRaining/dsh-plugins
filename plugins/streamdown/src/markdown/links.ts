/**
 * URL and local-path rules of the host Markdown renderer, ported from
 * @deepseek-ai/dsh-client-ui-primitives and @deepseek-ai/dsh-client-ui-chat
 * 0.2.1-rc.3 (MIT, Copyright (c) 2026 DeepSeek). Components must pass every
 * authored destination through these helpers before it reaches the DOM.
 */
import { normalizeUri } from 'micromark-util-sanitize-uri';

export { normalizeUri };

/** Allow only http(s) and mailto destinations; anything else renders as text. */
export function sanitizeUrl(url: string): string {
  try {
    switch (new URL(url).protocol) {
      case 'http:':
      case 'https:':
      case 'mailto:':
        return url;
      default:
        return '';
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

/** Rewritten images may use Web media protocols or the Desktop application's file route. */
function vocabularyImageUrl(url: string): string | undefined {
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'http:' || protocol === 'https:' || protocol === 'blob:' || protocol === 'data:' ||
      url.startsWith('dsh-app://app/api/file?')
      ? url
      : undefined;
  } catch {
    return undefined;
  }
}

/** Displayable source for an authored image destination, or undefined for alt text. */
export function imageSource(url: string): string | undefined {
  const remote = remoteImageUrl(sanitizeUrl(normalizeUri(url)));
  if (remote !== undefined) return remote;
  const rewritten = localPathMediaUrl(document.baseURI, url);
  return rewritten === undefined ? undefined : vocabularyImageUrl(rewritten);
}

export interface FileLink {
  path: string;
  line?: number;
}

/**
 * Decode a local file destination and its optional GitHub-style line fragment.
 * @returns undefined for URLs, fragment-only links, queries, malformed escapes, or invalid ranges.
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
  if (path.length === 0 || /[\u0000-\u001f\u007f]/.test(path) || /^[\\/]{2}/.test(path) ||
    (/^[a-z][a-z\d+.-]*:/i.test(path) && !/^[a-z]:[\\/]/i.test(path))) return undefined;
  if (hash < 0) return { path };
  const match = /^L([1-9]\d*)(?:-L([1-9]\d*))?$/.exec(value.slice(hash + 1));
  if (match === null || match[1] === undefined) return undefined;
  const line = Number(match[1]);
  const end = match[2] === undefined ? line : Number(match[2]);
  if (!Number.isSafeInteger(line) || !Number.isSafeInteger(end) || end < line) return undefined;
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
  return `${cwd.replace(/[/\\]+$/, '')}${separator}${path.replace(/^[/\\]+/, '')}`;
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
