import { DEFAULT_SETTINGS, PLUGIN_ID, normalizeSettings, object, own, type Settings } from './settings.ts';

// One IndexedDB record ('state'/'current'): settings, the prepared image Blob,
// its file name and a revision that lets peers skip unchanged images.
export interface StoredRecord {
  settings: Settings;
  image: Blob | null;
  name: string;
  imageRevision: number;
}

export interface StoragePatch {
  settings?: Partial<Settings>;
  image?: Blob | null;
  name?: string;
}

export interface Storage {
  read(): Promise<StoredRecord>;
  update(input?: StoragePatch): Promise<StoredRecord>;
}

function record(input: unknown): StoredRecord {
  const value = object(input);
  const revision = value.imageRevision;
  return {
    settings: normalizeSettings(value.settings),
    image: value.image instanceof Blob ? value.image : null,
    name: typeof value.name === 'string' ? value.name : '',
    imageRevision: Number.isSafeInteger(revision) && (revision as number) >= 0 ? revision as number : 0,
  };
}

export function createStorage(indexedDB: IDBFactory | undefined = globalThis.indexedDB): Storage {
  function open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (!indexedDB) return reject(new Error('IndexedDB is unavailable'));
      let settled = false;
      const request = indexedDB.open(PLUGIN_ID, 1);
      request.onupgradeneeded = () => {
        // A blocked request may finish after its caller has already received an error.
        if (settled) return request.transaction?.abort();
        request.result.createObjectStore('state');
      };
      request.onerror = () => { settled = true; reject(request.error || new Error('Cannot open wallpaper storage')); };
      request.onblocked = () => { settled = true; reject(new Error('Wallpaper storage upgrade is blocked')); };
      request.onsuccess = () => {
        const db = request.result;
        if (settled) return db.close();
        settled = true;
        db.onversionchange = () => db.close();
        resolve(db);
      };
    });
  }

  async function transact(patch?: StoragePatch & { settings: Partial<Settings> }): Promise<StoredRecord> {
    const db = await open();
    try {
      return await new Promise<StoredRecord>((resolve, reject) => {
        const tx = db.transaction('state', patch ? 'readwrite' : 'readonly');
        let result: StoredRecord | undefined;
        let failure: unknown;
        tx.oncomplete = () => resolve(result ?? record(undefined));
        tx.onabort = () => reject(failure || tx.error || new Error('Wallpaper storage transaction aborted'));
        tx.onerror = () => { failure ||= tx.error; };
        const store = tx.objectStore('state');
        const request = store.get('current');
        request.onsuccess = () => {
          try {
            const current = record(request.result);
            result = current;
            if (!patch) return;
            current.settings = normalizeSettings({ ...current.settings, ...patch.settings });
            if (patch.image !== undefined) {
              current.image = patch.image;
              current.imageRevision = current.imageRevision < Number.MAX_SAFE_INTEGER ? current.imageRevision + 1 : 0;
            }
            if (patch.name !== undefined) current.name = patch.name;
            if (current.image === null) current.name = '';
            store.put(current, 'current');
          } catch (error) {
            failure = error;
            tx.abort();
          }
        };
      });
    } finally {
      db.close();
    }
  }

  const read = () => transact();
  const update = async (input: StoragePatch = {}) => {
    const value = object(input);
    // Snapshot only accepted fields before awaiting the connection.
    const patch: StoragePatch & { settings: Partial<Settings> } = { settings: {} };
    const settings = object(value.settings);
    const accepted = patch.settings as Record<string, unknown>;
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (own(settings, key)) accepted[key] = settings[key];
    }
    if (own(value, 'image')) {
      if (value.image !== null && !(value.image instanceof Blob)) throw new TypeError('image must be a Blob or null');
      patch.image = value.image;
    }
    if (own(value, 'name')) {
      if (typeof value.name !== 'string') throw new TypeError('name must be a string');
      patch.name = value.name;
    }
    return transact(patch);
  };
  return { read, update };
}
