import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { DateTime } from 'luxon';

const getDoctorTimezone = jest.fn<(doctorId: string) => Promise<string>>();

jest.mock('../../../src/services/doctor-settings-service', () => ({
  getDoctorTimezone: (doctorId: string) => getDoctorTimezone(doctorId),
}));

type Op = { method: string; args: unknown[] };
type Call = { table: string; ops: Op[] };

const calls: Call[] = [];
let nextCounts: number[] = [];

function builder(table: string, count: number) {
  const ops: Op[] = [];
  calls.push({ table, ops });
  const self = {
    select: (...args: unknown[]) => {
      ops.push({ method: 'select', args });
      return self;
    },
    eq: (...args: unknown[]) => {
      ops.push({ method: 'eq', args });
      return self;
    },
    in: (...args: unknown[]) => {
      ops.push({ method: 'in', args });
      return self;
    },
    is: (...args: unknown[]) => {
      ops.push({ method: 'is', args });
      return self;
    },
    then: (
      resolve: (value: { count: number; error: null }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve({ count, error: null }).then(resolve, reject),
  };
  return self;
}

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: () => ({
    from: (table: string) => {
      const count = nextCounts.shift() ?? 0;
      return builder(table, count);
    },
  }),
}));

import { getDashboardCountsForDoctor } from '../../../src/services/dashboard-counts-service';

beforeEach(() => {
  calls.length = 0;
  nextCounts = [];
  getDoctorTimezone.mockReset();
  getDoctorTimezone.mockResolvedValue('Asia/Kolkata');
});

describe('getDashboardCountsForDoctor', () => {
  it('counts pending reviews, live queue rows for the clinic day, and unread events', async () => {
    nextCounts = [2, 5, 7];

    const result = await getDashboardCountsForDoctor('doc-1', 'cid-counts');

    expect(result).toEqual({
      bookingReviewsUnconfirmed: 2,
      opdLive: 5,
      dashboardEventsUnread: 7,
    });
    expect(getDoctorTimezone).toHaveBeenCalledWith('doc-1');

    const today = DateTime.now().setZone('Asia/Kolkata').toISODate();
    expect(calls.map((call) => call.table)).toEqual([
      'service_staff_review_requests',
      'opd_queue_entries',
      'doctor_dashboard_events',
    ]);
    expect(calls[0]?.ops).toEqual(
      expect.arrayContaining([
        { method: 'eq', args: ['doctor_id', 'doc-1'] },
        { method: 'eq', args: ['status', 'pending'] },
      ]),
    );
    expect(calls[1]?.ops).toEqual(
      expect.arrayContaining([
        { method: 'eq', args: ['doctor_id', 'doc-1'] },
        { method: 'eq', args: ['session_date', today] },
        { method: 'in', args: ['status', ['waiting', 'called', 'in_consultation']] },
      ]),
    );
    expect(calls[2]?.ops).toEqual(
      expect.arrayContaining([
        { method: 'eq', args: ['doctor_id', 'doc-1'] },
        { method: 'is', args: ['acknowledged_at', null] },
      ]),
    );
  });
});
