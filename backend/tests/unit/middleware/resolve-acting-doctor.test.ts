import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { NextFunction, Request, Response } from 'express';

const findStaffLink = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('../../../src/services/clinic-staff-service', () => ({
  findStaffLink: (...args: unknown[]) => findStaffLink(...args),
}));

import { resolveActingDoctor } from '../../../src/middleware/resolve-acting-doctor';
import { ForbiddenError, UnauthorizedError } from '../../../src/utils/errors';

const DOCTOR_ID = '00000000-0000-0000-0000-0000000000aa';
const STAFF_ID = '00000000-0000-0000-0000-0000000000cc';

async function run(req: Request): Promise<{ req: Request; error: unknown }> {
  let error: unknown;
  const next: NextFunction = ((err?: unknown) => {
    error = err;
  }) as NextFunction;
  await resolveActingDoctor(req, {} as Response, next);
  await new Promise((resolve) => setImmediate(resolve));
  return { req, error };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('resolveActingDoctor', () => {
  it('stamps doctor self as tenant+actor with zero DB lookups', async () => {
    const req = {
      user: { id: DOCTOR_ID, app_metadata: {} },
      correlationId: 'cid',
    } as unknown as Request;

    const { error } = await run(req);

    expect(error).toBeUndefined();
    expect(req.actingDoctorId).toBe(DOCTOR_ID);
    expect(req.actorId).toBe(DOCTOR_ID);
    expect(req.actorKind).toBe('doctor');
    expect(findStaffLink).not.toHaveBeenCalled();
  });

  it('resolves an active staff link to the acting doctor', async () => {
    findStaffLink.mockResolvedValue({
      id: 'link-1',
      doctorId: DOCTOR_ID,
      staffUserId: STAFF_ID,
      role: 'receptionist',
      status: 'active',
    });

    const req = {
      user: { id: STAFF_ID, app_metadata: { role: 'receptionist' } },
      correlationId: 'cid',
    } as unknown as Request;

    const { error } = await run(req);

    expect(error).toBeUndefined();
    expect(req.actingDoctorId).toBe(DOCTOR_ID);
    expect(req.actorId).toBe(STAFF_ID);
    expect(req.actorKind).toBe('staff');
    expect(req.staffRole).toBe('receptionist');
    expect(findStaffLink).toHaveBeenCalledWith(STAFF_ID, 'cid');
  });

  it('403s when staff have no clinic_staff row', async () => {
    findStaffLink.mockResolvedValue(null);

    const req = {
      user: { id: STAFF_ID, app_metadata: { role: 'receptionist' } },
      correlationId: 'cid',
    } as unknown as Request;

    const { error } = await run(req);

    expect(error).toBeInstanceOf(ForbiddenError);
    expect((error as ForbiddenError).message).toBe(
      'Staff account is not linked to a practice'
    );
  });

  it('403s when the staff link is suspended', async () => {
    findStaffLink.mockResolvedValue({
      id: 'link-1',
      doctorId: DOCTOR_ID,
      staffUserId: STAFF_ID,
      role: 'receptionist',
      status: 'suspended',
    });

    const req = {
      user: { id: STAFF_ID, app_metadata: { role: 'receptionist' } },
      correlationId: 'cid',
    } as unknown as Request;

    const { error } = await run(req);

    expect(error).toBeInstanceOf(ForbiddenError);
    expect((error as ForbiddenError).message).toBe(
      'Staff access has been suspended'
    );
  });

  it('401s when authenticateToken has not run', async () => {
    const { error } = await run({} as Request);
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(findStaffLink).not.toHaveBeenCalled();
  });
});
