"use client";

/**
 * `<ModalityChangeLauncher>` — controls-bar entry point for mid-consult
 * modality switching (Plan 09 · Task 54 · Decision 11 LOCKED).
 *
 * Mounted inside every room via `<LiveConsultPanel modalitySwitchSlot>`
 * (the slot is already reserved — see `LiveConsultPanel.tsx`). Renders
 * a single `🔀 Change modality` button. Clicking opens a popover with
 * the user's role-appropriate options:
 *
 *   · Patient — upgrade picker (only modalities strictly above
 *     current) + downgrade picker (strictly below). Both surfaced for
 *     mental-model symmetry; plan-exact behaviour was "patient sees
 *     upgrade only" but Task 54 Notes §1 argues (and this task adopts)
 *     the symmetric launcher.
 *   · Doctor  — same shape, but the modals wired to each CTA are the
 *     doctor-initiated variants from Task 51.
 *
 * Rate-limit / pending-request state comes from the server via
 * `GET /modality-change/state`. The launcher re-fetches on mount,
 * on every `postgres_changes` UPDATE on
 * `modality_change_pending_requests` (UPDATE for terminal responses)
 * and every INSERT on `consultation_modality_history` (new
 * transition committed), so the button states stay in lock-step with
 * the authoritative server counters without caller intervention.
 *
 * Modal mounting (click-routed):
 *   · patient × upgrade   → <ModalityUpgradeRequestModal>        (Task 50)
 *   · patient × downgrade → <PatientDowngradeModal>              (Task 52)
 *   · doctor  × upgrade   → <DoctorUpgradeInitiationModal>       (Task 51)
 *   · doctor  × downgrade → <ModalityDowngradeModal>             (Task 51)
 *
 * The auto-opening system-initiated modals (approval / consent) are
 * NOT mounted here — they belong at the room wrapper's top level per
 * Task 51 / 52 doctrine. Their auto-open hooks
 * (`useDoctorPendingUpgradeApproval` + `usePatientPendingUpgradeConsent`)
 * are consumer-facing and not bound to this component.
 *
 * @see frontend/components/consultation/LiveConsultPanel.tsx
 * @see frontend/lib/modality-pricing-display.ts
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-54-modality-change-launcher-in-all-three-rooms.md
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import ModalityUpgradeRequestModal from "./ModalityUpgradeRequestModal";
import PatientDowngradeModal from "./PatientDowngradeModal";
import DoctorUpgradeInitiationModal from "./DoctorUpgradeInitiationModal";
import ModalityDowngradeModal from "./ModalityDowngradeModal";
import { createClient } from "@/lib/supabase/client";
import {
  getModalityChangeState,
  type ModalityChangeStateResponse,
} from "@/lib/api/modality-change";
import { formatInrPaise } from "@/lib/modality-pricing-display";
import type {
  Modality,
  ModalityChangeActivePending,
  ModalityHistoryRowInsert,
  PendingRequestRow,
} from "@/types/modality-change";

// ----------------------------------------------------------------------------
// Modality-ladder helpers — mirrored from the backend ENUM order
// (`text` < `voice` < `video`). Kept locally to avoid a cross-package
// utility dep for what is a 3-element array.
// ----------------------------------------------------------------------------

const MODALITY_ORDER: ReadonlyArray<Modality> = ["text", "voice", "video"];

function indexOfModality(m: Modality): number {
  return MODALITY_ORDER.indexOf(m);
}

function upgradeTargetsFor(current: Modality): Modality[] {
  const idx = indexOfModality(current);
  if (idx < 0) return [];
  return MODALITY_ORDER.slice(idx + 1);
}

function downgradeTargetsFor(current: Modality): Modality[] {
  const idx = indexOfModality(current);
  if (idx <= 0) return [];
  return MODALITY_ORDER.slice(0, idx);
}

function capitalize(m: string): string {
  return m.charAt(0).toUpperCase() + m.slice(1);
}

// ----------------------------------------------------------------------------
// Pricing map (paise) — launcher accepts an optional `pricing` prop from
// the host room. When omitted we fall back to the delta-unknown copy.
// A future task (see inbox follow-up on `GET /state` pricing block) will
// let us fetch pricing alongside state; v1 relies on prop-threaded fees.
// ----------------------------------------------------------------------------

export interface ModalityChangeLauncherPricing {
  text: { feePaise: number };
  voice: { feePaise: number };
  video: { feePaise: number };
}

function deltaPaise(
  pricing: ModalityChangeLauncherPricing | null | undefined,
  from: Modality,
  to: Modality,
): number | null {
  if (!pricing) return null;
  const a = pricing[from]?.feePaise;
  const b = pricing[to]?.feePaise;
  if (typeof a !== "number" || typeof b !== "number") return null;
  return Math.abs(b - a);
}

// ----------------------------------------------------------------------------
// Props
// ----------------------------------------------------------------------------

export interface ModalityChangeLauncherProps {
  sessionId: string;
  token: string | null | undefined;
  userRole: "patient" | "doctor";
  /**
   * Only supplied when the host already has a session-scoped pricing
   * lookup; absent otherwise. Affects the delta-price strings inside
   * the popover only — submit paths pass server-computed amounts.
   */
  pricing?: ModalityChangeLauncherPricing;
  /** Passed through to patient-facing modals that display the doctor's name. */
  doctorDisplayName?: string;
  /** Passed through to doctor-facing modals that address the patient by name. */
  patientDisplayName?: string;
  /**
   * Fired after a transition is applied (patient upgrade paid/free or
   * a doctor-/patient-initiated downgrade). Host uses this signal to
   * remount the destination room.
   */
  onTransitionApplied?: (result: {
    toModality: Modality;
    newAccessToken?: string;
  }) => void;
  /** Hide the launcher entirely (e.g. after the session ends). */
  disabled?: boolean;
}

