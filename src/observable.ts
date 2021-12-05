export type BatchedUpdateFn = (block: () => void) => void;

export let batchedUpdateFn: BatchedUpdateFn | undefined;

let batchedObservables: BaseObservable<any>[] = [];
let batchDepth = 0;
let revision = 0;

// Thoughts:
// - add a global revision number that's bumped when batch ends if some observables were dirty?
// - add evaled revision number?
// - do we need the dirty flag? do we need the revision number?
// If we remove dirty, setting an observable will cause all unrelated observables to be reevaluated.

// When to evaluate?
// this._val === UNSET || (!this._attached ? this._evalRevision !== globalRevision : this.dirty)

export const UNSET = Symbol();

export type Listener<T> = (val: T, prevVal: T) => void;
export type Unsubscriber = () => void;
export type EqualityFn<T> = (a: T, b: T) => boolean;
export type Revision = number;

export interface Options<T> {
  equalityFn?: EqualityFn<T>;
}

export abstract class BaseObservable<T> {
  protected _val: T | typeof UNSET = UNSET;
  protected _equalityFn?: EqualityFn<T>;
  protected _listeners: Listener<T>[] = [];
  protected _inputs: BaseObservable<any>[] = [];
  protected _outputs: BaseObservable<any>[] = [];
  /*protected */ _revision: Revision = -1;
  protected _refreshRevision: Revision = -1;
  protected _attached = false;
  protected _dirty = false; // What if refresh is called in a batch(() => ...) ? When should we increment revision?

  constructor(options: Options<T> = {}) {
    this._equalityFn = options.equalityFn;
  }

  get(): T {
    this.refresh();
    BaseObservable.onGet?.(this);
    return this._val as T;
  }

  static onGet: ((observable: BaseObservable<any>) => void) | undefined;

  /*protected */ refresh(): boolean {
    const refreshRevision = this._refreshRevision;
    this._refreshRevision = revision;

    if (this._val === UNSET) {
      this._val = this.evaluate();
      this._revision = revision;
      return false;
    }

    const outdated = (!this._attached || this._dirty) && refreshRevision !== revision; // What if refresh is called in a batch(() => ...) ? When should we increment revision?
    if (outdated) {
      const val = this.evaluate();
      if (this._val !== val && (!this._equalityFn || !this._equalityFn(this._val, val))) {
        this._val = val;
        this._revision = revision;
        return true;
      }
    }

    return false;
  }

  protected abstract evaluate(): T;

  subscribe(listener: Listener<T>): Unsubscriber {
    this._listeners.push(listener);
    this.attachInputs();

    let listenerRemoved = false;
    return () => {
      if (!listenerRemoved) {
        listenerRemoved = true;
        this._listeners.splice(this._listeners.indexOf(listener), 1);
        this.detachInputs();
      }
    };
  }

  get inputs(): BaseObservable<any>[] {
    return this._inputs;
  }

  protected addInput(input: BaseObservable<any>) {
    this._inputs.push(input);
    if (this._attached) {
      this.attachInput(input);
    }
  }

  protected removeInput(input: BaseObservable<any>) {
    this._inputs.splice(this._inputs.indexOf(input), 1);
    if (this._attached) {
      this.detachInput(input);
    }
  }

  private isObserved(): boolean {
    // An observable is observed when at least one listener is subscribed to the observable or to one of its outputs
    return this._listeners.length > 0 || this._outputs.length > 0;
  }

  private attachInputs() {
    if (!this._attached && this.isObserved()) {
      this._attached = true;

      for (const input of this._inputs) {
        this.attachInput(input);
        input.attachInputs();
      }

      // Since the observable was not attached to its inputs, its value may be outdated.
      // Refresh it so that listeners will be called with the correct prevVal the next time an input changes.
      this.refresh();

      this.onAttach();
    }
  }

  private detachInputs() {
    if (this._attached && !this.isObserved()) {
      this._attached = false;
      for (const input of this._inputs) {
        this.detachInput(input);
        input.detachInputs();
      }

      this.onDetach();
    }
  }

