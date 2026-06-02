import { describe, it, expect } from "vitest";
import { buildSessionOverrunOverridesPayload } from "@/components/opd/overrun/sessionOverrunResolvePayload";
import type { OverrunAction } from "@/lib/api";

describe("buildSessionOverrunOverridesPayload", () => {
  const rows = [{ id: "a1" }, { id: "a2" }];

  it("returns empty when all rows follow bulk reschedule_all", () => {
    const bulk: OverrunAction = "reschedule_all";
    const result = buildSessionOverrunOverridesPayload(
      rows,
      bulk,
      {},
      () => bulk
    );
    expect(result).toEqual([]);
  });

  it("includes a row when its action differs from bulk", () => {
    const bulk: OverrunAction = "reschedule_all";
    const result = buildSessionOverrunOverridesPayload(
      rows,
      bulk,
      { a2: { action: "mark_no_show", rescheduleTo: "" } },
      (id) => (id === "a2" ? "mark_no_show" : bulk)
    );
    expect(result).toEqual([
      { appointmentId: "a2", action: "mark_no_show", rescheduleTo: undefined },
    ]);
  });

  it("includes reschedule_per_patient rows even when they match bulk", () => {
    const bulk: OverrunAction = "reschedule_per_patient";
    const result = buildSessionOverrunOverridesPayload(
      [{ id: "a1" }],
      bulk,
      {},
      () => bulk
    );
    expect(result).toEqual([
      {
        appointmentId: "a1",
        action: "reschedule_per_patient",
        rescheduleTo: undefined,
      },
    ]);
  });
});
