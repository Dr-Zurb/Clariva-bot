"use client";

/**
 * Data deletion request form (Plan 02 · Task 33).
 *
 * Minimal UI for the patient-self surface. Deliberately kept narrow:
 *   - Booking token input (paste-from-DM or prefilled from URL).
 *   - Optional reason text area (truncated + redacted server-side).
 *   - Confirm + cancel states.
 *
 * We do NOT persist the booking token beyond the component state.
 * Success responses show the server-computed grace cutoff so the
 * patient has a clear "your deletion is scheduled for X" marker —
 * the same surface serves the recovery flow (paste token again →
 * click cancel).
 *
 * Error handling: a single `error` string state — the API helpers
 * throw Error subclasses with human-readable messages, which we
 * surface verbatim. A 400-class response from the recovery
 * endpoint ("grace window has already expired") lands here
 * unchanged.
 */

import { useEffect, useState } from "react";
import {
  postAccountDeletion,
  postAccountRecovery,
  type AccountDeletionResponse,
} from "@/lib/api";

type Status = "idle" | "submitting" | "pending" | "cancelled" | "error";

function readBookingTokenFromUrl(): string {
  if (typeof window === "undefined") return "";
  try {
    const params = new URLSearchParams(window.location.search);
    return (params.get("bookingToken") ?? "").trim();
  } catch {
    return "";
  }
}

function formatGraceWindow(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function DataDeletionClient() {
  const [bookingToken, setBookingToken] = useState("");
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string>("");
  const [pending, setPending] = useState<AccountDeletionResponse | null>(null);

  useEffect(() => {
    const fromUrl = readBookingTokenFromUrl();
    if (fromUrl) setBookingToken(fromUrl);
  }, []);

  const disabled = status === "submitting";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!bookingToken.trim()) {
      setError(
        "Please paste the booking link token from your most recent appointment confirmation.",
      );
      return;
    }
    setError("");
    setStatus("submitting");
    try {
      const res = await postAccountDeletion({
        bookingToken: bookingToken.trim(),
        reason: reason.trim() || undefined,
      });
      setPending(res);
      setStatus("pending");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("error");
    }
  }

  async function handleCancel() {
    if (!bookingToken.trim()) {
      setError("Please paste your booking-link token to cancel.");
      return;
    }
    setError("");
    setStatus("submitting");
    try {
      await postAccountRecovery({ bookingToken: bookingToken.trim() });
      setPending(null);
      setStatus("cancelled");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("error");
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white shadow-sm p-6">
      <h2 className="text-base font-semibold text-gray-900">
        Request account deletion
      </h2>
      <p className="mt-1 text-sm text-gray-600">
        Your request enters a 7-day grace window. You can cancel any time
        before the cutoff by returning to this page.
      </p>

      {status === "pending" && pending ? (
        <div
          data-testid="deletion-pending-banner"
          className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4"
        >
          <p className="text-sm font-medium text-amber-900">
            Your account is scheduled for deletion on{" "}
            {formatGraceWindow(pending.graceWindowUntil)}.
          </p>
          {pending.reused ? (
            <p className="mt-1 text-xs text-amber-800">
              (An earlier deletion request is still pending — we reused it
              rather than create a duplicate.)
            </p>
          ) : null}
          <p className="mt-2 text-xs text-amber-800">
            Changed your mind? Click below to cancel.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleCancel}
              disabled={disabled}
              className="inline-flex items-center rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60"
            >
              {disabled ? "Cancelling…" : "Cancel deletion"}
            </button>
          </div>
        </div>
      ) : null}

      {status === "cancelled" ? (
        <div
          data-testid="deletion-cancelled-banner"
          className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 p-4"
        >
          <p className="text-sm font-medium text-emerald-900">
            Your deletion request has been cancelled. Your account is active.
          </p>
        </div>
      ) : null}

      {status !== "pending" ? (
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="booking-token"
              className="block text-xs font-medium text-gray-700"
            >
              Booking link token
            </label>
            <p className="mt-1 text-xs text-gray-500">
              Paste the long token at the end of your most recent booking link
              URL (the part after{" "}
              <code className="rounded bg-gray-100 px-1">?token=</code>). This
              verifies your request without requiring a separate login.
            </p>
            <input
              id="booking-token"
              type="text"
              value={bookingToken}
              onChange={(e) => setBookingToken(e.target.value)}
              disabled={disabled}
              className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none disabled:opacity-60"
              placeholder="eyJ…"
              autoComplete="off"
            />
          </div>

          <div>
            <label
              htmlFor="reason"
              className="block text-xs font-medium text-gray-700"
            >
              Reason (optional)
            </label>
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={disabled}
              rows={3}
              maxLength={500}
              className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none disabled:opacity-60"
              placeholder="Anything you want us to know (optional)"
            />
            <p className="mt-1 text-xs text-gray-500">
              Up to 500 characters. Phone numbers and email addresses are
              redacted before storage.
            </p>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={disabled}
            className="inline-flex items-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
          >
            {disabled ? "Submitting…" : "Request account deletion"}
          </button>
        </form>
      ) : null}
    </section>
  );
}
