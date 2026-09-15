"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useOptionalRxForm } from "@/components/cockpit/rx/RxFormContext";
import {
  acceptHistorySubmissionItem,
  getAppointmentHistorySubmission,
  notifyHistorySubmissionChanged,
} from "@/lib/api/patient-history-submissions";
import { queryKeys } from "@/lib/query/keys";
import type {
  HistoryAcceptField,
  PatientHistorySubmission,
} from "@/types/patient-history-submissions";

function useOptionalQueryClient() {
  try {
    return useQueryClient();
  } catch {
    return null;
  }
}

function itemLabel(name: string, extra?: string | null): string {
  const trimmed = extra?.trim();
  return trimmed ? `${name} (${trimmed})` : name;
}

function AcceptCard({
  label,
  accepted,
  acceptedLabel,
  busy,
  onAccept,
  onUse,
  testId,
}: {
  label: string;
  accepted: boolean;
  acceptedLabel: string;
  busy: boolean;
  onAccept?: () => void;
  onUse?: () => void;
  testId: string;
}) {
  return (
    <div
      className="flex items-start justify-between gap-2 rounded-md border border-border/70 bg-background/80 px-2 py-1.5"
      data-testid={testId}
    >
      <p className="min-w-0 text-sm text-foreground">{label}</p>
      {accepted ? (
        <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
          {acceptedLabel}
        </span>
      ) : (
        <div className="flex shrink-0 items-center gap-2">
          {onUse ? (
            <button
              type="button"
              className="text-[11px] font-medium text-foreground underline-offset-2 hover:underline disabled:opacity-50"
              disabled={busy}
              onClick={onUse}
              data-testid={`${testId}-use`}
            >
              Use
            </button>
          ) : null}
          {onAccept ? (
            <button
              type="button"
              className="text-[11px] font-medium text-foreground underline-offset-2 hover:underline disabled:opacity-50"
              disabled={busy}
              onClick={onAccept}
              data-testid={`${testId}-accept`}
            >
              Accept
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function DeskHistoryStrip() {
  const rxForm = useOptionalRxForm();
  const token = rxForm?.token ?? "";
  const appointmentId = rxForm?.appointmentId ?? "";
  const patientId = rxForm?.patientId ?? "";
  const queryClient = useOptionalQueryClient();
  const [submission, setSubmission] = useState<PatientHistorySubmission | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !appointmentId) return;
    let cancelled = false;
    void getAppointmentHistorySubmission(token, appointmentId)
      .then((res) => {
        if (!cancelled) setSubmission(res.data.submission);
      })
      .catch(() => {
        if (!cancelled) setSubmission(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token, appointmentId]);

  async function accept(
    field: HistoryAcceptField,
    index: number | undefined,
    key: string,
    after?: (submission: PatientHistorySubmission) => void,
  ) {
    if (!token || !appointmentId) return;
    setBusyKey(key);
    setError(null);
    try {
      const res = await acceptHistorySubmissionItem(token, appointmentId, {
        field,
        ...(index !== undefined ? { index } : {}),
      });
      setSubmission(res.data.submission);
      notifyHistorySubmissionChanged();
      if (queryClient && field === "allergies") {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.patient(patientId).allergies(),
        });
      }
      if (queryClient && (field === "medicines" || field === "conditions")) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.patient(patientId).conditions(),
        });
        void queryClient.invalidateQueries({
          queryKey: queryKeys.patient(patientId).medicalBackground(),
        });
      }
      after?.(res.data.submission);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept this item");
    } finally {
      setBusyKey(null);
    }
  }

  if (!submission) return null;

  const whyAccepted = Boolean(submission.why_today_accepted_at);
  const reportedAllergies =
    !submission.allergies.none && submission.allergies.items.length > 0;

  return (
    <div
      className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2"
      data-testid="desk-history-strip"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        From staff
      </p>
      <div className="mt-2 space-y-2">
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Why today</p>
          <AcceptCard
            label={submission.why_today}
            accepted={whyAccepted}
            acceptedLabel="Added to this visit"
            busy={busyKey === "why_today"}
            testId="desk-history-why-today"
            onUse={() => {
              void accept("why_today", undefined, "why_today", () => {
                const text = submission.why_today.trim();
                const firstLine = text.split(/\r?\n/, 1)[0] ?? text;
                const cc = firstLine.slice(0, 120);
                const hopi =
                  text.length > cc.length ? text.slice(cc.length).trim() : "";
                if (rxForm && !rxForm.state.fields.cc.trim()) {
                  rxForm.seedFields({
                    cc,
                    ...(hopi && !rxForm.state.fields.hopi.trim() ? { hopi } : {}),
                  });
                }
              });
            }}
            onAccept={() => {
              void accept("why_today", undefined, "why_today", () => {
                const text = submission.why_today.trim();
                const firstLine = text.split(/\r?\n/, 1)[0] ?? text;
                const cc = firstLine.slice(0, 120);
                const hopi =
                  text.length > cc.length ? text.slice(cc.length).trim() : "";
                if (rxForm && !rxForm.state.fields.cc.trim()) {
                  rxForm.seedFields({
                    cc,
                    ...(hopi && !rxForm.state.fields.hopi.trim() ? { hopi } : {}),
                  });
                }
              });
            }}
          />
        </div>

        <div>
          <p className="mb-1 text-xs text-muted-foreground">Allergies</p>
          {submission.allergies.none ? (
            <AcceptCard
              label="None"
              accepted={Boolean(submission.allergies.none_accepted_at)}
              acceptedLabel="No known allergies recorded"
              busy={busyKey === "allergies-none"}
              testId="desk-history-allergy-none"
              onAccept={() => void accept("allergies", undefined, "allergies-none")}
            />
          ) : (
            <div className="space-y-1">
              {submission.allergies.items.map((item, index) => (
                <AcceptCard
                  key={`${item.name}-${index}`}
                  label={itemLabel(item.name, item.reaction)}
                  accepted={Boolean(item.accepted_at)}
                  acceptedLabel="On chart"
                  busy={busyKey === `allergies-${index}`}
                  testId={`desk-history-allergy-${index}`}
                  onAccept={() => void accept("allergies", index, `allergies-${index}`)}
                />
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="mb-1 text-xs text-muted-foreground">Current medicines</p>
          {submission.medicines.none ? (
            <p className="text-sm text-muted-foreground">None</p>
          ) : (
            <div className="space-y-1">
              {submission.medicines.items.map((item, index) => (
                <AcceptCard
                  key={`${item.name}-${index}`}
                  label={itemLabel(item.name, item.dose)}
                  accepted={Boolean(item.accepted_at)}
                  acceptedLabel="On chart"
                  busy={busyKey === `medicines-${index}`}
                  testId={`desk-history-medicine-${index}`}
                  onAccept={() => void accept("medicines", index, `medicines-${index}`)}
                />
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="mb-1 text-xs text-muted-foreground">Known conditions</p>
          {submission.conditions.none ? (
            <p className="text-sm text-muted-foreground">None</p>
          ) : (
            <div className="space-y-1">
              {submission.conditions.items.map((item, index) => (
                <AcceptCard
                  key={`${item.name}-${index}`}
                  label={item.name}
                  accepted={Boolean(item.accepted_at)}
                  acceptedLabel="On chart"
                  busy={busyKey === `conditions-${index}`}
                  testId={`desk-history-condition-${index}`}
                  onAccept={() => void accept("conditions", index, `conditions-${index}`)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      {reportedAllergies &&
      submission.allergies.items.some((item) => !item.accepted_at) ? (
        <p
          role="status"
          className="mt-2 text-xs font-medium text-amber-800 dark:text-amber-400"
        >
          Reported at the desk — not confirmed on the chart.
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
