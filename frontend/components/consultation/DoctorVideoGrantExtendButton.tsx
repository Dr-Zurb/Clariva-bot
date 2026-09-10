"use client";

import { useCallback, useId, useState } from "react";

import {
  extendVideoGrant,
  VideoEscalationError,
} from "@/lib/api/recording-escalation";

/**
 * rec-22 / rec-27 — doctor spends the single 120s grant extension.
 * Visible on the recording-status surface while video is being saved.
 * Server refuses a second spend (`GrantAlreadyExtendedError`).
 */
export interface DoctorVideoGrantExtendButtonProps {
  sessionId: string;
  token: string;
  currentUserRole: "doctor" | "patient";
  extensionSpent: boolean;
  grantSettling?: boolean;
  onExtended?: () => void;
}

export default function DoctorVideoGrantExtendButton({
  sessionId,
  token,
  currentUserRole,
  extensionSpent,
  grantSettling = false,
  onExtended,
}: DoctorVideoGrantExtendButtonProps): JSX.Element | null {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const helpId = useId();
  const errorId = useId();

  const handleClick = useCallback(async (): Promise<void> => {
    if (busy || extensionSpent || grantSettling) return;
    setBusy(true);
    setError(null);
    try {
      await extendVideoGrant(token, sessionId);
      onExtended?.();
    } catch (err) {
      const message =
        err instanceof VideoEscalationError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't add more time. Please try again.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }, [busy, extensionSpent, grantSettling, onExtended, sessionId, token]);

  if (currentUserRole !== "doctor") return null;

  const spent = extensionSpent;
  const disabled = busy || spent || grantSettling;

  return (
    <div
      className="flex flex-col gap-0.5"
      data-testid="doctor-video-grant-extend"
    >
      <button
        type="button"
        disabled={disabled}
        aria-describedby={`${helpId}${error ? ` ${errorId}` : ""}`}
        aria-label={
          spent
            ? "Video saving already extended once"
            : "Add two minutes to video saving. You can do this once."
        }
        onClick={() => void handleClick()}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Adding time…" : spent ? "Already extended" : "Add 2 minutes"}
      </button>
      <p id={helpId} className="text-[11px] text-slate-500">
        {spent
          ? "The extra 2 minutes have been used."
          : "You can add 2 minutes once."}
      </p>
      {error ? (
        <p id={errorId} role="alert" className="text-[11px] text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
