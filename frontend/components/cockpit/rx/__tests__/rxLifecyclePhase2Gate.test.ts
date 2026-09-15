/**
 * rxl-10 — Phase 2 gate (frontend half).
 * Later-day attested notes stay read-only and mint nothing.
 * Carry copies subjective only.
 */
import { describe, expect, it } from "vitest";
import type { PrescriptionWithRelations } from "@/types/prescription";
import {
  applySubjectiveCarrySeed,
  emptyContinuationFields,
  resolveRxLoadDecision,
} from "@/components/cockpit/rx/rxLoadDecision";
import { resolveRxLock } from "@/components/cockpit/rx/useRxLock";

const LATER_DAY = {
  now: new Date("2026-09-10T00:30:00.000Z"),
  timezone: "Asia/Kolkata",
};

function rx(
  overrides: Partial<PrescriptionWithRelations> = {},
): PrescriptionWithRelations {
  return {
    id: "rx-1",
    appointment_id: "appt-1",
    patient_id: "pat-1",
    doctor_id: "doc-1",
    type: "structured",
    cc: "Fever",
    hopi: "two days",
    provisional_diagnosis: "Viral",
    attested_at: "2026-09-09T04:45:00.000Z",
    created_at: "2026-09-09T04:00:00.000Z",
    updated_at: "2026-09-09T04:45:00.000Z",
    complaints: [{ id: "c1", name: "Fever" }],
    family_history: "Father HTN",
    vitals_hr: 88,
    examination_findings: "chest clear",
    advice: "rest",
    ...overrides,
  } as PrescriptionWithRelations;
}

describe("rxl-10 Phase 2 gate", () => {
  it("reviews a previous clinic day's note read-only without a new appointment", () => {
    const closed = rx();
    expect(resolveRxLoadDecision(closed, "completed", LATER_DAY)).toEqual({
      kind: "review",
      rx: closed,
    });
    expect(
      resolveRxLock({ cockpitState: "ended", noteClosed: true }),
    ).toEqual({ contentLocked: true, prefsLocked: false });
  });

  it("carries subjective and leaves vitals and exam empty", () => {
    const seeded = applySubjectiveCarrySeed(emptyContinuationFields(), rx());
    expect(seeded.complaints[0]?.name).toBe("Fever");
    expect(seeded.familyHistory).toContain("HTN");
    expect(seeded.provisionalDiagnosis).toBe("Viral");
    expect(seeded.vitalsHr).toBeNull();
    expect(seeded.examinationFindings).toBe("");
    expect(seeded.advice).toBe("");
  });
});
