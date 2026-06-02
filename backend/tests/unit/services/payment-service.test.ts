/**
 * Payment Service Unit Tests (e-task-4, 9.1)
 *
 * Tests createPaymentLink (with routing), processPaymentSuccess, getPaymentById.
 * Mocks Razorpay and PayPal adapters; uses fake placeholders per TESTING.md.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  createPaymentLink,
  processPaymentSuccess,
  getPaymentById,
} from '../../../src/services/payment-service';
import * as database from '../../../src/config/database';
import { razorpayAdapter } from '../../../src/adapters/razorpay-adapter';
import { paypalAdapter } from '../../../src/adapters/paypal-adapter';
import { InternalError } from '../../../src/utils/errors';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));
jest.mock('../../../src/adapters/razorpay-adapter');
jest.mock('../../../src/adapters/paypal-adapter');
jest.mock('../../../src/config/env', () => ({
  env: { DEFAULT_DOCTOR_COUNTRY: 'IN' },
}));
jest.mock('../../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../../src/config/platform-fee', () => ({
  computePlatformFee: jest.fn((amountMinor: number, currency: string) => {
    if (currency.toUpperCase() !== 'INR') {
      return { platformFeeMinor: 0, gstMinor: 0, doctorAmountMinor: amountMinor };
    }
    const threshold = 50000;
    const flat = 2500;
    const percent = 5;
    const gstPercent = 18;
    const platformFeeMinor = amountMinor < threshold ? flat : Math.round((amountMinor * percent) / 100);
    const gstMinor = Math.round((platformFeeMinor * gstPercent) / 100);
    const doctorAmountMinor = amountMinor - platformFeeMinor - gstMinor;
    return { platformFeeMinor, gstMinor, doctorAmountMinor };
  }),
}));

const mockedDb = database as jest.Mocked<typeof database>;
const mockedRazorpay = razorpayAdapter as jest.Mocked<typeof razorpayAdapter>;
const mockedPayPal = paypalAdapter as jest.Mocked<typeof paypalAdapter>;

const correlationId = 'corr-test-123';
const appointmentId = 'apt-550e8400-e29b-41d4-a716-446655440000';
const doctorId = '550e8400-e29b-41d4-a716-446655440001';
const patientId = '550e8400-e29b-41d4-a716-446655440002';
const userId = doctorId;

/** Creates mock Supabase client with response queue (consumed by insert, single, update.eq) */
function createMockSupabase(
  responses: Array<{ data?: unknown; error: unknown }>
) {
  let idx = 0;
  const getNext = () => responses[idx++] ?? { data: null, error: null };

  const updateFn = jest.fn().mockReturnValue({
    eq: jest.fn().mockImplementation(() =>
      Promise.resolve(getNext())
    ),
  });

  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    insert: jest.fn().mockImplementation(() =>
      Promise.resolve(getNext())
    ),
    update: updateFn,
    single: jest.fn().mockImplementation(() =>
      Promise.resolve(getNext())
    ),
  };

  const from = jest.fn().mockReturnValue(chain);
  return { from, updateFn };
}

