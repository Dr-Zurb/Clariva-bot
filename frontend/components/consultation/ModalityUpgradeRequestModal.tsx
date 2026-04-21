"use client";

/**
 * `<ModalityUpgradeRequestModal>` — Plan 09 · Task 50 · Decision 11 LOCKED.
 *
 * Patient-side UI orchestrator for the mid-consult upgrade flow. Walks
 * the patient through all six FSM states exposed by
 * `useModalityUpgradeFSM`:
 *
 *   1. `idle`                   — request form (copy + optional reason).
 *   2. `submitting`             — inline spinner on [Send Request].
 *   3. `awaiting_approval`      — 90s countdown to doctor decision.
 *   4. `checkout_ready`         — "Pay ₹N with Razorpay" CTA.
 *   5. `checkout_opened`        — Razorpay SDK modal is live; host dimmed.
 *   6. `applying_transition`    — "Switching to video…" spinner.
 *   + terminal: `applied` / `free_upgrade_approved` / `declined` / `timeout` / `error`.
 *
 * The reducer + Realtime subscription live in
 * `useModalityUpgradeFSM`; this component is the rendering shell +
 * the checkout tap handler.
 *
 * **Cooldown handling:** `declined` / `timeout` states surface a 5-min
 * countdown. When the cooldown elapses, the modal doesn't re-enable
 * [Send Request] inline — the launcher (Task 54) re-fetches
 * `GET /modality-change/state` on its own cadence and re-enables its
 * trigger button once the server-side rate-limit window closes.
 *
 * **Accessibility:** `role="dialog"` + focus-trap + ESC-only-in-safe-states
 * + `aria-live="polite"` announcements for state transitions.
 * `prefers-reduced-motion` media query suppresses countdown pulse +
 * success-state animation.
 *
 * @see frontend/hooks/useModalityUpgradeFSM.ts
 * @see frontend/lib/razorpay-checkout.ts
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-50-patient-modality-upgrade-request-modal.md
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  useModalityUpgradeFSM,
  type ModalState,
} from "@/hooks/useModalityUpgradeFSM";
import type { Modality } from "@/types/modality-change";

// ----------------------------------------------------------------------------
// Props
// ----------------------------------------------------------------------------

export interface ModalityUpgradeRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Patient's Supabase session JWT — forwarded to API calls. */
  token: string | null | undefined;
  sessionId: string;
  /** Current modality the consult is on. */
  currentModality: "text" | "voice";
  /** Modality the patient is requesting. */
  targetModality: "voice" | "video";
  /** Doctor's display name, shown in copy. Falls back to "your doctor". */
  doctorDisplayName?: string | null;
  /**
   * `true` while the patient has remaining upgrade budget. Decision 11
   * caps at 1 upgrade per consult — the launcher passes `false` once
   * the budget is spent. When `false`, the modal refuses to submit and
   * displays the cap-reached copy.
   */
  hasRemainingUpgrade?: boolean;
  /**
   * Fired when the server-side transition commits (history row
   * INSERT reaches the patient's Realtime channel). Parent launcher
   * remounts the appropriate room surface.
   *
   * `newAccessToken` is currently undefined — Task 47's commit-side
   * Realtime rebroadcast is deferred (inbox follow-up). The launcher
   * mints its own fresh token by re-fetching `/consultation-sessions`
   * in the meantime.
   */
  onAppliedTransition?: (payload: {
    toModality: Modality;
    newAccessToken?: string;
  }) => void;
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

const INR_FORMATTER = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function formatInr(paise: number): string {
  return INR_FORMATTER.format(Math.round(paise / 100));
}

