import { DerivedObservable, Observable, Options, WritableObservable } from "./observable";

export function observable<T>(val: T, options?: Options<T>): WritableObservable<T> {
  return new WritableObservable(val, options);
}

export function derived<T>(compute: () => T, options?: Options<T>): DerivedObservable<T> {
  return new DerivedObservable(compute, options);
}

export function batch(block: () => void) {
  Observable.batch(block);
}

export function fromPromise<T, E = undefined>(
  promise: Promise<T>,
  onError?: (error: any) => E
): Observable<T | E | undefined> {
  const obs = observable<T | E | undefined>(undefined);
  promise.then(
    (val) => obs.set(val),
    (e) => onError && obs.set(onError(e))
  );
  return obs;
}

export function toPromise<T>(observable: Observable<T>): Promise<T> {
  return new Promise((resolve) => {
    const unsubscribe = observable.onChange((val) => {
      resolve(val);
      unsubscribe();
    });
  });
}
