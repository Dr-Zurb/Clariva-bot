"use client";

/**
 * `useDoctorPendingUpgradeApproval` — doctor-side auto-open driver for
 * `<ModalityUpgradeApprovalModal>` (Plan 09 · Task 51 · Decision 11 LOCKED).
 *
 * Surface: when a patient calls `POST /modality-change/request` with
 * `initiatedBy='patient'` + an upgrade direction, the state machine
 * inserts a row into `modality_change_pending_requests` with
 * `initiated_by='patient'` + `response IS NULL` + `expires_at = now() + 90s`.
 * This hook subscribes to the Supabase `postgres_changes` INSERT stream
 * filtered to `session_id=eq.${sessionId}` and surfaces the pending row
 * so the parent (doctor room wrapper) can mount the approval modal.
 *
 * Also performs an initial mount probe via `GET /modality-change/state`
 * so a doctor who refreshed their tab mid-90s-window still sees the
 * modal. Once a terminal `response` fires (UPDATE event), the hook
 * clears its local state so the modal closes — mirrors
 * `usePatientVideoConsentRequest` (Plan 08 Task 41's patient
 * counterpart) almost verbatim.
 *
 * @see frontend/hooks/useModalityUpgradeFSM.ts (patient-side analogue)
 * @see frontend/lib/realtime-video-escalation.ts (pattern source)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { getModalityChangeState } from "@/lib/api/modality-change";
import type {
  Modality,
  ModalityPresetReasonCode,
  PendingRequestRow,
} from "@/types/modality-change";

export interface PendingUpgradeApproval {
  approvalRequestId: string;
  requestedModality: "voice" | "video";
  /** Patient's optional context (nullable). */
  patientReason: string | null;
  /** Optional radio-button tag from the patient's submit. */
  patientPresetReasonCode: ModalityPresetReasonCode | null;
  /** ISO-8601 — 90s from the request insert. */
  expiresAt: string;
  /** ISO-8601 — when the row was created (doctor UI can stamp "requested 12s ago"). */
  requestedAt: string;
}

export interface UseDoctorPendingUpgradeApprovalArgs {
  sessionId: string | null | undefined;
  token: string | null | undefined;
  /** `false` disables the hook (e.g. when the doctor tab unmounts). */
  enabled?: boolean;
  /** Fired when the pending row transitions to a terminal response. */
  onResolved?: (outcome: "approved_paid" | "approved_free" | "declined" | "timeout" | "provider_failure") => void;
}

export interface UseDoctorPendingUpgradeApprovalResult {
  /** Non-null while the doctor should see the approval modal. */
  pending: PendingUpgradeApproval | null;
  loading: boolean;
  /** Clear local state after a successful POST so the UI doesn't wait on the UPDATE round-trip. */
  dismiss: () => void;
}

function toUpgradeTargetModality(
  modality: Modality,
): "voice" | "video" | null {
  if (modality === "voice" || modality === "video") return modality;
  return null;
}

function toPendingFromRow(row: PendingRequestRow): PendingUpgradeApproval | null {
  if (row.initiated_by !== "patient") return null;
  const target = toUpgradeTargetModality(row.requested_modality);
  if (!target) return null;
  if (row.response) return null; // already terminal
  return {
    approvalRequestId: row.id,
    requestedModality: target,
    patientReason: row.reason,
    patientPresetReasonCode: row.preset_reason_code,
    expiresAt: row.expires_at,
    requestedAt: row.requested_at,
  };
}

export function useDoctorPendingUpgradeApproval(
  args: UseDoctorPendingUpgradeApprovalArgs,
): UseDoctorPendingUpgradeApprovalResult {
  const { sessionId, token, enabled = true, onResolved } = args;
  const [pending, setPending] = useState<PendingUpgradeApproval | null>(null);
  const [loading, setLoading] = useState(true);
  const onResolvedRef = useRef(onResolved);

  useEffect(() => {
    onResolvedRef.current = onResolved;
  }, [onResolved]);

  // ---- Initial mount probe ---------------------------------------------------
  const refresh = useCallback(async () => {
    if (!enabled || !sessionId || !token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const stateResponse = await getModalityChangeState(token, sessionId);
      const active = stateResponse.state?.activePendingRequest;
      if (!active || active.kind !== "patient_upgrade") {
        setPending(null);
        return;
      }
      // Enrich via direct row lookup — `GET /state` masks `reason` +
      // `preset_reason_code` by design (matches Task 50 rehydration).
      const client = createClient();
      const { data, error } = await client
        .from("modality_change_pending_requests")
        .select(
          "id, session_id, initiated_by, requested_modality, reason, preset_reason_code, amount_paise, razorpay_order_id, requested_at, expires_at, responded_at, response, correlation_id",
        )
        .eq("id", active.id)
        .maybeSingle<PendingRequestRow>();
      if (error || !data) {
        // Fall back to the state projection (no reason surfaced).
        const target = toUpgradeTargetModality(active.requestedModality);
        if (!target) {
          setPending(null);
          return;
        }
        setPending({
          approvalRequestId: active.id,
          requestedModality: target,
          patientReason: null,
          patientPresetReasonCode: null,
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

  // ---- Realtime subscription -------------------------------------------------
  useEffect(() => {
    if (!enabled || !sessionId) return;
    const client = createClient();
    const channel = client
      .channel(`doctor-approval:${sessionId}`)
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
            if (!prev || prev.approvalRequestId !== row.id) return prev;
            if (row.response === null) return prev;
            if (onResolvedRef.current) {
              const outcome = row.response;
              if (
                outcome === "approved_paid" ||
                outcome === "approved_free" ||
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
