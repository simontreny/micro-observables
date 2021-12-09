export type BatchedUpdateFn = (block: () => void) => void;

export let batchedUpdateFn: BatchedUpdateFn | undefined;

export function setBatchedUpdateFn(batchedUpdate: BatchedUpdateFn | undefined) {
  batchedUpdateFn = batchedUpdate;
}
