"use client";

import { useCallback, useRef, useState } from "react";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { PastSurgicalHistoryField } from "@/components/cockpit/rx/subjective/PastSurgicalHistoryField";
import {
  SubjectiveSectionTemplateHeaderActions,
  type SectionTemplateControlsBinding,
} from "@/components/cockpit/rx/subjective/SubjectiveSectionTemplateButton";
import ProblemOrientedMedicalSection from "@/components/ehr/sections/ProblemOrientedMedicalSection";
import { CollapsibleContainer } from "@/components/ui/CollapsibleContainer";
import { SectionReorderLeadingAction } from "@/components/cockpit/rx/subjective/SortableSectionShell";
import { formatActivePastSummary } from "@/components/ehr/chart/ChartPillToggle";
import {
  formatPastSurgicalHistoryPreview,
} from "@/lib/cockpit/past-surgical-history";
import type { PatientChartMode } from "@/types/patient-chart";

const BACKGROUND_LAYOUT = "in-call" as const;

export interface PatientBackgroundZoneProps {
  patientId: string;
  token: string;
  mode: PatientChartMode;
  disabled?: boolean;
  sectionOpen?: boolean;
  onSectionOpenChange?: (open: boolean) => void;
}

function joinPreviewParts(parts: string[]): string | undefined {
  const filtered = parts.filter(Boolean);
  return filtered.length > 0 ? filtered.join(" · ") : undefined;
}

export function PatientBackgroundZone({
  patientId,
  token,
  mode,
  disabled = false,
  sectionOpen,
  onSectionOpenChange,
}: PatientBackgroundZoneProps) {
  const { state, setPastSurgicalHistoryStructured } = useRxForm();
  const [counts, setCounts] = useState({
    conditionActive: 0,
    conditionPast: 0,
    medActive: 0,
    medPast: 0,
    hasSectionNotes: false,
  });

  const handleStatusCounts = useCallback(
    (next: {
      conditionActive: number;
      conditionPast: number;
      medActive: number;
      medPast: number;
      hasSectionNotes: boolean;
    }) => setCounts(next),
    [],
  );

  const readonly = mode === "readonly" || disabled;
  const pmhControlsRef = useRef<SectionTemplateControlsBinding | null>(null);
  const [pmhControlsReady, setPmhControlsReady] = useState(false);

  const pmhSummary = formatActivePastSummary(
    counts.conditionActive,
    counts.conditionPast,
    "active conditions",
    "past conditions",
    "",
  );
  const pmhMedSummary = formatActivePastSummary(
    counts.medActive,
    counts.medPast,
    "active meds",
    "past meds",
    "",
  );
  const pmhPreview = joinPreviewParts([
    pmhSummary,
    pmhMedSummary,
    counts.hasSectionNotes ? "notes" : "",
  ]);
  const pmhFilledCount =
    counts.conditionActive +
    counts.conditionPast +
    counts.medActive +
    counts.medPast +
    (counts.hasSectionNotes ? 1 : 0);

  const surgicalStructured = state.fields.pastSurgicalHistoryStructured;
  const surgicalPreview = formatPastSurgicalHistoryPreview(surgicalStructured);

  const zonePreview = joinPreviewParts([pmhPreview, surgicalPreview]);

  return (
    <CollapsibleContainer
      title="Patient background"
      toggleLabel="Toggle patient background"
      testId="patient-background-zone"
      open={sectionOpen}
      onOpenChange={onSectionOpenChange}
      preview={zonePreview ? `— ${zonePreview}` : undefined}
      bodyClassName="flex flex-col gap-2 px-3 pb-3 pt-0"
      leadingActions={<SectionReorderLeadingAction sectionId="patient_background" />}
    >
      <CollapsibleContainer
        title="Past medical history"
        toggleLabel="Toggle past medical history"
        testId="past-medical-history-field"
        count={pmhFilledCount > 0 ? pmhFilledCount : null}
        preview={pmhPreview ? `— ${pmhPreview}` : undefined}
        defaultOpen
        bodyClassName="space-y-3 px-3 pb-3 pt-0"
        actions={
          !readonly ? (
            <SubjectiveSectionTemplateHeaderActions
              scope="past_medical"
              controlsRef={pmhControlsRef}
              ready={pmhControlsReady}
            />
          ) : undefined
        }
      >
        <ProblemOrientedMedicalSection
          patientId={patientId}
          token={token}
          layout={BACKGROUND_LAYOUT}
          mode={readonly ? "readonly" : "default"}
          templateControlsRef={pmhControlsRef}
          onTemplateControlsReadyChange={setPmhControlsReady}
          onStatusCountsChange={handleStatusCounts}
        />
      </CollapsibleContainer>

      <PastSurgicalHistoryField
        value={surgicalStructured}
        disabled={readonly}
        onChange={setPastSurgicalHistoryStructured}
      />
    </CollapsibleContainer>
  );
}
