import { DEFAULT_SETTINGS, PLUGIN_ID, normalizeSettings, type Settings, type SettingsPatch } from './settings.ts';
import { createStorage, type StoragePatch, type StoredRecord } from './storage.ts';
import { prepareImage } from './image.ts';

// Settings state shared by the panel and the appearance: persisted in
// IndexedDB, serialized writes, slider previews kept until committed, and
// cross-window refresh through BroadcastChannel or window focus.
export interface Snapshot {
  readonly settings: Settings;
  readonly name: string;
  readonly url: string;
  readonly loading: boolean;
  readonly busy: boolean;
  readonly error: string;
}

export interface Controller {
  subscribe(listener: () => void): () => void;
  getSnapshot(): Snapshot;
  preview(settings: SettingsPatch): void;
  commit(settings: SettingsPatch): Promise<void>;
  commitPreview(key: keyof Settings): Promise<void>;
  upload(file: Blob): Promise<void>;
  remove(): Promise<void>;
  reset(): Promise<void>;
  dispose(): void;
}

type Environment = Pick<Window & typeof globalThis, 'indexedDB' | 'BroadcastChannel' | 'URL' | 'addEventListener' | 'removeEventListener'>;
interface Dirty { value: Settings[keyof Settings]; version: number }

export function createController(env: Environment = window): Controller {
  const storage = createStorage(env.indexedDB);
  const listeners = new Set<() => void>();
  let disposed = false;
  let serial: Promise<void> = Promise.resolve();
  let imageRevision = -1;
  let url = '';
  let snapshot: Snapshot = { settings: { ...DEFAULT_SETTINGS }, name: '', url: '', loading: true, busy: false, error: '' };
  const dirty = new Map<keyof Settings, Dirty>();
  const pending = new Map<keyof Settings, number>();
  let generation = 0;
  function effective(settings: Settings): Settings {
    return normalizeSettings({ ...settings, ...Object.fromEntries([...dirty].map(([key, entry]) => [key, entry.value])) });
  }
  let channel: BroadcastChannel | undefined;
  try { channel = new env.BroadcastChannel(PLUGIN_ID); } catch { /* focus refresh remains available */ }
  function publish(patch: Partial<Snapshot>) {
    if (disposed) return;
    snapshot = { ...snapshot, ...patch };
    listeners.forEach(listener => listener());
  }
  function adopt(stored: StoredRecord) {
    if (disposed) return;
    const { image, imageRevision: revision, name } = stored;
    const settings = effective(stored.settings);
    if (revision !== imageRevision) {
      const previous = url;
      url = image ? env.URL.createObjectURL(image) : '';
      imageRevision = revision;
      publish({ settings, name, url, loading: false, error: '' });
      if (previous) env.URL.revokeObjectURL(previous);
    } else publish({ settings, name, url, loading: false, error: '' });
  }
  function enqueue(action: () => Promise<void> | void): Promise<void> {
    const result = serial.then(() => disposed ? undefined : action());
    serial = result.catch((error: unknown) => {
      publish({ loading: false, busy: false, error: error instanceof Error ? error.message : String(error) });
    });
    return serial;
  }
  const refresh = () => enqueue(async () => adopt(await storage.read()));
  const onFocus = () => { void refresh(); };
  env.addEventListener('focus', onFocus);
  if (channel) channel.onmessage = onFocus;
  void refresh();
  async function save(patch: StoragePatch, versions = new Map<keyof Settings, number>()) {
    const stored = await storage.update(patch);
    if (disposed) {
      // An already-started transaction may finish after unload. Notify peers
      // without resurrecting the controller or retaining an open channel.
      try {
        const notification = new env.BroadcastChannel(PLUGIN_ID);
        notification.postMessage('changed'); notification.close();
      } catch { /* peers also refresh on focus */ }
      return;
    }
    for (const [key, version] of versions) {
      if (dirty.get(key)?.version === version) dirty.delete(key);
    }
    adopt(stored);
    channel?.postMessage('changed');
  }
  const keysOf = (settings: SettingsPatch) => Object.keys(settings) as (keyof Settings)[];
  return {
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot() { return snapshot; },
    preview(settings) {
      const normalized = normalizeSettings({ ...snapshot.settings, ...settings });
      for (const key of keysOf(settings)) {
        if (Object.hasOwn(DEFAULT_SETTINGS, key)) dirty.set(key, { value: normalized[key], version: ++generation });
      }
      publish({ settings: effective(snapshot.settings) });
    },
    commit(settings) {
      const versions = new Map(keysOf(settings).flatMap(key => {
        const entry = dirty.get(key);
        return entry ? [[key, entry.version] as const] : [];
      }));
      return enqueue(() => save({ settings }, versions));
    },
    commitPreview(key) {
      const entry = dirty.get(key);
      if (!entry || pending.get(key) === entry.version) return Promise.resolve();
      pending.set(key, entry.version);
      const versions = new Map([[key, entry.version]]);
      return enqueue(async () => {
        try { await save({ settings: { [key]: entry.value } }, versions); }
        finally { if (pending.get(key) === entry.version) pending.delete(key); }
      });
    },
    upload(file) {
      if (snapshot.busy || disposed) return Promise.resolve();
      publish({ busy: true, error: '' });
      return enqueue(async () => {
        try {
          const prepared = await prepareImage(file);
          if (!disposed) await save({ ...prepared, settings: { enabled: true } });
        } finally { publish({ busy: false }); }
      });
    },
    remove() { return enqueue(() => save({ image: null, name: '' })); },
    reset() {
      dirty.clear();
      return enqueue(() => save({ settings: DEFAULT_SETTINGS }));
    },
    dispose() {
      disposed = true;
      env.removeEventListener('focus', onFocus);
      channel?.close();
      listeners.clear();
      if (url) env.URL.revokeObjectURL(url);
      url = ''; imageRevision = -1;
    },
  };
}
