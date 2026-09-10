import { describe, it, expect } from "vitest";
import { matchesSlotStatusFilter } from "@/components/opd/shared/slotAxes";
import type { SlotSessionRow } from "@/types/opd-doctor";

function row(extras: Partial<SlotSessionRow>): SlotSessionRow {
  return {
    appointmentId: "a1",
    position: 1,
    slotStatus: "upcoming",
    appointmentStatus: "confirmed",
    scheduledAt: "2026-05-16T09:00:00.000Z",
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

describe("matchesSlotStatusFilter · Overdue chip", () => {
  it("includes scheduled + late", () => {
    expect(
      matchesSlotStatusFilter(
        row({
          lifecycle: "scheduled",
          slotStatus: "running_late",
          timing: { minutesToStart: -20, band: "late" },
        }),
        "running_late"
      )
    ).toBe(true);
  });

  it("excludes incomplete even when timing band is late", () => {
    expect(
      matchesSlotStatusFilter(
        row({
          lifecycle: "incomplete",
          slotStatus: "in_consultation",
          timing: { minutesToStart: -120, band: "late" },
        }),
        "running_late"
      )
    ).toBe(false);
  });

  it("excludes in_consult even when timing band is late", () => {
    expect(
      matchesSlotStatusFilter(
        row({
          lifecycle: "in_consult",
          slotStatus: "in_consultation",
          timing: { minutesToStart: -10, band: "late" },
        }),
        "running_late"
      )
    ).toBe(false);
  });
});
