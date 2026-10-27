import { MAX_ITEMS, MAX_TEXT, annotationKey, annotationSource, boundedString, copyAnnotation, type Annotation, type Source } from './model.ts';

const DATABASE = 'dsh-local-annotation-v1';
const ITEMS = 'annotations';
const IMPORTS = 'legacy-imports';
const LEGACY_PREFIX = 'dsh.annotation.pending.v1.';
// Reject oversized serialized input before JSON.parse allocates an object graph.
const MAX_LEGACY_CHARS = 16 * 1024 * 1024;
const OPEN_TIMEOUT = 10000;

type Environment = {
  indexedDB?: IDBFactory;
  localStorage?: Pick<Storage, 'getItem'>;
  BroadcastChannel?: typeof BroadcastChannel;
};
type ImportRecord = { sessionId: string; ids: string[] };

function failure(error: unknown, fallback: string): Error {
  if (error instanceof Error) return error;
  return new Error(fallback, { cause: error });
}
function expectedVersion(value: number | undefined): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) throw new TypeError('预期版本必须是非负安全整数');
}
function conflict(): Error { return new Error('批注已在其他窗口修改或删除，请刷新后重试'); }
function nextVersion(previous?: number): number {
  const next = Math.max(Date.now(), previous === undefined ? 0 : previous + 1);
  if (!Number.isSafeInteger(next)) throw new Error('批注版本已超出安全范围');
  return next;
}

function legacyItems(raw: string, sessionId: string): Annotation[] {
  if (raw.length > MAX_LEGACY_CHARS) throw new Error('旧批注数据过大，未导入任何内容');
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length > MAX_ITEMS) throw new Error(`旧批注必须是至多 ${MAX_ITEMS} 项的数组`);
  const seen = new Set<string>();
  const now = nextVersion();
  return parsed.map((value: unknown, index: number) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`旧批注第 ${index + 1} 项格式无效`);
    const item = value as Record<string, unknown>;
    const originalId = annotationKey(item.id, '旧批注 ID');
    const id = annotationKey(`legacy-${originalId}`, '导入批注 ID');
    if (seen.has(id)) throw new Error(`旧批注存在重复 ID：${originalId}`);
    seen.add(id);
    const text = boundedString(item.text, '旧批注原文', MAX_TEXT, true);
    let source: Source | undefined;
    if (typeof item.sourceUrl === 'string' && typeof item.sourcePath === 'string') {
      // A stale or cross-session file source may fall back only to an explicit message key.
      try { source = annotationSource({ kind: 'file', url: item.sourceUrl, path: item.sourcePath }, sessionId); }
      catch { /* The explicit message source below is the only fallback. */ }
    }
    if (!source && typeof item.seqKey === 'string' && item.seqKey.trim()) source = annotationSource({ kind: 'message', key: item.seqKey }, sessionId);
    if (!source) throw new Error(`旧批注第 ${index + 1} 项没有属于当前会话的明确来源，整批导入已取消`);
    const start = item.textOffset === undefined ? -1 : item.textOffset;
    if (typeof start !== 'number' || !Number.isSafeInteger(start) || start < -1) throw new TypeError(`旧批注第 ${index + 1} 项位置无效`);
    return copyAnnotation({
      id, sessionId, text, note: item.note ?? '', source,
      start, end: start === -1 ? -1 : start + text.length,
      before: item.ctxBefore ?? '', after: item.ctxAfter ?? '', createdAt: now, updatedAt: now,
    });
  });
}

export class AnnotationStore {
  private readonly listeners = new Set<(sessionId: string) => void>();
  private readonly connections = new Set<IDBDatabase>();
  private readonly pending = new Set<() => void>();
  private readonly environment: Environment;
  private channel: BroadcastChannel | undefined;
  private disposed = false;

  constructor(environment: Environment = globalThis) {
    this.environment = environment;
    try {
      if (environment.BroadcastChannel) {
        this.channel = new environment.BroadcastChannel(DATABASE);
        this.channel.onmessage = (event: MessageEvent<unknown>) => {
          const data = event.data;
          if (!data || typeof data !== 'object' || !('sessionId' in data)) return;
          try { this.notify(annotationKey(data.sessionId, '会话 ID')); } catch { /* Ignore invalid peer messages. */ }
        };
      }
    } catch { /* Storage remains usable where BroadcastChannel is unavailable. */ }
  }

  private ensureActive(): void { if (this.disposed) throw new Error('批注存储已关闭'); }

