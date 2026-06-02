"use client";

/**
 * ObjectivePane — pane wrapper that mounts the cv2-06 ObjectiveSection in its own
 * pane within the Telemed-Video tree. Created by csf-03 (2026-05-19) for Phase 2 foothold.
 * chp-03 added the R-HISTORY-landed telemetry event (2026-05-21).
 *
 * Reads RxFormContext from the lifted provider in PatientProfilePage (csf-01).
 */
import { useEffect } from "react";
import PaneHeader from "@/components/patient-profile/PaneHeader";
import { ObjectiveSection } from "@/components/cockpit/rx/sections/ObjectiveSection";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { trackCockpitV2RHistoryLanded } from "@/lib/patient-profile/telemetry";
import { parseExam } from "@/lib/cockpit/exam-findings";

export interface ObjectivePaneProps {
  /** Production mount only — omitted in unit tests so telemetry does not fire. */
  appointmentId?: string;
  hideHeader?: boolean;
}

export default function ObjectivePane({
  appointmentId,
  hideHeader = false,
}: ObjectivePaneProps): JSX.Element {
  const { state } = useRxForm();

  useEffect(() => {
    if (!appointmentId) return;

    // One-shot guard lives inside trackCockpitV2RHistoryLanded — safe to call
    // on every mount; the second + later calls no-op.
    const { fields } = state;
    const exam = parseExam(fields.examinationFindings);
    const vitalsFilledCount =
      (fields.vitalsBpSystolic != null ? 1 : 0) +
      (fields.vitalsBpDiastolic != null ? 1 : 0) +
      (fields.vitalsHr != null ? 1 : 0) +
      (fields.vitalsTempC != null ? 1 : 0) +
      (fields.vitalsSpo2 != null ? 1 : 0) +
      (fields.vitalsWtKg != null ? 1 : 0) +
      (fields.vitalsHtCm != null ? 1 : 0);

    trackCockpitV2RHistoryLanded({
      appointmentId,
      vitalsFilledCount,
      hasGeneralExam: exam.general.trim().length > 0,
      hasSystemicExam: exam.systemic.trim().length > 0,
      hasTestResults: fields.testResults.trim().length > 0,
      hasBmi: fields.vitalsWtKg != null && fields.vitalsHtCm != null,
    });
    // Intentionally fire only on mount; the one-shot guard inside the tracker
    // ensures repeat mounts (e.g., template switches) don't re-fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="objective-pane">
      {!hideHeader ? (
        <PaneHeader title="Objective" titleId="cockpit-objective-title" />
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <ObjectiveSection heading={null} />
      </div>
    </div>
  );
}
