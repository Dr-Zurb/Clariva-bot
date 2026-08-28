/**
 * Auth email-status service (auth-password · AP-D17 + signup-orphan harden).
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const listUsers = jest.fn<() => Promise<unknown>>();
const getSupabaseAdminClient = jest.fn<() => unknown>();

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: () => getSupabaseAdminClient(),
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
  },
}));

import { getEmailStatus } from '../../../src/services/auth-email-status-service';
import { InternalError } from '../../../src/utils/errors';

describe('getEmailStatus', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    listUsers.mockReset();
    getSupabaseAdminClient.mockReset();
    getSupabaseAdminClient.mockReturnValue({
      auth: { admin: { listUsers } },
    });
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('throws when admin client missing', async () => {
    getSupabaseAdminClient.mockReturnValue(null);
    await expect(getEmailStatus('doc@example.com', 'c1')).rejects.toBeInstanceOf(
      InternalError
    );
  });

  it('returns exists+confirmed when GoTrue email filter matches a confirmed user', async () => {
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: true,
      json: async () => ({
        users: [
          {
            email: 'doc@example.com',
            email_confirmed_at: '2026-07-01T00:00:00Z',
          },
        ],
      }),
    } as Response);

    await expect(getEmailStatus('Doc@Example.com', 'c1')).resolves.toEqual({
      exists: true,
      confirmed: true,
    });
    expect(listUsers).not.toHaveBeenCalled();
  });

  it('returns exists:true confirmed:false for an unconfirmed stub', async () => {
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: true,
      json: async () => ({
        users: [{ email: 'stub@example.com', email_confirmed_at: null }],
      }),
    } as Response);

    await expect(getEmailStatus('stub@example.com', 'c1')).resolves.toEqual({
      exists: true,
      confirmed: false,
    });
  });

  it('returns exists:false when GoTrue email filter returns empty', async () => {
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: true,
      json: async () => ({ users: [] }),
    } as Response);

    await expect(getEmailStatus('new@example.com', 'c1')).resolves.toEqual({
      exists: false,
      confirmed: false,
    });
    expect(listUsers).not.toHaveBeenCalled();
  });

  it('falls back to listUsers scan when filter is ignored', async () => {
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: true,
      json: async () => ({ users: [{ email: 'other@example.com' }] }),
    } as Response);
    listUsers.mockResolvedValue({
      data: {
        users: [
          { email: 'other@example.com', email_confirmed_at: '2026-01-01T00:00:00Z' },
          { email: 'doc@example.com', email_confirmed_at: '2026-01-02T00:00:00Z' },
        ],
      },
      error: null,
    });

    await expect(getEmailStatus('doc@example.com', 'c1')).resolves.toEqual({
      exists: true,
      confirmed: true,
    });
    expect(listUsers).toHaveBeenCalled();
  });
});
