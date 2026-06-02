/**
 * push-notification-service unit tests (task-text-D6a).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockSendNotification = jest.fn<(subscription: unknown, payload: string) => Promise<void>>();

jest.mock('web-push', () => ({
  __esModule: true,
  default: {
    setVapidDetails: jest.fn(),
    sendNotification: mockSendNotification,
  },
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    WEB_PUSH_VAPID_PUBLIC_KEY: 'test-public-key',
    WEB_PUSH_VAPID_PRIVATE_KEY: 'test-private-key',
    WEB_PUSH_CONTACT_EMAIL: 'mailto:ops@clariva.health',
  },
}));

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

jest.mock('../../../src/config/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

import * as database from '../../../src/config/database';
import { logger } from '../../../src/config/logger';
import {
  resetPushVapidConfigForTests,
  buildPushNotificationTag,
  sendPushToSession,
  sendPushToUser,
} from '../../../src/services/push-notification-service';

const mockedDb = database as jest.Mocked<typeof database>;
const mockedLogger = logger as jest.Mocked<typeof logger>;

const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SESSION_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const DOCTOR_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PATIENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

interface SubRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
  revoked_at?: string | null;
  last_used_at?: string | null;
}

function createAdminMock(rows: SubRow[]) {
  const from = jest.fn((table: string) => {
    if (table === 'consultation_sessions') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { doctor_id: DOCTOR_ID, patient_id: PATIENT_ID },
          error: null,
        } as never),
      };
    }

    if (table !== 'web_push_subscriptions') {
      throw new Error(`unexpected table ${table}`);
    }

    let op: 'select' | 'update' = 'select';
    let filterUserId: string | null = null;
    let filterId: string | null = null;
    let updatePayload: Record<string, unknown> = {};

    const chain = {
      select: jest.fn(() => {
        op = 'select';
        return chain;
      }),
      eq: jest.fn((col: string, val: string) => {
        if (col === 'user_id') filterUserId = val;
        if (col === 'id') filterId = val;
        return chain;
      }),
      is: jest.fn(() => chain),
      update: jest.fn((payload: Record<string, unknown>) => {
        op = 'update';
        updatePayload = payload;
        return chain;
      }),
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        if (op === 'select') {
          const data = rows.filter(
            (r) => r.revoked_at == null && (!filterUserId || r.user_id === filterUserId),
          );
          return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
        }
        if (op === 'update' && filterId) {
          const row = rows.find((r) => r.id === filterId);
          if (row) Object.assign(row, updatePayload);
          return Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected);
        }
        return Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected);
      },
    };

    return chain;
  });

  return { from, rows };
}

const payload = {
  title: 'Dr. Sharma sent a message',
  body: 'Take 5mg twice a day',
};

describe('push-notification-service · buildPushNotificationTag', () => {
  it('uses session_id:modality for cross-modality dedup', () => {
    expect(buildPushNotificationTag(SESSION_ID, 'text')).toBe(`${SESSION_ID}:text`);
    expect(buildPushNotificationTag(SESSION_ID, 'voice')).toBe(`${SESSION_ID}:voice`);
    expect(buildPushNotificationTag(SESSION_ID, 'video')).toBe(`${SESSION_ID}:video`);
  });
});

describe('push-notification-service · sendPushToUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetPushVapidConfigForTests();
    mockSendNotification.mockResolvedValue(undefined);
  });

  it('returns zero counts when user has no active subscriptions (no throw)', async () => {
    const { from } = createAdminMock([]);
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    const result = await sendPushToUser({ userId: USER_ID, payload });

    expect(result).toEqual({ delivered: 0, failed: 0, revoked: 0 });
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('loads only non-revoked subscriptions and delivers to each', async () => {
    const { from, rows } = createAdminMock([
      {
        id: 'sub-1',
        user_id: USER_ID,
        endpoint: 'https://push.example/1',
        p256dh_key: 'p256-1',
        auth_key: 'auth-1',
      },
      {
        id: 'sub-2',
        user_id: USER_ID,
        endpoint: 'https://push.example/2',
        p256dh_key: 'p256-2',
        auth_key: 'auth-2',
      },
      {
        id: 'sub-revoked',
        user_id: USER_ID,
        endpoint: 'https://push.example/revoked',
        p256dh_key: 'p256-r',
        auth_key: 'auth-r',
        revoked_at: '2026-01-01T00:00:00.000Z',
      },
    ]);
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    const result = await sendPushToUser({ userId: USER_ID, payload });

    expect(result).toEqual({ delivered: 2, failed: 0, revoked: 0 });
    expect(mockSendNotification).toHaveBeenCalledTimes(2);
    expect(rows[0].last_used_at).toBeTruthy();
    expect(rows[1].last_used_at).toBeTruthy();
  });

  it('marks subscription revoked on 410 Gone', async () => {
    const { from, rows } = createAdminMock([
      {
        id: 'sub-gone',
        user_id: USER_ID,
        endpoint: 'https://push.example/gone',
        p256dh_key: 'p256-g',
        auth_key: 'auth-g',
      },
    ]);
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    const goneErr = Object.assign(new Error('Gone'), { statusCode: 410 });
    mockSendNotification.mockRejectedValue(goneErr);

    const result = await sendPushToUser({ userId: USER_ID, payload });

    expect(result).toEqual({ delivered: 0, failed: 0, revoked: 1 });
    expect(rows[0].revoked_at).toBeTruthy();
  });

  it('does not revoke on transient 5xx errors', async () => {
    const { from, rows } = createAdminMock([
      {
        id: 'sub-5xx',
        user_id: USER_ID,
        endpoint: 'https://push.example/5xx',
        p256dh_key: 'p256-5',
        auth_key: 'auth-5',
      },
    ]);
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    const serverErr = Object.assign(new Error('Server error'), { statusCode: 503 });
    mockSendNotification.mockRejectedValue(serverErr);

    const result = await sendPushToUser({ userId: USER_ID, payload });

    expect(result).toEqual({ delivered: 0, failed: 1, revoked: 0 });
    expect(rows[0].revoked_at).toBeUndefined();
  });

  it('never logs payload.body (PHI hygiene)', async () => {
    const { from } = createAdminMock([
      {
        id: 'sub-phi',
        user_id: USER_ID,
        endpoint: 'https://push.example/phi',
        p256dh_key: 'p256-p',
        auth_key: 'auth-p',
      },
    ]);
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    await sendPushToUser({ userId: USER_ID, payload });

    const allLogCalls = [
      ...mockedLogger.info.mock.calls,
      ...mockedLogger.warn.mock.calls,
      ...mockedLogger.error.mock.calls,
      ...mockedLogger.debug.mock.calls,
    ];

    for (const call of allLogCalls) {
      const serialized = JSON.stringify(call);
      expect(serialized).not.toContain(payload.body);
    }
  });

  it('emits structured telemetry without payload body', async () => {
    const { from } = createAdminMock([
      {
        id: 'sub-tel',
        user_id: USER_ID,
        endpoint: 'https://push.example/tel',
        p256dh_key: 'p256-t',
        auth_key: 'auth-t',
      },
    ]);
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    await sendPushToUser({
      userId: USER_ID,
      payload,
      sessionId: SESSION_ID,
      modality: 'text',
    });

    const telemetryCall = mockedLogger.info.mock.calls.find(
      (call) => call[1] === 'Web Push send telemetry',
    );
    expect(telemetryCall).toBeDefined();
    expect(telemetryCall?.[0]).toEqual(
      expect.objectContaining({
        user_id: USER_ID,
        session_id: SESSION_ID,
        modality: 'text',
        delivered: 1,
      }),
    );
    expect(JSON.stringify(telemetryCall?.[0])).not.toContain(payload.body);
  });
});

describe('push-notification-service · sendPushToSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetPushVapidConfigForTests();
    mockSendNotification.mockResolvedValue(undefined);
  });

  it('fans to patient when sender is doctor', async () => {
    const { from } = createAdminMock([
      {
        id: 'sub-patient',
        user_id: PATIENT_ID,
        endpoint: 'https://push.example/patient',
        p256dh_key: 'p256-p',
        auth_key: 'auth-p',
      },
    ]);
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    const result = await sendPushToSession({
      sessionId: SESSION_ID,
      senderRole: 'doctor',
      modality: 'text',
      payload,
    });

    expect(result.delivered).toBe(1);
    expect(mockSendNotification).toHaveBeenCalledTimes(1);
    const sentPayload = JSON.parse(mockSendNotification.mock.calls[0][1] as string);
    expect(sentPayload.tag).toBe(`${SESSION_ID}:text`);
  });
});
