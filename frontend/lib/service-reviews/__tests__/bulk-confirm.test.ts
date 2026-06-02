/**
 * bulk-confirm — brr-12 batch dispatcher helper.
 *
 * Run: `vitest run frontend/lib/service-reviews/__tests__/bulk-confirm.test.ts`
 */

import { describe, expect, it, vi } from "vitest";
import { runBulkConfirm } from "@/lib/service-reviews/bulk-confirm";
import type { DeferredCommit } from "@/lib/service-reviews/deferred-commit";

describe("runBulkConfirm", () => {
  it("dispatches once per id and cancelAll cancels every handle", () => {
    const handles: DeferredCommit[] = [];
    const trackingDispatch = vi.fn((id: string) => {
      const handle: DeferredCommit = { fire: vi.fn(), cancel: vi.fn() };
      handles.push(handle);
      return handle;
    });

    const batch = runBulkConfirm(["a", "b", "c"], trackingDispatch);

    expect(trackingDispatch).toHaveBeenCalledTimes(3);
    expect(trackingDispatch.mock.calls.map(([id]) => id)).toEqual(["a", "b", "c"]);
    expect(batch.count).toBe(3);

    batch.cancelAll();
    for (const handle of handles) {
      expect(handle.cancel).toHaveBeenCalledTimes(1);
    }
  });
});
