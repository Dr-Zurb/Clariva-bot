/**
 * Unit tests for matchesOpdQueueSearch (Vitest).
 *
 * Run: `npx vitest run __tests__/components/opd/opdQueueMatcher.test.ts`
 *
 * @see docs/Work/Daily-plans/May 2026/08-05-2026/Tasks/task-oq-08-search-box.md
 */

import { describe, it, expect } from "vitest";
import { matchesOpdQueueSearch } from "@/components/opd/shared/opdSearchMatcher";
import type { DoctorQueueSessionRow } from "@/types/opd-doctor";

// ---------------------------------------------------------------------------
// Test fixture
// ---------------------------------------------------------------------------

function makeEntry(
  overrides: Partial<DoctorQueueSessionRow> = {}
): DoctorQueueSessionRow {
  return {
    entryId: "entry-1",
    appointmentId: "appt-1",
    tokenNumber: 3,
    position: 1,
    queueStatus: "waiting",
    sessionDate: "2026-05-08",
    queueCreatedAt: "2026-05-08T10:00:00Z",
    patientName: "Ravi Kumar",
    medicalRecordNumber: "PT-2024-0142",
    patientPhone: "+91 98765 43210",
    age: 35,
    gender: "Male",
    appointmentStatus: "scheduled",
    scheduledAt: "2026-05-08T10:00:00Z",
    reasonForVisit: "Fever",
    serviceLabel: "General",
    catalogServiceKey: null,
    consultationType: null,
    episodeId: null,
    opdEventType: null,
    ...overrides,
  };
}

const entry = makeEntry();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("matchesOpdQueueSearch", () => {
  // ── Empty query ─────────────────────────────────────────────────────────

  it("returns true for empty string query", () => {
    expect(matchesOpdQueueSearch(entry, "")).toBe(true);
  });

  it("returns true for whitespace-only query", () => {
    expect(matchesOpdQueueSearch(entry, "   ")).toBe(true);
  });

  // ── Rule 1 — token ───────────────────────────────────────────────────────

  it("matches #3 against tokenNumber === 3", () => {
    expect(matchesOpdQueueSearch(entry, "#3")).toBe(true);
  });

  it("does NOT match #3 against tokenNumber === 13", () => {
    const e = makeEntry({ tokenNumber: 13 });
    expect(matchesOpdQueueSearch(e, "#3")).toBe(false);
  });

  it("does NOT match #30 against tokenNumber === 3", () => {
    expect(matchesOpdQueueSearch(entry, "#30")).toBe(false);
  });

  it("falls through to name rule when # suffix is not pure digits", () => {
    // '#abc' is not a valid token query → falls to name rule, no name match
    expect(matchesOpdQueueSearch(entry, "#abc")).toBe(false);
  });

  // ── Rule 2 — phone normalization ─────────────────────────────────────────

  it("matches normalized 10-digit phone against formatted +91 number", () => {
    expect(matchesOpdQueueSearch(entry, "9876543210")).toBe(true);
  });

  it("matches partial phone suffix (≥3 digits, no letters)", () => {
    expect(matchesOpdQueueSearch(entry, "43210")).toBe(true);
  });

  it("does NOT trigger phone rule with fewer than 3 digits", () => {
    // '98' has 2 digits → name rule runs → no match
    expect(matchesOpdQueueSearch(entry, "98")).toBe(false);
  });

  it("does NOT trigger phone rule when query contains letters", () => {
    // 'R98765' has letters → falls to name rule
    const noPhoneLettersEntry = makeEntry({ patientName: "R98765" });
    expect(matchesOpdQueueSearch(noPhoneLettersEntry, "R98765")).toBe(true);
  });

  // ── Rule 3 — name / MRN ──────────────────────────────────────────────────

  it("matches 'Ravi' against name 'Ravi Kumar' (case-sensitive prefix)", () => {
    expect(matchesOpdQueueSearch(entry, "Ravi")).toBe(true);
  });

  it("matches reason for visit substring", () => {
    expect(matchesOpdQueueSearch(entry, "Fever")).toBe(true);
  });

  it("matches service label substring", () => {
    expect(matchesOpdQueueSearch(entry, "General")).toBe(true);
  });

  it("matches 'KUMAR' case-insensitively", () => {
    expect(matchesOpdQueueSearch(entry, "KUMAR")).toBe(true);
  });

  it("matches 'PT-2024' against MRN 'PT-2024-0142'", () => {
    expect(matchesOpdQueueSearch(entry, "PT-2024")).toBe(true);
  });

  it("matches full MRN string", () => {
    expect(matchesOpdQueueSearch(entry, "PT-2024-0142")).toBe(true);
  });

  it("still matches name when MRN is null", () => {
    const e = makeEntry({ medicalRecordNumber: null });
    expect(matchesOpdQueueSearch(e, "Ravi")).toBe(true);
  });

  // ── Negative cases ────────────────────────────────────────────────────────

  it("returns false for an unrelated string", () => {
    expect(matchesOpdQueueSearch(entry, "xyz")).toBe(false);
  });

  it("returns false for a token that does not exist", () => {
    expect(matchesOpdQueueSearch(entry, "#99")).toBe(false);
  });

  it("returns false for a phone that does not match", () => {
    expect(matchesOpdQueueSearch(entry, "1111111111")).toBe(false);
  });
});
