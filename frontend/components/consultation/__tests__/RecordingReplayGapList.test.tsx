import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import RecordingReplayPlayer, {
  RecordingReplayGapList,
  formatGapDuration,
  formatMediaOffset,
} from "../RecordingReplayPlayer";
import type { RecordingGap } from "@/lib/api";
import { getRecordingGaps, getReplayStatus } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getReplayStatus: vi.fn(),
    getRecordingGaps: vi.fn(),
    mintReplayAudioUrl: vi.fn(),
  };
});

vi.mock("@/lib/api/video-replay-otp", () => ({
  getVideoReplayOtpState: vi.fn(),
}));

const mockedStatus = vi.mocked(getReplayStatus);
const mockedGaps = vi.mocked(getRecordingGaps);

const META = { timestamp: "2026-08-19T00:00:00.000Z", requestId: "r1" };

function sampleGap(overrides: Partial<RecordingGap> = {}): RecordingGap {
  return {
    wallStartedAt: "2026-08-19T10:05:00.000Z",
    wallEndedAt: "2026-08-19T10:09:00.000Z",
    durationMs: 240_000,
    actorRole: "patient",
    reasonCode: "patient_request",
    closedAs: "manual_resume",
    mediaOffsetMs: { audio: 300_000, video: 300_000 },
    ...overrides,
  };
}

describe("RecordingReplayGapList", () => {
  it("renders no chrome when there are no gaps", () => {
    const { container } = render(
      <RecordingReplayGapList gaps={[]} loadError={null} artifact="audio" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders actor, reason, and duration for audio and video", () => {
    const { rerender } = render(
      <RecordingReplayGapList
        gaps={[sampleGap()]}
        loadError={null}
        artifact="audio"
      />,
    );
    const list = screen.getByTestId("recording-replay-gaps");
    expect(list).toHaveTextContent("Patient");
    expect(list).toHaveTextContent("the patient asked to pause");
    expect(list).toHaveTextContent("4 minutes not recorded");
    expect(list).toHaveTextContent("At 5:00 in this recording");
    expect(screen.getByRole("listitem")).toHaveAttribute("tabindex", "0");

    rerender(
      <RecordingReplayGapList
        gaps={[sampleGap({ mediaOffsetMs: { audio: 300_000, video: 120_000 } })]}
        loadError={null}
        artifact="video"
      />,
    );
    expect(screen.getByTestId("recording-replay-gaps")).toHaveTextContent(
      "At 2:00 in this recording",
    );
  });

  it("uses the not-recorded label for a legacy code", () => {
    render(
      <RecordingReplayGapList
        gaps={[sampleGap({ reasonCode: "not_recorded_in_preset_form" })]}
        loadError={null}
        artifact="audio"
      />,
    );
    expect(screen.getByTestId("recording-replay-gaps")).toHaveTextContent(
      "the reason was not recorded in preset form",
    );
  });

  it("announces a load failure without hiding the note", () => {
    render(
      <RecordingReplayGapList
        gaps={null}
        loadError="Gap information could not be loaded."
        artifact="audio"
      />,
    );
    expect(screen.getByTestId("recording-replay-gaps-error")).toHaveTextContent(
      "Gap information could not be loaded. Playback still works.",
    );
  });
});

describe("RecordingReplayPlayer · gap failure does not break playback", () => {
  beforeEach(() => {
    mockedStatus.mockReset();
    mockedGaps.mockReset();
    mockedStatus.mockResolvedValue({
      success: true,
      data: { available: true, hasVideo: false },
      meta: META,
    });
  });

  it("still offers play when the gap read fails", async () => {
    mockedGaps.mockRejectedValueOnce(new Error("network"));
    render(
      <RecordingReplayPlayer
        sessionId="sess-1"
        token="tok-1"
        callerRole="doctor"
      />,
    );
    expect(
      await screen.findByRole("button", { name: /play recording/i }),
    ).toBeInTheDocument();
    expect(
      await screen.findByTestId("recording-replay-gaps-error"),
    ).toHaveTextContent("Playback still works");
  });
});

describe("gap formatters", () => {
  it("formats duration and media offset without NaN", () => {
    expect(formatGapDuration(null)).toBe("duration not recorded");
    expect(formatGapDuration(1_000)).toBe("1 second not recorded");
    expect(formatGapDuration(240_000)).toBe("4 minutes not recorded");
    expect(formatMediaOffset(null)).toBeNull();
    expect(formatMediaOffset(300_000)).toBe("5:00");
  });
});
