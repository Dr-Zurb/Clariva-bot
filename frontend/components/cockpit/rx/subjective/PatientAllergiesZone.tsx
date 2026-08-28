"use client";

import { useRef, useState } from "react";
import AllergiesSection from "@/components/ehr/sections/AllergiesSection";
import {
  SubjectiveSectionTemplateHeaderActions,
  type SectionTemplateControlsBinding,
} from "@/components/cockpit/rx/subjective/SubjectiveSectionTemplateButton";
import { CollapsibleContainer } from "@/components/ui/CollapsibleContainer";
import {
  resolveSubjectiveSectionIcon,
  sectionHeaderIcon,
} from "@/components/cockpit/rx/sections/section-chrome";
import { SUBJECTIVE_SCROLL_TOP_SELECTOR } from "@/lib/cockpit/exam-card-scroll";
import { SectionReorderLeadingAction } from "@/components/cockpit/rx/subjective/SortableSectionShell";
import { formatCountSummary } from "@/components/patient-profile/panes/snapshot-pane-summary";
import { usePatientAllergiesQuery } from "@/hooks/queries/usePatientAllergiesQuery";
import type { PatientChartMode } from "@/types/patient-chart";

const BACKGROUND_LAYOUT = "in-call" as const;

export interface PatientAllergiesZoneProps {
  patientId: string;
  token: string;
  mode: PatientChartMode;
  sectionOpen?: boolean;
  onSectionOpenChange?: (open: boolean) => void;
}

export function PatientAllergiesZone({
  patientId,
  token,
  mode,
  sectionOpen,
  onSectionOpenChange,
}: PatientAllergiesZoneProps) {
  // Shared query — tab-switch remount paints count/preview from cache (PMH parity).
  const allergiesQuery = usePatientAllergiesQuery(token, patientId);
  const allergyCount = allergiesQuery.data ? allergiesQuery.data.allergies.length : null;
  const sectionNotes = allergiesQuery.data?.sectionNotes ?? null;
  const [localOpen, setLocalOpen] = useState(false);
  const zoneOpen = sectionOpen ?? localOpen;
  const handleZoneOpenChange = onSectionOpenChange ?? setLocalOpen;
  const allergyControlsRef = useRef<SectionTemplateControlsBinding | null>(null);
  const [allergyControlsReady, setAllergyControlsReady] = useState(false);
  const readonly = mode === "readonly";

  const allergySummary = formatCountSummary(
    allergyCount,
    "allergy",
    "allergies",
    "No allergies",
  );
  const zonePreviewParts = [
    allergySummary !== "No allergies" ? allergySummary : "",
    sectionNotes?.trim() ? "notes" : "",
  ].filter(Boolean);
  const zonePreview = zonePreviewParts.length > 0 ? `— ${zonePreviewParts.join(" · ")}` : undefined;
  const zoneCount =
    (allergyCount ?? 0) > 0 ? allergyCount : sectionNotes?.trim() ? 1 : allergyCount;

  return (
    <CollapsibleContainer
      title="Allergies"
      sectionIcon={sectionHeaderIcon(resolveSubjectiveSectionIcon("allergies")!)}
      toggleLabel="Toggle allergies"
      testId="patient-allergies-zone"
      scrollOnExpand
      closeScrollToSelector={SUBJECTIVE_SCROLL_TOP_SELECTOR}
      stickyHeader
      open={zoneOpen}
      onOpenChange={handleZoneOpenChange}
      count={zoneCount}
      preview={zonePreview}
      bodyClassName="space-y-3"
      depthTone
      leadingActions={<SectionReorderLeadingAction sectionId="allergies" />}
      actions={
        !readonly ? (
          <SubjectiveSectionTemplateHeaderActions
            scope="allergies"
            controlsRef={allergyControlsRef}
            ready={allergyControlsReady}
          />
        ) : undefined
      }
    >
      <AllergiesSection
        patientId={patientId}
        token={token}
        layout={BACKGROUND_LAYOUT}
        mode={mode}
        templateControlsRef={allergyControlsRef}
        onTemplateControlsReadyChange={setAllergyControlsReady}
      />
    </CollapsibleContainer>
  );
}
