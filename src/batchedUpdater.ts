export type BatchedUpdateFn = (block: () => void) => void;

export let batchedUpdateFn: BatchedUpdateFn | undefined;