describe('Payment Service (e-task-4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockedRazorpay.createPaymentLink as any).mockResolvedValue({
      url: 'https://razorpay.fake/link_xxx',
      gatewayOrderId: 'order_rzp_xxx',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockedPayPal.createPaymentLink as any).mockResolvedValue({
      url: 'https://paypal.fake/checkout/xxx',
      gatewayOrderId: 'order_pp_xxx',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
  });

  describe('createPaymentLink - 9.1 & 9.2', () => {
    it('calls Razorpay adapter when doctor country is India (IN)', async () => {
      const mockSupabase = createMockSupabase([{ data: null, error: null }]);
      mockedDb.getSupabaseAdminClient.mockReturnValue({ from: mockSupabase.from } as never);

      const input = {
        appointmentId,
        amountMinor: 50000,
        currency: 'INR',
        doctorCountry: 'IN',
        doctorId,
        patientId,
        patientName: 'PATIENT_TEST',
        patientPhone: '+10000000000',
      };

      const result = await createPaymentLink(input, correlationId);

      expect(mockedRazorpay.createPaymentLink).toHaveBeenCalledWith(
        expect.objectContaining({
          amountMinor: 50000,
          currency: 'INR',
          referenceId: appointmentId,
        })
      );
      expect(mockedPayPal.createPaymentLink).not.toHaveBeenCalled();
      expect(result.gateway).toBe('razorpay');
      expect(result.url).toContain('razorpay');
    });

    it('calls PayPal adapter when doctor country is US', async () => {
      const mockSupabase = createMockSupabase([{ data: null, error: null }]);
      mockedDb.getSupabaseAdminClient.mockReturnValue({ from: mockSupabase.from } as never);

      const input = {
        appointmentId,
        amountMinor: 5000,
        currency: 'USD',
        doctorCountry: 'US',
        doctorId,
        patientId,
        patientName: 'PATIENT_TEST',
        patientPhone: '+10000000000',
      };

      const result = await createPaymentLink(input, correlationId);

      expect(mockedPayPal.createPaymentLink).toHaveBeenCalledWith(
        expect.objectContaining({
          amountMinor: 5000,
          currency: 'USD',
          referenceId: appointmentId,
        })
      );
      expect(mockedRazorpay.createPaymentLink).not.toHaveBeenCalled();
      expect(result.gateway).toBe('paypal');
      expect(result.url).toContain('paypal');
    });

    it('inserts pending payment record on success', async () => {
      const mockSupabase = createMockSupabase([{ data: null, error: null }]);
      mockedDb.getSupabaseAdminClient.mockReturnValue({ from: mockSupabase.from } as never);

      await createPaymentLink(
        {
          appointmentId,
          amountMinor: 50000,
          currency: 'INR',
          doctorCountry: 'IN',
          doctorId,
          patientId,
        },
        correlationId
      );

      expect(mockSupabase.from).toHaveBeenCalledWith('payments');
    });

    it('throws when supabase admin client is null', async () => {
      mockedDb.getSupabaseAdminClient.mockReturnValue(null as never);

      await expect(
        createPaymentLink(
          {
            appointmentId,
            amountMinor: 50000,
            currency: 'INR',
            doctorCountry: 'IN',
            doctorId,
            patientId,
          },
          correlationId
        )
      ).rejects.toThrow(InternalError);
    });
  });

  describe('processPaymentSuccess', () => {
    it('updates payment and appointment on success', async () => {
      const mockSupabase = createMockSupabase([
        { data: { id: 'pay-123', appointment_id: appointmentId }, error: null },
        { data: null, error: null },
        { data: null, error: null },
      ]);
      mockedDb.getSupabaseAdminClient.mockReturnValue({ from: mockSupabase.from } as never);

      await processPaymentSuccess(
        'razorpay',
        'order_rzp_xxx',
        'pay_rzp_xxx',
        50000,
        'INR',
        correlationId
      );

      expect(mockSupabase.from).toHaveBeenCalledWith('payments');
      expect(mockSupabase.from).toHaveBeenCalledWith('appointments');
    });

    it('includes platform fee, gst, doctor amount in payment update (INR)', async () => {
      const mockSupabase = createMockSupabase([
        { data: { id: 'pay-123', appointment_id: appointmentId }, error: null },
        { data: null, error: null },
        { data: null, error: null },
      ]);
      mockedDb.getSupabaseAdminClient.mockReturnValue({ from: mockSupabase.from } as never);

      await processPaymentSuccess(
        'razorpay',
        'order_rzp_xxx',
        'pay_rzp_xxx',
        100000,
        'INR',
        correlationId
      );

      expect(mockSupabase.updateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          platform_fee_minor: 5000,
          gst_minor: 900,
          doctor_amount_minor: 94100,
          status: 'captured',
          amount_minor: 100000,
          currency: 'INR',
        })
      );
    });

    it('uses zero platform fee for non-INR (PayPal)', async () => {
      const mockSupabase = createMockSupabase([
        { data: { id: 'pay-123', appointment_id: appointmentId }, error: null },
        { data: null, error: null },
        { data: null, error: null },
      ]);
      mockedDb.getSupabaseAdminClient.mockReturnValue({ from: mockSupabase.from } as never);

      await processPaymentSuccess(
        'paypal',
        'order_pp_xxx',
        'pay_pp_xxx',
        10000,
        'USD',
        correlationId
      );

      expect(mockSupabase.updateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          platform_fee_minor: 0,
          gst_minor: 0,
          doctor_amount_minor: 10000,
        })
      );
    });

    it('returns without throwing when payment not found (idempotent)', async () => {
      const mockSupabase = createMockSupabase([
        { data: null, error: { code: 'PGRST116' } },
      ]);
      mockedDb.getSupabaseAdminClient.mockReturnValue({ from: mockSupabase.from } as never);

      await expect(
        processPaymentSuccess(
          'razorpay',
          'order_nonexistent',
          undefined,
          50000,
          'INR',
          correlationId
        )
      ).resolves.not.toThrow();
    });
  });

  describe('getPaymentById', () => {
    it('returns payment when user is owner (doctor)', async () => {
      const mockPayment = {
        id: 'pay-123',
        appointment_id: appointmentId,
        gateway: 'razorpay',
        status: 'pending',
        amount_minor: 50000,
        currency: 'INR',
        platform_fee_minor: 2500,
        gst_minor: 450,
        doctor_amount_minor: 47050,
      };
      const mockSupabase = createMockSupabase([
        { data: mockPayment, error: null },
        { data: { doctor_id: userId }, error: null },
      ]);
      mockedDb.getSupabaseAdminClient.mockReturnValue({ from: mockSupabase.from } as never);

      const result = await getPaymentById('pay-123', correlationId, userId);

      expect(result).not.toBeNull();
      expect(result?.id).toBe('pay-123');
      expect(result?.gateway).toBe('razorpay');
      expect(result?.status).toBe('pending');
      expect(result?.platform_fee_minor).toBe(2500);
      expect(result?.gst_minor).toBe(450);
      expect(result?.doctor_amount_minor).toBe(47050);
    });

    it('returns null when user is not owner', async () => {
      const mockPayment = {
        id: 'pay-123',
        appointment_id: appointmentId,
        gateway: 'razorpay',
        status: 'pending',
        amount_minor: 50000,
        currency: 'INR',
      };
      const mockSupabase = createMockSupabase([
        { data: mockPayment, error: null },
        { data: { doctor_id: 'other-doctor-id' }, error: null },
      ]);
      mockedDb.getSupabaseAdminClient.mockReturnValue({ from: mockSupabase.from } as never);

      const result = await getPaymentById('pay-123', correlationId, userId);

      expect(result).toBeNull();
    });

    it('returns null when payment not found', async () => {
      const mockSupabase = createMockSupabase([
        { data: null, error: { code: 'PGRST116' } },
      ]);
      mockedDb.getSupabaseAdminClient.mockReturnValue({ from: mockSupabase.from } as never);

      const result = await getPaymentById('nonexistent', correlationId, userId);

      expect(result).toBeNull();
    });
  });
});
