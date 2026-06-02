/**
 * rcp-23: Returning-patient follow-up service recall — confirm before finalize (DL-4).
 */

import {
  applyFinalCatalogServiceSelection,
  mergeBooking,
  mergeServiceMatch,
  setStage,
  SERVICE_CATALOG_MATCH_REASON_CODES,
  type ConversationState,
} from '../../types/conversation';
import type { DoctorSettingsRow } from '../../types/doctor-settings';
import type { ReturningPatientProfile } from '../../types/returning-patient';
import {
  findServiceOfferingByKey,
  getActiveServiceCatalog,
} from '../../utils/service-catalog-helpers';
import type { ServiceOfferingV1 } from '../../utils/service-catalog-schema';
import { env } from '../../config/env';

function shouldUseReturningPatientMemory(
  profile: ReturningPatientProfile | undefined
): profile is ReturningPatientProfile {
  return (
    env.RETURNING_PATIENT_MEMORY_ENABLED === true &&
    profile?.isReturning === true &&
    profile.hasGrantedConsent === true
  );
}

export function parseReturningFollowUpReply(text: string): 'yes' | 'no' | 'unclear' {
  const t = text.trim().toLowerCase();
  if (/^(yes|yeah|yep|ok|okay|sure|correct|y)$/.test(t)) return 'yes';
  if (/^(no|nope|new|different|n)$/.test(t)) return 'no';
  return 'unclear';
}

export function resolveReturningFollowUpCatalogOffering(
  doctorSettings: DoctorSettingsRow | null,
  lastServiceKey: string | undefined
): ServiceOfferingV1 | undefined {
  const key = lastServiceKey?.trim();
  if (!key) return undefined;
  const catalog = getActiveServiceCatalog(doctorSettings);
  if (!catalog?.services.length) return undefined;
  return findServiceOfferingByKey(catalog, key);
}

export function hasServiceAlreadySpecified(state: ConversationState): boolean {
  const sm = state.serviceMatch;
  return (
    sm?.serviceSelectionFinalized === true ||
    Boolean(sm?.catalogServiceKey?.trim()) ||
    Boolean(sm?.matcherProposedCatalogServiceKey?.trim() && sm?.pendingStaffServiceReview === true)
  );
}

export function canOfferReturningFollowUpService(
  profile: ReturningPatientProfile | undefined,
  state: ConversationState,
  doctorSettings: DoctorSettingsRow | null
): profile is ReturningPatientProfile {
  if (!shouldUseReturningPatientMemory(profile)) return false;
  if (!profile.priorVisits.lastServiceKey?.trim()) return false;
  if (hasServiceAlreadySpecified(state)) return false;
  if (state.bookingForOther?.bookingForSomeoneElse) return false;
  return resolveReturningFollowUpCatalogOffering(doctorSettings, profile.priorVisits.lastServiceKey) != null;
}

export function formatReturningFollowUpConfirmMessage(serviceLabel: string): string {
  return `Is this a **follow-up** for **${serviceLabel}**? Reply **Yes** or **No**.`;
}

export interface ReturningFollowUpOfferResult {
  state: ConversationState;
  replyText: string;
  recalledServiceKey: string;
  serviceLabel: string;
}

/** Offer follow-up confirm — stores recalled key as proposal pending patient answer. */
export function buildReturningFollowUpOffer(
  state: ConversationState,
  profile: ReturningPatientProfile,
  doctorSettings: DoctorSettingsRow | null,
  intent: ConversationState['lastIntent']
): ReturningFollowUpOfferResult | null {
  const offering = resolveReturningFollowUpCatalogOffering(
    doctorSettings,
    profile.priorVisits.lastServiceKey
  );
  if (!offering) return null;

  const recalledServiceKey = offering.service_key;
  const serviceLabel = offering.label.trim() || recalledServiceKey;
  const nextState = mergeServiceMatch(
    setStage(
      {
        ...state,
        lastIntent: intent,
        lastPromptKind: 'returning_followup_confirm',
        updatedAt: new Date().toISOString(),
      },
      'awaiting_followup_service_confirmation'
    ),
    {
      matcherProposedCatalogServiceKey: recalledServiceKey,
      matcherProposedCatalogServiceId: offering.service_id,
      serviceCatalogMatchConfidence: 'medium',
      serviceCatalogMatchReasonCodes: [
        SERVICE_CATALOG_MATCH_REASON_CODES.RETURNING_FOLLOWUP_OFFERED,
      ],
      pendingStaffServiceReview: false,
    }
  );

  return {
    state: nextState,
    replyText: formatReturningFollowUpConfirmMessage(serviceLabel),
    recalledServiceKey,
    serviceLabel,
  };
}

function defaultModalityForOffering(
  offering: ServiceOfferingV1
): 'text' | 'voice' | 'video' | undefined {
  const enabled = (['text', 'voice', 'video'] as const).filter(
    (m) => offering.modalities[m]?.enabled === true
  );
  return enabled.length === 1 ? enabled[0] : undefined;
}

/** Patient confirmed follow-up — finalize via centralized helper (same path as staff confirm). */
export function applyReturningFollowUpAcceptance(
  state: ConversationState,
  doctorSettings: DoctorSettingsRow | null,
  recalledServiceKey: string
): ConversationState {
  const offering = resolveReturningFollowUpCatalogOffering(doctorSettings, recalledServiceKey);
  if (!offering) return state;

  return applyFinalCatalogServiceSelection(state, {
    catalogServiceKey: offering.service_key,
    catalogServiceId: offering.service_id,
    consultationModality: defaultModalityForOffering(offering),
    clearProposal: true,
    reasonCodesAppend: [SERVICE_CATALOG_MATCH_REASON_CODES.RETURNING_FOLLOWUP_CONFIRMED],
  });
}

/** Patient declined — clear recall proposal so normal matcher runs unchanged. */
export function clearReturningFollowUpProposal(state: ConversationState): ConversationState {
  return mergeServiceMatch(state, {
    matcherProposedCatalogServiceKey: undefined,
    matcherProposedCatalogServiceId: undefined,
    matcherProposedConsultationModality: undefined,
    serviceCatalogMatchConfidence: undefined,
    serviceCatalogMatchReasonCodes: undefined,
    pendingStaffServiceReview: undefined,
  });
}

/** After accept, advance to consent when demographics are ready (mirrors auto-finalize match path). */
export function transitionToConsentAfterFollowUpAccept(
  state: ConversationState,
  intent: ConversationState['lastIntent']
): ConversationState {
  const now = new Date().toISOString();
  return mergeBooking(
    setStage(
      {
        ...state,
        lastIntent: intent,
        updatedAt: now,
        lastPromptKind: state.bookingForOther?.bookingForSomeoneElse
          ? undefined
          : ('consent_optional_extras' as const),
      },
      'consent'
    ),
    { consent_requested_at: now }
  );
}
