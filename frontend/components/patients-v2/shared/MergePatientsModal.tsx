"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { mergePatients } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { DuplicateGroupPatient } from "@/types/patient";

interface MergePatientsModalProps {
  group: DuplicateGroupPatient[];
  onClose: () => void;
  onSuccess: () => void;
}

/** Mask phone: show last 4 digits only. */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return "••••••" + digits.slice(-4);
}

/**
 * Modal for merging duplicate patients. User selects which patient to keep (target);
 * all others are merged into it.
 */
export default function MergePatientsModal({
  group,
  onClose,
  onSuccess,
}: MergePatientsModalProps) {
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleMerge = async () => {
    if (!selectedTargetId) return;
    const sources = group.filter((p) => p.id !== selectedTargetId);
    if (sources.length === 0) return;

    setIsSubmitting(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setError("Please sign in again.");
      setIsSubmitting(false);
      return;
    }

    try {
      for (const source of sources) {
        await mergePatients(token, {
          sourcePatientId: source.id,
          targetPatientId: selectedTargetId,
        });
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Merge failed. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="merge-modal-title"
    >
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-lg">
        <h2 id="merge-modal-title" className="text-lg font-semibold text-gray-900">
          Merge duplicate patients
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Which patient record should we keep? All appointments and conversations
          from the others will move to it. This cannot be undone.
        </p>

        <div className="mt-4 space-y-2">
          {group.map((patient) => (
            <button
              key={patient.id}
              type="button"
              onClick={() => setSelectedTargetId(patient.id)}
              className={cn(
                "w-full rounded-lg border p-3 text-left transition-colors",
                "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
                selectedTargetId === patient.id
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
              )}
            >
              <span className="font-medium text-gray-900">{patient.name}</span>
              <span className="ml-2 text-sm text-gray-500">
                Phone: {maskPhone(patient.phone)}
                {patient.age != null && ` • Age: ${patient.age}`}
              </span>
              {selectedTargetId === patient.id && (
                <span className="ml-2 text-xs text-blue-600">(Keep this one)</span>
              )}
            </button>
          ))}
        </div>

        {error && (
          <p
            className="mt-3 text-sm text-red-600"
            role="alert"
          >
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleMerge}
            disabled={!selectedTargetId || isSubmitting}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            {isSubmitting ? "Merging…" : "Merge"}
          </button>
        </div>
      </div>
    </div>
  );
}
