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

function toForm(s: DoctorSettings | null): Record<string, string | boolean> {
  if (!s) {
    return {
      welcome_message: "",
      default_notes: "",
      instagram_receptionist_pause_message: "",
      instagram_receptionist_paused: false,
    };
  }
  return {
    welcome_message: toFormValue(s.welcome_message),
    default_notes: toFormValue(s.default_notes),
    instagram_receptionist_pause_message: toFormValue(s.instagram_receptionist_pause_message),
    instagram_receptionist_paused: s.instagram_receptionist_paused === true,
  };
}

export default function BotMessagesPage() {
  const [settings, setSettings] = useState<DoctorSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string | boolean>>({});
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
      welcome_message: typeof form.welcome_message === "string" ? form.welcome_message.trim() || null : null,
      default_notes: typeof form.default_notes === "string" ? form.default_notes.trim() || null : null,
      instagram_receptionist_paused: form.instagram_receptionist_paused === true,
      instagram_receptionist_pause_message:
        form.instagram_receptionist_paused === true &&
        typeof form.instagram_receptionist_pause_message === "string" &&
        form.instagram_receptionist_pause_message.trim()
          ? form.instagram_receptionist_pause_message.trim()
          : null,
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
    (updater: (p: Record<string, string | boolean>) => Record<string, string | boolean>) => {
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
        Welcome message and default appointment notes. Pause automated Instagram replies when you want to handle DMs yourself.
      </p>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4 rounded-lg border border-gray-200 bg-white p-4">
        <div className="rounded-md border border-amber-100 bg-amber-50/80 p-3">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={form.instagram_receptionist_paused === true}
              onChange={(e) => handleFormChange((p) => ({ ...p, instagram_receptionist_paused: e.target.checked }))}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span>
              <span className="font-medium text-gray-900">Pause Instagram receptionist (human handoff)</span>
              <span className="mt-1 block text-sm text-gray-600">
                When on, automated DMs stop and patients get a short notice that a person will reply when possible. High-intent
                comment auto-DMs and public replies are also paused; you still get lead emails. Data rights flows (e.g. revoke consent) are not blocked.
              </span>
            </span>
          </label>
          <div className="mt-3 pl-7">
            <FieldLabel htmlFor="instagram_receptionist_pause_message" tooltip="Optional — overrides the default handoff sentence. Do not promise an immediate reply unless your team can deliver.">
              Custom pause message (optional)
            </FieldLabel>
            <textarea
              id="instagram_receptionist_pause_message"
              rows={2}
              value={typeof form.instagram_receptionist_pause_message === "string" ? form.instagram_receptionist_pause_message : ""}
              onChange={(e) => handleFormChange((p) => ({ ...p, instagram_receptionist_pause_message: e.target.value }))}
              maxLength={500}
              placeholder="Leave blank to use the default polite handoff text"
              disabled={form.instagram_receptionist_paused !== true}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
            />
          </div>
        </div>
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
