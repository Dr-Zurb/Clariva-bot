import { describe, expect, it } from "vitest";
import {
  buildLobbyPresencePayload,
  isLobbyPresencePayload,
  lobbyPresenceTopic,
} from "@/lib/consultation/lobby-presence";

describe("lobby-presence contract (crc-14)", () => {
  it("builds a topic crc-15 can subscribe to", () => {
    expect(lobbyPresenceTopic("appt-1")).toBe("lobby-presence:appt-1");
  });

  it("payload is appointmentId + ts only — extra PHI keys are dropped", () => {
    const dirty = {
      appointmentId: "appt-1",
      ts: 1_700_000_000_000,
      name: "Ada Patient",
      phone: "+15555550100",
      token: "hmac-secret",
    };
    const payload = buildLobbyPresencePayload(dirty);
    expect(payload).toEqual({
      appointmentId: "appt-1",
      ts: 1_700_000_000_000,
    });
    expect(isLobbyPresencePayload(payload)).toBe(true);
    expect(isLobbyPresencePayload(dirty)).toBe(false);
  });

  it("rejects payloads with name / phone / token / clinical fields", () => {
    expect(
      isLobbyPresencePayload({
        appointmentId: "a",
        ts: 1,
        complaint: "chest pain",
      })
    ).toBe(false);
    expect(isLobbyPresencePayload({ appointmentId: "a" })).toBe(false);
  });
});