function formatCountdown(totalSec: number): string {
  const s = Math.max(0, totalSec);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function titleForState(state: ModalState, target: Modality): string {
  const targetLabel = capitalize(target);
  switch (state.kind) {
    case "idle":
      return `Upgrade to ${targetLabel}?`;
    case "submitting":
      return `Sending request…`;
    case "awaiting_approval":
      return `Waiting for the doctor to approve`;
    case "checkout_ready":
      return `Doctor approved — ${formatInr(state.amountPaise)}`;
    case "checkout_opened":
      return `Processing payment…`;
    case "applying_transition":
      return `Switching to ${targetLabel}…`;
    case "applied":
      return `${capitalize(state.toModality)} upgrade applied`;
    case "free_upgrade_approved":
      return `Upgrade granted for free`;
    case "declined":
      return `Doctor declined`;
    case "timeout":
      return `No response from the doctor`;
    case "error":
      return `Something went wrong`;
    default:
      return "Upgrade";
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function isSafeDismissState(state: ModalState): boolean {
  return (
    state.kind === "idle" ||
    state.kind === "declined" ||
    state.kind === "timeout" ||
    state.kind === "error" ||
    state.kind === "applied" ||
    state.kind === "free_upgrade_approved"
  );
}

// ----------------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------------

export default function ModalityUpgradeRequestModal(
  props: ModalityUpgradeRequestModalProps,
): JSX.Element | null {
  const {
    isOpen,
    onClose,
    token,
    sessionId,
    currentModality,
    targetModality,
    doctorDisplayName,
    hasRemainingUpgrade = true,
    onAppliedTransition,
  } = props;

  const fsm = useModalityUpgradeFSM({
    open: isOpen,
    token,
    sessionId,
    targetModality,
    ...(onAppliedTransition ? { onAppliedTransition } : {}),
  });
  const { state, submit, openCheckout } = fsm;

  const [reason, setReason] = useState("");
  const [now, setNow] = useState<number>(() => Date.now());
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const firstFocusableRef = useRef<HTMLButtonElement | null>(null);

  // Tick 1s while the modal is open — cheap, keeps countdowns live.
  useEffect(() => {
    if (!isOpen) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isOpen]);

  // Reset reason whenever the modal closes.
  useEffect(() => {
    if (!isOpen) setReason("");
  }, [isOpen]);

  // Focus the first focusable element on open (basic focus-trap start point).
  useEffect(() => {
    if (!isOpen) return;
    const t = window.setTimeout(() => {
      firstFocusableRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [isOpen]);

  // Auto-close after 1.5s on the terminal success states so the parent
  // launcher can remount the next room without the patient having to
  // dismiss manually. Matches Task 50 spec.
  useEffect(() => {
    if (state.kind !== "applied" && state.kind !== "free_upgrade_approved") {
      return;
    }
    const id = window.setTimeout(onClose, 1500);
    return () => window.clearTimeout(id);
  }, [state, onClose]);

  // ---- Derived countdown values ---------------------------------------------
  const awaitingSecondsLeft = useMemo(() => {
    if (state.kind !== "awaiting_approval") return 0;
    const ms = new Date(state.expiresAt).getTime() - now;
    return ms > 0 ? Math.ceil(ms / 1000) : 0;
  }, [state, now]);

  const cooldownSecondsLeft = useMemo(() => {
    if (state.kind !== "declined" && state.kind !== "timeout") return 0;
    const ms = new Date(state.cooldownUntil).getTime() - now;
    return ms > 0 ? Math.ceil(ms / 1000) : 0;
  }, [state, now]);

  // ---- Handlers --------------------------------------------------------------
  const handleSubmit = useCallback(
    (e?: React.FormEvent<HTMLFormElement>) => {
      e?.preventDefault();
      if (!hasRemainingUpgrade) return;
      void submit({ reason });
    },
    [hasRemainingUpgrade, reason, submit],
  );

  const handlePayClick = useCallback(() => {
    if (state.kind !== "checkout_ready") return;
    const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "";
    if (!keyId) {
      // Mis-configuration. Surface a user-visible error rather than
      // silently opening a broken Razorpay modal.
      // eslint-disable-next-line no-alert
      alert(
        "Razorpay is not configured for this environment. Please contact support.",
      );
      return;
    }
    const displayName = "Clariva";
    const description = `Upgrade consult to ${capitalize(targetModality)}`;
    void openCheckout({
      keyId,
      displayName,
      description,
      notes: {
        kind: "mid_consult_upgrade",
        sessionId,
        toModality: targetModality,
      },
    });
  }, [openCheckout, sessionId, state, targetModality]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape" && isSafeDismissState(state)) {
        e.stopPropagation();
        onClose();
      }
    },
    [onClose, state],
  );

  const handleBackdropClick = useCallback(() => {
    if (isSafeDismissState(state)) onClose();
  }, [onClose, state]);

  if (!isOpen) return null;

  const title = titleForState(state, targetModality);
  const reducedMotion = prefersReducedMotion();
  const countdownColorClass =
    awaitingSecondsLeft <= 30 ? "text-red-600" : "text-amber-700";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      aria-hidden={!isOpen}
    >
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={handleBackdropClick}
        className="absolute inset-0 bg-black/80"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modality-upgrade-title"
        aria-describedby="modality-upgrade-body"
        onKeyDown={handleKeyDown}
        className="relative w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
      >
        <h2
          id="modality-upgrade-title"
          className="text-base font-semibold text-gray-900"
        >
          {title}
        </h2>

        <div
          id="modality-upgrade-body"
          aria-live="polite"
          className="mt-2 text-sm text-gray-700"
        >
          {/* --- idle / request form ------------------------------------------ */}
          {state.kind === "idle" && (
            <>
              <p>
                You&apos;re currently on {capitalize(currentModality)}.
                Upgrading to {capitalize(targetModality)} lets you and{" "}
                {doctorDisplayName ?? "your doctor"} see{" "}
                {targetModality === "video" ? "each other" : "voice quality improve"}.
              </p>
              <p className="mt-2 text-xs text-gray-500">
                {doctorDisplayName ?? "Your doctor"} will decide whether to
                charge the difference or grant the upgrade for free.
              </p>
              {!hasRemainingUpgrade && (
                <p
                  role="alert"
                  className="mt-3 rounded-md bg-amber-50 p-2 text-xs text-amber-800"
                >
                  You&apos;ve already upgraded once in this consultation — no
                  more upgrades are allowed.
                </p>
              )}
              <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2">
                <label
                  htmlFor="modality-upgrade-reason"
                  className="text-xs font-medium text-gray-600"
                >
                  Reason (optional)
                </label>
                <textarea
                  id="modality-upgrade-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value.slice(0, 200))}
                  maxLength={200}
                  rows={3}
                  placeholder={`e.g. "I'd like to show a visible symptom."`}
                  className="w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <div className="flex items-center justify-between text-[11px] text-gray-400">
                  <span>{reason.length}/200</span>
                </div>
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    ref={firstFocusableRef}
                    type="button"
                    onClick={onClose}
                    className="min-h-[48px] rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!hasRemainingUpgrade}
                    className="min-h-[48px] rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Send Request
                  </button>
                </div>
              </form>
            </>
          )}

          {/* --- submitting --------------------------------------------------- */}
          {state.kind === "submitting" && (
            <div className="flex items-center gap-2">
              <Spinner />
              <span>Sending your request to {doctorDisplayName ?? "your doctor"}…</span>
            </div>
          )}

          {/* --- awaiting_approval ------------------------------------------- */}
          {state.kind === "awaiting_approval" && (
            <>
              <p
                className={`flex items-center gap-2 text-base font-medium ${countdownColorClass} ${
                  reducedMotion ? "" : "animate-pulse"
                }`}
              >
                <span aria-hidden>⏳</span>
                <span>{awaitingSecondsLeft} seconds remaining</span>
              </p>
              <p className="mt-3">
                {doctorDisplayName ?? "Your doctor"} is deciding whether to
                approve the upgrade and whether to charge for it.
              </p>
              <p className="mt-2 text-xs text-gray-500">
                If there&apos;s no response in 90 seconds, the request will
                auto-decline and you can try once more.
              </p>
              <div className="mt-4 flex items-center justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[48px] rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </>
          )}

          {/* --- checkout_ready ---------------------------------------------- */}
          {state.kind === "checkout_ready" && (
            <>
              <p>
                Ready to pay{" "}
                <span className="font-semibold">
                  {formatInr(state.amountPaise)}
                </span>{" "}
                for the {targetModality} upgrade.
              </p>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[48px] rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handlePayClick}
                  className="min-h-[48px] rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
                >
                  Pay {formatInr(state.amountPaise)} with Razorpay
                </button>
              </div>
            </>
          )}

          {/* --- checkout_opened --------------------------------------------- */}
          {state.kind === "checkout_opened" && (
            <div className="flex items-center gap-2">
              <Spinner />
              <span>Complete payment in the Razorpay window…</span>
            </div>
          )}

          {/* --- applying_transition ----------------------------------------- */}
          {state.kind === "applying_transition" && (
            <div className="flex items-center gap-2">
              <Spinner />
              <span>Switching to {capitalize(targetModality)}…</span>
            </div>
          )}

          {/* --- applied / free_upgrade_approved ----------------------------- */}
          {(state.kind === "applied" ||
            state.kind === "free_upgrade_approved") && (
            <div
              className={`flex items-center gap-2 text-green-700 ${
                reducedMotion ? "" : "animate-fade-in"
              }`}
            >
              <span aria-hidden>✓</span>
              <span>
                {state.kind === "free_upgrade_approved"
                  ? `${doctorDisplayName ?? "Your doctor"} granted the upgrade for free. Switching to ${capitalize(state.toModality)} now.`
                  : `Switching you to ${capitalize(state.toModality)} now.`}
              </span>
            </div>
          )}

          {/* --- declined ---------------------------------------------------- */}
          {state.kind === "declined" && (
            <>
              <p>
                Reason:{" "}
                <span className="italic">&ldquo;{state.reason}&rdquo;</span>
              </p>
              <p className="mt-3 text-xs text-gray-500">
                You can try once more in {formatCountdown(cooldownSecondsLeft)}.
              </p>
              <div className="mt-4 flex items-center justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[48px] rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </>
          )}

          {/* --- timeout ----------------------------------------------------- */}
          {state.kind === "timeout" && (
            <>
              <p>
                {doctorDisplayName ?? "Your doctor"} didn&apos;t respond in
                time.
              </p>
              <p className="mt-3 text-xs text-gray-500">
                You can try once more in {formatCountdown(cooldownSecondsLeft)}.
              </p>
              <div className="mt-4 flex items-center justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[48px] rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </>
          )}

          {/* --- error ------------------------------------------------------- */}
          {state.kind === "error" && (
            <>
              <p role="alert" className="text-red-600">
                {state.message}
              </p>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[48px] rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Inline spinner (no external dep).
// ----------------------------------------------------------------------------

function Spinner(): JSX.Element {
  return (
    <span
      aria-hidden
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600"
    />
  );
}
