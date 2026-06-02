"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { getDoctorSettings, patchDoctorSettings } from "@/lib/api";
import type { DoctorSettings, PatchDoctorSettingsPayload } from "@/types/doctor-settings";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { SaveButton } from "@/components/ui/SaveButton";
import { SpecialtyCombobox } from "@/components/practice-setup/SpecialtyCombobox";

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

const PRACTICE_CURRENCY_OPTIONS = ["INR", "USD", "EUR", "GBP"] as const;

const PRACTICE_CURRENCY_LABEL: Record<(typeof PRACTICE_CURRENCY_OPTIONS)[number], string> = {
  INR: "INR (₹)",
  USD: "USD ($)",
  EUR: "EUR (€)",
  GBP: "GBP (£)",
};

function toFormValue<T>(v: T | null | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function toForm(s: DoctorSettings | null): Record<string, string> {
  if (!s) return {};
  return {
    practice_name: toFormValue(s.practice_name),
    timezone: toFormValue(s.timezone) || "UTC",
    specialty: toFormValue(s.specialty),
    address_summary: toFormValue(s.address_summary),
    appointment_fee_currency: toFormValue(s.appointment_fee_currency) || "INR",
  };
}

export default function PracticeInfoPage() {
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

    const currency = (form.appointment_fee_currency?.trim() || "INR").toUpperCase().slice(0, 3);

    const payload: PatchDoctorSettingsPayload = {
      practice_name: form.practice_name.trim() || null,
      timezone: form.timezone.trim() || "UTC",
      specialty: form.specialty.trim() || null,
      address_summary: form.address_summary.trim() || null,
      appointment_fee_currency: currency,
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
      <h1 className="text-2xl font-semibold text-gray-900">Practice Info</h1>
      <p className="mt-1 text-gray-600">
        Practice name, timezone, specialty, address, and <strong>practice currency</strong> (for service catalog
        amounts and quotes). Teleconsult lines and prices are set under <span className="font-medium">Services catalog</span>.
      </p>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4 rounded-lg border border-gray-200 bg-white p-4">
        <div>
          <FieldLabel htmlFor="practice_name" tooltip="Name of your practice or clinic as shown to patients.">
            Practice name
          </FieldLabel>
          <input id="practice_name" type="text" value={form.practice_name ?? ""} onChange={(e) => handleFormChange((p) => ({ ...p, practice_name: e.target.value }))} maxLength={200} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
        <div>
          <FieldLabel htmlFor="timezone" tooltip="Your local timezone for scheduling and appointment times.">
            Timezone
          </FieldLabel>
          <select id="timezone" value={form.timezone ?? "UTC"} onChange={(e) => handleFormChange((p) => ({ ...p, timezone: e.target.value }))} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
            {COMMON_TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </div>
        <div>
          <FieldLabel
            htmlFor="specialty"
            tooltip="Search the curated list (India-focused). Pick a row or choose Other / not listed — then type a custom specialty in the field on the right (max 200 characters)."
          >
            Specialty
          </FieldLabel>
          <SpecialtyCombobox
            id="specialty"
            value={form.specialty ?? ""}
            onChange={(next) => handleFormChange((p) => ({ ...p, specialty: next }))}
          />
        </div>
        <div>
          <FieldLabel htmlFor="address_summary" tooltip="Short address or location description for patients.">
            Address summary
          </FieldLabel>
          <input id="address_summary" type="text" value={form.address_summary ?? ""} onChange={(e) => handleFormChange((p) => ({ ...p, address_summary: e.target.value }))} maxLength={500} placeholder="e.g. 123 Main St, City" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
        <div>
          <FieldLabel
            htmlFor="appointment_fee_currency"
            tooltip="ISO 4217 code. All service catalog prices and checkout quotes use this currency; amounts are stored in minor units (e.g. paise or cents)."
          >
            Practice currency
          </FieldLabel>
          <select
            id="appointment_fee_currency"
            value={form.appointment_fee_currency ?? "INR"}
            onChange={(e) => handleFormChange((p) => ({ ...p, appointment_fee_currency: e.target.value }))}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {PRACTICE_CURRENCY_OPTIONS.map((code) => (
              <option key={code} value={code}>
                {PRACTICE_CURRENCY_LABEL[code]}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Service catalog list prices and follow-up discounts use this currency. Save here before interpreting amounts
            on the Services catalog page.
          </p>
        </div>
        <SaveButton isDirty={isDirty} saving={saving} saveSuccess={saveSuccess} />
      </form>
    </div>
  );
}
