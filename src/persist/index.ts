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
  const {
    migrations = [],
    readOnly = false,
    onInfo = (message) =>
      process.env.NODE_ENV !== "production" && console.log(`[micro-observables-persist] ${message}`),
    onError = (message, error) =>
      process.env.NODE_ENV !== "production" && console.error(`[micro-observables-persist] ${message}`, error),
  } = options;
  const storage = readOnly ? createReadOnlyStorage(options.storage) : options.storage;

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
    try {
      const serialized = storage.getItem(key);
      return serialized ? JSON.parse(serialized) : defaultVal;
    } catch (e) {
      onError(`Unable to read value for key ${key}`, e);
      return defaultVal;
    }
  }

  function set<T = any>(key: string, value: T): void {
    try {
      const serialized = JSON.stringify(value);
      storage.setItem(key, serialized);
    } catch (e) {
      onError(`Unable to write value for key ${key}`, e);
    }
  }

  function remove(key: string): void {
    try {
      storage.removeItem(key);
    } catch (e) {
      onError(`Unable to remove value for key ${key}`, e);
    }
  }

  function createReadOnlyStorage(storage: Storage): Storage {
    const modifiedItems: { [key: string]: string | undefined } = {};

    return {
      getItem: (key) => {
        return key in modifiedItems ? modifiedItems[key] : storage.getItem(key);
      },
      setItem: (key, value) => {
        modifiedItems[key] = value;
      },
      removeItem: (key) => {
        modifiedItems[key] = undefined;
      },
    };
  }

  migrate();

  return { persist, persistSingle };
}
