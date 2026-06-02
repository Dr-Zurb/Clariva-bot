/**
 * SnapshotControls (Sub-batch C · task-video-C3)
 *
 * Single button + ephemeral feedback that captures a JPEG of the
 * remote (default) or self tile, uploads it, and surfaces a flash
 * overlay + ephemeral toast pill.
 *
 *   - **Source**: defaults to `'remote'` because that's the dominant
 *     clinical use case (doctor captures patient's wound, rash, etc.).
 *     A small dropdown next to the button lets the caller swap to the
 *     self tile.
 *   - **Flash overlay**: a brief white-fade element rendered as a
 *     `fixed inset-0` overlay, visible for ~150ms to confirm capture
 *     happened. Same affordance every native camera app uses.
 *   - **Toast**: an amber pill below the button that says either
 *     "Snapshot saved" (success) or the error message (failure).
 *     Auto-clears after ~4s, matching the existing PiP / virtual-
 *     background notice pattern in `<VideoRoom>`.
 *
 * The component is purely presentational and stateful — it owns the
 * button + dropdown + flash + toast state, and DELEGATES the actual
 * capture to `captureSnapshot` from `lib/video/snapshot-capture.ts`.
 * The caller (VideoRoom) is responsible for:
 *   - Providing the live `videoElRef` for the remote tile.
 *   - Providing the live `videoElRef` for the local tile (when the
 *     user picks the 'self' source).
 *   - Threading the session id + access token + role.
 *   - Deciding when to render the controls at all (e.g. hide for
 *     `mode='readonly'` — handled at the call site, not here).
 *
 * Permissions / consent — the backend is the consent gate. The
 * frontend optimistically sends the request and surfaces the
 * `'http-403'` error message verbatim; that copy already says what
 * the patient needs to do (re-tap consent banner). Avoiding a
 * client-side consent check keeps the source of truth on the
 * server, where the row-level state lives.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  captureSnapshot,
  SnapshotError,
  type CaptureSnapshotOptions,
} from "@/lib/video/snapshot-capture";

export interface SnapshotControlsProps {
  /** Live ref to the remote tile's video element. May be `null` mid-mount. */
  remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
  /** Live ref to the local tile's video element. May be `null` mid-mount. */
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  /** consultation_sessions.id */
  sessionId: string;
  /**
   * Bearer JWT for the backend snapshot route. Doctor: dashboard
   * Supabase access token. Patient: scoped JWT minted via the
   * text-token exchange. Same token shape `signAttachmentUrls` uses
   * for chat attachments.
   *
   * `null` when the chat auth state isn't ready yet (parent threading
   * is async). The button is disabled until a real token lands.
   */
  accessToken: string | null;
  /**
   * Optional callback fired AFTER a successful capture. The parent
   * may use it to log telemetry or (future) populate a "review and
   * attach" review pane (task-video-D3).
   */
  onCaptured?: (snapshotId: string) => void;
  /**
   * Sub-batch C · task-video-C4 — optional callback fired when the
   * user clicks the Annotate button. The button is rendered ONLY
   * when this callback is supplied (so the C3-only call sites stay
   * single-button). The parent (`<VideoRoom>`) is responsible for:
   *   1. Freezing the appropriate video tile (matches `source` here).
   *   2. Producing the `frameCanvas` via `freezeVideoFrame`.
   *   3. Mounting `<AnnotationCanvas>` overlay.
   *   4. On Save, uploading the resulting blob via `captureSnapshot`
   *      with `prerenderedBlob` + `annotations`.
   *   5. On Cancel, unfreezing the tile.
   *
   * Why the SOURCE is selected via this component's existing
   * dropdown (and passed back) instead of a parent-owned source —
   * keeps the snapshot affordance and the annotation affordance in
   * lock-step. Doctor's "I want to annotate the patient's tile"
   * intent is the same dropdown selection as "I want to snapshot
   * the patient's tile."
   */
  onRequestAnnotate?: (source: "remote" | "self") => void;
  /**
   * Sub-batch C · task-video-C4 — when the parent's annotation flow
   * completes (success or error), it calls this callback to surface
   * a toast through the same UI surface as in-component captures.
   * Treated as an "I have new toast state for you" signal — the
   * parent doesn't need its own duplicated toast plumbing.
   *
   * The parent calls it after `captureSnapshot` resolves / rejects.
   * Optional — when omitted, the parent's annotation flow has to
   * surface its own toasts. The simpler call path (set this prop
   * once, get C3 + C4 toasts in one place) is the common one.
   */
  externalToast?: { kind: "success" | "error"; message: string } | null;
}

