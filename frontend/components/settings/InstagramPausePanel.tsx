"use client";

import { FieldLabel } from "@/components/ui/FieldLabel";
import { SaveButton } from "@/components/ui/SaveButton";
import { settingsFieldClassName } from "@/components/settings/SettingsPageShell";
import { useDoctorSettingsForm } from "@/hooks/useDoctorSettingsForm";
import type { DoctorSettings, PatchDoctorSettingsPayload } from "@/types/doctor-settings";

type PauseForm = {
  paused: boolean;
  pauseMessage: string;
};

function toForm(s: DoctorSettings): PauseForm {
  return {
    paused: s.instagram_receptionist_paused === true,
    pauseMessage: s.instagram_receptionist_pause_message ?? "",
  };
}

interface InstagramPausePanelProps {
  token: string;
}

/**
 * Pause Instagram receptionist — lives on Integrations (SR-D4).
 */
export function InstagramPausePanel({ token }: InstagramPausePanelProps) {
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
      instagram_receptionist_paused: form.paused,
      instagram_receptionist_pause_message:
        form.paused && form.pauseMessage.trim()
          ? form.pauseMessage.trim()
          : null,
    };
    await save(payload);
  }

  if (isLoading || !form) {
    return (
      <div
        className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground"
        aria-busy="true"
      >
        Loading receptionist settings…
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        role="alert"
      >
        <p>{loadError}</p>
        <button
          type="button"
          className="mt-2 text-sm font-medium underline"
          onClick={() => void refetch()}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4"
      aria-labelledby="ig-pause-heading"
    >
      <h3 id="ig-pause-heading" className="text-sm font-semibold text-foreground">
        Receptionist pause
      </h3>
      {saveError ? (
        <p className="text-sm text-destructive" role="status">
          {saveError}
        </p>
      ) : null}
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={form.paused}
          onChange={(e) =>
            setForm((p) => ({ ...p, paused: e.target.checked }))
          }
          className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-ring"
        />
        <span>
          <span className="font-medium text-foreground">
            Pause Instagram receptionist (human handoff)
          </span>
          <span className="mt-1 block text-sm text-muted-foreground">
            When on, automated DMs stop and patients get a short notice that a
            person will reply when possible. High-intent comment auto-DMs and
            public replies are also paused; you still get lead emails.
          </span>
        </span>
      </label>
      <div className="pl-7">
        <FieldLabel
          htmlFor="instagram_receptionist_pause_message"
          tooltip="Optional — overrides the default handoff sentence."
        >
          Custom pause message (optional)
        </FieldLabel>
        <textarea
          id="instagram_receptionist_pause_message"
          rows={2}
          value={form.pauseMessage}
          onChange={(e) =>
            setForm((p) => ({ ...p, pauseMessage: e.target.value }))
          }
          maxLength={500}
          placeholder="Leave blank to use the default polite handoff text"
          disabled={!form.paused}
          className={settingsFieldClassName}
        />
      </div>
      <SaveButton isDirty={isDirty} saving={saving} saveSuccess={saveSuccess} />
    </form>
  );
}
