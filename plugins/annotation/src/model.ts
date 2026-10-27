export type Source = { kind: 'message'; key: string } | { kind: 'file'; url: string; path: string };

export interface Annotation {
  id: string;
  sessionId: string;
  /** Session-local label assigned on first save; 0 only for an unsaved selection. */
  number: number;
  text: string;
  note: string;
  source: Source;
  start: number;
  end: number;
  before: string;
  after: string;
  createdAt: number;
  updatedAt: number;
}

export const MAX_ITEMS = 200;
export const MAX_TEXT = 16000;
export const MAX_NOTE = 8000;
const MAX_NUMBER = 1_000_000;

const MAX_ID = 1024;
const MAX_SOURCE = 8192;

export function boundedString(value: unknown, name: string, max: number, nonempty = false): string {
  if (typeof value !== 'string' || value.length > max || (nonempty && !value.trim())) {
    throw new TypeError(`${name} 必须是${nonempty ? '非空' : ''}字符串，且不超过 ${max} 个字符`);
  }
  return value;
}

export function annotationKey(value: unknown, name: string): string {
  return boundedString(value, name, MAX_ID, true);
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError(`${name} 格式无效`);
  return value as Record<string, unknown>;
}

export function annotationSource(value: unknown, sessionId: string): Source {
  const source = object(value, '批注来源');
  if (source.kind === 'message') return { kind: 'message', key: boundedString(source.key, '消息来源', MAX_SOURCE, true) };
  if (source.kind !== 'file') throw new TypeError('批注必须具有明确的消息或文件来源');
  const url = boundedString(source.url, '文件来源 URL', MAX_SOURCE, true);
  const path = boundedString(source.path, '文件来源路径', MAX_SOURCE, true);
  if (/[?#\u0000-\u001f\u007f]/.test(url) || /[\u0000-\u001f\u007f]/.test(path)) throw new TypeError('文件来源包含无效字符');
  const match = /^dsh-resource:\/\/file\/session\/([^/]+)\/(.+)$/.exec(url);
  let owner: string | undefined;
  let decodedPath: string | undefined;
  try {
    owner = match?.[1] === undefined ? undefined : decodeURIComponent(match[1]);
    decodedPath = match?.[2]?.split('/').map(decodeURIComponent).join('/');
  } catch { throw new TypeError('文件来源 URL 编码无效'); }
  if (owner !== sessionId || decodedPath !== path) throw new TypeError('文件来源必须属于当前会话且与路径一致');
  return { kind: 'file', url, path };
}

function timestamp(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new TypeError(`${name} 必须是非负安全整数`);
  return value;
}

/** Validate and detach caller-owned data before asynchronous storage work. */
export function copyAnnotation(value: unknown): Annotation {
  const item = object(value, '批注');
  const sessionId = annotationKey(item.sessionId, '会话 ID');
  const text = boundedString(item.text, '批注原文', MAX_TEXT, true);
  const start = item.start;
  const end = item.end;
  if (typeof start !== 'number' || typeof end !== 'number'
    || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start) {
    throw new TypeError('批注位置必须是有效区间');
  }
  const createdAt = timestamp(item.createdAt, '创建时间');
  const updatedAt = timestamp(item.updatedAt, '更新时间');
  if (updatedAt < createdAt) throw new TypeError('更新时间不能早于创建时间');
  const number = item.number;
  if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < 0 || number > MAX_NUMBER) {
    throw new TypeError(`批注编号必须是 0 到 ${MAX_NUMBER} 之间的整数`);
  }
  return {
    id: annotationKey(item.id, '批注 ID'), sessionId, number, text,
    note: boundedString(item.note, '批注内容', MAX_NOTE),
    source: annotationSource(item.source, sessionId),
    start, end,
    before: boundedString(item.before, '前文', MAX_TEXT),
    after: boundedString(item.after, '后文', MAX_TEXT),
    createdAt, updatedAt,
  };
}