  private open(): Promise<IDBDatabase> {
    this.ensureActive();
    return new Promise((resolve, reject) => {
      let factory: IDBFactory | undefined;
      try { factory = this.environment.indexedDB; } catch (error) { reject(failure(error, '无法访问 IndexedDB')); return; }
      if (!factory) { reject(new Error('当前环境不支持 IndexedDB，批注未保存')); return; }
      let request: IDBOpenDBRequest;
      try { request = factory.open(DATABASE, 1); } catch (error) { reject(failure(error, '无法打开批注存储')); return; }
      let settled = false;
      const stop = (error: Error) => {
        if (settled) return;
        settled = true; clearTimeout(timer); this.pending.delete(cancel); reject(error);
      };
      const cancel = () => stop(new Error('批注存储已关闭'));
      const timer = setTimeout(() => stop(new Error('打开批注存储超时，请关闭占用数据库的旧窗口后重试')), OPEN_TIMEOUT);
      this.pending.add(cancel);
      request.onblocked = () => stop(new Error('批注数据库升级被其他窗口阻塞，请关闭旧窗口后重试'));
      request.onerror = () => stop(failure(request.error, '打开批注数据库失败'));
      request.onupgradeneeded = () => {
        if (settled || this.disposed) { request.transaction?.abort(); return; }
        try {
          const db = request.result;
          const items = db.createObjectStore(ITEMS, { keyPath: ['sessionId', 'id'] });
          items.createIndex('sessionId', 'sessionId');
          db.createObjectStore(IMPORTS, { keyPath: 'sessionId' });
        } catch (error) { request.transaction?.abort(); stop(failure(error, '初始化批注数据库失败')); }
      };
      request.onsuccess = () => {
        const db = request.result;
        if (settled || this.disposed) { db.close(); return; }
        settled = true; clearTimeout(timer); this.pending.delete(cancel);
        this.connections.add(db);
        db.onversionchange = () => { db.close(); this.connections.delete(db); };
        resolve(db);
      };
    });
  }

  private async transaction<T>(mode: IDBTransactionMode, action: (
    items: IDBObjectStore, imports: IDBObjectStore, finish: (value: T) => void, abort: (error: unknown) => void,
  ) => void): Promise<T> {
    const db = await this.open();
    try {
      this.ensureActive();
      return await new Promise<T>((resolve, reject) => {
        const tx = db.transaction([ITEMS, IMPORTS], mode);
        let result: T;
        let ready = false;
        let error: Error | undefined;
        const abort = (cause: unknown) => {
          error ??= failure(cause, '批注事务失败');
          try { tx.abort(); } catch { reject(error); }
        };
        tx.oncomplete = () => { if (ready) resolve(result); else reject(new Error('批注事务未产生结果')); };
        tx.onabort = () => reject(error ?? failure(tx.error, '批注事务已中止，数据未保存'));
        tx.onerror = () => { error ??= failure(tx.error, '批注读写失败，可能是存储空间不足'); };
        try { action(tx.objectStore(ITEMS), tx.objectStore(IMPORTS), value => { result = value; ready = true; }, abort); }
        catch (cause) { abort(cause); }
      });
    } finally { db.close(); this.connections.delete(db); }
  }

