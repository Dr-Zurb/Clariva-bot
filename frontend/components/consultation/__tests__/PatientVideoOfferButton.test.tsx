import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import PatientVideoOfferButton from "../PatientVideoOfferButton";
import type { VideoEscalationStateData } from "@/lib/api/recording-escalation";
import {
  offerVideoRecording,
  VideoEscalationError,
} from "@/lib/api/recording-escalation";

vi.mock("@/lib/api/recording-escalation", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/api/recording-escalation")
  >("@/lib/api/recording-escalation");
  return {
    ...actual,
    offerVideoRecording: vi.fn(),
  };
});

const mockedOffer = vi.mocked(offerVideoRecording);

const idle: VideoEscalationStateData = { kind: "idle", attemptsUsed: 0 };

beforeEach(() => {
  mockedOffer.mockReset();
  mockedOffer.mockResolvedValue({
    status: "started",
    correlationId: "c1",
    requestId: "off-1",
    grantExpiresAt: "2026-08-20T10:02:00.000Z",
  });
});

describe("PatientVideoOfferButton", () => {
  it("hides for the doctor", () => {
    const { container } = render(
      <PatientVideoOfferButton
        sessionId="s1"
        token="t1"
        currentUserRole="doctor"
        state={idle}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("hides while video is already recording", () => {
    const { container } = render(
      <PatientVideoOfferButton
        sessionId="s1"
        token="t1"
        currentUserRole="patient"
        state={{
          kind: "locked",
          reason: "already_recording_video",
          requestId: "g1",
        }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("hides while a doctor request is pending", () => {
    const { container } = render(
      <PatientVideoOfferButton
        sessionId="s1"
        token="t1"
        currentUserRole="patient"
        state={{
          kind: "requesting",
          requestId: "r1",
          expiresAt: "2026-08-20T10:01:00.000Z",
          attemptsUsed: 1,
        }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("stays offerable during a doctor decline cooldown and at max_attempts", () => {
    const { rerender } = render(
      <PatientVideoOfferButton
        sessionId="s1"
        token="t1"
        currentUserRole="patient"
        state={{
          kind: "cooldown",
          availableAt: "2026-08-20T10:05:00.000Z",
          attemptsUsed: 1,
          lastOutcome: "decline",
          lastReason: null,
        }}
        cooldownSecondsRemaining={240}
      />,
    );
    expect(
      screen.getByRole("button", { name: /start saving video/i }),
    ).toBeEnabled();

    rerender(
      <PatientVideoOfferButton
        sessionId="s1"
        token="t1"
        currentUserRole="patient"
        state={{ kind: "locked", reason: "max_attempts", requestId: null }}
      />,
    );
    expect(
      screen.getByRole("button", { name: /start saving video/i }),
    ).toBeEnabled();
  });

  it("is visible but disabled during the 30s stop debounce", () => {
    render(
      <PatientVideoOfferButton
        sessionId="s1"
        token="t1"
        currentUserRole="patient"
        state={{
          kind: "cooldown",
          availableAt: "2026-08-20T10:00:30.000Z",
          attemptsUsed: 0,
          lastOutcome: "stopped",
          lastReason: null,
        }}
        cooldownSecondsRemaining={12}
      />,
    );
    const button = screen.getByRole("button", {
      name: /start saving video/i,
    });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("Try again in 12s");
  });

  it("states that the camera is already on and the recording will be saved", () => {
    render(
      <PatientVideoOfferButton
        sessionId="s1"
        token="t1"
        currentUserRole="patient"
        state={idle}
      />,
    );
    expect(
      screen.getByText(/camera is already on/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/only starts saving the video/i),
    ).toBeInTheDocument();
  });

  it("surfaces an inline error and re-enables the control", async () => {
    mockedOffer.mockRejectedValueOnce(
      new VideoEscalationError(
        "Your doctor has already asked to record video. Please respond to that request first.",
        "UNKNOWN",
        409,
      ),
    );
    render(
      <PatientVideoOfferButton
        sessionId="s1"
        token="t1"
        currentUserRole="patient"
        state={idle}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /start saving video/i }),
    );
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Your doctor has already asked to record video",
      );
    });
    expect(
      screen.getByRole("button", { name: /start saving video/i }),
    ).toBeEnabled();
  });
});
