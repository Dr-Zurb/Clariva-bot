"use client";

/**
 * `<VideoReplayWarningModal>` — Plan 08 · Task 44 · Decision 10 LOCKED.
 *
 * Friction step between the patient toggling "Show video" and the
 * video player actually loading. The modal's job is *disclosure*,
 * not authentication: it tells the patient what will happen when
 * they continue so a mis-tap on the toggle never surfaces video
 * silently. Authentication (when required) happens in the next step
 * via `<VideoReplayOtpModal>`.
 *
 * Copy doctrine (from Decision 10):
 *   - **Three bullets, in this order.** The three disclosures map to
 *     the three properties we owe the patient before we surface video:
 *       1. The recording contains visuals of them and the doctor.
 *       2. Every access is audited + the doctor sees a dashboard event.
 *       3. An SMS code may be required (first view per 30 days).
 *   - **Cancel is the left/secondary button**; Continue is right/primary.
 *     Motor-memory on the "dismiss = left" pattern matters when the
 *     modal is a privacy gate.
 *   - **Escape + backdrop click both cancel.** Full dismissal parity.
 *   - **"Continue to video" is the primary label.** Not "I agree" /
 *     "I accept" — those framings read like a ToS and encourage
 *     dismiss-without-reading behaviour. "Continue to video" keeps
 *     the patient oriented to what's on the other side.
 *
 * Accessibility:
 *   - `role="dialog"` + `aria-modal` + `aria-labelledby` +
 *     `aria-describedby` per WAI-ARIA dialog pattern.
 *   - Focus trap scoped to the modal; on mount, focus lands on the
 *     Continue button so Enter = continue.
 *   - `aria-live` on the footer reassurance copy isn't needed — the
 *     dialog itself is the announcement.
 */

import { useCallback, useEffect, useRef } from "react";

export interface VideoReplayWarningModalProps {
  /**
   * When `true`, the modal is mounted + focus-trapped. When `false`,
   * the parent is expected to unmount the modal (the component
   * itself does NOT render a closed / hidden state — unmount-on-
   * dismiss keeps the DOM free of stale dialogs).
   */
  open: boolean;
  /** Patient-facing clinic name for the copy anchor. */
  clinicName?: string;
  /** Human-readable consult date, e.g. "19 Apr 2026". */
  consultDateLabel?: string;
  /**
   * Called when the patient dismisses via Cancel / backdrop / Escape.
   * Parent is expected to close the modal and revert the "Show video"
   * toggle to the off state.
   */
  onCancel: () => void;
  /**
   * Called when the patient clicks "Continue to video". The parent
   * then decides whether to open the OTP modal (outside the 30-day
   * window) or proceed directly to the video mint (inside the window).
   */
  onContinue: () => void;
}

export default function VideoReplayWarningModal(
  props: VideoReplayWarningModalProps,
): JSX.Element | null {
  const { open, clinicName, consultDateLabel, onCancel, onContinue } = props;
  const continueRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Focus-management: land on Continue so Enter completes the primary
  // action. Prior focus is not restored here — the parent unmounts
  // this component on dismiss and restores focus to the toggle.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      continueRef.current?.focus();
    }, 0);
    return () => {
      window.clearTimeout(t);
    };
  }, [open]);

  // Escape closes; also implement a minimal focus-trap so Tab doesn't
  // escape into the background player while the dialog is up.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
        return;
      }
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusable = root.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onCancel],
  );

  if (!open) return null;

  const clinicLine = (clinicName?.trim() || "your clinic").trim();
  const dateLine = consultDateLabel?.trim();

  return (
    <div
      aria-hidden={false}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
    >
      {/* Backdrop — click to cancel. aria-hidden so AT doesn't double-announce. */}
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={onCancel}
        className="absolute inset-0 bg-black/50"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="video-replay-warning-title"
        aria-describedby="video-replay-warning-body"
        onKeyDown={handleKeyDown}
        className="relative w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
      >
        <h2
          id="video-replay-warning-title"
          className="text-base font-semibold text-gray-900"
        >
          Before you watch the video
        </h2>
        <div id="video-replay-warning-body" className="mt-3 text-sm text-gray-700">
          <p>
            You&apos;re about to watch the video recording of your
            consultation with {clinicLine}
            {dateLine ? ` on ${dateLine}` : ""}. A few things to know:
          </p>
          <ul className="mt-3 space-y-2 pl-4 list-disc">
            <li>
              The video shows both you and your doctor. Please watch it
              somewhere private.
            </li>
            <li>
              Every view is logged. Your doctor will see a &ldquo;patient
              watched the video&rdquo; entry on their dashboard &mdash;
              this is part of normal care.
            </li>
            <li>
              You may receive an SMS code the first time you watch a
              video in a 30-day window. This is an extra privacy check.
            </li>
          </ul>
          <p className="mt-3 text-xs text-gray-500">
            Audio-only replay is still available any time without a code.
          </p>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1"
          >
            Cancel
          </button>
          <button
            ref={continueRef}
            type="button"
            onClick={onContinue}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
          >
            Continue to video
          </button>
        </div>
      </div>
    </div>
  );
}
