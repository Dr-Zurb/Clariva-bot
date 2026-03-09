"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { getDoctorSettings, patchDoctorSettings } from "@/lib/api";
import type { DoctorSettings, PatchDoctorSettingsPayload } from "@/types/doctor-settings";

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

function toFormValue<T>(v: T | null | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function toNum(v: string): number | null {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

/**
 * Doctor settings form. Fetches on load, submits via PATCH.
 * @see e-task-5
 */
export default function DoctorSettingsForm() {
  const [settings, setSettings] = useState<DoctorSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [form, setForm] = useState<Record<string, string>>({});

  const fetchSettings = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setError("Not signed in");
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const res = await getDoctorSettings(token);
      const s = res.data.settings;
      setSettings(s);
      setForm({
        practice_name: toFormValue(s.practice_name),
        timezone: toFormValue(s.timezone) || "UTC",
        slot_interval_minutes: toFormValue(s.slot_interval_minutes) || "30",
        max_advance_booking_days: toFormValue(s.max_advance_booking_days) || "30",
        min_advance_hours: toFormValue(s.min_advance_hours) || "0",
        business_hours_summary: toFormValue(s.business_hours_summary),
        cancellation_policy_hours: toFormValue(s.cancellation_policy_hours),
        max_appointments_per_day: toFormValue(s.max_appointments_per_day),
        booking_buffer_minutes: toFormValue(s.booking_buffer_minutes),
        welcome_message: toFormValue(s.welcome_message),
        specialty: toFormValue(s.specialty),
        address_summary: toFormValue(s.address_summary),
        consultation_types: toFormValue(s.consultation_types),
        default_notes: toFormValue(s.default_notes),
      });
    } catch (err) {
      const status = err && typeof err === "object" && "status" in err ? (err as { status?: number }).status : 500;
      setError(
        status === 401
          ? "Session expired. Please sign in again."
          : "Unable to load settings. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateField = (name: string, value: string) => {
    setForm((prev) => ({ ...prev, [name]: value }));
    setMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setError("Not signed in");
      return;
    }

    const slotInt = toNum(form.slot_interval_minutes);
    if (slotInt !== null && !SLOT_INTERVAL_OPTIONS.includes(slotInt as (typeof SLOT_INTERVAL_OPTIONS)[number])) {
      setMessage({ type: "error", text: "Slot interval must be 15, 20, 30, 45, or 60 minutes." });
      return;
    }

    const payload: PatchDoctorSettingsPayload = {
      practice_name: form.practice_name.trim() || null,
      timezone: form.timezone.trim() || "UTC",
      slot_interval_minutes: slotInt ?? 30,
      max_advance_booking_days: toNum(form.max_advance_booking_days) ?? 30,
      min_advance_hours: toNum(form.min_advance_hours) ?? 0,
      business_hours_summary: form.business_hours_summary.trim() || null,
      cancellation_policy_hours: toNum(form.cancellation_policy_hours) ?? null,
      max_appointments_per_day: toNum(form.max_appointments_per_day) ?? null,
      booking_buffer_minutes: toNum(form.booking_buffer_minutes) ?? null,
      welcome_message: form.welcome_message.trim() || null,
      specialty: form.specialty.trim() || null,
      address_summary: form.address_summary.trim() || null,
      consultation_types: form.consultation_types.trim() || null,
      default_notes: form.default_notes.trim() || null,
    };

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await patchDoctorSettings(token, payload);
      setSettings(res.data.settings);
      setMessage({ type: "success", text: "Settings saved successfully." });
    } catch (err) {
      const status = err && typeof err === "object" && "status" in err ? (err as { status?: number }).status : 500;
      setMessage({
        type: "error",
        text: status === 401 ? "Session expired. Please sign in again." : "Failed to save. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4" aria-busy="true" aria-live="polite">
        <p className="text-sm text-gray-600">Loading settings…</p>
      </div>
    );
  }

  if (error && !settings) {
    return (
      <div
        className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800"
        role="alert"
        aria-live="polite"
      >
        <p className="font-medium">Error</p>
        <p className="mt-1 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-lg font-semibold text-gray-900">Doctor Settings</h2>
      <p className="mt-1 text-sm text-gray-600">
        Practice details, booking rules, and AI context.
      </p>
      {message && (
        <div
          role="alert"
          aria-live="polite"
          className={`mt-3 rounded-md p-2 text-sm ${message.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}
        >
          {message.text}
        </div>
      )}
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label htmlFor="practice_name" className="block text-sm font-medium text-gray-700">
            Practice name
          </label>
          <input
            id="practice_name"
            type="text"
            value={form.practice_name ?? ""}
            onChange={(e) => updateField("practice_name", e.target.value)}
            maxLength={200}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="timezone" className="block text-sm font-medium text-gray-700">
            Timezone
          </label>
          <select
            id="timezone"
            value={form.timezone ?? "UTC"}
            onChange={(e) => updateField("timezone", e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {COMMON_TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="slot_interval_minutes" className="block text-sm font-medium text-gray-700">
            Slot interval (minutes)
          </label>
          <select
            id="slot_interval_minutes"
            value={form.slot_interval_minutes ?? "30"}
            onChange={(e) => updateField("slot_interval_minutes", e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {SLOT_INTERVAL_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="max_advance_booking_days" className="block text-sm font-medium text-gray-700">
              Max advance booking (days)
            </label>
            <input
              id="max_advance_booking_days"
              type="number"
              min={1}
              max={365}
              value={form.max_advance_booking_days ?? ""}
              onChange={(e) => updateField("max_advance_booking_days", e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="min_advance_hours" className="block text-sm font-medium text-gray-700">
              Min advance (hours)
            </label>
            <input
              id="min_advance_hours"
              type="number"
              min={0}
              value={form.min_advance_hours ?? ""}
              onChange={(e) => updateField("min_advance_hours", e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
        <div>
          <label htmlFor="business_hours_summary" className="block text-sm font-medium text-gray-700">
            Business hours summary
          </label>
          <input
            id="business_hours_summary"
            type="text"
            value={form.business_hours_summary ?? ""}
            onChange={(e) => updateField("business_hours_summary", e.target.value)}
            maxLength={500}
            placeholder="e.g. Mon–Fri 9am–5pm"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="cancellation_policy_hours" className="block text-sm font-medium text-gray-700">
              Cancellation policy (hours)
            </label>
            <input
              id="cancellation_policy_hours"
              type="number"
              min={0}
              value={form.cancellation_policy_hours ?? ""}
              onChange={(e) => updateField("cancellation_policy_hours", e.target.value)}
              placeholder="Optional"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="max_appointments_per_day" className="block text-sm font-medium text-gray-700">
              Max appointments/day
            </label>
            <input
              id="max_appointments_per_day"
              type="number"
              min={1}
              value={form.max_appointments_per_day ?? ""}
              onChange={(e) => updateField("max_appointments_per_day", e.target.value)}
              placeholder="Optional"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="booking_buffer_minutes" className="block text-sm font-medium text-gray-700">
              Booking buffer (min)
            </label>
            <input
              id="booking_buffer_minutes"
              type="number"
              min={0}
              value={form.booking_buffer_minutes ?? ""}
              onChange={(e) => updateField("booking_buffer_minutes", e.target.value)}
              placeholder="Optional"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
        <div>
          <label htmlFor="specialty" className="block text-sm font-medium text-gray-700">
            Specialty
          </label>
          <input
            id="specialty"
            type="text"
            value={form.specialty ?? ""}
            onChange={(e) => updateField("specialty", e.target.value)}
            maxLength={200}
            placeholder="e.g. General Practice"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="address_summary" className="block text-sm font-medium text-gray-700">
            Address summary
          </label>
          <input
            id="address_summary"
            type="text"
            value={form.address_summary ?? ""}
            onChange={(e) => updateField("address_summary", e.target.value)}
            maxLength={500}
            placeholder="e.g. 123 Main St, City"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="consultation_types" className="block text-sm font-medium text-gray-700">
            Consultation types
          </label>
          <input
            id="consultation_types"
            type="text"
            value={form.consultation_types ?? ""}
            onChange={(e) => updateField("consultation_types", e.target.value)}
            maxLength={200}
            placeholder="e.g. In-person, Video"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="welcome_message" className="block text-sm font-medium text-gray-700">
            Welcome message (AI context)
          </label>
          <textarea
            id="welcome_message"
            rows={3}
            value={form.welcome_message ?? ""}
            onChange={(e) => updateField("welcome_message", e.target.value)}
            maxLength={1000}
            placeholder="Optional greeting for the bot"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="default_notes" className="block text-sm font-medium text-gray-700">
            Default appointment notes
          </label>
          <textarea
            id="default_notes"
            rows={2}
            value={form.default_notes ?? ""}
            onChange={(e) => updateField("default_notes", e.target.value)}
            maxLength={1000}
            placeholder="Optional default notes for new appointments"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
      </form>
    </div>
  );
}
