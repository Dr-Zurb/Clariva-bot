/**
 * rcp-06: Service-match / staff-review / clarification stage — extracted from legacy decide-chain.
 */

import { logger } from '../../../config/logger';
import {
  getCollectedData,
  clearCollectedData,
  tryRecoverAndSetFromMessages,
} from '../../../services/collection-service';
import { createPatientForBooking } from '../../../services/patient-service';
import { buildBookingPageUrl } from '../../../services/slot-selection-service';
import {
  matchServiceCatalogOffering,
  type ServiceCatalogMatchResult,
} from '../../../services/service-catalog-matcher';
import { formatBookingLinkDm } from '../../../utils/booking-link-copy';
import {
  COMPLAINT_CLARIFICATION_MAX_ATTEMPTS,
  resolveClarificationNumericReply,
} from '../../../utils/complaint-clarification';
import { buildConsentOptionalExtrasMessage, buildIntakeRequestMessage } from '../../../utils/dm-copy';
import { effectiveAskedForMatch } from '../../../utils/dm-prompt-context';
import { getActiveServiceCatalog } from '../../../utils/service-catalog-helpers';
import {
  formatAwaitingStaffServiceConfirmationDm,
  formatStaffServiceReviewStillPendingDm,
} from '../../../utils/staff-service-review-dm';
import {
  applyMatcherProposalToConversationState,
  CLARIFICATION_LEGACY_FIELD_NAMES,
  isSlotBookingBlockedPendingStaffReview,
  mergeBooking,
  mergeBookingForOther,
  mergeClarification,
  mergeServiceMatch,
  mergeTriage,
  setStage,
  SERVICE_CATALOG_MATCH_REASON_CODES,
  SERVICE_MATCH_LEGACY_FIELD_NAMES,
  TRIAGE_LEGACY_FIELD_NAMES,
  type ClarificationState,
  type ConversationState,
  type ServiceMatchState,
  type TriageState,
} from '../../../types/conversation';
import type { DoctorSettingsRow } from '../../../types/doctor-settings';
import type { DmHandlerBranch } from '../../../types/dm-instrumentation';
import type { Message } from '../../../types';
import type { DmStageHandler, DmTurnContext, DmTurnResult } from '../stage-router';
import {
  applyReturningFollowUpAcceptance,
  clearReturningFollowUpProposal,
  parseReturningFollowUpReply,
  transitionToConsentAfterFollowUpAccept,
} from '../returning-followup-offer';
import { isServiceMatchTurn } from './service-match-predicate';

async function enrichStateWithServiceCatalogMatch(
  baseState: ConversationState,
  doctorSettings: DoctorSettingsRow | null,
  reasonForVisit: string | null | undefined,
  recentMessages: Message[],
  correlationId: string
): Promise<{ state: ConversationState; match: ServiceCatalogMatchResult | null }> {
  const trimmed = reasonForVisit?.trim();
  if (!trimmed) {
    return { state: baseState, match: null };
  }
  if (!doctorSettings) {
    return { state: baseState, match: null };
  }
  const catalog = getActiveServiceCatalog(doctorSettings);
  if (!catalog?.services.length) {
    return { state: baseState, match: null };
  }
  const recentPatient = recentMessages
    .filter((m) => m.sender_type === 'patient')
    .slice(-5)
    .map((m) => m.content ?? '');

  const match = await matchServiceCatalogOffering({
    catalog,
    reasonForVisitText: trimmed,
    recentUserMessages: recentPatient,
    correlationId,
    doctorProfile: {
      practiceName: doctorSettings.practice_name,
      specialty: doctorSettings.specialty,
    },
    catalogMode: doctorSettings.catalog_mode,
    doctorId: doctorSettings.doctor_id,
  });

  if (!match) {
    return { state: baseState, match: null };
  }

  logger.info(
    {
      correlationId,
      serviceCatalogMatchSource: match.source,
      serviceCatalogMatchConfidence: match.confidence,
      catalogServiceKey: match.catalogServiceKey,
      pendingStaffReview: match.pendingStaffReview,
      mixedComplaints: match.mixedComplaints,
    },
    'instagram_dm_service_catalog_match'
  );

  const enriched = applyMatcherProposalToConversationState(baseState, {
    matcherProposedCatalogServiceKey: match.catalogServiceKey,
    matcherProposedCatalogServiceId: match.catalogServiceId,
    matcherProposedConsultationModality: match.suggestedModality,
    serviceCatalogMatchConfidence: match.confidence,
    serviceCatalogMatchReasonCodes: match.reasonCodes,
    matcherCandidateLabels: match.candidateLabels,
    pendingStaffServiceReview: match.pendingStaffReview,
    finalizeSelection: match.autoFinalize,
  });

  return { state: enriched, match };
}

