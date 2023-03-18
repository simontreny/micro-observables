import { batch, derived, observable } from "./interface";
import { Observable, Options, WritableObservable } from "./observable";

export type AsyncState<TError = any> = {
  error: TError | undefined;
  isFetching: boolean;
  isLoaded: boolean;
};

function asyncObservable<TData, TError = any>(
  fetcher: () => Promise<TData>,
  options?: Options<TData>
): AsyncObservable<TData, undefined, TError> {
  return new AsyncObservable(fetcher, options);
}

const obs1 = asyncObservable(async () => 23);

export /*abstract*/ class AsyncObservable<TData, TInitialData = undefined, TError = any> extends Observable<
  TData | TInitialData
> {
  private _fetcher: () => Promise<TData>;
  private _promise: Promise<TData> | undefined;
  private _data: TData;
  private _state: WritableObservable<AsyncState<TError>>;

  constructor(fetcher: () => Promise<TData>, initialData: TInitialData, options: Options<T> = {}) {
    super(options);
    this._fetcher = fetcher;
    this._data = initialData;
    this._status = observable<AsyncStatus<TError>>({ error: undefined, isFetching: false, isInitialData: true }); // TODO: deep comparison
  }

  getState(): Observable<AsyncState<T, TError>> {
    return this._withState;
  }

  invalidate() {
    batch(() => {
      this.cancel();
      if (this._observed) {
        this.fetch();
      }
    });
  }

  async fetch(): Promise<T> {
    if (!this._promise) {
      const promise = this._fetcher();
      this._promise = promise;
      this._status.update((status) => ({ ...status, isFetching: true }));
      try {
        // TODO: can promise have changed? What does it mean?
        const data = await promise;
        // TODO: can promise have changed? What does it mean? We should probably ignore the result!
        if (this._promise === promise) {
          batch(() => {
            this._data = data;
            this._status.update((status) => ({ ...status, error: undefined, isFetching: false }));
            this.markAsDirty();
          });
        }
        return data;
      } catch (e: any) {
        this._status.update((status) => ({ ...status, error: e, isFetching: false }));
      }
    }
    return this._promise;
  }

  cancel() {
    this._promise = undefined;
    this._status.update((status) => ({ ...status, isFetching: false }));
    // TODO: support proper cancellation with CancelToken?
  }

  protected evaluate(): T {
    return this._data;
  }

  protected override onBecomeObserved() {
    this.fetch();
  }
}

export class WritableAsyncObservable<T> extends AsyncObservable<T> {
  constructor(run: () => Promise<T>, options: Options<T>);

  set(val: T) {}

  update(updater: (val: T | undefined) => T) {}

  // reset() ?

  readOnly(): AsyncObservable<T> {
    return this;
  }
}

function derivedAsync() {}
