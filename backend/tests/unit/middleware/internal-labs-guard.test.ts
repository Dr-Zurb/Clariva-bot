import { readFileSync } from 'fs';
import { join } from 'path';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { NextFunction, Request, Response } from 'express';

const findStaffLink = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('../../../src/services/clinic-staff-service', () => ({
  findStaffLink: (...args: unknown[]) => findStaffLink(...args),
}));

import { staffCapability } from '../../../src/middleware/allow-staff';
import { resolveActingDoctor } from '../../../src/middleware/resolve-acting-doctor';
import { ForbiddenError } from '../../../src/utils/errors';

const DOCTOR_ID = '00000000-0000-0000-0000-0000000000aa';
const STAFF_ID = '00000000-0000-0000-0000-0000000000cc';

async function runInternalLabsGuard(req: Request): Promise<unknown> {
  let error: unknown;
  const next: NextFunction = ((err?: unknown) => {
    error = err;
  }) as NextFunction;

  staffCapability('internal_labs')(req, {} as Response, (err?: unknown) => {
    if (err) error = err;
  });
  if (error) return error;

  await resolveActingDoctor(req, {} as Response, next);
  await new Promise((resolve) => setImmediate(resolve));
  return error;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('internal_labs guard (lab-orders + lab-pending)', () => {
  it('403s a papers-only login on both lab routes', async () => {
    findStaffLink.mockResolvedValue({
      id: 'link-1',
      doctorId: DOCTOR_ID,
      staffUserId: STAFF_ID,
      role: 'assistant',
      status: 'active',
      capabilities: ['papers'],
    });

    const req = {
      user: { id: STAFF_ID, app_metadata: { role: 'receptionist' } },
      correlationId: 'cid',
    } as unknown as Request;

    const error = await runInternalLabsGuard(req);
    expect(error).toBeInstanceOf(ForbiddenError);
    expect((error as ForbiddenError).message).toBe('Staff account cannot perform this action');
    expect(req.requiredCapabilities).toEqual(['internal_labs']);
  });

  it('allows a login that holds internal_labs', async () => {
    findStaffLink.mockResolvedValue({
      id: 'link-1',
      doctorId: DOCTOR_ID,
      staffUserId: STAFF_ID,
      role: 'assistant',
      status: 'active',
      capabilities: ['internal_labs'],
    });

    const req = {
      user: { id: STAFF_ID, app_metadata: { role: 'receptionist' } },
      correlationId: 'cid',
    } as unknown as Request;

    const error = await runInternalLabsGuard(req);
    expect(error).toBeUndefined();
    expect(req.actingDoctorId).toBe(DOCTOR_ID);
    expect(req.actorId).toBe(STAFF_ID);
  });
});

describe('appointment lab route registration', () => {
  it('registers lab-pending before :id and guards both with internal_labs', () => {
    const src = readFileSync(join(__dirname, '../../../src/routes/api/v1/appointments.ts'), 'utf8');
    const pendingAt = src.indexOf("router.get(\n  '/lab-pending'");
    const idAt = src.indexOf("router.get('/:id'");
    const ordersAt = src.indexOf("router.get(\n  '/:id/lab-orders'");
    const putAt = src.indexOf("router.put(\n  '/:id/lab-orders'");
    expect(pendingAt).toBeGreaterThan(-1);
    expect(idAt).toBeGreaterThan(-1);
    expect(ordersAt).toBeGreaterThan(-1);
    expect(putAt).toBeGreaterThan(-1);
    expect(pendingAt).toBeLessThan(idAt);

    const pendingBlock = src.slice(pendingAt, idAt);
    const ordersBlock = src.slice(ordersAt, src.indexOf('router.get(', ordersAt + 1));
    expect(pendingBlock).toContain("staffCapability('internal_labs')");
    expect(ordersBlock).toContain("staffCapability('internal_labs')");
  });
});
