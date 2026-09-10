/**
 * Facebook connect service unit tests (fbm-03 + fbm-07).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import axios from 'axios';
import {
  buildFacebookOAuthUrl,
  createFacebookState,
  verifyFacebookState,
  exchangeFacebookCodeForUserToken,
  probeFacebookPageToken,
  getFacebookConnectionStatus,
} from '../../../src/services/facebook-connect-service';
import { getSupabaseAdminClient } from '../../../src/config/database';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockGetSupabase = getSupabaseAdminClient as jest.MockedFunction<
  typeof getSupabaseAdminClient
>;

jest.mock('../../../src/config/env', () => {
  const actual = jest.requireActual('../../../src/config/env') as {
    env: Record<string, unknown>;
  };
  return {
    env: new Proxy(actual.env, {
      get(target, prop: string) {
        if (prop === 'FACEBOOK_APP_ID') return 'fb-app-id-test';
        if (prop === 'FACEBOOK_APP_SECRET') return 'fb-app-secret-test-min-32-chars!!!!';
        if (prop === 'FACEBOOK_REDIRECT_URI') {
          return 'https://api.example.com/api/v1/settings/facebook/callback';
        }
        return target[prop];
      },
    }),
  };
});

const doctorId = '7ab212da-2694-4e6d-97ff-c71ab451ef52';

describe('Facebook Connect OAuth (fbm-03)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('buildFacebookOAuthUrl uses Facebook dialog + page scopes', () => {
    const url = buildFacebookOAuthUrl('signed-state');
    expect(url).toContain('https://www.facebook.com/v18.0/dialog/oauth?');
    expect(url).toContain('client_id=fb-app-id-test');
    expect(url).toContain('pages_show_list');
    expect(url).toContain('pages_messaging');
    expect(url).toContain('business_management');
    expect(url).toContain('pages_manage_engagement');
    expect(url).toContain('pages_read_user_content');
    expect(url).toContain('state=signed-state');
  });

  it('createFacebookState / verifyFacebookState round-trip', () => {
    const state = createFacebookState(doctorId);
    expect(verifyFacebookState(state)).toBe(doctorId);
  });

  it('verifyFacebookState rejects tampered state', () => {
    const state = createFacebookState(doctorId);
    expect(() => verifyFacebookState(state + 'x')).toThrow();
  });

  it('exchangeFacebookCodeForUserToken strips #_ fragment from code', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: { access_token: 'short-tok' },
    } as never);

    const result = await exchangeFacebookCodeForUserToken('auth-code#_', 'corr-x');
    expect(result).toEqual({ accessToken: 'short-tok' });
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://graph.facebook.com/v18.0/oauth/access_token',
      expect.objectContaining({
        params: expect.objectContaining({ code: 'auth-code' }),
      })
    );
  });
});

describe('Facebook Page token health (fbm-07)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('probeFacebookPageToken returns ok when is_valid', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: { data: { is_valid: true, expires_at: 0, app_id: 'fb-app-id-test' } },
    } as never);

    const probe = await probeFacebookPageToken('page-tok', 'corr-h');
    expect(probe).toEqual({
      ok: true,
      requestFailed: false,
      invalidToken: false,
      errorCode: null,
      expiresAtUnix: 0,
    });
  });

  it('probeFacebookPageToken returns invalidToken when is_valid false', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: { data: { is_valid: false, error: { code: 190 } } },
    } as never);

    const probe = await probeFacebookPageToken('bad-tok', 'corr-h');
    expect(probe.ok).toBe(false);
    expect(probe.invalidToken).toBe(true);
    expect(probe.errorCode).toBe('190');
  });

  it('getFacebookConnectionStatus returns reconnectRecommended on invalid token', async () => {
    mockGetSupabase.mockReturnValue({
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({
              data: {
                facebook_page_id: '1041330372407980',
                page_name: 'Halo Aid',
                page_access_token: 'page-tok',
                page_token_expires_at: null,
                facebook_health_checked_at: null,
                facebook_health_level: null,
                facebook_health_error_code: null,
                facebook_last_dm_success_at: null,
              },
              error: null,
            })),
          })),
        })),
        update: jest.fn(() => ({
          eq: jest.fn(async () => ({ error: null })),
        })),
      })),
    } as never);

    mockedAxios.get.mockResolvedValueOnce({
      data: { data: { is_valid: false, error: { code: 190 } } },
    } as never);

    const status = await getFacebookConnectionStatus(doctorId, 'corr-h2');
    expect(status.connected).toBe(true);
    expect(status.health.level).toBe('error');
    expect(status.health.reconnectRecommended).toBe(true);
  });

  it('getFacebookConnectionStatus returns ok health when token valid', async () => {
    mockGetSupabase.mockReturnValue({
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({
              data: {
                facebook_page_id: '1041330372407980',
                page_name: 'Halo Aid',
                page_access_token: 'page-tok',
                page_token_expires_at: null,
                facebook_health_checked_at: null,
                facebook_health_level: null,
                facebook_health_error_code: null,
                facebook_last_dm_success_at: new Date().toISOString(),
              },
              error: null,
            })),
          })),
        })),
        update: jest.fn(() => ({
          eq: jest.fn(async () => ({ error: null })),
        })),
      })),
    } as never);

    mockedAxios.get.mockResolvedValueOnce({
      data: { data: { is_valid: true, expires_at: 0 } },
    } as never);

    const status = await getFacebookConnectionStatus(doctorId, 'corr-h3');
    expect(status.health.level).toBe('ok');
    expect(status.health.reconnectRecommended).toBe(false);
    expect(status.health.message).toMatch(/healthy/i);
  });
});
