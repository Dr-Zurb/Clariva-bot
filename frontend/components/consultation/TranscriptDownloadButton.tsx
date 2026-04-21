"use client";

/**
 * `<TranscriptDownloadButton>` — the transcript-PDF download surface
 * for a finished consult (Plan 07 · Task 32).
 *
 * Mounting contract (all four surfaces use the same component, passing
 * their own `token` + `callerRole`):
 *   1. `<ConsultArtifactsPanel>` (doctor dashboard + patient replay).
 *   2. `/dashboard/appointments/[id]/chat-history` (doctor chat-history page).
 *   3. `/c/history/[sessionId]` (patient readonly chat-history route).
 *   4. `/c/replay/[sessionId]` (patient audio replay route).
 *
 * Download mechanics: the backend endpoint returns JSON
 * `{ signedUrl, expiresAt, cacheHit, filename }` — a Supabase Storage
 * signed URL carrying `?download=<filename>`. The button fetches that
 * JSON (with the Bearer header) and then does
 * `window.location.assign(signedUrl)` to trigger the native save-to-
 * disk affordance. Two-step (JSON → navigate) because the GET route
 * is Bearer-authed and browser navigations don't replay the header.
 *
 * Empty / error states:
 *   - `session_not_ended`       → disabled button + "Available after consult ends".
 *   - `beyond_self_serve_window` (patient only) → "Window has closed — ask support".
 *   - `revoked`                 → "The clinic has revoked access".
 *   - `not_a_participant`       → generic "Access denied" (shouldn't happen; failsafe).
 *   - network / other           → generic retry toast.
 *
 * The button is intentionally small / secondary — the primary CTA on
 * the artifacts panel is "Replay recording". Transcript is a
 * supplementary action.
 */

import { useCallback, useState } from "react";
import {
  downloadTranscript,
  type TranscriptExportDenyReason,
} from "@/lib/api";

export interface TranscriptDownloadButtonProps {
  sessionId: string;
  /**
   * Bearer token used against `GET /consultation/:id/transcript.pdf`.
   *   - Doctor: Supabase session JWT.
   *   - Patient: scoped JWT from `requestTranscriptToken()`.
   */
  token: string;
  /** Drives empty-state copy (only patients get the "ask support" line). */
  callerRole: "doctor" | "patient";
  /**
   * When `true`, the button is disabled with a "consult still in progress"
   * label. Call sites that know the session is live (e.g. the in-room
   * artifacts panel) pass `true`; the post-consult surfaces (history,
   * replay) leave it undefined so the backend decides.
   */
  sessionLive?: boolean;
  className?: string;
}

type ButtonPhase =
  | { kind: "idle" }
  | { kind: "downloading" }
  | {
      kind: "error";
      code?: TranscriptExportDenyReason | string;
      message: string;
    };

export default function TranscriptDownloadButton(
  props: TranscriptDownloadButtonProps,
): JSX.Element {
  const { sessionId, token, callerRole, sessionLive, className } = props;
  const [phase, setPhase] = useState<ButtonPhase>({ kind: "idle" });

  const handleClick = useCallback(async () => {
    if (phase.kind === "downloading") return;
    setPhase({ kind: "downloading" });
    try {
      const res = await downloadTranscript(token, sessionId);
      if (typeof window !== "undefined") {
        // Navigating directly to the Supabase Storage signed URL — the
        // `?download=<filename>` param makes the browser surface
        // save-to-disk instead of rendering the PDF inline.
        window.location.assign(res.data.signedUrl);
      }
      // The button stays in "downloading" until the browser unloads
      // this page, at which point state is moot.
    } catch (err) {
      const e = err as Error & {
        code?: TranscriptExportDenyReason | string;
        status?: number;
      };
      setPhase({
        kind:    "error",
        code:    e.code,
        message: friendlyMessage(e.code, callerRole, e.message),
      });
    }
  }, [phase.kind, sessionId, token, callerRole]);

  const disabled =
    sessionLive === true ||
    phase.kind === "downloading" ||
    (phase.kind === "error" && isTerminalDenial(phase.code));

  const label = resolveLabel(phase, sessionLive);

  return (
    <div
      className={[
        "flex flex-col items-start gap-1",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        aria-busy={phase.kind === "downloading" ? "true" : "false"}
        className={[
          "inline-flex items-center gap-2 rounded-md border px-3 py-1.5",
          "text-sm font-medium transition-colors",
          disabled
            ? "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400"
            : "border-gray-300 bg-white text-gray-800 hover:bg-gray-50",
        ].join(" ")}
      >
        <DownloadIcon className="h-4 w-4" />
        {label}
      </button>
      {phase.kind === "error" ? (
        <p
          role="alert"
          className="text-xs text-amber-700"
          data-deny-code={phase.code ?? "unknown"}
        >
          {phase.message}
        </p>
      ) : null}
      {sessionLive === true ? (
        <p className="text-xs text-gray-500">
          Available once the consult ends.
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveLabel(phase: ButtonPhase, sessionLive?: boolean): string {
  if (sessionLive === true) return "Download transcript";
  if (phase.kind === "downloading") return "Preparing transcript…";
  return "Download transcript (PDF)";
}

function isTerminalDenial(
  code?: TranscriptExportDenyReason | string,
): boolean {
  // These denial codes won't get better by clicking again. Keep the
  // button disabled to discourage retry-spam.
  return (
    code === "revoked" ||
    code === "beyond_self_serve_window" ||
    code === "not_a_participant"
  );
}

function friendlyMessage(
  code: TranscriptExportDenyReason | string | undefined,
  callerRole: "doctor" | "patient",
  fallback: string,
): string {
  switch (code) {
    case "session_not_ended":
      return "Transcript is available after the consult ends.";
    case "beyond_self_serve_window":
      return callerRole === "patient"
        ? "This download window has closed. Please contact support to request access."
        : "The retention window for this transcript has expired.";
    case "revoked":
      return "Access to this transcript has been revoked by the clinic.";
    case "not_a_participant":
      return "You don't have access to this transcript.";
    case "support_reason_required":
      return "Support access requires a documented reason.";
    default:
      return fallback || "Couldn't download the transcript. Please try again.";
  }
}

function DownloadIcon(props: { className?: string }): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={props.className}
    >
      <path d="M10 3a1 1 0 011 1v7.586l2.293-2.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 11.586V4a1 1 0 011-1z" />
      <path d="M3 15a1 1 0 012 0v1h10v-1a1 1 0 112 0v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2z" />
    </svg>
  );
}
