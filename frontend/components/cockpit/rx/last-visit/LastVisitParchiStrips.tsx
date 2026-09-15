"use client";

import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { LastVisitSectionStrip } from "@/components/cockpit/rx/last-visit/LastVisitSectionStrip";
import { useLastVisitSummary } from "@/hooks/useLastVisitSummary";
import {
  buildFamilyHistoryCarryForwardAction,
  buildPastSurgicalHistoryCarryForwardAction,
  buildSocialHistoryCarryForwardAction,
} from "@/lib/cockpit/carry-forward-subjective";
import { serializeFamilyHistory } from "@/lib/cockpit/family-history";
import { serializePastSurgicalHistory } from "@/lib/cockpit/past-surgical-history";
import { serializeSocialHistory } from "@/lib/cockpit/social-history";
import { hydrateReferralFields } from "@/lib/cockpit/plan-quick-picks";
import {
  applyLastVisitExamFindings,
  applyLastVisitText,
  formatLastVisitDate,
  lastVisitExamAlreadyApplied,
  lastVisitExamFindings,
  lastVisitExamLabel,
  lastVisitHistoryAlreadyApplied,
  lastVisitHistoryLabel,
  lastVisitObjectiveNotes,
  lastVisitReferralAlreadyApplied,
  lastVisitReferralLabel,
  lastVisitTextAlreadyApplied,
  lastVisitTextPreview,
} from "@/lib/cockpit/last-visit-apply";

export interface LastVisitParchiStripProps {
  disabled?: boolean;
}

function LastVisitUseRow({
  visitDate,
  label,
  applied,
  testId,
  actionTestId,
  disabled,
  onUse,
}: {
  visitDate: string;
  label: string;
  applied: boolean;
  testId: string;
  actionTestId: string;
  disabled: boolean;
  onUse: () => void;
}): JSX.Element {
  return (
    <LastVisitSectionStrip
      visitDate={visitDate}
      summary={lastVisitTextPreview(label)}
      items={[
        {
          key: testId,
          label,
          applied,
          actions: applied
            ? []
            : [
                {
                  label: "Use",
                  testId: actionTestId,
                  onClick: () => {
                    if (disabled) return;
                    onUse();
                  },
                },
              ],
        },
      ]}
      disabled={disabled}
      testId={testId}
    />
  );
}

export function LastVisitHopiStrip({
  disabled = false,
}: LastVisitParchiStripProps): JSX.Element | null {
  const { state, setField } = useRxForm();
  const summary = useLastVisitSummary();
  const prior = summary?.hopi?.trim() ?? "";
  if (!summary || !prior) return null;
  const current = state.fields.hopi;
  return (
    <LastVisitUseRow
      visitDate={formatLastVisitDate(summary.sourceCreatedAt)}
      label={prior}
      applied={lastVisitTextAlreadyApplied(current, prior)}
      testId="last-visit-hopi"
      actionTestId="last-visit-hopi-use"
      disabled={disabled}
      onUse={() => setField("hopi", applyLastVisitText(current, prior))}
    />
  );
}

export function LastVisitAssessmentNotesStrip({
  disabled = false,
}: LastVisitParchiStripProps): JSX.Element | null {
  const { state, setField } = useRxForm();
  const summary = useLastVisitSummary();
  const prior = summary?.assessmentNote?.trim() ?? "";
  if (!summary || !prior) return null;
  const current = state.fields.assessmentNote;
  return (
    <LastVisitUseRow
      visitDate={formatLastVisitDate(summary.sourceCreatedAt)}
      label={prior}
      applied={lastVisitTextAlreadyApplied(current, prior)}
      testId="last-visit-assessment-notes"
      actionTestId="last-visit-assessment-notes-use"
      disabled={disabled}
      onUse={() =>
        setField("assessmentNote", applyLastVisitText(current, prior))
      }
    />
  );
}

export function LastVisitClinicalNotesStrip({
  disabled = false,
}: LastVisitParchiStripProps): JSX.Element | null {
  const { state, setField } = useRxForm();
  const summary = useLastVisitSummary();
  const prior = summary?.clinicalNotes?.trim() ?? "";
  if (!summary || !prior) return null;
  const current = state.fields.clinicalNotes;
  return (
    <LastVisitUseRow
      visitDate={formatLastVisitDate(summary.sourceCreatedAt)}
      label={prior}
      applied={lastVisitTextAlreadyApplied(current, prior)}
      testId="last-visit-clinical-notes"
      actionTestId="last-visit-clinical-notes-use"
      disabled={disabled}
      onUse={() =>
        setField("clinicalNotes", applyLastVisitText(current, prior))
      }
    />
  );
}

export function LastVisitFamilyHistoryStrip({
  disabled = false,
}: LastVisitParchiStripProps): JSX.Element | null {
  const { state, dispatch } = useRxForm();
  const summary = useLastVisitSummary();
  const label = summary ? lastVisitHistoryLabel("family", summary) : null;
  if (!summary || !label) return null;
  const current = serializeFamilyHistory(state.fields.familyHistoryStructured);
  return (
    <LastVisitUseRow
      visitDate={formatLastVisitDate(summary.sourceCreatedAt)}
      label={label}
      applied={lastVisitHistoryAlreadyApplied("family", current, summary)}
      testId="last-visit-family-history"
      actionTestId="last-visit-family-history-use"
      disabled={disabled}
      onUse={() => {
        const action = buildFamilyHistoryCarryForwardAction({
          familyHistory: summary.familyHistory ?? null,
          familyHistoryStructured: summary.familyHistoryStructured ?? null,
        });
        if (action) dispatch(action);
      }}
    />
  );
}