function splitServiceMatchPatch(
  patch: Partial<ConversationState> &
    Partial<ServiceMatchState> &
    Partial<ClarificationState> &
    Partial<TriageState>
): {
  statePatch: Partial<ConversationState>;
  serviceMatchPatch: Partial<ServiceMatchState>;
  clarificationPatch: Partial<ClarificationState>;
  triagePatch: Partial<TriageState>;
} {
  const statePatch: Partial<ConversationState> = {};
  const serviceMatchPatch: Partial<ServiceMatchState> = {};
  const clarificationPatch: Partial<ClarificationState> = {};
  const triagePatch: Partial<TriageState> = {};
  for (const [key, value] of Object.entries(patch)) {
    if ((SERVICE_MATCH_LEGACY_FIELD_NAMES as readonly string[]).includes(key)) {
      (serviceMatchPatch as Record<string, unknown>)[key] = value;
    } else if ((CLARIFICATION_LEGACY_FIELD_NAMES as readonly string[]).includes(key)) {
      (clarificationPatch as Record<string, unknown>)[key] = value;
    } else if ((TRIAGE_LEGACY_FIELD_NAMES as readonly string[]).includes(key)) {
      (triagePatch as Record<string, unknown>)[key] = value;
    } else {
      (statePatch as Record<string, unknown>)[key] = value;
    }
  }
  return { statePatch, serviceMatchPatch, clarificationPatch, triagePatch };
}

function transitionToAwaitingStaffServiceConfirmation(
  base: ConversationState,
  doctorSettings: DoctorSettingsRow | null,
  intent: ConversationState['lastIntent'],
  patch: Partial<ConversationState> &
    Partial<ServiceMatchState> &
    Partial<ClarificationState> &
    Partial<TriageState>
): { state: ConversationState; replyText: string } {
  const { statePatch, serviceMatchPatch, clarificationPatch, triagePatch } =
    splitServiceMatchPatch(patch);
  let merged = mergeServiceMatch(
    {
      ...base,
      ...statePatch,
      lastIntent: intent,
      step: 'awaiting_staff_service_confirmation',
      updatedAt: new Date().toISOString(),
    },
    serviceMatchPatch
  );
  if (Object.keys(clarificationPatch).length > 0) {
    merged = mergeClarification(merged, clarificationPatch);
  }
  if (Object.keys(triagePatch).length > 0) {
    merged = mergeTriage(merged, triagePatch);
  }
  return {
    state: merged,
    replyText: formatAwaitingStaffServiceConfirmationDm(doctorSettings, merged),
  };
}

function parseMatchConfirmationReply(
  text: string,
  matchCount: number
): 'yes' | 'no' | '1' | '2' | 'unclear' {
  const t = text.trim().toLowerCase();
  if (/^(yes|yeah|yep|ok|okay|sure|correct)$/.test(t)) return 'yes';
  if (/^(no|nope|new|different)$/.test(t)) return 'no';
  if (matchCount >= 1 && /^1$/.test(t)) return '1';
  if (matchCount >= 2 && /^2$/.test(t)) return '2';
  return 'unclear';
}

function formatPatientIdHint(_mrn?: string | null): string {
  return '';
}

async function getPatientIdHintForSlot(
  _patientId: string | undefined,
  _correlationId: string
): Promise<string> {
  return '';
}

