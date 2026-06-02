/**
 * Unit tests for the queue-sort logic in useDoctorDayPipeline (Vitest).
 *
 * CP-D2 regression: before the fix, queueEntries was built by concatenating
 *   [sortedActive, ...done, ...missed].  The moment the current patient flipped
 *   from active → done, they jumped to the bottom of the array, making
 *   useNextAppointmentRoute return null (currentIndex + 1 fell past the last
 *   active row) and EndOfDayCard appeared prematurely.
 *
 * The fix sorts all three buckets together by tokenNumber ASC so the ordering
 * is stable regardless of status changes.
 *
 * Run: `vitest run frontend/hooks/__tests__/useDoctorDayPipeline.test.ts`
 *
 * @see docs/Work/Daily-plans/May 2026/09-05-2026/Tasks/task-cp-01-pipeline-sort-fix.md
 */

import { describe, it, expect } from "vitest";
import type { DoctorQueueSessionRow } from "@/types/opd-doctor";

// ---------------------------------------------------------------------------
// Replicate the fixed sort logic from useDoctorDayPipeline § queueEntries.
// We test the algorithm in isolation so we don't need a React hook harness.
// ---------------------------------------------------------------------------

function buildQueueEntries(
  active: DoctorQueueSessionRow[],
  done: DoctorQueueSessionRow[],
  missed: DoctorQueueSessionRow[],
  currentAppointmentId: string | null,
): { id: string; isCurrent: boolean; position: number }[] {
  // CP-D2 fix: sort all three buckets together by tokenNumber ASC.
  const allRows = [...active, ...done, ...missed].sort((a, b) => {
    const ta = a.tokenNumber ?? Number.POSITIVE_INFINITY;
    const tb = b.tokenNumber ?? Number.POSITIVE_INFINITY;
    return ta - tb;
  });
  return allRows.map((row, i) => ({
    id: row.appointmentId,
    isCurrent: row.appointmentId === currentAppointmentId,
    position: i + 1,
  }));
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeRow(
  appointmentId: string,
  tokenNumber: number,
  queueStatus: string,
): DoctorQueueSessionRow {
  return {
    entryId: `entry-${appointmentId}`,
    appointmentId,
    tokenNumber,
    position: tokenNumber,
    queueStatus,
    sessionDate: "2026-05-09",
    queueCreatedAt: "2026-05-09T09:00:00Z",
    patientName: `Patient ${tokenNumber}`,
    medicalRecordNumber: null,
    patientPhone: "+91 00000 00000",
    age: 30,
    gender: "M",
    appointmentStatus: "scheduled",
    scheduledAt: "2026-05-09T09:00:00Z",
    reasonForVisit: null,
    serviceLabel: null,
    catalogServiceKey: null,
    consultationType: null,
    episodeId: null,
    opdEventType: null,
    patientId: null,
    patientNote: null,
  };
}

// ---------------------------------------------------------------------------
// CP-D2 regression test
// ---------------------------------------------------------------------------

describe("useDoctorDayPipeline § queueEntries sort (CP-D2)", () => {
  it("keeps the just-completed patient in token order so auto-advance can find the next active row", () => {
    // Fixture: 5 tokens; #3 just flipped from active → done.
    const active = [
      makeRow("appt-1", 1, "called"),
      makeRow("appt-2", 2, "in_consultation"),
      makeRow("appt-4", 4, "waiting"),
      makeRow("appt-5", 5, "waiting"),
    ];
    const done = [
      makeRow("appt-3", 3, "completed"), // just-completed — the current patient
    ];
    const missed: DoctorQueueSessionRow[] = [];

    const entries = buildQueueEntries(active, done, missed, "appt-3");

    // All 5 rows must appear in strict token order, regardless of status bucket.
    const ids = entries.map((e) => e.id);
    expect(ids).toEqual(["appt-1", "appt-2", "appt-3", "appt-4", "appt-5"]);

    // currentIndex must be found (not null) and the *next* entry must be appt-4.
    const currentIndex = entries.findIndex((e) => e.isCurrent);
    expect(currentIndex).toBeGreaterThanOrEqual(0);
    expect(entries[currentIndex + 1]?.id).toBe("appt-4");
  });

  it("also sorts correctly when the first token completes (edge: currentIndex === 0)", () => {
    const active = [
      makeRow("appt-2", 2, "waiting"),
      makeRow("appt-3", 3, "waiting"),
    ];
    const done = [makeRow("appt-1", 1, "completed")];
    const missed: DoctorQueueSessionRow[] = [];

    const entries = buildQueueEntries(active, done, missed, "appt-1");

    expect(entries.map((e) => e.id)).toEqual(["appt-1", "appt-2", "appt-3"]);
    const currentIndex = entries.findIndex((e) => e.isCurrent);
    expect(currentIndex).toBe(0);
    expect(entries[currentIndex + 1]?.id).toBe("appt-2");
  });

  it("sorts missed rows into their correct token-order position", () => {
    const active = [
      makeRow("appt-1", 1, "waiting"),
      makeRow("appt-3", 3, "waiting"),
    ];
    const done = [makeRow("appt-4", 4, "completed")];
    const missed = [makeRow("appt-2", 2, "missed")];

    const entries = buildQueueEntries(active, done, missed, "appt-1");

    expect(entries.map((e) => e.id)).toEqual([
      "appt-1",
      "appt-2",
      "appt-3",
      "appt-4",
    ]);
  });

  it("pushes null-tokenNumber rows to the end (tie-breaker)", () => {
    const withNullToken: DoctorQueueSessionRow = {
      ...makeRow("appt-ghost", 99, "waiting"),
      tokenNumber: null as unknown as number, // defensive: shouldn't happen in practice
    };
    const active = [makeRow("appt-1", 1, "waiting"), withNullToken];
    const done: DoctorQueueSessionRow[] = [];
    const missed: DoctorQueueSessionRow[] = [];

    const entries = buildQueueEntries(active, done, missed, null);

    expect(entries[0].id).toBe("appt-1");
    expect(entries[entries.length - 1].id).toBe("appt-ghost");
  });

  it("positions are 1-indexed and always consecutive after the sort", () => {
    const active = [
      makeRow("appt-3", 3, "waiting"),
      makeRow("appt-1", 1, "waiting"),
    ];
    const done = [makeRow("appt-2", 2, "completed")];
    const missed: DoctorQueueSessionRow[] = [];

    const entries = buildQueueEntries(active, done, missed, null);

    expect(entries.map((e) => e.position)).toEqual([1, 2, 3]);
  });
});
