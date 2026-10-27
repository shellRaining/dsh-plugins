import { MAX_ITEMS, annotationKey, copyAnnotation, type Annotation } from './model.ts';

const DATABASE = 'dsh-local-annotation';
const ITEMS = 'annotations';
const OPEN_TIMEOUT = 10000;

type Environment = {
  indexedDB?: IDBFactory;
  BroadcastChannel?: typeof BroadcastChannel;
};

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
function sortRows(rows: Annotation[]): Annotation[] {
  return rows.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}
function maxNumber(rows: readonly Annotation[]): number {
  return rows.reduce((max, row) => Math.max(max, row.number), 0);
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
    items: IDBObjectStore, finish: (value: T) => void, abort: (error: unknown) => void,
  ) => void): Promise<T> {
    const db = await this.open();
    try {
      this.ensureActive();
      return await new Promise<T>((resolve, reject) => {
        const tx = db.transaction(ITEMS, mode);
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
        try { action(tx.objectStore(ITEMS), value => { result = value; ready = true; }, abort); }
        catch (cause) { abort(cause); }
      });
    } finally { db.close(); this.connections.delete(db); }
  }

  async list(sessionId: string): Promise<Annotation[]> {
    annotationKey(sessionId, '会话 ID');
    return this.transaction<Annotation[]>('readonly', (items, finish, abort) => {
      const request = items.index('sessionId').getAll(sessionId, MAX_ITEMS + 1);
      request.onsuccess = () => {
        try {
          if (request.result.length > MAX_ITEMS) throw new Error('批注数量超限，未截断数据');
          finish(sortRows((request.result as unknown[]).map(copyAnnotation)));
        } catch (error) { abort(error); }
      };
    });
  }

  async put(item: Annotation, expectedUpdatedAt?: number): Promise<Annotation> {
    const value = copyAnnotation(item);
    expectedVersion(expectedUpdatedAt);
    await this.transaction<void>('readwrite', (items, finish, abort) => {
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
          // The stored number is authoritative; callers never renumber an existing row.
          if (old) { value.number = old.number; save(); return; }
          const rows = items.index('sessionId').getAll(value.sessionId, MAX_ITEMS + 1);
          rows.onsuccess = () => {
            try {
              if (rows.result.length >= MAX_ITEMS) throw new Error(`每个会话最多保存 ${MAX_ITEMS} 条批注`);
              // Allocated inside the write transaction, so concurrent windows never share a number.
              value.number = maxNumber((rows.result as unknown[]).map(copyAnnotation)) + 1;
              save();
            } catch (error) { abort(error); }
          };
        } catch (error) { abort(error); }
      };
    });
    this.changed(value.sessionId);
    return value;
  }

  async remove(sessionId: string, id: string, expectedUpdatedAt?: number): Promise<void> {
    annotationKey(sessionId, '会话 ID'); annotationKey(id, '批注 ID'); expectedVersion(expectedUpdatedAt);
    const changed = await this.transaction<boolean>('readwrite', (items, finish, abort) => {
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
