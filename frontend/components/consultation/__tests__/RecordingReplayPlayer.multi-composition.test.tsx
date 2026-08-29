import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import RecordingReplayPlayer from "../RecordingReplayPlayer";
import {
  getRecordingGaps,
  getReplayStatus,
  mintReplayAudioUrl,
  type ReplayCompositionRef,
} from "@/lib/api";

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
const mockedMint = vi.mocked(mintReplayAudioUrl);

const META = { timestamp: "2026-08-20T00:00:00.000Z", requestId: "r29" };

const SID_A = "CJaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SID_B = "CJbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const SID_C = "CJcccccccccccccccccccccccccccccccc";

function audioLeg(
  sid: string,
  startedAt: string,
  durationSeconds: number,
): ReplayCompositionRef {
  return { compositionSid: sid, startedAt, durationSeconds };
}

beforeEach(() => {
  mockedStatus.mockReset();
  mockedGaps.mockReset();
  mockedMint.mockReset();
  mockedGaps.mockResolvedValue({
    success: true,
    data: { schemaVersion: 1, gaps: [] },
    meta: META,
  });
  mockedMint.mockImplementation(async (_token, _session, _kind, sid) => ({
    success: true,
    data: {
      signedUrl: `https://signed.example/${sid || SID_A}`,
      expiresAt: "2026-08-20T10:15:00.000Z",
      artifactRef: sid || SID_A,
    },
    meta: META,
  }));
  Object.defineProperty(window.HTMLMediaElement.prototype, "play", {
    configurable: true,
    writable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
});

describe("RecordingReplayPlayer · rec-29 multi-composition", () => {
  it("offers three video parts in startedAt order after the existing video gate", async () => {
    mockedStatus.mockResolvedValue({
      success: true,
      data: {
        available: true,
        audioCompositions: [audioLeg(SID_A, "2026-08-20T10:00:00.000Z", 180)],
        videoCompositions: [
          audioLeg(SID_A, "2026-08-20T10:00:00.000Z", 90),
          audioLeg(SID_B, "2026-08-20T10:03:00.000Z", 50),
          audioLeg(SID_C, "2026-08-20T10:06:00.000Z", 40),
        ],
        hasVideo: true,
      },
      meta: META,
    });
    render(
      <RecordingReplayPlayer
        sessionId="sess-1"
        token="tok-1"
        callerRole="doctor"
      />,
    );

    expect(await screen.findByRole("button", { name: /play recording/i })).toBeInTheDocument();
    expect(screen.queryByTestId("replay-video-legs")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Show video"));
    fireEvent.click(await screen.findByRole("button", { name: /continue to video/i }));

    const list = await screen.findByTestId("replay-video-legs");
    expect(list).toHaveTextContent("Part 1 of 3");
    expect(list).toHaveTextContent("Part 2 of 3");
    expect(list).toHaveTextContent("Part 3 of 3");
    expect(list).toHaveTextContent("1:30");
    expect(list).toHaveTextContent("0:50");
    expect(list).toHaveTextContent("0:40");
    expect(mockedMint).not.toHaveBeenCalled();
  });

  it("keeps the single-audio surface identical — no Part 1 of 1 chrome", async () => {
    mockedStatus.mockResolvedValue({
      success: true,
      data: {
        available: true,
        audioCompositions: [audioLeg(SID_A, "2026-08-20T10:00:00.000Z", 180)],
        videoCompositions: [],
        hasVideo: false,
      },
      meta: META,
    });
    render(
      <RecordingReplayPlayer
        sessionId="sess-1"
        token="tok-1"
        callerRole="doctor"
      />,
    );
    expect(await screen.findByRole("button", { name: /play recording/i })).toBeInTheDocument();
    expect(screen.queryByTestId("replay-audio-legs")).not.toBeInTheDocument();
    expect(screen.queryByText(/part 1 of 1/i)).not.toBeInTheDocument();
  });

  it("does not offer compositions the status payload omitted (non-completed)", async () => {
    mockedStatus.mockResolvedValue({
      success: true,
      data: {
        available: true,
        audioCompositions: [audioLeg(SID_A, "2026-08-20T10:00:00.000Z", 60)],
        videoCompositions: [audioLeg(SID_B, "2026-08-20T10:03:00.000Z", 50)],
        hasVideo: true,
      },
      meta: META,
    });
    render(
      <RecordingReplayPlayer
        sessionId="sess-1"
        token="tok-1"
        callerRole="doctor"
      />,
    );
    expect(await screen.findByRole("button", { name: /play recording/i })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Show video"));
    fireEvent.click(await screen.findByRole("button", { name: /continue to video/i }));
    await waitFor(() => {
      expect(mockedMint).toHaveBeenCalledWith("tok-1", "sess-1", "video", SID_B);
    });
    expect(screen.queryByText(/part 2 of/i)).not.toBeInTheDocument();
  });

  it("keeps other legs playable when one mint fails", async () => {
    mockedStatus.mockResolvedValue({
      success: true,
      data: {
        available: true,
        audioCompositions: [
          audioLeg(SID_A, "2026-08-20T10:00:00.000Z", 60),
          audioLeg(SID_B, "2026-08-20T10:03:00.000Z", 45),
        ],
        videoCompositions: [],
        hasVideo: false,
      },
      meta: META,
    });
    const fail = Object.assign(new Error("This recording has been deleted at the provider"), {
      code: "artifact_not_found",
    });
    mockedMint.mockRejectedValueOnce(fail).mockResolvedValueOnce({
      success: true,
      data: {
        signedUrl: `https://signed.example/${SID_B}`,
        expiresAt: "2026-08-20T10:15:00.000Z",
        artifactRef: SID_B,
      },
      meta: META,
    });

    render(
      <RecordingReplayPlayer
        sessionId="sess-1"
        token="tok-1"
        callerRole="doctor"
      />,
    );

    const part1 = await screen.findByRole("button", { name: /part 1 of 2/i });
    fireEvent.click(part1);
    expect(
      await screen.findByText("This recording has been deleted at the provider"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /part 2 of 2/i }));
    await waitFor(() => {
      expect(mockedMint).toHaveBeenLastCalledWith("tok-1", "sess-1", "audio", SID_B);
    });
  });

  it("keeps playback rate across a composition switch", async () => {
    mockedStatus.mockResolvedValue({
      success: true,
      data: {
        available: true,
        audioCompositions: [
          audioLeg(SID_A, "2026-08-20T10:00:00.000Z", 60),
          audioLeg(SID_B, "2026-08-20T10:03:00.000Z", 45),
        ],
        videoCompositions: [],
        hasVideo: false,
      },
      meta: META,
    });
    render(
      <RecordingReplayPlayer
        sessionId="sess-1"
        token="tok-1"
        callerRole="doctor"
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /part 1 of 2/i }));
    const rateBtn = await screen.findByRole("button", { name: "1.5×" });
    fireEvent.click(rateBtn);

    fireEvent.click(screen.getByRole("button", { name: /part 2 of 2/i }));
    await waitFor(() => {
      expect(mockedMint).toHaveBeenLastCalledWith("tok-1", "sess-1", "audio", SID_B);
    });
    expect(screen.getByRole("button", { name: "1.5×" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
