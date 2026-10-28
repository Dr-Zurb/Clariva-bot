"use client";

import { FieldLabel } from "@/components/ui/FieldLabel";
import { SaveButton } from "@/components/ui/SaveButton";
import {
  SettingsPageShell,
  settingsFieldClassName,
} from "@/components/settings/SettingsPageShell";
import { useDoctorSettingsForm } from "@/hooks/useDoctorSettingsForm";
import type { DoctorSettings, PatchDoctorSettingsPayload } from "@/types/doctor-settings";

type MessagingForm = {
  default_notes: string;
};

function toForm(s: DoctorSettings): MessagingForm {
  return {
    default_notes: s.default_notes ?? "",
  };
}

interface MessagingClientProps {
  token: string;
}

/**
 * Settings → Appointment notes.
 * The stored welcome line stays on the record and is not shown here.
 */
export function MessagingClient({ token }: MessagingClientProps) {
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const payload: PatchDoctorSettingsPayload = {
      default_notes: form.default_notes.trim() || null,
    };
    await save(payload);
  }

  return (
    <SettingsPageShell
      title="Appointment notes"
      description="Default notes added to new appointments."
      isLoading={isLoading || !form}
      loadError={loadError}
      onRetry={() => void refetch()}
      saveError={saveError}
    >
      {form ? (
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="mt-6 space-y-4 rounded-lg border border-border bg-card p-4"
        >
          <div>
            <FieldLabel
              htmlFor="default_notes"
              tooltip="Notes pre-filled when creating new appointments."
            >
              Default appointment notes
            </FieldLabel>
            <textarea
              id="default_notes"
              rows={2}
              value={form.default_notes}
              onChange={(e) =>
                setForm((p) => ({ ...p, default_notes: e.target.value }))
              }
              maxLength={1000}
              placeholder="Optional default notes for new appointments"
              className={settingsFieldClassName}
            />
          </div>
          <SaveButton
            isDirty={isDirty}
            saving={saving}
            saveSuccess={saveSuccess}
          />
        </form>
      ) : null}
    </SettingsPageShell>
  );
}
