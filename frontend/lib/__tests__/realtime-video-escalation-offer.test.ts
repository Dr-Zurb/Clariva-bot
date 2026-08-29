import { describe, expect, it } from "vitest";
import {
  pendingStubFromEscalationState,
  shouldOpenConsentModal,
} from "@/lib/realtime-video-escalation";
import type { VideoEscalationStateData } from "@/lib/api/recording-escalation";

describe("shouldOpenConsentModal — rec-25 offer rows", () => {
  it("opens for a pending doctor request (Realtime INSERT)", () => {
    expect(
      shouldOpenConsentModal({
        patient_response: null,
        initiated_by: "doctor",
      }),
    ).toBe(true);
  });

  it("does not open for a patient offer INSERT (already answered)", () => {
    expect(
      shouldOpenConsentModal({
        patient_response: "allow",
        initiated_by: "patient",
      }),
    ).toBe(false);
  });

  it("does not open for a patient-initiated row even if pending", () => {
    expect(
      shouldOpenConsentModal({
        patient_response: null,
        initiated_by: "patient",
      }),
    ).toBe(false);
  });

  it("does not open for a resolved doctor allow", () => {
    expect(
      shouldOpenConsentModal({
        patient_response: "allow",
        initiated_by: "doctor",
      }),
    ).toBe(false);
  });
});

describe("pendingStubFromEscalationState — rec-25 mount probe", () => {
  it("returns a stub only while a doctor request is pending", () => {
    const requesting: VideoEscalationStateData = {
      kind: "requesting",
      requestId: "r1",
      expiresAt: "2026-08-20T10:01:00.000Z",
      attemptsUsed: 1,
    };
    expect(pendingStubFromEscalationState(requesting)).toEqual({
      requestId: "r1",
      expiresAt: "2026-08-20T10:01:00.000Z",
    });
  });

  it("returns null for an offered grant (already_recording_video)", () => {
    const offered: VideoEscalationStateData = {
      kind: "locked",
      reason: "already_recording_video",
      requestId: "off-1",
      grantExpiresAt: "2026-08-20T10:02:00.000Z",
      extensionSpent: false,
    };
    expect(pendingStubFromEscalationState(offered)).toBeNull();
  });

  it("returns null for idle / cooldown / max_attempts", () => {
    expect(
      pendingStubFromEscalationState({ kind: "idle", attemptsUsed: 0 }),
    ).toBeNull();
    expect(
      pendingStubFromEscalationState({
        kind: "cooldown",
        availableAt: "2026-08-20T10:05:00.000Z",
        attemptsUsed: 1,
        lastOutcome: "decline",
        lastReason: null,
      }),
    ).toBeNull();
    expect(
      pendingStubFromEscalationState({
        kind: "locked",
        reason: "max_attempts",
        requestId: null,
      }),
    ).toBeNull();
  });
});
