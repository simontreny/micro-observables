import { Store, Unsubscribe } from "redux";
import { Observable, Options } from "..";

type Selector<T, TState> = (state: TState) => T;

export class ReduxObservable<T, TState = any> extends Observable<T> {
  private _store: Store<TState>;
  private _select: Selector<T, TState>;
  private _unsubscribe: Unsubscribe | undefined;

  constructor(store: Store<TState>, select: Selector<T, TState>, options?: Options<T>) {
    super(options);
    this._store = store;
    this._select = select;
  }

  get store(): Store<TState> {
    return this._store;
  }

  protected evaluate(): T {
    return this._select(this._store.getState());
  }

  protected onAttach() {
    this._unsubscribe = this._store.subscribe(() => Observable.batch(() => this.addToBatch()));
  }

  protected onDetach() {
    this._unsubscribe?.();
    this._unsubscribe = undefined;
  }
}

export function reduxObservable<T, TState = any>(
  store: Store<TState>,
  select: Selector<T, TState>,
  options?: Options<T>
) {
  return new ReduxObservable(store, select, options);
}
