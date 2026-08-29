import { describe, expect, it } from "vitest";
import {
  canMarkArrived,
  hasArrivedStamp,
  showArrivedChip,
} from "../opdArrival";

describe("opdArrival", () => {
  it("allows Arrive only for open visits without a stamp", () => {
    expect(
      canMarkArrived({ appointmentStatus: "confirmed", patientCheckedInAt: null })
    ).toBe(true);
    expect(
      canMarkArrived({
        appointmentStatus: "confirmed",
        patientCheckedInAt: "2026-08-22T10:00:00.000Z",
      })
    ).toBe(false);
    expect(
      canMarkArrived({ appointmentStatus: "completed", patientCheckedInAt: null })
    ).toBe(false);
  });

  it("shows Arrived when stamped and not in a lobby state", () => {
    expect(
      showArrivedChip({
        patientCheckedInAt: "2026-08-22T10:00:00.000Z",
        tags: ["walk_in"],
      })
    ).toBe(true);
    expect(
      showArrivedChip({
        patientCheckedInAt: "2026-08-22T10:00:00.000Z",
        tags: ["patient_waiting"],
      })
    ).toBe(false);
    expect(hasArrivedStamp({ patientCheckedInAt: null })).toBe(false);
  });
});
