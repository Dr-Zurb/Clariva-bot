"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { getDoctorSettings, patchDoctorSettings } from "@/lib/api";
import type { DoctorSettings, PatchDoctorSettingsPayload } from "@/types/doctor-settings";

const SLOT_INTERVAL_OPTIONS = [15, 20, 30, 45, 60] as const;

function toFormValue<T>(v: T | null | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function toNum(v: string): number | null {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

export default function BookingRulesPage() {
  const [settings, setSettings] = useState<DoctorSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});

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
      setForm({
        slot_interval_minutes: toFormValue(s.slot_interval_minutes) || "30",
        max_advance_booking_days: toFormValue(s.max_advance_booking_days) || "30",
        min_advance_hours: toFormValue(s.min_advance_hours) || "0",
        business_hours_summary: toFormValue(s.business_hours_summary),
        cancellation_policy_hours: toFormValue(s.cancellation_policy_hours),
        max_appointments_per_day: toFormValue(s.max_appointments_per_day),
        booking_buffer_minutes: toFormValue(s.booking_buffer_minutes),
      });
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
      slot_interval_minutes: slotInt ?? 30,
      max_advance_booking_days: toNum(form.max_advance_booking_days) ?? 30,
      min_advance_hours: toNum(form.min_advance_hours) ?? 0,
      business_hours_summary: form.business_hours_summary.trim() || null,
      cancellation_policy_hours: toNum(form.cancellation_policy_hours) ?? null,
      max_appointments_per_day: toNum(form.max_appointments_per_day) ?? null,
      booking_buffer_minutes: toNum(form.booking_buffer_minutes) ?? null,
    };

    setSaving(true);
    try {
      const res = await patchDoctorSettings(token, payload);
      setSettings(res.data.settings);
    } finally {
      setSaving(false);
    }
  };

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
      <Link
        href="/dashboard/settings/practice-setup"
        className="mb-4 inline-flex items-center text-sm text-gray-600 hover:text-blue-600"
      >
        ← Back to Practice Setup
      </Link>
      <h1 className="text-2xl font-semibold text-gray-900">Booking Rules</h1>
      <p className="mt-1 text-gray-600">
        Slot length, advance booking limits, and cancellation policy.
      </p>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4 rounded-lg border border-gray-200 bg-white p-4">
        <div>
          <label htmlFor="slot_interval_minutes" className="block text-sm font-medium text-gray-700">Slot interval (minutes)</label>
          <select id="slot_interval_minutes" value={form.slot_interval_minutes ?? "30"} onChange={(e) => setForm((p) => ({ ...p, slot_interval_minutes: e.target.value }))} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
            {SLOT_INTERVAL_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="max_advance_booking_days" className="block text-sm font-medium text-gray-700">Max advance booking (days)</label>
            <input id="max_advance_booking_days" type="number" min={1} max={365} value={form.max_advance_booking_days ?? ""} onChange={(e) => setForm((p) => ({ ...p, max_advance_booking_days: e.target.value }))} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label htmlFor="min_advance_hours" className="block text-sm font-medium text-gray-700">Min advance (hours)</label>
            <input id="min_advance_hours" type="number" min={0} value={form.min_advance_hours ?? ""} onChange={(e) => setForm((p) => ({ ...p, min_advance_hours: e.target.value }))} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
        </div>
        <div>
          <label htmlFor="business_hours_summary" className="block text-sm font-medium text-gray-700">Business hours summary</label>
          <input id="business_hours_summary" type="text" value={form.business_hours_summary ?? ""} onChange={(e) => setForm((p) => ({ ...p, business_hours_summary: e.target.value }))} maxLength={500} placeholder="e.g. Mon–Fri 9am–5pm" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="cancellation_policy_hours" className="block text-sm font-medium text-gray-700">Cancellation policy (hours)</label>
            <input id="cancellation_policy_hours" type="number" min={0} value={form.cancellation_policy_hours ?? ""} onChange={(e) => setForm((p) => ({ ...p, cancellation_policy_hours: e.target.value }))} placeholder="Optional" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label htmlFor="max_appointments_per_day" className="block text-sm font-medium text-gray-700">Max appointments/day</label>
            <input id="max_appointments_per_day" type="number" min={1} value={form.max_appointments_per_day ?? ""} onChange={(e) => setForm((p) => ({ ...p, max_appointments_per_day: e.target.value }))} placeholder="Optional" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label htmlFor="booking_buffer_minutes" className="block text-sm font-medium text-gray-700">Booking buffer (min)</label>
            <input id="booking_buffer_minutes" type="number" min={0} value={form.booking_buffer_minutes ?? ""} onChange={(e) => setForm((p) => ({ ...p, booking_buffer_minutes: e.target.value }))} placeholder="Optional" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
        </div>
        <button type="submit" disabled={saving} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50">
          {saving ? "Saving…" : "Save"}
        </button>
      </form>
    </div>
  );
}
