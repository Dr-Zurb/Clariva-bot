"use client";

/**
 * AssessmentStrip — ~60px sticky leaf rendered between Body and bottom-row
 * in the middle column. Hosts the canonical Working Dx input (id="diagnosis")
 * and the DDx chip array. Lifted out of <AssessmentSection> per source plan
 * DL-19; AssessmentSection hides its own Dx + DDx when this strip is in the
 * tree (cmr-01 DL-6).
 *
 * Click on the ribbon's 🎯 segment focuses this strip's Dx input (crb-02 DL-4).
 *
 * @see frontend/components/cockpit/rx/sections/AssessmentSection.tsx
 * @see frontend/components/patient-profile/PatientRibbon.tsx
 */
import { useEffect } from "react";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { DdxChipList } from "@/components/cockpit/rx/inputs/DdxChipList";
import { RX_FIELD_INPUT_CLASS } from "@/components/cockpit/rx/sections/field-styles";
import { Badge } from "@/components/ui/badge";
import { canEditPrescriptionDraft, type CockpitState } from "@/lib/patient-profile/state";
import { trackCockpitV2RMiddleAssessmentLanded } from "@/lib/patient-profile/telemetry";

export interface AssessmentStripProps {
  state: CockpitState;
  /** Production mount only — omitted in unit tests so telemetry does not fire. */
  appointmentId?: string;
}

export function AssessmentStrip({ state, appointmentId }: AssessmentStripProps) {
  const { state: rxFormState, setField } = useRxForm();
  const dxValue = rxFormState.fields.provisionalDiagnosis;
  const ddxEntries = rxFormState.fields.differentialDiagnosis;
  const isEditable = canEditPrescriptionDraft(state);
  const isZeroState =
    (state === "ready" || state === "lobby") && dxValue.trim() === "";

  useEffect(() => {
    if (!appointmentId) return;
    trackCockpitV2RMiddleAssessmentLanded({
      appointmentId,
      hasDxValue: Boolean(dxValue.trim()),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isZeroState) {
    return (
      <div
        role="status"
        aria-label="Assessment strip — waiting for diagnosis"
        className="flex h-6 items-center px-3 text-xs text-muted-foreground/70"
      >
        Diagnosis appears here once the doctor enters one
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Assessment strip — Working diagnosis and differentials"
      className="flex h-[60px] w-full shrink-0 items-center gap-3 border-b border-t bg-card px-4"
    >
      <label
        htmlFor="diagnosis"
        className="shrink-0 text-xs font-medium text-muted-foreground"
      >
        Working Dx:
      </label>
      <input
        id="diagnosis"
        type="text"
        value={dxValue}
        onChange={(e) => setField("provisionalDiagnosis", e.target.value)}
        disabled={!isEditable}
        placeholder="Provisional diagnosis"
        className={`${RX_FIELD_INPUT_CLASS} mt-0 min-w-[200px] flex-1 py-1`}
        maxLength={500}
      />
      <span className="shrink-0 text-xs text-muted-foreground" aria-hidden>
        ·
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">DDx:</span>
      {isEditable ? (
        <div className="min-w-0 flex-1 overflow-hidden [&>div]:space-y-0 [&_label]:sr-only">
          <DdxChipList />
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 overflow-hidden">
          {ddxEntries.length === 0 ? (
            <span className="text-xs text-muted-foreground">—</span>
          ) : (
            ddxEntries.map((entry, index) => (
              <Badge key={`${entry}-${index}`} variant="secondary">
                {entry}
              </Badge>
            ))
          )}
        </div>
      )}
    </div>
  );
}
