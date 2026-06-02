/**
 * Unit tests for postTextQualitySampleHandler (Sub-batch D · task-text-D4).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Request, Response } from 'express';

jest.mock('../../../src/services/text-chat-quality-service', () => ({
  ingestTextChatQualitySample: jest.fn(),
}));

import { postTextQualitySampleHandler } from '../../../src/controllers/text-consult-quality-controller';
import { ingestTextChatQualitySample } from '../../../src/services/text-chat-quality-service';
import { TooManyRequestsError, UnauthorizedError } from '../../../src/utils/errors';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';

async function invoke(
  handler: (req: Request, res: Response, next: (err?: unknown) => void) => unknown,
  req: Request,
  res: Response,
): Promise<unknown> {
  let captured: unknown;
  const next = (err?: unknown): void => {
    captured = err;
  };
  await handler(req, res, next);
  await Promise.resolve();
  return captured;
}

function mockReqRes(overrides: Partial<Request> = {}): {
  req: Request;
  res: Response;
  status: jest.Mock;
  send: jest.Mock;
} {
  const status = jest.fn().mockReturnThis();
  const send = jest.fn();
  const res = { status, send } as unknown as Response;
  const req = {
    params: { sessionId: SESSION_ID },
    header: jest.fn((name: string) => {
      if (name.toLowerCase() === 'authorization') return 'Bearer test-jwt';
      return undefined;
    }),
    body: {
      session_id: SESSION_ID,
      roundtrip_p95_ms: 120,
      realtime_reconnects: 0,
      presence_flaps: 0,
      messages_in_window: 2,
    },
    correlationId: 'corr-1',
    url: `/api/v1/consultation/${SESSION_ID}/text-quality-sample`,
    method: 'POST',
    ...overrides,
  } as unknown as Request;
  return { req, res, status, send };
}

describe('postTextQualitySampleHandler', () => {
  const ingestMock = ingestTextChatQualitySample as jest.MockedFunction<
    typeof ingestTextChatQualitySample
  >;

  beforeEach(() => {
    ingestMock.mockReset();
    ingestMock.mockResolvedValue(undefined);
  });

  it('returns 204 on happy-path ingest', async () => {
    const { req, res, status, send } = mockReqRes();
    const err = await invoke(postTextQualitySampleHandler, req, res);
    expect(err).toBeUndefined();
    expect(ingestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pathSessionId: SESSION_ID,
        bearerJwt: 'test-jwt',
      }),
    );
    expect(status).toHaveBeenCalledWith(204);
    expect(send).toHaveBeenCalled();
  });

  it('rejects missing bearer token with 401', async () => {
    const { req, res, status } = mockReqRes({
      header: jest.fn(() => undefined),
    } as Partial<Request>);
    const err = await invoke(postTextQualitySampleHandler, req, res);
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(status).not.toHaveBeenCalled();
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it('propagates rate-limit errors from the service', async () => {
    ingestMock.mockRejectedValue(
      new TooManyRequestsError(
        'Chat quality samples are limited to one per 25 seconds per participant',
      ),
    );
    const { req, res } = mockReqRes();
    const err = await invoke(postTextQualitySampleHandler, req, res);
    expect(err).toBeInstanceOf(TooManyRequestsError);
  });
});
