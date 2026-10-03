"use client";

import { useEffect } from "react";

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
 * Pause Instagram automated replies — lives on Integrations (SR-D4).
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

  useEffect(() => {
    if (!form) return;
    if (window.location.hash !== "#receptionist-pause") return;
    document.getElementById("receptionist-pause")?.scrollIntoView({
      block: "start",
    });
  }, [form]);

  if (isLoading || !form) {
    return (
      <div
        className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground"
        aria-busy="true"
      >
        Loading automated reply settings…
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
      id="receptionist-pause"
      className="scroll-mt-6 space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4"
      aria-labelledby="ig-pause-heading"
    >
      <h3 id="ig-pause-heading" className="text-sm font-semibold text-foreground">
        Automated replies
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
            Pause automated replies
          </span>
          <span className="mt-1 block text-sm text-muted-foreground">
            When on, automated replies stop. People who message get a short
            notice that messages are paused.
          </span>
        </span>
      </label>
      <div className="pl-7">
        <FieldLabel
          htmlFor="instagram_receptionist_pause_message"
          tooltip="Optional. Replaces the default pause message."
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
          placeholder="Leave blank to use the default pause message"
          disabled={!form.paused}
          className={settingsFieldClassName}
        />
      </div>
      <SaveButton isDirty={isDirty} saving={saving} saveSuccess={saveSuccess} />
    </form>
  );
}
