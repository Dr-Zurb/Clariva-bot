"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { createAppointment } from "@/lib/api";
import type { SlotSessionRow } from "@/types/opd-doctor";
import { trackOpdSlotEvent } from "./opdQueueTelemetry";

export type AddSlotDialogMode = "extra-slot" | "overflow";

const PHONE_LENIENT = /^\+?[\d\s-]{6,}$/;
/** Backend requires E.164-style digits; used when the doctor leaves phone blank. */
const PLACEHOLDER_PHONE_FOR_API = "+19999999999";

export interface AddSlotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: AddSlotDialogMode;
  sessionDate: string;
  relatedAppointmentId?: string | null;
  slotEntries: SlotSessionRow[];
  token: string;
  onSuccess: () => void;
}

function roundUpToNextFiveMinuteWall(fromMs: number): number {
  const d = new Date(fromMs);
  let mins = d.getHours() * 60 + d.getMinutes();
  if (d.getSeconds() > 0 || d.getMilliseconds() > 0) {
    mins += 1;
  }
  const rem = mins % 5;
  const upMins = rem === 0 ? mins : mins + (5 - rem);
  const dayStart = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    0,
    0,
    0,
    0
  );
  return new Date(dayStart.getTime() + upMins * 60_000).getTime();
}

function defaultTimeHHMM(): string {
  const ms = roundUpToNextFiveMinuteWall(Date.now());
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Max `scheduledAt` among non-cancelled rows, +5m, rounded up to next 5-minute wall clock; empty day → now+5m rounded. */
export function deriveSessionEndPlusFiveMs(
  slotEntries: SlotSessionRow[],
  nowMs: number = Date.now()
): number {
  let maxMs = Number.NEGATIVE_INFINITY;
  for (const e of slotEntries) {
    if (e.slotStatus === "cancelled") continue;
    const t = new Date(e.scheduledAt).getTime();
    if (!Number.isNaN(t)) maxMs = Math.max(maxMs, t);
  }
  const base =
    Number.isFinite(maxMs) && maxMs !== Number.NEGATIVE_INFINITY
      ? maxMs + 5 * 60_000
      : nowMs + 5 * 60_000;
  return roundUpToNextFiveMinuteWall(base);
}

function combineDateAndTimeISO(sessionDateYmd: string, hhmm: string): string {
  const [hhRaw, mmRaw] = hhmm.split(":");
  const hh = parseInt(hhRaw ?? "", 10);
  const mm = parseInt(mmRaw ?? "", 10);
  if (
    Number.isNaN(hh) ||
    Number.isNaN(mm) ||
    hh < 0 ||
    hh > 23 ||
    mm < 0 ||
    mm > 59
  ) {
    throw new Error("Invalid time");
  }
  const [y, mo, day] = sessionDateYmd.split("-").map((x) => parseInt(x, 10));
  if (!y || !mo || !day) throw new Error("Invalid session date");
  return new Date(y, mo - 1, day, hh, mm, 0, 0).toISOString();
}

function normalizePhoneForApi(raw: string): string {
  return raw.replace(/[\s-]/g, "");
}

export function AddSlotDialog({
  open,
  onOpenChange,
  mode: initialMode,
  sessionDate,
  relatedAppointmentId,
  slotEntries,
  token,
  onSuccess,
}: AddSlotDialogProps): JSX.Element {
  const nameRef = useRef<HTMLInputElement>(null);
  const [formMode, setFormMode] = useState<AddSlotDialogMode>("extra-slot");
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [timeValue, setTimeValue] = useState(defaultTimeHHMM);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const modeLocked = Boolean(relatedAppointmentId);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSubmitting(false);
    setPatientName("");
    setPatientPhone("");
    setReason("");
    setNotes("");
    setTimeValue(defaultTimeHHMM());
    if (modeLocked) {
      setFormMode("overflow");
    } else {
      setFormMode(initialMode);
    }
    queueMicrotask(() => nameRef.current?.focus());
  }, [open, initialMode, modeLocked, sessionDate]);

  const linkedPatientName = useMemo(() => {
    if (!relatedAppointmentId) return null;
    return (
      slotEntries.find((r) => r.appointmentId === relatedAppointmentId)
        ?.patientName ?? null
    );
  }, [relatedAppointmentId, slotEntries]);

  const dialogTitle =
    formMode === "overflow" ? "Add overflow slot" : "Add slot";
  const dialogDescription =
    formMode === "overflow"
      ? "Creates an overflow visit linked to the selected appointment."
      : "Books an extra slot at a specific time on this session date.";

  const validate = useCallback((): string | null => {
    const name = patientName.trim();
    if (name.length < 1) return "Patient name is required";
    const phoneTrim = patientPhone.trim();
    if (phoneTrim && !PHONE_LENIENT.test(phoneTrim)) {
      return "Please enter a valid phone number, or leave the field blank.";
    }
    if (formMode === "extra-slot") {
      if (!timeValue.trim()) return "Time is required";
      try {
        combineDateAndTimeISO(sessionDate, timeValue.trim());
      } catch {
        return "Please enter a valid time";
      }
    }
    return null;
  }, [patientName, patientPhone, formMode, timeValue, sessionDate]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const v = validate();
      if (v) {
        setError(v);
        return;
      }
      setError(null);
      setSubmitting(true);
      try {
        const scheduledAtIso =
          formMode === "extra-slot"
            ? combineDateAndTimeISO(sessionDate, timeValue.trim())
            : new Date(deriveSessionEndPlusFiveMs(slotEntries)).toISOString();

        const phoneRaw = patientPhone.trim();
        const phoneForApi = phoneRaw
          ? normalizePhoneForApi(phoneRaw)
          : PLACEHOLDER_PHONE_FOR_API;

        await createAppointment(token, {
          patientName: patientName.trim(),
          patientPhone: phoneForApi,
          appointmentDate: scheduledAtIso,
          reasonForVisit: reason.trim() || undefined,
          notes: notes.trim() || undefined,
          freeOfCost: true,
          opdEventType:
            formMode === "overflow" ? "return_after_completed" : "standard",
          relatedAppointmentId: relatedAppointmentId ?? undefined,
        });

        onSuccess();
        onOpenChange(false);
        trackOpdSlotEvent({
          event: "opd_slot.action",
          kind: formMode === "overflow" ? "add_overflow" : "add_extra_slot",
          outcome: "success",
        });
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to add slot"
        );
      } finally {
        setSubmitting(false);
      }
    },
    [
      validate,
      formMode,
      sessionDate,
      timeValue,
      slotEntries,
      patientName,
      patientPhone,
      reason,
      notes,
      token,
      relatedAppointmentId,
      onSuccess,
      onOpenChange,
    ]
  );

  const submitLabel =
    formMode === "extra-slot"
      ? `Add slot at ${timeValue.trim() || "—"}`
      : "Add overflow slot";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-1 rounded-md border border-border p-0.5">
            <Button
              type="button"
              variant={formMode === "extra-slot" ? "secondary" : "ghost"}
              size="sm"
              className={cn("h-8 flex-1 text-xs", modeLocked && "opacity-50")}
              disabled={modeLocked}
              onClick={() => setFormMode("extra-slot")}
            >
              Extra slot
            </Button>
            <Button
              type="button"
              variant={formMode === "overflow" ? "secondary" : "ghost"}
              size="sm"
              className={cn("h-8 flex-1 text-xs", modeLocked && "opacity-50")}
              disabled={modeLocked}
              onClick={() => setFormMode("overflow")}
            >
              Overflow
            </Button>
          </div>

          {relatedAppointmentId && (
            <p className="text-xs text-muted-foreground">
              Linked to
              {linkedPatientName ? ` ${linkedPatientName}` : ""} (
              <span className="font-mono tabular-nums">{relatedAppointmentId}</span>
              ).
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="add-slot-patient-name">Patient name</Label>
            <Input
              ref={nameRef}
              id="add-slot-patient-name"
              autoComplete="name"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="add-slot-phone">Patient phone (optional)</Label>
            <Input
              id="add-slot-phone"
              type="tel"
              autoComplete="tel"
              value={patientPhone}
              onChange={(e) => setPatientPhone(e.target.value)}
              disabled={submitting}
            />
          </div>

          {formMode === "extra-slot" && (
            <div className="space-y-2">
              <Label htmlFor="add-slot-time">Time</Label>
              <Input
                id="add-slot-time"
                type="time"
                value={timeValue}
                onChange={(e) => setTimeValue(e.target.value)}
                disabled={submitting}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="add-slot-reason">Reason for visit (optional)</Label>
            <textarea
              id="add-slot-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={submitting}
              className={cn(
                "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm",
                "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                "disabled:cursor-not-allowed disabled:opacity-50"
              )}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="add-slot-notes">Notes (optional)</Label>
            <textarea
              id="add-slot-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={submitting}
              className={cn(
                "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm",
                "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                "disabled:cursor-not-allowed disabled:opacity-50"
              )}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
