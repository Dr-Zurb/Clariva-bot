"use client";

import type { ReactNode } from "react";

/**
 * rec-26 — one recording-status surface. Audio (disclosed mandate)
 * and video (bounded patient grant) are independent lines. No free
 * text. A third control (patient audio pause) slots in without a
 * rewrite.
 */

export type VideoStatusKind = "off" | "recording" | "paused" | "settling";

export const AUDIO_ON_COPY = "Audio is being saved";
export const AUDIO_PAUSED_COPY = "Audio recording paused";
export const VIDEO_OFF_COPY = "Video is not being saved";
export const VIDEO_RECORDING_COPY = "Saving video";
export const VIDEO_PAUSED_COPY = "Video paused — you can resume";
export const VIDEO_SETTLING_COPY = "Stopping video…";

export function formatGrantClock(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Announce at thresholds, not every tick (rec-26 §4.1). */
export function grantCountdownAnnouncement(
  secondsRemaining: number | null,
  settling: boolean,
): string | null {
  if (settling) return "Video saving is stopping.";
  if (secondsRemaining === null) return null;
  if (secondsRemaining === 60) return "One minute of video saving left.";
  if (secondsRemaining === 30) return "Thirty seconds of video saving left.";
  if (secondsRemaining === 10) return "Ten seconds of video saving left.";
  return null;
}

export function audioStatusCopy(paused: boolean): string {
  return paused ? AUDIO_PAUSED_COPY : AUDIO_ON_COPY;
}

export function videoStatusCopy(
  kind: VideoStatusKind,
  secondsRemaining: number | null,
): string {
  if (kind === "settling") return VIDEO_SETTLING_COPY;
  if (kind === "paused") return VIDEO_PAUSED_COPY;
  if (kind === "off") return VIDEO_OFF_COPY;
  if (secondsRemaining !== null) {
    return `${VIDEO_RECORDING_COPY} · ${formatGrantClock(secondsRemaining)}`;
  }
  return VIDEO_RECORDING_COPY;
}

export interface RecordingStatusSurfaceProps {
  audioPaused: boolean;
  videoKind: VideoStatusKind;
  grantSecondsRemaining?: number | null;
  /** Video pause / stop / resume. Surface does not own behaviour. */
  videoControls?: ReactNode;
  /**
   * Future patient audio-pause (p3 REC-D15). Rendered today when
   * provided; omitted is correct.
   */
  audioControls?: ReactNode;
  extra?: ReactNode;
  className?: string;
}

export default function RecordingStatusSurface({
  audioPaused,
  videoKind,
  grantSecondsRemaining = null,
  videoControls,
  audioControls,
  extra,
  className,
}: RecordingStatusSurfaceProps): JSX.Element {
  const audioCopy = audioStatusCopy(audioPaused);
  const videoCopy = videoStatusCopy(videoKind, grantSecondsRemaining);
  const announcement = grantCountdownAnnouncement(
    grantSecondsRemaining,
    videoKind === "settling",
  );

  return (
    <div
      data-testid="recording-status-surface"
      className={[
        "pointer-events-auto flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-white/95 p-2 text-xs text-slate-800 shadow-md backdrop-blur-sm",
        className ?? "",
      ].join(" ")}
    >
      <div
        data-testid="recording-status-audio"
        className="flex items-center gap-2"
      >
        <span aria-hidden="true" className="font-semibold text-slate-500">
          Audio
        </span>
        <span role="status" aria-live="polite">
          {audioCopy}
        </span>
        {audioControls}
      </div>
      <div
        data-testid="recording-status-video"
        className="flex flex-wrap items-center gap-2"
      >
        <span aria-hidden="true" className="font-semibold text-slate-500">
          Video
        </span>
        <span
          role="status"
          aria-live="polite"
          className={
            videoKind === "settling" || videoKind === "recording"
              ? "motion-reduce:animate-none"
              : undefined
          }
        >
          <span aria-hidden={Boolean(announcement)}>{videoCopy}</span>
          {announcement ? (
            <span className="sr-only">{announcement}</span>
          ) : null}
        </span>
        {videoControls}
      </div>
      {extra}
    </div>
  );
}

export function deriveVideoStatusKind(args: {
  videoActive: boolean;
  videoPaused: boolean;
  settling: boolean;
}): VideoStatusKind {
  if (args.settling) return "settling";
  if (!args.videoActive) return "off";
  if (args.videoPaused) return "paused";
  return "recording";
}
