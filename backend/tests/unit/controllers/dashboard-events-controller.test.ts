/**
 * Dashboard Events Controller Unit Tests (Plan 07 · Task 30).
 *
 * Pins:
 *   - The doctor id passed downstream is `req.user.id` ALWAYS — never
 *     a body / param / header. This is the auth-boundary contract; the
 *     test asserts it explicitly.
 *   - 401 when `req.user` is missing.
 *   - 400 (ValidationError) on malformed `unread` / `limit` query
 *     params; the controller must not silently coerce.
 *   - GET serializes events through the DTO (snake → camel column
 *     names dropped, server-only fields omitted) and includes
 *     `nextCursor` only when present.
 *   - POST returns 204 with no body on success.
 *
 * Out of scope here:
 *   - The service-layer SQL chains (covered in
 *     `dashboard-events-service.test.ts`).
 *   - End-to-end auth middleware behavior (covered by route mount tests
 *     elsewhere; here we feed `req.user` directly).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Request, Response } from 'express';

jest.mock('../../../src/services/dashboard-events-service', () => ({
  getDashboardEventsForDoctor: jest.fn(),
  markDashboardEventAcknowledged: jest.fn(),
}));

import {
  getDashboardEventsHandler,
  acknowledgeDashboardEventHandler,
} from '../../../src/controllers/dashboard-events-controller';
import * as dashboardEventsService from '../../../src/services/dashboard-events-service';
import { NotFoundError, UnauthorizedError, ValidationError } from '../../../src/utils/errors';

const mockedSvc = dashboardEventsService as jest.Mocked<typeof dashboardEventsService>;

// `asyncHandler` wraps the controller and forwards thrown errors to
// `next(err)` instead of rejecting the returned promise. This helper
// invokes the handler, captures whatever `next` was called with, and
// returns it (or undefined when the handler resolved cleanly).
async function invoke(
  handler: (req: Request, res: Response, next: (err?: unknown) => void) => unknown,
  req: Request,
  res: Response,
): Promise<unknown> {
  let captured: unknown = undefined;
  const next = (err?: unknown): void => {
    captured = err;
  };
  await handler(req, res, next);
  // asyncHandler resolves synchronously after the inner promise settles,
  // but to be safe, await a microtask flush before returning.
  await Promise.resolve();
  return captured;
}

// ---------------------------------------------------------------------------
// Express test doubles. We intentionally don't reach for supertest here —
// the controller is small enough that a hand-rolled req/res keeps the
// assertions surgical (we want to see the exact arguments the service is
// called with, not whatever JSON serialization does to them).
// ---------------------------------------------------------------------------

interface MockRes {
  res: Response;
  payload: unknown;
  statusCode: number;
  endCalled: boolean;
}

function makeRes(): MockRes {
  const out: MockRes = {
    payload: undefined,
    statusCode: 0,
    endCalled: false,
  } as MockRes;
  const res = {
    status: (code: number): Response => {
      out.statusCode = code;
      return res as unknown as Response;
    },
    json: (body: unknown): Response => {
      out.payload = body;
      return res as unknown as Response;
    },
    end: (): Response => {
      out.endCalled = true;
      return res as unknown as Response;
    },
  } as unknown as Response;
  out.res = res;
  return out;
}

function makeReq(opts: {
  userId?: string | null;
  query?:  Record<string, unknown>;
  params?: Record<string, string>;
} = {}): Request {
  return {
    user:   opts.userId === null ? undefined : { id: opts.userId ?? 'doc-1' },
    query:  opts.query  ?? {},
    params: opts.params ?? {},
    // asyncHandler reads `req.url` for error context — keep it minimal.
    url:    '/api/v1/dashboard/events',
    method: 'GET',
  } as unknown as Request;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ===========================================================================
// GET /api/v1/dashboard/events
// ===========================================================================

describe('getDashboardEventsHandler', () => {
  it('passes req.user.id as doctorId, never the body / params', async () => {
    mockedSvc.getDashboardEventsForDoctor.mockResolvedValue({ events: [] });
    const req = makeReq({ userId: 'doc-real' });
    const { res } = makeRes();

    await invoke(getDashboardEventsHandler, req, res);

    expect(mockedSvc.getDashboardEventsForDoctor).toHaveBeenCalledWith({
      doctorId: 'doc-real',
    });
  });

  it('serializes events through the DTO (drops doctor_id from the wire)', async () => {
    mockedSvc.getDashboardEventsForDoctor.mockResolvedValue({
      events: [
        {
          id:        'evt-1',
          doctorId:  'doc-1',
          eventKind: 'patient_replayed_recording',
          sessionId: 'sess-1',
          payload:   {
            artifact_type:             'audio',
            recording_access_audit_id: 'audit-1',
            patient_display_name:      'Patient One',
            replayed_at:               '2026-04-19T10:00:00Z',
            consult_date:              '2026-04-15T12:00:00Z',
            accessed_by_role:          'patient',
            accessed_by_user_id:       'pat-1',
          },
          acknowledgedAt: null,
          createdAt:      '2026-04-19T10:00:00Z',
        },
      ],
    });
    const req = makeReq();
    const m = makeRes();

    await invoke(getDashboardEventsHandler, req, m.res);

    expect(m.statusCode).toBe(200);
    const body = m.payload as { data: { events: Array<Record<string, unknown>>; nextCursor?: string } };
    expect(body.data.events).toHaveLength(1);
    const dto = body.data.events[0]!;
    expect(dto.id).toBe('evt-1');
    expect(dto.eventKind).toBe('patient_replayed_recording');
    // doctorId must NOT leak through — the DTO is intentionally narrowed
    // (the caller is the only doctor that can see these rows anyway).
    expect(dto).not.toHaveProperty('doctorId');
    expect(body.data.nextCursor).toBeUndefined();
  });

  it('includes nextCursor only when the service returns one', async () => {
    mockedSvc.getDashboardEventsForDoctor.mockResolvedValue({
      events: [],
      nextCursor: 'opaque-cursor-abc',
    });
    const req = makeReq();
    const m = makeRes();

    await invoke(getDashboardEventsHandler, req, m.res);

    const body = m.payload as { data: { nextCursor?: string } };
    expect(body.data.nextCursor).toBe('opaque-cursor-abc');
  });

  it('forwards unread / limit / cursor query params to the service', async () => {
    mockedSvc.getDashboardEventsForDoctor.mockResolvedValue({ events: [] });
    const req = makeReq({
      query: { unread: 'true', limit: '15', cursor: 'opaque-cur' },
    });

    await invoke(getDashboardEventsHandler, req, makeRes().res);

    expect(mockedSvc.getDashboardEventsForDoctor).toHaveBeenCalledWith({
      doctorId:   'doc-1',
      unreadOnly: true,
      limit:      15,
      cursor:     'opaque-cur',
    });
  });

  it('forwards ValidationError to next() on a malformed limit', async () => {
    const req = makeReq({ query: { limit: 'banana' } });
    const err = await invoke(getDashboardEventsHandler, req, makeRes().res);
    expect(err).toBeInstanceOf(ValidationError);
  });

  it('forwards ValidationError to next() on a malformed unread param', async () => {
    const req = makeReq({ query: { unread: 'maybe' } });
    const err = await invoke(getDashboardEventsHandler, req, makeRes().res);
    expect(err).toBeInstanceOf(ValidationError);
  });

  it('forwards UnauthorizedError to next() when req.user is missing', async () => {
    const req = makeReq({ userId: null });
    const err = await invoke(getDashboardEventsHandler, req, makeRes().res);
    expect(err).toBeInstanceOf(UnauthorizedError);
  });
});

// ===========================================================================
// POST /api/v1/dashboard/events/:eventId/acknowledge
// ===========================================================================

describe('acknowledgeDashboardEventHandler', () => {
  it('passes req.user.id and the eventId param to the service', async () => {
    mockedSvc.markDashboardEventAcknowledged.mockResolvedValue(undefined);
    const req = makeReq({
      userId: 'doc-real',
      params: { eventId: 'evt-1' },
    });
    const m = makeRes();

    await invoke(acknowledgeDashboardEventHandler, req, m.res);

    expect(mockedSvc.markDashboardEventAcknowledged).toHaveBeenCalledWith({
      doctorId: 'doc-real',
      eventId:  'evt-1',
    });
    expect(m.statusCode).toBe(204);
    expect(m.endCalled).toBe(true);
  });

  it('forwards UnauthorizedError to next() when req.user is missing', async () => {
    const req = makeReq({ userId: null, params: { eventId: 'evt-1' } });
    const err = await invoke(acknowledgeDashboardEventHandler, req, makeRes().res);
    expect(err).toBeInstanceOf(UnauthorizedError);
  });

  it('forwards ValidationError to next() when eventId path param is empty', async () => {
    const req = makeReq({ params: { eventId: '' } });
    const err = await invoke(acknowledgeDashboardEventHandler, req, makeRes().res);
    expect(err).toBeInstanceOf(ValidationError);
  });

  it('propagates NotFoundError from the service (mapped to 404 by the global handler)', async () => {
    mockedSvc.markDashboardEventAcknowledged.mockRejectedValueOnce(
      new NotFoundError('Dashboard event not found'),
    );
    const req = makeReq({ params: { eventId: 'evt-missing' } });

    const err = await invoke(acknowledgeDashboardEventHandler, req, makeRes().res);
    expect(err).toBeInstanceOf(NotFoundError);
  });
});
