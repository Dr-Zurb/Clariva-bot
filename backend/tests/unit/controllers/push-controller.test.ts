/**
 * push-controller unit tests (task-text-D6b).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Request, Response } from 'express';

jest.mock('../../../src/services/push-subscription-service', () => ({
  extractBearerJwt: jest.fn(),
  resolvePushAuthFromBearer: jest.fn(),
  upsertPushSubscription: jest.fn(),
  revokePushSubscription: jest.fn(),
  listActivePushSubscriptions: jest.fn(),
}));

import {
  listPushSubscriptionsHandler,
  subscribePushHandler,
  unsubscribePushHandler,
} from '../../../src/controllers/push-controller';
import {
  extractBearerJwt,
  listActivePushSubscriptions,
  resolvePushAuthFromBearer,
  revokePushSubscription,
  upsertPushSubscription,
} from '../../../src/services/push-subscription-service';
import { UnauthorizedError } from '../../../src/utils/errors';

const mockedExtract = extractBearerJwt as jest.MockedFunction<typeof extractBearerJwt>;
const mockedResolve = resolvePushAuthFromBearer as jest.MockedFunction<
  typeof resolvePushAuthFromBearer
>;
const mockedUpsert = upsertPushSubscription as jest.MockedFunction<typeof upsertPushSubscription>;
const mockedRevoke = revokePushSubscription as jest.MockedFunction<typeof revokePushSubscription>;
const mockedList = listActivePushSubscriptions as jest.MockedFunction<
  typeof listActivePushSubscriptions
>;

const PRINCIPAL = { userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', userRole: 'patient' as const };
const SUB_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

async function invoke(
  handler: (req: Request, res: Response, next: (err?: unknown) => void) => unknown,
  req: Request,
  res: Response,
): Promise<unknown> {
  let captured: unknown;
  const next = (err?: unknown): void => {
    captured = err;
  };
  handler(req, res, next);
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
  return captured;
}

function mockReqRes(overrides: Partial<Request> = {}): {
  req: Request;
  res: Response;
  status: jest.Mock;
  json: jest.Mock;
  send: jest.Mock;
} {
  const status = jest.fn().mockReturnThis();
  const json = jest.fn();
  const send = jest.fn();
  const res = { status, json, send } as unknown as Response;
  const req = {
    params: {},
    header: jest.fn((name: string) => {
      if (name.toLowerCase() === 'authorization') return 'Bearer test-jwt';
      return undefined;
    }),
    body: {
      endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint-id',
      p256dhKey: 'p256-key',
      authKey: 'auth-key',
      userAgent: 'jest',
    },
    correlationId: 'corr-push',
    ...overrides,
  } as unknown as Request;
  return { req, res, status, json, send };
}

describe('push-controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedExtract.mockReturnValue('test-jwt');
    mockedResolve.mockResolvedValue(PRINCIPAL);
  });

  describe('subscribePushHandler', () => {
    it('returns 201 with subscription id on success', async () => {
      mockedUpsert.mockResolvedValue({ id: SUB_ID });
      const { req, res, status, json } = mockReqRes();

      const err = await invoke(subscribePushHandler, req, res);

      expect(err).toBeUndefined();
      expect(mockedUpsert).toHaveBeenCalledWith(
        PRINCIPAL,
        expect.objectContaining({ endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint-id' }),
      );
      expect(status).toHaveBeenCalledWith(201);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: { id: SUB_ID },
        }),
      );
    });

    it('propagates missing bearer as unauthorized', async () => {
      mockedExtract.mockImplementation(() => {
        throw new UnauthorizedError('Bearer token is required');
      });
      const { req, res } = mockReqRes({
        header: jest.fn().mockReturnValue(undefined),
      } as Partial<Request>);

      const err = await invoke(subscribePushHandler, req, res);
      expect(err).toBeInstanceOf(UnauthorizedError);
    });
  });

  describe('unsubscribePushHandler', () => {
    it('returns 204 after soft revoke', async () => {
      mockedRevoke.mockResolvedValue(undefined);
      const { req, res, status, send } = mockReqRes({
        params: { id: SUB_ID },
      } as Partial<Request>);

      const err = await invoke(unsubscribePushHandler, req, res);

      expect(err).toBeUndefined();
      expect(mockedRevoke).toHaveBeenCalledWith(PRINCIPAL, { id: SUB_ID });
      expect(status).toHaveBeenCalledWith(204);
      expect(send).toHaveBeenCalled();
    });
  });

  describe('listPushSubscriptionsHandler', () => {
    it('returns active subscriptions for the principal', async () => {
      mockedList.mockResolvedValue([
        {
          id: SUB_ID,
          endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint-id',
          user_agent: 'jest',
          created_at: '2026-05-24T00:00:00.000Z',
          last_used_at: null,
        },
      ]);
      const { req, res, status, json } = mockReqRes();

      const err = await invoke(listPushSubscriptionsHandler, req, res);

      expect(err).toBeUndefined();
      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: {
            subscriptions: expect.arrayContaining([
              expect.objectContaining({ id: SUB_ID }),
            ]),
          },
        }),
      );
    });
  });
});
