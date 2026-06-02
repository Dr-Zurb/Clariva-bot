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

export interface SubjectivePaneProps {
  hideHeader?: boolean;
}

export default function SubjectivePane({
  hideHeader = false,
}: SubjectivePaneProps): JSX.Element {
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="subjective-pane">
      {!hideHeader ? (
        <PaneHeader title="Subjective" titleId="cockpit-subjective-title" />
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <SubjectiveSection heading={null} />
      </div>
    </div>
  );
}
