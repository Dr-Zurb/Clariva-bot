"use client";

/**
 * `<RecordingReplayPlayer>` — the audio replay surface for a finished
 * consult (Plan 07 · Task 29 · Decision 4 + 10 LOCKED).
 *
 * Stream-only by design (Decision 10): we hand the signed URL to a
 * native HTML5 `<audio>` element with `controlsList="nodownload"` and
 * `disablePictureInPicture`. The audit log on the backend is the real
 * defense — every successful `mintReplayUrl` call writes a row even
 * before the URL hits the wire.
 *
 * Lifecycle:
 *   1. On mount → `getReplayStatus()` (preflight, no audit).
 *   2. If `available === true` → render the play button.
 *   3. On first play → `mintReplayAudioUrl()` (writes the audit row).
 *      The URL has a 15-min Twilio TTL; we re-mint transparently when
 *      the `<audio>` element fires `error` (typical signal for an
 *      expired signed URL).
 *   4. If `available === false` → render an empty-state matching
 *      `reason` (revoked / past window / not ready / not found).
 *
 * Watermark (Decision 4 mandate): a low-opacity overlay tagging the
 * caller (`patient` / `doctor`) over the player + a footer line that
 * says "Streaming only — do not share". This is intentionally weak —
 * the audit row is the audit row. The watermark is a friction layer +
 * a "you've been told this is logged" signal.
 *
 * Speed picker: 0.75× / 1× / 1.25× / 1.5× / 2×. Persisted to
 * `localStorage` so a doctor going through five consults in a row
 * doesn't reset the picker every time.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getRecordingGaps,
  getReplayStatus,
  mintReplayAudioUrl,
  type RecordingGap,
  type ReplayCompositionRef,
  type ReplayDenyReason,
  type ReplayStatusData,
} from "@/lib/api";
import { pauseReasonBannerLabel } from "./RecordingPausedIndicator";
import { getVideoReplayOtpState } from "@/lib/api/video-replay-otp";
import { formatDate, formatDateTime } from "@/lib/format-date";
import VideoReplayWarningModal from "./VideoReplayWarningModal";
import VideoReplayOtpModal from "./VideoReplayOtpModal";

const SPEED_STORAGE_KEY = "clariva.replay.playbackRate";
const SPEED_OPTIONS: ReadonlyArray<number> = [0.75, 1, 1.25, 1.5, 2];

/**
 * Which artifact the player is currently streaming. Default `'audio'`
 * even when video is available (Decision 10 — the default-to-audio
 * posture is the friction). Flipping to `'video'` requires traversing
 * the Warning → OTP → Mint flow; the component re-uses the same
 * mintReplayAudioUrl helper because the backend accepts `?artifactKind=video`.
 */
type ArtifactMode = "audio" | "video";

export interface RecordingReplayPlayerProps {
  sessionId: string;
  /**
   * Bearer token used against `/replay/audio/mint` and `/replay/status`.
   *   - Doctor: Supabase session JWT.
   *   - Patient: scoped JWT from `exchangeReplayToken()` (15-min TTL).
   */
  token: string;
  /**
   * Watermark + audit-copy hint. Drives empty-state copy too
   * (e.g. "contact support" only shows for patients).
   */
  callerRole: "doctor" | "patient";
  /**
   * Optional display name for the watermark. Defaults to the role
   * label when missing.
   */
  callerLabel?: string;
  className?: string;
}

type PlayerPhase =
  | { kind: "loading" }
  | { kind: "checking_error"; message: string }
  | { kind: "unavailable"; reason: ReplayDenyReason; selfServeExpiresAt?: string }
  | { kind: "ready"; selfServeExpiresAt?: string }
  | { kind: "minting" }
  | {
      kind: "playing";
      signedUrl: string;
      expiresAt: string;
      mode: ArtifactMode;
      compositionSid: string;
      selfServeExpiresAt?: string;
    }
  | { kind: "mint_error"; message: string; compositionSid: string; mode: ArtifactMode };

