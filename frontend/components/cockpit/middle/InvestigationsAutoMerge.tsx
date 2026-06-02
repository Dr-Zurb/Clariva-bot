"use client";

/**
 * InvestigationsAutoMerge — container-query-driven merge of the
 * Investigations leaf into the top of Plan when the bottom-row container
 * width is below ~720px. Source plan §"Narrow monitor (≤ 1366px container)"
 * + DL-20 + V2-Q9 lean (use container queries, not viewport queries).
 *
 * Renders two states (CSS-only, no JS resize listener):
 *   1. Wide (>= 720px): hidden — Investigations leaf renders separately
 *      in the bottom-row PanelGroup (templates.tsx, cmr-06).
 *   2. Narrow (< 720px): visible — chip-row inline at top of Plan; the
 *      Investigations leaf is hidden via a matching container query in
 *      templates.tsx.
 *
 * @see frontend/components/cockpit/rx/inputs/InvestigationsChipRow.tsx
 * @see frontend/lib/patient-profile/templates.tsx (cmr-06)
 */

import { useEffect } from "react";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { InvestigationsChipRow } from "@/components/cockpit/rx/inputs/InvestigationsChipRow";
import { canEditPrescriptionDraft, type CockpitState } from "@/lib/patient-profile/state";
import { trackCockpitV2RMiddleNarrowMergeLanded } from "@/lib/patient-profile/telemetry";

export interface InvestigationsAutoMergeProps {
  state: CockpitState;
  /** Production mount only — omitted in unit tests so telemetry does not fire. */
  appointmentId?: string;
}

export function InvestigationsAutoMerge({
  state,
  appointmentId,
}: InvestigationsAutoMergeProps) {
  const { state: rxFormState, setField } = useRxForm();
  const value = rxFormState.fields.investigationsOrders;
  const isEditable = canEditPrescriptionDraft(state);

  useEffect(() => {
    if (!appointmentId) return;
    trackCockpitV2RMiddleNarrowMergeLanded({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="block @[720px]/middle-bottom:hidden"
      data-testid="investigations-auto-merge"
    >
      <InvestigationsChipRow
        value={value}
        onChange={(next) => setField("investigationsOrders", next)}
        disabled={!isEditable}
      />
    </div>
  );
}
