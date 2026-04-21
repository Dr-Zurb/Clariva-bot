"use client";

/**
 * Patient-side Realtime subscription + state hook for Plan 08 · Task 41's
 * video consent modal.
 *
 * The doctor-side `useVideoEscalationState` hook already subscribes to
 * Postgres-changes on `video_escalation_audit`; this hook is its patient-
 * side counterpart. It owns three concerns:
 *
 *   1. **Initial mount probe.** On mount, calls
 *      `GET /video-escalation-state` to see if a pending request
 *      already exists (e.g. the patient refreshed their tab while the
 *      modal was open). If yes → surface it so the modal opens.
 *
 *   2. **INSERT — new request arriving mid-consult.** Subscribes to
 *      `video_escalation_audit` INSERT events filtered to
 *      `session_id=eq.${sessionId}`. On each INSERT, loads the full row
 *      (the payload already carries it) and exposes
 *      `{ requestId, reason, presetReasonCode, expiresAt }`.
 *
 *   3. **UPDATE — request resolved (allow | decline | timeout).** On an
 *      UPDATE that matches our current pending request, clears the
 *      local state so the modal closes. The outcome is threaded into
 *      `onResolved(decision)` if the modal subscribed.
 *
 * **Why Realtime + not a dedicated Supabase Broadcast channel:**
 *   Task 41's server writes the audit row via the service-role client
 *   (bypasses RLS), but Supabase's Realtime publishes row changes to
 *   any subscriber that satisfies the RLS SELECT policy. Migration 070
 *   grants participants SELECT via `video_escalation_audit_select_
 *   participants`. So the patient's browser client — authenticated
 *   with the patient's Supabase session — sees every INSERT/UPDATE for
 *   sessions they're the patient on, without any backend-side custom
 *   Broadcast wiring.
 *
 * **Reason field visibility:**
 *   `reason` + `preset_reason_code` are written on INSERT and never
 *   updated. The Realtime INSERT payload carries the full row — the
 *   patient gets the reason verbatim for display.
 *
 * @see backend/migrations/070_video_escalation_audit_and_otp_window.sql (RLS policy)
 * @see frontend/hooks/useVideoEscalationState.ts (doctor counterpart)
 * @see frontend/components/consultation/VideoConsentModal.tsx (consumer)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getVideoEscalationState,
  type VideoEscalationPresetReason,
  type VideoEscalationStateData,
} from "@/lib/api/recording-escalation";

export type PatientEscalationOutcome = "allow" | "decline" | "timeout";

/**
 * Shape surfaced to `<VideoConsentModal>` when a consent request is
 * pending for this patient.
 */
export interface PendingConsentRequest {
  requestId:         string;
  /** Doctor's free-text reason. Displayed verbatim (in quotes). */
  reason:            string;
  /** Preset pill from the doctor's reason modal. */
  presetReasonCode:  VideoEscalationPresetReason | null;
  /** Server-assigned ISO timestamp. Client uses it for the 60s countdown
   *  so the displayed seconds never drift from the server. */
  expiresAt:         string;
}

export interface UsePatientVideoConsentRequestArgs {
  /** `consultation_sessions.id`. Hook is a no-op when null/empty. */
  sessionId: string | null | undefined;
  /** Patient's Supabase session JWT. Used for the initial GET probe;
   *  the Realtime channel uses the patient's browser-session client
   *  implicitly. When null the hook skips both. */
  token: string | null | undefined;
  /** Flip to `false` to disable — used when the patient tab is closed
   *  / unmounted gracefully. */
  enabled?: boolean;
  /** Invoked when the request resolves (via Realtime UPDATE). The modal
   *  uses it to play a micro-transition and forward to its own
   *  `onResolved` handler. */
  onResolved?: (outcome: PatientEscalationOutcome) => void;
}

export interface UsePatientVideoConsentRequestResult {
  /** Non-null while the patient should be shown the consent modal. */
  pending: PendingConsentRequest | null;
  /** `true` during the initial probe. */
  loading: boolean;
  /** Manually clear the pending state — called by the modal after a
   *  successful POST so we don't have to wait for the UPDATE event
   *  round-trip. */
  dismiss: () => void;
}

interface AuditRowPayload {
  id:                 string;
  session_id:         string;
  reason:             string;
  preset_reason_code: VideoEscalationPresetReason | null;
  patient_response:   PatientEscalationOutcome | null;
  requested_at:       string;
  responded_at:       string | null;
}

