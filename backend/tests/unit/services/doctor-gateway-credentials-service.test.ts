// @ts-nocheck
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  connectDoctorGateway,
  getDoctorGatewayPublicStatus,
  maskKeyId,
  setPaymentCollectionMode,
} from '../../../src/services/doctor-gateway-credentials-service';
import * as database from '../../../src/config/database';
import { razorpayAdapter } from '../../../src/adapters/razorpay-adapter';
import * as encryption from '../../../src/utils/encryption';
import { ValidationError } from '../../../src/utils/errors';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));
jest.mock('../../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));
jest.mock('../../../src/adapters/razorpay-adapter', () => ({
  razorpayAdapter: { verifyCredentials: jest.fn() },
}));
jest.mock('../../../src/utils/encryption', () => ({
  encryptPayload: jest.fn(() => 'encrypted-secret'),
  decryptPayload: jest.fn(() => 'plain-secret'),
}));

const mockedDb = database as jest.Mocked<typeof database>;
const mockedRzp = razorpayAdapter as jest.Mocked<typeof razorpayAdapter>;

describe('doctor-gateway-credentials-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('masks a key id and never returns the secret', async () => {
    expect(maskKeyId('rzp_live_abcdefghij')).toBe('rzp_liv…ghij');
    const from = jest.fn((table: string) => {
      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn(),
      };
      if (table === 'doctor_payment_credentials') {
        chain.maybeSingle.mockResolvedValue({
          data: {
            key_id: 'rzp_live_abcdefghij',
            status: 'connected',
            last_verified_at: '2026-08-22T00:00:00Z',
            gateway: 'razorpay',
            webhook_secret_encrypted: 'enc-webhook',
          },
          error: null,
        });
      } else {
        chain.maybeSingle.mockResolvedValue({
          data: { payment_collection_mode: 'bookings_only' },
          error: null,
        });
      }
      return chain;
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    const status = await getDoctorGatewayPublicStatus('doc-1', 'corr');
    expect(status.maskedKeyId).toBe('rzp_liv…ghij');
    expect(status.webhookConfigured).toBe(true);
    expect(JSON.stringify(status)).not.toMatch(/enc-webhook|plain-secret|keySecret/i);
    expect(status).not.toHaveProperty('keySecret');
  });

  it('rejects a typo at connect time', async () => {
    mockedRzp.verifyCredentials.mockResolvedValue(false);
    await expect(
      connectDoctorGateway('doc-1', 'rzp_test_abcdefgh', 'wrong-secret-value', 'corr')
    ).rejects.toThrow(ValidationError);
    expect(encryption.encryptPayload).not.toHaveBeenCalled();
  });

  it('refuses prepaid without a connected gateway', async () => {
    const from = jest.fn((table: string) => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    }));
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    await expect(setPaymentCollectionMode('doc-1', 'prepaid', 'corr')).rejects.toThrow(
      ValidationError
    );
  });
});