export const serviceMatchStage: DmStageHandler = {
  stage: 'service_match',
  async handle(ctx: DmTurnContext): Promise<DmTurnResult> {
    if (!isServiceMatchTurn(ctx)) {
      throw new Error('service_match stage invoked but predicate did not match');
    }

    const {
      conversation,
      doctorId,
      correlationId,
      text,
      recentMessages,
      intentResult,
      doctorSettings,
      fallbackReply,
    } = ctx;
    let state = ctx.state;
    let dmRoutingBranch: DmHandlerBranch = 'unknown';
    let replyText: string = fallbackReply;

    if (state.step === 'awaiting_staff_service_confirmation') {
      dmRoutingBranch = 'staff_service_review_pending';
      replyText = formatStaffServiceReviewStillPendingDm(doctorSettings);
      state = { ...state, updatedAt: new Date().toISOString() };
    } else if (state.step === 'awaiting_followup_service_confirmation') {
      const recalledKey = state.serviceMatch?.matcherProposedCatalogServiceKey?.trim();
      const parsed = parseReturningFollowUpReply(text);

      if (parsed === 'yes' && recalledKey) {
        dmRoutingBranch = 'returning_followup_confirm_accept';
        let next = applyReturningFollowUpAcceptance(state, doctorSettings, recalledKey);
        if (isSlotBookingBlockedPendingStaffReview(next)) {
          const gate = transitionToAwaitingStaffServiceConfirmation(
            next,
            doctorSettings,
            intentResult.intent,
            {}
          );
          state = gate.state;
          replyText = gate.replyText;
        } else {
          const collected = await getCollectedData(conversation.id);
          const name = collected?.name?.trim() || 'there';
          const phone = collected?.phone?.trim() || '';
          const phoneDisplay = phone ? `**${phone}**` : 'your number';
          state = transitionToConsentAfterFollowUpAccept(next, intentResult.intent);
          const resolvedName = collected?.name?.trim() || undefined;
          replyText = buildConsentOptionalExtrasMessage({
            patientName: state.bookingForOther?.bookingForSomeoneElse ? undefined : resolvedName,
            phoneDisplay,
            bookingForSomeoneElse: !!state.bookingForOther?.bookingForSomeoneElse,
            bookingForName: state.bookingForOther?.bookingForSomeoneElse
              ? resolvedName ?? name
              : undefined,
          });
        }
      } else if (parsed === 'no') {
        dmRoutingBranch = 'returning_followup_confirm_decline';
        const reason =
          state.booking?.reasonForVisit ??
          (await getCollectedData(conversation.id))?.reason_for_visit;
        let cleared = clearReturningFollowUpProposal({
          ...state,
          lastIntent: intentResult.intent,
          updatedAt: new Date().toISOString(),
        });
        const enriched = await enrichStateWithServiceCatalogMatch(
          cleared,
          doctorSettings,
          reason,
          recentMessages,
          correlationId
        );
        cleared = enriched.state;
        if (isSlotBookingBlockedPendingStaffReview(cleared)) {
          const gate = transitionToAwaitingStaffServiceConfirmation(
            cleared,
            doctorSettings,
            intentResult.intent,
            {}
          );
          state = gate.state;
          replyText = gate.replyText;
        } else {
          const collected = await getCollectedData(conversation.id);
          const name = collected?.name?.trim() || 'there';
          const phone = collected?.phone?.trim() || '';
          const phoneDisplay = phone ? `**${phone}**` : 'your number';
          const now = new Date().toISOString();
          state = mergeBooking(
            setStage(
              {
                ...cleared,
                lastIntent: intentResult.intent,
                updatedAt: now,
                ...(cleared.bookingForOther?.bookingForSomeoneElse
                  ? {}
                  : { lastPromptKind: 'consent_optional_extras' as const }),
              },
              'consent'
            ),
            {
              consent_requested_at: now,
              reasonForVisit: typeof reason === 'string' ? reason : collected?.reason_for_visit,
              age: collected?.age,
            }
          );
          const resolvedName = collected?.name?.trim() || undefined;
          replyText = buildConsentOptionalExtrasMessage({
            patientName: state.bookingForOther?.bookingForSomeoneElse ? undefined : resolvedName,
            phoneDisplay,
            bookingForSomeoneElse: !!state.bookingForOther?.bookingForSomeoneElse,
            bookingForName: state.bookingForOther?.bookingForSomeoneElse
              ? resolvedName ?? name
              : undefined,
          });
        }
      } else {
        dmRoutingBranch = 'returning_followup_confirm_reply';
        replyText = 'Please reply **Yes** or **No** — is this visit a follow-up for the same service?';
        state = { ...state, updatedAt: new Date().toISOString() };
      }
    } else if (state.step === 'awaiting_complaint_clarification') {
      dmRoutingBranch = 'complaint_clarification_reply';
      const prevAttempts = state.clarification?.complaintClarificationAttemptCount ?? 0;
      const nextAttempts = prevAttempts + 1;
      const capReached = prevAttempts >= COMPLAINT_CLARIFICATION_MAX_ATTEMPTS;

      if (capReached) {
        const gate = transitionToAwaitingStaffServiceConfirmation(
          state,
          doctorSettings,
          intentResult.intent,
          {
            pendingStaffServiceReview: true,
            complaintClarificationAttemptCount: nextAttempts,
            pendingClarificationConcerns: undefined,
            serviceCatalogMatchReasonCodes: [
              ...new Set([
                ...(state.serviceMatch?.serviceCatalogMatchReasonCodes ?? []),
                SERVICE_CATALOG_MATCH_REASON_CODES.MIXED_COMPLAINTS_CLARIFICATION_EXHAUSTED,
              ]),
            ],
          }
        );
        state = gate.state;
        replyText = gate.replyText;
      } else {
        const rawReply = text.trim();
        const mappedConcern = resolveClarificationNumericReply(
          rawReply,
          state.clarification?.pendingClarificationConcerns,
        );
        const narrowedReason = mappedConcern ?? rawReply;
        if (mappedConcern !== null) {
          logger.info(
            {
              correlationId,
              conversationStep: 'awaiting_complaint_clarification',
              clarificationReplyShape: 'numeric',
            },
            'instagram_dm_mixed_complaints_clarification_numeric_reply',
          );
        }
        const reRun = await enrichStateWithServiceCatalogMatch(
          state,
          doctorSettings,
          narrowedReason || state.clarification?.originalReasonForVisit || state.booking?.reasonForVisit,
          recentMessages,
          correlationId
        );
        state = mergeClarification(reRun.state, {
          complaintClarificationAttemptCount: nextAttempts,
          pendingClarificationConcerns: undefined,
        });
        const reMatch = reRun.match;

        if (reMatch && reMatch.autoFinalize && !reMatch.pendingStaffReview) {
          const now = new Date().toISOString();
          const collected = await getCollectedData(conversation.id);
          const name = collected?.name?.trim() || 'there';
          const phone = collected?.phone?.trim() || '';
          const phoneDisplay = phone ? `**${phone}**` : 'your number';
          state = mergeBooking(
            setStage(
              {
                ...state,
                lastIntent: intentResult.intent,
                updatedAt: now,
                lastPromptKind: state.bookingForOther?.bookingForSomeoneElse
                  ? undefined
                  : ('consent_optional_extras' as const),
              },
              'consent'
            ),
            { consent_requested_at: now }
          );
          {
            const resolvedName = collected?.name?.trim() || undefined;
            replyText = buildConsentOptionalExtrasMessage({
              patientName: state.bookingForOther?.bookingForSomeoneElse ? undefined : resolvedName,
              phoneDisplay,
              bookingForSomeoneElse: !!state.bookingForOther?.bookingForSomeoneElse,
              bookingForName: state.bookingForOther?.bookingForSomeoneElse ? resolvedName ?? name : undefined,
            });
          }
        } else {
          const gate = transitionToAwaitingStaffServiceConfirmation(
            state,
            doctorSettings,
            intentResult.intent,
            {
              pendingStaffServiceReview: true,
              serviceCatalogMatchReasonCodes: [
                ...new Set([
                  ...(state.serviceMatch?.serviceCatalogMatchReasonCodes ?? []),
                  SERVICE_CATALOG_MATCH_REASON_CODES.MIXED_COMPLAINTS_CLARIFICATION_REQUESTED,
                ]),
              ],
            }
          );
          state = gate.state;
          replyText = gate.replyText;
        }
      }
    } else if (
      state.step === 'awaiting_match_confirmation' ||
      (effectiveAskedForMatch(state, recentMessages) && state.bookingForOther?.pendingMatchPatientIds?.length)
    ) {
      dmRoutingBranch = 'patient_match_confirmation';
      const matchIds = state.bookingForOther?.pendingMatchPatientIds ?? [];
      const matchCount = matchIds.length;
      const parsed = parseMatchConfirmationReply(text, matchCount);
      const useExisting = parsed === 'yes' || parsed === '1';
      const useSecond = parsed === '2' && matchCount >= 2;
      const createNew = parsed === 'no' || parsed === 'unclear';

      if (useExisting || useSecond) {
        const chosenId = useSecond ? matchIds[1]! : matchIds[0]!;
        await clearCollectedData(conversation.id);
        const shared: ConversationState = mergeBookingForOther(
          { ...state, lastIntent: intentResult.intent, updatedAt: new Date().toISOString() },
          {
            bookingForPatientId: chosenId,
            bookingForSomeoneElse: false,
            pendingMatchPatientIds: undefined,
          }
        );
        if (isSlotBookingBlockedPendingStaffReview(shared)) {
          const gate = transitionToAwaitingStaffServiceConfirmation(
            shared,
            doctorSettings,
            intentResult.intent,
            {}
          );
          state = gate.state;
          replyText = gate.replyText;
        } else {
          const slotLink = buildBookingPageUrl(conversation.id, doctorId);
          const mrnHint = await getPatientIdHintForSlot(chosenId, correlationId);
          const baseSlotMsg = formatBookingLinkDm(slotLink, mrnHint, doctorSettings);
          replyText = shared.bookingForOther?.pendingSelfBooking
            ? `${baseSlotMsg}\n\nWould you like to book one for yourself now?`
            : baseSlotMsg;
          state = setStage(shared, 'awaiting_slot_selection');
        }
      } else if (createNew) {
        let collectedBeforePersist = await getCollectedData(conversation.id);
        if (!collectedBeforePersist?.name?.trim() || !collectedBeforePersist?.phone?.trim()) {
          const recovered = await tryRecoverAndSetFromMessages(
            conversation.id,
            recentMessages,
            correlationId
          );
          if (recovered) collectedBeforePersist = await getCollectedData(conversation.id);
        }
        if (!collectedBeforePersist?.name?.trim() || !collectedBeforePersist?.phone?.trim()) {
          replyText = buildIntakeRequestMessage({
            variant: 'retry-not-received',
            missing: ['name', 'age', 'phone', 'reason_for_visit'],
          });
          state = { ...state, updatedAt: new Date().toISOString() };
        } else {
          const newPatient = await createPatientForBooking(
            doctorId,
            {
              name: collectedBeforePersist.name.trim(),
              phone: collectedBeforePersist.phone.trim(),
              age: collectedBeforePersist.age,
              gender: collectedBeforePersist.gender,
              email: collectedBeforePersist.email,
            },
            correlationId
          );
          await clearCollectedData(conversation.id);
          const shared: ConversationState = mergeBookingForOther(
            mergeBooking(
              { ...state, lastIntent: intentResult.intent, updatedAt: new Date().toISOString() },
              {
                reasonForVisit:
                  state.booking?.reasonForVisit ?? collectedBeforePersist.reason_for_visit,
              }
            ),
            {
              bookingForPatientId: newPatient.id,
              bookingForSomeoneElse: false,
              pendingMatchPatientIds: undefined,
            }
          );
          if (isSlotBookingBlockedPendingStaffReview(shared)) {
            const gate = transitionToAwaitingStaffServiceConfirmation(
              shared,
              doctorSettings,
              intentResult.intent,
              {}
            );
            state = gate.state;
            replyText = gate.replyText;
          } else {
            const slotLink = buildBookingPageUrl(conversation.id, doctorId);
            const mrnHint = formatPatientIdHint(newPatient.medical_record_number);
            const baseSlotMsg = formatBookingLinkDm(slotLink, mrnHint, doctorSettings);
            replyText = shared.bookingForOther?.pendingSelfBooking
              ? `${baseSlotMsg}\n\nWould you like to book one for yourself now?`
              : baseSlotMsg;
            state = setStage(shared, 'awaiting_slot_selection');
          }
        }
      } else {
        replyText =
          "Please reply Yes to use the existing record, or No to create a new patient. Reply 1 or 2 if we found multiple matches.";
        state = { ...state, updatedAt: new Date().toISOString() };
      }
    }

    return { branch: dmRoutingBranch, reply: replyText, nextState: state };
  },
};
