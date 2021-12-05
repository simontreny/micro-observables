import { useLayoutEffect, useState } from "react";
import { Observable } from "../observable";

export function useObservable<T>(observable: Observable<T>): T {
  const [, forceRender] = useState({});
  const val = observable.get();

  useLayoutEffect(() => {
    return observable.onChange(() => forceRender({}));
  }, [observable]);

  return val;
}
