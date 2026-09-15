"use client";

/**
 * Shell-level Rx action dock — footer buttons + patient preview / pre-send
 * modals. Survives Plan-tab removal (cv3l-05).
 */

import { PlanActionFooter } from "@/components/cockpit/middle/PlanActionFooter";
import PrescriptionPatientPreview from "@/components/consultation/PrescriptionPatientPreview";
import PrescriptionPreSendCheck from "@/components/consultation/PrescriptionPreSendCheck";
import { usePrescriptionFormShell } from "@/components/cockpit/rx/PrescriptionFormShellContext";
import { RxRevisionReasonDialog } from "@/components/cockpit/rx/RxRevisionReasonDialog";
import { RxRevisionDeliveryPrompt } from "@/components/cockpit/rx/RxRevisionDeliveryPrompt";
import { reviseDialogReplacesCopy } from "@/components/cockpit/rx/rxRevise";
import {
  useRxCommitActions,
  type RxPreviewPatientIdentity,
} from "@/components/cockpit/rx/useRxCommitActions";
import { peekDoctorSettingsShared } from "@/lib/api/doctor-settings-shared";
import type { CockpitState } from "@/lib/patient-profile/state";

export interface CockpitRxActionDockProps {
  appointmentId: string;
  patientId: string | null;
  patientName?: string | null;
  patientIdentity?: RxPreviewPatientIdentity | null;
  token: string;
  state: CockpitState;
  finishBusy?: boolean;
  onFinish?: () => void | Promise<void>;
  onSent?: (prescriptionId: string) => void | Promise<void>;
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
  const shell = usePrescriptionFormShell();
  const timezone =
    peekDoctorSettingsShared(token)?.data.settings.timezone?.trim() ||
    "Asia/Kolkata";
  const replacesLine = reviseDialogReplacesCopy(
    shell?.prescription ?? null,
    timezone,
  );

  const handleClosePreview = () => {
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
        onPrewarm={commit.prewarmOnIntent}
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
      />
      <PrescriptionPreSendCheck
        open={commit.preSendWarnings !== null}
        warnings={commit.preSendWarnings ?? []}
        sending={commit.saving}
        onCancel={commit.onPreSendCancel}
        onEdit={commit.onPreSendEdit}
        onSendAnyway={commit.onPreSendSendAnyway}
      />
      <RxRevisionReasonDialog
        open={commit.revisionReasonOpen}
        busy={commit.revisionReasonBusy}
        error={commit.revisionReasonError}
        replacesLine={replacesLine}
        onCancel={commit.onRevisionReasonCancel}
        onConfirm={commit.onRevisionReasonConfirm}
      />
      <RxRevisionDeliveryPrompt
        open={commit.deliveryPrompt !== null}
        canResend={commit.deliveryPrompt?.resend === true}
        canReprint={commit.deliveryPrompt?.reprint === true}
        busy={commit.saving || commit.printBusy}
        onDismiss={commit.onDeliveryPromptDismiss}
        onResend={commit.onDeliveryPromptResend}
        onReprint={commit.onDeliveryPromptReprint}
      />
    </>
  );
}
