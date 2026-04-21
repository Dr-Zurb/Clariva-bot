"use client";

/**
 * `useModalityUpgradeFSM` — reducer + Supabase Realtime subscription
 * that drives `<ModalityUpgradeRequestModal>`'s 6-state machine
 * (Plan 09 · Task 50 · Decision 11 LOCKED).
 *
 * Why a hook (not an in-component reducer):
 *   · Realtime channel setup/teardown is stateful + scoped to the
 *     session — co-locating with the reducer keeps the modal render
 *     pure.
 *   · Page-refresh rehydration (GET /state → then fetch the pending
 *     row directly to read `razorpay_order_id` + `amount_paise`) is
 *     an effectful dance that's easier to test + mock in isolation.
 *
 * **Realtime strategy:** instead of a bespoke backend Broadcast channel
 * (deferred — see inbox follow-up), we subscribe to `postgres_changes`
 * on two tables the patient's Supabase session can SELECT via RLS:
 *
 *   · `modality_change_pending_requests` — UPDATEs where `response` goes
 *     from NULL → terminal (`approved_paid` | `approved_free` | `declined`
 *     | `timeout` | `provider_failure`). This covers doctor-approval,
 *     timeout, decline, and provider-failure transitions.
 *   · `consultation_modality_history` — INSERT events for this session.
 *     Covers the "transition applied" edge: fires when Task 48's executor
 *     commits the history row after the Razorpay webhook resolves.
 *
 * **Local timer safety-net:** a client-side `expiresAt`-anchored timeout
 * dispatches `TIMEOUT_LOCAL` if the server hasn't reported a terminal
 * response by `expiresAt + 2s`. The reducer guard keeps terminal
 * transitions idempotent, so whichever signal fires first wins.
 *
 * @see frontend/components/consultation/ModalityUpgradeRequestModal.tsx
 * @see frontend/lib/api/modality-change.ts
 * @see backend/migrations/076_modality_change_pending_requests.sql (RLS — line 206)
 * @see backend/migrations/075_consultation_modality_history.sql     (RLS — line 348)
 */

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

import { createClient } from "@/lib/supabase/client";
import {
  getModalityChangeState,
  postModalityChangeRequest,
} from "@/lib/api/modality-change";
import {
  openRazorpayCheckout,
  type RazorpayCheckoutOutcome,
} from "@/lib/razorpay-checkout";
import type {
  Modality,
  ModalityChangeResult,
  ModalityHistoryRowInsert,
  ModalityPendingResponse,
  PendingRequestRow,
} from "@/types/modality-change";

// ----------------------------------------------------------------------------
// FSM state shape
// ----------------------------------------------------------------------------

export type ModalState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | {
      kind: "awaiting_approval";
      approvalRequestId: string;
      expiresAt: string;
    }
  | {
      kind: "checkout_ready";
      approvalRequestId: string;
      razorpayOrderId: string;
      amountPaise: number;
    }
  | {
      kind: "checkout_opened";
      approvalRequestId: string;
      razorpayOrderId: string;
    }
  | { kind: "applying_transition"; approvalRequestId: string }
  | { kind: "applied"; toModality: Modality }
  | {
      kind: "declined";
      reason: string;
      cooldownUntil: string;
    }
  | { kind: "timeout"; cooldownUntil: string }
  | { kind: "free_upgrade_approved"; toModality: Modality }
  | { kind: "error"; message: string; retryable: boolean };

// ----------------------------------------------------------------------------
// Actions
// ----------------------------------------------------------------------------

type Action =
  | { type: "RESET" }
  | { type: "SUBMIT_START" }
  | { type: "SUBMIT_FAILED"; message: string; retryable: boolean }
  | {
      type: "PENDING_CREATED";
      approvalRequestId: string;
      expiresAt: string;
    }
  | {
      type: "APPROVED_PAID";
      approvalRequestId: string;
      razorpayOrderId: string;
      amountPaise: number;
    }
  | {
      type: "APPROVED_FREE";
      toModality: Modality;
    }
  | { type: "OPEN_CHECKOUT" }
  | { type: "CHECKOUT_DISMISSED" }
  | { type: "CHECKOUT_SUCCEEDED" }
  | { type: "APPLIED"; toModality: Modality }
  | { type: "DECLINED"; reason: string; cooldownUntil: string }
  | { type: "TIMED_OUT"; cooldownUntil: string }
  | { type: "PROVIDER_FAILURE"; refundInitiated: boolean }
  | { type: "GENERIC_ERROR"; message: string; retryable: boolean };

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

