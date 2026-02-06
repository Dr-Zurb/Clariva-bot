/**
 * Notification Service Unit Tests (e-task-5)
 *
 * Tests sendPaymentConfirmationToPatient, sendNewAppointmentToDoctor,
 * sendPaymentReceivedToDoctor with mocked email/Instagram and database.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  sendPaymentConfirmationToPatient,
  sendNewAppointmentToDoctor,
  sendPaymentReceivedToDoctor,
} from '../../../src/services/notification-service';
import * as database from '../../../src/config/database';
import * as emailConfig from '../../../src/config/email';
import * as instagramService from '../../../src/services/instagram-service';
import * as auditLogger from '../../../src/utils/audit-logger';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));
jest.mock('../../../src/config/email', () => ({
  sendEmail: jest.fn(),
}));
jest.mock('../../../src/services/instagram-service', () => ({
  sendInstagramMessage: jest.fn(),
}));
jest.mock('../../../src/utils/audit-logger', () => ({
  logAuditEvent: jest.fn().mockResolvedValue(undefined as never),
}));

const mockedDb = database as jest.Mocked<typeof database>;
const mockedEmail = emailConfig as jest.Mocked<typeof emailConfig>;
const mockedInstagram = instagramService as jest.Mocked<typeof instagramService>;

const correlationId = 'test-correlation-id';
const appointmentId = '550e8400-e29b-41d4-a716-446655440001';
const doctorId = '550e8400-e29b-41d4-a716-446655440002';
const patientId = '550e8400-e29b-41d4-a716-446655440003';
const dateIso = '2026-02-05T14:00:00.000Z';

function createMockSupabase(
  appointments: { data: unknown; error: unknown },
  patients?: { data: unknown; error: unknown }
) {
  const from = jest.fn((table: string) => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockImplementation(() => {
        if (table === 'appointments') return Promise.resolve(appointments as never);
        if (table === 'patients' && patients) return Promise.resolve(patients as never);
        return Promise.resolve({ data: null, error: null } as never);
      }),
    };
    return chain;
  });
  const auth = {
    admin: {
      getUserById: jest.fn().mockResolvedValue({
        data: { user: { email: 'TEST_EMAIL@example.com' } },
        error: null,
      } as never),
    },
  };
  return { from, auth };
}

describe('Notification Service (e-task-5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedEmail.sendEmail.mockResolvedValue(true);
    mockedInstagram.sendInstagramMessage.mockResolvedValue(undefined as never);
  });

  describe('sendPaymentConfirmationToPatient', () => {
    it('sends DM when appointment has patient_id and patient is on Instagram', async () => {
      const mockSupabase = createMockSupabase(
        { data: { id: appointmentId, patient_id: patientId }, error: null },
        {
          data: {
            id: patientId,
            platform: 'instagram',
            platform_external_id: 'ig-psid-123',
          },
          error: null,
        }
      );
      mockedDb.getSupabaseAdminClient.mockReturnValue(mockSupabase as never);

      const result = await sendPaymentConfirmationToPatient(
        appointmentId,
        dateIso,
        correlationId
      );

      expect(result).toBe(true);
      expect(mockedInstagram.sendInstagramMessage).toHaveBeenCalledWith(
        'ig-psid-123',
        expect.stringContaining('Payment received'),
        correlationId
      );
      expect(auditLogger.logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'notification_sent',
          resourceType: 'appointment',
          resourceId: appointmentId,
          metadata: { notification_type: 'payment_confirmation_dm', recipient_type: 'patient' },
        })
      );
    });

    it('returns true and skips DM when appointment has no patient_id', async () => {
      const mockSupabase = createMockSupabase({
        data: { id: appointmentId, patient_id: null },
        error: null,
      });
      mockedDb.getSupabaseAdminClient.mockReturnValue(mockSupabase as never);

      const result = await sendPaymentConfirmationToPatient(
        appointmentId,
        dateIso,
        correlationId
      );

      expect(result).toBe(true);
      expect(mockedInstagram.sendInstagramMessage).not.toHaveBeenCalled();
    });

    it('returns false when admin client is null', async () => {
      mockedDb.getSupabaseAdminClient.mockReturnValue(null as never);

      const result = await sendPaymentConfirmationToPatient(
        appointmentId,
        dateIso,
        correlationId
      );

      expect(result).toBe(false);
      expect(mockedInstagram.sendInstagramMessage).not.toHaveBeenCalled();
    });
  });

  describe('sendNewAppointmentToDoctor', () => {
    it('sends email when doctor email is resolved from auth', async () => {
      const mockSupabase = createMockSupabase(
        { data: null, error: null }
      );
      mockedDb.getSupabaseAdminClient.mockReturnValue(mockSupabase as never);

      const result = await sendNewAppointmentToDoctor(
        doctorId,
        appointmentId,
        dateIso,
        correlationId
      );

      expect(result).toBe(true);
      expect(mockedEmail.sendEmail).toHaveBeenCalledWith(
        'TEST_EMAIL@example.com',
        'New appointment booked',
        expect.stringMatching(/new appointment/i),
        correlationId
      );
      expect(auditLogger.logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'notification_sent',
          metadata: { notification_type: 'new_appointment_email', recipient_type: 'doctor' },
        })
      );
    });
  });

  describe('sendPaymentReceivedToDoctor', () => {
    it('sends email when doctor email is resolved', async () => {
      const mockSupabase = createMockSupabase({ data: null, error: null });
      mockedDb.getSupabaseAdminClient.mockReturnValue(mockSupabase as never);

      const result = await sendPaymentReceivedToDoctor(
        doctorId,
        appointmentId,
        dateIso,
        correlationId
      );

      expect(result).toBe(true);
      expect(mockedEmail.sendEmail).toHaveBeenCalledWith(
        'TEST_EMAIL@example.com',
        'Payment received for appointment',
        expect.stringMatching(/payment has been received/i),
        correlationId
      );
      expect(auditLogger.logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'notification_sent',
          metadata: { notification_type: 'payment_received_email', recipient_type: 'doctor' },
        })
      );
    });
  });
});
