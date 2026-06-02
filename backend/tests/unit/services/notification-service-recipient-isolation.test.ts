/**
 * rcp-27: Notification recipient isolation when a PSID maps to multiple per-doctor rows.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  sendPaymentConfirmationToPatient,
  sendConsultationLinkToPatient,
} from '../../../src/services/notification-service';
import * as database from '../../../src/config/database';
import * as emailConfig from '../../../src/config/email';
import * as instagramService from '../../../src/services/instagram-service';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
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
  sendInstagramFile: jest.fn(),
}));
jest.mock('../../../src/services/prescription-pdf-service', () => ({
  generatePrescriptionPdf: jest.fn(),
}));
jest.mock('../../../src/services/prescription-attachment-service', () => ({
  createAttachmentSignedUrlForDelivery: jest.fn(),
}));
jest.mock('../../../src/services/prescription-token-service', () => ({
  mintRxToken: jest.fn(),
  buildShareUrl: jest.fn(),
}));
jest.mock('../../../src/services/doctor-drug-usage-service', () => ({
  incrementDoctorDrugUsageOnSend: jest.fn(),
}));
jest.mock('../../../src/services/instagram-connect-service', () => ({
  getInstagramAccessTokenForDoctor: jest.fn().mockResolvedValue('doctor-token' as never),
}));
jest.mock('../../../src/services/doctor-settings-service', () => ({
  getDoctorSettings: jest.fn().mockResolvedValue({
    timezone: 'Asia/Kolkata',
    practice_name: 'Clinic A',
  } as never),
}));
jest.mock('../../../src/utils/audit-logger', () => ({
  logAuditEvent: jest.fn().mockResolvedValue(undefined as never),
}));

const mockedDb = database as jest.Mocked<typeof database>;
const mockedEmail = emailConfig as jest.Mocked<typeof emailConfig>;
const mockedInstagram = instagramService as jest.Mocked<typeof instagramService>;

const correlationId = 'corr-rcp-27-notify';
const sharedPsid = '987654321012345';
const doctorA = '550e8400-e29b-41d4-a716-446655440000';
const doctorB = '660e8400-e29b-41d4-a716-446655440001';
const patientRowA = '11111111-1111-1111-1111-111111111111';
const patientRowB = '22222222-2222-2222-2222-222222222222';
const appointmentA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const appointmentB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const bookerConvId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const dateIso = '2026-02-05T14:00:00.000Z';

type SingleResult = { data: unknown; error: unknown };

function createSupabaseMock(handlers: {
  appointments?: SingleResult;
  patients?: SingleResult;
  conversationByPatientId?: SingleResult;
  conversationById?: SingleResult;
}) {
  const from = jest.fn((table: string) => {
    const filters: Record<string, string> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockImplementation((...args: unknown[]) => {
        const [col, val] = args as [string, string];
        filters[col] = val;
        return chain;
      }),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn().mockImplementation(() => {
        if (table === 'appointments') {
          return Promise.resolve(handlers.appointments ?? { data: null, error: null });
        }
        if (table === 'patients') {
          return Promise.resolve(handlers.patients ?? { data: null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }),
      maybeSingle: jest.fn().mockImplementation(() => {
        if (table === 'conversations' && filters.id) {
          return Promise.resolve(
            handlers.conversationById ?? { data: null, error: null }
          );
        }
        if (table === 'conversations' && filters.patient_id) {
          return Promise.resolve(
            handlers.conversationByPatientId ?? { data: null, error: null }
          );
        }
        return Promise.resolve({ data: null, error: null });
      }),
    };
    return chain;
  });
  return { from };
}

describe('notification recipient isolation (rcp-27)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedEmail.sendEmail.mockResolvedValue(true);
    mockedInstagram.sendInstagramMessage.mockResolvedValue(undefined as never);
  });

  it('payment confirmation uses each doctor appointment patient row when PSID is shared', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValueOnce(
      createSupabaseMock({
        appointments: {
          data: {
            id: appointmentA,
            patient_id: patientRowA,
            doctor_id: doctorA,
            conversation_id: null,
            consultation_type: 'in_clinic',
          },
          error: null,
        },
        patients: {
          data: {
            id: patientRowA,
            platform: 'instagram',
            platform_external_id: sharedPsid,
          },
          error: null,
        },
      }) as never
    );

    await sendPaymentConfirmationToPatient(appointmentA, dateIso, correlationId, 'P-00001');

    mockedDb.getSupabaseAdminClient.mockReturnValueOnce(
      createSupabaseMock({
        appointments: {
          data: {
            id: appointmentB,
            patient_id: patientRowB,
            doctor_id: doctorB,
            conversation_id: null,
            consultation_type: 'in_clinic',
          },
          error: null,
        },
        patients: {
          data: {
            id: patientRowB,
            platform: 'instagram',
            platform_external_id: sharedPsid,
          },
          error: null,
        },
      }) as never
    );

    await sendPaymentConfirmationToPatient(appointmentB, dateIso, correlationId, 'P-00002');

    expect(mockedInstagram.sendInstagramMessage).toHaveBeenCalledTimes(2);
    expect(mockedInstagram.sendInstagramMessage).toHaveBeenNthCalledWith(
      1,
      sharedPsid,
      expect.stringContaining('Payment received'),
      correlationId,
      'doctor-token'
    );
    expect(mockedInstagram.sendInstagramMessage).toHaveBeenNthCalledWith(
      2,
      sharedPsid,
      expect.stringContaining('Payment received'),
      correlationId,
      'doctor-token'
    );
  });

  it('consultation link falls back to appointment.conversation_id for book-for-other', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      createSupabaseMock({
        appointments: {
          data: {
            id: appointmentA,
            patient_id: patientRowA,
            patient_phone: null,
            doctor_id: doctorA,
            conversation_id: bookerConvId,
          },
          error: null,
        },
        patients: {
          data: { phone: '+15550009999', email: null },
          error: null,
        },
        conversationByPatientId: { data: null, error: null },
        conversationById: {
          data: { platform_conversation_id: 'booker-psid-999' },
          error: null,
        },
      }) as never
    );

    const result = await sendConsultationLinkToPatient(
      appointmentA,
      'https://app.test/consult/join?token=abc',
      correlationId
    );

    expect(result).toBe(true);
    expect(mockedInstagram.sendInstagramMessage).toHaveBeenCalledWith(
      'booker-psid-999',
      expect.stringContaining('video consultation'),
      correlationId,
      'doctor-token'
    );
  });

  it('book-for-other payment confirmation reaches booker via appointment.conversation_id', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      createSupabaseMock({
        appointments: {
          data: {
            id: appointmentA,
            patient_id: patientRowA,
            doctor_id: doctorA,
            conversation_id: bookerConvId,
            consultation_type: 'in_clinic',
          },
          error: null,
        },
        patients: {
          data: {
            id: patientRowA,
            platform: null,
            platform_external_id: null,
          },
          error: null,
        },
        conversationByPatientId: { data: null, error: null },
        conversationById: {
          data: { platform_conversation_id: 'booker-psid-777' },
          error: null,
        },
      }) as never
    );

    const result = await sendPaymentConfirmationToPatient(
      appointmentA,
      dateIso,
      correlationId
    );

    expect(result).toBe(true);
    expect(mockedInstagram.sendInstagramMessage).toHaveBeenCalledWith(
      'booker-psid-777',
      expect.stringContaining('Payment received'),
      correlationId,
      'doctor-token'
    );
  });
});
