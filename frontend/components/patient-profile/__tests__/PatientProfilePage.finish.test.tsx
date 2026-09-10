import { describe, it, expect } from "vitest";
import { markAppointmentFinishedLocally } from "../PatientProfilePage";
import type { Appointment } from "@/types/appointment";

function makeAppt(
  overrides: Partial<Appointment> = {}
): Appointment {
  return {
    id: "appt-1",
    doctor_id: "doc-1",
    patient_id: "pat-1",
    patient_name: "Ritu Bose",
    patient_phone: "9000040903",
    patient_age: 28,
    patient_sex: "female",
    appointment_date: "2026-09-07T10:00:00.000Z",
    status: "confirmed",
    created_at: "2026-09-07T09:00:00.000Z",
    updated_at: "2026-09-07T09:00:00.000Z",
    consultation_type: "in_clinic",
    patient_checked_in_at: "2026-09-07T09:55:00.000Z",
    ...overrides,
  };
}

describe("markAppointmentFinishedLocally", () => {
  it("marks the visit completed so advance can run before wrap-up returns", () => {
    const next = markAppointmentFinishedLocally(makeAppt());
    expect(next.status).toBe("completed");
    expect(next.consultation_session).toBeUndefined();
  });

  it("ends a live session so completed × live does not keep the cockpit in live", () => {
    const next = markAppointmentFinishedLocally(
      makeAppt({
        consultation_session: {
          id: "sess-1",
          modality: "video",
          status: "live",
          provider: "twilio_video",
          provider_session_id: "RM_1",
          actual_started_at: "2026-09-07T10:01:00.000Z",
          actual_ended_at: null,
        },
      })
    );
    expect(next.status).toBe("completed");
    expect(next.consultation_session?.status).toBe("ended");
  });
});
