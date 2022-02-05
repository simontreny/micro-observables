import { WritableObservable } from "../observable";

const VERSION_KEY = "mo-persist.version";
const UNSET = Symbol();

type Nullable<T> = T | null | undefined;

export interface Storage {
  getItem(key: string): Promise<Nullable<string>> | Nullable<string>;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
}

export interface MigrationOperations {
  get<T = any>(key: string): Promise<T | undefined>;
  get<T = any>(key: string, defaultVal: T): Promise<T>;
  set<T = any>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

export type Migration = (operations: MigrationOperations) => Promise<void>;

export interface PersistOptions {
  storage: Storage;
  migrations?: Migration[];
  readOnly?: boolean;
  onInfo?: (message: string) => void;
  onError?: (message: string, error: any) => void;
}

export interface Persistor {
  persist(mapping: Record<string, any>, keyPrefix?: string): Promise<void>;
  persistSingle(observable: WritableObservable<any>, key: string): Promise<void>;
  waitForReady(): Promise<void>;
  flush(): Promise<void>;
}

export function createPersist(options: PersistOptions): Persistor {
  let migratePromise: Promise<void> | undefined;
  const loadPromises: Promise<any>[] = [];
  const savePromises: Promise<any>[] = [];

  async function persist(mapping: Record<string, any>, keyPrefix?: string): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const key of Object.keys(mapping)) {
      const value = mapping[key];
      if (value instanceof WritableObservable) {
        promises.push(persistSingle(value, keyPrefix ? `${keyPrefix}.${key}` : key));
      }
    }
    await Promise.all(promises);
  }

  async function persistSingle(observable: WritableObservable<any>, key: string): Promise<void> {
    await runLoadAsync(async () => {
      const value = await get(key, UNSET);
      if (value !== UNSET) {
        observable.set(value);
      }
      observable.subscribe((newValue) => runSaveAsync(() => set(key, newValue)));
    });
  }

  async function waitForReady(): Promise<void> {
    await Promise.all(migratePromise ? [migratePromise, ...loadPromises] : loadPromises);
  }

  async function flush(): Promise<void> {
    await Promise.all(savePromises);
  }

  async function runLoadAsync<T>(block: () => Promise<T>): Promise<T> {
    if (migratePromise) {
      await migratePromise;
    }
    const promise = block();
    loadPromises.push(promise);
    promise.finally(() => loadPromises.splice(loadPromises.indexOf(promise), 1));
    return promise;
  }

  function runSaveAsync<T>(block: () => Promise<T>): Promise<T> {
    const promise = block();
    savePromises.push(promise);
    promise.finally(() => savePromises.splice(savePromises.indexOf(promise), 1));
    return promise;
  }

  function migrate(): Promise<void> {
    migratePromise = (async () => {
      const { migrations = [] } = options;
      const version = (await get<number>(VERSION_KEY)) ?? 0;

      if (migrations.length < version) {
        onError("Downgrading is not supported", undefined);
        return;
      }

      const operations = { get, set, remove };
      for (let i = version; i < migrations.length; i++) {
        const newVersion = i + 1;
        onInfo(`Migrating to version ${newVersion}`);
        await migrations[i](operations);
        await set<number>(VERSION_KEY, newVersion);
        onInfo(`Successfully migrated to version ${newVersion}`);
      }
    })();
    migratePromise.finally(() => {
      migratePromise = undefined;
    });
    return migratePromise;
  }

  function get<T = any>(key: string): Promise<T | undefined>;
  function get<T = any>(key: string, defaultVal: T): Promise<T>;
  async function get(key: string, defaultVal?: any): Promise<any> {
    const { storage } = options;
    try {
      const serialized = await storage.getItem(key);
      return serialized ? JSON.parse(serialized) : defaultVal;
    } catch (e) {
      onError(`Unable to read value for key ${key}`, e);
      return defaultVal;
    }
  }

  async function set<T = any>(key: string, value: T): Promise<void> {
    const { storage, readOnly } = options;
    try {
      const serialized = JSON.stringify(value);
      if (!readOnly) {
        await storage.setItem(key, serialized);
      }
    } catch (e) {
      onError(`Unable to write value for key ${key}`, e);
    }
  }

  async function remove(key: string): Promise<void> {
    const { storage, readOnly } = options;
    try {
      if (!readOnly) {
        await storage.removeItem(key);
      }
    } catch (e) {
      onError(`Unable to remove value for key ${key}`, e);
    }
  }

  function onInfo(message: string) {
    if (options.onInfo) {
      options.onInfo(message);
    } else if (process.env.NODE_ENV !== "production") {
      console.log("[micro-observables-persist] " + message);
    }
  }

  function onError(message: string, error: any) {
    if (options.onError) {
      options.onError(message, error);
    } else if (process.env.NODE_ENV !== "production") {
      console.error("[micro-observables-persist] " + message, error);
    }
  }

  migrate();

  return { persist, persistSingle, waitForReady, flush };
}
