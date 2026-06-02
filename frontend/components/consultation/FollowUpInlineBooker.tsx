"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatTime } from "@/lib/format-date";
import { formatLocalIsoDate, todayLocalIso } from "@/lib/dates";
import {
  createAppointment,
  getAvailableSlots,
  type AvailableSlot,
  type CreateAppointmentPayload,
} from "@/lib/api";

/**
 * In-call follow-up booker (Sub-batch C · task-video-C6).
 *
 * Tiny inline form for the doctor to schedule a follow-up appointment
 * without leaving the consult. Reuses the existing `getAvailableSlots`
 * + `createAppointment` API helpers — same call shape the dashboard
 * `<AddAppointmentModal>` uses, so backend behaviour is identical.
 *
 * Scope cuts vs. the full dashboard modal:
 *   - Patient is fixed (the patient currently on the call). No
 *     patient picker, no walk-in branch.
 *   - Reason defaults to "Follow-up consultation" (doctor can edit).
 *   - Cost / notes / free-of-cost not surfaced (defer to dashboard
 *     edit if needed; the booker is for the 80% case where the doctor
 *     just needs to set a date + time).
 *
 * On submit success, fires `onSuccess({ appointmentId, scheduledAt })`
 * so the parent (`<InCallActionPanel>`) can post the
 * `'follow_up_scheduled'` banner to the consultation chat.
 */
export interface FollowUpInlineBookerProps {
  /** Doctor's auth token (Supabase JWT). */
  token: string;
  /** Doctor's user id (matches `appointment.doctor_id`). */
  doctorId: string;
  /**
   * Patient's id (`patients.id`). Required — the booker doesn't
   * support walk-ins; if the original appointment had no patient
   * record, the FAB hides the Schedule action upstream.
   */
  patientId: string;
  /** Patient's display name (for the form header). */
  patientName?: string | null;
  /** Patient's phone — required by the create-appointment API contract. */
  patientPhone: string;
  /** Original consultation's reason — used as default for the follow-up reason. */
  defaultReason?: string;
  /** Called on successful create. */
  onSuccess: (result: {
    appointmentId: string;
    scheduledAt: string;
  }) => void | Promise<void>;
  /** Called when the doctor clicks Cancel or otherwise dismisses. */
  onCancel: () => void;
}

/** Format an ISO timestamp to "HH:MM ap/pm" for the slot picker label. */
function formatSlotTime(iso: string): string {
  return formatTime(iso, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/** Default the date input to today + 7 days in YYYY-MM-DD shape. */
function defaultFollowUpDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return formatLocalIsoDate(d);
}

/** Today as YYYY-MM-DD — used as `min` on the date input so the doctor
 *  can't accidentally schedule into the past. */
function todayDate(): string {
  return todayLocalIso();
}

export default function FollowUpInlineBooker({
  token,
  doctorId,
  patientId,
  patientName,
  patientPhone,
  defaultReason,
  onSuccess,
  onCancel,
}: FollowUpInlineBookerProps) {
  const [date, setDate] = useState<string>(defaultFollowUpDate);
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlotStart, setSelectedSlotStart] = useState<string>("");
  const [reason, setReason] = useState<string>(
    defaultReason ? `Follow-up — ${defaultReason}` : "Follow-up consultation",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const minDate = useMemo(() => todayDate(), []);

  const fetchSlots = useCallback(async () => {
    if (!doctorId || !date) {
      setSlots([]);
      setSelectedSlotStart("");
      return;
    }
    setSlotsLoading(true);
    setSlots([]);
    setSelectedSlotStart("");
    setError(null);
    try {
      const res = await getAvailableSlots(doctorId, date);
      setSlots(res.data.slots);
      if (res.data.slots.length === 0) {
        setError("No slots available on this date — pick another.");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load slots.",
      );
    } finally {
      setSlotsLoading(false);
    }
  }, [doctorId, date]);

  useEffect(() => {
    void fetchSlots();
  }, [fetchSlots]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedSlotStart) {
        setError("Please pick a time slot.");
        return;
      }
      const trimmedReason = reason.trim();
      if (!trimmedReason) {
        setError("Reason for visit is required.");
        return;
      }
      setSubmitting(true);
      setError(null);
      try {
        const payload: CreateAppointmentPayload = {
          patientId,
          patientName: patientName?.trim() || "Patient",
          patientPhone,
          appointmentDate: selectedSlotStart,
          reasonForVisit: trimmedReason,
        };
        const res = await createAppointment(token, payload);
        const appointmentId = res.data.appointment.id;
        await onSuccess({
          appointmentId,
          scheduledAt: selectedSlotStart,
        });
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to create follow-up appointment.",
        );
      } finally {
        setSubmitting(false);
      }
    },
    [
      onSuccess,
      patientId,
      patientName,
      patientPhone,
      reason,
      selectedSlotStart,
      token,
    ],
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4"
      data-testid="follow-up-inline-booker"
    >
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Date
        </label>
        <input
          type="date"
          value={date}
          min={minDate}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
          data-testid="follow-up-date-input"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Time slot
        </label>
        {slotsLoading ? (
          <p className="text-xs text-gray-500">Loading available slots…</p>
        ) : slots.length === 0 ? (
          <p className="text-xs text-gray-500">
            No slots loaded yet — pick a date.
          </p>
        ) : (
          <div
            className="grid grid-cols-3 gap-2"
            data-testid="follow-up-slots-grid"
          >
            {slots.map((slot) => {
              const isSelected = slot.start === selectedSlotStart;
              return (
                <button
                  key={slot.start}
                  type="button"
                  onClick={() => setSelectedSlotStart(slot.start)}
                  className={`rounded border px-2 py-1.5 text-xs font-medium transition-colors ${
                    isSelected
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-gray-300 bg-white text-gray-700 hover:border-blue-400 hover:bg-blue-50"
                  }`}
                  data-testid="follow-up-slot-button"
                  data-selected={isSelected ? "true" : "false"}
                >
                  {formatSlotTime(slot.start)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Reason for follow-up
        </label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={200}
          required
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          data-testid="follow-up-reason-input"
        />
      </div>

      {error ? (
        <p
          className="text-xs text-red-600"
          role="alert"
          data-testid="follow-up-error"
        >
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="follow-up-cancel-button"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting || !selectedSlotStart}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="follow-up-submit-button"
        >
          {submitting ? "Scheduling…" : "Schedule follow-up"}
        </button>
      </div>
    </form>
  );
}
