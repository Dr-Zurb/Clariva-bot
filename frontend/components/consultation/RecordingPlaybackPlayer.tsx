"use client";

/**
 * voice-B6 · Lightweight post-call audio playback.
 *
 * Read-only surface for the post-call summary CTA. Uses native
 * `<audio controls>` (accessible, keyboard-friendly). Plan 07 mints
 * the signed URL via `getReplayUrl()` before this component mounts.
 *
 * For video + OTP + watermark flows, use `<RecordingReplayPlayer>`.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { todayLocalIso } from "@/lib/dates";

export interface RecordingPlaybackPlayerProps {
  /** Pre-minted signed URL (Twilio CDN). */
  replayUrl: string;
  /** Header line, e.g. "Recording — Dr. Sharma · 29 Apr 2026 · 24m 13s". */
  title: string;
  /** Session id — used for download filename only. */
  sessionId: string;
  /** ISO date for download filename (`consult-{id}-{date}.mp3`). */
  consultEndedAt?: string | null;
  /** Doctor-only download affordance (voice-B6). */
  showDownload?: boolean;
  /** Re-fetch a fresh signed URL (TTL expiry / mint failure). */
  onRetry?: () => void;
  onClose: () => void;
  className?: string;
}

type BufferPhase = "loading" | "ready" | "error";

function downloadFilename(sessionId: string, consultEndedAt?: string | null): string {
  const datePart = consultEndedAt
    ? consultEndedAt.slice(0, 10)
    : todayLocalIso();
  return `consult-${sessionId.slice(0, 8)}-${datePart}.mp3`;
}

export default function RecordingPlaybackPlayer({
  replayUrl,
  title,
  sessionId,
  consultEndedAt,
  showDownload = false,
  onRetry,
  onClose,
  className,
}: RecordingPlaybackPlayerProps): JSX.Element {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [bufferPhase, setBufferPhase] = useState<BufferPhase>("loading");

  useEffect(() => {
    setBufferPhase("loading");
  }, [replayUrl]);

  const handleCanPlay = useCallback(() => {
    setBufferPhase("ready");
  }, []);

  const handleMediaError = useCallback(() => {
    setBufferPhase("error");
  }, []);

  const handleDownload = useCallback(() => {
    const anchor = document.createElement("a");
    anchor.href = replayUrl;
    anchor.download = downloadFilename(sessionId, consultEndedAt);
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }, [consultEndedAt, replayUrl, sessionId]);

  return (
    <div
      className={[
        "rounded-md border border-gray-200 bg-gray-50 p-3",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label="Recording playback"
    >
      <p className="text-sm font-medium text-gray-900">{title}</p>

      <div className="mt-2">
        {bufferPhase === "loading" && (
          <p className="flex items-center gap-2 text-sm text-gray-600" aria-live="polite">
            <span
              className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600"
              aria-hidden
            />
            Loading…
          </p>
        )}

        {bufferPhase === "error" && (
          <div className="flex flex-col gap-2" role="alert">
            <p className="text-sm text-red-700">Recording unavailable</p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="self-start rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Retry
              </button>
            ) : null}
          </div>
        )}

        <audio
          ref={audioRef}
          src={replayUrl}
          controls
          preload="metadata"
          onCanPlay={handleCanPlay}
          onLoadedData={handleCanPlay}
          onError={handleMediaError}
          className={bufferPhase === "error" ? "hidden" : "mt-1 w-full"}
        >
          Your browser does not support the audio element.
        </audio>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {showDownload ? (
          <button
            type="button"
            onClick={handleDownload}
            disabled={bufferPhase === "error"}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Download
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Close
        </button>
      </div>
    </div>
  );
}