  async list(sessionId: string): Promise<Annotation[]> {
    annotationKey(sessionId, '会话 ID');
    return this.transaction('readonly', (items, _imports, finish, abort) => {
      const request = items.index('sessionId').getAll(sessionId, MAX_ITEMS + 1);
      request.onsuccess = () => {
        try {
          if (request.result.length > MAX_ITEMS) throw new Error('批注数量超限，未截断数据');
          const rows = (request.result as unknown[]).map(copyAnnotation);
          finish(rows.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)));
        } catch (error) { abort(error); }
      };
    });
  }

  async put(item: Annotation, expectedUpdatedAt?: number): Promise<Annotation> {
    const value = copyAnnotation(item);
    expectedVersion(expectedUpdatedAt);
    await this.transaction<void>('readwrite', (items, _imports, finish, abort) => {
      const request = items.get([value.sessionId, value.id]);
      request.onsuccess = () => {
        try {
          const old = request.result === undefined ? undefined : copyAnnotation(request.result);
          if (expectedUpdatedAt === undefined ? old !== undefined : old === undefined || old.updatedAt !== expectedUpdatedAt) throw conflict();
          const save = () => {
            value.updatedAt = nextVersion(old?.updatedAt);
            value.createdAt = old?.createdAt ?? value.updatedAt;
            items.put(value); finish(undefined);
          };
          if (old) { save(); return; }
          const count = items.index('sessionId').count(value.sessionId);
          count.onsuccess = () => {
            try { if (count.result >= MAX_ITEMS) throw new Error(`每个会话最多保存 ${MAX_ITEMS} 条批注`); save(); }
            catch (error) { abort(error); }
          };
        } catch (error) { abort(error); }
      };
    });
    this.changed(value.sessionId);
    return value;
  }

  async remove(sessionId: string, id: string, expectedUpdatedAt?: number): Promise<void> {
    annotationKey(sessionId, '会话 ID'); annotationKey(id, '批注 ID'); expectedVersion(expectedUpdatedAt);
    const changed = await this.transaction<boolean>('readwrite', (items, _imports, finish, abort) => {
      const request = items.get([sessionId, id]);
      request.onsuccess = () => {
        try {
          const old = request.result === undefined ? undefined : copyAnnotation(request.result);
          if (expectedUpdatedAt !== undefined && (!old || old.updatedAt !== expectedUpdatedAt)) throw conflict();
          if (old) items.delete([sessionId, id]);
          finish(old !== undefined);
        } catch (error) { abort(error); }
      };
    });
    if (changed) this.changed(sessionId);
  }

  async importLegacy(sessionId: string): Promise<number> {
    this.ensureActive(); annotationKey(sessionId, '会话 ID');
    const storage = this.environment.localStorage;
    if (!storage) throw new Error('当前环境无法读取旧批注存储');
    const raw = storage.getItem(LEGACY_PREFIX + encodeURIComponent(sessionId));
    if (raw === null || raw === '') return 0;
    const candidates = legacyItems(raw, sessionId);
    if (!candidates.length) return 0;
    const imported = await this.transaction<number>('readwrite', (items, imports, finish, abort) => {
      const metadata = imports.get(sessionId);
      metadata.onsuccess = () => {
        try {
          const record: unknown = metadata.result;
          let remembered: string[] = [];
          if (record !== undefined) {
            if (!record || typeof record !== 'object' || !('ids' in record) || !Array.isArray(record.ids) || record.ids.length > MAX_ITEMS) throw new Error('旧批注导入记录损坏');
            remembered = (record.ids as unknown[]).map(id => annotationKey(id, '导入批注 ID'));
          }
          const done = new Set(remembered);
          const fresh = candidates.filter(item => !done.has(item.id));
          if (!fresh.length) { finish(0); return; }
          if (done.size + fresh.length > MAX_ITEMS) throw new Error(`旧批注累计导入数量不能超过 ${MAX_ITEMS}`);
          const count = items.index('sessionId').count(sessionId);
          count.onsuccess = () => {
            let total = count.result;
            let added = 0;
            let cursor = 0;
            const next = () => {
              try {
                const item = fresh[cursor++];
                if (!item) {
                  imports.put({ sessionId, ids: [...done] } satisfies ImportRecord);
                  finish(added); return;
                }
                const request = items.get([sessionId, item.id]);
                request.onsuccess = () => {
                  try {
                    if (request.result === undefined) {
                      if (total >= MAX_ITEMS) throw new Error(`导入后批注超过 ${MAX_ITEMS} 条，整批导入已取消`);
                      items.add(item); total++; added++;
                    }
                    done.add(item.id); next();
                  } catch (error) { abort(error); }
                };
              } catch (error) { abort(error); }
            };
            next();
          };
        } catch (error) { abort(error); }
      };
    });
    if (imported) this.changed(sessionId);
    return imported;
  }

  subscribe(listener: (sessionId: string) => void): () => void {
    this.ensureActive(); this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  private notify(sessionId: string): void {
    if (this.disposed) return;
    for (const listener of [...this.listeners]) {
      try { listener(sessionId); } catch (error) { console.error('批注存储订阅回调失败', error); }
    }
  }
  private changed(sessionId: string): void {
    if (this.disposed) return;
    this.notify(sessionId);
    try { this.channel?.postMessage({ sessionId }); } catch { /* A committed write must not be reported as failed. */ }
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const cancel of [...this.pending]) cancel();
    for (const db of this.connections) db.close();
    this.connections.clear(); this.listeners.clear();
    this.channel?.close(); this.channel = undefined;
  }
}
