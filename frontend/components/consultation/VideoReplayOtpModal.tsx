"use client";

/**
 * `<VideoReplayOtpModal>` — Plan 08 · Task 44 · Decision 10 LOCKED.
 *
 * SMS OTP entry modal for the first video-replay per 30-day rolling
 * window. Opens after `<VideoReplayWarningModal>` when the preflight
 * `video-replay-otp/state` call returns `required: true`.
 *
 * Lifecycle:
 *   1. On mount → `sendVideoReplayOtpApi()` (sends SMS). Expiry
 *      countdown starts from the returned `expiresAt`.
 *   2. Patient enters 6 digits → `verifyVideoReplayOtpApi()`.
 *      - `{ verified: true }` → parent closes modal + mints video.
 *      - `{ verified: false, reason: 'wrong_code' }` → inline error,
 *        clear input, re-focus.
 *      - `reason === 'expired' | 'too_many_attempts'` → switch to
 *        the "request a new code" CTA.
 *   3. Resend cooldown: 30s between sends (client-side guard; the
 *      backend separately enforces 3-sends-per-hour → 429 with
 *      `retryAfterSeconds` which this modal also respects).
 *
 * Security notes:
 *   - Code input uses `inputMode="numeric"` + `autoComplete="one-time-code"`
 *     so iOS / Android keyboards offer the autofill chip from the
 *     SMS body we just sent.
 *   - The code is NOT echoed to logs or to the parent `onVerified`
 *     callback — only the success signal propagates.
 *
 * Accessibility:
 *   - `role="dialog"` + `aria-modal` + `aria-labelledby` + `aria-describedby`.
 *   - Error states surface via an `aria-live="polite"` region below
 *     the input so screen readers announce "wrong code, try again"
 *     without interrupting input.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  sendVideoReplayOtpApi,
  verifyVideoReplayOtpApi,
  VideoReplayOtpSendError,
  type VerifyVideoReplayOtpReason,
} from "@/lib/api/video-replay-otp";

const RESEND_COOLDOWN_SEC = 30;

export interface VideoReplayOtpModalProps {
  open: boolean;
  token: string;
  sessionId: string;
  /**
   * Last known SMS OTP verification timestamp (ISO-8601) — surfaced
   * as "last verified N days ago" copy when present. Pass the value
   * from the `state` preflight OR from the `video_otp_required`
   * details payload; `null` / undefined suppresses the line.
   */
  lastVerifiedAt?: string | null;
  onCancel: () => void;
  /**
   * Called once `verifyVideoReplayOtpApi` returns `{ verified: true }`.
   * Parent is expected to close the modal and proceed with the
   * video URL mint.
   */
  onVerified: () => void;
}

type Phase =
  | { kind: "sending" }
  | { kind: "ready"; otpId: string; expiresAt: string }
  | { kind: "verifying"; otpId: string; expiresAt: string }
  | {
      kind: "wrong_code";
      otpId: string;
      expiresAt: string;
      message: string;
    }
  | { kind: "expired_or_locked"; reason: "expired" | "too_many_attempts" }
  | {
      kind: "send_error";
      code: string;
      message: string;
      retryAfterSeconds?: number;
    };

function maskVerifiedLabel(iso?: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const days = Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000));
  if (days < 0) return null;
  if (days === 0) return "Last verified earlier today.";
  if (days === 1) return "Last verified 1 day ago.";
  return `Last verified ${days} days ago.`;
}