const TOAST_AUTO_CLEAR_MS = 4000;
const FLASH_DURATION_MS = 220;

type ToastState =
  | { kind: "none" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

export default function SnapshotControls({
  remoteVideoRef,
  localVideoRef,
  sessionId,
  accessToken,
  onCaptured,
  onRequestAnnotate,
  externalToast,
}: SnapshotControlsProps) {
  const [source, setSource] = useState<"remote" | "self">("remote");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastState>({ kind: "none" });
  const [flashing, setFlashing] = useState(false);

  // Auto-clear the toast after a short window — same pattern as
  // pipNotice / backgroundNotice / screenShareNotice in VideoRoom.
  useEffect(() => {
    if (toast.kind === "none") return;
    const handle = setTimeout(
      () => setToast({ kind: "none" }),
      TOAST_AUTO_CLEAR_MS,
    );
    return () => clearTimeout(handle);
  }, [toast]);

  // Sub-batch C · task-video-C4 — bridge externally-driven toast state
  // (used by the parent's annotation flow). Whenever the parent passes
  // a non-null `externalToast`, we mirror it into local state so the
  // existing auto-clear effect handles the lifecycle uniformly.
  useEffect(() => {
    if (externalToast) {
      setToast(externalToast);
    }
  }, [externalToast]);

  // Flash auto-fade.
  useEffect(() => {
    if (!flashing) return;
    const handle = setTimeout(() => setFlashing(false), FLASH_DURATION_MS);
    return () => clearTimeout(handle);
  }, [flashing]);

  // Re-entrancy guard — fast double-clicks shouldn't queue two
  // requests. `busy` covers the React side; this ref covers the
  // brief window between click and `setBusy(true)`.
  const inflightRef = useRef(false);

  const handleCapture = useCallback(async () => {
    if (inflightRef.current || busy) return;
    if (!accessToken) {
      setToast({
        kind: "error",
        message: "Chat connection not ready — try again in a moment.",
      });
      return;
    }
    const videoEl =
      source === "remote" ? remoteVideoRef.current : localVideoRef.current;
    if (!videoEl) {
      setToast({
        kind: "error",
        message:
          source === "remote"
            ? "The other party's video isn't ready yet."
            : "Your camera isn't ready yet.",
      });
      return;
    }

    inflightRef.current = true;
    setBusy(true);
    setToast({ kind: "none" });
    // Trigger the flash optimistically — the visual signal that
    // "capture is happening" matches native camera behavior. If the
    // backend rejects, the error toast still surfaces.
    setFlashing(true);

    try {
      const captureOptions: CaptureSnapshotOptions = {
        videoEl,
        sessionId,
        accessToken,
        target: source,
      };
      const result = await captureSnapshot(captureOptions);
      setToast({ kind: "success", message: "Snapshot saved." });
      if (onCaptured) onCaptured(result.snapshotId);
    } catch (err) {
      const message =
        err instanceof SnapshotError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Snapshot failed. Try again.";
      setToast({ kind: "error", message });
    } finally {
      inflightRef.current = false;
      setBusy(false);
    }
  }, [accessToken, busy, localVideoRef, onCaptured, remoteVideoRef, sessionId, source]);

  const buttonDisabled = busy || !accessToken;

  const handleAnnotate = useCallback(() => {
    if (buttonDisabled || !onRequestAnnotate) return;
    // Re-use the same source-readiness check as the snapshot path —
    // can't annotate a tile that has no video.
    const videoEl =
      source === "remote" ? remoteVideoRef.current : localVideoRef.current;
    if (!videoEl) {
      setToast({
        kind: "error",
        message:
          source === "remote"
            ? "The other party's video isn't ready yet."
            : "Your camera isn't ready yet.",
      });
      return;
    }
    onRequestAnnotate(source);
  }, [
    buttonDisabled,
    localVideoRef,
    onRequestAnnotate,
    remoteVideoRef,
    source,
  ]);

  return (
    <>
      {/*
        Camera-style flash overlay. `pointer-events-none` so it never
        intercepts clicks; `z-[60]` so it sits above the video canvas
        + controls bar but below modal-style overlays (recording
        indicator pill at z-30, EndCallConfirmModal at z-50). Tested
        against the existing z-index inventory in VideoRoom comments.
      */}
      {flashing ? (
        <div
          aria-hidden="true"
          data-testid="snapshot-flash"
          className="pointer-events-none fixed inset-0 z-[60] bg-white opacity-70 transition-opacity duration-200"
        />
      ) : null}

      <div
        className="inline-flex items-center gap-1"
        data-testid="snapshot-controls"
      >
        <button
          type="button"
          onClick={handleCapture}
          disabled={buttonDisabled}
          aria-label={`Take a snapshot of the ${source === "remote" ? "other party's" : "your"} video`}
          title={
            buttonDisabled
              ? "Snapshot unavailable — chat connection not ready"
              : `Snapshot ${source === "remote" ? "the other party" : "yourself"}`
          }
          className={`inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
            busy
              ? "border-blue-300 bg-blue-50 text-blue-700"
              : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:ring-blue-500"
          }`}
        >
          {/*
            Camera glyph — same SVG style as the other inline icons in
            VideoRoom controls (PiP, Share). No Lucide dep yet (same
            constraint documented in B6 / B7 / B8 / C2 / C5).
          */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          <span>{busy ? "Saving…" : "Snapshot"}</span>
        </button>
        {/*
          Sub-batch C · task-video-C4 — Annotate button. Rendered
          inline next to Snapshot when the parent provides
          `onRequestAnnotate`. Same disabled posture; same source
          dropdown drives both buttons (one source selection covers
          "snapshot the patient's tile" and "annotate the patient's
          tile" — the doctor's intent is identical at the dropdown
          level). The actual annotation flow (freeze, overlay,
          composite, upload) lives in the parent.
        */}
        {onRequestAnnotate ? (
          <button
            type="button"
            onClick={handleAnnotate}
            disabled={buttonDisabled}
            data-testid="snapshot-annotate-button"
            aria-label={`Annotate ${source === "remote" ? "the other party's" : "your"} video`}
            title={
              buttonDisabled
                ? "Annotate unavailable — chat connection not ready"
                : `Annotate ${source === "remote" ? "the other party" : "yourself"}`
            }
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {/*
              Pencil glyph — same SVG style as the camera glyph above
              and the existing Share / PiP / virtual-bg icons in the
              VideoRoom controls bar.
            */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z" />
            </svg>
            <span>Annotate</span>
          </button>
        ) : null}
        {/*
          Source picker — small inline `<select>`. Defaults to remote;
          dropdown gives the user the secondary self-capture path
          without taking up space when not needed. Same reasoning the
          B8 quality picker uses.
        */}
        <label className="sr-only" htmlFor="snapshot-source-select">
          Snapshot source
        </label>
        <select
          id="snapshot-source-select"
          value={source}
          onChange={(e) => setSource(e.target.value as "remote" | "self")}
          disabled={buttonDisabled}
          className="rounded-md border border-gray-300 bg-white px-1.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="Snapshot source"
        >
          <option value="remote">Other</option>
          <option value="self">Self</option>
        </select>
      </div>

      {toast.kind !== "none" ? (
        <div
          role="status"
          aria-live="polite"
          data-testid={
            toast.kind === "success" ? "snapshot-toast-success" : "snapshot-toast-error"
          }
          className={`mt-2 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium ${
            toast.kind === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
              : "border-amber-300 bg-amber-50 text-amber-800"
          }`}
        >
          {toast.message}
        </div>
      ) : null}
    </>
  );
}
