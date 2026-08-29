"use client";

/**
 * Shell-level Rx action dock — footer buttons + patient preview / pre-send
 * modals. Survives Plan-tab removal (cv3l-05).
 */

import { useEffect } from "react";
import { PlanActionFooter } from "@/components/cockpit/middle/PlanActionFooter";
import PrescriptionPatientPreview from "@/components/consultation/PrescriptionPatientPreview";
import PrescriptionPreSendCheck from "@/components/consultation/PrescriptionPreSendCheck";
import {
  useRxCommitActions,
  type RxPreviewPatientIdentity,
} from "@/components/cockpit/rx/useRxCommitActions";
import type { CockpitLeaveExit } from "@/components/patient-profile/CockpitLeaveGuard";
import type { CockpitState } from "@/lib/patient-profile/state";

export interface CockpitRxActionDockProps {
  appointmentId: string;
  patientId: string | null;
  patientName?: string | null;
  patientIdentity?: RxPreviewPatientIdentity | null;
  token: string;
  state: CockpitState;
  finishBusy?: boolean;
  onFinish?: () => void;
  onSent?: (prescriptionId: string) => void | Promise<void>;
  /** Set while Back / leave is held — preview gets Stay / resume later. */
  leaveExit?: CockpitLeaveExit | null;
}

export function CockpitRxActionDock({
  appointmentId,
  patientId,
  patientName,
  patientIdentity,
  token,
  state,
  finishBusy = false,
  onFinish,
  onSent,
  leaveExit = null,
}: CockpitRxActionDockProps): JSX.Element | null {
  const commit = useRxCommitActions({
    appointmentId,
    patientId,
    patientName,
    patientIdentity,
    token,
    cockpitState: state,
    onFinish,
    onSent,
  });

  useEffect(() => {
    if (!leaveExit) return;
    commit.openPreview();
  }, [leaveExit, commit.openPreview]);

  const handleClosePreview = () => {
    if (leaveExit) {
      leaveExit.stay();
    }
    commit.closePreview();
  };

  if (state === "terminal") {
    return null;
  }

  return (
    <>
      <PlanActionFooter
        state={state}
        appointmentId={appointmentId}
        finishBusy={finishBusy}
        onReview={commit.openPreview}
        onPreview={commit.openPreview}
        previewLoading={commit.previewLoading}
        sending={commit.saving}
        commitError={commit.commitError}
        commitSuccess={commit.commitSuccess}
      />
      <PrescriptionPatientPreview
        open={commit.previewOpen}
        onClose={handleClosePreview}
        viewModel={commit.previewVM}
        canSend={commit.canSend}
        canFinish={commit.canFinish}
        canPrint={commit.canPrint}
        sending={commit.saving}
        printBusy={commit.printBusy}
        finishBusy={finishBusy}
        commitError={commit.commitError}
        commitSuccess={commit.commitSuccess}
        onSendRx={commit.sendRx}
        onSendAndFinish={commit.sendAndFinish}
        onSendFinishAndPrint={commit.sendFinishAndPrint}
        onFinish={commit.finishVisit}
        onPrint={commit.printPrescription}
        onDownload={commit.downloadPrescription}
        onStay={
          leaveExit
            ? () => {
                leaveExit.stay();
                commit.closePreview();
              }
            : undefined
        }
        onResumeLater={
          leaveExit
            ? () => {
                leaveExit.resumeLater();
                commit.closePreview();
              }
            : undefined
        }
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
