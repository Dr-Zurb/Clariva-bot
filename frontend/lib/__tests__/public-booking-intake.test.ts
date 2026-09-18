import { describe, expect, it } from "vitest";
import { resolvePublicBookingIntake } from "../public-booking-intake";

const valid = {
  patientName: "Test Patient",
  patientPhone: "+91 98765 43210",
  reasonForVisit: "Follow-up",
  consentGranted: true,
};

describe("resolvePublicBookingIntake (mca-14)", () => {
  it("accepts a complete draft and normalizes the phone", () => {
    const result = resolvePublicBookingIntake(valid);
    expect(result).toEqual({
      ok: true,
      value: {
        patientName: "Test Patient",
        patientPhone: "+919876543210",
        reasonForVisit: "Follow-up",
        consentGranted: true,
      },
    });
  });

  it("rejects a missing field or unchecked consent", () => {
    expect(resolvePublicBookingIntake({ ...valid, patientName: "  " }).ok).toBe(
      false
    );
    expect(resolvePublicBookingIntake({ ...valid, patientPhone: "abc" }).ok).toBe(
      false
    );
    expect(
      resolvePublicBookingIntake({ ...valid, reasonForVisit: "" }).ok
    ).toBe(false);
    expect(
      resolvePublicBookingIntake({ ...valid, consentGranted: false }).ok
    ).toBe(false);
  });

  it("does not treat a leading-zero local number as valid", () => {
    const result = resolvePublicBookingIntake({
      ...valid,
      patientPhone: "09876543210",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.field).toBe("patientPhone");
    }
  });
});
