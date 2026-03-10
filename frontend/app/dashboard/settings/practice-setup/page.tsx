"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getDoctorSettings,
  patchDoctorSettings,
  getAvailability,
  putAvailability,
  getBlockedTimes,
  postBlockedTime,
  deleteBlockedTime,
} from "@/lib/api";
import type { DoctorSettings, PatchDoctorSettingsPayload } from "@/types/doctor-settings";
import type { AvailabilitySlot, DayOfWeek } from "@/types/availability";
import type { BlockedTime } from "@/types/blocked-time";

const SLOT_INTERVAL_OPTIONS = [15, 20, 30, 45, 60] as const;
const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Australia/Sydney",
  "UTC",
];

const DAY_NAMES: Record<DayOfWeek, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

function toFormValue<T>(v: T | null | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function toNum(v: string): number | null {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

/**
 * Practice Setup: consolidated doctor/bot configuration.
 * Sections: Practice Info, Availability, Blocked Times, Booking Rules, Bot Messages.
 */
export default function PracticeSetupPage() {
  const [settings, setSettings] = useState<DoctorSettings | null>(null);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [blockedTimes, setBlockedTimes] = useState<BlockedTime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<Record<string, string>>({});
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [availabilitySaving, setAvailabilitySaving] = useState(false);
  const [availabilityMessage, setAvailabilityMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [blockedMessage, setBlockedMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [addStart, setAddStart] = useState("");
  const [addEnd, setAddEnd] = useState("");
  const [addReason, setAddReason] = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setError("Not signed in");
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const [settingsRes, availRes, blockedRes] = await Promise.all([
        getDoctorSettings(token),
        getAvailability(token),
        getBlockedTimes(token, {
          start_date: new Date().toISOString().slice(0, 10),
          end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        }),
      ]);
      const s = settingsRes.data.settings;
      setSettings(s);
      setForm({
        practice_name: toFormValue(s.practice_name),
        timezone: toFormValue(s.timezone) || "UTC",
        specialty: toFormValue(s.specialty),
        address_summary: toFormValue(s.address_summary),
        consultation_types: toFormValue(s.consultation_types),
        slot_interval_minutes: toFormValue(s.slot_interval_minutes) || "30",
        max_advance_booking_days: toFormValue(s.max_advance_booking_days) || "30",
        min_advance_hours: toFormValue(s.min_advance_hours) || "0",
        business_hours_summary: toFormValue(s.business_hours_summary),
        cancellation_policy_hours: toFormValue(s.cancellation_policy_hours),
        max_appointments_per_day: toFormValue(s.max_appointments_per_day),
        booking_buffer_minutes: toFormValue(s.booking_buffer_minutes),
        welcome_message: toFormValue(s.welcome_message),
        default_notes: toFormValue(s.default_notes),
      });
      const avail = availRes.data.availability;
      setSlots(avail.map((a) => ({
        day_of_week: a.day_of_week,
        start_time: a.start_time.slice(0, 5),
        end_time: a.end_time.slice(0, 5),
      })));
      setBlockedTimes(blockedRes.data.blockedTimes);
    } catch (err) {
      const status = err && typeof err === "object" && "status" in err ? (err as { status?: number }).status : 500;
      setError(status === 401 ? "Session expired. Please sign in again." : "Unable to load. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const updateField = (name: string, value: string) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;

    const slotInt = toNum(form.slot_interval_minutes);
    if (slotInt !== null && !SLOT_INTERVAL_OPTIONS.includes(slotInt as (typeof SLOT_INTERVAL_OPTIONS)[number])) {
      return;
    }

    const payload: PatchDoctorSettingsPayload = {
      practice_name: form.practice_name.trim() || null,
      timezone: form.timezone.trim() || "UTC",
      specialty: form.specialty.trim() || null,
      address_summary: form.address_summary.trim() || null,
      consultation_types: form.consultation_types.trim() || null,
      slot_interval_minutes: slotInt ?? 30,
      max_advance_booking_days: toNum(form.max_advance_booking_days) ?? 30,
      min_advance_hours: toNum(form.min_advance_hours) ?? 0,
      business_hours_summary: form.business_hours_summary.trim() || null,
      cancellation_policy_hours: toNum(form.cancellation_policy_hours) ?? null,
      max_appointments_per_day: toNum(form.max_appointments_per_day) ?? null,
      booking_buffer_minutes: toNum(form.booking_buffer_minutes) ?? null,
      welcome_message: form.welcome_message.trim() || null,
      default_notes: form.default_notes.trim() || null,
    };

    setSettingsSaving(true);
    try {
      const res = await patchDoctorSettings(token, payload);
      setSettings(res.data.settings);
    } finally {
      setSettingsSaving(false);
    }
  };

  const addSlot = () => {
    setSlots((prev) => [...prev, { day_of_week: 1, start_time: "09:00", end_time: "17:00" }]);
    setAvailabilityMessage(null);
  };

  const updateSlot = (index: number, field: keyof AvailabilitySlot, value: string | number) => {
    setSlots((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    setAvailabilityMessage(null);
  };

  const removeSlot = (index: number) => {
    setSlots((prev) => prev.filter((_, i) => i !== index));
    setAvailabilityMessage(null);
  };

  const handleSaveAvailability = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;

    for (const s of slots) {
      const [sh, sm] = s.start_time.split(":").map(Number);
      const [eh, em] = s.end_time.split(":").map(Number);
      if (sh * 60 + sm >= eh * 60 + em) {
        setAvailabilityMessage({ type: "error", text: "Start time must be before end time for each slot." });
        return;
      }
    }

    setAvailabilitySaving(true);
    setAvailabilityMessage(null);
    try {
      const payload = slots.map((s) => ({
        day_of_week: s.day_of_week,
        start_time: s.start_time.length === 5 ? `${s.start_time}:00` : s.start_time,
        end_time: s.end_time.length === 5 ? `${s.end_time}:00` : s.end_time,
      }));
      await putAvailability(token, payload);
      setAvailabilityMessage({ type: "success", text: "Schedule saved." });
      fetchAll();
    } catch (err) {
      const status = err && typeof err === "object" && "status" in err ? (err as { status?: number }).status : 500;
      setAvailabilityMessage({ type: "error", text: status === 401 ? "Session expired." : "Failed to save." });
    } finally {
      setAvailabilitySaving(false);
    }
  };

  const handleAddBlocked = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;

    const start = addStart ? new Date(addStart).toISOString() : "";
    const end = addEnd ? new Date(addEnd).toISOString() : "";
    if (!start || !end || new Date(start) >= new Date(end)) {
      setBlockedMessage({ type: "error", text: "Start must be before end." });
      return;
    }

    setAdding(true);
    setBlockedMessage(null);
    try {
      const res = await postBlockedTime(token, { start_time: start, end_time: end, reason: addReason.trim() || undefined });
      setBlockedTimes((prev) => [...prev, res.data.blockedTime]);
      setAddStart("");
      setAddEnd("");
      setAddReason("");
      setBlockedMessage({ type: "success", text: "Blocked time added." });
    } catch (err) {
      const status = err && typeof err === "object" && "status" in err ? (err as { status?: number }).status : 500;
      setBlockedMessage({ type: "error", text: status === 401 ? "Session expired." : "Failed to add." });
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteBlocked = async (id: string) => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;
    setDeletingId(id);
    setBlockedMessage(null);
    try {
      await deleteBlockedTime(token, id);
      setBlockedTimes((prev) => prev.filter((b) => b.id !== id));
      setBlockedMessage({ type: "success", text: "Blocked time removed." });
    } catch (err) {
      const status = err && typeof err === "object" && "status" in err ? (err as { status?: number }).status : 500;
      setBlockedMessage({ type: "error", text: status === 401 ? "Session expired." : "Failed to remove." });
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4" aria-busy="true" aria-live="polite">
        <p className="text-sm text-gray-600">Loading…</p>
      </div>
    );
  }

  if (error && !settings) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800" role="alert" aria-live="polite">
        <p className="font-medium">Error</p>
        <p className="mt-1 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Practice Setup</h1>
      <p className="mt-1 text-gray-600">
        Configure how your receptionist bot communicates with patients. Set your practice info, availability, blocked times, and booking rules.
      </p>

      {/* Practice Info + Booking Rules + Bot Messages (one PATCH) */}
      <section className="mt-6 rounded-lg border border-gray-200 bg-white p-4" aria-labelledby="practice-info-heading">
        <h2 id="practice-info-heading" className="text-lg font-semibold text-gray-900">Practice Info</h2>
        <form onSubmit={handleSaveSettings} className="mt-4 space-y-4">
          <div>
            <label htmlFor="practice_name" className="block text-sm font-medium text-gray-700">Practice name</label>
            <input id="practice_name" type="text" value={form.practice_name ?? ""} onChange={(e) => updateField("practice_name", e.target.value)} maxLength={200} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label htmlFor="timezone" className="block text-sm font-medium text-gray-700">Timezone</label>
            <select id="timezone" value={form.timezone ?? "UTC"} onChange={(e) => updateField("timezone", e.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
              {COMMON_TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="specialty" className="block text-sm font-medium text-gray-700">Specialty</label>
            <input id="specialty" type="text" value={form.specialty ?? ""} onChange={(e) => updateField("specialty", e.target.value)} maxLength={200} placeholder="e.g. General Practice" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label htmlFor="address_summary" className="block text-sm font-medium text-gray-700">Address summary</label>
            <input id="address_summary" type="text" value={form.address_summary ?? ""} onChange={(e) => updateField("address_summary", e.target.value)} maxLength={500} placeholder="e.g. 123 Main St, City" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label htmlFor="consultation_types" className="block text-sm font-medium text-gray-700">Consultation types</label>
            <input id="consultation_types" type="text" value={form.consultation_types ?? ""} onChange={(e) => updateField("consultation_types", e.target.value)} maxLength={200} placeholder="e.g. In-person, Video" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>

          <h3 className="pt-4 text-base font-medium text-gray-900">Booking Rules</h3>
          <div>
            <label htmlFor="slot_interval_minutes" className="block text-sm font-medium text-gray-700">Slot interval (minutes)</label>
            <select id="slot_interval_minutes" value={form.slot_interval_minutes ?? "30"} onChange={(e) => updateField("slot_interval_minutes", e.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
              {SLOT_INTERVAL_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="max_advance_booking_days" className="block text-sm font-medium text-gray-700">Max advance booking (days)</label>
              <input id="max_advance_booking_days" type="number" min={1} max={365} value={form.max_advance_booking_days ?? ""} onChange={(e) => updateField("max_advance_booking_days", e.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label htmlFor="min_advance_hours" className="block text-sm font-medium text-gray-700">Min advance (hours)</label>
              <input id="min_advance_hours" type="number" min={0} value={form.min_advance_hours ?? ""} onChange={(e) => updateField("min_advance_hours", e.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label htmlFor="business_hours_summary" className="block text-sm font-medium text-gray-700">Business hours summary</label>
            <input id="business_hours_summary" type="text" value={form.business_hours_summary ?? ""} onChange={(e) => updateField("business_hours_summary", e.target.value)} maxLength={500} placeholder="e.g. Mon–Fri 9am–5pm" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="cancellation_policy_hours" className="block text-sm font-medium text-gray-700">Cancellation policy (hours)</label>
              <input id="cancellation_policy_hours" type="number" min={0} value={form.cancellation_policy_hours ?? ""} onChange={(e) => updateField("cancellation_policy_hours", e.target.value)} placeholder="Optional" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label htmlFor="max_appointments_per_day" className="block text-sm font-medium text-gray-700">Max appointments/day</label>
              <input id="max_appointments_per_day" type="number" min={1} value={form.max_appointments_per_day ?? ""} onChange={(e) => updateField("max_appointments_per_day", e.target.value)} placeholder="Optional" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label htmlFor="booking_buffer_minutes" className="block text-sm font-medium text-gray-700">Booking buffer (min)</label>
              <input id="booking_buffer_minutes" type="number" min={0} value={form.booking_buffer_minutes ?? ""} onChange={(e) => updateField("booking_buffer_minutes", e.target.value)} placeholder="Optional" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
          </div>

          <h3 className="pt-4 text-base font-medium text-gray-900">Bot Messages</h3>
          <div>
            <label htmlFor="welcome_message" className="block text-sm font-medium text-gray-700">Welcome message (AI context)</label>
            <textarea id="welcome_message" rows={3} value={form.welcome_message ?? ""} onChange={(e) => updateField("welcome_message", e.target.value)} maxLength={1000} placeholder="Optional greeting for the bot" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label htmlFor="default_notes" className="block text-sm font-medium text-gray-700">Default appointment notes</label>
            <textarea id="default_notes" rows={2} value={form.default_notes ?? ""} onChange={(e) => updateField("default_notes", e.target.value)} maxLength={1000} placeholder="Optional default notes for new appointments" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>

          <button type="submit" disabled={settingsSaving} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50">
            {settingsSaving ? "Saving…" : "Save practice info & rules"}
          </button>
        </form>
      </section>

      {/* Availability */}
      <section className="mt-6 rounded-lg border border-gray-200 bg-white p-4" aria-labelledby="availability-heading">
        <h2 id="availability-heading" className="text-lg font-semibold text-gray-900">Availability</h2>
        <p className="mt-1 text-sm text-gray-600">Set your weekly availability. Patients can book within these slots.</p>
        {availabilityMessage && (
          <div role="alert" aria-live="polite" className={`mt-3 rounded-md p-2 text-sm ${availabilityMessage.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
            {availabilityMessage.text}
          </div>
        )}
        <form onSubmit={handleSaveAvailability} className="mt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-medium text-gray-900">Weekly slots</h3>
            <button type="button" onClick={addSlot} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">Add slot</button>
          </div>
          <ul className="mt-4 space-y-3">
            {slots.map((slot, i) => (
              <li key={i} className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <select value={slot.day_of_week} onChange={(e) => updateSlot(i, "day_of_week", Number(e.target.value) as DayOfWeek)} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" aria-label="Day of week">
                  {(Object.entries(DAY_NAMES) as [string, string][]).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
                <input id={`start-${i}`} type="time" value={slot.start_time} onChange={(e) => updateSlot(i, "start_time", e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" aria-label="Start time" />
                <span className="text-gray-500">to</span>
                <input id={`end-${i}`} type="time" value={slot.end_time} onChange={(e) => updateSlot(i, "end_time", e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" aria-label="End time" />
                <button type="button" onClick={() => removeSlot(i)} className="rounded-md border border-red-200 px-2 py-1.5 text-sm text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2" aria-label="Remove slot">Remove</button>
              </li>
            ))}
          </ul>
          {slots.length === 0 && <p className="mt-4 text-sm text-gray-500">No slots yet. Click &quot;Add slot&quot; to define your availability.</p>}
          <button type="submit" disabled={availabilitySaving} className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50">
            {availabilitySaving ? "Saving…" : "Save schedule"}
          </button>
        </form>
      </section>

      {/* Blocked Times */}
      <section className="mt-6 rounded-lg border border-gray-200 bg-white p-4" aria-labelledby="blocked-heading">
        <h2 id="blocked-heading" className="text-lg font-semibold text-gray-900">Blocked Times</h2>
        <p className="mt-1 text-sm text-gray-600">Block specific time slots when you are unavailable.</p>
        {blockedMessage && (
          <div role="alert" aria-live="polite" className={`mt-3 rounded-md p-2 text-sm ${blockedMessage.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
            {blockedMessage.text}
          </div>
        )}
        <form onSubmit={handleAddBlocked} className="mt-4 flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="add-start" className="block text-sm font-medium text-gray-700">Start</label>
            <input id="add-start" type="datetime-local" value={addStart} onChange={(e) => setAddStart(e.target.value)} required className="mt-1 block rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label htmlFor="add-end" className="block text-sm font-medium text-gray-700">End</label>
            <input id="add-end" type="datetime-local" value={addEnd} onChange={(e) => setAddEnd(e.target.value)} required className="mt-1 block rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div className="min-w-[200px] flex-1">
            <label htmlFor="add-reason" className="block text-sm font-medium text-gray-700">Reason (optional)</label>
            <input id="add-reason" type="text" value={addReason} onChange={(e) => setAddReason(e.target.value)} maxLength={500} placeholder="e.g. Vacation" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <button type="submit" disabled={adding} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50">
            {adding ? "Adding…" : "Add"}
          </button>
        </form>
        <div className="mt-4">
          <h3 className="text-base font-medium text-gray-900">Blocked periods</h3>
          {blockedTimes.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">No blocked times in the next 90 days.</p>
          ) : (
            <ul className="mt-2 divide-y divide-gray-200 rounded-lg border border-gray-200">
              {blockedTimes.map((bt) => (
                <li key={bt.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="font-medium text-gray-900">{formatDateTime(bt.start_time)} – {formatDateTime(bt.end_time)}</p>
                    {bt.reason && <p className="text-sm text-gray-600">{bt.reason}</p>}
                  </div>
                  <button type="button" onClick={() => handleDeleteBlocked(bt.id)} disabled={deletingId === bt.id} className="rounded-md border border-red-200 px-2 py-1.5 text-sm text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50" aria-label={`Remove blocked time ${formatDateTime(bt.start_time)}`}>
                    {deletingId === bt.id ? "Removing…" : "Remove"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
