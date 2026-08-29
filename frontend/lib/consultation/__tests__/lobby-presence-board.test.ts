import { describe, expect, it } from "vitest";
import {
  applyLobbyPresenceOverlay,
  LOBBY_PRESENCE_BOARD_MAX_CHANNELS,
  pickLobbyPresenceSubscriptionIds,
} from "@/lib/consultation/lobby-presence-board";
import type { SlotTag } from "@/types/opd-doctor";

function row(appointmentId: string, scheduledAt: string, tags: SlotTag[] = []) {
  return { appointmentId, scheduledAt, tags };
}

describe("lobby-presence-board overlay (crc-15)", () => {
  it("presence event flips the row to patient_waiting", () => {
    const overlay = new Set(["appt-1"]);
    const next = applyLobbyPresenceOverlay(
      [row("appt-1", "2026-08-13T09:00:00.000Z")],
      overlay
    );
    expect(next[0]?.tags).toEqual(["patient_waiting"]);
  });

  it("does not change chip tags when the poll already has waiting", () => {
    const overlay = new Set(["appt-1"]);
    const polled = [
      row("appt-1", "2026-08-13T09:00:00.000Z", ["patient_waiting"]),
    ];
    expect(applyLobbyPresenceOverlay(polled, overlay)).toBe(polled);
  });

  it("poll result overrides optimistic waiting when overlay is cleared", () => {
    const optimistic = applyLobbyPresenceOverlay(
      [row("appt-1", "2026-08-13T09:00:00.000Z", ["patient_stepped_away"])],
      new Set(["appt-1"])
    );
    expect(optimistic[0]?.tags).toEqual(["patient_waiting"]);

    const polled = [
      row("appt-1", "2026-08-13T09:00:00.000Z", ["patient_stepped_away"]),
    ];
    expect(applyLobbyPresenceOverlay(polled, new Set())).toBe(polled);
    expect(applyLobbyPresenceOverlay(polled, new Set())[0]?.tags).toEqual([
      "patient_stepped_away",
    ]);
  });

  it("subscribe failure (empty overlay) leaves poll tags intact", () => {
    const polled = [
      row("appt-1", "2026-08-13T09:00:00.000Z", ["walk_in"]),
      row("appt-2", "2026-08-13T09:15:00.000Z", ["patient_waiting"]),
    ];
    expect(applyLobbyPresenceOverlay(polled, new Set())).toBe(polled);
  });

  it("caps subscriptions to soonest-scheduled rows", () => {
    const rows = Array.from(
      { length: LOBBY_PRESENCE_BOARD_MAX_CHANNELS + 5 },
      (_, i) =>
        row(
          `appt-${i}`,
          `2026-08-13T${String(8 + Math.floor(i / 6)).padStart(2, "0")}:${String(
            (i % 6) * 10
          ).padStart(2, "0")}:00.000Z`
        )
    );
    const ids = pickLobbyPresenceSubscriptionIds(rows);
    expect(ids).toHaveLength(LOBBY_PRESENCE_BOARD_MAX_CHANNELS);
    expect(ids[0]).toBe("appt-0");
    expect(ids).not.toContain(`appt-${LOBBY_PRESENCE_BOARD_MAX_CHANNELS}`);
  });
});
