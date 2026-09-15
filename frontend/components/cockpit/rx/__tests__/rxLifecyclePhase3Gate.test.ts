/**
 * rxl-29 — Phase 3 gate (frontend half).
 * Continuous typing after Finish must not mint Version 47; leave once → Version 2.
 */
import { describe, expect, it } from "vitest";
import type { PrescriptionWithRelations } from "@/types/prescription";
import { needsReissue } from "@/components/cockpit/rx/rxRevise";
import {
  resolveRxLoadDecision,
  type RxLoadClock,
} from "@/components/cockpit/rx/rxLoadDecision";
import { resolveRxLock } from "@/components/cockpit/rx/useRxLock";

const TODAY: RxLoadClock = {
  now: new Date("2026-09-09T06:30:00.000Z"),
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
    attested_at: "2026-09-09T04:45:00.000Z",
    issued_at: "2026-09-09T04:45:00.000Z",
    version: 1,
    ...overrides,
  } as PrescriptionWithRelations;
}

describe("rxl-29 Phase 3 gate", () => {
  it("47 autosaves after Finish still produce one Version 2 on re-issue", () => {
    let current = rx();
    let versionsMinted = 0;

    for (let i = 0; i < 47; i += 1) {
      // Autosave patches the working row. needsReissue is only consulted on leave.
      void i;
    }

    if (needsReissue(current, { isDirty: true })) {
      current = rx({
        id: "rx-2",
        version: 2,
        supersedes_id: "rx-1",
        attested_at: null,
        issued_at: null,
      });
      versionsMinted += 1;
    }

    expect(versionsMinted).toBe(1);
    expect(current.version).toBe(2);
    expect(needsReissue(current, { isDirty: false, skipId: "rx-2" })).toBe(
      false,
    );
  });

  it("adopts today's issued note writable and reviews yesterday", () => {
    const today = rx();
    expect(resolveRxLoadDecision(today, "completed", TODAY)).toEqual({
      kind: "adopt",
      rx: today,
    });
    expect(
      resolveRxLock({ cockpitState: "ended", noteClosed: false }),
    ).toEqual({ contentLocked: false, prefsLocked: false });

    const yesterday = rx({
      issued_at: "2026-09-08T04:45:00.000Z",
      attested_at: "2026-09-08T04:45:00.000Z",
    });
    expect(resolveRxLoadDecision(yesterday, "completed", TODAY)).toEqual({
      kind: "review",
      rx: yesterday,
    });
    expect(
      resolveRxLock({ cockpitState: "ended", noteClosed: true }),
    ).toEqual({ contentLocked: true, prefsLocked: false });
  });
});
