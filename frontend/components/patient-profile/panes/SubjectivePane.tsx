"use client";

/**
 * SubjectivePane — pane wrapper that mounts the cv2-06 SubjectiveSection in its
 * own pane within the Telemed-Video tree. Created by csf-03 (2026-05-19) for
 * Phase 2 foothold. chp-03 noted that the pane definition in templates.tsx
 * reserves a `tabs: undefined` slot for future Photo / AI-summary tabs
 * (R-FUTURE-PROOFING).
 *
 * Reads RxFormContext from the lifted provider in PatientProfilePage (csf-01).
 */
import PaneHeader from "@/components/patient-profile/PaneHeader";
import { SubjectiveSection } from "@/components/cockpit/rx/sections/SubjectiveSection";
import { canEditPrescriptionDraft } from "@/lib/patient-profile/state";
import type { CockpitState } from "@/lib/patient-profile/state";
import type { PatientChartMode } from "@/types/patient-chart";

export interface SubjectivePaneProps {
  hideHeader?: boolean;
  patientId?: string | null;
  token?: string;
  /** When omitted, derived from `cockpitState` when provided. */
  chartMode?: PatientChartMode;
  /** Used to derive read-only chart mode when `chartMode` is omitted. */
  cockpitState?: CockpitState;
}

function resolveChartMode(
  chartMode: PatientChartMode | undefined,
  cockpitState: CockpitState | undefined,
): PatientChartMode {
  if (chartMode) return chartMode;
  if (cockpitState) {
    return canEditPrescriptionDraft(cockpitState) ? "default" : "readonly";
  }
  return "default";
}

export default function SubjectivePane({
  hideHeader = false,
  patientId = null,
  token,
  chartMode,
  cockpitState,
}: SubjectivePaneProps): JSX.Element {
  const resolvedChartMode = resolveChartMode(chartMode, cockpitState);
  const disabled = resolvedChartMode === "readonly";

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="subjective-pane">
      {!hideHeader ? (
        <PaneHeader title="Subjective" titleId="cockpit-subjective-title" />
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <SubjectiveSection
          heading={null}
          disabled={disabled}
          patientId={patientId}
          token={token}
          chartMode={resolvedChartMode}
        />
      </div>
    </div>
  );
}
