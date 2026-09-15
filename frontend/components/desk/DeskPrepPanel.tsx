"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { DeskDocumentsStrip } from "@/components/desk/DeskDocumentsStrip";
import { DeskHistoryForm } from "@/components/desk/DeskHistoryForm";
import { DeskVitalsForm } from "@/components/desk/DeskVitalsForm";
import { IconTooltip, IconTooltipGroup } from "@/components/ui/icon-tooltip";
import {
  STAFF_JOB_HELP,
  STAFF_JOB_LABELS,
  deskPrepSaveLabel,
  deskPrepSlots,
  type PrepCapability,
} from "@/lib/desk/capabilities";
import { cn } from "@/lib/utils";

export function DeskPrepStepper({
  slots,
  current,
  onSelect,
}: {
  slots: readonly PrepCapability[];
  current: PrepCapability;
  onSelect?: (slot: PrepCapability) => void;
}) {
  return (
    <IconTooltipGroup>
      <ol
        className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs"
        aria-label="Visit prep"
        data-testid="desk-prep-stepper"
      >
        {slots.map((slot, index) => {
          const currentIndex = slots.indexOf(current);
          const done = index < currentIndex;
          const active = slot === current;
          return (
            <li key={slot} className="flex items-center gap-1.5">
              {index > 0 ? (
                <span className="text-muted-foreground" aria-hidden>
                  →
                </span>
              ) : null}
              <IconTooltip label={STAFF_JOB_HELP[slot]} side="bottom">
                <button
                  type="button"
                  className={cn(
                    "rounded-md px-1 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active && "font-medium text-foreground",
                    done && "text-muted-foreground hover:text-foreground",
                    !active && !done && "text-muted-foreground/70 hover:text-foreground"
                  )}
                  aria-current={active ? "step" : undefined}
                  onClick={() => {
                    if (!active) onSelect?.(slot);
                  }}
                >
                  {STAFF_JOB_LABELS[slot]}
                </button>
              </IconTooltip>
            </li>
          );
        })}
      </ol>
    </IconTooltipGroup>
  );
}

export function DeskPrepPanel({
  token,
  appointmentId,
  sequence,
  capabilities,
  onAdvance,
}: {
  token: string;
  appointmentId: string;
  /** Set during the first-pass sequence. Omit on reopen. */
  sequence?: boolean;
  capabilities?: readonly string[];
  onAdvance?: () => void;
}) {
  const slots = useMemo(
    () => deskPrepSlots(capabilities),
    [capabilities],
  );
  const first = slots[0] ?? null;
  const [expanded, setExpanded] = useState<PrepCapability | null>(null);
  const [current, setCurrent] = useState<PrepCapability | null>(first);
  const onToggle = useCallback((slot: PrepCapability, next: boolean) => {
    setExpanded(next ? slot : null);
  }, []);

  const slotKey = slots.join(",");
  useEffect(() => {
    setCurrent(slots[0] ?? null);
    setExpanded(null);
    // slots[0] follows slotKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointmentId, slotKey]);

  function bind(slot: PrepCapability) {
    return {
      open: expanded === slot,
      onOpenChange: (next: boolean) => onToggle(slot, next),
    };
  }

  function finishCurrent() {
    if (!current) {
      onAdvance?.();
      return;
    }
    const index = slots.indexOf(current);
    const next = slots[index + 1];
    if (next) {
      setCurrent(next);
      return;
    }
    onAdvance?.();
  }

  if (slots.length === 0) return null;

  if (sequence && current) {
    const saveLabel = deskPrepSaveLabel(slots, current);
    return (
      <div className="space-y-3">
        {slots.length > 1 ? (
          <DeskPrepStepper current={current} slots={slots} onSelect={setCurrent} />
        ) : null}
        {current === "vitals" ? (
          <DeskVitalsForm
            token={token}
            appointmentId={appointmentId}
            onFinished={finishCurrent}
            saveLabel={saveLabel}
          />
        ) : null}
        {current === "history" ? (
          <DeskHistoryForm
            token={token}
            appointmentId={appointmentId}
            onFinished={finishCurrent}
            saveLabel={saveLabel}
          />
        ) : null}
        {current === "internal_labs" ? (
          <DeskDocumentsStrip
            token={token}
            appointmentId={appointmentId}
            mode="internal_labs"
            onFinished={finishCurrent}
            finishLabel={saveLabel}
          />
        ) : null}
        {current === "papers" ? (
          <DeskDocumentsStrip
            token={token}
            appointmentId={appointmentId}
            mode="papers"
            onFinished={finishCurrent}
            finishLabel={saveLabel}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-1" data-testid="desk-prep-checklist">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Prep
      </p>
      <div className="divide-y divide-border/70">
        {slots.includes("vitals") ? (
          <div className="py-3 first:pt-2 last:pb-0">
            <DeskVitalsForm
              token={token}
              appointmentId={appointmentId}
              emptySummary="Not captured"
              {...bind("vitals")}
            />
          </div>
        ) : null}
        {slots.includes("history") ? (
          <div className="py-3 last:pb-0">
            <DeskHistoryForm
              token={token}
              appointmentId={appointmentId}
              emptySummary="Not captured"
              {...bind("history")}
            />
          </div>
        ) : null}
        {slots.includes("internal_labs") ? (
          <div className="py-3 last:pb-0">
            <DeskDocumentsStrip
              token={token}
              appointmentId={appointmentId}
              mode="internal_labs"
              {...bind("internal_labs")}
            />
          </div>
        ) : null}
        {slots.includes("papers") ? (
          <div className="py-3 last:pb-0">
            <DeskDocumentsStrip
              token={token}
              appointmentId={appointmentId}
              mode="papers"
              {...bind("papers")}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
