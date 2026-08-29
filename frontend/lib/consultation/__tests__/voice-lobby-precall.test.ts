import { describe, expect, it } from "vitest";
import {
  shouldMintVoiceTwilio,
  shouldSkipVoicePrecallGate,
  voicePhaseFromSessionStatus,
} from "@/lib/consultation/voice-lobby-precall";

describe("voice lobby precall (crc-12)", () => {
  it("shows the mic check in holding when the session is still scheduled", () => {
    expect(voicePhaseFromSessionStatus("scheduled")).toBe("holding");
  });

  it("keeps the precall gate for late openers who arrive already live", () => {
    expect(voicePhaseFromSessionStatus("live")).toBe("precall");
    expect(shouldSkipVoicePrecallGate({ arrivedViaLobby: false })).toBe(false);
  });

  it("skips a second mic check after waiting in the lobby", () => {
    expect(shouldSkipVoicePrecallGate({ arrivedViaLobby: true })).toBe(true);
  });

  it("does not mint a Twilio token until the doctor has started", () => {
    expect(shouldMintVoiceTwilio("scheduled")).toBe(false);
    expect(shouldMintVoiceTwilio("ended")).toBe(false);
    expect(shouldMintVoiceTwilio("cancelled")).toBe(false);
    expect(shouldMintVoiceTwilio("no_show")).toBe(false);
    expect(shouldMintVoiceTwilio("live")).toBe(true);
  });
});
