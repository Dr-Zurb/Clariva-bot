"use client";

import { useMemo } from "react";

import { FieldLabel } from "@/components/ui/FieldLabel";
import { Input } from "@/components/ui/input";
import { SaveButton } from "@/components/ui/SaveButton";
import { SettingsPageShell } from "@/components/settings/SettingsPageShell";
import { useDoctorSettingsForm } from "@/hooks/useDoctorSettingsForm";
import {
  AUTO_NO_SHOW_AFTER_MIN_MAX,
  AUTO_NO_SHOW_AFTER_MIN_MIN,
  PATIENT_FLOW_ADVANCE_VALUES,
  type DoctorSettings,
  type PatchDoctorSettingsPayload,
  type PatientFlowAdvance,
} from "@/types/doctor-settings";

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
      "Skip the countdown — jump straight to the next patient. Best for high-volume OPDs.",
  },
  {
    value: "manual",
    title: "Stay on this screen until I move",
    description:
      "Don't auto-advance. I'll open the next patient myself when I'm ready.",
  },
];

type PatientFlowForm = {
  flowAdvance: PatientFlowAdvance;
  autoNoShow: string;
};

function toForm(s: DoctorSettings): PatientFlowForm {
  const v = s.patient_flow_advance;
  const flow = PATIENT_FLOW_ADVANCE_VALUES.includes(v as PatientFlowAdvance)
    ? (v as PatientFlowAdvance)
    : "countdown";
  const ans =
    typeof s.auto_no_show_after_min === "number" &&
    Number.isFinite(s.auto_no_show_after_min)
      ? String(s.auto_no_show_after_min)
      : "";
  return { flowAdvance: flow, autoNoShow: ans };
}

interface PatientFlowClientProps {
  token: string;
}

export function PatientFlowClient({ token }: PatientFlowClientProps) {
  const {
    form,
    setForm,
    isDirty,
    saving,
    saveSuccess,
    saveError,
    save,
    isLoading,
    loadError,
    refetch,
  } = useDoctorSettingsForm(token, toForm);

  const autoNoShowError = useMemo(() => {
    if (!form) return null;
    const trimmed = form.autoNoShow.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    if (!Number.isInteger(n)) {
      return "Auto no-show must be a whole number of minutes.";
    }
    if (n < AUTO_NO_SHOW_AFTER_MIN_MIN || n > AUTO_NO_SHOW_AFTER_MIN_MAX) {
      return `Auto no-show must be between ${AUTO_NO_SHOW_AFTER_MIN_MIN} and ${AUTO_NO_SHOW_AFTER_MIN_MAX} minutes (or leave blank to turn off).`;
    }
    return null;
  }, [form]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form || autoNoShowError) return;
    const trimmed = form.autoNoShow.trim();
    const payload: PatchDoctorSettingsPayload = {
      patient_flow_advance: form.flowAdvance,
      auto_no_show_after_min: trimmed === "" ? null : Number(trimmed),
    };
    await save(payload);
  }

  return (
    <SettingsPageShell
      title="Patient flow"
      description="How the dashboard moves you between patients after you finish a consultation, plus an opt-in timer for auto no-show."
      isLoading={isLoading || !form}
      loadError={loadError}
      onRetry={() => void refetch()}
      saveError={saveError ?? autoNoShowError}
    >
      {form ? (
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="mt-6 space-y-6 rounded-lg border border-border bg-card p-4"
        >
          <fieldset>
            <legend className="text-sm font-medium text-foreground">
              After I tap Done with patient:
            </legend>
            <p className="mt-1 text-xs text-muted-foreground">
              Sets the rhythm of your day. You can change this any time.
            </p>
            <div className="mt-4 space-y-3">
              {FLOW_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex cursor-pointer gap-3 rounded-md border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                >
                  <input
                    type="radio"
                    name="patient_flow_advance"
                    value={opt.value}
                    checked={form.flowAdvance === opt.value}
                    onChange={() =>
                      setForm((p) => ({ ...p, flowAdvance: opt.value }))
                    }
                    className="mt-1 h-4 w-4 border-input text-primary focus:ring-ring"
                  />
                  <span>
                    <span className="flex items-center gap-2">
                      <span className="font-medium text-foreground">
                        {opt.title}
                      </span>
                      {opt.badge ? (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                          {opt.badge}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {opt.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="rounded-md border border-border bg-muted/40 p-3">
            <legend className="px-1 text-sm font-medium text-foreground">
              Auto mark as no-show after
            </legend>
            <p className="mt-1 text-xs text-muted-foreground">
              When set, the system marks an appointment no-show if no consultation
              has started after this many minutes past the scheduled time. Leave
              blank to turn off.
            </p>
            <div className="mt-3 max-w-xs">
              <FieldLabel
                htmlFor="auto_no_show_after_min"
                tooltip={`Minutes (${AUTO_NO_SHOW_AFTER_MIN_MIN}–${AUTO_NO_SHOW_AFTER_MIN_MAX}); leave blank to disable.`}
              >
                Minutes
              </FieldLabel>
              <Input
                id="auto_no_show_after_min"
                type="number"
                inputMode="numeric"
                min={AUTO_NO_SHOW_AFTER_MIN_MIN}
                max={AUTO_NO_SHOW_AFTER_MIN_MAX}
                step={1}
                value={form.autoNoShow}
                onChange={(e) =>
                  setForm((p) => ({ ...p, autoNoShow: e.target.value }))
                }
                placeholder="off"
                aria-invalid={autoNoShowError ? true : undefined}
                className="mt-1"
              />
            </div>
          </fieldset>

          <SaveButton
            isDirty={isDirty}
            saving={saving}
            saveSuccess={saveSuccess}
            disableReason={isDirty ? autoNoShowError : null}
          />
        </form>
      ) : null}
    </SettingsPageShell>
  );
}
