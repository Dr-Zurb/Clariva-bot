import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { DoctorNotVerifiedError, UnauthorizedError, ValidationError } from '../../../src/utils/errors';
import {
  validatePublicClinicCheckoutBody,
  validateSelectSlotAndPayBody,
} from '../../../src/utils/validation';

const mockBook = jest.fn();
const mockCreatePatient = jest.fn();
const mockVerified = jest.fn();
const mockSettings = jest.fn();
const mockEnsureMrn = jest.fn();
const mockApply = jest.fn();
const mockQuote = jest.fn();
const mockDayMode = jest.fn();
const mockVerify = jest.fn();
const mockFindConversation = jest.fn();
const mockGetState = jest.fn();
const mockRecord = jest.fn();
const mockSms = jest.fn();

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: () => ({
    from: (table: string) => {
      if (table === 'appointments') {
        const visit: {
          eq: () => typeof visit;
          in: () => typeof visit;
          gte: () => typeof visit;
          lt: () => typeof visit;
          limit: () => Promise<{ data: []; error: null }>;
        } = {
          eq: () => visit,
          in: () => visit,
          gte: () => visit,
          lt: () => visit,
          limit: async () => ({ data: [], error: null }),
        };
        return { select: () => visit };
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                doctor_id: '11111111-1111-4111-8111-111111111111',
                public_slug: 'city-clinic',
              },
              error: null,
            }),
          }),
        }),
      };
    },
  }),
}));

jest.mock('../../../src/services/doctor-settings-service', () => ({
  getDoctorSettings: (...args: unknown[]) => mockSettings(...args),
}));

jest.mock('../../../src/services/doctor-verification-service', () => ({
  isDoctorVerified: (...args: unknown[]) => mockVerified(...args),
}));

jest.mock('../../../src/services/patient-service', () => ({
  createPatientForPublicClinic: (...args: unknown[]) => mockCreatePatient(...args),
  ensurePatientMrnIfEligible: (...args: unknown[]) => mockEnsureMrn(...args),
}));

jest.mock('../../../src/services/appointment-service', () => ({
  bookAppointment: (...args: unknown[]) => mockBook(...args),
}));

jest.mock('../../../src/services/slot-selection-service', () => ({
  applyPublicBookingSelectionsToState: (...args: unknown[]) => mockApply(...args),
  computeSlotBookingQuote: (...args: unknown[]) => mockQuote(...args),
  recordTokenCheckoutOnConversation: (...args: unknown[]) => mockRecord(...args),
}));

jest.mock('../../../src/utils/booking-token', () => ({
  verifyBookingToken: (...args: unknown[]) => mockVerify(...args),
}));

jest.mock('../../../src/services/conversation-service', () => ({
  findConversationById: (...args: unknown[]) => mockFindConversation(...args),
  getConversationState: (...args: unknown[]) => mockGetState(...args),
}));

jest.mock('../../../src/services/opd/opd-mode-service', () => ({
  resolveSessionDayMode: (...args: unknown[]) => mockDayMode(...args),
}));

jest.mock('../../../src/services/opd/opd-queue-service', () => ({
  getQueueTokenForAppointment: async () => null,
}));

jest.mock('../../../src/services/payment-service', () => ({
  createPaymentLink: async () => ({ url: 'https://pay.example/should-not' }),
}));

jest.mock('../../../src/services/doctor-gateway-credentials-service', () => ({
  getDoctorGatewayPublicStatus: async () => ({ connected: false, webhookConfigured: false }),
}));

jest.mock('../../../src/services/public-clinic-booking-sms', () => ({
  sendPublicClinicBookingSms: (...args: unknown[]) => mockSms(...args),
}));

import { processPublicClinicCheckout } from '../../../src/services/public-clinic-checkout-service';

const SLOT = '2030-01-15T10:00:00.000Z';

function intake(overrides: Record<string, unknown> = {}) {
  return {
    slug: 'city-clinic',
    slotStart: SLOT,
    patientName: 'Asha',
    patientPhone: '+919800000000',
    patientAge: 34,
    patientSex: 'female' as const,
    reasonForVisit: 'Fever',
    consentGranted: true as const,
    ...overrides,
  };
}

