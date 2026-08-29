"use client";

import { useState } from "react";

import { ModeScheduleEditor } from "@/components/settings/doctor/opd/ModeScheduleEditor";
import { modeScheduleFromPolicies } from "@/components/settings/doctor/opd/mode-schedule-utils";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { Input } from "@/components/ui/input";
import { SaveButton } from "@/components/ui/SaveButton";
import { SettingsPageShell } from "@/components/settings/SettingsPageShell";
import { useDoctorSettingsForm } from "@/hooks/useDoctorSettingsForm";
import { patchDoctorSettings } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { useQueryClient } from "@tanstack/react-query";
import type {
  DoctorSettings,
  ModeSchedule,
  OpdMode,
  PatchDoctorSettingsPayload,
} from "@/types/doctor-settings";

type OpdForm = {
  opdMode: OpdMode;
  graceMinutes: string;
};

function defaultOpdMode(s: DoctorSettings): OpdMode {
  const m = s.opd_mode;
  return m === "queue" || m === "slot" ? m : "slot";
}

function graceFromPolicies(
  policies: Record<string, unknown> | null | undefined,
): string {
  if (!policies || typeof policies !== "object") return "";
  const v = policies.slot_grace_join_minutes;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

function toForm(s: DoctorSettings): OpdForm {
  return {
    opdMode: defaultOpdMode(s),
    graceMinutes: graceFromPolicies(s.opd_policies),
  };
}

interface OpdModeClientProps {
  token: string;
}

export function OpdModeClient({ token }: OpdModeClientProps) {
  const queryClient = useQueryClient();
  const {
    settings,
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

  const [modeScheduleSaving, setModeScheduleSaving] = useState(false);
  const [modeScheduleSaveError, setModeScheduleSaveError] = useState<
    string | null
  >(null);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !settings) return;

    const graceNum =
      form.graceMinutes.trim() === ""
        ? null
        : parseInt(form.graceMinutes, 10);
    if (
      graceNum !== null &&
      (Number.isNaN(graceNum) || graceNum < 0 || graceNum > 120)
    ) {
      setLocalError(
        "Grace period must be between 0 and 120 minutes (or leave empty).",
      );
      return;
    }
    setLocalError(null);

    const prevPolicies =
      settings.opd_policies && typeof settings.opd_policies === "object"
        ? { ...settings.opd_policies }
        : {};

    if (graceNum === null) {
      delete prevPolicies.slot_grace_join_minutes;
    } else {
      prevPolicies.slot_grace_join_minutes = graceNum;
    }

    const payload: PatchDoctorSettingsPayload = {
      opd_mode: form.opdMode,
      opd_policies: Object.keys(prevPolicies).length > 0 ? prevPolicies : null,
    };
    await save(payload);
  }

  async function handleSaveModeSchedule(
    schedule: ModeSchedule,
    mirroredOpdMode?: OpdMode,
  ) {
    if (!settings) return;
    setModeScheduleSaving(true);
    setModeScheduleSaveError(null);
    try {
      const prevPolicies =
        settings.opd_policies && typeof settings.opd_policies === "object"
          ? { ...settings.opd_policies }
          : {};

      const payload: PatchDoctorSettingsPayload = {
        opd_policies: {
          ...prevPolicies,
          mode_schedule: schedule,
        },
        ...(mirroredOpdMode ? { opd_mode: mirroredOpdMode } : {}),
      };

      await patchDoctorSettings(token, payload);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.opd.doctorSettings(),
      });
    } catch (err) {
      setModeScheduleSaveError(
        err instanceof Error ? err.message : "Save failed",
      );
    } finally {
      setModeScheduleSaving(false);
    }
  }

  const savedModeSchedule = modeScheduleFromPolicies(settings?.opd_policies);

  return (
    <SettingsPageShell
      title="OPD mode"
      description="Choose how patients join your outpatient flow: fixed appointment times, or a token queue."
      isLoading={isLoading || !form}
      loadError={loadError}
      onRetry={() => void refetch()}
      saveError={saveError ?? localError}
    >
      {form ? (
        <>
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="mt-6 space-y-6 rounded-lg border border-border bg-card p-4"
          >
            <fieldset>
              <legend className="text-sm font-medium text-foreground">
                How patients join
              </legend>
              <p className="mt-1 text-xs text-muted-foreground">
                Default is fixed slots until queue features are fully rolled out.
              </p>
              <div className="mt-4 space-y-3">
                <label className="flex cursor-pointer gap-3 rounded-md border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                  <input
                    type="radio"
                    name="opd_mode"
                    value="slot"
                    checked={form.opdMode === "slot"}
                    onChange={() =>
                      setForm((p) => ({ ...p, opdMode: "slot" }))
                    }
                    className="mt-1 h-4 w-4 border-input text-primary focus:ring-ring"
                  />
                  <span>
                    <span className="font-medium text-foreground">
                      Fixed time slots
                    </span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      Patients book a specific time on your calendar. Best when
                      visits are predictable.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer gap-3 rounded-md border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                  <input
                    type="radio"
                    name="opd_mode"
                    value="queue"
                    checked={form.opdMode === "queue"}
                    onChange={() =>
                      setForm((p) => ({ ...p, opdMode: "queue" }))
                    }
                    className="mt-1 h-4 w-4 border-input text-primary focus:ring-ring"
                  />
                  <span>
                    <span className="font-medium text-foreground">
                      Token queue
                    </span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      Patients receive a place in line for a session. You can
                      select this to prepare your practice.
                    </span>
                  </span>
                </label>
              </div>
            </fieldset>

            <details className="rounded-md border border-border bg-muted/40 p-3">
              <summary className="cursor-pointer text-sm font-medium text-foreground">
                Advanced — slot grace (optional)
              </summary>
              <p className="mt-2 text-xs text-muted-foreground">
                Minutes after the scheduled slot start that a patient can still
                join. Leave empty to rely on defaults.
              </p>
              <div className="mt-3 max-w-xs">
                <FieldLabel
                  htmlFor="slot_grace_join_minutes"
                  tooltip="0–120 minutes; optional."
                >
                  Grace period (minutes)
                </FieldLabel>
                <Input
                  id="slot_grace_join_minutes"
                  type="number"
                  min={0}
                  max={120}
                  value={form.graceMinutes}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, graceMinutes: e.target.value }))
                  }
                  placeholder="e.g. 5"
                  className="mt-1"
                />
              </div>
            </details>

            <SaveButton
              isDirty={isDirty}
              saving={saving}
              saveSuccess={saveSuccess}
            />
          </form>

          <div className="mt-8">
            <ModeScheduleEditor
              token={token}
              initialSchedule={savedModeSchedule}
              currentOpdModeColumn={
                settings ? defaultOpdMode(settings) : form.opdMode
              }
              onSave={handleSaveModeSchedule}
              saveError={modeScheduleSaveError}
              saving={modeScheduleSaving}
            />
          </div>
        </>
      ) : null}
    </SettingsPageShell>
  );
}
