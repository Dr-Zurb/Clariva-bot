import { describe, expect, it } from "vitest";
import {
  canMarkArrived,
  hasArrivedStamp,
  resolveSlotBoardStatus,
  showQueueArrivedDot,
  showQueueLobbyPresence,
  showSlotLobbyPresence,
} from "../opdArrival";

const STAMP = "2026-08-22T10:00:00.000Z";

describe("opdArrival", () => {
  it("allows Arrive only for open visits without a stamp", () => {
    expect(
      canMarkArrived({ appointmentStatus: "confirmed", patientCheckedInAt: null })
    ).toBe(true);
    expect(
      canMarkArrived({
        appointmentStatus: "confirmed",
        patientCheckedInAt: STAMP,
      })
    ).toBe(false);
    expect(
      canMarkArrived({ appointmentStatus: "completed", patientCheckedInAt: null })
    ).toBe(false);
  });

  it("folds arrival into Upcoming only when scheduled and not late", () => {
    expect(
      resolveSlotBoardStatus({ patientCheckedInAt: null, slotStatus: "upcoming" }, "scheduled")
    ).toEqual({ label: "Upcoming", kind: "upcoming", arrivedDot: false });
    expect(
      resolveSlotBoardStatus(
        { patientCheckedInAt: STAMP, slotStatus: "upcoming" },
        "scheduled"
      )
    ).toEqual({ label: "Arrived", kind: "arrived", arrivedDot: false });
    expect(
      resolveSlotBoardStatus(
        { patientCheckedInAt: STAMP, timing: { band: "late", minutesToStart: -8 }, slotStatus: "running_late" },
        "scheduled"
      )
    ).toEqual({ label: "Overdue", kind: "overdue", arrivedDot: true });
    expect(
      resolveSlotBoardStatus(
        { patientCheckedInAt: STAMP, slotStatus: "in_consultation" },
        "in_consult"
      )
    ).toEqual({ label: "In consult", kind: "other", arrivedDot: false });
    expect(hasArrivedStamp({ patientCheckedInAt: null })).toBe(false);
  });

  it("uses a queue arrived dot on Waiting / Called only", () => {
    expect(
      showQueueArrivedDot({ patientCheckedInAt: STAMP, queueStatus: "waiting" })
    ).toBe(true);
    expect(
      showQueueArrivedDot({ patientCheckedInAt: STAMP, queueStatus: "called" })
    ).toBe(true);
    expect(
      showQueueArrivedDot({ patientCheckedInAt: STAMP, queueStatus: "in_consultation" })
    ).toBe(false);
    expect(
      showQueueArrivedDot({ patientCheckedInAt: null, queueStatus: "waiting" })
    ).toBe(false);
  });

  it("does not stack lobby Waiting on Arrived / Overdue or queue Waiting", () => {
    expect(showSlotLobbyPresence("arrived", ["patient_waiting"])).toBeNull();
    expect(showSlotLobbyPresence("overdue", ["patient_waiting"])).toBeNull();
    expect(showSlotLobbyPresence("upcoming", ["patient_waiting"])).toBe("in_lobby");
    expect(showSlotLobbyPresence("other", ["patient_stepped_away"])).toBe(
      "stepped_away"
    );
    expect(showQueueLobbyPresence("waiting", ["patient_waiting"])).toBeNull();
    expect(showQueueLobbyPresence("called", ["patient_waiting"])).toBe("in_lobby");
  });
});
