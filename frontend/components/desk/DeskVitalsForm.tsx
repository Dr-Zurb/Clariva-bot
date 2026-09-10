"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deskErrorMessage,
  getDeskAppointmentVitals,
  saveDeskAppointmentVitals,
} from "@/lib/desk/api";
import {
  DESK_VITALS_NOTE_MAX,
  deskVitalsFromReading,
  EMPTY_DESK_VITALS,
  parseDeskVitalsFields,
  type DeskVitalsFields,
} from "@/lib/desk/vitals";
import { deskVitalsSeedFromReading } from "@/lib/cockpit/desk-vitals-query";
import { queryKeys } from "@/lib/query/keys";
import { cn } from "@/lib/utils";

const fieldClass = "h-9 rounded-lg bg-background tabular-nums";

function Field({
  id,
  label,
  value,
  onChange,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={fieldClass}
      />
    </div>
  );
}

function summaryLine(fields: DeskVitalsFields): string {
  const parts: string[] = [];
  if (fields.bpSystolic && fields.bpDiastolic) {
    parts.push(`${fields.bpSystolic}/${fields.bpDiastolic}`);
  }
  if (fields.heartRate) parts.push(`${fields.heartRate} bpm`);
  if (fields.temperatureC) parts.push(`${fields.temperatureC} °C`);
  if (fields.spo2) parts.push(`SpO₂ ${fields.spo2}%`);
  if (fields.weightKg) parts.push(`${fields.weightKg} kg`);
  if (fields.heightCm) parts.push(`${fields.heightCm} cm`);
  if (fields.note.trim()) parts.push(fields.note.trim());
  return parts.join(" · ");
}

export function DeskVitalsForm({
  token,
  appointmentId,
  onFinished,
  skipFetch = false,
}: {
  token: string;
  appointmentId: string;
  /** After a fresh check-in: Save or Skip returns the desk to empty search. */
  onFinished?: () => void;
  /** Fresh check-in — skip the empty GET so the form opens immediately. */
  skipFetch?: boolean;
}) {
  const queryClient = useQueryClient();
  const [fields, setFields] = useState<DeskVitalsFields>(EMPTY_DESK_VITALS);
  const [saved, setSaved] = useState<DeskVitalsFields | null>(null);
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (skipFetch) {
      setFields(EMPTY_DESK_VITALS);
      setSaved(null);
      setOpen(true);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await getDeskAppointmentVitals(token, appointmentId);
        if (cancelled) return;
        if (res.data.vitals) {
          const next = deskVitalsFromReading(res.data.vitals);
          setFields(next);
          setSaved(next);
          setOpen(false);
        } else {
          setFields(EMPTY_DESK_VITALS);
          setSaved(null);
          setOpen(true);
        }
      } catch (err) {
        if (!cancelled)
          setError(deskErrorMessage(err, "Could not load vitals"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, appointmentId, skipFetch]);

  function patch<K extends keyof DeskVitalsFields>(
    key: K,
    value: DeskVitalsFields[K]
  ) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function onSave() {
    const parsed = parseDeskVitalsFields(fields);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await saveDeskAppointmentVitals(
        token,
        appointmentId,
        parsed.payload
      );
      const next = deskVitalsFromReading(res.data.vitals);
      setFields(next);
      setSaved(next);
      setOpen(false);
      queryClient.setQueryData(
        queryKeys.consult(appointmentId).deskVitals(),
        deskVitalsSeedFromReading(res.data.vitals),
      );
      void queryClient.invalidateQueries({
        queryKey: queryKeys.consult(appointmentId).deskVitals(),
      });
      onFinished?.();
    } catch (err) {
      setError(deskErrorMessage(err, "Could not save vitals"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading vitals…</p>;
  }

  if (!open) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Vitals
          </p>
          <p className="mt-0.5 truncate text-sm text-foreground">
            {saved ? summaryLine(saved) : "Skipped"}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="h-8 shrink-0 px-2"
          onClick={() => setOpen(true)}
        >
          {saved ? "Edit" : "Add"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Vitals
        </p>
        <p className="text-xs text-muted-foreground">Optional</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Field
          id="desk-vitals-sys"
          label="BP sys"
          value={fields.bpSystolic}
          onChange={(value) => patch("bpSystolic", value)}
        />
        <Field
          id="desk-vitals-dia"
          label="BP dia"
          value={fields.bpDiastolic}
          onChange={(value) => patch("bpDiastolic", value)}
        />
        <Field
          id="desk-vitals-hr"
          label="Pulse"
          value={fields.heartRate}
          onChange={(value) => patch("heartRate", value)}
        />
        <Field
          id="desk-vitals-temp"
          label="Temp °C"
          value={fields.temperatureC}
          onChange={(value) => patch("temperatureC", value)}
        />
        <Field
          id="desk-vitals-spo2"
          label="SpO₂"
          value={fields.spo2}
          onChange={(value) => patch("spo2", value)}
        />
        <Field
          id="desk-vitals-wt"
          label="Weight kg"
          value={fields.weightKg}
          onChange={(value) => patch("weightKg", value)}
        />
        <Field
          id="desk-vitals-ht"
          label="Height cm"
          value={fields.heightCm}
          onChange={(value) => patch("heightCm", value)}
          className="col-span-2 sm:col-span-1"
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <Label
          htmlFor="desk-vitals-note"
          className="text-xs text-muted-foreground"
        >
          Note
        </Label>
        <textarea
          id="desk-vitals-note"
          value={fields.note}
          onChange={(event) => patch("note", event.target.value)}
          rows={2}
          maxLength={DESK_VITALS_NOTE_MAX}
          placeholder="e.g. sitting, post-walk, refused…"
          className="min-h-[4.5rem] w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          className="h-9"
          disabled={saving}
          onClick={() => {
            setError(null);
            if (saved) {
              setFields(saved);
              setOpen(false);
              return;
            }
            if (onFinished) {
              onFinished();
              return;
            }
            setOpen(false);
          }}
        >
          {saved ? "Cancel" : "Skip"}
        </Button>
        <Button
          type="button"
          className="h-9 px-4"
          disabled={saving}
          onClick={() => void onSave()}
        >
          {saving ? "Saving…" : "Save vitals"}
        </Button>
      </div>
    </div>
  );
}
