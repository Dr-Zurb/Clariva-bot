"use client";

/**
 * Shell-level Rx action dock — footer buttons + patient preview / pre-send
 * modals. Survives Plan-tab removal (cv3l-05).
 */

import { PlanActionFooter } from "@/components/cockpit/middle/PlanActionFooter";
import PrescriptionPatientPreview from "@/components/consultation/PrescriptionPatientPreview";
import PrescriptionPreSendCheck from "@/components/consultation/PrescriptionPreSendCheck";
import { useRxCommitActions } from "@/components/cockpit/rx/useRxCommitActions";
import type { CockpitState } from "@/lib/patient-profile/state";

export interface CockpitRxActionDockProps {
  appointmentId: string;
  patientId: string | null;
  token: string;
  state: CockpitState;
  finishBusy?: boolean;
  onFinish?: () => void;
  onSent?: (prescriptionId: string) => void | Promise<void>;
}

export function CockpitRxActionDock({
  appointmentId,
  patientId,
  token,
  state,
  finishBusy = false,
  onFinish,
  onSent,
}: CockpitRxActionDockProps): JSX.Element | null {
  const commit = useRxCommitActions({
    appointmentId,
    patientId,
    token,
    cockpitState: state,
    onFinish,
    onSent,
  });

  if (state === "terminal") {
    return null;
  }

  return (
    <>
      <PlanActionFooter
        state={state}
        appointmentId={appointmentId}
        finishBusy={finishBusy}
        onSendAndFinish={commit.sendAndFinish}
        onPreview={commit.openPreview}
        previewLoading={commit.previewLoading}
        finishSending={commit.finishSending}
        sending={commit.saving}
        commitError={commit.commitError}
        commitSuccess={commit.commitSuccess}
      />
      <PrescriptionPatientPreview
        open={commit.previewOpen}
        onClose={commit.closePreview}
        viewModel={commit.previewVM}
      />
      <PrescriptionPreSendCheck
        open={commit.preSendWarnings !== null}
        warnings={commit.preSendWarnings ?? []}
        sending={commit.saving}
        onCancel={commit.onPreSendCancel}
        onEdit={commit.onPreSendEdit}
        onSendAnyway={commit.onPreSendSendAnyway}
      />
    </>
  );
}
