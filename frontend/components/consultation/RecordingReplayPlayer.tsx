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
  getReplayStatus,
  mintReplayAudioUrl,
  type ReplayDenyReason,
  type ReplayStatusData,
} from "@/lib/api";
import { getVideoReplayOtpState } from "@/lib/api/video-replay-otp";
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
  | { kind: "ready"; selfServeExpiresAt?: string; hasVideo: boolean }
  | { kind: "minting" }
  | {
      kind: "playing";
      signedUrl: string;
      expiresAt: string;
      mode: ArtifactMode;
      hasVideo: boolean;
      selfServeExpiresAt?: string;
    }
  | { kind: "mint_error"; message: string };

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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

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
          setPhase({
            kind: "ready",
            selfServeExpiresAt: data.selfServeExpiresAt,
            hasVideo: Boolean(data.hasVideo),
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

  // ---------------------------------------------------------------------------
  // Mint helper (writes audit on the backend).
  // ---------------------------------------------------------------------------
  const hasVideoAvailable = useMemo(() => {
    if (phase.kind === "ready") return phase.hasVideo;
    if (phase.kind === "playing") return phase.hasVideo;
    return false;
  }, [phase]);

  const currentMode: ArtifactMode = useMemo(() => {
    if (phase.kind === "playing") return phase.mode;
    return "audio";
  }, [phase]);

  const currentSelfServeExpiresAt: string | undefined = useMemo(() => {
    if (phase.kind === "ready") return phase.selfServeExpiresAt;
    if (phase.kind === "playing") return phase.selfServeExpiresAt;
    return undefined;
  }, [phase]);

  const mintAndPlay = useCallback(
    async (mode: ArtifactMode = "audio") => {
      setPhase({ kind: "minting" });
      try {
        const res = await mintReplayAudioUrl(token, sessionId, mode);
        const data = res.data;
        if (mode === "video") {
          setVideoReplayStartedAt(new Date().toISOString());
        }
        setPhase({
          kind: "playing",
          signedUrl: data.signedUrl,
          expiresAt: data.expiresAt,
          mode,
          hasVideo: hasVideoAvailable || mode === "video",
          selfServeExpiresAt: currentSelfServeExpiresAt,
        });
      } catch (err) {
        const e = err as Error & {
          status?: number;
          code?: string;
          details?: Record<string, unknown>;
        };
        if (e.code === "video_otp_required") {
          // The 30-day window has lapsed (or never existed). Open the
          // OTP modal with the `lastVerifiedAt` hint carried in the
          // error payload so the modal can render "last verified N
          // days ago" copy.
          const raw = e.details?.lastVerifiedAt;
          const lastVerifiedAt =
            typeof raw === "string" ? raw : raw === null ? null : null;
          setVideoFlow({ kind: "otp", lastVerifiedAt });
          // Roll phase back to `ready` so the background UI isn't
          // stuck on the "Loading recording…" state while the modal
          // is up.
          setPhase((prev) =>
            prev.kind === "minting"
              ? {
                  kind: "ready",
                  hasVideo: true,
                  ...(currentSelfServeExpiresAt
                    ? { selfServeExpiresAt: currentSelfServeExpiresAt }
                    : {}),
                }
              : prev,
          );
          return;
        }
        if (e.code === "no_video_artifact") {
          // Video toggled but no video composition for this session.
          // Surface the denial copy and roll the toggle back to audio.
          setVideoFlow({ kind: "idle" });
          setPhase({
            kind: "unavailable",
            reason: "artifact_not_found",
          });
          return;
        }
        if (
          e.code === "revoked" ||
          e.code === "artifact_not_ready" ||
          e.code === "artifact_not_found" ||
          e.code === "beyond_self_serve_window" ||
          e.code === "not_a_participant"
        ) {
          setPhase({ kind: "unavailable", reason: e.code as ReplayDenyReason });
          return;
        }
        const message =
          e.status === 429
            ? "You've requested replay too many times. Please wait a few minutes."
            : e.message || "Could not load the recording.";
        setPhase({ kind: "mint_error", message });
      }
    },
    [currentSelfServeExpiresAt, hasVideoAvailable, sessionId, token],
  );

  // ---------------------------------------------------------------------------
  // Video toggle flow orchestration (Plan 08 · Task 44 · Decision 10 LOCKED).
  // ---------------------------------------------------------------------------
  const handleToggleShowVideo = useCallback(() => {
    // Only patients traverse the OTP gate; doctors may already be
    // privileged to replay video via other surfaces but the toggle
    // itself is authored for patient replay. We still let doctors
    // switch modes (they skip the OTP backend-side).
    if (currentMode === "video") {
      // Toggle off → switch back to audio. Mint a fresh audio URL so
      // the <audio> element gets a valid src; cheaper than reading
      // the stale video URL into audio.
      setVideoReplayStartedAt(null);
      void mintAndPlay("audio");
      return;
    }
    // Toggle on → open warning modal first.
    setVideoFlow({ kind: "warning" });
  }, [currentMode, mintAndPlay]);

  const handleWarningCancel = useCallback(() => {
    setVideoFlow({ kind: "idle" });
  }, []);

  const handleWarningContinue = useCallback(async () => {
    // For doctors, skip OTP + go straight to mint; the backend OTP
    // gate is patient-only.
    if (callerRole !== "patient") {
      setVideoFlow({ kind: "minting" });
      await mintAndPlay("video");
      setVideoFlow({ kind: "idle" });
      return;
    }
    // Preflight the OTP state so we skip the modal when the patient
    // is already inside the 30-day window.
    setVideoFlow({ kind: "minting" });
    try {
      const res = await getVideoReplayOtpState(token, sessionId);
      if (!res.data.required) {
        await mintAndPlay("video");
        setVideoFlow({ kind: "idle" });
        return;
      }
      setVideoFlow({ kind: "otp", lastVerifiedAt: res.data.lastVerifiedAt });
    } catch {
      // Fail-open to the OTP modal: the modal itself will try to
      // send an OTP and surface a specific error if that fails.
      setVideoFlow({ kind: "otp", lastVerifiedAt: null });
    }
  }, [callerRole, mintAndPlay, sessionId, token]);

  const handleOtpCancel = useCallback(() => {
    setVideoFlow({ kind: "idle" });
  }, []);

  const handleOtpVerified = useCallback(async () => {
    setVideoFlow({ kind: "minting" });
    await mintAndPlay("video");
    setVideoFlow({ kind: "idle" });
  }, [mintAndPlay]);

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
    void mintAndPlay(phase.mode);
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
      ? new Date(videoReplayStartedAt).toLocaleString()
      : new Date().toLocaleString();
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
      {hasVideoAvailable && (phase.kind === "ready" || phase.kind === "playing") && (
        <div className="mt-2 flex items-center justify-between rounded-md border border-gray-100 bg-gray-50 px-3 py-1.5 text-xs text-gray-700">
          <span className="flex items-center gap-1.5">
            <span aria-hidden>🎥</span>
            <span>Video version available</span>
          </span>
          <label className="inline-flex cursor-pointer items-center gap-2 select-none">
            <input
              type="checkbox"
              checked={currentMode === "video"}
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

        {phase.kind === "ready" && (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => void mintAndPlay("audio")}
              className="inline-flex w-full items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Play recording
            </button>
            {phase.selfServeExpiresAt && callerRole === "patient" && (
              <p className="text-[11px] text-gray-500">
                Available until {new Date(phase.selfServeExpiresAt).toLocaleDateString()}.
              </p>
            )}
          </div>
        )}

        {phase.kind === "minting" && (
          <p className="text-sm text-gray-500">Loading recording…</p>
        )}

        {phase.kind === "mint_error" && (
          <div className="flex flex-col gap-2">
            <p role="alert" className="text-sm text-red-600">
              {phase.message}
            </p>
            <button
              type="button"
              onClick={() => void mintAndPlay(currentMode)}
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
          </div>
        )}
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
