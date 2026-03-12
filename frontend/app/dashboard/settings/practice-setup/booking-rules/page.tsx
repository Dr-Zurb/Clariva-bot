"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { getDoctorSettings, patchDoctorSettings } from "@/lib/api";
import type { DoctorSettings, PatchDoctorSettingsPayload } from "@/types/doctor-settings";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { SaveButton } from "@/components/ui/SaveButton";

const SLOT_INTERVAL_OPTIONS = [5, 10, 15, 20, 25] as const;

function toFormValue<T>(v: T | null | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function toNum(v: string): number | null {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

function toForm(s: DoctorSettings | null): Record<string, string> {
  if (!s) return {};
  const slotVal = s.slot_interval_minutes;
  const slotStr = SLOT_INTERVAL_OPTIONS.includes(slotVal as (typeof SLOT_INTERVAL_OPTIONS)[number])
    ? String(slotVal)
    : "15";
  return {
    slot_interval_minutes: slotStr,
    max_advance_booking_days: toFormValue(s.max_advance_booking_days) || "30",
    min_advance_hours: toFormValue(s.min_advance_hours) || "0",
    business_hours_summary: toFormValue(s.business_hours_summary),
    cancellation_policy_hours: toFormValue(s.cancellation_policy_hours),
    max_appointments_per_day: toFormValue(s.max_appointments_per_day),
    booking_buffer_minutes: toFormValue(s.booking_buffer_minutes),
  };
}

export default function BookingRulesPage() {
  const [settings, setSettings] = useState<DoctorSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [lastSavedForm, setLastSavedForm] = useState<string>("");

  const isDirty = useMemo(
    () => lastSavedForm !== "" && JSON.stringify(form) !== lastSavedForm,
    [form, lastSavedForm]
  );

  const fetchSettings = useCallback(async () => {
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
      const res = await getDoctorSettings(token);
      const s = res.data.settings;
      setSettings(s);
      const f = toForm(s);
      setForm(f);
      setLastSavedForm(JSON.stringify(f));
      setSaveSuccess(false);
    } catch (err) {
      const status = err && typeof err === "object" && "status" in err ? (err as { status?: number }).status : 500;
      setError(status === 401 ? "Session expired." : "Unable to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;

    const slotInt = toNum(form.slot_interval_minutes);
    if (slotInt !== null && !SLOT_INTERVAL_OPTIONS.includes(slotInt as (typeof SLOT_INTERVAL_OPTIONS)[number])) return;

    const payload: PatchDoctorSettingsPayload = {
      slot_interval_minutes: slotInt ?? 15,
      max_advance_booking_days: toNum(form.max_advance_booking_days) ?? 30,
      min_advance_hours: toNum(form.min_advance_hours) ?? 0,
      business_hours_summary: form.business_hours_summary.trim() || null,
      cancellation_policy_hours: toNum(form.cancellation_policy_hours) ?? null,
      max_appointments_per_day: toNum(form.max_appointments_per_day) ?? null,
      booking_buffer_minutes: toNum(form.booking_buffer_minutes) ?? null,
    };

    setSaving(true);
    setSaveSuccess(false);
    try {
      const res = await patchDoctorSettings(token, payload);
      setSettings(res.data.settings);
      const f = toForm(res.data.settings);
      setForm(f);
      setLastSavedForm(JSON.stringify(f));
      setSaveSuccess(true);
    } finally {
      setSaving(false);
    }
  };

  const handleFormChange = useCallback(
    (updater: (p: Record<string, string>) => Record<string, string>) => {
      setSaveSuccess(false);
      setForm(updater);
    },
    []
  );

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4" aria-busy="true">
        <p className="text-sm text-gray-600">Loading…</p>
      </div>
    );
  }

  if (error && !settings) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800" role="alert">
        <p className="font-medium">Error</p>
        <p className="mt-1 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Booking Rules</h1>
      <p className="mt-1 text-gray-600">
        Slot length, advance booking limits, and cancellation policy.
      </p>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4 rounded-lg border border-gray-200 bg-white p-4">
        <div>
          <FieldLabel htmlFor="slot_interval_minutes" tooltip="Length of each bookable appointment slot (e.g. 15 min = 4 slots per hour).">
            Slot interval (minutes)
          </FieldLabel>
          <select id="slot_interval_minutes" value={form.slot_interval_minutes ?? "15"} onChange={(e) => handleFormChange((p) => ({ ...p, slot_interval_minutes: e.target.value }))} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
            {SLOT_INTERVAL_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="max_advance_booking_days" tooltip="How far in advance patients can book (e.g. 90 days).">
              Max advance booking (days)
            </FieldLabel>
            <input id="max_advance_booking_days" type="number" min={1} max={365} value={form.max_advance_booking_days ?? ""} onChange={(e) => handleFormChange((p) => ({ ...p, max_advance_booking_days: e.target.value }))} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <FieldLabel htmlFor="min_advance_hours" tooltip="Minimum hours before an appointment that patients must book (e.g. 1 = no same-day booking).">
              Min advance (hours)
            </FieldLabel>
            <input id="min_advance_hours" type="number" min={0} value={form.min_advance_hours ?? ""} onChange={(e) => handleFormChange((p) => ({ ...p, min_advance_hours: e.target.value }))} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
        </div>
        <div>
          <FieldLabel htmlFor="business_hours_summary" tooltip="Short summary shown to patients (e.g. Mon–Fri 9am–5pm).">
            Business hours summary
          </FieldLabel>
          <input id="business_hours_summary" type="text" value={form.business_hours_summary ?? ""} onChange={(e) => handleFormChange((p) => ({ ...p, business_hours_summary: e.target.value }))} maxLength={500} placeholder="e.g. Mon–Fri 9am–5pm" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <FieldLabel htmlFor="cancellation_policy_hours" tooltip="Hours before appointment by which patients must cancel to avoid fees.">
              Cancellation policy (hours)
            </FieldLabel>
            <input id="cancellation_policy_hours" type="number" min={0} value={form.cancellation_policy_hours ?? ""} onChange={(e) => handleFormChange((p) => ({ ...p, cancellation_policy_hours: e.target.value }))} placeholder="Optional" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <FieldLabel htmlFor="max_appointments_per_day" tooltip="Maximum appointments allowed per day (leave empty for no limit).">
              Max appointments/day
            </FieldLabel>
            <input id="max_appointments_per_day" type="number" min={1} value={form.max_appointments_per_day ?? ""} onChange={(e) => handleFormChange((p) => ({ ...p, max_appointments_per_day: e.target.value }))} placeholder="Optional" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <FieldLabel htmlFor="booking_buffer_minutes" tooltip="Buffer between appointments (e.g. 5 min for wrap-up time).">
              Booking buffer (min)
            </FieldLabel>
            <input id="booking_buffer_minutes" type="number" min={0} value={form.booking_buffer_minutes ?? ""} onChange={(e) => handleFormChange((p) => ({ ...p, booking_buffer_minutes: e.target.value }))} placeholder="Optional" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
        </div>
        <SaveButton isDirty={isDirty} saving={saving} saveSuccess={saveSuccess} />
      </form>
    </div>
  );
}