/**
 * Compute expiresAt from requested_at (server anchor) + 60s. Mirrors
 * the service's `EXPIRY_SECONDS` constant. If the row is missing
 * requested_at, falls back to "now + 60s" to avoid showing a negative
 * countdown — callers can still trust the server to fire the timeout.
 */
function computeExpiresAt(requestedAt: string): string {
  const ms = Date.parse(requestedAt);
  if (!Number.isFinite(ms)) return new Date(Date.now() + 60_000).toISOString();
  return new Date(ms + 60_000).toISOString();
}

function toPendingFromRow(row: AuditRowPayload): PendingConsentRequest {
  return {
    requestId:        row.id,
    reason:           row.reason,
    presetReasonCode: row.preset_reason_code,
    expiresAt:        computeExpiresAt(row.requested_at),
  };
}

function toPendingFromState(
  state: VideoEscalationStateData,
): Pick<PendingConsentRequest, "requestId" | "expiresAt"> | null {
  if (state.kind === "requesting") {
    return { requestId: state.requestId, expiresAt: state.expiresAt };
  }
  return null;
}

export function usePatientVideoConsentRequest(
  args: UsePatientVideoConsentRequestArgs,
): UsePatientVideoConsentRequestResult {
  const { sessionId, token, enabled = true, onResolved } = args;
  const [pending, setPending] = useState<PendingConsentRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const onResolvedRef = useRef(onResolved);

  useEffect(() => {
    onResolvedRef.current = onResolved;
  }, [onResolved]);

  // --- Initial probe --------------------------------------------------------
  // GET returns the derived state; if it's `requesting` we need the row's
  // `reason` + `preset_reason_code`, which the state endpoint doesn't
  // include. So we do a second lookup against the audit row directly via
  // the Supabase-session client (RLS-scoped). If that lookup 404s or
  // Postgres-changes hasn't propagated, the Realtime INSERT will fill
  // the gap within ~1s.
  const refresh = useCallback(async (): Promise<void> => {
    if (!enabled || !sessionId || !token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const state = await getVideoEscalationState(token, sessionId);
      const stub  = toPendingFromState(state);
      if (!stub) {
        setPending(null);
        return;
      }
      // Fill in `reason` + `preset_reason_code` from the row.
      const client = createClient();
      const { data, error } = await client
        .from("video_escalation_audit")
        .select("id, session_id, reason, preset_reason_code, patient_response, requested_at, responded_at")
        .eq("id", stub.requestId)
        .maybeSingle();
      if (error || !data) {
        // Row not yet visible to this session (RLS race or Realtime
        // propagation lag). Surface a placeholder so the modal can still
        // open; the INSERT event will enrich it within 1s.
        setPending({
          requestId:        stub.requestId,
          expiresAt:        stub.expiresAt,
          reason:           "Your doctor has requested to record video.",
          presetReasonCode: null,
        });
        return;
      }
      if (data.patient_response) {
        // Already resolved between state lookup + row read. No-op.
        setPending(null);
        return;
      }
      setPending(toPendingFromRow(data as AuditRowPayload));
    } finally {
      setLoading(false);
    }
  }, [enabled, sessionId, token]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    void refresh();
  }, [enabled, refresh]);

  // --- Realtime subscription -----------------------------------------------
  useEffect(() => {
    if (!enabled || !sessionId) return;
    const client = createClient();
    const channel = client
      .channel(`video-consent:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event:  "INSERT",
          schema: "public",
          table:  "video_escalation_audit",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as AuditRowPayload | undefined;
          if (!row) return;
          if (row.patient_response !== null) return;
          setPending(toPendingFromRow(row));
        },
      )
      .on(
        "postgres_changes",
        {
          event:  "UPDATE",
          schema: "public",
          table:  "video_escalation_audit",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as AuditRowPayload | undefined;
          if (!row) return;
          // Only react to the UPDATE that matches the current pending
          // request — stray UPDATEs (past rows) leave the current state
          // untouched. If we weren't in a pending state (modal was never
          // opened because the request predates our mount), the UPDATE
          // is a no-op.
          setPending((prev) => {
            if (!prev || prev.requestId !== row.id) return prev;
            if (row.patient_response === null) return prev;
            if (onResolvedRef.current) {
              onResolvedRef.current(row.patient_response);
            }
            return null;
          });
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [enabled, sessionId]);

  const dismiss = useCallback(() => {
    setPending(null);
  }, []);

  return { pending, loading, dismiss };
}
