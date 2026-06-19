"use client";

import { useCallback, useRef, useState } from "react";
import AllergiesSection from "@/components/ehr/sections/AllergiesSection";
import {
  SubjectiveSectionTemplateHeaderActions,
  type SectionTemplateControlsBinding,
} from "@/components/cockpit/rx/subjective/SubjectiveSectionTemplateButton";
import { CollapsibleContainer } from "@/components/ui/CollapsibleContainer";
import { SectionReorderLeadingAction } from "@/components/cockpit/rx/subjective/SortableSectionShell";
import { formatCountSummary } from "@/components/patient-profile/panes/snapshot-pane-summary";
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
  const [allergyCount, setAllergyCount] = useState<number | null>(null);
  const [localOpen, setLocalOpen] = useState(false);
  const zoneOpen = sectionOpen ?? localOpen;
  const handleZoneOpenChange = onSectionOpenChange ?? setLocalOpen;
  const allergyControlsRef = useRef<SectionTemplateControlsBinding | null>(null);
  const [allergyControlsReady, setAllergyControlsReady] = useState(false);
  const readonly = mode === "readonly";

  const handleAllergyCount = useCallback((n: number) => setAllergyCount(n), []);

  const allergySummary = formatCountSummary(
    allergyCount,
    "allergy",
    "allergies",
    "No allergies",
  );

  return (
    <CollapsibleContainer
      title="Allergies"
      toggleLabel="Toggle allergies"
      testId="patient-allergies-zone"
      open={zoneOpen}
      onOpenChange={handleZoneOpenChange}
      count={allergyCount}
      preview={allergySummary !== "No allergies" ? `— ${allergySummary}` : undefined}
      bodyClassName="space-y-3 px-3 pb-3 pt-0"
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
        onCountChange={handleAllergyCount}
      />
    </CollapsibleContainer>
  );
}
