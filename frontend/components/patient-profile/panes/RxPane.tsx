"use client";

import { useEffect } from "react";
import PaneHeader from "@/components/patient-profile/PaneHeader";
import PreviousRxPopover from "@/components/consultation/cockpit/PreviousRxPopover";
import RxWorkspace from "@/components/consultation/cockpit/RxWorkspace";
import { type CockpitState } from "@/lib/patient-profile/state";
import { trackCockpitPolishPlanPaneDedupLanded } from "@/lib/patient-profile/telemetry";
import type { Appointment } from "@/types/appointment";

export interface RxPaneProps {
  appointment: Appointment;
  token: string;
  state: CockpitState;
  onRxSent?: () => void;
  onFinishVisit?: () => void;
  /**
   * Forwarded to `<RxWorkspace>` so the shell can mirror the live medicine
   * count into the pane-toggle badge (ppr-15 / cc-14).
   */
  onMedicineCountChange?: (count: number) => void;
  /**
   * Render the pane WITHOUT its own header. Set when the shell
   * (`PatientProfileShell`) already renders a column header on top.
   * Defaults to `false`.
   */
  hideHeader?: boolean;
  /**
   * When true, inline SaveStatus + commit actions are suppressed; the
   * shell `<CockpitRxActionDock>` owns them (cv3l-05).
   */
  actionsInFooter?: boolean;
  /**
   * When true, AssessmentSection hides its Dx + DDx — the AssessmentStrip
   * in the middle column owns them (cmr-01 / cmr-06).
   */
  dxLifted?: boolean;
  /**
   * When true, PlanSection hides inline safety banners — the
   * SafetyStickyStrip overlay owns them (cmr-02 / cmr-06).
   */
  safetyLifted?: boolean;
  /** Cockpit dedup (ppd) — see PrescriptionFormProps for semantics. */
  subjectiveLifted?: boolean;
  /** Cockpit dedup (ppd) — see PrescriptionFormProps for semantics. */
  objectiveLifted?: boolean;
  /** Cockpit dedup (ppd) — see PrescriptionFormProps for semantics. */
  entryModeLifted?: boolean;
  /** Cockpit dedup (ppd) — see PrescriptionFormProps for semantics. */
  photoLifted?: boolean;
  /**
   * cnc-01: when true, suppresses the `<RxSectionNav>` chip strip — the
   * cockpit shell's per-pane tab nav already provides section navigation.
   * Defaults to `false` for non-cockpit mounts.
   */
  cockpitMode?: boolean;
}

/**
 * The Prescription column body. Hosts the Rx workspace, the previous-Rx
 * popover, and the prescription-related actions.
 *
 * Extracted from `ConsultationCockpit.tsx`'s inline `RxColumnContent`
 * function in ppr-05. v1 shell (`ConsultationCockpit`) removed by ppr-14;
 * v1 header-slot props (`onCollapse`, `isCollapsible`, `slotIndex`,
 * `dragHandle`, `headerLeadingExtra`, `headerTrailingExtra`) removed here.
 */
export default function RxPane({
  appointment,
  token,
  state,
  onRxSent,
  onFinishVisit,
  onMedicineCountChange,
  hideHeader = false,
  actionsInFooter = false,
  dxLifted = false,
  safetyLifted = false,
  subjectiveLifted = false,
  objectiveLifted = false,
  entryModeLifted = false,
  photoLifted = false,
  cockpitMode = false,
}: RxPaneProps): JSX.Element {
  useEffect(() => {
    if (
      !subjectiveLifted ||
      !objectiveLifted ||
      !entryModeLifted ||
      !photoLifted
    ) {
      return;
    }
    trackCockpitPolishPlanPaneDedupLanded({
      appointmentId: appointment.id,
      subjectiveLifted: true,
      objectiveLifted: true,
      entryModeLifted: true,
      photoLifted: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rxWorkspaceBody = (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <RxWorkspace
        appointmentId={appointment.id}
        patientId={appointment.patient_id ?? null}
        token={token}
        state={state}
        onSent={onRxSent}
        onFinish={onFinishVisit}
        onMedicineCountChange={onMedicineCountChange}
        actionsInFooter={actionsInFooter}
        dxLifted={dxLifted}
        safetyLifted={safetyLifted}
        subjectiveLifted={subjectiveLifted}
        objectiveLifted={objectiveLifted}
        entryModeLifted={entryModeLifted}
        photoLifted={photoLifted}
        cockpitMode={cockpitMode}
      />
    </div>
  );

  if (hideHeader) {
    return rxWorkspaceBody;
  }

  const showPreviousRx = state !== "terminal";

  return (
    <div className="flex h-full flex-col">
      <PaneHeader
        title="Prescription"
        titleId="cockpit-rx-title"
        actions={
          showPreviousRx ? (
            <PreviousRxPopover
              appointmentId={appointment.id}
              patientId={appointment.patient_id ?? null}
              token={token}
            />
          ) : null
        }
      />
      {rxWorkspaceBody}
    </div>
  );
}
