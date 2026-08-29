import { describe, expect, it } from "vitest";
import { isOpdSessionPayloadForDate } from "@/components/opd/shared/opdSessionApply";
import type { OpdSessionPayload } from "@/types/opd-session";

function slotPayload(date: string): OpdSessionPayload {
  return {
    mode: "slot",
    date,
    snapshotAt: "2026-08-09T00:00:00.000Z",
    modeSource: "default",
    modeChangeCount: 0,
    entries: [],
    counts: {
      all: 0,
      upcoming: 0,
      running_late: 0,
      in_consultation: 0,
      completed: 0,
      missed: 0,
      cancelled: 0,
      overflow: 0,
    },
  };
}

describe("isOpdSessionPayloadForDate", () => {
  it("accepts a payload whose date matches the selected session day", () => {
    expect(isOpdSessionPayloadForDate(slotPayload("2026-08-09"), "2026-08-09")).toBe(
      true,
    );
  });

  it("rejects keepPreviousData placeholders from another day", () => {
    expect(isOpdSessionPayloadForDate(slotPayload("2026-08-08"), "2026-08-09")).toBe(
      false,
    );
  });

  it("rejects null/undefined while the first fetch is in flight", () => {
    expect(isOpdSessionPayloadForDate(null, "2026-08-09")).toBe(false);
    expect(isOpdSessionPayloadForDate(undefined, "2026-08-09")).toBe(false);
  });
});
