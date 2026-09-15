"use client";

import { useMemo } from "react";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { LastVisitSectionStrip } from "@/components/cockpit/rx/last-visit/LastVisitSectionStrip";
import { useLastVisitSummary } from "@/hooks/useLastVisitSummary";
import {
  LAST_VISIT_DIAGNOSIS_ACUITIES,
  LAST_VISIT_DIAGNOSIS_ACUITY_LABEL,
  diagnosisWithLastVisitAcuity,
  findDiagnosisOnNote,
  formatLastVisitDate,
  lastVisitDiagnosesForStrip,
} from "@/lib/cockpit/last-visit-apply";

export interface LastVisitDiagnosesStripProps {
  disabled?: boolean;
}

export function LastVisitDiagnosesStrip({
  disabled = false,
}: LastVisitDiagnosesStripProps): JSX.Element | null {
  const { state, dispatch } = useRxForm();
  const summary = useLastVisitSummary();
  const current = state.fields.diagnoses;
  const diagnoses = summary ? lastVisitDiagnosesForStrip(summary) : [];

  const items = useMemo(
    () =>
      diagnoses.map((diagnosis) => {
        const existing = findDiagnosisOnNote(current, diagnosis);
        return {
          key: diagnosis.id,
          label: diagnosis.label.trim(),
          applied: Boolean(existing),
          actions: LAST_VISIT_DIAGNOSIS_ACUITIES.map((acuity) => ({
            label: LAST_VISIT_DIAGNOSIS_ACUITY_LABEL[acuity],
            pressed: existing?.acuity === acuity,
            testId: `last-visit-diagnoses-item-${diagnosis.id}-${acuity}`,
            onClick: () => {
              if (disabled) return;
              if (existing) {
                dispatch({
                  type: "UPDATE_DIAGNOSIS",
                  id: existing.id,
                  patch: { acuity },
                });
                return;
              }
              dispatch({
                type: "ADD_DIAGNOSIS",
                diagnosis: diagnosisWithLastVisitAcuity(
                  diagnosis,
                  acuity,
                  current
                ),
              });
            },
          })),
        };
      }),
    [current, diagnoses, disabled, dispatch]
  );

  if (!summary || items.length === 0) return null;

  return (
    <LastVisitSectionStrip
      visitDate={formatLastVisitDate(summary.sourceCreatedAt)}
      summary=""
      items={items}
      disabled={disabled}
      testId="last-visit-diagnoses"
    />
  );
}