/**
 * Plan 08 · Task 44 · Decision 10 LOCKED — overlay video-toggle flow.
 *
 * `idle`        — no flow in progress. Toggle renders as "[ ] Show video".
 * `warning`     — warning modal is open.
 * `otp`         — OTP modal is open (either because the state preflight
 *                 said `required: true` or because the first mint attempt
 *                 came back with `video_otp_required`).
 * `minting`     — modals dismissed, we're calling mintReplayAudioUrl with
 *                 `?artifactKind=video`.
 */
type VideoFlowPhase =
  | { kind: "idle" }
  | { kind: "warning" }
  | { kind: "otp"; lastVerifiedAt: string | null }
  | { kind: "minting" };

function readStoredPlaybackRate(): number {
  if (typeof window === "undefined") return 1;
  try {
    const raw = window.localStorage.getItem(SPEED_STORAGE_KEY);
    if (!raw) return 1;
    const n = Number.parseFloat(raw);
    if (Number.isFinite(n) && SPEED_OPTIONS.includes(n)) return n;
  } catch {
    // ignored
  }
  return 1;
}

function persistPlaybackRate(rate: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SPEED_STORAGE_KEY, String(rate));
  } catch {
    // ignored
  }
}

function emptyStateCopy(
  reason: ReplayDenyReason,
  callerRole: "doctor" | "patient",
): { title: string; body: string } {
  switch (reason) {
    case "not_a_participant":
      return {
        title: "Not available",
        body: "You don't have access to this recording.",
      };
    case "beyond_self_serve_window":
      return {
        title: "Replay window has expired",
        body:
          callerRole === "patient"
            ? "The 90-day patient self-serve replay window has ended. Please contact the clinic for help."
            : "The patient self-serve replay window has ended. The recording itself may still exist for clinical retention — check the artifact registry.",
      };
    case "revoked":
      return {
        title: "Recording revoked",
        body:
          "This recording has been revoked and is no longer accessible. Contact support if you believe this is an error.",
      };
    case "artifact_not_ready":
      return {
        title: "Recording is still processing",
        body:
          "The audio is still being processed by our recording provider. Try again in a few minutes.",
      };
    case "artifact_not_found":
      return {
        title: "No recording was made",
        body:
          callerRole === "patient"
            ? "There is no recording for this consult. The doctor may have paused or disabled recording."
            : "There is no audio recording on file for this consult.",
      };
    default:
      return { title: "Not available", body: "Replay is not available." };
  }
}

