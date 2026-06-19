import { describe, expect, it } from "vitest";
import {
  reorderInsertAfterIndex,
  reorderInsertBeforeIndex,
  resolveMainComplaintDropIntent,
} from "@/lib/cockpit/complaint-drag";

describe("complaint-drag", () => {
  it("resolves edge zones as reorder and center as nest", () => {
    const rect = { top: 100, height: 100 };
    expect(resolveMainComplaintDropIntent(110, rect)).toBe("before");
    expect(resolveMainComplaintDropIntent(150, rect)).toBe("nest");
    expect(resolveMainComplaintDropIntent(185, rect)).toBe("after");
  });

  it("uses reorder-only zones for very short targets", () => {
    const rect = { top: 0, height: 0 };
    expect(resolveMainComplaintDropIntent(0, rect)).toBe("before");
    expect(resolveMainComplaintDropIntent(1, rect)).toBe("after");
  });

  it("defaults to before when clientY is missing", () => {
    expect(resolveMainComplaintDropIntent(Number.NaN, { top: 0, height: 80 })).toBe(
      "before",
    );
  });

  it("computes reorder insert indices", () => {
    expect(reorderInsertBeforeIndex(3, 1)).toBe(1);
    expect(reorderInsertBeforeIndex(0, 2)).toBe(1);
    expect(reorderInsertAfterIndex(3, 1)).toBe(2);
    expect(reorderInsertAfterIndex(0, 1)).toBe(1);
  });
});
