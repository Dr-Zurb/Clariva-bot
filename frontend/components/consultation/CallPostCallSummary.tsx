"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  getPostCallSummary,
  getReplayUrl,
  type PostCallSummary,
} from "@/lib/api";
import {
  disconnectReasonCopy,
  type DisconnectReason,
} from "@/lib/call/classify-disconnect";
import { formatDate } from "@/lib/format-date";
import RecordingPlaybackPlayer from "./RecordingPlaybackPlayer";
import RecordingReplayPlayer from "./RecordingReplayPlayer";
import SnapshotReviewPanel from "./SnapshotReviewPanel";

/**
 * Sub-batch D · task-video-D1 — modality-aware post-call summary.
 *
 * Renders a structured "what just happened" card after a call ends.
 * Two mount surfaces (selected via `mountContext`):
 *
 *   `'post-call'`     → mounted in <VideoRoom>'s ended phase right
 *                        after <CallDisconnectSplash> dismisses.
 *                        Renders a [Done] CTA that calls `onClose`.
 *
 *   `'history-detail'` → mounted on the dashboard appointment-detail
 *                        page for ended consults. No Done CTA (the
 *                        page chrome handles navigation).
 *
 * Modality-aware: mounted from `<VideoRoom>` and `<VoiceConsultRoom>`
 * (voice B5) after the disconnect splash dismisses, and from
 * `<EndedCard>` for durable appointment-detail history.
 *
 * Auth model — accepts EITHER a doctor's Supabase JWT OR a scoped
 * patient/extra-participant JWT. The backend service discriminates;
 * the component just forwards whatever bearer the parent supplies.
 *
 * Sub-batch D · task-video-D2 update (deep-link to player) — when
 * `recording.status === 'available'`, the recording row reveals a
 * "Watch recording" / "Listen to recording" toggle. Clicking it
 * mounts <RecordingReplayPlayer> inline below the summary using the
 * same `bearerJwt` (works for both doctor Supabase JWTs and patient
 * scoped JWTs because the player accepts both).
 *
 * Why inline expand instead of navigation: works in BOTH `post-call`
 * (where the patient has no in-tab route to navigate to) AND
 * `history-detail` (where the player is already mounted in
 * <ConsultArtifactsPanel> below — but mounting here lets the doctor
 * play without scrolling away from the summary card).
 *
 * Prescription deep-link is intentionally not wired in Phase 1 — no
 * doctor- or patient-facing prescription detail route exists today.
 * The Rx badge is an information row only; clicking the underlying Rx
 * is done via the existing patient-detail or in-call Rx surfaces.
 */

export type CallPostCallSummaryMountContext = "post-call" | "history-detail";

export interface CallPostCallSummaryProps {
  sessionId: string;
  bearerJwt: string;
  mountContext: CallPostCallSummaryMountContext;
  /**
   * Frontend-classified disconnect reason (see
   * `lib/call/classify-disconnect.ts`). Optional because
   * `'history-detail'` mounts don't have access to the live
   * classifier — the splash already happened in a different tab,
   * possibly weeks earlier. When omitted, we just don't render
   * the disconnect-reason subline.
   */
  disconnectReason?: DisconnectReason;
  /**
   * Patient-only: deep-link to `/book?token=…` when the parent has a
   * signed booking token. Omitted on doctor mounts and history-detail.
   */
  bookFollowUpHref?: string;
  /**
   * Called when the user clicks [Done] (post-call mount only).
   * Parent decides what "done" means (e.g. show the minimal
   * "Call ended." placeholder, navigate away, close the tab,
   * etc.). Ignored when `mountContext === 'history-detail'`.
   */
  onClose?: () => void;
}

