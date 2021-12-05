import { useLayoutEffect, useState } from "react";
import { BaseObservable } from "../observable";

export function useObservable<T>(observable: BaseObservable<T>): T {
  const [, forceRender] = useState({});
  const val = observable.get();

  useLayoutEffect(() => {
    return observable.subscribe(() => forceRender({}));
  }, [observable]);

  return val;
}
