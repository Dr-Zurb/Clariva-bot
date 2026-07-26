/**
 * Instagram Connect Service Unit Tests (e-task-2, e-task-4, ilr-18)
 *
 * Tests getDoctorIdByPageId: returns doctor_id when row exists,
 * null when no row; throws when admin client unavailable or query fails.
 * Tests disconnectInstagram: deletes row for doctor_id; idempotent when no row; throws when admin client null.
 * Tests Instagram Login OAuth URL scopes + short-lived code exchange parsing.
 *
 * No PHI in test data (TESTING.md).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import axios from 'axios';
import {
  getDoctorIdByPageId,
  disconnectInstagram,
  getInstagramDashboardStatus,
  buildMetaOAuthUrl,
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  refreshInstagramLongLivedToken,
} from '../../../src/services/instagram-connect-service';
import * as database from '../../../src/config/database';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

jest.mock('../../../src/config/env', () => {
  const actual = jest.requireActual('../../../src/config/env') as {
    env: Record<string, unknown>;
  };
  return {
    env: new Proxy(actual.env, {
      get(target, prop: string) {
        if (prop === 'INSTAGRAM_APP_ID') return 'ig-app-id-test';
        if (prop === 'INSTAGRAM_APP_SECRET') return 'ig-app-secret-test-min-32-chars!!';
        if (prop === 'INSTAGRAM_REDIRECT_URI') {
          return 'https://api.example.com/api/v1/settings/instagram/callback';
        }
        return target[prop];
      },
    }),
  };
});

const mockedDb = database as jest.Mocked<typeof database>;

const pageId = '123456789012345';
const doctorId = '550e8400-e29b-41d4-a716-446655440001';

function createMockSupabase(response: { data: unknown; error: unknown }) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(response as never),
  };
  const from = jest.fn().mockReturnValue(chain);
  return { from };
}

describe('Instagram Connect Service (e-task-2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns doctor_id when row exists for page_id', async () => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { doctor_id: doctorId },
        error: null,
      } as never),
    };
    const from = jest.fn().mockReturnValue(chain);
    const mockSupabase = { from };
    mockedDb.getSupabaseAdminClient.mockReturnValue(mockSupabase as never);

    const result = await getDoctorIdByPageId(pageId, 'corr-1');

    expect(result).toBe(doctorId);
    expect(from).toHaveBeenCalledWith('doctor_instagram');
    expect(chain.select).toHaveBeenCalledWith('doctor_id');
    expect(chain.eq).toHaveBeenCalledWith('instagram_page_id', pageId);
  });

  it('returns null when no row exists', async () => {
    const mockSupabase = createMockSupabase({ data: null, error: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue(mockSupabase as never);

    const result = await getDoctorIdByPageId(pageId);

    expect(result).toBeNull();
  });

  it('returns null when pageId is empty string', async () => {
    const result = await getDoctorIdByPageId('');
    expect(result).toBeNull();
    expect(mockedDb.getSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it('throws when supabase admin client is null', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(null as never);

    await expect(getDoctorIdByPageId(pageId)).rejects.toThrow(
      'Service role client not available'
    );
  });

  it('throws when query returns error', async () => {
    const mockSupabase = createMockSupabase({
      data: null,
      error: { code: 'PGRST116', message: 'Not found' },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(mockSupabase as never);

    await expect(getDoctorIdByPageId(pageId, 'corr-1')).rejects.toThrow();
  });
});

describe('getInstagramDashboardStatus (RBH-10)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns not_connected health when no Instagram row', async () => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null } as never),
    };
    const from = jest.fn().mockReturnValue(chain);
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    const r = await getInstagramDashboardStatus(doctorId, 'corr-health');

    expect(r.connected).toBe(false);
    expect(r.username).toBeNull();
    expect(r.health.level).toBe('not_connected');
    expect(r.health.reconnectRecommended).toBe(true);
    expect(from).toHaveBeenCalledWith('doctor_instagram');
  });
});

function createMockSupabaseDelete() {
  const resolved = { error: null };
  const eqChain = {
    then: (resolve: (v: { error: null }) => void) => resolve(resolved),
  };
  const deleteChain = {
    eq: jest.fn().mockReturnValue(eqChain),
  };
  const fromChain = {
    delete: jest.fn().mockReturnValue(deleteChain),
  };
  const from = jest.fn().mockReturnValue(fromChain);
  return { from, fromChain, deleteChain };
}

describe('Instagram Connect Service – disconnectInstagram (e-task-4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes row when doctor has Instagram link', async () => {
    const { from, fromChain, deleteChain } = createMockSupabaseDelete();
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    await disconnectInstagram(doctorId, 'corr-disconnect');

    expect(from).toHaveBeenCalledWith('doctor_instagram');
    expect(fromChain.delete).toHaveBeenCalled();
    expect(deleteChain.eq).toHaveBeenCalledWith('doctor_id', doctorId);
  });

  it('succeeds when no row exists (idempotent)', async () => {
    const { from, fromChain, deleteChain } = createMockSupabaseDelete();
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    await expect(disconnectInstagram(doctorId, 'corr-idem')).resolves.not.toThrow();
    expect(from).toHaveBeenCalledWith('doctor_instagram');
    expect(fromChain.delete).toHaveBeenCalled();
    expect(deleteChain.eq).toHaveBeenCalledWith('doctor_id', doctorId);
  });

  it('throws when supabase admin client is null', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(null as never);

    await expect(disconnectInstagram(doctorId, 'corr-1')).rejects.toThrow(
      'Service role client not available'
    );
  });
});

describe('Instagram Login OAuth (ilr-18)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('buildMetaOAuthUrl uses Instagram authorize + business scopes', () => {
    const url = buildMetaOAuthUrl('signed-state');
    expect(url).toContain('https://www.instagram.com/oauth/authorize?');
    expect(url).toContain('client_id=ig-app-id-test');
    expect(url).toContain('instagram_business_basic');
    expect(url).toContain('instagram_business_manage_messages');
    expect(url).toContain('instagram_business_manage_comments');
    expect(url).not.toContain('pages_show_list');
    expect(url).not.toContain('facebook.com');
    expect(url).toContain('state=signed-state');
  });

  it('exchangeCodeForShortLivedToken POSTs form body and parses top-level response', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { access_token: 'short-tok', user_id: '17841400000000000' },
    } as never);

    const result = await exchangeCodeForShortLivedToken('auth-code#_', 'corr-x');

    expect(result).toEqual({
      accessToken: 'short-tok',
      userId: '17841400000000000',
    });
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.instagram.com/oauth/access_token',
      expect.stringContaining('grant_type=authorization_code'),
      expect.objectContaining({
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
    );
    const body = String(mockedAxios.post.mock.calls[0]?.[1]);
    expect(body).toContain('code=auth-code');
    expect(body).not.toContain('%23_');
  });

  it('exchangeForLongLivedToken uses ig_exchange_token', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: { access_token: 'long-tok', expires_in: 5184000 },
    } as never);

    await expect(exchangeForLongLivedToken('short-tok', 'corr-ll')).resolves.toEqual({
      accessToken: 'long-tok',
      expiresIn: 5184000,
    });
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://graph.instagram.com/access_token',
      expect.objectContaining({
        params: expect.objectContaining({
          grant_type: 'ig_exchange_token',
          access_token: 'short-tok',
        }),
      })
    );
  });

  it('refreshInstagramLongLivedToken returns null on failure (no throw)', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('network'));
    await expect(
      refreshInstagramLongLivedToken('long-tok', 'corr-rf')
    ).resolves.toBeNull();
  });
});
