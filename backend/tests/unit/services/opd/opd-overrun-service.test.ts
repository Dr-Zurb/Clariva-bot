/**
 * Unit tests for `opd-overrun-service.ts` (pdm-09).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../../src/services/opd/opd-mode-conversion-service', () => ({
  acquireSessionDayAdvisoryLock: jest.fn(
    async (_s: unknown, _d: unknown, _date: unknown, fn: () => Promise<unknown>) => fn()
  ),
}));

jest.mock('../../../../src/services/doctor-settings-service', () => ({
  getDoctorSettings: jest.fn(async () => ({ timezone: 'Asia/Kolkata' })),
}));

jest.mock('../../../../src/services/opd/opd-queue-service', () => ({
  localDayUtcRange: jest.fn(() => ({
    start: '2026-05-16T00:00:00.000Z',
    end: '2026-05-17T00:00:00.000Z',
  })),
}));

const mockRescheduleNext = jest.fn<() => Promise<void>>();
const mockRescheduleSpecific = jest.fn<() => Promise<void>>();
jest.mock('../../../../src/services/reschedule-service', () => ({
  rescheduleAppointmentToNextAvailable: mockRescheduleNext,
  rescheduleAppointmentToSpecificSlot: mockRescheduleSpecific,
}));

const mockRefund = jest.fn<() => Promise<void>>();
jest.mock('../../../../src/services/refund-service', () => ({
  refundAppointment: mockRefund,
}));

import { bulkResolveSessionOverrun } from '../../../../src/services/opd/opd-overrun-service';

type AptRow = {
  id: string;
  status: string;
  patient_id: string | null;
  consultation_type: string | null;
  catalog_service_id: string | null;
  appointment_date: string;
};

function makeSupabase(rows: AptRow[]) {
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];

  const selectTerminal = {
    then: (resolve: (v: { data: AptRow[]; error: null }) => void) => {
      resolve({ data: rows, error: null });
    },
  };

  const selectChain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnValue(selectTerminal),
  };

  return {
    from: jest.fn(() => ({
      ...selectChain,
      update: jest.fn((patch: Record<string, unknown>) => ({
        eq: jest.fn((_col: string, id: string) => ({
          in: jest.fn(async () => {
            updates.push({ id, patch });
            return { error: null };
          }),
        })),
      })),
    })),
    updates,
  };
}

describe('bulkResolveSessionOverrun', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRescheduleNext.mockResolvedValue(undefined);
    mockRescheduleSpecific.mockResolvedValue(undefined);
    mockRefund.mockResolvedValue(undefined);
  });

  it('reschedule_all calls reschedule primitive for each row', async () => {
    const rows = [
      { id: 'a1', status: 'pending', patient_id: 'p1', consultation_type: 'video', catalog_service_id: null, appointment_date: '2026-05-16T10:00:00.000Z' },
      { id: 'a2', status: 'confirmed', patient_id: 'p2', consultation_type: 'video', catalog_service_id: null, appointment_date: '2026-05-16T11:00:00.000Z' },
      { id: 'a3', status: 'pending', patient_id: 'p3', consultation_type: 'in_clinic', catalog_service_id: null, appointment_date: '2026-05-16T12:00:00.000Z' },
    ];
    const supabase = makeSupabase(rows);

    const result = await bulkResolveSessionOverrun(
      supabase as never,
      'doc-1',
      '2026-05-16',
      'reschedule_all',
      undefined,
      { triggeredBy: 'doctor' }
    );

    expect(result.resolved).toBe(3);
    expect(mockRescheduleNext).toHaveBeenCalledTimes(3);
  });

  it('mark_completed updates status and clears session_overrun_at', async () => {
    const rows = [
      { id: 'a1', status: 'pending', patient_id: null, consultation_type: null, catalog_service_id: null, appointment_date: '2026-05-16T10:00:00.000Z' },
    ];
    const supabase = makeSupabase(rows);

    const result = await bulkResolveSessionOverrun(
      supabase as never,
      'doc-1',
      '2026-05-16',
      'mark_completed',
      undefined,
      { triggeredBy: 'doctor' }
    );

    expect(result.resolved).toBe(1);
    expect(supabase.updates[0]?.patch.status).toBe('completed');
    expect(supabase.updates[0]?.patch.session_overrun_at).toBeNull();
  });

  it('cancel_refund refunds then cancels', async () => {
    const rows = [
      { id: 'a1', status: 'pending', patient_id: null, consultation_type: null, catalog_service_id: null, appointment_date: '2026-05-16T10:00:00.000Z' },
    ];
    const supabase = makeSupabase(rows);

    await bulkResolveSessionOverrun(
      supabase as never,
      'doc-1',
      '2026-05-16',
      'cancel_refund',
      undefined,
      { triggeredBy: 'doctor' }
    );

    expect(mockRefund).toHaveBeenCalledTimes(1);
    expect(supabase.updates[0]?.patch.status).toBe('cancelled');
  });

  it('mark_no_show sets status no_show', async () => {
    const rows = [
      { id: 'a1', status: 'confirmed', patient_id: null, consultation_type: null, catalog_service_id: null, appointment_date: '2026-05-16T10:00:00.000Z' },
    ];
    const supabase = makeSupabase(rows);

    const result = await bulkResolveSessionOverrun(
      supabase as never,
      'doc-1',
      '2026-05-16',
      'mark_no_show',
      undefined,
      { triggeredBy: 'doctor' }
    );

    expect(result.resolved).toBe(1);
    expect(supabase.updates[0]?.patch.status).toBe('no_show');
  });

  it('reschedule_per_patient skips rows without rescheduleTo', async () => {
    const rows = [
      { id: 'a1', status: 'pending', patient_id: null, consultation_type: null, catalog_service_id: null, appointment_date: '2026-05-16T10:00:00.000Z' },
      { id: 'a2', status: 'pending', patient_id: null, consultation_type: null, catalog_service_id: null, appointment_date: '2026-05-16T11:00:00.000Z' },
    ];
    const supabase = makeSupabase(rows);

    const result = await bulkResolveSessionOverrun(
      supabase as never,
      'doc-1',
      '2026-05-16',
      'reschedule_per_patient',
      [
        {
          appointmentId: 'a1',
          action: 'reschedule_per_patient',
          rescheduleTo: '2026-05-20T10:00:00.000Z',
        },
      ],
      { triggeredBy: 'doctor' }
    );

    expect(result.resolved).toBe(1);
    expect(mockRescheduleSpecific).toHaveBeenCalledTimes(1);
    expect(result.results.find((r) => r.appointmentId === 'a2')?.status).toBe('skipped');
  });

  it('per-row override mixing actions', async () => {
    const rows = [
      { id: 'a1', status: 'pending', patient_id: null, consultation_type: null, catalog_service_id: null, appointment_date: '2026-05-16T10:00:00.000Z' },
      { id: 'a2', status: 'pending', patient_id: null, consultation_type: null, catalog_service_id: null, appointment_date: '2026-05-16T11:00:00.000Z' },
      { id: 'a3', status: 'pending', patient_id: null, consultation_type: null, catalog_service_id: null, appointment_date: '2026-05-16T12:00:00.000Z' },
    ];
    const supabase = makeSupabase(rows);

    const result = await bulkResolveSessionOverrun(
      supabase as never,
      'doc-1',
      '2026-05-16',
      'reschedule_all',
      [
        { appointmentId: 'a1', action: 'mark_completed' },
        { appointmentId: 'a2', action: 'mark_completed' },
        { appointmentId: 'a3', action: 'cancel_refund' },
      ],
      { triggeredBy: 'doctor' }
    );

    expect(result.resolved).toBe(3);
    expect(mockRescheduleNext).not.toHaveBeenCalled();
    expect(mockRefund).toHaveBeenCalledTimes(1);
  });

  it('empty overrun set returns zero resolved', async () => {
    const supabase = makeSupabase([]);
    const result = await bulkResolveSessionOverrun(
      supabase as never,
      'doc-1',
      '2026-05-16',
      'reschedule_all',
      undefined,
      { triggeredBy: 'doctor' }
    );
    expect(result).toEqual({ resolved: 0, results: [] });
  });

  it('reschedule failure returns error status for that row', async () => {
    mockRescheduleNext.mockRejectedValueOnce(new Error('slot full'));
    const rows = [
      { id: 'a1', status: 'pending', patient_id: null, consultation_type: null, catalog_service_id: null, appointment_date: '2026-05-16T10:00:00.000Z' },
    ];
    const supabase = makeSupabase(rows);

    const result = await bulkResolveSessionOverrun(
      supabase as never,
      'doc-1',
      '2026-05-16',
      'reschedule_all',
      undefined,
      { triggeredBy: 'doctor' }
    );

    expect(result.resolved).toBe(0);
    expect(result.results[0]?.status).toBe('error');
    expect(result.results[0]?.message).toContain('slot full');
  });
});
