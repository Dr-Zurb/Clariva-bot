import type { DeferredCommit } from "@/lib/service-reviews/deferred-commit";

export interface BulkConfirmBatchHandle {
  count: number;
  cancelAll: () => void;
}

/** Schedule confirm once per id via the injected dispatcher; returns a batch undo handle. */
export function runBulkConfirm(
  ids: string[],
  dispatchConfirm: (id: string) => DeferredCommit
): BulkConfirmBatchHandle {
  const handles = ids.map(dispatchConfirm);
  return {
    count: ids.length,
    cancelAll: () => {
      for (const handle of handles) {
        handle.cancel();
      }
    },
  };
}
