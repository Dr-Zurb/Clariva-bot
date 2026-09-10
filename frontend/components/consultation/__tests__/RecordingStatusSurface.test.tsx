import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import RecordingStatusSurface, {
  AUDIO_ON_COPY,
  AUDIO_PAUSED_COPY,
  VIDEO_OFF_COPY,
  VIDEO_PAUSED_COPY,
  VIDEO_RECORDING_COPY,
  VIDEO_SETTLING_COPY,
  deriveVideoStatusKind,
  grantCountdownAnnouncement,
  videoStatusCopy,
} from "../RecordingStatusSurface";

const MATRIX: Array<{
  id: string;
  audioPaused: boolean;
  videoKind: "off" | "recording" | "paused" | "settling";
  seconds?: number | null;
  audio: string;
  video: string;
}> = [
  {
    id: "audio-on + no video",
    audioPaused: false,
    videoKind: "off",
    audio: AUDIO_ON_COPY,
    video: VIDEO_OFF_COPY,
  },
  {
    id: "audio-on + video recording",
    audioPaused: false,
    videoKind: "recording",
    seconds: 90,
    audio: AUDIO_ON_COPY,
    video: `${VIDEO_RECORDING_COPY} · 1:30`,
  },
  {
    id: "audio-on + video paused",
    audioPaused: false,
    videoKind: "paused",
    audio: AUDIO_ON_COPY,
    video: VIDEO_PAUSED_COPY,
  },
  {
    id: "audio-paused + video recording",
    audioPaused: true,
    videoKind: "recording",
    seconds: 45,
    audio: AUDIO_PAUSED_COPY,
    video: `${VIDEO_RECORDING_COPY} · 0:45`,
  },
  {
    id: "audio-paused + video paused",
    audioPaused: true,
    videoKind: "paused",
    audio: AUDIO_PAUSED_COPY,
    video: VIDEO_PAUSED_COPY,
  },
  {
    id: "settling",
    audioPaused: false,
    videoKind: "settling",
    audio: AUDIO_ON_COPY,
    video: VIDEO_SETTLING_COPY,
  },
];

describe("RecordingStatusSurface — rec-26 matrix", () => {
  it.each(MATRIX)("$id", ({ audioPaused, videoKind, seconds, audio, video }) => {
    render(
      <RecordingStatusSurface
        audioPaused={audioPaused}
        videoKind={videoKind}
        grantSecondsRemaining={seconds ?? null}
      />,
    );
    expect(screen.getByTestId("recording-status-audio")).toHaveTextContent(audio);
    expect(screen.getByTestId("recording-status-video")).toHaveTextContent(video);
    expect(screen.getByTestId("recording-status-surface")).not.toHaveTextContent(
      /rash|disclosure|because/i,
    );
  });

  it("never renders a free-text reason even if one is passed as a child accident", () => {
    render(
      <RecordingStatusSurface
        audioPaused={false}
        videoKind="recording"
        extra={<span>Need to see the rash on the left arm</span>}
      />,
    );
    // The surface itself has no reason field. A stray child is the
    // caller's problem; the audio/video lines stay code-owned.
    expect(screen.getByTestId("recording-status-audio")).not.toHaveTextContent(
      /rash/,
    );
    expect(screen.getByTestId("recording-status-video")).not.toHaveTextContent(
      /rash/,
    );
  });

  it("stopping video still shows audio being saved", () => {
    render(
      <RecordingStatusSurface audioPaused={false} videoKind="off" />,
    );
    expect(screen.getByTestId("recording-status-audio")).toHaveTextContent(
      AUDIO_ON_COPY,
    );
    expect(screen.getByTestId("recording-status-video")).toHaveTextContent(
      VIDEO_OFF_COPY,
    );
  });

  it("announces the grant clock at thresholds, not every second", () => {
    expect(grantCountdownAnnouncement(119, false)).toBeNull();
    expect(grantCountdownAnnouncement(60, false)).toBe(
      "One minute of video saving left.",
    );
    expect(grantCountdownAnnouncement(30, false)).toBe(
      "Thirty seconds of video saving left.",
    );
    expect(grantCountdownAnnouncement(10, false)).toBe(
      "Ten seconds of video saving left.",
    );
    expect(grantCountdownAnnouncement(9, false)).toBeNull();
    expect(grantCountdownAnnouncement(0, true)).toBe(
      "Video saving is stopping.",
    );
  });

  it("deriveVideoStatusKind maps the grant flags", () => {
    expect(
      deriveVideoStatusKind({
        videoActive: false,
        videoPaused: false,
        settling: false,
      }),
    ).toBe("off");
    expect(
      deriveVideoStatusKind({
        videoActive: true,
        videoPaused: false,
        settling: false,
      }),
    ).toBe("recording");
    expect(
      deriveVideoStatusKind({
        videoActive: true,
        videoPaused: true,
        settling: false,
      }),
    ).toBe("paused");
    expect(
      deriveVideoStatusKind({
        videoActive: true,
        videoPaused: false,
        settling: true,
      }),
    ).toBe("settling");
  });

  it("videoStatusCopy never mentions deletion", () => {
    const kinds = ["off", "recording", "paused", "settling"] as const;
    for (const kind of kinds) {
      expect(videoStatusCopy(kind, 40)).not.toMatch(
        /delet|eras|remov|won't keep/i,
      );
    }
  });
});
