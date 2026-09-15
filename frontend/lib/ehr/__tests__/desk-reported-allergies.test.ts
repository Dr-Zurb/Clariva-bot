import { describe, expect, it } from "vitest";
import {
  ackKeyForDeskAllergy,
  deskAllergyId,
  toMatchableDeskAllergies,
  unacceptedDeskAllergies,
} from "@/lib/ehr/desk-reported-allergies";
import type { PatientHistorySubmission } from "@/types/patient-history-submissions";

function submission(
  overrides: Partial<PatientHistorySubmission> = {},
): PatientHistorySubmission {
  return {
    id: "sub-1",
    doctor_id: "doc-1",
    patient_id: "pat-1",
    appointment_id: "apt-1",
    source: "front_desk",
    actor_id: "staff-1",
    why_today: "Headache",
    why_today_accepted_at: null,
    why_today_accepted_by: null,
    allergies: { none: false, items: [{ name: "Penicillin", reaction: "rash" }] },
    medicines: { none: true, items: [] },
    conditions: { none: true, items: [] },
    notice_version: null,
    submitted_at: "2026-09-12T04:00:00.000Z",
    updated_at: "2026-09-12T04:00:00.000Z",
    ...overrides,
  };
}

describe("unacceptedDeskAllergies", () => {
  it("returns named unaccepted items", () => {
    const items = unacceptedDeskAllergies(submission());
    expect(items).toEqual([
      {
        id: deskAllergyId("sub-1", 0),
        index: 0,
        name: "Penicillin",
        reaction: "rash",
      },
    ]);
  });

  it("skips accepted items and none", () => {
    expect(
      unacceptedDeskAllergies(
        submission({
          allergies: {
            none: false,
            items: [
              {
                name: "Penicillin",
                accepted_at: "2026-09-12T04:03:00.000Z",
                accepted_by: "doc-1",
              },
            ],
          },
        }),
      ),
    ).toEqual([]);
    expect(
      unacceptedDeskAllergies(
        submission({ allergies: { none: true, items: [] } }),
      ),
    ).toEqual([]);
  });

  it("builds matchable rows flagged as desk-reported", () => {
    const rows = toMatchableDeskAllergies(unacceptedDeskAllergies(submission()), "pat-1");
    expect(rows[0]?.reportedAtDesk).toBe(true);
    expect(rows[0]?.allergen).toBe("Penicillin");
    expect(ackKeyForDeskAllergy(rows[0]!.id)).toBe(`desk-allergy:${rows[0]!.id}`);
  });
});
