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
  welcome_message: string;
  default_notes: string;
};

function toForm(s: DoctorSettings): MessagingForm {
  return {
    welcome_message: s.welcome_message ?? "",
    default_notes: s.default_notes ?? "",
  };
}

interface MessagingClientProps {
  token: string;
}

/**
 * Settings → Messaging (settings-refresh · sr-03/04).
 * Instagram pause lives on Integrations (SR-D4).
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
      welcome_message: form.welcome_message.trim() || null,
      default_notes: form.default_notes.trim() || null,
    };
    await save(payload);
  }

  return (
    <SettingsPageShell
      title="Messaging"
      description="Welcome message and default appointment notes for the receptionist bot."
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
              htmlFor="welcome_message"
              tooltip="Greeting or context the AI bot uses when starting a conversation."
            >
              Welcome message (AI context)
            </FieldLabel>
            <textarea
              id="welcome_message"
              rows={3}
              value={form.welcome_message}
              onChange={(e) =>
                setForm((p) => ({ ...p, welcome_message: e.target.value }))
              }
              maxLength={1000}
              placeholder="Optional greeting for the bot"
              className={settingsFieldClassName}
            />
          </div>
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
