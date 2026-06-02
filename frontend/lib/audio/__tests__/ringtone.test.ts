/**
 * Unit tests for `frontend/lib/audio/ringtone.ts`.
 */

import {
  isPatientTwilioIdentity,
  playPatientJoinedChime,
  resetPatientJoinedChimeDebounceForTests,
} from "../ringtone";

describe("ringtone", () => {
  describe("isPatientTwilioIdentity", () => {
    it("returns true for patient-{appointmentId} identities", () => {
      expect(isPatientTwilioIdentity("patient-apt-abc")).toBe(true);
    });

    it("returns false for doctor and unknown identities", () => {
      expect(isPatientTwilioIdentity("doctor-doc-1")).toBe(false);
      expect(isPatientTwilioIdentity("support-1")).toBe(false);
    });
  });

  describe("playPatientJoinedChime", () => {
    const playMock = vi.fn().mockResolvedValue(undefined);

    beforeEach(() => {
      vi.useFakeTimers();
      resetPatientJoinedChimeDebounceForTests();
      playMock.mockClear();
      class MockAudio {
        play = playMock;
      }
      vi.stubGlobal("Audio", MockAudio as unknown as typeof Audio);
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it("plays once and debounces within 5s", () => {
      playPatientJoinedChime();
      playPatientJoinedChime();
      expect(playMock).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(4_999);
      playPatientJoinedChime();
      expect(playMock).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(2);
      playPatientJoinedChime();
      expect(playMock).toHaveBeenCalledTimes(2);
    });

    it("swallows play() rejection without throwing", async () => {
      playMock.mockRejectedValueOnce(new DOMException("NotAllowedError"));
      expect(() => playPatientJoinedChime()).not.toThrow();
      await vi.runAllTimersAsync();
    });
  });
});
