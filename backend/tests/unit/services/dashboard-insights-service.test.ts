/**
 * Dashboard Insights Service unit tests (insights-v1 · ins-01 / ins-03).
 *
 * Covers Tier-1 practice-health aggregation and Tier-2 booking funnel +
 * review SLA (stage counts, captured-only payments, breach detection).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  getBookingFunnel,
  getClinicalMix,
  getPracticeHealth,
  getTelehealthQuality,
} from '../../../src/services/dashboard-insights-service';
import * as database from '../../../src/config/database';
import * as auditLogger from '../../../src/utils/audit-logger';

jest.mock('../../../src/config/database');
jest.mock('../../../src/utils/audit-logger');

const mockedDb = database as jest.Mocked<typeof database>;
const mockedAudit = auditLogger as jest.Mocked<typeof auditLogger>;

const doctorId = '550e8400-e29b-41d4-a716-446655440000';
const correlationId = 'corr-insights';
const from = '2026-06-01';
const to = '2026-06-30';

type TableResponse = { data: unknown; error: unknown };

/**
 * Build a supabase admin stub whose `.from(table)` returns a thenable chain
 * resolving to the response registered for that table. Captures the filter
 * calls per table so tests can assert doctor-scoping.
 */
function makeAdmin(byTable: Record<string, TableResponse>) {
  const eqCalls: Record<string, Array<[string, unknown]>> = {};

  const makeChain = (table: string, result: TableResponse) => {
    eqCalls[table] = eqCalls[table] ?? [];
    const chain: Record<string, unknown> = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn((col: string, val: unknown) => {
        eqCalls[table]!.push([col, val]);
        return chain;
      }),
      in: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
    };
    (chain as { then?: unknown }).then = (resolve: (v: unknown) => void) =>
      Promise.resolve(result).then(resolve);
    return chain;
  };

  const admin = {
    from: jest.fn((table: string) =>
      makeChain(table, byTable[table] ?? { data: [], error: null })
    ),
  };
  return { admin, eqCalls };
}

beforeEach(() => {
  jest.resetAllMocks();
  (mockedAudit.logDataAccess as jest.Mock) = jest
    .fn()
    .mockImplementation(() => Promise.resolve());
});

