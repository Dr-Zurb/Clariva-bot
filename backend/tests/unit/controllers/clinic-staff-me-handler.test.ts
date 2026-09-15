import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

const getDoctorTimezone = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('../../../src/services/doctor-settings-service', () => ({
  getDoctorTimezone: (...args: unknown[]) => getDoctorTimezone(...args),
}));

import { getClinicStaffMeHandler } from '../../../src/controllers/clinic-staff-controller';

const DOCTOR_ID = '00000000-0000-0000-0000-0000000000aa';
const ACTOR_ID = '00000000-0000-0000-0000-0000000000cc';

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

beforeEach(() => {
  jest.clearAllMocks();
  getDoctorTimezone.mockResolvedValue('Asia/Kolkata');
});

describe('getClinicStaffMeHandler', () => {
  it('returns acting doctor, timezone, and today — no PHI', async () => {
    const res = mockRes();
    await getClinicStaffMeHandler(
      {
        user: { id: ACTOR_ID },
        actingDoctorId: DOCTOR_ID,
        actorId: ACTOR_ID,
        actorKind: 'staff',
        staffCapabilities: ['previsit'],
        correlationId: 'cid',
      } as unknown as Request,
      res,
      ((err?: unknown) => {
        if (err) throw err;
      }) as never
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      data: {
        doctorId: string;
        timezone: string;
        today: string;
        capabilities: string[];
      };
    };
    expect(body.data.doctorId).toBe(DOCTOR_ID);
    expect(body.data.timezone).toBe('Asia/Kolkata');
    expect(body.data.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.data.capabilities).toEqual(['previsit']);
    expect(JSON.stringify(body)).not.toMatch(/phone|name|mrn/i);
  });
});
