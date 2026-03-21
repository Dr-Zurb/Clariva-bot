"use client";

import { useState } from "react";
import { patchAppointment } from "@/lib/api";

interface MarkCompletedFormProps {
  appointmentId: string;
  token: string;
  onSuccess?: () => void;
}

/**
 * Form to mark appointment as completed with optional clinical notes.
 * @see e-task-6
 */
export default function MarkCompletedForm({
  appointmentId,
  token,
  onSuccess,
}: MarkCompletedFormProps) {
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await patchAppointment(token, appointmentId, {
        status: "completed",
        clinical_notes: clinicalNotes.trim() || undefined,
      });
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="clinical_notes" className="block text-sm font-medium text-gray-700">
          Clinical notes (optional)
        </label>
        <textarea
          id="clinical_notes"
          rows={4}
          value={clinicalNotes}
          onChange={(e) => setClinicalNotes(e.target.value)}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Add post-consultation notes..."
          maxLength={5000}
          disabled={saving}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        {saving ? "Saving…" : "Mark as completed"}
      </button>
    </form>
  );
}