type LoadState =
  | { phase: "loading" }
  | { phase: "loaded"; summary: PostCallSummary }
  | { phase: "error"; error: string };

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds < 0) return "—";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs.toString().padStart(2, "0")}s`;
}

function modalityLabel(
  modality: PostCallSummary["modality"],
): string {
  if (modality === "video") return "Video consult";
  if (modality === "voice") return "Voice consult";
  return "Text consult";
}

function recordingPillClass(
  status: PostCallSummary["recording"]["status"],
): string {
  if (status === "available") return "bg-green-100 text-green-800";
  if (status === "processing") return "bg-amber-100 text-amber-800";
  return "bg-gray-100 text-gray-700";
}

const RECORDING_UNAVAILABLE_TOOLTIP =
  "Recording will be available soon";

function recordingListenTooltip(
  status: PostCallSummary["recording"]["status"],
): string | undefined {
  if (status === "available") return undefined;
  if (status === "processing") return "Recording is still processing";
  if (status === "not-recorded") return "This call was not recorded";
  return RECORDING_UNAVAILABLE_TOOLTIP;
}

function recordingLabel(
  status: PostCallSummary["recording"]["status"],
  hasVideo: boolean | undefined,
): string {
  if (status === "available") {
    return hasVideo ? "Recording (audio + video)" : "Recording (audio)";
  }
  if (status === "processing") return "Recording — processing";
  if (status === "not-recorded") return "Not recorded";
  return "Recording unavailable";
}

export default function CallPostCallSummary({
  sessionId,
  bearerJwt,
  mountContext,
  disconnectReason,
  bookFollowUpHref,
  onClose,
}: CallPostCallSummaryProps) {
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const [playerOpen, setPlayerOpen] = useState(false);
  const [snapshotPanelOpen, setSnapshotPanelOpen] = useState(false);
  const [replayMint, setReplayMint] = useState<
    | { phase: "idle" }
    | { phase: "loading" }
    | { phase: "ready"; replayUrl: string; expiresAt: string }
    | { phase: "error"; message: string }
  >({ phase: "idle" });

  const fetchReplayUrl = useCallback(async () => {
    setReplayMint({ phase: "loading" });
    try {
      const { replayUrl, expiresAt } = await getReplayUrl(bearerJwt, sessionId);
      setReplayMint({ phase: "ready", replayUrl, expiresAt });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not load recording";
      setReplayMint({ phase: "error", message });
    }
  }, [bearerJwt, sessionId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await getPostCallSummary(sessionId, bearerJwt);
        if (!cancelled) {
          setState({ phase: "loaded", summary: res.data });
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : "Could not load summary";
          setState({ phase: "error", error: message });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, bearerJwt]);

  if (state.phase === "loading") {
    return (
      <div
        className="rounded-lg border border-gray-200 bg-white p-6 text-center"
        aria-busy="true"
        aria-live="polite"
      >
        <p className="text-sm text-gray-700">Loading call summary…</p>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div
        className="rounded-lg border border-red-200 bg-red-50 p-6"
        role="alert"
      >
        <p className="font-medium text-red-800">Could not load summary</p>
        <p className="mt-1 text-sm text-red-700">{state.error}</p>
        {mountContext === "post-call" && onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="mt-3 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
          >
            Done
          </button>
        ) : null}
      </div>
    );
  }

  const { summary } = state;
  const counterpartyPrefix =
    summary.counterparty.role === "doctor" ? "With" : "With";
  const counterpartyDisplay =
    summary.counterparty.role === "doctor"
      ? `Dr. ${summary.counterparty.name.replace(/^Dr\.?\s*/i, "")}`
      : summary.counterparty.name;
  // Caller is the OPPOSITE of the counterparty: counterparty=patient
  // means the caller is the doctor, and vice versa. The summary
  // service derives counterparty from the auth claim, so this is
  // always consistent with whoever the bearer JWT belongs to.
  const callerRole: "doctor" | "patient" =
    summary.counterparty.role === "patient" ? "doctor" : "patient";
  const recordingPlayable = summary.recording.status === "available";
  const recordingHasVideo = Boolean(summary.recording.hasVideo);
  const useAudioPlaybackPlayer = recordingPlayable && !recordingHasVideo;
  const playLabel = recordingHasVideo ? "Watch recording" : "Listen to recording";
  const recordingTooltip = recordingListenTooltip(summary.recording.status);
  const recordingTitle = `Recording — ${counterpartyDisplay}${
    summary.duration.endedAt
      ? ` · ${formatDate(summary.duration.endedAt)}`
      : ""
  } · ${formatDuration(summary.duration.secondsTotal)}`;
  const disconnectSubline =
    disconnectReason != null
      ? disconnectReasonCopy(disconnectReason, {
          role: callerRole,
          actorLabel:
            summary.counterparty.role === "patient"
              ? summary.counterparty.name
              : undefined,
          modality: summary.modality === "voice" ? "voice" : "default",
        }).headline
      : null;
  const showBookFollowUp =
    callerRole === "patient" && Boolean(bookFollowUpHref?.trim());

  return (
    <section
      className="rounded-lg border border-gray-200 bg-white shadow-sm"
      aria-label="Call summary"
    >
      <header className="border-b border-gray-200 px-5 py-4">
        <h2 className="text-base font-semibold text-gray-900">
          Call summary
          <span className="sr-only"> — {modalityLabel(summary.modality)} ended</span>
          <span className="ml-2 text-sm font-normal text-gray-500">
            · {formatDuration(summary.duration.secondsTotal)}
          </span>
        </h2>
        <p className="mt-0.5 text-sm text-gray-600">
          {counterpartyPrefix} {counterpartyDisplay}
        </p>
        {disconnectSubline ? (
          <p className="mt-0.5 text-xs text-gray-500">{disconnectSubline}</p>
        ) : null}
      </header>

      <ul className="divide-y divide-gray-100">
        <li className="px-5 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-gray-700">Recording</span>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${recordingPillClass(summary.recording.status)}`}
              >
                {recordingLabel(
                  summary.recording.status,
                  summary.recording.hasVideo,
                )}
              </span>
              <button
                type="button"
                disabled={!recordingPlayable}
                title={recordingTooltip}
                onClick={() => {
                  if (!recordingPlayable) return;
                  if (playerOpen) {
                    setPlayerOpen(false);
                    setReplayMint({ phase: "idle" });
                    return;
                  }
                  setPlayerOpen(true);
                  if (useAudioPlaybackPlayer) {
                    void fetchReplayUrl();
                  }
                }}
                aria-expanded={recordingPlayable ? playerOpen : undefined}
                aria-controls={
                  recordingPlayable ? `replay-${sessionId}-mount` : undefined
                }
                className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {recordingPlayable && playerOpen ? "Hide player" : playLabel}
              </button>
            </div>
          </div>
          {recordingPlayable && playerOpen ? (
            <div id={`replay-${sessionId}-mount`} className="mt-3">
              {useAudioPlaybackPlayer ? (
                <>
                  {replayMint.phase === "loading" ? (
                    <p
                      className="flex items-center gap-2 text-sm text-gray-600"
                      aria-live="polite"
                    >
                      <span
                        className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600"
                        aria-hidden
                      />
                      Loading recording…
                    </p>
                  ) : null}
                  {replayMint.phase === "error" ? (
                    <div className="flex flex-col gap-2" role="alert">
                      <p className="text-sm text-red-700">{replayMint.message}</p>
                      <button
                        type="button"
                        onClick={() => void fetchReplayUrl()}
                        className="self-start rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Retry
                      </button>
                    </div>
                  ) : null}
                  {replayMint.phase === "ready" ? (
                    <RecordingPlaybackPlayer
                      replayUrl={replayMint.replayUrl}
                      title={recordingTitle}
                      sessionId={sessionId}
                      consultEndedAt={summary.duration.endedAt}
                      showDownload={callerRole === "doctor"}
                      onRetry={() => void fetchReplayUrl()}
                      onClose={() => {
                        setPlayerOpen(false);
                        setReplayMint({ phase: "idle" });
                      }}
                    />
                  ) : null}
                </>
              ) : (
                <RecordingReplayPlayer
                  sessionId={sessionId}
                  token={bearerJwt}
                  callerRole={callerRole}
                />
              )}
            </div>
          ) : null}
        </li>
        <li className="flex items-center justify-between px-5 py-3">
          <span className="text-sm text-gray-700">Attachments</span>
          <span className="text-sm font-medium text-gray-900">
            {summary.attachmentsCount}
          </span>
        </li>
        {summary.modality === "video" ? (
          <li className="px-5 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-700">Snapshots taken</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">
                  {summary.snapshotsCount}
                </span>
                {/* Sub-batch D · task-video-D3 — doctor-only review CTA.
                    Patient never sees this; backend rejects non-doctor
                    callers anyway, but the gate keeps an extra request
                    out of the patient flow. */}
                {summary.snapshotsCount > 0 && callerRole === "doctor" ? (
                  <button
                    type="button"
                    onClick={() => setSnapshotPanelOpen((v) => !v)}
                    aria-expanded={snapshotPanelOpen}
                    aria-controls={`snapshot-review-${sessionId}-mount`}
                    className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                  >
                    {snapshotPanelOpen ? "Hide review" : "Review snapshots"}
                  </button>
                ) : null}
              </div>
            </div>
            {summary.snapshotsCount > 0 &&
            callerRole === "doctor" &&
            snapshotPanelOpen ? (
              <div
                id={`snapshot-review-${sessionId}-mount`}
                className="mt-3"
              >
                <SnapshotReviewPanel
                  sessionId={sessionId}
                  doctorJwt={bearerJwt}
                />
              </div>
            ) : null}
          </li>
        ) : null}
        <li className="flex items-center justify-between px-5 py-3">
          <span className="text-sm text-gray-700">Prescription</span>
          {summary.prescriptionSent ? (
            <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
              Sent
            </span>
          ) : (
            <span className="text-sm text-gray-500">None sent</span>
          )}
        </li>
      </ul>

      <footer
        className={`border-t border-gray-100 px-5 py-3 ${
          mountContext === "post-call"
            ? "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
            : "flex flex-wrap gap-2"
        }`}
      >
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled
            title="Coming soon — needs Plan 10"
            className="rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-400"
          >
            View transcript
          </button>
          {showBookFollowUp ? (
            <Link
              href={bookFollowUpHref!}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              Book follow-up
            </Link>
          ) : null}
        </div>
        {mountContext === "post-call" ? (
          <button
            type="button"
            onClick={onClose}
            disabled={!onClose}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-gray-300 sm:ml-auto"
          >
            Close
          </button>
        ) : null}
      </footer>
    </section>
  );
}
