import { QueryClient, QueryKey, QueryObserver, QueryObserverOptions } from "react-query";
import { Observable, Options } from "..";

export interface QueryOptions<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey
> extends QueryObserverOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>, Options<TData | undefined> {
  client?: QueryClient;
}

export class QueryObservable<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey
> extends Observable<TData | undefined> {
  private _options: QueryOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>;
  private _observer: QueryObserver<TQueryFnData, TError, TData, TQueryData, TQueryKey>;
  private _unsubscribe: (() => void) | undefined;

  static defaultClient = new QueryClient();

  constructor(options: QueryOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>) {
    super(options);
    this._options = options;
    this._observer = new QueryObserver(this.client, this._options);
  }

  get client(): QueryClient {
    return this._options.client ?? QueryObservable.defaultClient;
  }

  protected evaluate(): TData | undefined {
    const result = this._observer.getOptimisticResult(this._options);
    return result.data;
  }

  protected onAttach() {
    this._unsubscribe = this._observer.subscribe(() => Observable.batch(() => this.addToBatch()));
  }

  protected onDetach() {
    this._unsubscribe?.();
    this._unsubscribe = undefined;
  }
}

export function queryObservable<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey
>(options: QueryOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>) {
  return new QueryObservable(options);
}
