import { describe, expect, it } from "vitest";
import type { PrescriptionWithRelations } from "@/types/prescription";
import {
  applySubjectiveCarrySeed,
  emptyContinuationFields,
  isClosedNote,
  resolveRxLoadDecision,
  type RxLoadClock,
} from "@/components/cockpit/rx/rxLoadDecision";
import { resolveRxLock } from "@/components/cockpit/rx/useRxLock";

const TODAY: RxLoadClock = {
  now: new Date("2026-09-09T06:30:00.000Z"),
  timezone: "Asia/Kolkata",
};

const NEXT_CLINIC_DAY: RxLoadClock = {
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
    hopi: null,
    provisional_diagnosis: "Viral fever",
    investigations_orders: "CBC",
    follow_up: "3 days",
    patient_education: null,
    clinical_notes: "private",
    sent_to_patient_at: null,
    created_at: "2026-09-09T04:00:00.000Z",
    updated_at: "2026-09-09T04:45:00.000Z",
    vitals_hr: 88,
    examination_findings: "chest clear",
    advice: "rest",
    ...overrides,
  } as PrescriptionWithRelations;
}

describe("resolveRxLoadDecision (rxl-24)", () => {
  it("starts empty when there is no note", () => {
    expect(resolveRxLoadDecision(null, "confirmed", TODAY)).toEqual({
      kind: "none",
    });
  });

  it("adopts a draft newest note", () => {
    const draft = rx({ attested_at: null });
    expect(resolveRxLoadDecision(draft, "confirmed", TODAY)).toEqual({
      kind: "adopt",
      rx: draft,
    });
  });

  it("adopts today's issued note as the live slip", () => {
    const issued = rx({ attested_at: "2026-09-09T04:45:00.000Z" });
    expect(resolveRxLoadDecision(issued, "completed", TODAY)).toEqual({
      kind: "adopt",
      rx: issued,
    });
  });

  it("reviews a previous clinic day's note read-only", () => {
    const closed = rx({ attested_at: "2026-09-09T04:45:00.000Z" });
    expect(resolveRxLoadDecision(closed, "completed", NEXT_CLINIC_DAY)).toEqual({
      kind: "review",
      rx: closed,
    });
  });

  it("reviews a superseded note even when issued today", () => {
    const old = rx({
      attested_at: "2026-09-09T04:45:00.000Z",
      superseded_by_id: "rx-2",
    });
    expect(resolveRxLoadDecision(old, "completed", TODAY)).toEqual({
      kind: "review",
      rx: old,
    });
  });

  it("reviews a historical completed visit with a null stamp", () => {
    const historical = rx({ attested_at: null });
    expect(
      resolveRxLoadDecision(historical, "completed", TODAY),
    ).toEqual({
      kind: "review",
      rx: historical,
    });
  });

  it("reviews a cancelled visit even when the stamp is today", () => {
    const issued = rx({ attested_at: "2026-09-09T04:45:00.000Z" });
    expect(resolveRxLoadDecision(issued, "cancelled", TODAY)).toEqual({
      kind: "review",
      rx: issued,
    });
  });

  it("prefers issued_at over attested_at for the clinic-day clock", () => {
    const stamped = rx({
      attested_at: "2026-09-09T04:45:00.000Z",
      issued_at: "2026-09-08T10:00:00.000Z",
    });
    expect(resolveRxLoadDecision(stamped, "completed", TODAY)).toEqual({
      kind: "review",
      rx: stamped,
    });
  });

  it("falls back to continue without a clock (rxl-07 fail-closed)", () => {
    const closed = rx({ attested_at: "2026-09-09T04:45:00.000Z" });
    expect(resolveRxLoadDecision(closed, "completed")).toEqual({
      kind: "continue",
      source: closed,
    });
  });
});

describe("isClosedNote", () => {
  it("treats a stamp as closed when no clock is passed (fail closed)", () => {
    expect(
      isClosedNote(rx({ attested_at: "2026-08-31T12:00:00.000Z" }), "confirmed"),
    ).toBe(true);
  });

  it("keeps today's issued note open when the clinic clock is passed", () => {
    expect(
      isClosedNote(
        rx({ attested_at: "2026-09-09T04:45:00.000Z" }),
        "completed",
        TODAY,
      ),
    ).toBe(false);
  });
});

describe("applySubjectiveCarrySeed", () => {
  it("carries complaints, history and diagnosis and leaves vitals, exam and plan empty", () => {
    const source = rx({
      complaints: [{ id: "c1", name: "Fever" }],
      family_history: "Father HTN",
      diagnoses_json: [
        {
          id: "d1",
          label: "Viral fever",
          kind: "primary",
          certainty: "provisional",
          status: "new",
        },
      ],
    });
    const seeded = applySubjectiveCarrySeed(emptyContinuationFields(), source);
    expect(seeded.complaints[0]?.name).toBe("Fever");
    expect(seeded.familyHistory).toContain("HTN");
    expect(seeded.provisionalDiagnosis).toBe("Viral fever");
    expect(seeded.vitalsHr).toBeNull();
    expect(seeded.examinationFindings).toBe("");
    expect(seeded.advice).toBe("");
    expect(seeded.investigationsOrders).toBe("");
    expect(seeded.clinicalNotes).toBe("");
  });
});

describe("resolveRxLock · continuation (rxl-07)", () => {
  it("unlocks an ended visit when the current note is open", () => {
    expect(
      resolveRxLock({ cockpitState: "ended", noteClosed: false }),
    ).toEqual({ contentLocked: false, prefsLocked: false });
  });

  it("keeps an ended visit locked while the note state is still unknown", () => {
    expect(resolveRxLock({ cockpitState: "ended" })).toEqual({
      contentLocked: true,
      prefsLocked: false,
    });
  });
});
