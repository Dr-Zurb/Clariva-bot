/**
 * rcp-08: Book-intent entry stage — channel pick, book-for-someone-else, collection start, book_responded.
 */

import { env } from '../../../config/env';
import {
  parseMultiPersonBooking,
  extractBookForSomeoneElseRelationKeyword,
  resolveBookingTargetRelationForDm,
  resolveVisitReasonSnippetForTriage,
} from '../../../services/ai-service';
import {
  clearCollectedData,
  getInitialCollectionStep,
  seedCollectedReasonFromStateIfValid,
} from '../../../services/collection-service';
import { findPatientByIdWithAdmin } from '../../../services/patient-service';
import { candidateLabelsForCatalog } from '../../../services/service-catalog-matcher';
import {
  applyReadyPatientBookingPath,
  hydrateCollectedFieldNamesFromProfile,
  isPatientReadyForSlotLink,
  isReturningPatientReadyToSkipCollection,
} from '../booking-entry-ready-path';
import { auditCollectionSkipped } from '../returning-patient-audit';
import type { PatientCollectionField } from '../../../utils/validation';
import {
  type ConsultationFeeAmbiguousStaffReview,
  isTeleconsultCatalogAuthoritative,
  userExplicitlyWantsToBookNow,
} from '../../../utils/consultation-fees';
import { buildIntakeRequestMessage } from '../../../utils/dm-copy';
import { composeIdleFeeQuoteDmWithMetaAsync } from '../../../utils/dm-reply-composer';
import { buildFeeCatalogMatchText } from '../../../utils/dm-turn-context';
import {
  bookingShouldDeferToReasonFirstTriage,
  formatReasonFirstGateBeforeIntake,
  formatReasonFirstFeePatienceBridgeWhileAskMore,
  shouldDeferIdleFeeForReasonFirstTriage,
} from '../../../utils/reason-first-triage';
import { getActiveServiceCatalog } from '../../../utils/service-catalog-helpers';
import {
  applyMatcherProposalToConversationState,
  mergeBooking,
  mergeBookingForOther,
  mergeServiceMatch,
  mergeTriage,
  setStage,
  type ConversationState,
} from '../../../types/conversation';
import type { DoctorSettingsRow } from '../../../types/doctor-settings';
import type { DmHandlerBranch } from '../../../types/dm-instrumentation';
import type { DmStageHandler, DmTurnContext, DmTurnResult } from '../stage-router';
import { isBookingEntryTurn } from './booking-entry-predicate';

function mergeFeeQuoteMatcherIntoState(
  state: ConversationState,
  fin: {
    matcherProposedCatalogServiceKey: string;
    matcherProposedCatalogServiceId: string;
    matcherProposedConsultationModality?: 'text' | 'voice' | 'video';
    serviceCatalogMatchConfidence: 'high' | 'medium' | 'low';
    serviceCatalogMatchReasonCodes: string[];
  }
): ConversationState {
  return applyMatcherProposalToConversationState(state, {
    matcherProposedCatalogServiceKey: fin.matcherProposedCatalogServiceKey,
    matcherProposedCatalogServiceId: fin.matcherProposedCatalogServiceId,
    matcherProposedConsultationModality: fin.matcherProposedConsultationModality,
    serviceCatalogMatchConfidence: fin.serviceCatalogMatchConfidence,
    serviceCatalogMatchReasonCodes: fin.serviceCatalogMatchReasonCodes,
    finalizeSelection: true,
    pendingStaffServiceReview: false,
  });
}

/** Competing NCD vs acute/general thread: staff assigns visit type; no patient-facing multi-tier fee menu. */
function mergeStateForFeeAmbiguousStaffReview(
  state: ConversationState,
  review: ConsultationFeeAmbiguousStaffReview,
  extra: Partial<ConversationState>,
  candidateLabels?: Array<{ service_key: string; label: string }>
): ConversationState {
  const merged = { ...state, ...extra };
  return mergeTriage(
    {
      ...applyMatcherProposalToConversationState(merged, {
        matcherProposedCatalogServiceKey: review.matcherProposedCatalogServiceKey,
        matcherProposedCatalogServiceId: review.matcherProposedCatalogServiceId,
        serviceCatalogMatchConfidence: review.serviceCatalogMatchConfidence,
        serviceCatalogMatchReasonCodes: review.serviceCatalogMatchReasonCodes,
        matcherCandidateLabels: candidateLabels,
        pendingStaffServiceReview: true,
        finalizeSelection: false,
      }),
      step: 'awaiting_staff_service_confirmation',
      updatedAt: new Date().toISOString(),
    },
    {
      activeFlow: undefined,
      reasonFirstTriagePhase: undefined,
      postMedicalConsultFeeAckSent: undefined,
    }
  );
}

