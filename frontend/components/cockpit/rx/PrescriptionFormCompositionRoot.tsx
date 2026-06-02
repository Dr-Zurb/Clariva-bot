"use client";

import type { DrugMasterRow } from "@/types/drug-master";
import type { PatientAllergy } from "@/types/patient-chart";
import type { InteractionRow } from "@/lib/api/drug-interactions";
import { SubjectiveSection } from "@/components/cockpit/rx/sections/SubjectiveSection";
import { ObjectiveSection } from "@/components/cockpit/rx/sections/ObjectiveSection";
import { AssessmentSection } from "@/components/cockpit/rx/sections/AssessmentSection";
import { PlanSection } from "@/components/cockpit/rx/sections/PlanSection";

export interface PrescriptionFormCompositionRootProps {
  /** Visual variant. 'flat' = legacy single-column mount (default). */
  variant?: "flat" | "split";
  disabled?: boolean;
  /** Hide inline safety banners when `<SafetyStickyStrip>` is mounted (cmr-02). */
  safetyLifted?: boolean;
  /** Hide Dx + DDx when `<AssessmentStrip>` is mounted (cmr-01). */
  dxLifted?: boolean;
  /** Hide Subjective when `<SubjectivePane>` (right column) owns it (ppd-02). */
  subjectiveLifted?: boolean;
  /** Hide Objective when `<ObjectivePane>` (right column) owns it (ppd-02). */
  objectiveLifted?: boolean;
  token: string;
  medicineInstanceIds: string[];
  setMedicineInstanceIds: React.Dispatch<React.SetStateAction<string[]>>;
  generateInstanceIds: (count: number) => string[];
  drugMasterIndex: ReadonlyMap<string, DrugMasterRow>;
  setDrugMasterIndex: React.Dispatch<
    React.SetStateAction<ReadonlyMap<string, DrugMasterRow>>
  >;
  allergies: ReadonlyArray<PatientAllergy>;
  ddiInteractions: InteractionRow[];
  isAcked: (key: string) => boolean;
  onAcknowledge: (keys: string[]) => void;
  onAckDdi: (key: string) => void;
  /** Plan-pane keyboard shortcuts + Cmd+K registry (rxs-03). */
  onSendAndFinish?: () => void;
  onOpenTemplates?: () => void;
  onOpenPreview?: () => void;
  canSend?: boolean;
  /** Cockpit — show previous-Rx side-sheet trigger in Plan (rxss-03). */
  showPreviousRxTrigger?: boolean;
}

/**
 * SOAP section shell — must render inside `<RxFormProvider>`.
 * Headings are hidden (heading=null) to match the legacy flat form layout;
 * cv2-07 may enable per-section headings when structured inputs ship.
 *
 * ppd-02 (2026-05-26): when `subjectiveLifted` / `objectiveLifted` are true,
 * the corresponding section is omitted. Cockpit mounts set both to true so
 * the right column's `<SubjectivePane>` / `<ObjectivePane>` own the inputs.
 */
export function PrescriptionFormCompositionRoot({
  variant = "flat",
  disabled = false,
  safetyLifted = false,
  dxLifted = false,
  subjectiveLifted = false,
  objectiveLifted = false,
  token,
  medicineInstanceIds,
  setMedicineInstanceIds,
  generateInstanceIds,
  drugMasterIndex,
  setDrugMasterIndex,
  allergies,
  ddiInteractions,
  isAcked,
  onAcknowledge,
  onAckDdi,
  onSendAndFinish,
  onOpenTemplates,
  onOpenPreview,
  canSend,
  showPreviousRxTrigger = false,
}: PrescriptionFormCompositionRootProps) {
  const planProps = {
    heading: null,
    disabled,
    safetyLifted,
    token,
    medicineInstanceIds,
    setMedicineInstanceIds,
    generateInstanceIds,
    drugMasterIndex,
    setDrugMasterIndex,
    allergies,
    ddiInteractions,
    isAcked,
    onAcknowledge,
    onAckDdi,
    onSendAndFinish,
    onOpenTemplates,
    onOpenPreview,
    canSend,
    showPreviousRxTrigger,
  };

  const sections = (
    <>
      {!subjectiveLifted && (
        <SubjectiveSection heading={null} disabled={disabled} />
      )}
      {!objectiveLifted && <ObjectiveSection heading={null} />}
      <AssessmentSection heading={null} disabled={disabled} dxLifted={dxLifted} />
      <PlanSection {...planProps} />
    </>
  );

  if (variant === "flat") {
    return <div className="space-y-3">{sections}</div>;
  }

  return <>{sections}</>;
}

export { RxFormProvider } from "@/components/cockpit/rx/RxFormContext";
export { useRxForm } from "@/components/cockpit/rx/RxFormContext";
export type { RxFormFields } from "@/components/cockpit/rx/RxFormContext";
export { SubjectiveSection } from "@/components/cockpit/rx/sections/SubjectiveSection";
export { ObjectiveSection } from "@/components/cockpit/rx/sections/ObjectiveSection";
export { AssessmentSection } from "@/components/cockpit/rx/sections/AssessmentSection";
export { PlanSection } from "@/components/cockpit/rx/sections/PlanSection";
export { SendRxFinishButton } from "@/components/cockpit/rx/SendRxFinishButton";
export { SaveStatusPill } from "@/components/cockpit/rx/SaveStatusPill";
export {
  RxFormActionsBridgeProvider,
  useRegisterRxFormActions,
  useRxFormActions,
} from "@/components/cockpit/rx/RxFormActionsContext";
