import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

import { getSupabaseAdminClient } from '../../../src/config/database';
import {
  findVisitPageLink,
  isVisitPageCode,
  mintVisitPageLink,
} from '../../../src/services/visit-page-link-service';

const adminMock = getSupabaseAdminClient as jest.MockedFunction<typeof getSupabaseAdminClient>;

const CONV = '55555555-5555-4555-8555-555555555555';
const DOC = '11111111-1111-4111-8111-111111111111';

describe('visit page link', () => {
  beforeEach(() => {
    adminMock.mockReset();
  });

  it('treats only the 8-character code as a short link', () => {
    expect(isVisitPageCode('k7m2pq9x')).toBe(true);
    expect(isVisitPageCode('matching-token')).toBe(false);
    expect(isVisitPageCode('eyJhbGci.sig')).toBe(false);
  });

  it('stores a code and returns a short clinic link', async () => {
    const inserted: Array<Record<string, unknown>> = [];
    adminMock.mockReturnValue({
      from: () => ({
        insert: async (row: Record<string, unknown>) => {
          inserted.push(row);
          return { error: null };
        },
      }),
    } as never);

    const url = new URL(
      await mintVisitPageLink({
        conversationId: CONV,
        doctorId: DOC,
        publicSlug: 'city-clinic',
        purpose: 'change',
        correlationId: 'corr',
      })
    );

    expect(url.pathname).toBe('/d/city-clinic');
    expect(url.searchParams.get('for')).toBe('change');
    expect(isVisitPageCode(url.searchParams.get('c') ?? '')).toBe(true);
    expect(inserted[0]).toEqual(
      expect.objectContaining({
        conversation_id: CONV,
        doctor_id: DOC,
        purpose: 'change',
      })
    );
  });

  it('falls back to the signed token when the short-code table is unavailable', async () => {
    process.env.BOOKING_TOKEN_SECRET = 'test-booking-token-secret';
    jest.resetModules();
    const { getSupabaseAdminClient: freshAdmin } = await import('../../../src/config/database');
    const { mintVisitPageLink: mint } = await import('../../../src/services/visit-page-link-service');
    (freshAdmin as jest.MockedFunction<typeof freshAdmin>).mockReturnValue({
      from: () => ({
        insert: async () => ({ error: { code: '42P01' } }),
      }),
    } as never);

    const url = new URL(
      await mint({
        conversationId: CONV,
        doctorId: DOC,
        publicSlug: 'city-clinic',
        purpose: 'times',
        correlationId: 'corr',
      })
    );
    expect(url.searchParams.get('for')).toBe('times');
    expect(url.searchParams.get('c') ?? '').toContain('.');
  });

  it('reads an active code and ignores an expired one', async () => {
    const row = {
      conversation_id: CONV,
      doctor_id: DOC,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    };
    adminMock.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: row, error: null }),
          }),
        }),
      }),
    } as never);

    await expect(findVisitPageLink('k7m2pq9x', 'corr')).resolves.toEqual({
      conversationId: CONV,
      doctorId: DOC,
    });

    adminMock.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { ...row, expires_at: new Date(Date.now() - 1000).toISOString() },
              error: null,
            }),
          }),
        }),
      }),
    } as never);
    await expect(findVisitPageLink('k7m2pq9x', 'corr')).resolves.toBeNull();
  });
});
