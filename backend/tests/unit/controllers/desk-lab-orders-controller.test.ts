import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

const listLabOrdersForAppointment = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const listPendingLabAppointments = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const upsertLabOrderFulfillments = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('../../../src/services/desk-lab-orders-service', () => ({
  LAB_NOT_DONE_REASON_CODES: [
    'sample_not_collected',
    'patient_refused',
    'sample_rejected',
    'machine_down',
    'done_outside',
    'other',
  ],
  listLabOrdersForAppointment: (...args: unknown[]) => listLabOrdersForAppointment(...args),
  listPendingLabAppointments: (...args: unknown[]) => listPendingLabAppointments(...args),
  upsertLabOrderFulfillments: (...args: unknown[]) => upsertLabOrderFulfillments(...args),
}));

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import {
  getLabOrdersHandler,
  listPendingLabAppointmentsHandler,
  upsertLabOrdersHandler,
} from '../../../src/controllers/desk-lab-orders-controller';
import { ValidationError } from '../../../src/utils/errors';

const DOCTOR_ID = '550e8400-e29b-41d4-a716-446655440000';
const ACTOR_ID = '660e8400-e29b-41d4-a716-446655440001';
const APT_ID = '880e8400-e29b-41d4-a716-446655440003';

function mockRes(): Response & { statusCode: number; body: unknown } {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

function staffReq(overrides: Record<string, unknown> = {}): Request {
  return {
    user: { id: ACTOR_ID },
    actingDoctorId: DOCTOR_ID,
    actorId: ACTOR_ID,
    actorKind: 'staff',
    staffCapabilities: ['internal_labs'],
    correlationId: 'cid',
    params: { id: APT_ID },
    body: {},
    ...overrides,
  } as unknown as Request;
}

async function run(
  handler: (req: Request, res: Response, next: (err?: unknown) => void) => void,
  req: Request,
  res: Response
): Promise<unknown> {
  let err: unknown;
  handler(req, res, ((nextErr?: unknown) => {
    err = nextErr;
  }) as never);
  await new Promise((resolve) => setImmediate(resolve));
  return err;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('desk lab-order handlers', () => {
  it('GET :id/lab-orders returns the projection for the acting doctor', async () => {
    listLabOrdersForAppointment.mockResolvedValue([
      { orderId: 'ord-1', label: 'CBC', kind: 'panel' },
    ]);
    const res = mockRes();
    const err = await run(getLabOrdersHandler, staffReq(), res);

    expect(err).toBeUndefined();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        success: true,
        data: { orders: [{ orderId: 'ord-1', label: 'CBC', kind: 'panel' }] },
      })
    );
    expect(listLabOrdersForAppointment).toHaveBeenCalledWith(APT_ID, DOCTOR_ID, 'cid', ACTOR_ID);
  });

  it('GET :id/lab-orders rejects a non-uuid id before the service', async () => {
    const res = mockRes();
    const err = await run(getLabOrdersHandler, staffReq({ params: { id: 'lab-pending' } }), res);
    expect(err).toBeInstanceOf(ValidationError);
    expect(listLabOrdersForAppointment).not.toHaveBeenCalled();
  });

  it('GET lab-pending returns desk-shaped items', async () => {
    listPendingLabAppointments.mockResolvedValue([{ id: APT_ID, orders: [] }]);
    const res = mockRes();
    const err = await run(listPendingLabAppointmentsHandler, staffReq({ params: {} }), res);

    expect(err).toBeUndefined();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        success: true,
        data: { items: [{ id: APT_ID, orders: [] }] },
      })
    );
    expect(listPendingLabAppointments).toHaveBeenCalledWith(DOCTOR_ID, 'cid', ACTOR_ID);
  });

  it('PUT :id/lab-orders validates and writes fulfillments', async () => {
    upsertLabOrderFulfillments.mockResolvedValue([
      { orderId: 'ord-1', label: 'CBC', kind: 'panel', status: 'not_done' },
    ]);
    const res = mockRes();
    const err = await run(
      upsertLabOrdersHandler,
      staffReq({
        body: {
          updates: [{ orderId: 'ord-1', status: 'not_done', reasonCode: 'patient_refused' }],
        },
      }),
      res
    );

    expect(err).toBeUndefined();
    expect(res.statusCode).toBe(200);
    expect(upsertLabOrderFulfillments).toHaveBeenCalledWith(
      APT_ID,
      DOCTOR_ID,
      'cid',
      ACTOR_ID,
      [{ orderId: 'ord-1', status: 'not_done', reasonCode: 'patient_refused' }]
    );
  });

  it('PUT :id/lab-orders rejects uploaded without a document', async () => {
    const res = mockRes();
    const err = await run(
      upsertLabOrdersHandler,
      staffReq({ body: { updates: [{ orderId: 'ord-1', status: 'uploaded' }] } }),
      res
    );
    expect(err).toBeDefined();
    expect(upsertLabOrderFulfillments).not.toHaveBeenCalled();
  });
});