  private attachInput(input: BaseObservable<any>) {
    input._outputs.push(this);
  }

  private detachInput(input: BaseObservable<any>) {
    input._outputs.splice(input._outputs.indexOf(this), 1);
  }

  protected onAttach() {
    // Can be overriden to run some code when the observable becomes attached (i.e. observed).
    // For example, it can be used to perform network calls or read from local storage or a DB
  }

  protected onDetach() {}

  protected addToBatch() {
    if (!this._dirty) {
      // What if refresh is called in a batch(() => ...) ? When should we increment revision?
      this._dirty = true; // What if refresh is called in a batch(() => ...) ? When should we increment revision?

      // Add the observable and its outputs in reverse topological order
      for (const output of this._outputs) {
        output.addToBatch();
      }
      batchedObservables.push(this);
    }
  }

  static batch(block: () => void) {
    try {
      batchDepth++;
      if (batchDepth === 1 && batchedUpdateFn) {
        batchedUpdateFn(block);
      } else {
        block();
      }
    } finally {
      batchDepth--;
      if (batchDepth === 0) {
        const observables = batchedObservables;
        batchedObservables = [];
        revision++;

        // Refresh dirty observables and calls listeners when they have changed.
        // We iterate in reverse order as setDirty() adds them in reverse topological order
        for (let i = observables.length - 1; i >= 0; i--) {
          const observable = observables[i];
          const prevVal = observable._val;
          const hasChanged = observable.refresh();
          const val = observable._val;
          observable._dirty = false; // What if refresh is called in a batch(() => ...) ? When should we increment revision?

          if (hasChanged) {
            for (const listener of observable._listeners.slice()) {
              listener(val, prevVal);
            }
          }
        }
      }
    }
  }
}

export class Observable<T> extends BaseObservable<T> {
  protected _defaultVal: T;

  constructor(defaultVal: T, options?: Options<T>) {
    super(options);
    this._defaultVal = defaultVal;
  }

  get defaultVal(): T {
    return this._defaultVal;
  }

  protected evaluate(): T {
    return this._defaultVal;
  }
}

export class WritableObservable<T> extends Observable<T> {
  protected _next: T | typeof UNSET = UNSET;

  set(val: T) {
    BaseObservable.batch(() => {
      this._next = val;
      this.addToBatch();
    });
  }

  update(updater: (val: T) => T) {
    this.set(updater(this.get()));
  }

  reset() {
    this.set(this.defaultVal);
  }

  readOnly(): Observable<T> {
    return this;
  }

  protected evaluate(): T {
    const next = this._next;
    this._next = UNSET;
    return next !== UNSET ? next : this._val !== UNSET ? this._val : this._defaultVal;
  }
}

export class DerivedObservable<T> extends BaseObservable<T> {
  private _compute: () => T;
  private _prevInputs = new Map<BaseObservable<any>, Revision>();
  private _memoized: T | typeof UNSET = UNSET;

  constructor(compute: () => T, options?: Options<T>) {
    super(options);
    this._compute = compute;
  }

  protected evaluate(): T {
    let inputsHaveChanged = false;
    if (this._memoized === UNSET) {
      inputsHaveChanged = true;
    } else {
      for (const [input, revision] of this._prevInputs) {
        input.refresh();
        if (input._revision !== revision) {
          inputsHaveChanged = true;
          break;
        }
      }
    }
    if (!inputsHaveChanged) {
      return this._memoized as T;
    }

    const inputs = new Map<BaseObservable<any>, Revision>();
    const prevOnGet = BaseObservable.onGet;
    try {
      BaseObservable.onGet = input => inputs.set(input, input._revision);
      const val = this._compute();

      for (const input of inputs.keys()) {
        if (!this._prevInputs.has(input)) {
          this.addInput(input);
        } else {
          this._prevInputs.delete(input);
        }
      }
      for (const prevInput of this._prevInputs.keys()) {
        this.removeInput(prevInput);
      }
      this._memoized = val;
      this._prevInputs = inputs;
      return val;
    } finally {
      BaseObservable.onGet = prevOnGet;
    }
  }
}
