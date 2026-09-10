import { describe, expect, it } from "vitest";
import { shouldSkipVideoPrecallGate } from "@/lib/consultation/video-lobby-precall";

describe("shouldSkipVideoPrecallGate (crc-10)", () => {
  it("skips the gate when the patient waited in lobby and completed the check", () => {
    expect(shouldSkipVideoPrecallGate({ arrivedViaLobby: true })).toBe(true);
  });

  it("skips the gate when the patient waited in lobby but never tapped Continue", () => {
    expect(shouldSkipVideoPrecallGate({ arrivedViaLobby: true })).toBe(true);
  });

  it("keeps the gate for late openers who never saw the lobby", () => {
    expect(shouldSkipVideoPrecallGate({ arrivedViaLobby: false })).toBe(false);
  });
});
