/**
 * rcp-22: Shared ready-patient booking path — staff-review gate or slot link.
 * Used by book_responded and returning justStartingCollection skip.
 */

import { buildBookingPageUrl } from '../../services/slot-selection-service';
import { formatBookingLinkDm } from '../../utils/booking-link-copy';
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
}

export function applyReadyPatientBookingPath(
  input: ApplyReadyPatientBookingPathInput
): { state: ConversationState; replyText: string } {
  const { state, intent, conversationId, doctorId, doctorSettings, patient } = input;

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
      replyText: formatAwaitingStaffServiceConfirmationDm(doctorSettings, merged),
    };
  }

  const slotLink = buildBookingPageUrl(conversationId, doctorId);
  const mrnHint = formatPatientIdHint(patient?.medical_record_number);
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
    replyText: formatBookingLinkDm(slotLink, mrnHint, doctorSettings),
  };
}

function formatPatientIdHint(_mrn?: string | null): string {
  return '';
}