export default function VideoReplayOtpModal(
  props: VideoReplayOtpModalProps,
): JSX.Element | null {
  const { open, token, sessionId, lastVerifiedAt, onCancel, onVerified } = props;

  const [phase, setPhase] = useState<Phase>({ kind: "sending" });
  const [code, setCode] = useState<string>("");
  const [resendAvailableAt, setResendAvailableAt] = useState<number>(
    () => Date.now() + RESEND_COOLDOWN_SEC * 1000,
  );
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const startSend = useCallback(async () => {
    setPhase({ kind: "sending" });
    setCode("");
    try {
      const res = await sendVideoReplayOtpApi(token, sessionId);
      setPhase({
        kind: "ready",
        otpId: res.data.otpId,
        expiresAt: res.data.expiresAt,
      });
      setResendAvailableAt(Date.now() + RESEND_COOLDOWN_SEC * 1000);
    } catch (err) {
      if (err instanceof VideoReplayOtpSendError) {
        setPhase({
          kind: "send_error",
          code: err.code,
          message: err.message,
          ...(err.retryAfterSeconds !== undefined
            ? { retryAfterSeconds: err.retryAfterSeconds }
            : {}),
        });
        return;
      }
      const message =
        err instanceof Error
          ? err.message
          : "Couldn't send the code right now.";
      setPhase({ kind: "send_error", code: "send_failed", message });
    }
  }, [sessionId, token]);

  // Initial send on modal open. The effect is pinned to `open` rising
  // edge; on close we unmount so there's no "send on unmount" race.
  useEffect(() => {
    if (!open) return;
    void startSend();
  }, [open, startSend]);

  // Tick for resend-cooldown + expiry countdown UI. 1s granularity.
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [open]);

  // Focus the code input when we transition to `ready`.
  useEffect(() => {
    if (phase.kind !== "ready" && phase.kind !== "wrong_code") return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [phase.kind]);

  const handleSubmit = useCallback(
    async (e?: React.FormEvent<HTMLFormElement>) => {
      e?.preventDefault();
      if (phase.kind !== "ready" && phase.kind !== "wrong_code") return;
      const trimmed = code.trim();
      if (trimmed.length !== 6 || !/^\d{6}$/.test(trimmed)) {
        setPhase({
          kind: "wrong_code",
          otpId: phase.otpId,
          expiresAt: phase.expiresAt,
          message: "Enter the 6-digit code from the SMS.",
        });
        return;
      }
      setPhase({ kind: "verifying", otpId: phase.otpId, expiresAt: phase.expiresAt });
      try {
        const res = await verifyVideoReplayOtpApi(token, sessionId, {
          otpId: phase.otpId,
          code: trimmed,
        });
        if (res.verified) {
          onVerified();
          return;
        }
        const reason: VerifyVideoReplayOtpReason = res.reason;
        if (reason === "expired" || reason === "too_many_attempts") {
          setPhase({ kind: "expired_or_locked", reason });
          return;
        }
        setPhase({
          kind: "wrong_code",
          otpId: phase.otpId,
          expiresAt: phase.expiresAt,
          message: "That code didn't match. Try again.",
        });
        setCode("");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not verify the code.";
        setPhase({
          kind: "wrong_code",
          otpId: phase.otpId,
          expiresAt: phase.expiresAt,
          message,
        });
      }
    },
    [code, onVerified, phase, sessionId, token],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    },
    [onCancel],
  );

  const resendSecondsLeft = useMemo(() => {
    const ms = resendAvailableAt - nowTick;
    return ms > 0 ? Math.ceil(ms / 1000) : 0;
  }, [resendAvailableAt, nowTick]);

  const expirySecondsLeft = useMemo(() => {
    if (phase.kind !== "ready" && phase.kind !== "wrong_code" && phase.kind !== "verifying") {
      return 0;
    }
    const ms = new Date(phase.expiresAt).getTime() - nowTick;
    return ms > 0 ? Math.ceil(ms / 1000) : 0;
  }, [phase, nowTick]);

  if (!open) return null;

  const lastVerifiedLine = maskVerifiedLabel(lastVerifiedAt);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
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
        aria-labelledby="video-replay-otp-title"
        aria-describedby="video-replay-otp-body"
        onKeyDown={handleKeyDown}
        className="relative w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
      >
        <h2
          id="video-replay-otp-title"
          className="text-base font-semibold text-gray-900"
        >
          Enter the SMS code
        </h2>

        <div id="video-replay-otp-body" className="mt-2 text-sm text-gray-700">
          <p>
            We&apos;ve sent a 6-digit code to the phone number on file so
            we know it&apos;s really you.
          </p>
          {lastVerifiedLine && (
            <p className="mt-1 text-xs text-gray-500">{lastVerifiedLine}</p>
          )}
        </div>

        {phase.kind === "sending" && (
          <p className="mt-4 text-sm text-gray-600">Sending code…</p>
        )}

        {phase.kind === "send_error" && (
          <div className="mt-4 flex flex-col gap-2">
            <p role="alert" className="text-sm text-red-600">
              {phase.message}
            </p>
            {phase.code === "rate_limited" && phase.retryAfterSeconds !== undefined && (
              <p className="text-xs text-gray-500">
                Try again in about {Math.max(1, Math.ceil(phase.retryAfterSeconds / 60))} min.
              </p>
            )}
            {phase.code === "no_patient_phone_on_file" && (
              <p className="text-xs text-gray-500">
                Please contact the clinic&apos;s support to add a mobile
                number to your patient record.
              </p>
            )}
            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
              {phase.code !== "no_patient_phone_on_file" && phase.code !== "already_verified" && (
                <button
                  type="button"
                  onClick={() => void startSend()}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                >
                  Try again
                </button>
              )}
            </div>
          </div>
        )}

        {phase.kind === "expired_or_locked" && (
          <div className="mt-4 flex flex-col gap-2">
            <p role="alert" className="text-sm text-red-600">
              {phase.reason === "expired"
                ? "That code has expired."
                : "Too many wrong tries — please request a new code."}
            </p>
            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void startSend()}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                Send a new code
              </button>
            </div>
          </div>
        )}

        {(phase.kind === "ready" ||
          phase.kind === "wrong_code" ||
          phase.kind === "verifying") && (
          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2">
            <label
              htmlFor="video-replay-otp-input"
              className="text-xs font-medium text-gray-600"
            >
              6-digit code
            </label>
            <input
              ref={inputRef}
              id="video-replay-otp-input"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D+/g, "").slice(0, 6))
              }
              disabled={phase.kind === "verifying"}
              aria-invalid={phase.kind === "wrong_code"}
              aria-describedby={
                phase.kind === "wrong_code" ? "video-replay-otp-error" : undefined
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-lg tracking-[0.5em] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />

            <div
              id="video-replay-otp-error"
              aria-live="polite"
              className="min-h-[1rem] text-xs"
            >
              {phase.kind === "wrong_code" && (
                <span role="alert" className="text-red-600">
                  {phase.message}
                </span>
              )}
            </div>

            <p className="text-[11px] text-gray-500">
              {expirySecondsLeft > 0
                ? `Code expires in ${Math.floor(expirySecondsLeft / 60)}:${String(
                    expirySecondsLeft % 60,
                  ).padStart(2, "0")}.`
                : "Code expired — request a new one."}
            </p>

            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={resendSecondsLeft > 0 || phase.kind === "verifying"}
                onClick={() => void startSend()}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {resendSecondsLeft > 0
                  ? `Resend in ${resendSecondsLeft}s`
                  : "Resend code"}
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onCancel}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={code.length !== 6 || phase.kind === "verifying"}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {phase.kind === "verifying" ? "Verifying…" : "Verify"}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
