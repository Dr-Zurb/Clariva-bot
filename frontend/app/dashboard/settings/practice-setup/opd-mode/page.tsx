"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getDoctorSettings, patchDoctorSettings } from "@/lib/api";
import type { DoctorSettings, OpdMode, PatchDoctorSettingsPayload } from "@/types/doctor-settings";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { SaveButton } from "@/components/ui/SaveButton";

function defaultOpdMode(s: DoctorSettings | null): OpdMode {
  const m = s?.opd_mode;
  return m === "queue" || m === "slot" ? m : "slot";
}

function graceFromPolicies(policies: Record<string, unknown> | null | undefined): string {
  if (!policies || typeof policies !== "object") return "";
  const v = policies.slot_grace_join_minutes;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

export default function OpdModePage() {
  const [settings, setSettings] = useState<DoctorSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [opdMode, setOpdMode] = useState<OpdMode>("slot");
  const [graceMinutes, setGraceMinutes] = useState<string>("");

  const [lastSaved, setLastSaved] = useState<{ mode: OpdMode; grace: string }>({
    mode: "slot",
    grace: "",
  });

  const isDirty = useMemo(
    () => opdMode !== lastSaved.mode || graceMinutes !== lastSaved.grace,
    [opdMode, graceMinutes, lastSaved]
  );

  const applySettings = useCallback((s: DoctorSettings) => {
    setSettings(s);
    const mode = defaultOpdMode(s);
    const grace = graceFromPolicies(s.opd_policies);
    setOpdMode(mode);
    setGraceMinutes(grace);
    setLastSaved({ mode, grace });
  }, []);

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
      applySettings(res.data.settings);
      setSaveSuccess(false);
    } catch (err) {
      const status =
        err && typeof err === "object" && "status" in err ? (err as { status?: number }).status : 500;
      setError(status === 401 ? "Session expired." : "Unable to load.");
    } finally {
      setLoading(false);
    }
  }, [applySettings]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;

    const graceNum = graceMinutes.trim() === "" ? null : parseInt(graceMinutes, 10);
    if (graceNum !== null && (Number.isNaN(graceNum) || graceNum < 0 || graceNum > 120)) {
      setError("Grace period must be between 0 and 120 minutes (or leave empty).");
      return;
    }

    const prevPolicies = settings?.opd_policies && typeof settings.opd_policies === "object"
      ? { ...settings.opd_policies }
      : {};

    if (graceNum === null) {
      delete prevPolicies.slot_grace_join_minutes;
    } else {
      prevPolicies.slot_grace_join_minutes = graceNum;
    }

    const payload: PatchDoctorSettingsPayload = {
      opd_mode: opdMode,
      opd_policies: Object.keys(prevPolicies).length > 0 ? prevPolicies : null,
    };

    setSaving(true);
    setSaveSuccess(false);
    setError(null);
    try {
      const res = await patchDoctorSettings(token, payload);
      applySettings(res.data.settings);
      setSaveSuccess(true);
    } catch {
      setError("Save failed. Try again.");
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
      <h1 className="text-2xl font-semibold text-gray-900">OPD mode</h1>
      <p className="mt-1 text-gray-600">
        Choose how patients join your outpatient flow: fixed appointment times, or a token queue with estimated wait (when
        enabled in a later release).
      </p>

      {error && settings && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-6 rounded-lg border border-gray-200 bg-white p-4">
        <fieldset>
          <legend className="text-sm font-medium text-gray-900">How patients join</legend>
          <p className="mt-1 text-xs text-gray-500">Default for all doctors is fixed slots until queue features are fully rolled out.</p>
          <div className="mt-4 space-y-3">
            <label className="flex cursor-pointer gap-3 rounded-md border border-gray-200 p-3 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50/40">
              <input
                type="radio"
                name="opd_mode"
                value="slot"
                checked={opdMode === "slot"}
                onChange={() => {
                  setOpdMode("slot");
                  setSaveSuccess(false);
                }}
                className="mt-1 h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span>
                <span className="font-medium text-gray-900">Fixed time slots</span>
                <span className="mt-1 block text-sm text-gray-600">
                  Patients book a specific time on your calendar (current behaviour). Best when visits are predictable.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer gap-3 rounded-md border border-gray-200 p-3 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50/40">
              <input
                type="radio"
                name="opd_mode"
                value="queue"
                checked={opdMode === "queue"}
                onChange={() => {
                  setOpdMode("queue");
                  setSaveSuccess(false);
                }}
                className="mt-1 h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span>
                <span className="font-medium text-gray-900">Token queue</span>
                <span className="mt-1 block text-sm text-gray-600">
                  Patients receive a place in line for a session; estimated wait uses tokens and averages (full queue booking
                  flow ships in a follow-up task). You can select this to prepare your practice.
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        <details className="rounded-md border border-gray-100 bg-gray-50/80 p-3">
          <summary className="cursor-pointer text-sm font-medium text-gray-800">Advanced — slot grace (optional)</summary>
          <p className="mt-2 text-xs text-gray-600">
            Minutes after the scheduled slot start that a patient can still join before being treated as late (used when slot
            policies are enforced in the app). Leave empty to rely on defaults later.
          </p>
          <div className="mt-3 max-w-xs">
            <FieldLabel htmlFor="slot_grace_join_minutes" tooltip="0–120 minutes; optional.">
              Grace period (minutes)
            </FieldLabel>
            <input
              id="slot_grace_join_minutes"
              type="number"
              min={0}
              max={120}
              value={graceMinutes}
              onChange={(e) => {
                setGraceMinutes(e.target.value);
                setSaveSuccess(false);
              }}
              placeholder="e.g. 5"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </details>

        <SaveButton isDirty={isDirty} saving={saving} saveSuccess={saveSuccess} />
      </form>
    </div>
  );
}
