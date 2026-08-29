import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import VideoRecordingIndicator from "../VideoRecordingIndicator";
import {
  pauseVideoRecording,
  resumeVideoRecording,
  revokeVideoRecording,
  VideoEscalationError,
} from "@/lib/api/recording-escalation";
import {
  rec24ConfirmMarkName,
  rec24HaltMarkName,
} from "@/lib/rec24-halt-marks";

vi.mock("@/lib/api/recording-escalation", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/api/recording-escalation")
  >("@/lib/api/recording-escalation");
  return {
    ...actual,
    pauseVideoRecording: vi.fn(),
    resumeVideoRecording: vi.fn(),
    revokeVideoRecording: vi.fn(),
  };
});

const mockedPause = vi.mocked(pauseVideoRecording);
const mockedResume = vi.mocked(resumeVideoRecording);
const mockedRevoke = vi.mocked(revokeVideoRecording);

beforeEach(() => {
  mockedPause.mockReset();
  mockedResume.mockReset();
  mockedRevoke.mockReset();
  mockedPause.mockResolvedValue({ status: "paused", correlationId: "c1" });
  mockedResume.mockResolvedValue({ status: "resumed", correlationId: "c1" });
  mockedRevoke.mockResolvedValue({ status: "revoked", correlationId: "c1" });
  performance.clearMarks();
  performance.clearMeasures();
});

afterEach(() => {
  performance.clearMarks();
  performance.clearMeasures();
});

describe("VideoRecordingIndicator — rec-24", () => {
  it("halts local video before the pause network call", async () => {
    const order: string[] = [];
    mockedPause.mockImplementation(async () => {
      order.push("network");
      return { status: "paused", correlationId: "c1" };
    });
    render(
      <VideoRecordingIndicator
        isActive
        viewerRole="patient"
        sessionId="s1"
        token="t1"
        onHaltLocalVideo={() => {
          order.push("halt");
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /pause video saving/i }));
    await waitFor(() => {
      expect(mockedPause).toHaveBeenCalled();
    });
    expect(order).toEqual(["halt", "network"]);
    expect(screen.queryByTestId("video-recording-revoke-tooltip")).not.toBeInTheDocument();
  });

  it("stamps confirm before halt and does not stamp halt itself", async () => {
    const seen: { confirm: number; halt: number }[] = [];
    render(
      <VideoRecordingIndicator
        isActive
        viewerRole="patient"
        sessionId="s1"
        token="t1"
        onHaltLocalVideo={() => {
          seen.push({
            confirm: performance.getEntriesByName(rec24ConfirmMarkName("pause")).length,
            halt: performance.getEntriesByName(rec24HaltMarkName("pause")).length,
          });
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /pause video saving/i }));
    await waitFor(() => {
      expect(mockedPause).toHaveBeenCalled();
    });
    expect(seen).toEqual([{ confirm: 1, halt: 0 }]);
  });

  it("halts local video before the stop network call", async () => {
    const order: string[] = [];
    mockedRevoke.mockImplementation(async () => {
      order.push("network");
      return { status: "revoked", correlationId: "c1" };
    });
    render(
      <VideoRecordingIndicator
        isActive
        viewerRole="patient"
        sessionId="s1"
        token="t1"
        onHaltLocalVideo={() => {
          order.push("halt");
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /stop video recording/i }));
    expect(screen.getByTestId("video-recording-revoke-tooltip")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /yes, stop/i }));
    await waitFor(() => {
      expect(mockedRevoke).toHaveBeenCalled();
    });
    expect(order).toEqual(["halt", "network"]);
  });

  it("keeps the camera confirming gate on a failed stop", async () => {
    const onCameraGateChange = vi.fn();
    mockedRevoke.mockRejectedValueOnce(
      new VideoEscalationError("Couldn't stop recording. Please try again.", "UNKNOWN", 500),
    );
    render(
      <VideoRecordingIndicator
        isActive
        viewerRole="patient"
        sessionId="s1"
        token="t1"
        onHaltLocalVideo={() => undefined}
        onCameraGateChange={onCameraGateChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /stop video recording/i }));
    fireEvent.click(screen.getByRole("button", { name: /yes, stop/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Couldn't stop recording");
    });
    expect(onCameraGateChange).toHaveBeenCalledWith("stopping");
    expect(onCameraGateChange).toHaveBeenCalledWith("confirming");
    expect(screen.getByRole("button", { name: /yes, stop/i })).toBeEnabled();
  });

  it("shows the paused state to both parties and has no pause confirm", () => {
    const { rerender } = render(
      <VideoRecordingIndicator
        isActive
        viewerRole="doctor"
        videoPaused
      />,
    );
    expect(screen.getByTestId("video-recording-indicator")).toHaveTextContent(
      "Video paused — you can resume",
    );
    expect(screen.queryByRole("button", { name: /pause/i })).not.toBeInTheDocument();

    rerender(
      <VideoRecordingIndicator
        isActive
        viewerRole="patient"
        sessionId="s1"
        token="t1"
        videoPaused
      />,
    );
    expect(screen.getByRole("button", { name: /resume video saving/i })).toBeInTheDocument();
    expect(screen.queryByTestId("video-recording-revoke-tooltip")).not.toBeInTheDocument();
  });

  it("does not restore local video until resume succeeds", async () => {
    const onRestore = vi.fn();
    mockedResume.mockImplementation(async () => {
      expect(onRestore).not.toHaveBeenCalled();
      return { status: "resumed", correlationId: "c1" };
    });
    render(
      <VideoRecordingIndicator
        isActive
        viewerRole="patient"
        sessionId="s1"
        token="t1"
        videoPaused
        onRestoreLocalVideo={onRestore}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /resume video saving/i }));
    await waitFor(() => {
      expect(mockedResume).toHaveBeenCalled();
    });
    expect(onRestore).toHaveBeenCalledTimes(1);
  });
});
