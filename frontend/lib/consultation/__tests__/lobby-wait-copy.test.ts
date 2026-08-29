import { describe, expect, it } from "vitest";
import {
  DOCTOR_BUSY_OTHER_PATIENT,
  QUEUE_ETA_LEAD,
  formatQueueEtaRange,
  lobbyWaitHasContent,
} from "@/lib/consultation/lobby-wait-copy";
import type { PatientOpdSnapshot } from "@/types/opd-session";

const baseSnapshot = (): PatientOpdSnapshot => ({
  appointmentId: "appt-1",
  status: "confirmed",
  opdMode: "slot",
  suggestedPollSeconds: 20,
});

describe("lobby-wait-copy (crc-12)", () => {
  it("keeps the /my-visit doctor-busy sentence", () => {
    expect(DOCTOR_BUSY_OTHER_PATIENT).toBe(
      "The doctor is with another patient. Sit tight — this page updates automatically."
    );
  });

  it("formats queue ETA the same way /my-visit does", () => {
    expect(QUEUE_ETA_LEAD).toBe("Estimated wait: about");
    expect(formatQueueEtaRange({ minMinutes: 8, maxMinutes: 16 })).toBe(
      "(range 8–16 min)"
    );
  });

  it("has no content when the snapshot is missing or empty", () => {
    expect(lobbyWaitHasContent(null)).toBe(false);
    expect(lobbyWaitHasContent(undefined)).toBe(false);
    expect(lobbyWaitHasContent(baseSnapshot())).toBe(false);
  });

  it("has content for busy-other, delay, or queue ETA", () => {
    expect(
      lobbyWaitHasContent({
        ...baseSnapshot(),
        doctorBusyWith: "other_patient",
      })
    ).toBe(true);
    expect(lobbyWaitHasContent({ ...baseSnapshot(), delayMinutes: 12 })).toBe(
      true
    );
    expect(
      lobbyWaitHasContent({
        ...baseSnapshot(),
        opdMode: "queue",
        etaMinutes: 20,
      })
    ).toBe(true);
  });
});