/** Fee-deferral staff gate: full-catalog candidate slice for learn-05 pattern_key parity. */
function matcherCandidateLabelsForFeeStaffReview(
  doctorSettings: DoctorSettingsRow | null
): Array<{ service_key: string; label: string }> | undefined {
  const catalog = getActiveServiceCatalog(doctorSettings);
  if (!catalog?.services?.length) return undefined;
  return candidateLabelsForCatalog(catalog);
}

export const bookingEntryStage = {
  stage: 'booking_entry',
  async handle(ctx: DmTurnContext): Promise<DmTurnResult> {
    if (!isBookingEntryTurn(ctx)) {
      throw new Error('booking_entry stage invoked but predicate did not match');
    }

    const {
      conversation,
      doctorId,
      correlationId,
      text,
      recentMessages,
      intentResult,
      doctorSettings,
      doctorContext,
      isBookIntent,
      justStartingCollection,
      inCollection,
      signalsFeePricing,
      bookingFeeComposerOpts,
      teleconsultCatalogRowCount,
      channelReplyPick,
      runGenerateResponse,
      buildAiContextForResponse,
      fallbackReply,
      returningProfile,
    } = ctx;
    let state = ctx.state;
    let dmRoutingBranch: DmHandlerBranch = 'unknown';
    let replyText: string = fallbackReply;

    if (channelReplyPick) {
      dmRoutingBranch = 'consultation_channel_pick';
      const pick = channelReplyPick;
      const teleOnly = isTeleconsultCatalogAuthoritative({
        service_offerings_json: doctorSettings?.service_offerings_json ?? null,
        appointment_fee_currency: doctorSettings?.appointment_fee_currency ?? null,
      });
      if (teleOnly && pick === 'in_clinic') {
        replyText =
          "Right now we offer **teleconsult** only (text, voice, or video) — which works best for you?";
        state = {
          ...state,
          lastIntent: intentResult.intent,
          lastPromptKind: 'consultation_channel_pick',
          updatedAt: new Date().toISOString(),
        };
      } else {
        const nextModality: 'text' | 'voice' | 'video' | undefined =
          pick === 'in_clinic' ? undefined : pick;
        const hasMultipleModalities = teleOnly && teleconsultCatalogRowCount == null;
        const modalityForState = hasMultipleModalities ? undefined : nextModality;
        const recentChannel = recentMessages.map((m) => ({
          sender_type: m.sender_type,
          content: m.content ?? '',
        }));
        const deferIntakeForReasonFirst = bookingShouldDeferToReasonFirstTriage({
          state,
          text,
          recentMessages: recentChannel,
        });
        if (deferIntakeForReasonFirst) {
          dmRoutingBranch = 'consultation_channel_pick_reason_first';
          const snippet = await resolveVisitReasonSnippetForTriage(recentChannel, text, correlationId);
          replyText = formatReasonFirstGateBeforeIntake(text, snippet);
          state = mergeBooking(
            mergeTriage(
              mergeServiceMatch(
                setStage(
                  { ...state, lastIntent: intentResult.intent, updatedAt: new Date().toISOString() },
                  'responded'
                ),
                { consultationModality: modalityForState }
              ),
              { reasonFirstTriagePhase: 'ask_more' }
            ),
            { consultationType: pick }
          );
        } else {
          const nextStep =
            state.step === 'collecting_all' || state.step?.startsWith('collecting_')
              ? state.step!
              : 'collecting_all';
          state = mergeBooking(
            mergeServiceMatch(
              setStage(
                {
                  ...state,
                  collectedFields: state.collectedFields ?? [],
                  lastIntent: intentResult.intent,
                  updatedAt: new Date().toISOString(),
                },
                nextStep
              ),
              { consultationModality: modalityForState }
            ),
            { consultationType: pick }
          );
          const aiContext = await buildAiContextForResponse(
            conversation.id,
            state,
            recentMessages,
            correlationId,
            text,
            teleconsultCatalogRowCount
          );
          replyText = await runGenerateResponse({
            conversationId: conversation.id,
            currentIntent: 'book_appointment',
            state,
            recentMessages,
            currentUserMessage: text,
            correlationId,
            doctorContext,
            context: aiContext,
          });
        }
      }
    } else if (
      intentResult.intent === 'book_for_someone_else' &&
      (state.step === 'responded' || state.step === 'awaiting_slot_selection')
    ) {
      dmRoutingBranch = 'book_for_someone_else';
      const multiPerson = parseMultiPersonBooking(text);
      if (multiPerson) {
        await clearCollectedData(conversation.id);
        const relation = multiPerson.relation;
        state = mergeBookingForOther(
          mergeTriage(
            setStage(
              {
                ...state,
                lastIntent: intentResult.intent,
                collectedFields: [],
                updatedAt: new Date().toISOString(),
              },
              'collecting_all'
            ),
            {
              lastMedicalDeflectionAt: undefined,
              reasonFirstTriagePhase: undefined,
              postMedicalConsultFeeAckSent: undefined,
            }
          ),
          {
            bookingForSomeoneElse: true,
            relation,
            pendingSelfBooking: true,
            pendingOtherBooking: undefined,
            bookingForPatientId: undefined,
          }
        );
        replyText = buildIntakeRequestMessage({
          variant: 'initial',
          forRelation: relation,
          missing: ['name', 'age', 'phone', 'reason_for_visit'],
          intro: `I'll help you book for you and your **${relation}**. Let's take them one at a time — your **${relation}** first, then you. Please share their details:`,
        });
      } else {
        await clearCollectedData(conversation.id);
        const explicitSomeoneElse = /\bsomeone\s+else\b/i.test(text);
        let relation: string | null = explicitSomeoneElse
          ? 'them'
          : extractBookForSomeoneElseRelationKeyword(text);
        const needsLlmRelation =
          env.BOOKING_RELATION_LLM_ENABLED &&
          (relation == null || relation === 'them') &&
          !explicitSomeoneElse;
        if (needsLlmRelation) {
          const aiRel = await resolveBookingTargetRelationForDm(text, correlationId);
          if (aiRel) relation = aiRel;
        }
        if (relation == null) relation = 'them';
        state = mergeBookingForOther(
          mergeTriage(
            setStage(
              {
                ...state,
                lastIntent: intentResult.intent,
                collectedFields: [],
                updatedAt: new Date().toISOString(),
              },
              'collecting_all'
            ),
            {
              lastMedicalDeflectionAt: undefined,
              reasonFirstTriagePhase: undefined,
              postMedicalConsultFeeAckSent: undefined,
            }
          ),
          {
            bookingForSomeoneElse: true,
            relation,
            bookingForPatientId: undefined,
          }
        );
        replyText = buildIntakeRequestMessage({
          variant: 'initial',
          forRelation: relation === 'them' ? undefined : relation,
          missing: ['name', 'age', 'phone', 'reason_for_visit'],
          intro:
            relation === 'them'
              ? "I'll help you book for **them**. Please share their details:"
              : undefined,
        });
      }
    } else if (isBookIntent && (justStartingCollection || inCollection)) {
      dmRoutingBranch = justStartingCollection ? 'booking_start_ai' : 'booking_continue_ai';
      if (justStartingCollection) {
        const recentStart = recentMessages.map((m) => ({
          sender_type: m.sender_type,
          content: m.content ?? '',
        }));
        if (
          bookingShouldDeferToReasonFirstTriage({
            state,
            text,
            recentMessages: recentStart,
          })
        ) {
          dmRoutingBranch = 'booking_start_reason_first';
          const snippetStart = await resolveVisitReasonSnippetForTriage(recentStart, text, correlationId);
          replyText = formatReasonFirstGateBeforeIntake(text, snippetStart);
          state = mergeTriage(
            {
              ...state,
              lastIntent: intentResult.intent,
              step: 'responded',
              updatedAt: new Date().toISOString(),
            },
            { reasonFirstTriagePhase: 'ask_more' }
          );
        } else {
          const patient =
            conversation.patient_id != null
              ? await findPatientByIdWithAdmin(conversation.patient_id, correlationId)
              : null;
          const returningReady = isReturningPatientReadyToSkipCollection(returningProfile, patient);

          if (returningReady && returningProfile) {
            const reasonSeedFields = await seedCollectedReasonFromStateIfValid(
              conversation.id,
              state.booking?.reasonForVisit
            );
            const collectedFieldNames = hydrateCollectedFieldNamesFromProfile(
              returningProfile,
              reasonSeedFields
            );
            const hasReason = collectedFieldNames.includes('reason_for_visit');

            if (conversation.patient_id) {
              const skippedKeys = collectedFieldNames.filter(
                (f): f is PatientCollectionField => f !== 'reason_for_visit'
              );
              await auditCollectionSkipped(
                correlationId,
                doctorId,
                conversation.patient_id,
                skippedKeys
              );
            }

            if (hasReason) {
              dmRoutingBranch = 'booking_start_returning_ready';
              const ready = applyReadyPatientBookingPath({
                state: mergeTriage(
                  {
                    ...state,
                    collectedFields: collectedFieldNames,
                    lastIntent: intentResult.intent,
                    updatedAt: new Date().toISOString(),
                  },
                  {
                    lastMedicalDeflectionAt: undefined,
                    reasonFirstTriagePhase: undefined,
                    postMedicalConsultFeeAckSent: undefined,
                  }
                ),
                intent: intentResult.intent,
                conversationId: conversation.id,
                doctorId,
                doctorSettings,
                patient,
              });
              state = ready.state;
              replyText = ready.replyText;
            } else {
              dmRoutingBranch = 'booking_start_returning_reason';
              state = mergeTriage(
                {
                  ...state,
                  lastIntent: intentResult.intent,
                  step: getInitialCollectionStep(),
                  collectedFields: collectedFieldNames,
                  updatedAt: new Date().toISOString(),
                },
                {
                  lastMedicalDeflectionAt: undefined,
                  reasonFirstTriagePhase: undefined,
                  postMedicalConsultFeeAckSent: undefined,
                }
              );
              const practiceName = doctorContext?.practice_name?.trim() || 'the clinic';
              replyText = buildIntakeRequestMessage({
                variant: 'initial',
                practiceName,
                alreadyHaveReason: false,
                missing: ['reason_for_visit'],
              });
            }
          } else {
          const reasonSeedFields = await seedCollectedReasonFromStateIfValid(
            conversation.id,
            state.booking?.reasonForVisit
          );
          state = mergeTriage(
            {
              ...state,
              lastIntent: intentResult.intent,
              step: getInitialCollectionStep(),
              collectedFields: reasonSeedFields,
              updatedAt: new Date().toISOString(),
            },
            {
              lastMedicalDeflectionAt: undefined,
              reasonFirstTriagePhase: undefined,
              postMedicalConsultFeeAckSent: undefined,
            }
          );
          const aiContext = await buildAiContextForResponse(
            conversation.id,
            state,
            recentMessages,
            correlationId,
            text,
            teleconsultCatalogRowCount
          );
          replyText = await runGenerateResponse({
            conversationId: conversation.id,
            currentIntent: intentResult.intent,
            state,
            recentMessages,
            currentUserMessage: text,
            correlationId,
            doctorContext,
            context: aiContext,
          });
          }
        }
      } else {
        const aiContext = await buildAiContextForResponse(
          conversation.id,
          state,
          recentMessages,
          correlationId,
          text,
          teleconsultCatalogRowCount
        );
        replyText = await runGenerateResponse({
          conversationId: conversation.id,
          currentIntent: intentResult.intent,
          state,
          recentMessages,
          currentUserMessage: text,
          correlationId,
          doctorContext,
          context: aiContext,
        });
      }
    } else if (isBookIntent && state.step === 'responded') {
      dmRoutingBranch = 'book_responded';
      const patient = await findPatientByIdWithAdmin(conversation.patient_id, correlationId);
      const hasPatientReady = isPatientReadyForSlotLink(patient);
      const explicitBook = userExplicitlyWantsToBookNow(text);
      const pricingOnly = signalsFeePricing && !explicitBook;

      if (!hasPatientReady && pricingOnly) {
        const recentBookIdle = recentMessages.map((m) => ({
          sender_type: m.sender_type,
          content: m.content ?? '',
        }));
        const deferBookPricing = shouldDeferIdleFeeForReasonFirstTriage({
          state,
          text,
          recentMessages: recentBookIdle,
        });
        if (deferBookPricing) {
          dmRoutingBranch = 'reason_first_triage_ask_more';
          const snippetBookIdle = await resolveVisitReasonSnippetForTriage(
            recentBookIdle,
            text,
            correlationId
          );
          replyText = formatReasonFirstFeePatienceBridgeWhileAskMore(text, {
            reasonSnippet: snippetBookIdle.trim(),
            recentPostMedicalFeeAck: state.triage?.postMedicalConsultFeeAckSent === true,
          });
          state = mergeTriage(
            {
              ...state,
              lastIntent: intentResult.intent,
              step: 'responded',
              updatedAt: new Date().toISOString(),
            },
            { reasonFirstTriagePhase: 'ask_more' }
          );
        } else {
          const feeThreadBook = buildFeeCatalogMatchText(text, recentMessages);
          const bookIdleFeeOut = await composeIdleFeeQuoteDmWithMetaAsync(doctorSettings, text, {
            catalogMatchText: feeThreadBook,
            ...bookingFeeComposerOpts,
          });
          replyText = bookIdleFeeOut.reply;
          if (bookIdleFeeOut.feeAmbiguousStaffReview) {
            state = mergeStateForFeeAmbiguousStaffReview(
              state,
              bookIdleFeeOut.feeAmbiguousStaffReview,
              {
                lastIntent: intentResult.intent,
              },
              matcherCandidateLabelsForFeeStaffReview(doctorSettings)
            );
            dmRoutingBranch = 'fee_ambiguous_visit_type_staff';
          } else {
            state = mergeTriage(
              {
                ...state,
                lastIntent: intentResult.intent,
                step: 'responded',
                updatedAt: new Date().toISOString(),
              },
              { activeFlow: 'fee_quote' }
            );
            if (bookIdleFeeOut.feeQuoteMatcherFinalize) {
              state = mergeFeeQuoteMatcherIntoState(state, bookIdleFeeOut.feeQuoteMatcherFinalize);
            }
          }
        }
      } else if (hasPatientReady) {
        dmRoutingBranch = 'book_responded';
        const ready = applyReadyPatientBookingPath({
          state,
          intent: intentResult.intent,
          conversationId: conversation.id,
          doctorId,
          doctorSettings,
          patient,
        });
        state = ready.state;
        replyText = ready.replyText;
      } else {
        const recentBookResp = recentMessages.map((m) => ({
          sender_type: m.sender_type,
          content: m.content ?? '',
        }));
        if (
          bookingShouldDeferToReasonFirstTriage({
            state,
            text,
            recentMessages: recentBookResp,
          })
        ) {
          dmRoutingBranch = 'book_responded_reason_first';
          const snippetBook = await resolveVisitReasonSnippetForTriage(
            recentBookResp,
            text,
            correlationId
          );
          replyText = formatReasonFirstGateBeforeIntake(text, snippetBook);
          state = mergeTriage(
            {
              ...state,
              lastIntent: intentResult.intent,
              step: 'responded',
              updatedAt: new Date().toISOString(),
            },
            { reasonFirstTriagePhase: 'ask_more' }
          );
        } else {
          const reasonSeedBook = await seedCollectedReasonFromStateIfValid(
            conversation.id,
            state.booking?.reasonForVisit
          );
          state = mergeTriage(
            {
              ...state,
              lastIntent: intentResult.intent,
              step: getInitialCollectionStep(),
              collectedFields: reasonSeedBook,
              updatedAt: new Date().toISOString(),
            },
            {
              activeFlow: undefined,
              lastMedicalDeflectionAt: undefined,
              reasonFirstTriagePhase: undefined,
              postMedicalConsultFeeAckSent: undefined,
            }
          );
          const practiceName = doctorContext?.practice_name?.trim() || 'the clinic';
          replyText = buildIntakeRequestMessage({
            variant: 'initial',
            practiceName,
            alreadyHaveReason: reasonSeedBook.length > 0,
            missing: ['name', 'age', 'gender', 'phone', 'reason_for_visit'],
          });
        }
      }
    }

    return { branch: dmRoutingBranch, reply: replyText, nextState: state };
  },
} as DmStageHandler;
