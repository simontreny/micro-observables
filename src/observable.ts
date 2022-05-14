import { batchedUpdateFn } from "./batchedUpdate";

export type Listener<T> = (val: T, prevVal: T) => void;
export type Unsubscriber = () => void;
export type EqualityFn<T> = (a: T, b: T) => boolean;
export type Revision = number;

export const UNSET = Symbol();

let dirtyObservables: Observable<any>[] = [];
let batchDepth = 0;
let globalRevision = 0;

export interface Options<T> {
  equalityFn?: EqualityFn<T>;
}

export abstract class Observable<T> {
  protected _val: T | typeof UNSET = UNSET;
  protected _options: Options<T>;
  protected _listeners: Listener<T>[] = [];
  protected _inputs: Observable<any>[] = [];
  protected _outputs: Observable<any>[] = [];
  protected _revision: Revision = -1;
  protected _refreshRevision: Revision = -1;
  protected _observed = false;
  protected _dirty = false;

  constructor(options: Options<T> = {}) {
    this._options = options;
  }

  get(): T {
    this.refresh();
    Observable.onGet?.(this);
    return this._val as T;
  }

  static onGet: ((observable: Observable<any>) => void) | undefined;

  protected refresh(): boolean {
    if (this._refreshRevision === globalRevision) {
      return false;
    }
    this._refreshRevision = globalRevision;

    if (this._val === UNSET) {
      this._val = this.evaluate();
      this._revision = globalRevision;
      return false;
    }

    const couldHaveChanged = !this._observed || this._dirty;
    if (couldHaveChanged) {
      const val = this.evaluate();
      if (this._val !== val && (!this._options.equalityFn || !this._options.equalityFn(this._val, val))) {
        this._val = val;
        this._revision = globalRevision;
        return true;
      }
    }

    return false;
  }

  protected abstract evaluate(): T;

  subscribe(listener: Listener<T>): Unsubscriber {
    this._listeners.push(listener);
    this.observeInputs();

    let unsubscribed = false;
    return () => {
      if (!unsubscribed) {
        unsubscribed = true;
        this._listeners.splice(this._listeners.indexOf(listener), 1);
        this.unobserveInputs();
      }
    };
  }

  protected addInput(input: Observable<any>) {
    this._inputs.push(input);
    if (this._observed) {
      this.observeInput(input);
    }
  }

  protected removeInput(input: Observable<any>) {
    this._inputs.splice(this._inputs.indexOf(input), 1);
    if (this._observed) {
      this.unobserveInput(input);
    }
  }

  private observeInputs() {
    if (!this._observed) {
      this._observed = true;

      for (const input of this._inputs) {
        this.observeInput(input);
        input.observeInputs();
      }

      // Since the observable was not marked as dirty by its inputs, its value may be outdated.
      // We refresh it so that listeners will be invoked with the correct prevVal the next time it changes.
      this.refresh();

      this.onBecomeObserved();
    }
  }

  private unobserveInputs() {
    if (this._observed && this._listeners.length === 0 && this._outputs.length === 0) {
      this._observed = false;

      for (const input of this._inputs) {
        this.unobserveInput(input);
        input.unobserveInputs();
      }

      this.onBecomeUnobserved();
    }
  }

  private observeInput(input: Observable<any>) {
    input._outputs.push(this);
  }

  private unobserveInput(input: Observable<any>) {
    input._outputs.splice(input._outputs.indexOf(this), 1);
  }

  protected onBecomeObserved() {
    // Can be overriden to run some code when the observable becomes observed.
    // It can be used to perform network calls or read from local storage or a DB
  }

  protected onBecomeUnobserved() {
    // Can be overriden to undo operations performed in onBecomeObserved()
  }

  protected markAsDirty() {
    globalRevision++;
    Observable.batch(() => this.addToBatch());
  }

  private addToBatch() {
    if (!this._dirty) {
      this._dirty = true;

      // Add the observable and its outputs in reverse topological order
      for (const output of this._outputs) {
        output.addToBatch();
      }
      dirtyObservables.push(this);
    }
  }

  static batch(block: () => void) {
    const batchedBlock = () => {
      try {
        batchDepth++;
        block();
      } finally {
        batchDepth--;
        if (batchDepth === 0) {
          const observables = dirtyObservables;
          dirtyObservables = [];

          // Refresh dirty observables and calls listeners when they have changed.
          // We iterate in reverse order as addToBatch() adds them in reverse topological order
          for (let i = observables.length - 1; i >= 0; i--) {
            const observable = observables[i];
            const prevVal = observable._val;
            const hasChanged = observable.refresh();
            const val = observable._val;
            observable._dirty = false;

            if (hasChanged) {
              for (const listener of observable._listeners.slice()) {
                listener(val, prevVal);
              }
            }
          }
        }
      }
    };

    if (batchDepth === 0 && batchedUpdateFn) {
      batchedUpdateFn(batchedBlock);
    } else {
      batchedBlock();
    }
  }
}

export class WritableObservable<T> extends Observable<T> {
  private _defaultVal: T;
  private _next: T | typeof UNSET = UNSET;

  constructor(defaultVal: T, options?: Options<T>) {
    super(options);
    this._defaultVal = defaultVal;
  }

  set(val: T) {
    this._next = val;
    this.markAsDirty();
  }

  update(updater: (val: T) => T) {
    this.set(updater(this.get()));
  }

  reset() {
    this.set(this._defaultVal);
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

export class DerivedObservable<T> extends Observable<T> {
  private _compute: () => T;
  private _prevInputs = new Map<Observable<any>, Revision>();
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
      for (const [_input, revision] of this._prevInputs) {
        // Note: we are lying to Typescript here to be able to access protected fields (refresh()
        // and _revision). See https://github.com/microsoft/TypeScript/issues/10637 for more info
        const input = _input as DerivedObservable<any>;
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

    const inputs = new Map<Observable<any>, Revision>();
    const prevOnGet = Observable.onGet;
    try {
      Observable.onGet = (_input: Observable<any>) => {
        // See previous comment on why casting is needed
        const input = _input as DerivedObservable<any>;
        inputs.set(input, input._revision);
      };
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
      Observable.onGet = prevOnGet;
    }
  }
}
