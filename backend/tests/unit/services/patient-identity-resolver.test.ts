/**
 * rcp-25/29: resolvePatientForChannelSender — conversation-first + per-doctor create.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { resolvePatientForChannelSender } from '../../../src/services/patient-identity-service';
import * as conversationService from '../../../src/services/conversation-service';
import * as patientService from '../../../src/services/patient-service';

jest.mock('../../../src/services/conversation-service');
jest.mock('../../../src/services/patient-service', () => ({
  findOrCreatePlaceholderPatient: jest.fn(),
  findPatientByIdWithAdmin: jest.fn(),
}));

const mockedConversation = conversationService as jest.Mocked<typeof conversationService>;
const mockedPatient = patientService as jest.Mocked<typeof patientService>;

const doctorA = '550e8400-e29b-41d4-a716-446655440000';
const patientId = '11111111-1111-1111-1111-111111111111';
const senderId = '987654321012345';
const correlationId = 'corr-rcp-29';

const conversationPatient = {
  id: patientId,
  name: 'Existing',
  phone: '+15550001111',
  doctor_id: doctorA,
  medical_record_number: null,
  created_at: new Date(),
  updated_at: new Date(),
};

describe('resolvePatientForChannelSender (rcp-25/29)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns conversation.patient_id patient when conversation exists (conversation-first)', async () => {
    mockedConversation.findConversationByPlatformId.mockResolvedValue({
      id: 'conv-1',
      doctor_id: doctorA,
      patient_id: patientId,
      platform: 'instagram',
      platform_conversation_id: senderId,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    });
    mockedPatient.findPatientByIdWithAdmin.mockResolvedValue(conversationPatient);

    const result = await resolvePatientForChannelSender({
      doctorId: doctorA,
      channel: 'instagram',
      senderId,
      correlationId,
    });

    expect(result).toBe(conversationPatient);
    expect(mockedPatient.findOrCreatePlaceholderPatient).not.toHaveBeenCalled();
  });

  it('creates per-doctor placeholder when no conversation exists (post-rcp-29)', async () => {
    mockedConversation.findConversationByPlatformId.mockResolvedValue(null);
    const newPatient = {
      id: 'new-per-doctor',
      name: 'Placeholder',
      phone: 'placeholder-instagram-x',
      doctor_id: doctorA,
      medical_record_number: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    mockedPatient.findOrCreatePlaceholderPatient.mockResolvedValue(newPatient);

    const result = await resolvePatientForChannelSender({
      doctorId: doctorA,
      channel: 'instagram',
      senderId,
      correlationId,
    });

    expect(result).toBe(newPatient);
    expect(mockedPatient.findOrCreatePlaceholderPatient).toHaveBeenCalledWith(
      doctorA,
      'instagram',
      senderId,
      correlationId
    );
  });

  it('falls back to per-doctor create when conversation exists but patient row is missing', async () => {
    mockedConversation.findConversationByPlatformId.mockResolvedValue({
      id: 'conv-orphan',
      doctor_id: doctorA,
      patient_id: patientId,
      platform: 'instagram',
      platform_conversation_id: senderId,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
    });
    mockedPatient.findPatientByIdWithAdmin.mockResolvedValue(null);
    const fallbackPatient = {
      id: 'fallback-1',
      name: 'Placeholder',
      phone: 'placeholder-instagram-987654321012345',
      doctor_id: doctorA,
      medical_record_number: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    mockedPatient.findOrCreatePlaceholderPatient.mockResolvedValue(fallbackPatient);

    const result = await resolvePatientForChannelSender({
      doctorId: doctorA,
      channel: 'instagram',
      senderId,
      correlationId,
    });

    expect(result).toBe(fallbackPatient);
    expect(mockedPatient.findOrCreatePlaceholderPatient).toHaveBeenCalledWith(
      doctorA,
      'instagram',
      senderId,
      correlationId
    );
  });
});
