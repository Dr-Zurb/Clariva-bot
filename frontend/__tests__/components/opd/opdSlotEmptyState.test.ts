/**
 * Unit tests for deriveSlotEmptyState (Vitest).
 */

import { describe, it, expect } from "vitest";
import { deriveSlotEmptyState } from "@/components/opd/opdSlotEmptyState";
import type { SlotSessionRow } from "@/types/opd-doctor";

function row(overrides: Partial<SlotSessionRow> = {}): SlotSessionRow {
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
    ...overrides,
  };
}

describe("deriveSlotEmptyState", () => {
  it("returns no-data when there are no entries", () => {
    expect(
      deriveSlotEmptyState({
        entries: [],
        filteredCount: 0,
        statusFilter: "all",
        searchQuery: "",
      })
    ).toEqual({ kind: "no-data" });
  });

  it("returns all-completed when every row is completed", () => {
    expect(
      deriveSlotEmptyState({
        entries: [
          row({ appointmentId: "1", slotStatus: "completed" }),
          row({ appointmentId: "2", slotStatus: "completed" }),
        ],
        filteredCount: 2,
        statusFilter: "all",
        searchQuery: "",
      })
    ).toEqual({ kind: "all-completed" });
  });

  it("returns filtered-empty for search when filter drops all rows", () => {
    expect(
      deriveSlotEmptyState({
        entries: [row({ patientName: "Alice" })],
        filteredCount: 0,
        statusFilter: "all",
        searchQuery: "zzzzz",
      })
    ).toEqual({ kind: "filtered-empty", filter: "search" });
  });

  it("returns filtered-empty for status chip when no rows match", () => {
    expect(
      deriveSlotEmptyState({
        entries: [row({ slotStatus: "upcoming" })],
        filteredCount: 0,
        statusFilter: "running_late",
        searchQuery: "",
      })
    ).toEqual({ kind: "filtered-empty", filter: "running_late" });
  });

  it("returns none when rows are visible", () => {
    expect(
      deriveSlotEmptyState({
        entries: [row({ slotStatus: "upcoming" })],
        filteredCount: 1,
        statusFilter: "all",
        searchQuery: "",
      })
    ).toEqual({ kind: "none" });
  });
});
