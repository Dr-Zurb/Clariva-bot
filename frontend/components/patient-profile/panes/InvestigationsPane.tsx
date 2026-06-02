"use client";

import { useEffect, useState } from "react";
import { Beaker, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import PaneHeader from "@/components/patient-profile/PaneHeader";

/**
 * InvestigationsPane — pane wrapper that hosts the cv2-04 investigations
 * chip-row in its own pane within the Telemed-Video tree (and siblings).
 * Created by cmi-01 (2026-05-21) replacing the csf-03 `<PanePlaceholder>`.
 *
 * Inventory (cmi-01): chip-row lived inline in PlanSection as a plain text
 * input; extracted to `InvestigationsChipRow` with semicolon-separated chips.
 *
 * Reads `RxFormContext.fields.investigationsOrders` via the lifted provider
 * in PatientProfilePage (csf-01). Edits flow back through `setField` and
 * trigger the existing single-debounce autosave.
 *
 * Read-only mode (DL-5): when state denotes ended / terminal, the `[+ add]`
 * affordance is hidden and existing chips render as static badges.
 *
 * @see frontend/components/cockpit/rx/inputs/InvestigationsChipRow.tsx
 * @see frontend/components/cockpit/rx/sections/PlanSection.tsx — still renders chip-row
 * @see frontend/components/cockpit/rx/RxFormContext.tsx — state owner.
 */
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { InvestigationsChipRow } from "@/components/cockpit/rx/inputs/InvestigationsChipRow";
import { parseInvestigationsOrders } from "@/components/cockpit/rx/inputs/investigations-orders-format";
import { canEditPrescriptionDraft, type CockpitState } from "@/lib/patient-profile/state";
import { trackCockpitV2RMiddleInvLanded } from "@/lib/patient-profile/telemetry";

export interface InvestigationsPaneProps {
  /** Cockpit state — drives read-only mode (DL-5). */
  state: CockpitState;
  /** Production mount only — omitted in unit tests so telemetry does not fire. */
  appointmentId?: string;
  hideHeader?: boolean;
}

export default function InvestigationsPane({
  state,
  appointmentId,
  hideHeader = false,
}: InvestigationsPaneProps): JSX.Element {
  const { state: rxFormState, setField } = useRxForm();
  const value = rxFormState.fields.investigationsOrders;
  const isEditable = canEditPrescriptionDraft(state);
  const [editorRevealed, setEditorRevealed] = useState(false);
  const investigationsCount = parseInvestigationsOrders(value).length;
  const isEmpty = investigationsCount === 0;
  const showEmptyState =
    isEmpty && state !== "terminal" && isEditable && !editorRevealed;

  function handleAddInvestigation(): void {
    setEditorRevealed(true);
  }

  useEffect(() => {
    if (!isEmpty) setEditorRevealed(false);
  }, [isEmpty]);

  useEffect(() => {
    if (!editorRevealed) return;
    const input = document.querySelector<HTMLInputElement>(
      '#rx-investigations input[aria-label="Investigation name"]',
    );
    input?.focus();
    input?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [editorRevealed]);

  // Pane mount (not page mount) so investigationsLength reflects loaded draft.
  // appointmentId gates unit-test renders; one-shot flag gates repeat mounts.
  useEffect(() => {
    if (!appointmentId) return;
    trackCockpitV2RMiddleInvLanded({
      appointmentId,
      investigationsLength: parseInvestigationsOrders(value).length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const header = hideHeader ? null : (
    <PaneHeader title="Investigations" titleId="cockpit-investigations-title" />
  );

  if (showEmptyState) {
    return (
      <div className="flex h-full min-h-0 flex-col" data-testid="investigations-pane">
        {header}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <Beaker className="h-8 w-8 text-muted-foreground/60" aria-hidden />
          <p className="text-sm text-muted-foreground">No tests ordered yet</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleAddInvestigation}
            aria-label="Add an investigation"
          >
            <Plus className="mr-1 h-4 w-4" />
            Add test
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="investigations-pane">
      {header}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <InvestigationsChipRow
          value={value}
          onChange={(next) => setField("investigationsOrders", next)}
          disabled={!isEditable}
          hideLabel={hideHeader}
        />
      </div>
    </div>
  );
}
