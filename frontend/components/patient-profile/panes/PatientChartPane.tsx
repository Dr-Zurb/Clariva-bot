"use client";

import AppointmentChartRail from "@/components/ehr/AppointmentChartRail";
import CollapsedChartRail from "@/components/consultation/cockpit/CollapsedChartRail";
import type { RailCollapsedStubRendererProps } from "@/components/consultation/cockpit/RailCollapsedStub";
import type { Appointment } from "@/types/appointment";

export interface PatientChartPaneProps {
  appointment: Appointment;
  token: string;
  /**
   * v2: forwarded to `<AppointmentChartRail>` so its internal
   * `<CockpitColumnHeader>` is suppressed when the v2 shell renders its
   * own `<PaneHeader>` on top of this pane. Without this the "Patient
   * chart" title is duplicated (parity bug found in ppr-11 QA — fix
   * landed alongside ppr-06).
   */
  hideHeader?: boolean;
}

/**
 * The Patient chart column body. Thin wrapper around `<AppointmentChartRail>`
 * that lets the v2 shell render a chart pane with the same API surface as
 * the body and Rx panes (props-in, single render function).
 *
 * The expanded surface (`PatientChartPane`) and the collapsed strip
 * (`PatientChartCollapsedStrip`) ship side-by-side so the v2 panes array
 * can wire both via `{ render, collapsedRender }`.
 *
 * Note: `patient_id` is always non-null here because `<PatientProfilePage>`
 * filters out the chart pane for walk-in appointments (no patient_id).
 */
export default function PatientChartPane({
  appointment,
  token,
  hideHeader = false,
}: PatientChartPaneProps): JSX.Element {
  return (
    <AppointmentChartRail
      patientId={appointment.patient_id ?? ""}
      doctorId={appointment.doctor_id ?? undefined}
      token={token}
      appointmentId={appointment.id}
      hideHeader={hideHeader}
    />
  );
}

/**
 * The collapsed 40px strip for the chart pane. Re-exports the existing
 * `<CollapsedChartRail>` icon stack — section-icon navigation that
 * expands the rail AND scrolls to the section on click (cc-13).
 *
 * Accepts `{ onExpand }` as its primary surface so the v2 panes array can
 * call it with a shell-provided expand callback. `side` and `label` are
 * defaulted here for the typical chart-on-the-left layout; pass them
 * explicitly when the chart pane sits in a different slot.
 */
export function PatientChartCollapsedStrip({
  onExpand,
  side = "left",
  label = "Patient chart",
}: Partial<RailCollapsedStubRendererProps> & {
  onExpand: () => void;
}): JSX.Element {
  return <CollapsedChartRail side={side} label={label} onExpand={onExpand} />;
}
