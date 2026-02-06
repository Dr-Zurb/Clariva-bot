/**
 * Doctor Settings Service Unit Tests (e-task-4.1)
 *
 * Tests getDoctorSettings: returns row when found, null when no row or error.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { getDoctorSettings } from '../../../src/services/doctor-settings-service';
import * as database from '../../../src/config/database';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

const mockedDb = database as jest.Mocked<typeof database>;

const doctorId = '550e8400-e29b-41d4-a716-446655440001';

function createMockSupabase(
  response: { data: unknown; error: unknown }
) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(response as never),
  };
  const from = jest.fn().mockReturnValue(chain);
  return { from };
}

describe('Doctor Settings Service (e-task-4.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns doctor settings when row exists', async () => {
    const row = {
      doctor_id: doctorId,
      appointment_fee_minor: 75000,
      appointment_fee_currency: 'INR',
      country: 'IN',
      created_at: '2026-01-30T00:00:00Z',
      updated_at: '2026-01-30T00:00:00Z',
    };
    const mockSupabase = createMockSupabase({ data: row, error: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue(mockSupabase as never);

    const result = await getDoctorSettings(doctorId);

    expect(result).not.toBeNull();
    expect(result?.doctor_id).toBe(doctorId);
    expect(result?.appointment_fee_minor).toBe(75000);
    expect(result?.appointment_fee_currency).toBe('INR');
    expect(result?.country).toBe('IN');
    expect(mockSupabase.from).toHaveBeenCalledWith('doctor_settings');
  });

  it('returns null when no row exists', async () => {
    const mockSupabase = createMockSupabase({ data: null, error: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue(mockSupabase as never);

    const result = await getDoctorSettings(doctorId);

    expect(result).toBeNull();
  });

  it('returns null when supabase admin client is null', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(null as never);

    const result = await getDoctorSettings(doctorId);

    expect(result).toBeNull();
  });

  it('returns null when query errors', async () => {
    const mockSupabase = createMockSupabase({
      data: null,
      error: { message: 'DB error' },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(mockSupabase as never);

    const result = await getDoctorSettings(doctorId);

    expect(result).toBeNull();
  });
});
