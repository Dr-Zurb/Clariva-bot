"use client";

/**
 * Context row: visit vitals + patient brief (allergies, PMH, meds, history)
 * on one band. Slots stay mounted even when empty or the consult is live.
 * Walk-in (no patient_id) keeps vitals only — there is no chart to load.
 * Surface wrapper (ckd-13) owns the single border + background.
 */

import type { ReactNode } from "react";
import type { Appointment } from "@/types/appointment";
import type { CockpitState } from "@/lib/patient-profile/state";
import { PatientRibbon } from "@/components/patient-profile/PatientRibbon";
import { CockpitVitalsStrip } from "@/components/cockpit/middle/CockpitVitalsStrip";
import { shouldShowChartRail } from "@/lib/patient-profile/state";

export function CockpitContextSurface({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  return (
    <div
      className="shrink-0 border-b border-border bg-background"
      data-testid="cockpit-context-surface"
    >
      {children}
    </div>
  );
}

export function CockpitContextRow({
  appointment,
  token,
  state,
}: {
  appointment: Appointment;
  token: string;
  state: CockpitState;
}): JSX.Element | null {
  const showBrief = shouldShowChartRail(
    state,
    Boolean(appointment.patient_id),
  );

  if (!showBrief) {
    return <CockpitVitalsStrip variant="inline" />;
  }

  return (
    <div
      className="flex min-h-0 w-full items-center gap-2 px-4 py-1"
      data-testid="cockpit-context-row"
      role="region"
      aria-label="Patient context"
    >
      <CockpitVitalsStrip variant="inline" />
      <div className="ml-auto min-w-0 overflow-hidden">
        <PatientRibbon appointment={appointment} token={token} compact />
      </div>
    </div>
  );
}
