import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import RecordingPausedIndicator, {
  PAUSE_REASON_BANNER_LABELS,
  PAUSE_REASON_CODES,
  formatCountdown,
  pauseReasonBannerLabel,
  remainingMsFromDeadline,
} from "../RecordingPausedIndicator";
import type { RecordingStateSnapshot } from "@/hooks/useRecordingState";
import { pauseRecording, resumeRecording } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  pauseRecording: vi.fn(),
  resumeRecording: vi.fn(),
}));

const mockedPause = vi.mocked(pauseRecording);
const mockedResume = vi.mocked(resumeRecording);

function pausedState(pauseReason?: string): RecordingStateSnapshot {
  return {
    paused: true,
    pauseReason,
    loading: false,
    error: null,
  };
}

beforeEach(() => {
  mockedPause.mockReset();
  mockedResume.mockReset();
  mockedPause.mockResolvedValue({
    success: true,
    data: null,
    meta: { timestamp: "2026-08-19T00:00:00.000Z", requestId: "r1" },
  });
  mockedResume.mockResolvedValue({
    success: true,
    data: null,
    meta: { timestamp: "2026-08-19T00:00:00.000Z", requestId: "r1" },
  });
});

describe("RecordingPausedIndicator", () => {
  it.each(PAUSE_REASON_CODES)(
    "renders the banner label for %s",
    (code) => {
      render(
        <RecordingPausedIndicator
          state={pausedState(code)}
          currentUserRole="patient"
        />,
      );
      expect(screen.getByTestId("recording-paused-indicator")).toHaveTextContent(
        PAUSE_REASON_BANNER_LABELS[code],
      );
    },
  );

  it("uses the not-recorded label for a legacy free-text reason", () => {
    render(
      <RecordingPausedIndicator
        state={pausedState("Patient disclosed a diagnosis")}
        currentUserRole="doctor"
      />,
    );
    expect(screen.getByTestId("recording-paused-indicator")).toHaveTextContent(
      "the reason was not recorded in preset form",
    );
    expect(
      screen.queryByText(/Patient disclosed a diagnosis/),
    ).not.toBeInTheDocument();
  });

  it("uses the not-recorded label when the code is missing", () => {
    render(
      <RecordingPausedIndicator
        state={pausedState(undefined)}
        currentUserRole="patient"
      />,
    );
    expect(screen.getByTestId("recording-paused-indicator")).toHaveTextContent(
      "the reason was not recorded in preset form",
    );
  });

  it("does not render when recording is not paused", () => {
    const { container } = render(
      <RecordingPausedIndicator
        state={{ paused: false, loading: false, error: null }}
        currentUserRole="doctor"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("countdown from server deadline", () => {
  it("renders remaining time from autoResumeAt and degrades when absent", () => {
    const { rerender } = render(
      <RecordingPausedIndicator
        state={{
          ...pausedState("administrative"),
          autoResumeAt: new Date(Date.now() + 90_000),
        }}
        currentUserRole="patient"
      />,
    );
    expect(screen.getByTestId("recording-pause-countdown")).toHaveTextContent(
      /Resumes in 1:\d{2}/,
    );

    rerender(
      <RecordingPausedIndicator
        state={pausedState("administrative")}
        currentUserRole="patient"
      />,
    );
    expect(screen.queryByTestId("recording-pause-countdown")).not.toBeInTheDocument();
    expect(screen.getByTestId("recording-paused-indicator")).toHaveTextContent(
      "Recording paused",
    );
  });

  it("stays paused at zero and does not invent a resume", () => {
    render(
      <RecordingPausedIndicator
        state={{
          ...pausedState("administrative"),
          autoResumeAt: new Date(Date.now() - 1_000),
        }}
        currentUserRole="doctor"
      />,
    );
    expect(screen.getByTestId("recording-paused-indicator")).toBeInTheDocument();
    expect(screen.getByTestId("recording-pause-countdown")).toHaveTextContent(
      "Waiting for recording to resume",
    );
  });

  it("formatCountdown and remainingMsFromDeadline never produce NaN", () => {
    expect(remainingMsFromDeadline(undefined, Date.now())).toBeNull();
    expect(remainingMsFromDeadline("not-a-date", Date.now())).toBeNull();
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(65_000)).toBe("1:05");
  });
});

describe("rec-17 · patient control and honest banners", () => {
  it("shows the pause control while recording is live for the patient", () => {
    render(
      <RecordingPausedIndicator
        state={{ paused: false, loading: false, error: null }}
        currentUserRole="patient"
        sessionId="sess-1"
        token="tok-1"
      />,
    );
    expect(screen.getByTestId("patient-recording-pause")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause recording" })).toBeInTheDocument();
  });

  it("does not show the pause control to the doctor while live", () => {
    render(
      <RecordingPausedIndicator
        state={{ paused: false, loading: false, error: null }}
        currentUserRole="doctor"
        sessionId="sess-1"
        token="tok-1"
      />,
    );
    expect(screen.queryByTestId("patient-recording-pause")).not.toBeInTheDocument();
  });

  it("opens the confirm tooltip and pauses without sending a reason", async () => {
    render(
      <RecordingPausedIndicator
        state={{ paused: false, loading: false, error: null }}
        currentUserRole="patient"
        sessionId="sess-1"
        token="tok-1"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Pause recording" }));
    expect(screen.getByTestId("patient-recording-pause-tooltip")).toHaveTextContent(
      "The consult continues",
    );
    fireEvent.click(screen.getByRole("button", { name: "Yes, pause" }));
    await waitFor(() => {
      expect(mockedPause).toHaveBeenCalledWith("tok-1", "sess-1");
    });
  });

  it("surfaces a pause failure inline and stays usable", async () => {
    mockedPause.mockRejectedValueOnce(new Error("network down"));
    render(
      <RecordingPausedIndicator
        state={{ paused: false, loading: false, error: null }}
        currentUserRole="patient"
        sessionId="sess-1"
        token="tok-1"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Pause recording" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, pause" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("network down");
    expect(screen.getByRole("button", { name: "Yes, pause" })).toBeEnabled();
  });

  it("names the patient on the doctor banner without alarm copy", () => {
    render(
      <RecordingPausedIndicator
        state={{
          ...pausedState("patient_request"),
          pausedByRole: "patient",
        }}
        currentUserRole="doctor"
      />,
    );
    expect(screen.getByTestId("recording-paused-indicator")).toHaveTextContent(
      "The patient paused recording",
    );
    expect(screen.getByTestId("recording-paused-indicator")).not.toHaveTextContent(
      /Resume when ready/,
    );
    expect(screen.getByTestId("recording-paused-indicator")).not.toHaveTextContent(
      /fault|alarm|error/i,
    );
  });
});

describe("pauseReasonBannerLabel", () => {
  it("maps each preset code and falls back for unknown tokens", () => {
    expect(pauseReasonBannerLabel("sensitive_disclosure")).toBe(
      "this part of the visit was deliberately not recorded",
    );
    expect(pauseReasonBannerLabel("not_recorded_in_preset_form")).toBe(
      "the reason was not recorded in preset form",
    );
    expect(pauseReasonBannerLabel(undefined)).toBe(
      "the reason was not recorded in preset form",
    );
  });
});
