/**
 * Razorpay Route Adapter Unit Tests (e-task-3)
 *
 * Tests createTransferFromPayment with mocked axios and config.
 */
// @ts-nocheck
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import axios from 'axios';
import { createTransferFromPayment } from '../../../src/adapters/razorpay-route-adapter';

jest.mock('axios');
jest.mock('../../../src/config/payment', () => ({
  razorpayConfig: { keyId: 'key_test', keySecret: 'secret_test' },
  isRazorpayConfigured: jest.fn(() => true),
}));
jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Razorpay Route Adapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { isRazorpayConfigured } = require('../../../src/config/payment');
    isRazorpayConfigured.mockReturnValue(true);
  });

  it('returns transferId on success', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        entity: 'collection',
        count: 1,
        items: [{ id: 'trf_test123', status: 'pending', amount: 50000, currency: 'INR', recipient: 'acc_xxx' }],
      },
    });

    const result = await createTransferFromPayment(
      {
        razorpayPaymentId: 'pay_xxx',
        linkedAccountId: 'acc_yyy',
        amountMinor: 50000,
        currency: 'INR',
      },
      'corr-123'
    );

    expect(result.transferId).toBe('trf_test123');
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.razorpay.com/v1/payments/pay_xxx/transfers',
      {
        transfers: [
          {
            account: 'acc_yyy',
            amount: 50000,
            currency: 'INR',
            on_hold: false,
          },
        ],
      },
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: expect.stringContaining('Basic '),
        }),
      })
    );
  });

  it('throws when amount < 100 paise', async () => {
    await expect(
      createTransferFromPayment({
        razorpayPaymentId: 'pay_xxx',
        linkedAccountId: 'acc_yyy',
        amountMinor: 50,
        currency: 'INR',
      })
    ).rejects.toThrow('at least 100 paise');

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('throws when currency is not INR', async () => {
    await expect(
      createTransferFromPayment({
        razorpayPaymentId: 'pay_xxx',
        linkedAccountId: 'acc_yyy',
        amountMinor: 50000,
        currency: 'USD',
      })
    ).rejects.toThrow('INR only');

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('throws when Razorpay not configured', async () => {
    const { isRazorpayConfigured } = require('../../../src/config/payment');
    isRazorpayConfigured.mockReturnValue(false);

    await expect(
      createTransferFromPayment({
        razorpayPaymentId: 'pay_xxx',
        linkedAccountId: 'acc_yyy',
        amountMinor: 50000,
        currency: 'INR',
      })
    ).rejects.toThrow('not configured');

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('propagates API error with message', async () => {
    mockedAxios.post.mockRejectedValue({
      response: {
        status: 400,
        data: { error: { description: 'Invalid account code' } },
      },
      message: 'Request failed',
    });

    await expect(
      createTransferFromPayment(
        {
          razorpayPaymentId: 'pay_xxx',
          linkedAccountId: 'acc_invalid',
          amountMinor: 50000,
          currency: 'INR',
        },
        'corr-err'
      )
    ).rejects.toThrow('Invalid account code');
  });

  it('includes notes when provided', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        entity: 'collection',
        count: 1,
        items: [{ id: 'trf_notes', status: 'pending' }],
      },
    });

    await createTransferFromPayment(
      {
        razorpayPaymentId: 'pay_xxx',
        linkedAccountId: 'acc_yyy',
        amountMinor: 50000,
        currency: 'INR',
        notes: { payment_id: 'pmt-uuid', appointment_id: 'apt-1' },
      },
      'corr-notes'
    );

    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        transfers: [
          expect.objectContaining({
            notes: { payment_id: 'pmt-uuid', appointment_id: 'apt-1' },
          }),
        ],
      }),
      expect.any(Object)
    );
  });
});
