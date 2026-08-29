/**
 * Unit tests for chip-mirrored slot sections (Vitest).
 */

import { describe, it, expect } from "vitest";
import {
  orderSlotRowsFlat,
  partitionSlotRowsForList,
  sectionDefaultOpen,
  shouldRenderChipSection,
  SLOT_CHIP_SECTION_HINT,
  SLOT_CHIP_SECTION_LABEL,
  SLOT_CHIP_SECTION_ORDER,
  slotPriorityRank,
} from "@/components/opd/opdSlotSectioning";
import type { SlotSessionRow, VisitLifecycle } from "@/types/opd-doctor";

function row(
  id: string,
  slotStatus: SlotSessionRow["slotStatus"],
  scheduledAt: string,
  extras: Partial<SlotSessionRow> = {}
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
    ...extras,
  };
}

function axesRow(
  id: string,
  lifecycle: VisitLifecycle,
  scheduledAt: string,
  band: "early" | "due" | "late" | null
): SlotSessionRow {
  return row(
    id,
    lifecycle === "scheduled"
      ? band === "late"
        ? "running_late"
        : "upcoming"
      : lifecycle === "in_consult"
        ? "in_consultation"
        : lifecycle === "incomplete"
          ? "in_consultation"
          : lifecycle === "completed"
            ? "completed"
            : lifecycle === "no_show"
              ? "missed"
              : "cancelled",
    scheduledAt,
    {
      lifecycle,
      timing:
        band == null
          ? null
          : { minutesToStart: band === "late" ? -10 : 10, band },
      tags: [],
    }
  );
}

describe("chip section mirror", () => {
  it("exposes every status chip label (minus All)", () => {
    expect(
      SLOT_CHIP_SECTION_ORDER.map((k) => SLOT_CHIP_SECTION_LABEL[k])
    ).toEqual([
      "Incomplete",
      "Overdue",
      "Upcoming",
      "Done",
      "No show",
      "Overflow",
      "Cancelled",
    ]);
  });

  it("documents Overflow for doctors", () => {
    expect(SLOT_CHIP_SECTION_HINT.overflow).toMatch(
      /outside the normal slot grid/i
    );
  });

  it("always renders every chip section on All", () => {
    for (const section of SLOT_CHIP_SECTION_ORDER) {
      expect(shouldRenderChipSection("all", section, 0)).toBe(true);
    }
  });

  it("on Overdue chip only renders the Overdue section", () => {
    expect(shouldRenderChipSection("running_late", "late", 12)).toBe(true);
    expect(shouldRenderChipSection("running_late", "incomplete", 1)).toBe(
      false
    );
    expect(shouldRenderChipSection("running_late", "upcoming", 0)).toBe(false);
  });
});

describe("partitionSlotRowsForList", () => {
  it("buckets into chip sections including overflow and cancelled", () => {
    const filtered = [
      axesRow("soon", "scheduled", "2026-05-16T11:00:00.000Z", "due"),
      axesRow("done", "completed", "2026-05-16T07:00:00.000Z", null),
      axesRow("late", "scheduled", "2026-05-16T09:00:00.000Z", "late"),
      axesRow("inc", "incomplete", "2026-05-16T08:00:00.000Z", "late"),
      axesRow("live", "in_consult", "2026-05-16T08:30:00.000Z", "late"),
      axesRow("miss", "no_show", "2026-05-16T06:00:00.000Z", null),
      axesRow("can", "cancelled", "2026-05-16T05:00:00.000Z", null),
      row("ov", "overflow", "2026-05-16T12:00:00.000Z", {
        tags: ["overflow"],
      }),
    ];
    const p = partitionSlotRowsForList(filtered);
    expect(p.incomplete.map((r) => r.appointmentId)).toEqual(["inc", "live"]);
    expect(p.late.map((r) => r.appointmentId)).toEqual(["late"]);
    expect(p.upcoming.map((r) => r.appointmentId)).toEqual(["soon"]);
    expect(p.done.map((r) => r.appointmentId)).toEqual(["done"]);
    expect(p.missed.map((r) => r.appointmentId)).toEqual(["miss"]);
    expect(p.overflow.map((r) => r.appointmentId)).toEqual(["ov"]);
    expect(p.cancelled.map((r) => r.appointmentId)).toEqual(["can"]);
  });
});

describe("orderSlotRowsFlat", () => {
  it("orders Incomplete → Overdue → Upcoming → Done → No show → Overflow → Cancelled", () => {
    const filtered = [
      axesRow("soon", "scheduled", "2026-05-16T11:00:00.000Z", "due"),
      axesRow("late", "scheduled", "2026-05-16T09:00:00.000Z", "late"),
      axesRow("inc", "incomplete", "2026-05-16T08:00:00.000Z", "late"),
      axesRow("can", "cancelled", "2026-05-16T05:00:00.000Z", null),
      row("ov", "overflow", "2026-05-16T12:00:00.000Z", {
        tags: ["overflow"],
      }),
    ];
    expect(orderSlotRowsFlat(filtered).map((r) => r.appointmentId)).toEqual([
      "inc",
      "late",
      "soon",
      "ov",
      "can",
    ]);
  });
});

describe("sectionDefaultOpen", () => {
  it("opens Incomplete / Overdue / Upcoming on All", () => {
    expect(sectionDefaultOpen("all", "incomplete")).toBe(true);
    expect(sectionDefaultOpen("all", "late")).toBe(true);
    expect(sectionDefaultOpen("all", "upcoming")).toBe(true);
    expect(sectionDefaultOpen("all", "done")).toBe(false);
    expect(sectionDefaultOpen("all", "overflow")).toBe(false);
    expect(sectionDefaultOpen("all", "cancelled")).toBe(false);
  });
});

describe("slotPriorityRank", () => {
  it("ranks late between incomplete and upcoming", () => {
    expect(
      slotPriorityRank(
        axesRow("inc", "incomplete", "2026-05-16T08:00:00.000Z", "late")
      )
    ).toBe(0);
    expect(
      slotPriorityRank(
        axesRow("late", "scheduled", "2026-05-16T09:00:00.000Z", "late")
      )
    ).toBe(1);
    expect(
      slotPriorityRank(
        axesRow("soon", "scheduled", "2026-05-16T11:00:00.000Z", "due")
      )
    ).toBe(2);
  });
});
