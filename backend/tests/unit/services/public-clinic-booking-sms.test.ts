import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockSendSms = jest.fn();
const mockAudit = jest.fn();
const mockSettings = jest.fn();

let smsAlreadySent = false;

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: () => ({
    from: (table: string) => {
      if (table === 'audit_logs') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  limit: async () => ({
                    data: smsAlreadySent ? [{ id: 'audit-1' }] : [],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: '44444444-4444-4444-8444-444444444444',
                appointment_date: '2030-01-15T10:00:00.000Z',
                patient_phone: '+919800000000',
                doctor_id: '11111111-1111-4111-8111-111111111111',
                status: 'confirmed',
                reason_for_visit: 'Fever',
              },
              error: null,
            }),
          }),
        }),
      };
    },
  }),
}));

jest.mock('../../../src/services/twilio-sms-service', () => ({
  sendSms: (...args: unknown[]) => mockSendSms(...args),
}));

jest.mock('../../../src/utils/audit-logger', () => ({
  logAuditEvent: (...args: unknown[]) => mockAudit(...args),
}));

jest.mock('../../../src/services/doctor-settings-service', () => ({
  getDoctorSettings: (...args: unknown[]) => mockSettings(...args),
}));

async function loadSms() {
  jest.resetModules();
  process.env.BOOKING_TOKEN_SECRET = 'test-booking-token-secret';
  process.env.BOOKING_PAGE_URL = 'https://example.com/book';
  return import('../../../src/services/public-clinic-booking-sms');
}

const APPT = '44444444-4444-4444-8444-444444444444';

describe('public clinic booking SMS', () => {
  beforeEach(() => {
    smsAlreadySent = false;
    mockSendSms.mockReset();
    mockAudit.mockReset();
    mockSettings.mockReset();
    mockSettings.mockImplementation(async () => ({
      practice_name: 'City Clinic',
      timezone: 'Asia/Kolkata',
    }));
    mockSendSms.mockImplementation(async () => {
      smsAlreadySent = true;
      return true;
    });
    mockAudit.mockImplementation(async () => undefined);
  });

  it('sends practice, when, and the prep URL once, and leaves the reason out', async () => {
    const { sendPublicClinicBookingSms } = await loadSms();
    const first = await sendPublicClinicBookingSms(APPT, 'corr-1');
    expect(first).toBe(true);
    expect(mockSendSms).toHaveBeenCalledTimes(1);
    const body = mockSendSms.mock.calls[0]?.[1] as string;
    expect(body).toContain('City Clinic');
    expect(body).toContain('/book/prep?t=');
    expect(body.toLowerCase()).not.toContain('fever');
    expect(body).not.toContain('+919800000000');
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'notification_sent',
        resourceId: APPT,
        metadata: expect.objectContaining({ notification_type: 'public_clinic_booking_sms' }),
      })
    );

    const again = await loadSms();
    const second = await again.sendPublicClinicBookingSms(APPT, 'corr-2');
    expect(second).toBe(true);
    expect(mockSendSms).toHaveBeenCalledTimes(1);
  });

  it('returns false when Twilio does not send, and does not throw', async () => {
    const { sendPublicClinicBookingSms } = await loadSms();
    mockSendSms.mockImplementation(async () => false);
    await expect(sendPublicClinicBookingSms(APPT, 'corr-3')).resolves.toBe(false);
    expect(mockAudit).not.toHaveBeenCalled();
  });
});
