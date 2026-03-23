"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createAppointment,
  getAvailableSlots,
  getDoctorSettings,
  getPatients,
  type AvailableSlot,
  type CreateAppointmentPayload,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import type { PatientSummary } from "@/types/patient";

interface AddAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  token: string;
}

function formatSlotTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

/**
 * Modal for adding an appointment from the doctor dashboard.
 * Supports existing patient selection or walk-in (name + phone).
 */
export default function AddAppointmentModal({
  isOpen,
  onClose,
  onSuccess,
  token,
}: AddAppointmentModalProps) {
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [mode, setMode] = useState<"patient" | "walkin">("patient");
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [walkInName, setWalkInName] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlotStart, setSelectedSlotStart] = useState("");
  const [reasonForVisit, setReasonForVisit] = useState("");
  const [notes, setNotes] = useState("");
  const [freeOfCost, setFreeOfCost] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDoctorAndPatients = useCallback(async () => {
    if (!token) return;
    try {
      const [settingsRes, patientsRes] = await Promise.all([
        getDoctorSettings(token),
        getPatients(token),
      ]);
      setDoctorId(settingsRes.data.settings.doctor_id);
      setPatients(patientsRes.data.patients);
    } catch {
      setError("Could not load settings or patients.");
    }
  }, [token]);

  const fetchSlots = useCallback(async () => {
    if (!doctorId || !date) {
      setSlots([]);
      setSelectedSlotStart("");
      return;
    }
    setSlotsLoading(true);
    setSlots([]);
    setSelectedSlotStart("");
    try {
      const res = await getAvailableSlots(doctorId, date);
      setSlots(res.data.slots);
    } catch {
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, [doctorId, date]);

  useEffect(() => {
    if (isOpen && token) {
      setError(null);
      fetchDoctorAndPatients();
    }
  }, [isOpen, token, fetchDoctorAndPatients]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let patientId: string | undefined;
    let patientName: string;
    let patientPhone: string;

    if (mode === "patient" && selectedPatientId) {
      const p = patients.find((x) => x.id === selectedPatientId);
      if (!p) {
        setError("Please select a patient.");
        return;
      }
      patientId = p.id;
      patientName = p.name;
      patientPhone = p.phone;
    } else {
      const name = walkInName.trim();
      const phone = walkInPhone.trim();
      if (!name || !phone) {
        setError("Please enter patient name and phone for walk-in.");
        return;
      }
      patientName = name;
      patientPhone = phone;
    }

    if (!selectedSlotStart) {
      setError("Please select a date and time slot.");
      return;
    }

    const reason = reasonForVisit.trim();
    if (!reason) {
      setError("Reason for visit is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: CreateAppointmentPayload = {
        appointmentDate: selectedSlotStart,
        reasonForVisit: reason,
        patientName,
        patientPhone,
        freeOfCost: freeOfCost || undefined,
      };
      if (patientId) payload.patientId = patientId;
      if (notes.trim()) payload.notes = notes.trim();

      await createAppointment(token, payload);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create appointment.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const minDate = new Date().toISOString().slice(0, 10);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-appointment-title"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
        <div className="sticky top-0 border-b border-gray-200 bg-white px-6 py-4">
          <h2 id="add-appointment-title" className="text-lg font-semibold text-gray-900">
            Add appointment
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <span className="mb-2 block text-sm font-medium text-gray-700">
              Patient
            </span>
            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={() => setMode("patient")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium",
                  mode === "patient"
                    ? "bg-blue-100 text-blue-800"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                )}
              >
                Select patient
              </button>
              <button
                type="button"
                onClick={() => setMode("walkin")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium",
                  mode === "walkin"
                    ? "bg-blue-100 text-blue-800"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                )}
              >
                Walk-in
              </button>
            </div>

            {mode === "patient" ? (
              <select
                id="patient-select"
                value={selectedPatientId}
                onChange={(e) => setSelectedPatientId(e.target.value)}
                className={cn(
                  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm",
                  "focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                )}
                aria-label="Select patient"
              >
                <option value="">Choose a patient…</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.phone}
                  </option>
                ))}
              </select>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="walkin-name" className="sr-only">
                    Patient name
                  </label>
                  <input
                    id="walkin-name"
                    type="text"
                    value={walkInName}
                    onChange={(e) => setWalkInName(e.target.value)}
                    placeholder="Name"
                    className={cn(
                      "w-full rounded-md border border-gray-300 px-3 py-2 text-sm",
                      "focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    )}
                  />
                </div>
                <div>
                  <label htmlFor="walkin-phone" className="sr-only">
                    Patient phone
                  </label>
                  <input
                    id="walkin-phone"
                    type="tel"
                    value={walkInPhone}
                    onChange={(e) => setWalkInPhone(e.target.value)}
                    placeholder="Phone (e.g. +919876543210)"
                    className={cn(
                      "w-full rounded-md border border-gray-300 px-3 py-2 text-sm",
                      "focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    )}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="appt-date" className="block text-sm font-medium text-gray-700 mb-1">
                Date
              </label>
              <input
                id="appt-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={minDate}
                className={cn(
                  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm",
                  "focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                )}
                aria-required="true"
              />
            </div>
            <div>
              <label htmlFor="appt-slot" className="block text-sm font-medium text-gray-700 mb-1">
                Time
              </label>
              <select
                id="appt-slot"
                value={selectedSlotStart}
                onChange={(e) => setSelectedSlotStart(e.target.value)}
                disabled={!date || slotsLoading}
                className={cn(
                  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm",
                  "focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500",
                  "disabled:opacity-50"
                )}
                aria-label="Select time slot"
              >
                <option value="">
                  {slotsLoading ? "Loading…" : !date ? "Pick a date first" : slots.length === 0 ? "No slots" : "Choose time…"}
                </option>
                {slots.map((slot) => (
                  <option key={slot.start} value={slot.start}>
                    {formatSlotTime(slot.start)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-1">
              Reason for visit <span className="text-red-600">*</span>
            </label>
            <input
              id="reason"
              type="text"
              value={reasonForVisit}
              onChange={(e) => setReasonForVisit(e.target.value)}
              required
              maxLength={500}
              placeholder="Brief reason for visit"
              className={cn(
                "w-full rounded-md border border-gray-300 px-3 py-2 text-sm",
                "focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              )}
            />
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="Optional notes"
              className={cn(
                "w-full rounded-md border border-gray-300 px-3 py-2 text-sm",
                "focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              )}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="free-of-cost"
              type="checkbox"
              checked={freeOfCost}
              onChange={(e) => setFreeOfCost(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="free-of-cost" className="text-sm text-gray-700">
              Free of cost
            </label>
          </div>

          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {isSubmitting ? "Creating…" : "Add appointment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