// ----------------------------------------------------------------------------
// Internal UI phase (which modal, if any, is currently open).
// ----------------------------------------------------------------------------

type OpenModal =
  | { kind: "none" }
  | { kind: "patient_upgrade"; target: "voice" | "video" }
  | { kind: "patient_downgrade"; target: "text" | "voice" }
  | { kind: "doctor_upgrade"; target: "voice" | "video" }
  | { kind: "doctor_downgrade"; target: "text" | "voice" };

// ----------------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------------

export default function ModalityChangeLauncher(
  props: ModalityChangeLauncherProps,
): JSX.Element | null {
  const {
    sessionId,
    token,
    userRole,
    pricing,
    doctorDisplayName,
    patientDisplayName,
    onTransitionApplied,
    disabled,
  } = props;

  const [state, setState] = useState<ModalityChangeStateResponse["state"]>(
    null,
  );
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<boolean>(false);
  const [openModal, setOpenModal] = useState<OpenModal>({ kind: "none" });
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // ---- Fetch state ---------------------------------------------------------
  const refresh = useCallback(async () => {
    if (!sessionId || !token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await getModalityChangeState(token, sessionId);
      setState(response.state);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't load modality-change state.",
      );
    } finally {
      setLoading(false);
    }
  }, [sessionId, token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ---- Realtime refresh triggers ------------------------------------------
  useEffect(() => {
    if (!sessionId) return;
    const client = createClient();
    const channel = client
      .channel(`modality-launcher:${sessionId}`)
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
          // Optimistic counter/guard update — avoids a race where the
          // popover re-opens before the refresh lands.
          void refresh();
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
          if (!row?.response) return;
          void refresh();
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
          void refresh();
          if (onTransitionApplied) {
            try {
              onTransitionApplied({ toModality: row.to_modality });
            } catch {
              // never let consumer-handler errors crash the launcher.
            }
          }
        },
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [sessionId, refresh, onTransitionApplied]);

  // ---- Close popover on outside-click / escape ----------------------------
  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener("mousedown", onClickOutside);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // ---- Derived state -------------------------------------------------------
  const currentModality: Modality = state?.currentModality ?? "text";
  const upgradeCount = state?.upgradeCount ?? 0;
  const downgradeCount = state?.downgradeCount ?? 0;
  const activePending: ModalityChangeActivePending | null =
    state?.activePendingRequest ?? null;

  const upgradeTargets = useMemo<Modality[]>(
    () => upgradeTargetsFor(currentModality),
    [currentModality],
  );
  const downgradeTargets = useMemo<Modality[]>(
    () => downgradeTargetsFor(currentModality),
    [currentModality],
  );

  const upgradeBlocked = upgradeCount >= 1;
  const downgradeBlocked = downgradeCount >= 1;
  const anythingPending = Boolean(activePending);
  const nothingToOffer =
    upgradeTargets.length === 0 && downgradeTargets.length === 0;

  const bothExhausted =
    (upgradeTargets.length === 0 || upgradeBlocked) &&
    (downgradeTargets.length === 0 || downgradeBlocked);

  const launcherDisabled =
    disabled ||
    loading ||
    Boolean(error) ||
    nothingToOffer ||
    anythingPending ||
    bothExhausted;

  const disabledTooltip = (() => {
    if (disabled) return "Modality change disabled.";
    if (loading) return "Loading…";
    if (error) return "Modality change unavailable. Retry shortly.";
    if (anythingPending) {
      if (activePending?.kind === "patient_upgrade") {
        return userRole === "doctor"
          ? "Patient's request is pending your response."
          : "Waiting for doctor to respond.";
      }
      if (activePending?.kind === "doctor_upgrade") {
        return userRole === "patient"
          ? "Waiting for your consent response."
          : "Waiting for patient to consent.";
      }
      return "Another modality request is in flight.";
    }
    if (nothingToOffer) return "No modality changes available.";
    if (bothExhausted)
      return "Max modality changes used for this consult — book a follow-up appointment for further changes.";
    return "";
  })();

  // ---- Handlers for each CTA ----------------------------------------------
  const handleUpgradeClick = useCallback(
    (target: Modality) => {
      setOpen(false);
      if (target === "text") return; // cannot upgrade to text (base tier)
      if (userRole === "patient") {
        setOpenModal({ kind: "patient_upgrade", target: target as "voice" | "video" });
      } else {
        setOpenModal({ kind: "doctor_upgrade", target: target as "voice" | "video" });
      }
    },
    [userRole],
  );

  const handleDowngradeClick = useCallback(
    (target: Modality) => {
      setOpen(false);
      if (target === "video") return; // cannot downgrade to video (top tier)
      if (userRole === "patient") {
        setOpenModal({ kind: "patient_downgrade", target: target as "text" | "voice" });
      } else {
        setOpenModal({ kind: "doctor_downgrade", target: target as "text" | "voice" });
      }
    },
    [userRole],
  );

  const closeOpenModal = useCallback(() => {
    setOpenModal({ kind: "none" });
    void refresh();
  }, [refresh]);

  // ---- Upgrade / downgrade list rendering ---------------------------------
  const renderUpgradeItem = (target: Modality): JSX.Element => {
    const delta = deltaPaise(pricing, currentModality, target);
    const isDisabled = upgradeBlocked;
    const label = (() => {
      if (userRole === "doctor") {
        return `${capitalize(target)} — free for patient`;
      }
      if (delta !== null) {
        return `${capitalize(target)} — normally ${formatInrPaise(delta)} more`;
      }
      return capitalize(target);
    })();
    return (
      <button
        key={`up-${target}`}
        type="button"
        role="menuitem"
        onClick={() => handleUpgradeClick(target)}
        disabled={isDisabled}
        title={isDisabled ? "Max 1 upgrade per consult used" : undefined}
        className="flex min-h-[48px] w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-gray-800 hover:bg-blue-50 focus:bg-blue-50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span aria-hidden>▲</span>
        <span>{label}</span>
      </button>
    );
  };

  const renderDowngradeItem = (target: Modality): JSX.Element => {
    const delta = deltaPaise(pricing, currentModality, target);
    const isDisabled = downgradeBlocked;
    const label = (() => {
      if (userRole === "doctor") {
        return delta !== null
          ? `${capitalize(target)} — auto-refund ${formatInrPaise(delta)}`
          : `${capitalize(target)} — auto-refund`;
      }
      return `${capitalize(target)} — no refund`;
    })();
    return (
      <button
        key={`down-${target}`}
        type="button"
        role="menuitem"
        onClick={() => handleDowngradeClick(target)}
        disabled={isDisabled}
        title={isDisabled ? "Max 1 downgrade per consult used" : undefined}
        className="flex min-h-[48px] w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-gray-800 hover:bg-amber-50 focus:bg-amber-50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span aria-hidden>▼</span>
        <span>{label}</span>
      </button>
    );
  };

  // ---- Render --------------------------------------------------------------
  if (nothingToOffer && !anythingPending && !loading && !error) {
    // Neither direction possible (shouldn't occur in practice — every
    // modality has at least one neighbour on the ladder — defensive).
    return null;
  }

  return (
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-disabled={launcherDisabled}
        title={launcherDisabled ? disabledTooltip : "Change modality"}
        onClick={() => {
          if (launcherDisabled) return;
          setOpen((prev) => !prev);
        }}
        className="inline-flex min-h-[48px] items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
      >
        <span aria-hidden>🔀</span>
        <span>Change modality</span>
      </button>

      {open && !launcherDisabled && (
        <div
          ref={popoverRef}
          role="menu"
          aria-label="Modality change options"
          className="absolute bottom-full right-0 z-40 mb-2 w-72 rounded-lg border border-gray-200 bg-white p-2 shadow-xl"
        >
          <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Change modality
          </p>

          {upgradeTargets.length > 0 && (
            <div className="mt-1">
              <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                Upgrade to
              </p>
              <div className="flex flex-col">
                {upgradeTargets.map(renderUpgradeItem)}
              </div>
            </div>
          )}

          {downgradeTargets.length > 0 && (
            <div className="mt-2">
              <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                Downgrade to
              </p>
              <div className="flex flex-col">
                {downgradeTargets.map(renderDowngradeItem)}
              </div>
            </div>
          )}

          <p className="mt-2 px-2 py-1 text-[11px] text-gray-500">
            Max 1 upgrade + 1 downgrade per consult.
          </p>
        </div>
      )}

      {/* Click-launched modals — only one mounts at a time. */}
      {openModal.kind === "patient_upgrade" && (
        <ModalityUpgradeRequestModal
          isOpen
          onClose={closeOpenModal}
          token={token}
          sessionId={sessionId}
          currentModality={currentModality as "text" | "voice"}
          targetModality={openModal.target}
          doctorDisplayName={doctorDisplayName ?? "Your doctor"}
          hasRemainingUpgrade={!upgradeBlocked}
          onAppliedTransition={(payload) => {
            try {
              onTransitionApplied?.({ toModality: payload.toModality });
            } catch {
              // ignore.
            }
          }}
        />
      )}

      {openModal.kind === "patient_downgrade" && (
        <PatientDowngradeModal
          isOpen
          onClose={closeOpenModal}
          token={token}
          sessionId={sessionId}
          currentModality={currentModality as "voice" | "video"}
          targetModality={openModal.target}
          onSubmitted={(payload) => {
            try {
              onTransitionApplied?.({ toModality: payload.toModality });
            } catch {
              // ignore.
            }
          }}
        />
      )}

      {openModal.kind === "doctor_upgrade" && (
        <DoctorUpgradeInitiationModal
          isOpen
          onClose={closeOpenModal}
          token={token}
          sessionId={sessionId}
          currentModality={currentModality as "text" | "voice"}
          targetModality={openModal.target}
          onApplied={(payload) => {
            try {
              onTransitionApplied?.({ toModality: payload.toModality });
            } catch {
              // ignore.
            }
          }}
        />
      )}

      {openModal.kind === "doctor_downgrade" && (
        <ModalityDowngradeModal
          isOpen
          onClose={closeOpenModal}
          token={token}
          sessionId={sessionId}
          currentModality={currentModality as "voice" | "video"}
          targetModality={openModal.target}
          refundAmountPaise={
            deltaPaise(pricing, currentModality, openModal.target) ?? 0
          }
          onSubmitted={(payload) => {
            try {
              onTransitionApplied?.({ toModality: payload.toModality });
            } catch {
              // ignore.
            }
          }}
        />
      )}

      {/*
        Unused — the `patientDisplayName` prop is reserved for a future
        enhancement where the doctor-side modals address the patient by
        name. Doctor modals currently derive the context from state.
      */}
      <span hidden aria-hidden>
        {patientDisplayName}
      </span>
    </div>
  );
}
