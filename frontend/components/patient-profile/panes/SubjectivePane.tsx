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
import { useRxSectionLock } from "@/components/cockpit/rx/useRxLock";
import type { CockpitState } from "@/lib/patient-profile/state";
import type { PatientChartMode } from "@/types/patient-chart";

export interface SubjectivePaneProps {
  hideHeader?: boolean;
  patientId?: string | null;
  token?: string;
  /** Explicit override. When omitted, follows {@link useRxSectionLock}. */
  chartMode?: PatientChartMode;
  /** Kept for call sites; lock comes from {@link useRxSectionLock}, not visit status. */
  cockpitState?: CockpitState;
}

export default function SubjectivePane({
  hideHeader = false,
  patientId = null,
  token,
  chartMode,
  cockpitState: _cockpitState,
}: SubjectivePaneProps): JSX.Element {
  const { contentLocked } = useRxSectionLock();
  const resolvedChartMode = chartMode ?? (contentLocked ? "readonly" : "default");
  const disabled = contentLocked;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="subjective-pane">
      {!hideHeader ? (
        <PaneHeader title="Subjective" titleId="cockpit-subjective-title" />
      ) : null}
      {/* pt-0: any top padding on the scroll container paints content over the
          sticky section header (a "bleed" band above it). Use a scrolling
          spacer for breathing room instead. */}
      <div className="min-h-0 flex-1 overflow-y-auto [overflow-anchor:none] px-4 pb-3 pt-0">
        <div className="h-3" aria-hidden />
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