describe('public clinic checkout', () => {
  beforeEach(() => {
    mockBook.mockReset();
    mockCreatePatient.mockReset();
    mockVerified.mockReset();
    mockSettings.mockReset();
    mockEnsureMrn.mockReset();
    mockApply.mockReset();
    mockQuote.mockReset();
    mockDayMode.mockReset();
    mockVerify.mockReset();
    mockFindConversation.mockReset();
    mockGetState.mockReset();
    mockRecord.mockReset();
    mockSms.mockReset();
    mockSms.mockImplementation(async () => true);
    mockSettings.mockImplementation(async () => ({
      timezone: 'Asia/Kolkata',
      payment_collection_mode: 'bookings_only',
      opd_mode: 'slot',
    }));
    mockApply.mockImplementation((state: unknown) => state);
    mockQuote.mockImplementation(async () => ({
      amountMinor: 50000,
      currency: 'INR',
      doctorCountry: 'IN',
      pricingSource: 'legacy_fee',
    }));
    mockDayMode.mockImplementation(async () => ({ mode: 'slot' }));
    mockCreatePatient.mockImplementation(async () => ({
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Asha',
      phone: '+919800000000',
      age: 34,
      gender: 'female',
      date_of_birth: null,
    }));
    mockBook.mockImplementation(async () => ({
      id: '44444444-4444-4444-8444-444444444444',
    }));
  });

  it('refuses missing consent before a write', async () => {
    expect(() =>
      validatePublicClinicCheckoutBody(intake({ consentGranted: false }))
    ).toThrow(ValidationError);
    await expect(
      processPublicClinicCheckout(intake({ consentGranted: false }), 'corr')
    ).rejects.toBeInstanceOf(ValidationError);
    expect(mockCreatePatient).not.toHaveBeenCalled();
  });

  it('refuses an unverified doctor before creating a patient', async () => {
    mockVerified.mockImplementation(async () => false);
    await expect(processPublicClinicCheckout(intake(), 'corr')).rejects.toBeInstanceOf(
      DoctorNotVerifiedError
    );
    expect(mockCreatePatient).not.toHaveBeenCalled();
    expect(mockBook).not.toHaveBeenCalled();
  });

  it('creates a patient and a booked appointment with no conversation, then sends the success page', async () => {
    mockVerified.mockImplementation(async () => true);
    const result = await processPublicClinicCheckout(intake(), 'corr');

    expect(mockCreatePatient).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      expect.objectContaining({ age: 34, sex: 'female' }),
      'corr'
    );
    const booked = mockBook.mock.calls[0]?.[0] as {
      bookingOrigin?: string;
      conversationId?: string;
      reasonForVisit?: string;
    };
    expect(booked.bookingOrigin).toBe('booked');
    expect(booked.conversationId).toBeUndefined();
    expect(booked.reasonForVisit).toBe('Fever');
    expect(result.paymentUrl).toBeNull();
    expect(result.redirectUrl.endsWith('/success')).toBe(true);
    expect(result.redirectUrl.toLowerCase()).not.toContain('instagram');
    expect(result.appointmentId).toBe('44444444-4444-4444-8444-444444444444');
    expect(mockSms).toHaveBeenCalledWith('44444444-4444-4444-8444-444444444444', 'corr');
  });

  it('keeps the appointment when the confirmation SMS fails', async () => {
    mockVerified.mockImplementation(async () => true);
    mockSms.mockImplementation(async () => {
      throw new Error('twilio down');
    });
    const result = await processPublicClinicCheckout(intake(), 'corr');
    expect(result.appointmentId).toBe('44444444-4444-4444-8444-444444444444');
    expect(mockBook).toHaveBeenCalled();
  });

  it('keeps token checkout on the token route', () => {
    expect(() =>
      validateSelectSlotAndPayBody({
        slotStart: SLOT,
        patientName: 'Asha',
        patientPhone: '+919800000000',
        consentGranted: true,
      })
    ).toThrow(ValidationError);

    const checkout = readFileSync(
      join(__dirname, '../../../src/services/slot-selection-service.ts'),
      'utf8'
    );
    expect(checkout).toContain('conversationId: conversationId');
    const routes = readFileSync(
      join(__dirname, '../../../src/routes/api/v1/bookings.ts'),
      'utf8'
    );
    expect(routes).toContain("router.post('/select-slot-and-pay', selectSlotAndPayHandler)");
    expect(routes).toContain(
      "router.post('/public/checkout', publicSessionLimiter, postPublicClinicCheckoutHandler)"
    );
  });

  it('attaches a matching token and runs the token confirmation', async () => {
    mockVerified.mockImplementation(async () => true);
    mockVerify.mockImplementation(() => ({
      conversationId: '55555555-5555-4555-8555-555555555555',
      doctorId: '11111111-1111-4111-8111-111111111111',
    }));
    mockFindConversation.mockImplementation(async () => ({
      id: '55555555-5555-4555-8555-555555555555',
      doctor_id: '11111111-1111-4111-8111-111111111111',
    }));
    mockGetState.mockImplementation(async () => ({ updatedAt: 't' }));

    await processPublicClinicCheckout(
      intake({ conversationToken: 'matching-token' }),
      'corr'
    );

    const booked = mockBook.mock.calls[0]?.[0] as { conversationId?: string };
    expect(booked.conversationId).toBe('55555555-5555-4555-8555-555555555555');
    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: '55555555-5555-4555-8555-555555555555',
        doctorId: '11111111-1111-4111-8111-111111111111',
      })
    );
  });

  it('books unattached when the token is for another doctor or is expired', async () => {
    mockVerified.mockImplementation(async () => true);
    mockVerify.mockImplementationOnce(() => ({
      conversationId: '55555555-5555-4555-8555-555555555555',
      doctorId: '22222222-2222-4222-8222-222222222222',
    }));
    await processPublicClinicCheckout(intake({ conversationToken: 'other-doctor' }), 'corr');
    expect((mockBook.mock.calls[0]?.[0] as { conversationId?: string }).conversationId).toBeUndefined();
    expect(mockRecord).not.toHaveBeenCalled();
    expect(mockFindConversation).not.toHaveBeenCalled();

    mockBook.mockClear();
    mockVerify.mockImplementationOnce(() => {
      throw new UnauthorizedError('Booking token has expired');
    });
    await processPublicClinicCheckout(intake({ conversationToken: 'expired' }), 'corr');
    expect((mockBook.mock.calls[0]?.[0] as { conversationId?: string }).conversationId).toBeUndefined();
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('does not create a second appointment for a reschedule token', async () => {
    mockVerified.mockImplementation(async () => true);
    mockVerify.mockImplementation(() => ({
      conversationId: '55555555-5555-4555-8555-555555555555',
      doctorId: '11111111-1111-4111-8111-111111111111',
      appointmentId: '66666666-6666-4666-8666-666666666666',
    }));
    await expect(
      processPublicClinicCheckout(intake({ conversationToken: 'reschedule' }), 'corr')
    ).rejects.toBeInstanceOf(ValidationError);
    expect(mockCreatePatient).not.toHaveBeenCalled();
    expect(mockBook).not.toHaveBeenCalled();
  });
});
