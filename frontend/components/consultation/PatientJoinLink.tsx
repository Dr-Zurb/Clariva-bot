"use client";

import { useState } from "react";

interface PatientJoinLinkProps {
  patientJoinUrl: string;
  /**
   * Optional doctor-triggered fan-out (SMS + email + IG). When set,
   * shows an "Email link" button next to Copy so the doctor can
   * re-fire `sendConsultationReadyToPatient` if the automatic ping
   * didn't land in the patient's inbox.
   */
  onEmailLink?: () => Promise<{ sent: boolean } | void> | void;
  emailBusy?: boolean;
}

/**
 * Displays the patient join URL with copy-to-clipboard.
 * @see e-task-6
 */
export default function PatientJoinLink({
  patientJoinUrl,
  onEmailLink,
  emailBusy = false,
}: PatientJoinLinkProps) {
  const [copied, setCopied] = useState(false);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(patientJoinUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const handleEmail = async () => {
    if (!onEmailLink || emailBusy) return;
    setEmailNotice(null);
    try {
      const result = await onEmailLink();
      const sent = result && typeof result === "object" ? result.sent : true;
      setEmailNotice(
        sent
          ? "Join link emailed (and SMS/IG if configured)."
          : "Couldn't email the join link — check patient email on file.",
      );
    } catch (err) {
      setEmailNotice(
        err instanceof Error ? err.message : "Failed to email join link",
      );
    }
  };

  if (!patientJoinUrl) {
    return (
      <p className="text-sm text-amber-700">
        Patient join URL is not configured. Set CONSULTATION_JOIN_BASE_URL in your backend.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <p className="mb-2 text-sm font-medium text-gray-700">
        Share this link with your patient to join the video call:
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          readOnly
          value={patientJoinUrl}
          className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
          aria-label="Patient join URL"
        />
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
        {onEmailLink ? (
          <button
            type="button"
            onClick={() => void handleEmail()}
            disabled={emailBusy}
            data-testid="patient-join-email-link"
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {emailBusy ? "Sending…" : "Email link"}
          </button>
        ) : null}
      </div>
      {emailNotice ? (
        <p
          role="status"
          aria-live="polite"
          className="mt-2 text-xs text-gray-600"
        >
          {emailNotice}
        </p>
      ) : null}
    </div>
  );
}
