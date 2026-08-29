import { describe, expect, it } from "vitest";
import { resolveInteractionProfileLinks } from "@/lib/inbox/profile-links";

describe("resolveInteractionProfileLinks", () => {
  it("does not link placeholder chatter without MRN", () => {
    expect(
      resolveInteractionProfileLinks({
        patient_id: "p1",
        medical_record_number: null,
        appointment_patient_id: null,
        appointment_patient_display_name: null,
        appointment_patient_mrn: null,
      }).chatterProfilePatientId
    ).toBeNull();
  });

  it("links registered chatter", () => {
    expect(
      resolveInteractionProfileLinks({
        patient_id: "p1",
        medical_record_number: "MRN-1",
        appointment_patient_id: "p1",
        appointment_patient_display_name: "Self",
        appointment_patient_mrn: "MRN-1",
      }).chatterProfilePatientId
    ).toBe("p1");
  });

  it("shows booked-for when family member differs from IG chatter", () => {
    expect(
      resolveInteractionProfileLinks({
        patient_id: "p-ig",
        medical_record_number: null,
        appointment_patient_id: "p-mom",
        appointment_patient_display_name: "Mom",
        appointment_patient_mrn: "MRN-2",
      })
    ).toEqual({
      chatterProfilePatientId: null,
      bookedForPatientId: "p-mom",
      bookedForLabel: "Mom",
    });
  });
});
