"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  convertSession,
  OpdSessionConvertError,
  previewConvertSession,
} from "@/lib/api";
import type {
  ConvertSessionDayModeResult,
  OpdSessionDayMode,
} from "@/types/opd-session";
import { trackOpdSessionModeEvent } from "./opdQueueTelemetry";

export interface SessionModeConversionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  /** YYYY-MM-DD — must not be past (caller enforces). */
  date: string;
  fromMode: OpdSessionDayMode;
  toMode: OpdSessionDayMode;
  /** Drives DL-14 soft nudge when >= 2. */
  modeChangeCount: number;
  source?: "opd_tab" | "settings";
  onConfirmed: (result: ConvertSessionDayModeResult) => void;
}

type Phase =
  | { kind: "loading_preview" }
  | { kind: "preview"; preview: ConvertSessionDayModeResult }
  | { kind: "preview_error"; error: string }
  | { kind: "confirming" }
  | { kind: "done"; result: ConvertSessionDayModeResult }
  | { kind: "confirm_error"; error: string };

function labelFor(mode: OpdSessionDayMode): string {
  return mode === "slot" ? "slot" : "queue";
}

function formatDateLocal(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function ConversionAlert({
  variant = "warning",
  children,
}: {
  variant?: "warning" | "destructive";
  children: ReactNode;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex gap-3 rounded-md border p-3 text-sm",
        variant === "destructive"
          ? "border-destructive/50 bg-destructive/10 text-destructive"
          : "border-border bg-muted/40"
      )}
    >
      {variant !== "destructive" && (
        <AlertTriangle
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500"
          aria-hidden
        />
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export interface PreviewSummaryProps {
  preview: ConvertSessionDayModeResult;
  fromMode: OpdSessionDayMode;
  toMode: OpdSessionDayMode;
  modeChangeCount: number;
}

export function PreviewSummary({
  preview,
  toMode,
  modeChangeCount,
}: PreviewSummaryProps) {
  const { affected, overflowCount, telemedCount, notificationCount } = preview;

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-muted/50 p-4">
        <p className="text-sm font-medium">
          {affected === 0
            ? "No active bookings on this date."
            : `${affected} active ${affected === 1 ? "booking" : "bookings"} will be reassigned.`}
        </p>
        {affected > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            {notificationCount}{" "}
            {notificationCount === 1 ? "patient" : "patients"} will receive a
            single notification 5 minutes after you confirm.
          </p>
        )}
      </div>

      {toMode === "slot" && overflowCount > 0 && (
        <ConversionAlert>
          <p>
            <strong>
              {overflowCount}{" "}
              {overflowCount === 1 ? "patient" : "patients"} will be assigned
              overflow slots at end of session.
            </strong>{" "}
            They may not be seen if the day runs long. You can resolve overflow
            rows from the &ldquo;Needs attention&rdquo; tray after the session.
          </p>
        </ConversionAlert>
      )}

      {toMode === "queue" && telemedCount > 0 && (
        <ConversionAlert>
          <p>
            <strong>
              {telemedCount} of the affected{" "}
              {telemedCount === 1 ? "booking is" : "bookings are"} telemed.
            </strong>{" "}
            In queue mode, telemed patients won&rsquo;t know when to join the
            call until you page them from the queue.
          </p>
        </ConversionAlert>
      )}

      {modeChangeCount >= 2 && (
        <ConversionAlert>
          <p>
            You&rsquo;ve changed this day&rsquo;s mode {modeChangeCount}{" "}
            {modeChangeCount === 1 ? "time" : "times"} already &mdash; patients
            have been re-notified each time.
          </p>
        </ConversionAlert>
      )}
    </div>
  );
}

export interface DoneSummaryProps {
  result: ConvertSessionDayModeResult;
  toMode: OpdSessionDayMode;
}

export function DoneSummary({ result, toMode }: DoneSummaryProps) {
  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/40 dark:bg-emerald-900/10">
      <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
        Switched to {labelFor(toMode)} mode. {result.affected}{" "}
        {result.affected === 1 ? "booking" : "bookings"} reorganised.
      </p>
      {result.overflowCount > 0 && (
        <p className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-200/80">
          {result.overflowCount} assigned to overflow.
        </p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Affected patients will be notified in ~5 minutes.
      </p>
    </div>
  );
}

export function SessionModeConversionDialog(
  props: SessionModeConversionDialogProps
) {
  const {
    open,
    onOpenChange,
    token,
    date,
    fromMode,
    toMode,
    modeChangeCount,
    source,
    onConfirmed,
  } = props;

  const [phase, setPhase] = useState<Phase>({ kind: "loading_preview" });

  useEffect(() => {
    if (!open) return;
    setPhase({ kind: "loading_preview" });
    void (async () => {
      try {
        const { data } = await previewConvertSession(token, { date, toMode });
        setPhase({ kind: "preview", preview: data });
      } catch (err) {
        if (err instanceof OpdSessionConvertError && err.status === 403) {
          setPhase({
            kind: "preview_error",
            error: "Past dates cannot be reconfigured.",
          });
          return;
        }
        const message =
          err instanceof Error ? err.message : "Failed to preview conversion.";
        setPhase({ kind: "preview_error", error: message });
      }
    })();
  }, [open, token, date, toMode]);

  const handleConfirm = useCallback(async () => {
    setPhase({ kind: "confirming" });
    const finishSuccess = (data: ConvertSessionDayModeResult) => {
      setPhase({ kind: "done", result: data });
      trackOpdSessionModeEvent({
        event: "opd_session.mode_flipped",
        from: fromMode,
        to: toMode,
        affected_count: data.affected,
        overflow_count: data.overflowCount,
        source: source ?? "unknown",
      });
      onConfirmed(data);
    };

    try {
      const { data } = await convertSession(token, { date, toMode });
      finishSuccess(data);
    } catch (err) {
      if (
        err instanceof OpdSessionConvertError &&
        err.status === 409 &&
        err.retryAfterSeconds
      ) {
        await new Promise((r) =>
          setTimeout(r, err.retryAfterSeconds! * 1000)
        );
        try {
          const { data } = await convertSession(token, { date, toMode });
          finishSuccess(data);
          return;
        } catch (retryErr) {
          const message =
            retryErr instanceof Error
              ? retryErr.message
              : "Conversion failed after retry.";
          setPhase({ kind: "confirm_error", error: message });
          return;
        }
      }

      if (err instanceof OpdSessionConvertError && err.status === 403) {
        setPhase({
          kind: "confirm_error",
          error: "Past dates cannot be reconfigured.",
        });
        onOpenChange(false);
        return;
      }

      const message =
        err instanceof Error ? err.message : "Conversion failed.";
      setPhase({ kind: "confirm_error", error: message });
    }
  }, [
    token,
    date,
    toMode,
    fromMode,
    source,
    onConfirmed,
    onOpenChange,
  ]);

  const previewPhase = phase.kind === "preview" ? phase : null;
  const confirmLabel =
    previewPhase && previewPhase.preview.affected === 0
      ? "Switch mode"
      : `Confirm and notify ${
          previewPhase?.preview.notificationCount ?? 0
        } patients`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Switch {formatDateLocal(date)} to {labelFor(toMode)} mode?
          </DialogTitle>
          <DialogDescription>
            The system will reorganise existing bookings automatically. Patients
            are notified once after a 5-minute delay (DL-5 debounce).
          </DialogDescription>
        </DialogHeader>

        {phase.kind === "loading_preview" && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
            <span className="ml-2 text-sm text-muted-foreground">
              Calculating impact…
            </span>
          </div>
        )}

        {phase.kind === "preview_error" && (
          <ConversionAlert variant="destructive">
            <p>{phase.error}</p>
          </ConversionAlert>
        )}

        {phase.kind === "preview" && (
          <PreviewSummary
            preview={phase.preview}
            fromMode={fromMode}
            toMode={toMode}
            modeChangeCount={modeChangeCount}
          />
        )}

        {phase.kind === "confirming" && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
            <span className="ml-2 text-sm">Reorganising session…</span>
          </div>
        )}

        {phase.kind === "done" && (
          <DoneSummary result={phase.result} toMode={toMode} />
        )}

        {phase.kind === "confirm_error" && (
          <ConversionAlert variant="destructive">
            <p>{phase.error}</p>
          </ConversionAlert>
        )}

        <DialogFooter>
          {(phase.kind === "preview" || phase.kind === "preview_error") && (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => void handleConfirm()}
                disabled={phase.kind !== "preview"}
              >
                {confirmLabel}
              </Button>
            </>
          )}

          {phase.kind === "done" && (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          )}

          {phase.kind === "confirm_error" && (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button onClick={() => void handleConfirm()}>Try again</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
