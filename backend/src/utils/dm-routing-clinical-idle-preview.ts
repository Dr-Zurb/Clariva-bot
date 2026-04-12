/**
 * e-task-ops-02: Pure preview of clinical-idle DM branches (post-medical ack, reason-first, medical safety).
 * Mirrors ordering and booleans in `instagram-dm-webhook-handler` for those blocks — no DB, no fee composer.
 * Used for golden corpus regression tests; fee_ambiguous outcomes are not simulated here.
 */

import type { IntentDetectionResult } from '../types/ai';
import type { DmHandlerBranch } from '../types/dm-instrumentation';
import type { ConversationState } from '../types/conversation';
import { isRecentMedicalDeflectionWindow } from '../types/conversation';
import {
  classifierSignalsFeeThreadContinuation,
  classifierSignalsPaymentExistence,
  intentSignalsFeeOrPricing,
  userSignalsReasonFirstWrapUp,
} from '../services/ai-service';
import { userExplicitlyWantsToBookNow } from './consultation-fees';
import {
  feeFollowUpAnaphora,
  isVagueConsultationPaymentExistenceQuestion,
  lastAssistantDmContent,
  parseReasonTriageConfirmYes,
  parseReasonTriageNegationForClarify,
  recentPatientThreadHasClinicalReason,
  userWantsExplicitFullFeeList,
} from './reason-first-triage';

export type ClinicalIdlePreviewState = Pick<
  ConversationState,
  'step' | 'reasonFirstTriagePhase' | 'postMedicalConsultFeeAckSent' | 'lastMedicalDeflectionAt'
>;

export function previewClinicalIdleDmBranch(params: {
  text: string;
  intentResult: IntentDetectionResult;
  state: ClinicalIdlePreviewState;
  recentMessages: { sender_type: string; content: string }[];
  inCollection: boolean;
  /** For deterministic tests (deflection window TTL). */
  nowMs?: number;
}): DmHandlerBranch | null {
  const { text, intentResult, state, recentMessages, inCollection, nowMs = Date.now() } = params;

  if (inCollection) return null;
  if (state.step && state.step !== 'responded') return null;

  const lastAssistantRawForFee = lastAssistantDmContent(recentMessages);
  const classifierSignalsFeePricing = intentSignalsFeeOrPricing(intentResult, text);
  const classifierFeeThreadCont = classifierSignalsFeeThreadContinuation(
    intentResult,
    lastAssistantRawForFee
  );
  const signalsFeePricing =
    classifierSignalsFeePricing ||
    feeFollowUpAnaphora(text, lastAssistantRawForFee) ||
    classifierFeeThreadCont;
  const feeIdleRoutedByAnaphora =
    !classifierSignalsFeePricing &&
    (feeFollowUpAnaphora(text, lastAssistantRawForFee) || classifierFeeThreadCont);

  if (
    isRecentMedicalDeflectionWindow(state, nowMs) &&
    !state.reasonFirstTriagePhase &&
    !state.postMedicalConsultFeeAckSent &&
    (isVagueConsultationPaymentExistenceQuestion(text) ||
      classifierSignalsPaymentExistence(intentResult)) &&
    recentPatientThreadHasClinicalReason(
      recentMessages.map((m) => ({ sender_type: m.sender_type, content: m.content ?? '' }))
    )
  ) {
    return 'post_medical_payment_existence_ack';
  }

  if (state.reasonFirstTriagePhase) {
    if (userWantsExplicitFullFeeList(text)) {
      return feeIdleRoutedByAnaphora ? 'fee_follow_up_anaphora_idle' : 'fee_deterministic_idle';
    }

    if (state.reasonFirstTriagePhase === 'ask_more') {
      if (
        signalsFeePricing &&
        !userExplicitlyWantsToBookNow(text) &&
        !userSignalsReasonFirstWrapUp(text, intentResult)
      ) {
        return 'reason_first_triage_ask_more_payment_bridge';
      }
      return 'reason_first_triage_confirm';
    }

    if (state.reasonFirstTriagePhase === 'confirm') {
      if (signalsFeePricing && !userExplicitlyWantsToBookNow(text)) {
        return 'reason_first_triage_fee_narrow';
      }
      if (parseReasonTriageConfirmYes(text)) {
        return 'reason_first_triage_fee_narrow';
      }
      if (parseReasonTriageNegationForClarify(text)) {
        return 'reason_first_triage_confirm';
      }
      return 'reason_first_triage_confirm';
    }
  }

  if (intentResult.intent === 'medical_query') {
    return 'medical_safety';
  }

  return null;
}
