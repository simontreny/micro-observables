import { setBatchedUpdateFn } from "../batchedUpdate";
import { reactBatchedUpdate } from "./reactBatchedUpdate";

setBatchedUpdateFn(reactBatchedUpdate);

export * from "./useObservable";
export * from "./withObservables";
