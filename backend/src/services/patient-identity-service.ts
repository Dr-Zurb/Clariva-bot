/**
 * rcp-25/29: Per-doctor patient identity resolution.
 * Conversation-first → per-doctor placeholder find/create.
 */

import { findConversationByPlatformId } from './conversation-service';
import {
  findOrCreatePlaceholderPatient,
  findPatientByIdWithAdmin,
} from './patient-service';
import type { Patient } from '../types';

export { findPatientByChannelSender } from './patient-service';

/** Input for per-doctor identity resolution. */
export interface ResolvePatientForChannelSenderInput {
  doctorId: string;
  channel: string;
  senderId: string;
  correlationId: string;
}

/**
 * Resolve the patient for an inbound channel sender.
 * 1. Conversation-first (per-doctor).
 * 2. Per-doctor placeholder find/create.
 */
export async function resolvePatientForChannelSender(
  input: ResolvePatientForChannelSenderInput
): Promise<Patient> {
  const { doctorId, channel, senderId, correlationId } = input;

  const conversation = await findConversationByPlatformId(
    doctorId,
    channel,
    senderId,
    correlationId
  );
  if (conversation?.patient_id) {
    const patient = await findPatientByIdWithAdmin(conversation.patient_id, correlationId);
    if (patient) {
      return patient;
    }
  }

  return findOrCreatePlaceholderPatient(doctorId, channel, senderId, correlationId);
}
