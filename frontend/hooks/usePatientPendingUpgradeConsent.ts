"use client";

/**
 * `usePatientPendingUpgradeConsent` — patient-side auto-open driver for
 * `<PatientUpgradeConsentModal>` (Plan 09 · Task 52 · Decision 11 LOCKED).
 *
 * Mirror of Task 51's `useDoctorPendingUpgradeApproval` — but scoped to
 * the OPPOSITE direction of the modality_change_pending_requests stream:
 * when the doctor calls `POST /modality-change/request` with
 * `initiatedBy='doctor'` + an upgrade direction, Task 47's state machine
 * inserts a row with `initiated_by='doctor'` + `response IS NULL` +
 * `expires_at = now() + 60s`. This hook subscribes to `postgres_changes`
 * INSERT events on that table filtered by `session_id=eq.${sessionId}`
 * and surfaces the pending row so the patient-side room wrapper can
 * mount the consent modal.
 *
 * Also performs an initial mount probe via `GET /modality-change/state`
 * so a patient who refreshes their tab mid-60s-window still sees the
 * consent modal (re-hydration — matches Plan 08 Task 41's patient
 * consent re-hydration + Task 50's own re-hydration path).
 *
 * Once a terminal `response` fires (UPDATE event — `allowed`, `declined`,
 * `timeout`, `provider_failure`) the hook clears its local state so the
 * modal closes automatically.
 *
 * @see frontend/hooks/useDoctorPendingUpgradeApproval.ts
 * @see frontend/components/consultation/PatientUpgradeConsentModal.tsx
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { getModalityChangeState } from "@/lib/api/modality-change";
import type {
  Modality,
  ModalityPresetReasonCode,
  PendingRequestRow,
} from "@/types/modality-change";

export interface PendingUpgradeConsent {
  consentRequestId: string;
  /** Modality the doctor wants to switch to. */
  targetModality: "voice" | "video";
  /** Doctor's mandated reason (Task 51 form required 5..200 chars + preset). */
  doctorReason: string;
  /** Optional radio-button tag from the doctor's submit. */
  doctorPresetReasonCode: ModalityPresetReasonCode | null;
  /** ISO-8601 — 60s from the request insert. */
  expiresAt: string;
  /** ISO-8601 — when the row was created. */
  requestedAt: string;
}

export interface UsePatientPendingUpgradeConsentArgs {
  sessionId: string | null | undefined;
  token: string | null | undefined;
  enabled?: boolean;
  /** Fired once the pending row transitions to a terminal response. */
  onResolved?: (
    outcome:
      | "allowed"
      | "declined"
      | "timeout"
      | "provider_failure",
  ) => void;
}

export interface UsePatientPendingUpgradeConsentResult {
  pending: PendingUpgradeConsent | null;
  loading: boolean;
  /** Clears local state optimistically after the patient posts a decision. */
  dismiss: () => void;
}

function toUpgradeTargetModality(
  modality: Modality,
): "voice" | "video" | null {
  if (modality === "voice" || modality === "video") return modality;
  return null;
}

function toPendingFromRow(row: PendingRequestRow): PendingUpgradeConsent | null {
  if (row.initiated_by !== "doctor") return null;
  const target = toUpgradeTargetModality(row.requested_modality);
  if (!target) return null;
  if (row.response) return null; // already terminal
  return {
    consentRequestId: row.id,
    targetModality: target,
    doctorReason: row.reason ?? "",
    doctorPresetReasonCode: row.preset_reason_code,
    expiresAt: row.expires_at,
    requestedAt: row.requested_at,
  };
}

export function usePatientPendingUpgradeConsent(
  args: UsePatientPendingUpgradeConsentArgs,
): UsePatientPendingUpgradeConsentResult {
  const { sessionId, token, enabled = true, onResolved } = args;
  const [pending, setPending] = useState<PendingUpgradeConsent | null>(null);
  const [loading, setLoading] = useState(true);
  const onResolvedRef = useRef(onResolved);

  useEffect(() => {
    onResolvedRef.current = onResolved;
  }, [onResolved]);

  const refresh = useCallback(async () => {
    if (!enabled || !sessionId || !token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const stateResponse = await getModalityChangeState(token, sessionId);
      const active = stateResponse.state?.activePendingRequest;
      if (!active || active.kind !== "doctor_upgrade") {
        setPending(null);
        return;
      }
      // Enrich via direct row lookup — the HTTP projection masks `reason`
      // and `preset_reason_code` (matches Task 51's re-hydration path).
      const client = createClient();
      const { data, error } = await client
        .from("modality_change_pending_requests")
        .select(
          "id, session_id, initiated_by, requested_modality, reason, preset_reason_code, amount_paise, razorpay_order_id, requested_at, expires_at, responded_at, response, correlation_id",
        )
        .eq("id", active.id)
        .maybeSingle<PendingRequestRow>();
      if (error || !data) {
        const target = toUpgradeTargetModality(active.requestedModality);
        if (!target) {
          setPending(null);
          return;
        }
        setPending({
          consentRequestId: active.id,
          targetModality: target,
          // Fall back to empty string — Task 51 guarantees the doctor
          // provided a reason (5..200 chars required), so the only way
          // we land here with no reason is an RLS SELECT miss; the
          // consent modal renders a graceful placeholder.
          doctorReason: "",
          doctorPresetReasonCode: null,
          expiresAt: active.expiresAt,
          requestedAt: active.requestedAt,
        });
        return;
      }
      setPending(toPendingFromRow(data));
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

  useEffect(() => {
    if (!enabled || !sessionId) return;
    const client = createClient();
    const channel = client
      .channel(`patient-consent:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "modality_change_pending_requests",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as PendingRequestRow | undefined;
          if (!row) return;
          const next = toPendingFromRow(row);
          if (next) setPending(next);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "modality_change_pending_requests",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as PendingRequestRow | undefined;
          if (!row) return;
          setPending((prev) => {
            if (!prev || prev.consentRequestId !== row.id) return prev;
            if (row.response === null) return prev;
            if (onResolvedRef.current) {
              const outcome = row.response;
              if (
                outcome === "allowed" ||
                outcome === "declined" ||
                outcome === "timeout" ||
                outcome === "provider_failure"
              ) {
                onResolvedRef.current(outcome);
              }
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

  return useMemo(
    () => ({ pending, loading, dismiss }),
    [pending, loading, dismiss],
  );
}
