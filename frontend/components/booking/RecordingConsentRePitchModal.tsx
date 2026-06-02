"use client";

/**
 * Plan 02 · Task 27 — Soft re-pitch modal for the public booking page.
 *
 * Opens the first time the patient unchecks the consent checkbox. Decision 4
 * constrains this to a single re-pitch per booking: the caller tracks that
 * (via local React state) and only mounts this modal on the first decline.
 *
 * Two CTAs:
 *   - "Keep recording on"          → re-checks the checkbox, closes modal.
 *   - "Continue without recording" → keeps checkbox unchecked, closes modal.
 *
 * Matches the IG-bot soft re-pitch copy exactly (`RECORDING_CONSENT_BODY_V1`
 * from `backend/src/constants/recording-consent.ts`). When that constant
 * bumps (`v1.1` etc.), update the text here in the same PR — we do NOT
 * auto-sync from the backend because the constant lives in a different
 * deploy boundary.
 */

import { useEffect, useRef } from "react";

const RECORDING_CONSENT_BODY_V1 =
  "I agree to my consultation being recorded for medical records and quality. " +
  "The doctor can pause recording at any time. I can review or download my recording " +
  "for 90 days, or request access for the full medical-record retention period anytime.";

export interface RecordingConsentRePitchModalProps {
  open: boolean;
  onKeepOn: () => void;
  onContinueWithout: () => void;
  /**
   * Fires on Escape, backdrop click, or close button. Intentionally
   * mapped to the same semantics as "Continue without recording" by
   * the caller — dismissal counts as implicit decline, which is the
   * safer UX for dark-pattern avoidance.
   */
  onDismiss: () => void;
}

export function RecordingConsentRePitchModal(props: RecordingConsentRePitchModalProps) {
  const { open, onKeepOn, onContinueWithout, onDismiss } = props;
  const keepOnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onDismiss();
      }
    };
    document.addEventListener("keydown", onKey);
    // Focus the "Keep recording on" button by default; it's the
    // recording-on-by-default position from Decision 4.
    keepOnRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onDismiss]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-black/50 px-3"
      role="presentation"
      onMouseDown={(e) => {
        e.preventDefault();
        onDismiss();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="recording-consent-repitch-title"
        data-testid="recording-consent-repitch-modal"
        className="relative w-full max-w-md overflow-hidden rounded-lg border border-gray-200 bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4">
          <h2
            id="recording-consent-repitch-title"
            className="text-base font-semibold text-gray-900"
          >
            A quick note about recording
          </h2>
          <p className="mt-2 text-sm text-gray-700">
            {RECORDING_CONSENT_BODY_V1}
          </p>
          <p className="mt-2 text-sm text-gray-600">
            You can still book without recording — your care is never blocked.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3">
          <button
            type="button"
            onClick={onContinueWithout}
            data-testid="recording-consent-repitch-continue-without"
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Continue without recording
          </button>
          <button
            ref={keepOnRef}
            type="button"
            onClick={onKeepOn}
            data-testid="recording-consent-repitch-keep-on"
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Keep recording on
          </button>
        </div>
      </div>
    </div>
  );
}