describe('getPracticeHealth — volume + no-show', () => {
  it('counts by status and modality and computes no-show rate', async () => {
    const { admin } = makeAdmin({
      appointments: {
        data: [
          { status: 'completed', consultation_type: 'in_clinic' },
          { status: 'completed', consultation_type: 'video' },
          { status: 'confirmed', consultation_type: 'video' },
          { status: 'no_show', consultation_type: 'in_clinic' },
          { status: 'cancelled', consultation_type: 'voice' },
          { status: 'pending', consultation_type: null },
        ],
        error: null,
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);

    const result = await getPracticeHealth({ doctorId, from, to, correlationId });

    expect(result.volume.total).toBe(6);
    expect(result.volume.byStatus).toEqual({
      completed: 2,
      confirmed: 1,
      no_show: 1,
      cancelled: 1,
      pending: 1,
    });
    expect(result.volume.byModality).toEqual({
      in_clinic: 2,
      video: 2,
      voice: 1,
      unknown: 1,
    });
    // no_show / (confirmed + completed + no_show) = 1 / (1 + 2 + 1) = 0.25
    expect(result.noShowRate).toBeCloseTo(0.25, 5);
  });

  it('guards divide-by-zero → no-show rate 0 on empty range', async () => {
    const { admin } = makeAdmin({ appointments: { data: [], error: null } });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);

    const result = await getPracticeHealth({ doctorId, from, to, correlationId });

    expect(result.volume.total).toBe(0);
    expect(result.noShowRate).toBe(0);
    expect(result.consult.completionRate).toBe(0);
    expect(result.consult.medianDurationSeconds).toBe(0);
  });
});

describe('getPracticeHealth — revenue', () => {
  it('sums only captured payments and surfaces the currency', async () => {
    const { admin } = makeAdmin({
      payments: {
        // The service filters status='captured' at the query layer; the stub
        // returns only captured rows to mirror that contract.
        data: [
          { amount_minor: 50000, currency: 'INR' },
          { amount_minor: 25000, currency: 'inr' },
          { amount_minor: 100000, currency: 'INR' },
        ],
        error: null,
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);

    const result = await getPracticeHealth({ doctorId, from, to, correlationId });

    expect(result.revenueCapturedMinor).toBe(175000);
    expect(result.currency).toBe('INR');
    expect(result.mixedCurrency).toBeUndefined();
  });

  it('returns dominant currency + mixedCurrency flag when currencies are mixed', async () => {
    const { admin } = makeAdmin({
      payments: {
        data: [
          { amount_minor: 100000, currency: 'INR' },
          { amount_minor: 20000, currency: 'INR' },
          { amount_minor: 5000, currency: 'USD' },
        ],
        error: null,
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);

    const result = await getPracticeHealth({ doctorId, from, to, correlationId });

    // Dominant currency is INR (higher total); its sum is returned.
    expect(result.currency).toBe('INR');
    expect(result.revenueCapturedMinor).toBe(120000);
    expect(result.mixedCurrency).toBe(true);
  });

  it('defaults revenue to 0 and platform currency when no captured payments', async () => {
    const { admin } = makeAdmin({ payments: { data: [], error: null } });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);

    const result = await getPracticeHealth({ doctorId, from, to, correlationId });

    expect(result.revenueCapturedMinor).toBe(0);
    expect(result.currency).toBe('INR');
  });
});

describe('getPracticeHealth — consult metrics', () => {
  it('computes completion rate and median duration (odd count)', async () => {
    const { admin } = makeAdmin({
      consultation_sessions: {
        data: [
          // durations: 300s, 600s, 900s → median 600
          {
            status: 'ended',
            actual_started_at: '2026-06-02T10:00:00.000Z',
            actual_ended_at: '2026-06-02T10:05:00.000Z',
          },
          {
            status: 'ended',
            actual_started_at: '2026-06-03T10:00:00.000Z',
            actual_ended_at: '2026-06-03T10:10:00.000Z',
          },
          {
            status: 'ended',
            actual_started_at: '2026-06-04T10:00:00.000Z',
            actual_ended_at: '2026-06-04T10:15:00.000Z',
          },
          // scheduled-but-not-ended → counts toward denominator, no duration
          {
            status: 'no_show',
            actual_started_at: null,
            actual_ended_at: null,
          },
        ],
        error: null,
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);

    const result = await getPracticeHealth({ doctorId, from, to, correlationId });

    // 3 ended / 4 scheduled = 0.75
    expect(result.consult.completionRate).toBeCloseTo(0.75, 5);
    expect(result.consult.medianDurationSeconds).toBe(600);
  });

  it('averages the middle two for an even count of durations', async () => {
    const { admin } = makeAdmin({
      consultation_sessions: {
        data: [
          // durations: 300s, 600s → median (300+600)/2 = 450
          {
            status: 'ended',
            actual_started_at: '2026-06-02T10:00:00.000Z',
            actual_ended_at: '2026-06-02T10:05:00.000Z',
          },
          {
            status: 'ended',
            actual_started_at: '2026-06-03T10:00:00.000Z',
            actual_ended_at: '2026-06-03T10:10:00.000Z',
          },
        ],
        error: null,
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);

    const result = await getPracticeHealth({ doctorId, from, to, correlationId });

    expect(result.consult.completionRate).toBe(1);
    expect(result.consult.medianDurationSeconds).toBe(450);
  });

  it('ignores sessions missing a start or end timestamp', async () => {
    const { admin } = makeAdmin({
      consultation_sessions: {
        data: [
          {
            status: 'ended',
            actual_started_at: '2026-06-02T10:00:00.000Z',
            actual_ended_at: null,
          },
          {
            status: 'ended',
            actual_started_at: null,
            actual_ended_at: '2026-06-03T10:10:00.000Z',
          },
          {
            status: 'ended',
            actual_started_at: '2026-06-04T10:00:00.000Z',
            actual_ended_at: '2026-06-04T10:07:00.000Z',
          },
        ],
        error: null,
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);

    const result = await getPracticeHealth({ doctorId, from, to, correlationId });

    // Only the third session has both timestamps → median = 420s.
    expect(result.consult.medianDurationSeconds).toBe(420);
  });
});

describe('getPracticeHealth — scoping and guards', () => {
  it('filters every table by the doctor id', async () => {
    const { admin, eqCalls } = makeAdmin({
      appointments: { data: [], error: null },
      payments: { data: [], error: null },
      consultation_sessions: { data: [], error: null },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);

    await getPracticeHealth({ doctorId, from, to, correlationId });

    expect(eqCalls['appointments']).toContainEqual(['doctor_id', doctorId]);
    expect(eqCalls['payments']).toContainEqual(['appointments.doctor_id', doctorId]);
    expect(eqCalls['payments']).toContainEqual(['status', 'captured']);
    expect(eqCalls['consultation_sessions']).toContainEqual(['doctor_id', doctorId]);
  });

  it('audits the aggregate read', async () => {
    const { admin } = makeAdmin({ appointments: { data: [], error: null } });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);

    await getPracticeHealth({ doctorId, from, to, correlationId });

    expect(mockedAudit.logDataAccess).toHaveBeenCalledWith(
      correlationId,
      doctorId,
      'practice_insights',
      doctorId
    );
  });

  it('throws when the admin client is unavailable', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(null);

    await expect(
      getPracticeHealth({ doctorId, from, to, correlationId })
    ).rejects.toThrow('Service role client not available');
  });

  it('throws ValidationError when doctorId is missing', async () => {
    await expect(
      getPracticeHealth({ doctorId: '', from, to, correlationId })
    ).rejects.toThrow('doctorId is required');
  });
});

describe('getBookingFunnel — stages', () => {
  it('counts funnel stages and scopes payments to captured only', async () => {
    const { admin, eqCalls } = makeAdmin({
      slot_selections: {
        data: [
          { consumed_at: '2026-06-02T10:00:00.000Z' },
          { consumed_at: '2026-06-03T10:00:00.000Z' },
          { consumed_at: null },
          { consumed_at: null },
        ],
        error: null,
      },
      payments: {
        data: [{ id: 'p1' }, { id: 'p2' }],
        error: null,
      },
      appointments: {
        data: [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }],
        error: null,
      },
      service_staff_review_requests: { data: [], error: null },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);

    const result = await getBookingFunnel({ doctorId, from, to, correlationId });

    expect(result.funnel).toEqual({
      slotsSelected: 4,
      slotsConsumed: 2,
      paymentsCaptured: 2,
      appointmentsConfirmed: 3,
    });
    expect(eqCalls['slot_selections']).toContainEqual(['doctor_id', doctorId]);
    expect(eqCalls['payments']).toContainEqual(['status', 'captured']);
    expect(eqCalls['payments']).toContainEqual(['appointments.doctor_id', doctorId]);
    expect(eqCalls['appointments']).toContainEqual(['doctor_id', doctorId]);
  });

  it('returns zeros on an empty range without throwing', async () => {
    const { admin } = makeAdmin({
      slot_selections: { data: [], error: null },
      payments: { data: [], error: null },
      appointments: { data: [], error: null },
      service_staff_review_requests: { data: [], error: null },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);

    const result = await getBookingFunnel({ doctorId, from, to, correlationId });

    expect(result.funnel).toEqual({
      slotsSelected: 0,
      slotsConsumed: 0,
      paymentsCaptured: 0,
      appointmentsConfirmed: 0,
    });
    expect(result.review).toEqual({
      pending: 0,
      medianResolutionSeconds: 0,
      breachedSla: 0,
    });
  });
});

describe('getBookingFunnel — review SLA', () => {
  it('computes pending, median resolution, and breaches', async () => {
    // Freeze "now" so the still-pending breach is deterministic.
    const nowSpy = jest
      .spyOn(Date, 'now')
      .mockReturnValue(Date.parse('2026-06-20T12:00:00.000Z'));

    const { admin } = makeAdmin({
      slot_selections: { data: [], error: null },
      payments: { data: [], error: null },
      appointments: { data: [], error: null },
      service_staff_review_requests: {
        data: [
          // Resolved in 600s, on time
          {
            status: 'confirmed',
            created_at: '2026-06-02T10:00:00.000Z',
            resolved_at: '2026-06-02T10:10:00.000Z',
            sla_deadline_at: '2026-06-02T11:00:00.000Z',
          },
          // Resolved in 1800s, after deadline → breach
          {
            status: 'reassigned',
            created_at: '2026-06-03T10:00:00.000Z',
            resolved_at: '2026-06-03T10:30:00.000Z',
            sla_deadline_at: '2026-06-03T10:15:00.000Z',
          },
          // Still pending, past deadline → breach + pending
          {
            status: 'pending',
            created_at: '2026-06-10T10:00:00.000Z',
            resolved_at: null,
            sla_deadline_at: '2026-06-10T11:00:00.000Z',
          },
          // Still pending, within SLA → pending only
          {
            status: 'pending',
            created_at: '2026-06-20T11:00:00.000Z',
            resolved_at: null,
            sla_deadline_at: '2026-06-20T13:00:00.000Z',
          },
          // Resolved in 300s (odd/even median with 600 → 450)
        ],
        error: null,
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);

    const result = await getBookingFunnel({ doctorId, from, to, correlationId });

    expect(result.review.pending).toBe(2);
    expect(result.review.breachedSla).toBe(2);
    // Resolutions: 600s, 1800s → median (600+1800)/2 = 1200
    expect(result.review.medianResolutionSeconds).toBe(1200);

    nowSpy.mockRestore();
  });

  it('median resolution is correct for an odd count of resolved rows', async () => {
    const { admin } = makeAdmin({
      slot_selections: { data: [], error: null },
      payments: { data: [], error: null },
      appointments: { data: [], error: null },
      service_staff_review_requests: {
        data: [
          {
            status: 'confirmed',
            created_at: '2026-06-01T10:00:00.000Z',
            resolved_at: '2026-06-01T10:05:00.000Z', // 300
            sla_deadline_at: '2026-06-01T12:00:00.000Z',
          },
          {
            status: 'confirmed',
            created_at: '2026-06-02T10:00:00.000Z',
            resolved_at: '2026-06-02T10:10:00.000Z', // 600
            sla_deadline_at: '2026-06-02T12:00:00.000Z',
          },
          {
            status: 'confirmed',
            created_at: '2026-06-03T10:00:00.000Z',
            resolved_at: '2026-06-03T10:15:00.000Z', // 900
            sla_deadline_at: '2026-06-03T12:00:00.000Z',
          },
        ],
        error: null,
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);

    const result = await getBookingFunnel({ doctorId, from, to, correlationId });
    expect(result.review.medianResolutionSeconds).toBe(600);
    expect(result.review.breachedSla).toBe(0);
    expect(result.review.pending).toBe(0);
  });
});

describe('getClinicalMix', () => {
  it('ranks top Dx / meds / investigations from structured prescription JSON', async () => {
    const { admin, eqCalls } = makeAdmin({
      prescriptions: {
        data: [
          {
            diagnoses_json: [
              { id: '1', label: 'Type 2 diabetes', code: '5A11' },
              { id: '2', label: 'Hypertension', code: 'BA00' },
              // note must never leak into the response
              { id: '3', label: '  type 2 diabetes ', code: '5A11', note: 'secret PHI' },
            ],
            investigations_orders_json: [
              { id: 'i1', label: 'HbA1c' },
              { id: 'i2', label: 'ECG' },
              {
                id: 'i3',
                label: 'hba1c',
                requisition: { indication: 'patient coughs a lot' },
              },
            ],
          },
          {
            diagnoses_json: [{ id: '4', label: 'Hypertension' }],
            investigations_orders_json: [{ id: 'i4', label: 'ECG' }],
          },
        ],
        error: null,
      },
      prescription_medicines: {
        data: [
          { medicine_name: 'Metformin' },
          { medicine_name: ' metformin ' },
          { medicine_name: 'Amlodipine' },
          { medicine_name: 'Metformin' },
        ],
        error: null,
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);

    const result = await getClinicalMix({
      doctorId,
      from,
      to,
      limit: 10,
      correlationId,
    });

    expect(result.diagnosesSource).toBe('diagnoses_json');
    // Tied counts sort alphabetically: Hypertension before Type 2 diabetes.
    expect(result.topDiagnoses[0]).toEqual({
      label: 'Hypertension',
      count: 2,
      code: 'BA00',
    });
    expect(result.topDiagnoses[1]).toEqual({
      label: 'Type 2 diabetes',
      count: 2,
      code: '5A11',
    });
    expect(result.topMedicines[0]).toEqual({ label: 'Metformin', count: 3 });
    expect(result.topMedicines[1]).toEqual({ label: 'Amlodipine', count: 1 });
    // Tied counts sort alphabetically: ECG before HbA1c.
    expect(result.topInvestigations).toEqual([
      { label: 'ECG', count: 2 },
      { label: 'HbA1c', count: 2 },
    ]);

    // De-identified: no notes / indications / patient fields.
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('secret PHI');
    expect(serialized).not.toContain('patient coughs');
    expect(serialized).not.toContain('patient_id');
    expect(serialized).not.toMatch(/"note"/);

    expect(eqCalls['prescriptions']).toContainEqual(['doctor_id', doctorId]);
    expect(eqCalls['prescription_medicines']).toContainEqual([
      'prescriptions.doctor_id',
      doctorId,
    ]);
  });

  it('falls back to appointment diagnosis_tags when diagnoses_json is empty', async () => {
    const { admin } = makeAdmin({
      prescriptions: {
        data: [
          { diagnoses_json: [], investigations_orders_json: [] },
          { diagnoses_json: null, investigations_orders_json: [] },
        ],
        error: null,
      },
      appointments: {
        data: [
          { diagnosis_tags: ['URI', '  uri '] },
          { diagnosis_tags: ['GERD'] },
          { diagnosis_tags: ['URI'] },
        ],
        error: null,
      },
      prescription_medicines: { data: [], error: null },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);

    const result = await getClinicalMix({
      doctorId,
      from,
      to,
      limit: 10,
      correlationId,
    });

    expect(result.diagnosesSource).toBe('diagnosis_tags');
    expect(result.topDiagnoses).toEqual([
      { label: 'URI', count: 3 },
      { label: 'GERD', count: 1 },
    ]);
  });

  it('respects limit and returns empty lists without throwing', async () => {
    const { admin } = makeAdmin({
      prescriptions: {
        data: [
          {
            diagnoses_json: [
              { label: 'A' },
              { label: 'B' },
              { label: 'C' },
              { label: 'A' },
              { label: 'B' },
              { label: 'A' },
            ],
            investigations_orders_json: [],
          },
        ],
        error: null,
      },
      prescription_medicines: { data: [], error: null },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);

    const limited = await getClinicalMix({
      doctorId,
      from,
      to,
      limit: 2,
      correlationId,
    });
    expect(limited.topDiagnoses).toHaveLength(2);
    expect(limited.topDiagnoses[0]!.label).toBe('A');
    expect(limited.topDiagnoses[0]!.count).toBe(3);

    const emptyAdmin = makeAdmin({
      prescriptions: { data: [], error: null },
      appointments: { data: [], error: null },
      prescription_medicines: { data: [], error: null },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(emptyAdmin.admin as never);

    const empty = await getClinicalMix({
      doctorId,
      from,
      to,
      limit: 10,
      correlationId,
    });
    expect(empty.topDiagnoses).toEqual([]);
    expect(empty.topMedicines).toEqual([]);
    expect(empty.topInvestigations).toEqual([]);
    expect(empty.diagnosesSource).toBe('none');
  });

  it('rejects an out-of-range limit', async () => {
    await expect(
      getClinicalMix({ doctorId, from, to, limit: 0, correlationId })
    ).rejects.toThrow(/limit must be/);
    await expect(
      getClinicalMix({ doctorId, from, to, limit: 51, correlationId })
    ).rejects.toThrow(/limit must be/);
  });
});

describe('getTelehealthQuality', () => {
  it('computes modality mix, switches, join success, and quality percentiles', async () => {
    const { admin, eqCalls } = makeAdmin({
      consultation_sessions: {
        data: [
          {
            modality: 'video',
            actual_started_at: '2026-06-02T10:00:00.000Z',
            patient_joined_at: '2026-06-02T10:01:00.000Z',
            upgrade_count: 1,
            downgrade_count: 0,
          },
          {
            modality: 'video',
            actual_started_at: '2026-06-03T10:00:00.000Z',
            patient_joined_at: null, // started but patient never joined
            upgrade_count: 0,
            downgrade_count: 0,
          },
          {
            modality: 'voice',
            actual_started_at: '2026-06-04T10:00:00.000Z',
            patient_joined_at: '2026-06-04T10:00:30.000Z',
            upgrade_count: 0,
            downgrade_count: 1,
          },
          {
            modality: 'text',
            actual_started_at: null,
            patient_joined_at: null,
            upgrade_count: 0,
            downgrade_count: 0,
          },
        ],
        error: null,
      },
      video_call_quality: {
        // RTT sorted: 20,40,60,80,100 → p50 nearest-rank = 60; p95 = 100
        data: [
          { rtt_ms: 20, packet_loss_pct: 1 },
          { rtt_ms: 40, packet_loss_pct: 2 },
          { rtt_ms: 60, packet_loss_pct: 3 },
          { rtt_ms: 80, packet_loss_pct: 4 },
          { rtt_ms: 100, packet_loss_pct: 5 },
        ],
        error: null,
      },
      voice_call_quality: {
        data: [
          { rtt_ms: 30, packet_loss_pct: 0.5 },
          { rtt_ms: 50, packet_loss_pct: 1.5 },
        ],
        error: null,
      },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);

    const result = await getTelehealthQuality({
      doctorId,
      from,
      to,
      correlationId,
    });

    expect(result.modalityMix).toEqual({ text: 1, voice: 1, video: 2 });
    expect(result.switches).toEqual({ upgrades: 1, downgrades: 1 });
    // 2 joined of 3 started → 2/3
    expect(result.joinSuccessRate).toBeCloseTo(2 / 3, 5);
    expect(result.quality.video).toEqual({
      p50Rtt: 60,
      p95Rtt: 100,
      avgPacketLoss: 3,
    });
    expect(result.quality.voice).toEqual({
      p50Rtt: 30,
      p95Rtt: 50,
      avgPacketLoss: 1,
    });

    expect(eqCalls['consultation_sessions']).toContainEqual([
      'doctor_id',
      doctorId,
    ]);
    expect(eqCalls['video_call_quality']).toContainEqual([
      'consultation_sessions.doctor_id',
      doctorId,
    ]);
    expect(eqCalls['voice_call_quality']).toContainEqual([
      'consultation_sessions.doctor_id',
      doctorId,
    ]);
  });

  it('returns zeros / nulls on an empty range without throwing', async () => {
    const { admin } = makeAdmin({
      consultation_sessions: { data: [], error: null },
      video_call_quality: { data: [], error: null },
      voice_call_quality: { data: [], error: null },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);

    const result = await getTelehealthQuality({
      doctorId,
      from,
      to,
      correlationId,
    });

    expect(result.modalityMix).toEqual({ text: 0, voice: 0, video: 0 });
    expect(result.switches).toEqual({ upgrades: 0, downgrades: 0 });
    expect(result.joinSuccessRate).toBe(0);
    expect(result.quality.video).toEqual({
      p50Rtt: null,
      p95Rtt: null,
      avgPacketLoss: null,
    });
    expect(result.quality.voice).toEqual({
      p50Rtt: null,
      p95Rtt: null,
      avgPacketLoss: null,
    });
  });
});
