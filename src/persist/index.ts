import { WritableObservable } from "../observable";

const VERSION_KEY = "micro-observables-persist.version";
const UNSET = Symbol();

export interface Storage {
  getItem(key: string): string | null | undefined;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface MigrationOperations {
  get<T = any>(key: string): T | undefined;
  get<T = any>(key: string, defaultVal: T): T;
  set<T = any>(key: string, value: T): void;
  remove(key: string): void;
}

export type Migration = (operations: MigrationOperations) => void;

export interface PersistOptions {
  storage: Storage;
  migrations?: Migration[];
  readOnly?: boolean;
  onInfo?: (message: string) => void;
  onError?: (message: string, error: any) => void;
}

export interface Persistor {
  persist(mapping: Record<string, any>, keyPrefix?: string): void;
  persistSingle(observable: WritableObservable<any>, key: string): void;
}

export function createPersist(options: PersistOptions): Persistor {
  function persist(mapping: Record<string, any>, keyPrefix?: string): void {
    for (const key of Object.keys(mapping)) {
      const value = mapping[key];
      if (value instanceof WritableObservable) {
        persistSingle(value, keyPrefix ? `${keyPrefix}.${key}` : key);
      }
    }
  }

  function persistSingle(observable: WritableObservable<any>, key: string): void {
    const value = get(key, UNSET);
    if (value !== UNSET) {
      observable.set(value);
    }
    observable.subscribe((newValue) => set(key, newValue));
  }

  function migrate(): void {
    const { migrations = [] } = options;
    const version = get<number>(VERSION_KEY) ?? 0;

    if (migrations.length < version) {
      onError("Downgrading is not supported", undefined);
      return;
    }

    const operations = { get, set, remove };
    for (let i = version; i < migrations.length; i++) {
      const newVersion = i + 1;
      onInfo(`Migrating to version ${newVersion}`);
      migrations[i](operations);
      set<number>(VERSION_KEY, newVersion);
      onInfo(`Successfully migrated to version ${newVersion}`);
    }
  }

  function get<T = any>(key: string): T | undefined;
  function get<T = any>(key: string, defaultVal: T): T;
  function get(key: string, defaultVal?: any): any {
    const { storage } = options;
    try {
      const serialized = storage.getItem(key);
      return serialized ? JSON.parse(serialized) : defaultVal;
    } catch (e) {
      onError(`Unable to read value for key ${key}`, e);
      return defaultVal;
    }
  }

  function set<T = any>(key: string, value: T): void {
    const { storage, readOnly } = options;
    try {
      const serialized = JSON.stringify(value);
      if (!readOnly) {
        storage.setItem(key, serialized);
      }
    } catch (e) {
      onError(`Unable to write value for key ${key}`, e);
    }
  }

  function remove(key: string): void {
    const { storage, readOnly } = options;
    try {
      if (!readOnly) {
        storage.removeItem(key);
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

  return { persist, persistSingle };
}
