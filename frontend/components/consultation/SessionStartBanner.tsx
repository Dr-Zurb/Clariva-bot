"use client";

/**
 * Plan 02 · Task 27 — Session-start banner.
 *
 * Renders ONLY when the patient explicitly declined recording
 * (`decision === false`). Intentionally does NOT render for:
 *   - `decision === true`   — recording is on by default; no banner needed.
 *   - `decision === null`   — patient was never asked (pre-Task 27 booking,
 *                             or IG-bot dropped before the consent step).
 *                             Fall back to the recording-on-by-default posture.
 *
 * Design goal: zero visual clutter when everything is normal. The doctor
 * sees the banner only on the exception path, where it is load-bearing
 * ("take more-detailed clinical notes").
 *
 * The component fetches its own data because callers (VideoRoom,
 * <VoiceConsultRoom>, <TextConsultRoom>) just hand it a `sessionId` and
 * don't want to own the lifecycle. Fetch happens once on mount; no
 * polling — the consent decision is immutable for an in-flight session
 * (patient can change via the `POST /:id/recording-consent` route but
 * that's a patient-side write path; re-fetch on next session start is
 * sufficient).
 *
 * Failures are silent. A missed fetch leaves `decision === null`, which
 * correctly collapses to "no banner". The doctor already has the session
 * running; surfacing a red toast because the banner couldn't load would
 * be worse than hiding a legitimate decline notice. Log-only.
 */

import { useEffect, useState } from "react";
import {
  getRecordingConsentForSession,
  type RecordingConsentForSessionData,
} from "@/lib/api";

export interface SessionStartBannerProps {
  /**
   * Doctor's Supabase JWT. Passed explicitly (not pulled from context)
   * because consultation surfaces sometimes mount under the join-as-patient
   * path where context-based auth is unavailable.
   */
  doctorToken: string;
  /** `consultation_sessions.id`. */
  sessionId: string;
}

export function SessionStartBanner({ doctorToken, sessionId }: SessionStartBannerProps) {
  const [consent, setConsent] = useState<RecordingConsentForSessionData | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getRecordingConsentForSession(doctorToken, sessionId);
        if (cancelled) return;
        setConsent(res.data);
      } catch (err) {
        // Log-only; see header doc. Do NOT surface to the user — the
        // banner collapses to null when consent can't be read.
        // eslint-disable-next-line no-console
        console.warn("[SessionStartBanner] failed to fetch consent", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doctorToken, sessionId]);

  if (!consent) return null;
  if (consent.decision !== false) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="session-start-banner"
      className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm"
    >
      <div className="font-semibold">Patient declined recording.</div>
      <div className="mt-0.5 text-amber-800">
        This consult is not being recorded. Take detailed clinical notes.
      </div>
    </div>
  );
}
