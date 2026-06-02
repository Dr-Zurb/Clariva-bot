/**
 * Unit tests for opdSlotSectioning (Vitest).
 */

import { describe, it, expect } from "vitest";
import {
  bucketSlotRowsForSections,
  computeNowDividerPlacement,
  showActiveSlotSection,
} from "@/components/opd/opdSlotSectioning";
import type { SlotSessionRow } from "@/types/opd-doctor";

function row(
  id: string,
  slotStatus: SlotSessionRow["slotStatus"],
  scheduledAt: string
): SlotSessionRow {
  return {
    appointmentId: id,
    position: 1,
    slotStatus,
    appointmentStatus: "confirmed",
    scheduledAt,
    durationMinutes: 15,
    patientName: "Test",
    medicalRecordNumber: null,
    patientPhone: "+10000000000",
    age: 40,
    gender: null,
    reasonForVisit: null,
    serviceLabel: null,
    catalogServiceKey: null,
    consultationType: null,
    delayMinutes: null,
    earlyInviteExpiresAt: null,
    earlyInviteResponse: null,
    episodeId: null,
    opdEventType: null,
    patientId: "p1",
    patientNote: null,
  };
}

describe("bucketSlotRowsForSections", () => {
  it("places active statuses into active, sorted by scheduledAt", () => {
    const filtered = [
      row("b", "upcoming", "2026-05-16T11:00:00.000Z"),
      row("a", "grace", "2026-05-16T09:00:00.000Z"),
    ];
    const b = bucketSlotRowsForSections(filtered);
    expect(b.active.map((r) => r.appointmentId)).toEqual(["a", "b"]);
    expect(b.done).toHaveLength(0);
    expect(b.missed).toHaveLength(0);
    expect(b.overflow).toHaveLength(0);
    expect(b.cancelledOnly).toHaveLength(0);
  });

  it("splits completed, missed, overflow, and cancelled", () => {
    const filtered = [
      row("c1", "cancelled", "2026-05-16T08:00:00.000Z"),
      row("d1", "completed", "2026-05-16T10:00:00.000Z"),
      row("m1", "missed", "2026-05-16T09:30:00.000Z"),
      row("o1", "overflow", "2026-05-16T12:00:00.000Z"),
    ];
    const b = bucketSlotRowsForSections(filtered);
    expect(b.cancelledOnly.map((r) => r.appointmentId)).toEqual(["c1"]);
    expect(b.done.map((r) => r.appointmentId)).toEqual(["d1"]);
    expect(b.missed.map((r) => r.appointmentId)).toEqual(["m1"]);
    expect(b.overflow.map((r) => r.appointmentId)).toEqual(["o1"]);
    expect(b.active).toHaveLength(0);
  });
});

describe("computeNowDividerPlacement", () => {
  const t0 = "2026-05-16T08:00:00.000Z";
  const t1 = "2026-05-16T10:00:00.000Z";
  const t2 = "2026-05-16T12:00:00.000Z";

  it("returns all_past when every row starts before now", () => {
    const now = new Date("2026-05-16T15:00:00.000Z").getTime();
    expect(
      computeNowDividerPlacement(
        [row("a", "upcoming", t0), row("b", "upcoming", t1)],
        now
      )
    ).toEqual({ kind: "all_past" });
  });

  it("returns all_future when first row is at or after now", () => {
    const now = new Date("2026-05-16T09:30:00.000Z").getTime();
    expect(
      computeNowDividerPlacement(
        [row("a", "upcoming", t1), row("b", "upcoming", t2)],
        now
      )
    ).toEqual({ kind: "all_future" });
  });

  it("returns split when some rows are before now and some after", () => {
    const now = new Date("2026-05-16T10:30:00.000Z").getTime();
    expect(
      computeNowDividerPlacement(
        [row("a", "upcoming", t0), row("b", "upcoming", t1), row("c", "upcoming", t2)],
        now
      )
    ).toEqual({ kind: "split", beforeCount: 2 });
  });

  it("returns all_future for empty active (callers skip rendering)", () => {
    expect(computeNowDividerPlacement([], Date.now())).toEqual({
      kind: "all_future",
    });
  });
});

describe("showActiveSlotSection", () => {
  it("is true for all and active chip filters", () => {
    expect(showActiveSlotSection("all")).toBe(true);
    expect(showActiveSlotSection("upcoming")).toBe(true);
    expect(showActiveSlotSection("grace")).toBe(true);
    expect(showActiveSlotSection("running_late")).toBe(true);
    expect(showActiveSlotSection("in_consultation")).toBe(true);
  });

  it("is false for completed / missed / cancelled", () => {
    expect(showActiveSlotSection("completed")).toBe(false);
    expect(showActiveSlotSection("missed")).toBe(false);
    expect(showActiveSlotSection("cancelled")).toBe(false);
  });
});
