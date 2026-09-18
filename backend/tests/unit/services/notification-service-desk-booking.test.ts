/**
 * RQ7 — desk phone pre-booking confirmation.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));
jest.mock('../../../src/services/prescription-pdf-service', () => ({
  renderPrescriptionPdf: jest.fn(),
}));
jest.mock('../../../src/config/email', () => ({
  sendEmail: jest.fn(),
}));
jest.mock('../../../src/services/twilio-sms-service', () => ({
  sendSms: jest.fn(),
}));
jest.mock('../../../src/services/instagram-service', () => ({
  sendInstagramMessage: jest.fn(),
  sendInstagramImage: jest.fn(),
}));
jest.mock('../../../src/services/instagram-connect-service', () => ({
  getInstagramAccessTokenForDoctor: jest.fn().mockResolvedValue(null as never),
}));
jest.mock('../../../src/services/facebook-connect-service', () => ({
  getFacebookPageAccessTokenForDoctor: jest.fn().mockResolvedValue(null as never),
}));
jest.mock('../../../src/services/doctor-settings-service', () => ({
  getDoctorSettings: jest.fn().mockResolvedValue({
    practice_name: 'Clinic',
    timezone: 'Asia/Kolkata',
  } as never),
}));
jest.mock('../../../src/utils/audit-logger', () => ({
  logAuditEvent: jest.fn().mockResolvedValue(undefined as never),
}));
jest.mock('../../../src/services/conversation-service', () => ({
  getConversationLanguage: jest.fn().mockResolvedValue('en' as never),
}));

import { sendDeskBookingConfirmationToPatient } from '../../../src/services/notification-service';
import * as database from '../../../src/config/database';
import * as smsService from '../../../src/services/twilio-sms-service';
import * as emailConfig from '../../../src/config/email';
import * as auditLogger from '../../../src/utils/audit-logger';

const mockedDb = database as jest.Mocked<typeof database>;
const mockedSms = smsService as jest.Mocked<typeof smsService>;
const mockedEmail = emailConfig as jest.Mocked<typeof emailConfig>;

const appointmentId = '22222222-2222-2222-2222-222222222222';
const doctorId = '33333333-3333-3333-3333-333333333333';
const patientId = '44444444-4444-4444-4444-444444444444';

function buildAdmin(opts: {
  origin: 'booked' | 'walk_in';
  found?: boolean;
  phone?: string | null;
  email?: string | null;
  mrn?: string | null;
}) {
  const apt =
    opts.found === false
      ? null
      : {
          id: appointmentId,
          booking_origin: opts.origin,
          appointment_date: '2026-08-26T11:00:00.000Z',
          conversation_id: null,
          patient_id: patientId,
          doctor_id: doctorId,
          patient_phone: opts.phone ?? '9814861579',
        };

  const from = jest.fn((table: string) => {
    const chain: Record<string, unknown> = {
      select: jest.fn(() => chain),
      eq: jest.fn(() => chain),
      limit: jest.fn(() => chain),
      maybeSingle: jest.fn().mockImplementation(() => {
        if (table === 'appointments') {
          return Promise.resolve({ data: apt, error: apt ? null : { message: 'missing' } });
        }
        if (table === 'patients') {
          return Promise.resolve({
            data: {
              phone: opts.phone ?? '9814861579',
              email: opts.email ?? null,
              medical_record_number: opts.mrn ?? 'CLR-00999',
              platform: null,
              platform_external_id: null,
            },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      }),
      single: jest.fn().mockImplementation(() => {
        if (table === 'appointments') {
          return Promise.resolve({ data: apt, error: apt ? null : { message: 'missing' } });
        }
        if (table === 'patients') {
          return Promise.resolve({
            data: {
              phone: opts.phone ?? '9814861579',
              email: opts.email ?? null,
              platform: null,
              platform_external_id: null,
            },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      }),
    };
    return chain;
  });

  return { from };
}

describe('sendDeskBookingConfirmationToPatient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSms.sendSms.mockResolvedValue(true);
    mockedEmail.sendEmail.mockResolvedValue(true);
  });

  it('skips walk-ins and does not SMS', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      buildAdmin({ origin: 'walk_in' }) as never
    );
    const sent = await sendDeskBookingConfirmationToPatient(appointmentId, 'cid');
    expect(sent).toBe(true);
    expect(mockedSms.sendSms).not.toHaveBeenCalled();
  });

  it('texts a phone pre-booking and audits without PII', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      buildAdmin({ origin: 'booked', email: 'skip@example.com' }) as never
    );
    const sent = await sendDeskBookingConfirmationToPatient(appointmentId, 'cid');
    expect(sent).toBe(true);
    expect(mockedSms.sendSms).toHaveBeenCalledTimes(1);
    const smsBody = mockedSms.sendSms.mock.calls[0]?.[1] as string;
    expect(smsBody).toContain('Your appointment is confirmed');
    expect(smsBody.toLowerCase()).not.toContain('payment');
    expect(auditLogger.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'notification_sent',
        resourceId: appointmentId,
        metadata: expect.objectContaining({
          notification_type: 'desk_booking_confirmation',
        }),
      })
    );
    const auditArg = (auditLogger.logAuditEvent as jest.Mock).mock.calls[0]?.[0] as {
      metadata?: Record<string, unknown>;
    };
    expect(JSON.stringify(auditArg)).not.toMatch(/9814861579|skip@example.com|CLR-00999/i);
  });

  it('never throws when SMS fails', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      buildAdmin({ origin: 'booked' }) as never
    );
    mockedSms.sendSms.mockRejectedValue(new Error('twilio down'));
    await expect(
      sendDeskBookingConfirmationToPatient(appointmentId, 'cid')
    ).resolves.toBe(false);
  });
});
