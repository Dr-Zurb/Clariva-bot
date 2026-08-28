/**
 * Unit tests for `booking-review-sla-alert-service.ts` (alerts-v2 · alr2-04).
 *
 * Pins: breached-pending → one event; re-run → deduped; resolved /
 * not-yet-breached → no insert (empty scan); per-row insert failure
 * counted, not fatal.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const mockInsertDashboardEvent = jest.fn<
  (...args: unknown[]) => Promise<{ inserted: boolean; eventId: string }>
>();
jest.mock('../../../src/services/dashboard-events-service', () => ({
  insertDashboardEvent: (...a: unknown[]) => mockInsertDashboardEvent(...a),
}));

import * as database from '../../../src/config/database';
import { runBookingReviewSlaAlertJob } from '../../../src/services/booking-review-sla-alert-service';

const mockedDb = database as jest.Mocked<typeof database>;

interface ReviewRow {
  id: string;
  doctor_id: string;
  patient_id: string | null;
  created_at: string;
  sla_deadline_at: string;
}

interface PatientRow {
  id: string;
  name: string | null;
}

function buildAdminMock(opts: {
  reviewRows?: ReviewRow[];
  reviewError?: { message: string } | null;
  patients?: PatientRow[];
}) {
  const patients = opts.patients ?? [];

  return {
    from: (table: string) => {
      if (table === 'service_staff_review_requests') {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.select = self;
        chain.eq = self;
        chain.not = self;
        chain.lt = self;
        chain.order = self;
        chain.limit = () =>
          Promise.resolve({
            data:  opts.reviewError ? null : (opts.reviewRows ?? []),
            error: opts.reviewError ?? null,
          });
        return chain;
      }
      if (table === 'patients') {
        const chain: Record<string, unknown> = {};
        let patientId: string | null = null;
        chain.select = () => chain;
        chain.eq = (_col: string, val: string) => {
          patientId = val;
          return chain;
        };
        chain.maybeSingle = async () => {
          const row = patients.find((p) => p.id === patientId) ?? null;
          return { data: row, error: null };
        };
        return chain;
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockInsertDashboardEvent.mockResolvedValue({
    inserted: true,
    eventId:  'evt-1',
  });
});

describe('runBookingReviewSlaAlertJob', () => {
  it('emits one booking_review_sla_breach event for a breached-pending request', async () => {
    const row: ReviewRow = {
      id:              'rev-1',
      doctor_id:       'doc-1',
      patient_id:      'pat-1',
      created_at:      '2026-07-20T08:00:00.000Z',
      sla_deadline_at: '2026-07-20T08:30:00.000Z',
    };
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      buildAdminMock({
        reviewRows: [row],
        patients:   [{ id: 'pat-1', name: ' Meera ' }],
      }) as never,
    );

    const result = await runBookingReviewSlaAlertJob('corr-1');

    expect(result).toEqual({
      scanned:  1,
      inserted: 1,
      deduped:  0,
      errors:   0,
    });
    expect(mockInsertDashboardEvent).toHaveBeenCalledTimes(1);
    expect(mockInsertDashboardEvent).toHaveBeenCalledWith({
      doctorId:  'doc-1',
      eventKind: 'booking_review_sla_breach',
      sessionId: null,
      payload: {
        severity:             'action_needed',
        review_request_id:    'rev-1',
        patient_display_name: 'Meera',
        requested_at:         row.created_at,
        sla_deadline_at:      row.sla_deadline_at,
      },
      dedupeKey: 'rev-1',
    });
  });

  it('counts a re-run as deduped when insertDashboardEvent reports inserted=false', async () => {
    mockInsertDashboardEvent.mockResolvedValueOnce({
      inserted: false,
      eventId:  'evt-existing',
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      buildAdminMock({
        reviewRows: [
          {
            id:              'rev-1',
            doctor_id:       'doc-1',
            patient_id:      null,
            created_at:      '2026-07-20T08:00:00.000Z',
            sla_deadline_at: '2026-07-20T08:30:00.000Z',
          },
        ],
      }) as never,
    );

    const result = await runBookingReviewSlaAlertJob('corr-dedupe');

    expect(result.scanned).toBe(1);
    expect(result.inserted).toBe(0);
    expect(result.deduped).toBe(1);
    expect(result.errors).toBe(0);
  });

  it('emits nothing when the scan returns no breached-pending rows', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      buildAdminMock({ reviewRows: [] }) as never,
    );

    const result = await runBookingReviewSlaAlertJob('corr-empty');

    expect(result).toEqual({
      scanned:  0,
      inserted: 0,
      deduped:  0,
      errors:   0,
    });
    expect(mockInsertDashboardEvent).not.toHaveBeenCalled();
  });

  it('counts per-row insert failures without aborting the tick', async () => {
    mockInsertDashboardEvent
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ inserted: true, eventId: 'evt-2' });

    mockedDb.getSupabaseAdminClient.mockReturnValue(
      buildAdminMock({
        reviewRows: [
          {
            id:              'rev-fail',
            doctor_id:       'doc-1',
            patient_id:      null,
            created_at:      '2026-07-20T08:00:00.000Z',
            sla_deadline_at: '2026-07-20T08:30:00.000Z',
          },
          {
            id:              'rev-ok',
            doctor_id:       'doc-1',
            patient_id:      null,
            created_at:      '2026-07-20T09:00:00.000Z',
            sla_deadline_at: '2026-07-20T09:30:00.000Z',
          },
        ],
      }) as never,
    );

    const result = await runBookingReviewSlaAlertJob('corr-partial');

    expect(result.scanned).toBe(2);
    expect(result.inserted).toBe(1);
    expect(result.errors).toBe(1);
    expect(mockInsertDashboardEvent).toHaveBeenCalledTimes(2);
  });

  it('returns zeros when the admin client is unavailable', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(null as never);

    const result = await runBookingReviewSlaAlertJob('corr-noadmin');

    expect(result).toEqual({
      scanned:  0,
      inserted: 0,
      deduped:  0,
      errors:   0,
    });
    expect(mockInsertDashboardEvent).not.toHaveBeenCalled();
  });
});
