"use client";

import { useMemo } from "react";
import { usePrescriptionFormShell } from "@/components/cockpit/rx/PrescriptionFormShellContext";
import {
  resolveRxNoteChrome,
  reviseStripCopy,
} from "@/components/cockpit/rx/rxRevise";
import { peekDoctorSettingsShared } from "@/lib/api/doctor-settings-shared";

export function RxReviseStrip({ copy }: { copy: string }): JSX.Element {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="rx-revise-strip"
      className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
    >
      {copy}
    </div>
  );
}

export function RxSupersededNotice(): JSX.Element {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="rx-superseded-notice"
      className="border-b border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
    >
      This slip was superseded. You can reprint it.
    </div>
  );
}

/** Connected chrome — hidden on drafts and later clinic days. */
export function RxNoteLifecycleStrip({
  token,
}: {
  token: string;
}): JSX.Element | null {
  const shell = usePrescriptionFormShell();
  const rx = shell?.prescription ?? null;
  const timezone =
    peekDoctorSettingsShared(token)?.data.settings.timezone?.trim() ||
    "Asia/Kolkata";
  const clock = useMemo(
    () => ({ now: new Date(), timezone }),
    [timezone],
  );
  const kind = resolveRxNoteChrome(rx, clock);
  if (kind === "superseded") return <RxSupersededNotice />;
  if (kind === "revise" && rx) {
    return <RxReviseStrip copy={reviseStripCopy(rx, timezone)} />;
  }
  return null;
}
