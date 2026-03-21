"use client";

import { useState } from "react";

interface PatientJoinLinkProps {
  patientJoinUrl: string;
}

/**
 * Displays the patient join URL with copy-to-clipboard.
 * @see e-task-6
 */
export default function PatientJoinLink({ patientJoinUrl }: PatientJoinLinkProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(patientJoinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
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
          className="flex-1 min-w-0 rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
          aria-label="Patient join URL"
        />
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}