export function LastVisitSocialHistoryStrip({
  disabled = false,
}: LastVisitParchiStripProps): JSX.Element | null {
  const { state, dispatch } = useRxForm();
  const summary = useLastVisitSummary();
  const label = summary ? lastVisitHistoryLabel("social", summary) : null;
  if (!summary || !label) return null;
  const current = serializeSocialHistory(state.fields.socialHistoryStructured);
  return (
    <LastVisitUseRow
      visitDate={formatLastVisitDate(summary.sourceCreatedAt)}
      label={label}
      applied={lastVisitHistoryAlreadyApplied("social", current, summary)}
      testId="last-visit-social-history"
      actionTestId="last-visit-social-history-use"
      disabled={disabled}
      onUse={() => {
        const action = buildSocialHistoryCarryForwardAction({
          socialHistory: summary.socialHistory ?? null,
          socialHistoryStructured: summary.socialHistoryStructured ?? null,
        });
        if (action) dispatch(action);
      }}
    />
  );
}

export function LastVisitPastSurgicalStrip({
  disabled = false,
}: LastVisitParchiStripProps): JSX.Element | null {
  const { state, dispatch } = useRxForm();
  const summary = useLastVisitSummary();
  const label = summary ? lastVisitHistoryLabel("pastSurgical", summary) : null;
  if (!summary || !label) return null;
  const current = serializePastSurgicalHistory(
    state.fields.pastSurgicalHistoryStructured
  );
  return (
    <LastVisitUseRow
      visitDate={formatLastVisitDate(summary.sourceCreatedAt)}
      label={label}
      applied={lastVisitHistoryAlreadyApplied("pastSurgical", current, summary)}
      testId="last-visit-past-surgical"
      actionTestId="last-visit-past-surgical-use"
      disabled={disabled}
      onUse={() => {
        const action = buildPastSurgicalHistoryCarryForwardAction({
          pastSurgicalHistory: summary.pastSurgicalHistory ?? null,
          pastSurgicalHistoryStructured:
            summary.pastSurgicalHistoryStructured ?? null,
        });
        if (action) dispatch(action);
      }}
    />
  );
}

export function LastVisitReferralStrip({
  disabled = false,
}: LastVisitParchiStripProps): JSX.Element | null {
  const { state, setField } = useRxForm();
  const summary = useLastVisitSummary();
  const label = lastVisitReferralLabel(summary?.referral);
  if (!summary || !label) return null;
  const applied = lastVisitReferralAlreadyApplied(
    {
      referralUrgency: state.fields.referralUrgency,
      referralSpecialties: state.fields.referralSpecialties,
      referralReason: state.fields.referralReason,
      referral: state.fields.referral,
    },
    summary.referral
  );
  return (
    <LastVisitUseRow
      visitDate={formatLastVisitDate(summary.sourceCreatedAt)}
      label={label}
      applied={applied}
      testId="last-visit-referral"
      actionTestId="last-visit-referral-use"
      disabled={disabled}
      onUse={() => {
        const next = hydrateReferralFields(summary.referral);
        setField("referralUrgency", next.referralUrgency);
        setField("referralSpecialties", next.referralSpecialties);
        setField("referralReason", next.referralReason);
        setField("referral", next.referral);
      }}
    />
  );
}

export function LastVisitExamStrip({
  disabled = false,
}: LastVisitParchiStripProps): JSX.Element | null {
  const { state, dispatch } = useRxForm();
  const summary = useLastVisitSummary();
  const prior = lastVisitExamFindings(summary?.examinationJson);
  const label = summary ? lastVisitExamLabel(summary) : null;
  if (!summary || !label || prior.length === 0) return null;
  const current = state.fields.examFindings;
  return (
    <LastVisitUseRow
      visitDate={formatLastVisitDate(summary.sourceCreatedAt)}
      label={label}
      applied={lastVisitExamAlreadyApplied(current, prior)}
      testId="last-visit-exam"
      actionTestId="last-visit-exam-use"
      disabled={disabled}
      onUse={() =>
        dispatch({
          type: "SET_EXAM_FINDINGS",
          examFindings: applyLastVisitExamFindings(current, prior),
        })
      }
    />
  );
}

export function LastVisitObjectiveNotesStrip({
  disabled = false,
}: LastVisitParchiStripProps): JSX.Element | null {
  const { state, dispatch } = useRxForm();
  const summary = useLastVisitSummary();
  const prior = lastVisitObjectiveNotes(summary?.examinationJson);
  if (!summary || !prior) return null;
  const current =
    state.fields.examFindings.find((f) => f.systemId === "objective_notes")
      ?.notes ?? "";
  return (
    <LastVisitUseRow
      visitDate={formatLastVisitDate(summary.sourceCreatedAt)}
      label={prior}
      applied={lastVisitTextAlreadyApplied(current, prior)}
      testId="last-visit-objective-notes"
      actionTestId="last-visit-objective-notes-use"
      disabled={disabled}
      onUse={() =>
        dispatch({
          type: "SET_EXAM_SYSTEM",
          systemId: "objective_notes",
          status: "abnormal",
          findings: [],
          notes: applyLastVisitText(current, prior),
        })
      }
    />
  );
}
