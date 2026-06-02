import { describe, expect, it } from "vitest";
import { findNewPendingRows } from "@/lib/service-reviews/pending-new-rows";
import type { ServiceStaffReviewListItem } from "@/types/service-staff-review";

function row(id: string): ServiceStaffReviewListItem {
  return { id } as ServiceStaffReviewListItem;
}

describe("findNewPendingRows", () => {
  it("returns ids present in incoming but not current", () => {
    const current = [row("a"), row("b")];
    const incoming = [row("a"), row("b"), row("c"), row("d")];
    expect(findNewPendingRows(incoming, current).map((r) => r.id)).toEqual(["c", "d"]);
  });

  it("excludes ids in the deferred-commit set", () => {
    const current = [row("a")];
    const incoming = [row("a"), row("b"), row("c")];
    expect(
      findNewPendingRows(incoming, current, new Set(["c"])).map((r) => r.id)
    ).toEqual(["b"]);
  });

  it("returns empty when incoming matches current", () => {
    const current = [row("a"), row("b")];
    expect(findNewPendingRows(current, current)).toEqual([]);
  });
});
