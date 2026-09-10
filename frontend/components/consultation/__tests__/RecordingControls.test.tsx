import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RecordingControls from "../RecordingControls";
import { PAUSE_REASON_CODES } from "../RecordingPausedIndicator";
import { extendRecordingPause, pauseRecording } from "@/lib/api";
import type { RecordingStateSnapshot } from "@/hooks/useRecordingState";

vi.mock("@/lib/api", () => ({
  pauseRecording: vi.fn(),
  resumeRecording: vi.fn(),
  extendRecordingPause: vi.fn(),
}));

const mockedPause = vi.mocked(pauseRecording);
const mockedExtend = vi.mocked(extendRecordingPause);

const liveState: RecordingStateSnapshot = {
  paused: false,
  loading: false,
  error: null,
};

function renderControls() {
  return render(
    <RecordingControls
      sessionId="sess-1"
      token="tok-1"
      currentUserRole="doctor"
      state={liveState}
    />,
  );
}

describe("RecordingControls · pause picker", () => {
  beforeEach(() => {
    mockedPause.mockReset();
    mockedPause.mockResolvedValue({
      success: true,
      data: null,
      meta: { timestamp: "2026-08-18T00:00:00.000Z", requestId: "req-1" },
    });
  });

  it("opens a radio picker over the five codes with no textarea", () => {
    renderControls();
    fireEvent.click(screen.getByTestId("recording-pause-button"));

    expect(screen.getByTestId("recording-pause-modal")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    for (const code of PAUSE_REASON_CODES) {
      expect(
        screen.getByTestId(`recording-pause-reason-${code}`),
      ).toBeInTheDocument();
    }
    expect(
      screen.getByText(/They will not see a typed note/),
    ).toBeInTheDocument();
  });

  it("keeps submit disabled until a code is selected", () => {
    renderControls();
    fireEvent.click(screen.getByTestId("recording-pause-button"));

    const submit = screen.getByTestId("recording-pause-modal-submit");
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByTestId("recording-pause-reason-administrative"));
    expect(submit).toBeEnabled();
  });

  it("submits the selected code and never a typed string", async () => {
    renderControls();
    fireEvent.click(screen.getByTestId("recording-pause-button"));
    fireEvent.click(
      screen.getByTestId("recording-pause-reason-sensitive_disclosure"),
    );
    fireEvent.click(screen.getByTestId("recording-pause-modal-submit"));

    expect(mockedPause).toHaveBeenCalledWith(
      "tok-1",
      "sess-1",
      "sensitive_disclosure",
    );
  });

  it("does not render for the patient", () => {
    const { container } = render(
      <RecordingControls
        sessionId="sess-1"
        token="tok-1"
        currentUserRole="patient"
        state={liveState}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("RecordingControls · extend", () => {
  beforeEach(() => {
    mockedExtend.mockReset();
    mockedExtend.mockResolvedValue({
      success: true,
      data: {
        autoResumeAt: "2026-08-18T10:20:00.000Z",
        autoResumeExtensionsUsed: 1,
      },
      meta: { timestamp: "2026-08-18T00:00:00.000Z", requestId: "req-1" },
    });
  });

  it("offers one extension while the pause is open", () => {
    render(
      <RecordingControls
        sessionId="sess-1"
        token="tok-1"
        currentUserRole="doctor"
        state={{
          paused: true,
          autoResumeExtensionsUsed: 0,
          loading: false,
          error: null,
        }}
      />,
    );
    expect(screen.getByTestId("recording-pause-extend-button")).toBeInTheDocument();
  });

  it("hides the extend button once the extension is consumed", () => {
    render(
      <RecordingControls
        sessionId="sess-1"
        token="tok-1"
        currentUserRole="doctor"
        state={{
          paused: true,
          autoResumeExtensionsUsed: 1,
          loading: false,
          error: null,
        }}
      />,
    );
    expect(
      screen.queryByTestId("recording-pause-extend-button"),
    ).not.toBeInTheDocument();
  });
});
