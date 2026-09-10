import { describe, expect, it } from "vitest";
import type { PrescriptionWithRelations } from "@/types/prescription";
import {
  formatIssuedTime,
  needsReissue,
  resolveRxNoteChrome,
  reviseStripCopy,
} from "@/components/cockpit/rx/rxRevise";
import type { RxLoadClock } from "@/components/cockpit/rx/rxLoadDecision";

const TODAY: RxLoadClock = {
  now: new Date("2026-09-09T06:30:00.000Z"),
  timezone: "Asia/Kolkata",
};

const NEXT_DAY: RxLoadClock = {
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
    attested_at: "2026-09-09T04:45:00.000Z",
    version: 1,
    ...overrides,
  } as PrescriptionWithRelations;
}

describe("resolveRxNoteChrome", () => {
  it("hides the strip on a draft", () => {
    expect(resolveRxNoteChrome(rx({ attested_at: null }), TODAY)).toBe("none");
  });

  it("shows the revise strip on today's issued note", () => {
    expect(resolveRxNoteChrome(rx(), TODAY)).toBe("revise");
  });

  it("hides the strip on a later clinic day", () => {
    expect(resolveRxNoteChrome(rx(), NEXT_DAY)).toBe("none");
  });

  it("marks a superseded note", () => {
    expect(
      resolveRxNoteChrome(rx({ superseded_by_id: "rx-2" }), TODAY),
    ).toBe("superseded");
  });
});

describe("reviseStripCopy", () => {
  it("names the issued time and the next version", () => {
    expect(reviseStripCopy(rx(), "Asia/Kolkata")).toBe(
      "Issued 10:15 AM. Changes will create Version 2.",
    );
  });

  it("does not mention a countdown", () => {
    expect(reviseStripCopy(rx(), "Asia/Kolkata")).not.toMatch(
      /15-minute|countdown/i,
    );
  });
});

describe("formatIssuedTime", () => {
  it("formats in the doctor timezone", () => {
    expect(formatIssuedTime("2026-09-09T04:45:00.000Z", "Asia/Kolkata")).toBe(
      "10:15 AM",
    );
  });
});

describe("needsReissue", () => {
  it("is true for an original issued row", () => {
    expect(needsReissue(rx(), { isDirty: false })).toBe(true);
  });

  it("is false for a draft", () => {
    expect(needsReissue(rx({ attested_at: null }), { isDirty: true })).toBe(
      false,
    );
  });

  it("is false for a superseded row", () => {
    expect(
      needsReissue(rx({ superseded_by_id: "rx-2" }), { isDirty: true }),
    ).toBe(false);
  });

  it("skips a revision just created for this leave", () => {
    expect(needsReissue(rx({ id: "rx-2" }), { isDirty: true, skipId: "rx-2" })).toBe(
      false,
    );
  });

  it("does not clone a clean existing revision (print after send)", () => {
    expect(
      needsReissue(rx({ id: "rx-2", supersedes_id: "rx-1" }), {
        isDirty: false,
      }),
    ).toBe(false);
  });

  it("clones a dirty existing revision", () => {
    expect(
      needsReissue(rx({ id: "rx-2", supersedes_id: "rx-1" }), {
        isDirty: true,
      }),
    ).toBe(true);
  });
});
