"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { getDoctorSettings, patchDoctorSettings } from "@/lib/api";
import type { DoctorSettings, PatchDoctorSettingsPayload } from "@/types/doctor-settings";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { SaveButton } from "@/components/ui/SaveButton";

function toFormValue<T>(v: T | null | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function toForm(s: DoctorSettings | null): Record<string, string> {
  if (!s) return {};
  return {
    welcome_message: toFormValue(s.welcome_message),
    default_notes: toFormValue(s.default_notes),
  };
}

export default function BotMessagesPage() {
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

    const payload: PatchDoctorSettingsPayload = {
      welcome_message: form.welcome_message.trim() || null,
      default_notes: form.default_notes.trim() || null,
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
      <h1 className="text-2xl font-semibold text-gray-900">Bot Messages</h1>
      <p className="mt-1 text-gray-600">
        Welcome message and default appointment notes.
      </p>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4 rounded-lg border border-gray-200 bg-white p-4">
        <div>
          <FieldLabel htmlFor="welcome_message" tooltip="Greeting or context the AI bot uses when starting a conversation.">
            Welcome message (AI context)
          </FieldLabel>
          <textarea id="welcome_message" rows={3} value={form.welcome_message ?? ""} onChange={(e) => handleFormChange((p) => ({ ...p, welcome_message: e.target.value }))} maxLength={1000} placeholder="Optional greeting for the bot" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
        <div>
          <FieldLabel htmlFor="default_notes" tooltip="Notes pre-filled when creating new appointments.">
            Default appointment notes
          </FieldLabel>
          <textarea id="default_notes" rows={2} value={form.default_notes ?? ""} onChange={(e) => handleFormChange((p) => ({ ...p, default_notes: e.target.value }))} maxLength={1000} placeholder="Optional default notes for new appointments" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
        <SaveButton isDirty={isDirty} saving={saving} saveSuccess={saveSuccess} />
      </form>
    </div>
  );
}
