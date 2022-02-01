import { WritableObservable } from "../observable";

const versionKey = "mo-persist.version";

type Nullable<T> = T | null | undefined;

export const UNSET = Symbol();

export interface Storage {
  getItem(key: string): Promise<Nullable<string>> | Nullable<string>;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
}

export interface MigrationOperations {
  get: <T = any>(key: string) => Promise<T | typeof UNSET>;
  set: <T = any>(key: string, value: T) => Promise<void>;
  remove: (key: string) => void;
}

export type Migration = (operations: MigrationOperations) => Promise<void>;

export interface PersistOptions {
  storage: Storage;
  migrations?: Migration[];
  readOnly?: boolean;
  onInfo?: (message: string) => void;
  onError?: (message: string, error: any) => void;
}

export class Persistor {
  private _options: PersistOptions;
  private _pendingPromises: Promise<any>[] = [];

  constructor(options: PersistOptions) {
    this._options = options;
    this.applyMigrations();
  }

  persist = async (mapping: Record<string, any>, keyPrefix: string): Promise<void> => {
    for (const key of Object.keys(mapping)) {
      const value = mapping[key];
      if (value instanceof WritableObservable) {
        await this.persistSingle(value, `${keyPrefix}.${key}`);
      }
    }
  };

  persistSingle = async (observable: WritableObservable<any>, key: string): Promise<void> => {
    const value = await this.runAsync(() => this.get(key));
    if (value !== UNSET) {
      observable.set(value);
    }
    observable.subscribe(newValue => this.set(key, newValue));
  };

  waitForLoaded = async (): Promise<void> => {
    await Promise.all(this._pendingPromises);
  };

  private runAsync<T>(block: () => Promise<T>): Promise<T> {
    const promise = block();
    this._pendingPromises.push(promise);
    promise.finally(() => this._pendingPromises.splice(this._pendingPromises.indexOf(promise), 1));
    return promise;
  }

  private applyMigrations(): Promise<void> {
    return this.runAsync(async () => {
      const { migrations = [] } = this._options;
      const version = (await this.get(versionKey)) ?? 0;

      if (migrations.length < version) {
        this.onError("Downgrading is not supported", undefined);
        return;
      }

      const { get, set, remove } = this;
      const operations = { get, set, remove };
      for (let i = version; i < migrations.length; i++) {
        const newVersion = version + 1;
        this.onInfo(`Migrating to version ${newVersion}`);
        await migrations[i](operations);
        await this.set(versionKey, newVersion);
        this.onInfo(`Successfully migrated to version ${newVersion}`);
      }
    });
  }

  private get = async <T = any>(key: string): Promise<T | typeof UNSET> => {
    const { storage } = this._options;
    try {
      const serialized = await storage.getItem(key);
      return serialized ? JSON.parse(serialized) : UNSET;
    } catch (e) {
      this.onError(`Failed to read value for key ${key}`, e);
      return UNSET;
    }
  };

  private set = async <T = any>(key: string, value: T): Promise<void> => {
    const { storage, readOnly } = this._options;
    try {
      const serialized = JSON.stringify(value);
      if (!readOnly) {
        await storage.setItem(key, serialized);
      }
    } catch (e) {
      this.onError(`Failed to write value for key ${key}`, e);
    }
  };

  private remove = async (key: string): Promise<void> => {
    const { storage, readOnly } = this._options;
    try {
      if (!readOnly) {
        await storage.removeItem(key);
      }
    } catch (e) {
      this.onError(`Failed to remove value for key ${key}`, e);
    }
  };

  private onInfo(message: string) {
    if (this._options.onInfo) {
      this._options.onInfo(message)
    } else if (process.env.NODE_ENV !== "production") {
      console.log("[micro-observables-persist] " + message);
    }
  }

  private onError(message: string, error: any) {
    if (this._options.onError) {
      this._options.onError(message, error)
    } else if (process.env.NODE_ENV !== "production") {
      console.error("[micro-observables-persist] " + message, error);
    }
  }
}

export function createPersist(options: PersistOptions): Persistor {
  return new Persistor(options);
}
