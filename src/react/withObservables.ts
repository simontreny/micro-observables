import hoistNonReactStatics from "hoist-non-react-statics";
import React from "react";
import { Observable, Unsubscriber } from "../observable";

export type ObservableValue<T> = T extends Observable<infer U> ? U : never;
export type ObservableValues<T> = { [K in keyof T]: ObservableValue<T[K]> };

type Mapping = { [key: string]: Observable<any> };
type InjectedProps<M extends Mapping> = ObservableValues<M>;
type HocProps<P extends InjectedProps<M>, M extends Mapping> = Pick<P, Exclude<keyof P, keyof M>>;

export const withObservables = <P extends InjectedProps<M>, M extends Mapping>(
  Component: React.ComponentType<P>,
  mapping: M | ((ownProps: HocProps<P, M>) => M)
): React.ComponentType<HocProps<P, M>> => {
  class WithObservables extends React.PureComponent<HocProps<P, M>> {
    private _ownProps!: HocProps<P, M>;
    private _mapping!: M;
    private _unsubscribers: Unsubscriber[] = [];

    componentWillUnmount() {
      this._unsubscribers.forEach((unsubscribe) => unsubscribe());
      this._unsubscribers = [];
    }

    render(): JSX.Element {
      this.updateMapping();

      const injectedProps: { [key: string]: any } = {};
      for (const key of Object.keys(this._mapping)) {
        injectedProps[key] = this._mapping[key].get();
      }

      return React.createElement(Component, { ...this.props, ...injectedProps } as P);
    }

    private updateMapping() {
      if (!this._ownProps || !shallowEqual(this._ownProps, this.props)) {
        this._ownProps = this.props;
        this._mapping = typeof mapping === "function" ? mapping(this.props) : mapping;

        const unsubscribers = Object.values(this._mapping).map((observable) =>
          observable.onChange(() => this.forceUpdate())
        );
        this._unsubscribers.forEach((unsubscribe) => unsubscribe());
        this._unsubscribers = unsubscribers;
      }
    }
  }
  return hoistNonReactStatics(WithObservables, Component);
};

// Imported from React's source code
function shallowEqual(objA: any, objB: any): boolean {
  if (is(objA, objB)) {
    return true;
  }

  if (typeof objA !== "object" || objA === null || typeof objB !== "object" || objB === null) {
    return false;
  }

  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);

  if (keysA.length !== keysB.length) {
    return false;
  }

  for (let i = 0; i < keysA.length; i++) {
    if (!objB.hasOwnProperty(keysA[i]) || !is(objA[keysA[i]], objB[keysA[i]])) {
      return false;
    }
  }

  return true;
}

function is(x: any, y: any): boolean {
  return (x === y && (x !== 0 || 1 / x === 1 / y)) || (x !== x && y !== y);
}
