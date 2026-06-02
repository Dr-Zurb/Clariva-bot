"use client";

/**
 * Patient flow settings — task pf-09.
 *
 * Two doctor preferences, both defaulting to the friendliest option:
 *   1. `patient_flow_advance` (radio): what pf-11's countdown overlay does
 *      after the wrap-up dialog finalises (countdown / instant / manual).
 *   2. `auto_no_show_after_min` (number): opt-in minutes after which pf-17's
 *      worker marks an appointment `no_show`. Empty = off.
 *
 * Pattern matches the OPD-mode sibling page (radio + advanced number input)
 * so the Settings UX stays consistent.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getDoctorSettings, patchDoctorSettings } from "@/lib/api";
import {
  AUTO_NO_SHOW_AFTER_MIN_MAX,
  AUTO_NO_SHOW_AFTER_MIN_MIN,
  PATIENT_FLOW_ADVANCE_VALUES,
  type DoctorSettings,
  type PatchDoctorSettingsPayload,
  type PatientFlowAdvance,
} from "@/types/doctor-settings";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { SaveButton } from "@/components/ui/SaveButton";

const FLOW_OPTIONS: ReadonlyArray<{
  value: PatientFlowAdvance;
  title: string;
  description: string;
  badge?: string;
}> = [
  {
    value: "countdown",
    title: "Confirm before advancing",
    description:
      "Show a 5-second countdown after I finish — gives me a beat to undo before the next patient loads.",
    badge: "Recommended",
  },
  {
    value: "instant",
    title: "Go to next patient instantly",
    description:
      "Skip the countdown — jump straight to the next patient. Best for high-volume OPDs where every second counts.",
  },
  {
    value: "manual",
    title: "Stay on this screen until I move",
    description:
      "Don't auto-advance. I'll open the next patient myself when I'm ready. Best for slow / complex consults.",
  },
];

function defaultPatientFlowAdvance(s: DoctorSettings | null): PatientFlowAdvance {
  const v = s?.patient_flow_advance;
  return PATIENT_FLOW_ADVANCE_VALUES.includes(v as PatientFlowAdvance)
    ? (v as PatientFlowAdvance)
    : "countdown";
}

function autoNoShowToInput(s: DoctorSettings | null): string {
  const v = s?.auto_no_show_after_min;
  return typeof v === "number" && Number.isFinite(v) ? String(v) : "";
}

export default function PatientFlowPage() {
  const [settings, setSettings] = useState<DoctorSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [flowAdvance, setFlowAdvance] = useState<PatientFlowAdvance>("countdown");
  const [autoNoShow, setAutoNoShow] = useState<string>("");

  const [lastSaved, setLastSaved] = useState<{
    flow: PatientFlowAdvance;
    autoNoShow: string;
  }>({ flow: "countdown", autoNoShow: "" });

  const isDirty = useMemo(
    () => flowAdvance !== lastSaved.flow || autoNoShow.trim() !== lastSaved.autoNoShow,
    [flowAdvance, autoNoShow, lastSaved]
  );

  const applySettings = useCallback((s: DoctorSettings) => {
    setSettings(s);
    const flow = defaultPatientFlowAdvance(s);
    const ans = autoNoShowToInput(s);
    setFlowAdvance(flow);
    setAutoNoShow(ans);
    setLastSaved({ flow, autoNoShow: ans });
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
        err && typeof err === "object" && "status" in err
          ? (err as { status?: number }).status
          : 500;
      setError(status === 401 ? "Session expired." : "Unable to load.");
    } finally {
      setLoading(false);
    }
  }, [applySettings]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Validate the auto-no-show input on every keystroke so SaveButton can block
  // submission with a clear reason. We mirror the backend bounds exactly.
  const autoNoShowError: string | null = useMemo(() => {
    const trimmed = autoNoShow.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    if (!Number.isInteger(n)) return "Auto no-show must be a whole number of minutes.";
    if (n < AUTO_NO_SHOW_AFTER_MIN_MIN || n > AUTO_NO_SHOW_AFTER_MIN_MAX) {
      return `Auto no-show must be between ${AUTO_NO_SHOW_AFTER_MIN_MIN} and ${AUTO_NO_SHOW_AFTER_MIN_MAX} minutes (or leave blank to turn off).`;
    }
    return null;
  }, [autoNoShow]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (autoNoShowError) {
      setError(autoNoShowError);
      return;
    }
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;

    const trimmed = autoNoShow.trim();
    const autoNoShowValue: number | null = trimmed === "" ? null : Number(trimmed);

    // Optimistic UI: paint the new values immediately so the doctor doesn't
    // see a flicker on save. On error we revert from `settings` (the last
    // server-confirmed snapshot).
    const prevFlow = lastSaved.flow;
    const prevAutoNoShow = lastSaved.autoNoShow;
    setLastSaved({ flow: flowAdvance, autoNoShow: trimmed });

    const payload: PatchDoctorSettingsPayload = {
      patient_flow_advance: flowAdvance,
      auto_no_show_after_min: autoNoShowValue,
    };

    setSaving(true);
    setSaveSuccess(false);
    setError(null);
    try {
      const res = await patchDoctorSettings(token, payload);
      applySettings(res.data.settings);
      setSaveSuccess(true);
    } catch {
      setLastSaved({ flow: prevFlow, autoNoShow: prevAutoNoShow });
      setFlowAdvance(prevFlow);
      setAutoNoShow(prevAutoNoShow);
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
      <div
        className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800"
        role="alert"
      >
        <p className="font-medium">Error</p>
        <p className="mt-1 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Patient flow</h1>
      <p className="mt-1 text-gray-600">
        How the dashboard moves you between patients after you finish a consultation, plus an
        opt-in timer for auto no-show.
      </p>

      {error && settings && (
        <div
          className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          role="status"
        >
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="mt-6 space-y-6 rounded-lg border border-gray-200 bg-white p-4"
      >
        <fieldset>
          <legend className="text-sm font-medium text-gray-900">
            After I tap Done with patient:
          </legend>
          <p className="mt-1 text-xs text-gray-500">
            Sets the rhythm of your day. You can change this any time.
          </p>
          <div className="mt-4 space-y-3">
            {FLOW_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer gap-3 rounded-md border border-gray-200 p-3 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50/40"
              >
                <input
                  type="radio"
                  name="patient_flow_advance"
                  value={opt.value}
                  checked={flowAdvance === opt.value}
                  onChange={() => {
                    setFlowAdvance(opt.value);
                    setSaveSuccess(false);
                  }}
                  className="mt-1 h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span>
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{opt.title}</span>
                    {opt.badge ? (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-700">
                        {opt.badge}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 block text-sm text-gray-600">{opt.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="rounded-md border border-gray-100 bg-gray-50/80 p-3">
          <legend className="px-1 text-sm font-medium text-gray-900">
            Auto mark as no-show after
          </legend>
          <p className="mt-1 text-xs text-gray-600">
            When set, the system marks an appointment <em>no-show</em> if no consultation has
            started after this many minutes past the scheduled time. Leave blank to turn off.
          </p>
          <div className="mt-3 max-w-xs">
            <FieldLabel
              htmlFor="auto_no_show_after_min"
              tooltip={`Minutes (${AUTO_NO_SHOW_AFTER_MIN_MIN}–${AUTO_NO_SHOW_AFTER_MIN_MAX}); leave blank to disable.`}
            >
              Minutes
            </FieldLabel>
            <input
              id="auto_no_show_after_min"
              type="number"
              inputMode="numeric"
              min={AUTO_NO_SHOW_AFTER_MIN_MIN}
              max={AUTO_NO_SHOW_AFTER_MIN_MAX}
              step={1}
              value={autoNoShow}
              onChange={(e) => {
                setAutoNoShow(e.target.value);
                setSaveSuccess(false);
              }}
              placeholder="off"
              aria-invalid={autoNoShowError ? true : undefined}
              aria-describedby="auto_no_show_after_min_caveat"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <p
            id="auto_no_show_after_min_caveat"
            className="mt-2 text-xs text-gray-500"
          >
            Only fires when no consultation has started. Telemed: leave blank or set high —
            patients are often a few minutes late.
          </p>
        </fieldset>

        <SaveButton
          isDirty={isDirty}
          saving={saving}
          saveSuccess={saveSuccess}
          disableReason={isDirty ? autoNoShowError : null}
        />
      </form>
    </div>
  );
}