export default function RecordingReplayPlayer(
  props: RecordingReplayPlayerProps,
): JSX.Element {
  const { sessionId, token, callerRole, callerLabel, className } = props;

  const [phase, setPhase] = useState<PlayerPhase>({ kind: "loading" });
  const [playbackRate, setPlaybackRate] = useState<number>(() =>
    readStoredPlaybackRate(),
  );
  const [videoFlow, setVideoFlow] = useState<VideoFlowPhase>({ kind: "idle" });
  // Timestamp used in the video watermark overlay. Set on video mint.
  const [videoReplayStartedAt, setVideoReplayStartedAt] = useState<string | null>(null);
  const [audioLegs, setAudioLegs] = useState<ReplayCompositionRef[]>([]);
  const [videoLegs, setVideoLegs] = useState<ReplayCompositionRef[]>([]);
  const [videoUnlocked, setVideoUnlocked] = useState(false);
  const [legError, setLegError] = useState<{ sid: string; message: string } | null>(
    null,
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [gaps, setGaps] = useState<RecordingGap[] | null>(null);
  const [gapsError, setGapsError] = useState<string | null>(null);
  const selfServeRef = useRef<string | undefined>(undefined);

  // ---------------------------------------------------------------------------
  // Mount: preflight (no audit).
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await getReplayStatus(token, sessionId);
        if (cancelled) return;
        const data = res.data as ReplayStatusData;
        if (data.available) {
          const nextAudio =
            data.audioCompositions && data.audioCompositions.length > 0
              ? data.audioCompositions
              : [{ compositionSid: "", startedAt: "", durationSeconds: null }];
          const nextVideo =
            data.videoCompositions && data.videoCompositions.length > 0
              ? data.videoCompositions
              : data.hasVideo
                ? [{ compositionSid: "", startedAt: "", durationSeconds: null }]
                : [];
          setAudioLegs(nextAudio);
          setVideoLegs(nextVideo);
          selfServeRef.current = data.selfServeExpiresAt;
          setPhase({
            kind: "ready",
            selfServeExpiresAt: data.selfServeExpiresAt,
          });
        } else {
          setPhase({
            kind: "unavailable",
            reason: (data.reason ?? "artifact_not_found") as ReplayDenyReason,
            selfServeExpiresAt: data.selfServeExpiresAt,
          });
        }
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error
            ? err.message
            : "Could not check whether the replay is available.";
        setPhase({ kind: "checking_error", message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, token]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await getRecordingGaps(token, sessionId);
        if (cancelled) return;
        setGaps(res.data.gaps);
        setGapsError(null);
      } catch {
        if (cancelled) return;
        setGaps(null);
        setGapsError("Gap information could not be loaded.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, token]);

  // ---------------------------------------------------------------------------
  // Mint helper (writes audit on the backend).
  // ---------------------------------------------------------------------------
  const hasVideoAvailable = videoLegs.length > 0;

  const currentMode: ArtifactMode = useMemo(() => {
    if (phase.kind === "playing") return phase.mode;
    return "audio";
  }, [phase]);

  const currentSelfServeExpiresAt: string | undefined = useMemo(() => {
    if (phase.kind === "ready") return phase.selfServeExpiresAt;
    if (phase.kind === "playing") return phase.selfServeExpiresAt;
    if (phase.kind === "mint_error") return selfServeRef.current;
    return selfServeRef.current;
  }, [phase]);

  const mintAndPlay = useCallback(
    async (mode: ArtifactMode = "audio", compositionSid?: string) => {
      const sid = compositionSid?.trim() ?? "";
      setPhase({ kind: "minting" });
      setLegError(null);
      try {
        const res = await mintReplayAudioUrl(
          token,
          sessionId,
          mode,
          sid || undefined,
        );
        const data = res.data;
        if (mode === "video") {
          setVideoReplayStartedAt(new Date().toISOString());
          setVideoUnlocked(true);
        }
        setPhase({
          kind: "playing",
          signedUrl: data.signedUrl,
          expiresAt: data.expiresAt,
          mode,
          compositionSid: sid || data.artifactRef || "",
          selfServeExpiresAt: currentSelfServeExpiresAt,
        });
      } catch (err) {
        const e = err as Error & {
          status?: number;
          code?: string;
          details?: Record<string, unknown>;
        };
        if (e.code === "video_otp_required") {
          const raw = e.details?.lastVerifiedAt;
          const lastVerifiedAt =
            typeof raw === "string" ? raw : raw === null ? null : null;
          setVideoFlow({ kind: "otp", lastVerifiedAt });
          setPhase({
            kind: "ready",
            ...(currentSelfServeExpiresAt
              ? { selfServeExpiresAt: currentSelfServeExpiresAt }
              : {}),
          });
          return;
        }
        if (e.code === "beyond_self_serve_window" || e.code === "not_a_participant") {
          setPhase({ kind: "unavailable", reason: e.code });
          return;
        }
        const message =
          e.status === 429
            ? "You've requested replay too many times. Please wait a few minutes."
            : e.message || "Could not load the recording.";
        const multi =
          (mode === "audio" ? audioLegs.length : videoLegs.length) > 1;
        if (multi || e.code === "artifact_not_found" || e.code === "revoked" || e.code === "artifact_not_ready" || e.code === "no_video_artifact") {
          if (e.code === "no_video_artifact" && videoLegs.length <= 1) {
            setVideoFlow({ kind: "idle" });
            setVideoUnlocked(false);
          }
          setLegError({ sid, message });
          setPhase({
            kind: "mint_error",
            message,
            compositionSid: sid,
            mode,
          });
          return;
        }
        setPhase({ kind: "mint_error", message, compositionSid: sid, mode });
      }
    },
    [audioLegs.length, currentSelfServeExpiresAt, sessionId, token, videoLegs.length],
  );

  // ---------------------------------------------------------------------------
  // Video toggle flow orchestration (Plan 08 · Task 44 · Decision 10 LOCKED).
  // ---------------------------------------------------------------------------
  const handleToggleShowVideo = useCallback(() => {
    if (currentMode === "video" || videoUnlocked) {
      setVideoReplayStartedAt(null);
      setVideoUnlocked(false);
      const firstAudio = audioLegs[0]?.compositionSid;
      void mintAndPlay("audio", firstAudio || undefined);
      return;
    }
    setVideoFlow({ kind: "warning" });
  }, [audioLegs, currentMode, mintAndPlay, videoUnlocked]);

  const handleWarningCancel = useCallback(() => {
    setVideoFlow({ kind: "idle" });
  }, []);

  const handleWarningContinue = useCallback(async () => {
    // For doctors, skip OTP + go straight to mint; the backend OTP
    // gate is patient-only.
    if (callerRole !== "patient") {
      setVideoFlow({ kind: "idle" });
      if (videoLegs.length > 1) {
        setVideoUnlocked(true);
        setPhase({
          kind: "ready",
          ...(currentSelfServeExpiresAt
            ? { selfServeExpiresAt: currentSelfServeExpiresAt }
            : {}),
        });
        return;
      }
      setVideoFlow({ kind: "minting" });
      await mintAndPlay("video", videoLegs[0]?.compositionSid || undefined);
      setVideoFlow({ kind: "idle" });
      return;
    }
    // Preflight the OTP state so we skip the modal when the patient
    // is already inside the 30-day window.
    setVideoFlow({ kind: "minting" });
    try {
      const res = await getVideoReplayOtpState(token, sessionId);
      if (!res.data.required) {
        setVideoFlow({ kind: "idle" });
        if (videoLegs.length > 1) {
          setVideoUnlocked(true);
          return;
        }
        await mintAndPlay("video", videoLegs[0]?.compositionSid || undefined);
        return;
      }
      setVideoFlow({ kind: "otp", lastVerifiedAt: res.data.lastVerifiedAt });
    } catch {
      // Fail-open to the OTP modal: the modal itself will try to
      // send an OTP and surface a specific error if that fails.
      setVideoFlow({ kind: "otp", lastVerifiedAt: null });
    }
  }, [callerRole, currentSelfServeExpiresAt, mintAndPlay, sessionId, token, videoLegs]);

  const handleOtpCancel = useCallback(() => {
    setVideoFlow({ kind: "idle" });
  }, []);

  const handleOtpVerified = useCallback(async () => {
    setVideoFlow({ kind: "idle" });
    if (videoLegs.length > 1) {
      setVideoUnlocked(true);
      return;
    }
    setVideoFlow({ kind: "minting" });
    await mintAndPlay("video", videoLegs[0]?.compositionSid || undefined);
    setVideoFlow({ kind: "idle" });
  }, [mintAndPlay, videoLegs]);

  // ---------------------------------------------------------------------------
  // Apply persisted playback rate whenever the playing element appears.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (phase.kind !== "playing") return;
    const el: HTMLMediaElement | null =
      phase.mode === "video" ? videoRef.current : audioRef.current;
    if (!el) return;
    el.playbackRate = playbackRate;
    void el.play().catch(() => {
      // Autoplay is allowed here because this is a user-initiated mint
      // flow; if the browser still rejects it, the user can hit play
      // on the native control.
    });
  }, [phase, playbackRate]);

  const handleSpeedChange = useCallback(
    (rate: number) => {
      setPlaybackRate(rate);
      persistPlaybackRate(rate);
      const el: HTMLMediaElement | null =
        (phase.kind === "playing" && phase.mode === "video"
          ? videoRef.current
          : audioRef.current);
      if (el) el.playbackRate = rate;
    },
    [phase],
  );

  // ---------------------------------------------------------------------------
  // Re-mint on signed-URL expiry. Twilio's CDN returns 403 once the URL
  // is past its `Ttl=`; the <audio>/<video> element surfaces that as
  // `error`. Re-mint in the SAME mode the player is currently showing
  // — the patient shouldn't silently drop from video back to audio on
  // a URL TTL expiry (that would be invisible surveillance exposure
  // through a failure mode).
  // ---------------------------------------------------------------------------
  const handleMediaError = useCallback(() => {
    if (phase.kind !== "playing") return;
    void mintAndPlay(phase.mode, phase.compositionSid || undefined);
  }, [phase, mintAndPlay]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const watermarkLabel = useMemo(() => {
    const fallback = callerRole === "doctor" ? "Doctor view" : "Patient view";
    return (callerLabel ?? "").trim() || fallback;
  }, [callerLabel, callerRole]);

  const videoWatermarkLabel = useMemo(() => {
    const ts = videoReplayStartedAt
      ? formatDateTime(videoReplayStartedAt)
      : formatDateTime(new Date());
    return `${watermarkLabel} · ${ts}`;
  }, [videoReplayStartedAt, watermarkLabel]);

  return (
    <section
      aria-labelledby={`replay-${sessionId}-heading`}
      className={[
        "rounded-lg border border-gray-200 bg-white p-4 shadow-sm",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="flex items-baseline justify-between gap-2">
        <h3
          id={`replay-${sessionId}-heading`}
          className="text-sm font-semibold text-gray-900"
        >
          {currentMode === "video" ? "Video recording" : "Audio recording"}
        </h3>
        <span className="text-[11px] uppercase tracking-wide text-gray-400">
          Stream only
        </span>
      </header>

      {/*
        Plan 08 · Task 44 · Decision 10 LOCKED — "Show video" toggle.
        Rendered when at least one completed video composition exists
        (`hasVideo` on the status preflight). Kept out of the central
        player column so the audio empty-states keep their visual
        real estate — the toggle is a small affordance, not a primary
        CTA, matching Decision 10's "audio-is-the-default" posture.
      */}
      {hasVideoAvailable &&
        (phase.kind === "ready" ||
          phase.kind === "playing" ||
          phase.kind === "mint_error") && (
        <div className="mt-2 flex items-center justify-between rounded-md border border-gray-100 bg-gray-50 px-3 py-1.5 text-xs text-gray-700">
          <span className="flex items-center gap-1.5">
            <span aria-hidden>🎥</span>
            <span>
              {videoLegs.length > 1
                ? `${videoLegs.length} video parts of this consult`
                : "Video version available"}
            </span>
          </span>
          <label className="inline-flex cursor-pointer items-center gap-2 select-none">
            <input
              type="checkbox"
              checked={currentMode === "video" || videoUnlocked}
              onChange={handleToggleShowVideo}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Show video</span>
          </label>
        </div>
      )}

      <div className="relative mt-3">
        {/* Watermark overlay — pointer-events-none so it never blocks
            the native media control surface. For video playback the
            overlay extends to a corner timestamp + name so a screen-
            recorded copy carries attribution. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center select-none"
        >
          <span className="rotate-[-12deg] text-[10px] font-semibold uppercase tracking-[0.25em] text-gray-300/70">
            {watermarkLabel} · {sessionId.slice(0, 8)}
          </span>
        </div>

        {phase.kind === "loading" && (
          <p className="text-sm text-gray-500">Checking availability…</p>
        )}

        {phase.kind === "checking_error" && (
          <p role="alert" className="text-sm text-red-600">
            {phase.message}
          </p>
        )}

        {phase.kind === "unavailable" && (
          <UnavailableBlock reason={phase.reason} callerRole={callerRole} />
        )}

        {(phase.kind === "ready" ||
          phase.kind === "playing" ||
          phase.kind === "mint_error") &&
          videoUnlocked &&
          videoLegs.length > 1 && (
          <CompositionLegList
            kind="video"
            legs={videoLegs}
            activeSid={
              phase.kind === "playing" && phase.mode === "video"
                ? phase.compositionSid
                : null
            }
            errorSid={legError?.sid ?? null}
            errorMessage={legError?.message ?? null}
            onSelect={(sid) => void mintAndPlay("video", sid || undefined)}
          />
        )}

        {(phase.kind === "ready" ||
          phase.kind === "playing" ||
          phase.kind === "mint_error") &&
          !videoUnlocked &&
          currentMode !== "video" &&
          audioLegs.length > 1 && (
          <CompositionLegList
            kind="audio"
            legs={audioLegs}
            activeSid={
              phase.kind === "playing" && phase.mode === "audio"
                ? phase.compositionSid
                : null
            }
            errorSid={legError?.sid ?? null}
            errorMessage={legError?.message ?? null}
            onSelect={(sid) => void mintAndPlay("audio", sid || undefined)}
          />
        )}

        {phase.kind === "ready" &&
          !videoUnlocked &&
          audioLegs.length <= 1 && (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() =>
                void mintAndPlay("audio", audioLegs[0]?.compositionSid || undefined)
              }
              className="inline-flex w-full items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Play recording
            </button>
            {phase.selfServeExpiresAt && callerRole === "patient" && (
              <p className="text-[11px] text-gray-500">
                Available until {formatDate(phase.selfServeExpiresAt)}.
              </p>
            )}
          </div>
        )}

        {phase.kind === "minting" && (
          <p className="text-sm text-gray-500">Loading recording…</p>
        )}

        {phase.kind === "mint_error" && audioLegs.length <= 1 && !videoUnlocked && (
          <div className="flex flex-col gap-2">
            <p role="alert" className="text-sm text-red-600">
              {phase.message}
            </p>
            <button
              type="button"
              onClick={() =>
                void mintAndPlay(phase.mode, phase.compositionSid || undefined)
              }
              className="self-start rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Try again
            </button>
          </div>
        )}

        {phase.kind === "playing" && phase.mode === "audio" && (
          <div className="flex flex-col gap-3">
            <audio
              ref={audioRef}
              src={phase.signedUrl}
              controls
              controlsList="nodownload noplaybackrate"
              onError={handleMediaError}
              className="w-full"
              preload="metadata"
            >
              Your browser does not support the audio element.
            </audio>

            <SpeedPicker
              rate={playbackRate}
              onChange={handleSpeedChange}
            />
            <RecordingReplayGapList
              gaps={gaps}
              loadError={gapsError}
              artifact="audio"
            />
          </div>
        )}

        {phase.kind === "playing" && phase.mode === "video" && (
          <div className="flex flex-col gap-3">
            <div className="relative overflow-hidden rounded-md bg-black">
              <video
                ref={videoRef}
                src={phase.signedUrl}
                controls
                controlsList="nodownload noplaybackrate nofullscreen"
                disablePictureInPicture
                onError={handleMediaError}
                playsInline
                className="w-full"
                preload="metadata"
              >
                Your browser does not support the video element.
              </video>
              {/*
                Corner watermark for the video surface. Higher-contrast
                than the centered audio watermark so screen-recorded
                captures carry attribution; still `pointer-events-none`
                so it can't intercept scrub clicks.
              */}
              <div
                aria-hidden
                className="pointer-events-none absolute bottom-2 right-2 rounded-sm bg-black/40 px-2 py-0.5 text-[10px] font-medium text-white/90 select-none"
              >
                {videoWatermarkLabel}
              </div>
            </div>

            <SpeedPicker
              rate={playbackRate}
              onChange={handleSpeedChange}
            />

            <p className="text-[11px] text-amber-700">
              🎥 Video replay is logged. Your doctor will see a
              &ldquo;patient watched the video&rdquo; entry on their
              dashboard.
            </p>
            <RecordingReplayGapList
              gaps={gaps}
              loadError={gapsError}
              artifact="video"
            />
          </div>
        )}

        {phase.kind !== "playing" ? (
          <RecordingReplayGapList
            gaps={gaps}
            loadError={gapsError}
            artifact="audio"
          />
        ) : null}
      </div>

      <footer className="mt-3 border-t border-gray-100 pt-2 text-[11px] leading-relaxed text-gray-500">
        Streaming only · do not share. Every play is logged for clinical
        compliance.
      </footer>

      <VideoReplayWarningModal
        open={videoFlow.kind === "warning"}
        onCancel={handleWarningCancel}
        onContinue={() => void handleWarningContinue()}
      />
      <VideoReplayOtpModal
        open={videoFlow.kind === "otp"}
        token={token}
        sessionId={sessionId}
        lastVerifiedAt={
          videoFlow.kind === "otp" ? videoFlow.lastVerifiedAt : null
        }
        onCancel={handleOtpCancel}
        onVerified={() => void handleOtpVerified()}
      />
    </section>
  );
}

export function formatGapDuration(durationMs: number | null): string {
  if (durationMs == null || durationMs < 0) return "duration not recorded";
  const totalSec = Math.max(0, Math.round(durationMs / 1000));
  if (totalSec < 60) {
    return `${totalSec} second${totalSec === 1 ? "" : "s"} not recorded`;
  }
  const minutes = Math.round(totalSec / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"} not recorded`;
}

export function formatMediaOffset(offsetMs: number | null): string | null {
  if (offsetMs == null || !Number.isFinite(offsetMs) || offsetMs < 0) return null;
  const totalSec = Math.floor(offsetMs / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function gapActorLabel(role: RecordingGap["actorRole"]): string {
  if (role === "patient") return "Patient";
  if (role === "system") return "System";
  return "Doctor";
}

export function RecordingReplayGapList({
  gaps,
  loadError,
  artifact,
}: {
  gaps: RecordingGap[] | null;
  loadError: string | null;
  artifact: "audio" | "video";
}): JSX.Element | null {
  if (loadError) {
    return (
      <p
        role="status"
        data-testid="recording-replay-gaps-error"
        className="text-xs text-amber-800"
      >
        {loadError} Playback still works.
      </p>
    );
  }
  if (!gaps || gaps.length === 0) return null;

  return (
    <div
      data-testid="recording-replay-gaps"
      className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
    >
      <p className="text-xs font-medium text-slate-700">
        Recording gaps
      </p>
      <ol className="mt-1 list-none space-y-1">
        {gaps.map((gap, index) => {
          const offset = formatMediaOffset(gap.mediaOffsetMs[artifact]);
          const reason = pauseReasonBannerLabel(gap.reasonCode);
          const duration = formatGapDuration(gap.durationMs);
          const when = offset
            ? `At ${offset} in this recording`
            : "During this consult (position unknown)";
          return (
            <li
              key={`${gap.wallStartedAt}-${index}`}
              tabIndex={0}
              className="rounded-sm px-1 py-0.5 text-xs text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600"
            >
              {when}
              {" — "}
              {gapActorLabel(gap.actorRole)}
              {" · "}
              {reason}
              {" · "}
              {duration}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function formatLegDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) {
    return "duration unknown";
  }
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function CompositionLegList(props: {
  kind: ArtifactMode;
  legs: ReplayCompositionRef[];
  activeSid: string | null;
  errorSid: string | null;
  errorMessage: string | null;
  onSelect: (compositionSid: string) => void;
}): JSX.Element {
  return (
    <div
      data-testid={`replay-${props.kind}-legs`}
      className="mb-3 flex flex-col gap-1.5"
    >
      <p className="text-xs font-medium text-gray-600">
        Consecutive {props.kind} parts of this consult
      </p>
      <ol className="flex flex-col gap-1">
        {props.legs.map((leg, index) => {
          const selected = Boolean(props.activeSid) && props.activeSid === leg.compositionSid;
          const failed = Boolean(props.errorSid) && props.errorSid === leg.compositionSid;
          return (
            <li key={leg.compositionSid || `leg-${index}`}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => props.onSelect(leg.compositionSid)}
                className={[
                  "flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-xs",
                  selected
                    ? "border-blue-600 bg-blue-50 text-blue-900"
                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
                ].join(" ")}
              >
                <span>
                  Part {index + 1} of {props.legs.length}
                </span>
                <span className="text-gray-500">{formatLegDuration(leg.durationSeconds)}</span>
              </button>
              {failed && props.errorMessage ? (
                <p role="alert" className="mt-1 text-xs text-red-600">
                  {props.errorMessage}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function SpeedPicker(props: {
  rate: number;
  onChange: (rate: number) => void;
}): JSX.Element {
  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-600">
      <span className="mr-1 font-medium">Speed</span>
      {SPEED_OPTIONS.map((rate) => (
        <button
          key={rate}
          type="button"
          aria-pressed={rate === props.rate}
          onClick={() => props.onChange(rate)}
          className={[
            "rounded-md px-2 py-1",
            rate === props.rate
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200",
          ].join(" ")}
        >
          {rate}×
        </button>
      ))}
    </div>
  );
}

function UnavailableBlock(props: {
  reason: ReplayDenyReason;
  callerRole: "doctor" | "patient";
}): JSX.Element {
  const copy = emptyStateCopy(props.reason, props.callerRole);
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-md border border-amber-200 bg-amber-50 p-3"
    >
      <p className="text-sm font-medium text-amber-900">{copy.title}</p>
      <p className="mt-1 text-xs text-amber-800">{copy.body}</p>
    </div>
  );
}
