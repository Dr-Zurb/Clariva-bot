/**
 * rcp-22: Shared ready-patient booking path — staff-review gate or slot link.
 * Used by book_responded and returning justStartingCollection skip.
 */

import { buildBookingPageUrl } from '../../services/slot-selection-service';
import { formatBookingLinkDm, formatClinicPageLinkDm } from '../../utils/booking-link-copy';
import { formatSingleConsultFeeDm } from '../../utils/consultation-fees';
import { buildPricesOnBookingPageLead } from '../../utils/instagram-faq-copy';
import type { ConversationLanguage } from '../../utils/conversation-language';
import { formatAwaitingStaffServiceConfirmationDm } from '../../utils/staff-service-review-dm';
import {
  isSlotBookingBlockedPendingStaffReview,
  mergeBooking,
  mergeTriage,
  setStage,
  type ConversationState,
} from '../../types/conversation';
import type { DoctorSettingsRow } from '../../types/doctor-settings';
import type { Patient } from '../../types/database';
import type { ReturningPatientProfile } from '../../types/returning-patient';
import { env } from '../../config/env';
import {
  isPlaceholderPatientName,
  isPlaceholderPatientPhone,
} from '../../utils/patient-placeholder';

function shouldUseReturningPatientMemory(
  profile: ReturningPatientProfile | undefined
): profile is ReturningPatientProfile {
  return (
    env.RETURNING_PATIENT_MEMORY_ENABLED === true &&
    profile?.isReturning === true &&
    profile.hasGrantedConsent === true
  );
}

/** Patient row has real demographics + granted consent (placeholder-safe). */
export function isPatientReadyForSlotLink(patient: Patient | null | undefined): boolean {
  if (!patient?.name?.trim() || !patient?.phone?.trim()) return false;
  if (patient.consent_status !== 'granted') return false;
  if (isPlaceholderPatientName(patient.name) || isPlaceholderPatientPhone(patient.phone)) {
    return false;
  }
  return true;
}

/** Flag on + returning profile + demographics ready on file. */
export function isReturningPatientReadyToSkipCollection(
  profile: ReturningPatientProfile | undefined,
  patient: Patient | null | undefined
): boolean {
  if (!shouldUseReturningPatientMemory(profile)) return false;
  if (!profile.hasName || !profile.hasPhone) return false;
  return isPatientReadyForSlotLink(patient);
}

/** Field names only — values stay on the patients row (DL-6). */
export function hydrateCollectedFieldNamesFromProfile(
  profile: ReturningPatientProfile,
  reasonSeedFields: string[]
): string[] {
  const demoKeys = profile.knownFieldKeys.filter((k) => k !== 'reason_for_visit');
  return [...new Set([...demoKeys, ...reasonSeedFields])];
}

export interface ApplyReadyPatientBookingPathInput {
  state: ConversationState;
  intent: ConversationState['lastIntent'];
  conversationId: string;
  doctorId: string;
  doctorSettings: DoctorSettingsRow | null;
  patient: Patient | null | undefined;
  language: ConversationLanguage;
}

export function applyReadyPatientBookingPath(input: ApplyReadyPatientBookingPathInput): {
  state: ConversationState;
  replyText: string;
} {
  const { state, intent, conversationId, doctorId, doctorSettings, language } = input;

  if (isSlotBookingBlockedPendingStaffReview(state)) {
    const merged: ConversationState = {
      ...state,
      lastIntent: intent,
      step: 'awaiting_staff_service_confirmation',
      updatedAt: new Date().toISOString(),
    };
    return {
      state: mergeTriage(
        mergeBooking(merged, { consultationType: state.booking?.consultationType }),
        { activeFlow: undefined }
      ),
      replyText: formatAwaitingStaffServiceConfirmationDm(language, doctorSettings, merged),
    };
  }

  const slotLink = buildBookingPageUrl(conversationId, doctorId);
  return {
    state: mergeTriage(
      mergeBooking(
        setStage(
          {
            ...state,
            lastIntent: intent,
            updatedAt: new Date().toISOString(),
          },
          'awaiting_slot_selection'
        ),
        { consultationType: state.booking?.consultationType }
      ),
      { activeFlow: undefined }
    ),
    replyText: formatBookingLinkDm({ language, slotLink, doctorSettings }),
  };
}

/** Receptionist lead + the appointment CTA (they asked to book). */
export function applyLeadPlusBookingLink(
  input: ApplyReadyPatientBookingPathInput & { lead: string }
): { state: ConversationState; replyText: string } {
  const ready = applyReadyPatientBookingPath(input);
  const lead = input.lead.trim();
  return {
    state: ready.state,
    replyText: lead ? `${lead}\n\n${ready.replyText}` : ready.replyText,
  };
}

/** Same `/book` URL without “get an appointment.” */
export function applyLeadPlusPageLink(
  input: ApplyReadyPatientBookingPathInput & { lead: string }
): { state: ConversationState; replyText: string } {
  const ready = applyReadyPatientBookingPath(input);
  const slotLink = buildBookingPageUrl(input.conversationId, input.doctorId);
  const page = formatClinicPageLinkDm({
    language: input.language,
    slotLink,
    doctorSettings: input.doctorSettings,
  });
  const lead = input.lead.trim();
  return {
    state: ready.state,
    replyText: lead ? `${lead}\n\n${page}` : page,
  };
}

function applyFeeQuoteOnly(
  input: ApplyReadyPatientBookingPathInput,
  replyText: string
): { state: ConversationState; replyText: string } {
  return {
    state: mergeTriage(
      {
        ...input.state,
        lastIntent: input.intent,
        step: 'responded',
        updatedAt: new Date().toISOString(),
      },
      {
        reasonFirstTriagePhase: undefined,
        postMedicalConsultFeeAckSent: undefined,
        activeFlow: undefined,
      }
    ),
    replyText,
  };
}

/** Single-fee quotes ₹. Packaged uses the page link. Booking CTA only if they asked to book. */
export function applyReceptionistFeeReply(
  input: ApplyReadyPatientBookingPathInput & { wantsToBook: boolean }
): { state: ConversationState; replyText: string } {
  const quote = formatSingleConsultFeeDm(input.doctorSettings, input.language);
  if (quote && !input.wantsToBook) {
    return applyFeeQuoteOnly(input, quote);
  }
  if (quote && input.wantsToBook) {
    const ready = applyReadyPatientBookingPath(input);
    return { state: ready.state, replyText: `${quote}\n\n${ready.replyText}` };
  }
  const lead = buildPricesOnBookingPageLead(input.language);
  if (!input.wantsToBook) {
    return applyLeadPlusPageLink({ ...input, lead });
  }
  return applyLeadPlusBookingLink({ ...input, lead });
}