/** 5-minute cooldown after a decline or timeout. Matches Task 50 spec. */
export const RETRY_COOLDOWN_MS = 5 * 60 * 1000;

/** Grace period past `expiresAt` before the client-side timeout fires. */
const TIMEOUT_LOCAL_GRACE_MS = 2_000;

/**
 * Hard client-side deadline while waiting for the post-payment
 * webhook to fire and the history-row INSERT to reach Realtime.
 * Typical <2s; 15s is the "something's stuck" trigger.
 */
const APPLYING_TRANSITION_TIMEOUT_MS = 15_000;

function cooldownUntilNow(): string {
  return new Date(Date.now() + RETRY_COOLDOWN_MS).toISOString();
}

// ----------------------------------------------------------------------------
// Reducer
// ----------------------------------------------------------------------------

function reducer(state: ModalState, action: Action): ModalState {
  switch (action.type) {
    case "RESET":
      return { kind: "idle" };

    case "SUBMIT_START":
      if (state.kind !== "idle") return state;
      return { kind: "submitting" };

    case "SUBMIT_FAILED":
      if (state.kind !== "submitting") return state;
      return { kind: "error", message: action.message, retryable: action.retryable };

    case "PENDING_CREATED":
      // From submitting → awaiting_approval is the happy path. Also
      // accept from idle (re-hydration on mount).
      if (state.kind !== "submitting" && state.kind !== "idle") return state;
      return {
        kind: "awaiting_approval",
        approvalRequestId: action.approvalRequestId,
        expiresAt: action.expiresAt,
      };

    case "APPROVED_PAID":
      // Only react when we're the ones waiting for approval, or we've
      // already re-hydrated into checkout_ready and received a duplicate
      // UPDATE event (no-op). Race: doctor approves paid just as our
      // local timer fires — we MUST accept the paid approval even if we
      // briefly dispatched TIMED_OUT. Reducer guard handles the
      // happy-path; the timer coordinator in the effect layer should
      // cancel itself on any approved_* event.
      if (
        state.kind === "awaiting_approval" &&
        state.approvalRequestId === action.approvalRequestId
      ) {
        return {
          kind: "checkout_ready",
          approvalRequestId: action.approvalRequestId,
          razorpayOrderId: action.razorpayOrderId,
          amountPaise: action.amountPaise,
        };
      }
      return state;

    case "APPROVED_FREE":
      if (state.kind === "awaiting_approval") {
        return { kind: "free_upgrade_approved", toModality: action.toModality };
      }
      return state;

    case "OPEN_CHECKOUT":
      if (state.kind !== "checkout_ready") return state;
      return {
        kind: "checkout_opened",
        approvalRequestId: state.approvalRequestId,
        razorpayOrderId: state.razorpayOrderId,
      };

    case "CHECKOUT_DISMISSED":
      if (state.kind !== "checkout_opened") return state;
      return { kind: "idle" };

    case "CHECKOUT_SUCCEEDED":
      if (state.kind !== "checkout_opened") return state;
      return {
        kind: "applying_transition",
        approvalRequestId: state.approvalRequestId,
      };

    case "APPLIED":
      // Accept from both applying_transition (paid path) and
      // free_upgrade_approved (free path awaiting history INSERT).
      if (
        state.kind === "applying_transition" ||
        state.kind === "free_upgrade_approved"
      ) {
        return { kind: "applied", toModality: action.toModality };
      }
      return state;

    case "DECLINED":
      if (state.kind === "awaiting_approval") {
        return {
          kind: "declined",
          reason: action.reason,
          cooldownUntil: action.cooldownUntil,
        };
      }
      return state;

    case "TIMED_OUT":
      if (state.kind === "awaiting_approval") {
        return { kind: "timeout", cooldownUntil: action.cooldownUntil };
      }
      return state;

    case "PROVIDER_FAILURE":
      // Can fire from awaiting_approval (rare — the row goes
      // provider_failure before any modality applies) or from
      // applying_transition (paid-upgrade executor blew up post-capture).
      return {
        kind: "error",
        message: action.refundInitiated
          ? "Sorry, we couldn't switch to video due to a technical issue. Your payment is being refunded automatically."
          : "Sorry, we couldn't switch modality due to a technical issue. Please try again in a moment.",
        retryable: !action.refundInitiated,
      };

    case "GENERIC_ERROR":
      return {
        kind: "error",
        message: action.message,
        retryable: action.retryable,
      };

    default:
      return state;
  }
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function mapTerminalResponseToAction(
  row: PendingRequestRow,
  requestedTarget: Modality,
): Action | null {
  switch (row.response as ModalityPendingResponse | null) {
    case "approved_paid": {
      if (!row.razorpay_order_id || row.amount_paise == null) {
        // Mid-transition state: doctor stamped `approved_paid` but
        // the billing service hasn't written razorpay_order_id yet.
        // Wait for the next UPDATE (amount_paise + razorpay_order_id
        // land on the same row in a later UPDATE within <1s).
        return null;
      }
      return {
        type: "APPROVED_PAID",
        approvalRequestId: row.id,
        razorpayOrderId: row.razorpay_order_id,
        amountPaise: row.amount_paise,
      };
    }
    case "approved_free":
      return { type: "APPROVED_FREE", toModality: requestedTarget };
    case "declined":
      return {
        type: "DECLINED",
        reason: row.reason ?? "No reason given.",
        cooldownUntil: cooldownUntilNow(),
      };
    case "timeout":
      return { type: "TIMED_OUT", cooldownUntil: cooldownUntilNow() };
    case "provider_failure":
      return { type: "PROVIDER_FAILURE", refundInitiated: true };
    case "allowed":
    case "checkout_cancelled":
    case null:
    case undefined:
      return null;
    default:
      return null;
  }
}

// ----------------------------------------------------------------------------
// Hook
// ----------------------------------------------------------------------------

export interface UseModalityUpgradeFSMArgs {
  open: boolean;
  token: string | null | undefined;
  sessionId: string;
  targetModality: Modality;
  /** Fired when the FSM reaches `applied`. The launcher remounts the room. */
  onAppliedTransition?: (payload: { toModality: Modality }) => void;
}

export interface UseModalityUpgradeFSMResult {
  state: ModalState;
  dispatch: React.Dispatch<Action>;
  /** True while the initial `GET /state` rehydration is in flight. */
  hydrating: boolean;
  /** Attempt a new upgrade — only valid in `idle` / `declined` / `timeout` (after cooldown) / `error` (retryable). */
  submit(input: { reason?: string }): Promise<void>;
  /** Launch the Razorpay modal once `state.kind === 'checkout_ready'`. */
  openCheckout(input: {
    keyId: string;
    displayName: string;
    description: string;
    prefill?: { name?: string; email?: string; contact?: string };
    themeColor?: string;
    notes?: Record<string, string>;
  }): Promise<RazorpayCheckoutOutcome>;
}

export function useModalityUpgradeFSM(
  args: UseModalityUpgradeFSMArgs,
): UseModalityUpgradeFSMResult {
  const { open, token, sessionId, targetModality, onAppliedTransition } = args;

  const [state, dispatch] = useReducer(reducer, { kind: "idle" });
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const onAppliedRef = useRef(onAppliedTransition);
  useEffect(() => {
    onAppliedRef.current = onAppliedTransition;
  }, [onAppliedTransition]);

  const hydratingRef = useRef(false);
  const [, forceRender] = useReducer((v: number) => v + 1, 0);

  // Fire onAppliedTransition exactly once per applied state.
  const appliedFiredRef = useRef(false);
  useEffect(() => {
    if (state.kind === "applied" && !appliedFiredRef.current) {
      appliedFiredRef.current = true;
      try {
        onAppliedRef.current?.({ toModality: state.toModality });
      } catch {
        // never let a consumer's handler crash the FSM.
      }
    }
    if (state.kind === "idle" || state.kind === "submitting") {
      appliedFiredRef.current = false;
    }
  }, [state]);

  // ---- Initial hydration -----------------------------------------------------
  useEffect(() => {
    if (!open) return;
    if (!token || !sessionId) return;
    let cancelled = false;
    hydratingRef.current = true;
    forceRender();

    (async () => {
      try {
        const response = await getModalityChangeState(token, sessionId);
        if (cancelled) return;
        const active = response.state?.activePendingRequest;
        if (!active || active.kind !== "patient_upgrade") {
          hydratingRef.current = false;
          forceRender();
          return;
        }
        // Surface the awaiting_approval state first so the UI has copy
        // to render, then fetch the full row to detect whether we're
        // already in approved_paid / approved_free.
        dispatch({
          type: "PENDING_CREATED",
          approvalRequestId: active.id,
          expiresAt: active.expiresAt,
        });

        const client = createClient();
        const { data, error } = await client
          .from("modality_change_pending_requests")
          .select(
            "id, session_id, initiated_by, requested_modality, reason, preset_reason_code, amount_paise, razorpay_order_id, requested_at, expires_at, responded_at, response, correlation_id",
          )
          .eq("id", active.id)
          .maybeSingle<PendingRequestRow>();
        if (cancelled) return;
        if (error || !data) {
          hydratingRef.current = false;
          forceRender();
          return;
        }
        if (data.response) {
          const mapped = mapTerminalResponseToAction(data, targetModality);
          if (mapped) dispatch(mapped);
        }
      } catch (err) {
        if (cancelled) return;
        dispatch({
          type: "GENERIC_ERROR",
          message:
            err instanceof Error
              ? err.message
              : "Couldn't load the upgrade status. Please retry.",
          retryable: true,
        });
      } finally {
        if (!cancelled) {
          hydratingRef.current = false;
          forceRender();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, sessionId, targetModality, token]);

  // ---- Realtime subscription -------------------------------------------------
  useEffect(() => {
    if (!open) return;
    if (!sessionId) return;
    const client = createClient();
    const channel = client
      .channel(`modality-upgrade:${sessionId}`)
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
          const current = stateRef.current;
          // Ignore UPDATEs that aren't ours.
          const activeId =
            current.kind === "awaiting_approval" ||
            current.kind === "checkout_ready" ||
            current.kind === "checkout_opened" ||
            current.kind === "applying_transition"
              ? current.approvalRequestId
              : null;
          if (activeId && row.id !== activeId) return;
          const mapped = mapTerminalResponseToAction(row, targetModality);
          if (mapped) dispatch(mapped);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "consultation_modality_history",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as ModalityHistoryRowInsert | undefined;
          if (!row) return;
          const current = stateRef.current;
          if (
            current.kind === "applying_transition" ||
            current.kind === "free_upgrade_approved"
          ) {
            dispatch({ type: "APPLIED", toModality: row.to_modality });
          }
        },
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [open, sessionId, targetModality]);

  // ---- Local expiry timer safety-net -----------------------------------------
  useEffect(() => {
    if (state.kind !== "awaiting_approval") return;
    const deadline =
      new Date(state.expiresAt).getTime() + TIMEOUT_LOCAL_GRACE_MS;
    const ms = deadline - Date.now();
    if (ms <= 0) {
      dispatch({ type: "TIMED_OUT", cooldownUntil: cooldownUntilNow() });
      return;
    }
    const id = window.setTimeout(() => {
      dispatch({ type: "TIMED_OUT", cooldownUntil: cooldownUntilNow() });
    }, ms);
    return () => window.clearTimeout(id);
  }, [state]);

  // ---- applying_transition hard timeout --------------------------------------
  useEffect(() => {
    if (state.kind !== "applying_transition") return;
    const id = window.setTimeout(() => {
      dispatch({
        type: "GENERIC_ERROR",
        message:
          "Something went wrong while switching modality. Please contact support if you were charged.",
        retryable: false,
      });
    }, APPLYING_TRANSITION_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [state]);

  // ---- Actions ---------------------------------------------------------------
  const submit = useCallback(
    async (input: { reason?: string }) => {
      if (!token || !sessionId) {
        dispatch({
          type: "GENERIC_ERROR",
          message: "Session not available. Please refresh and try again.",
          retryable: true,
        });
        return;
      }
      dispatch({ type: "SUBMIT_START" });
      try {
        const result: ModalityChangeResult = await postModalityChangeRequest(
          token,
          sessionId,
          {
            requestedModality: targetModality,
            initiatedBy: "patient",
            ...(input.reason && input.reason.trim().length > 0
              ? { reason: input.reason.trim() }
              : {}),
          },
        );
        if (result.kind === "pending_doctor_approval") {
          dispatch({
            type: "PENDING_CREATED",
            approvalRequestId: result.approvalRequestId,
            expiresAt: result.approvalExpiresAt,
          });
          return;
        }
        if (result.kind === "rejected") {
          dispatch({
            type: "SUBMIT_FAILED",
            message: friendlyRejectMessage(result.reason),
            retryable: rejectIsRetryable(result.reason),
          });
          return;
        }
        // Any other kind here is a contract drift — surface it so
        // we fail loudly in dev.
        dispatch({
          type: "SUBMIT_FAILED",
          message: "Unexpected response from the server. Please retry.",
          retryable: true,
        });
      } catch (err) {
        dispatch({
          type: "SUBMIT_FAILED",
          message:
            err instanceof Error
              ? err.message
              : "Couldn't send the request. Please retry.",
          retryable: true,
        });
      }
    },
    [sessionId, targetModality, token],
  );

  const openCheckout = useCallback(
    async (input: {
      keyId: string;
      displayName: string;
      description: string;
      prefill?: { name?: string; email?: string; contact?: string };
      themeColor?: string;
      notes?: Record<string, string>;
    }): Promise<RazorpayCheckoutOutcome> => {
      const current = stateRef.current;
      if (current.kind !== "checkout_ready") {
        throw new Error(
          `openCheckout can only be called from checkout_ready (was ${current.kind}).`,
        );
      }
      const { razorpayOrderId, amountPaise } = current;
      dispatch({ type: "OPEN_CHECKOUT" });
      try {
        const outcome = await openRazorpayCheckout({
          keyId: input.keyId,
          razorpayOrderId,
          amountPaise,
          name: input.displayName,
          description: input.description,
          ...(input.prefill ? { prefill: input.prefill } : {}),
          ...(input.themeColor ? { themeColor: input.themeColor } : {}),
          ...(input.notes ? { notes: input.notes } : {}),
        });
        if (outcome.status === "success") {
          dispatch({ type: "CHECKOUT_SUCCEEDED" });
        } else {
          dispatch({ type: "CHECKOUT_DISMISSED" });
        }
        return outcome;
      } catch (err) {
        dispatch({
          type: "GENERIC_ERROR",
          message:
            err instanceof Error
              ? err.message
              : "Couldn't open the Razorpay checkout. Please retry.",
          retryable: true,
        });
        return { status: "dismissed" };
      }
    },
    [],
  );

  return useMemo(
    () => ({
      state,
      dispatch,
      hydrating: hydratingRef.current,
      submit,
      openCheckout,
    }),
    [state, submit, openCheckout],
  );
}

// ----------------------------------------------------------------------------
// Reject reason → copy / retryability.
// ----------------------------------------------------------------------------

function friendlyRejectMessage(reason: string): string {
  switch (reason) {
    case "session_not_active":
      return "This consultation is no longer active.";
    case "no_op_transition":
      return "You're already on that modality.";
    case "max_upgrades_reached":
      return "You've already upgraded once in this consultation.";
    case "pending_request_exists":
      return "An upgrade request is already in flight. Please wait a moment.";
    case "reason_required":
    case "reason_out_of_bounds":
      return "Please adjust your reason and try again.";
    case "forbidden":
      return "You don't have permission to upgrade this consult.";
    case "provider_failure":
      return "Provider failure. Please retry in a moment.";
    case "internal_error":
      return "Something went wrong on our end. Please retry.";
    default:
      return "Couldn't send the request. Please retry.";
  }
}

function rejectIsRetryable(reason: string): boolean {
  switch (reason) {
    case "max_upgrades_reached":
    case "session_not_active":
    case "no_op_transition":
    case "forbidden":
      return false;
    default:
      return true;
  }
}
