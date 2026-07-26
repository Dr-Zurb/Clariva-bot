/**
 * Meta data-deletion callback route tests (instagram-launch-readiness · ilr-02).
 *
 * Covers:
 *   - missing signed_request → 400,
 *   - a validly-signed request → processes and returns the Meta-required shape,
 *   - a badly-signed request → returns a valid shape but does NOT process,
 *   - GET /status returns real progress (and 400 without a code).
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createHmac } from 'crypto';
import type { Request, Response } from 'express';

const APP_SECRET = 'test-app-secret';

jest.mock('../../../src/config/env', () => ({
  env: {
    INSTAGRAM_APP_SECRET: 'test-app-secret',
    FRONTEND_URL: 'https://app.example.com',
  },
}));
jest.mock('../../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockProcess = jest.fn<
  (...args: unknown[]) => Promise<{ confirmationCode: string; status: string }>
>();
const mockGetStatus = jest.fn<(...args: unknown[]) => Promise<string>>();
jest.mock('../../../src/services/meta-data-deletion-service', () => ({
  recordAndProcessMetaDeletion: (...a: unknown[]) => mockProcess(...a),
  getMetaDeletionStatus: (...a: unknown[]) => mockGetStatus(...a),
}));

import dataDeletionRouter from '../../../src/routes/data-deletion';

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeSignedRequest(payloadObj: unknown, secret: string): string {
  const payload = b64url(Buffer.from(JSON.stringify(payloadObj)));
  const sig = b64url(createHmac('sha256', secret).update(payload).digest());
  return `${sig}.${payload}`;
}

type Layer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (req: Request, res: Response) => unknown }>;
  };
};

function getHandler(
  path: string,
  method: 'post' | 'get'
): (req: Request, res: Response) => Promise<unknown> {
  const stack = (dataDeletionRouter as unknown as { stack: Layer[] }).stack;
  const layer = stack.find((l) => l.route?.path === path && l.route.methods[method] === true);
  if (!layer?.route?.stack[0]?.handle) {
    throw new Error(`${method.toUpperCase()} ${path} handler not found`);
  }
  return layer.route.stack[0].handle as (req: Request, res: Response) => Promise<unknown>;
}

function makeRes(): { res: Response; getStatus: () => number; getPayload: () => unknown } {
  const out = { statusCode: 0, payload: undefined as unknown };
  const res = {
    status(code: number) {
      out.statusCode = code;
      return res;
    },
    json(body: unknown) {
      out.payload = body;
      return res;
    },
  } as unknown as Response;
  return { res, getStatus: () => out.statusCode, getPayload: () => out.payload };
}

function makeReq(over: Partial<Request>): Request {
  return { correlationId: 'corr-route', body: {}, query: {}, ...over } as unknown as Request;
}

describe('POST /data-deletion-callback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProcess.mockResolvedValue({ confirmationCode: 'del-123-abc', status: 'completed' });
  });

  it('returns 400 when signed_request is missing', async () => {
    const box = makeRes();
    await getHandler('/', 'post')(makeReq({ body: {} }), box.res);

    expect(box.getStatus()).toBe(400);
    expect(mockProcess).not.toHaveBeenCalled();
  });

  it('processes a validly-signed request and returns the Meta shape', async () => {
    const signed = makeSignedRequest({ user_id: 'fb-user-9' }, APP_SECRET);
    const box = makeRes();

    await getHandler('/', 'post')(makeReq({ body: { signed_request: signed } }), box.res);

    expect(mockProcess).toHaveBeenCalledWith('fb-user-9', 'corr-route');
    expect(box.getStatus()).toBe(200);
    expect(box.getPayload()).toEqual({
      url: 'https://app.example.com/data-deletion?code=del-123-abc',
      confirmation_code: 'del-123-abc',
    });
  });

  it('does NOT process a badly-signed request but still returns a valid shape', async () => {
    const signed = makeSignedRequest({ user_id: 'fb-user-9' }, 'wrong-secret');
    const box = makeRes();

    await getHandler('/', 'post')(makeReq({ body: { signed_request: signed } }), box.res);

    expect(mockProcess).not.toHaveBeenCalled();
    expect(box.getStatus()).toBe(200);
    const payload = box.getPayload() as { url: string; confirmation_code: string };
    expect(payload.confirmation_code).toContain('invalid');
    expect(payload.url).toContain('code=');
  });
});

describe('GET /data-deletion-callback/status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 without a code', async () => {
    const box = makeRes();
    await getHandler('/status', 'get')(makeReq({ query: {} }), box.res);
    expect(box.getStatus()).toBe(400);
    expect(mockGetStatus).not.toHaveBeenCalled();
  });

  it('returns real progress for a known code', async () => {
    mockGetStatus.mockResolvedValueOnce('completed');
    const box = makeRes();

    await getHandler('/status', 'get')(makeReq({ query: { code: 'del-123-abc' } }), box.res);

    expect(mockGetStatus).toHaveBeenCalledWith('del-123-abc', 'corr-route');
    expect(box.getStatus()).toBe(200);
    expect(box.getPayload()).toEqual({ code: 'del-123-abc', status: 'completed' });
  });
});
