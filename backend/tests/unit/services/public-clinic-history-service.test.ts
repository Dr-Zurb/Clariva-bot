import { readFileSync } from 'fs';
import { resolve } from 'path';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const APPT = '44444444-4444-4444-8444-444444444444';
const PATIENT = '77777777-7777-4777-8777-777777777777';
const DOCTOR = '11111111-1111-4111-8111-111111111111';

const state: {
  existing: { id: string; source: string } | null;
  tables: string[];
  inserts: Array<{ table: string; payload: Record<string, unknown> }>;
  updates: Array<{ table: string; payload: Record<string, unknown> }>;
} = {
  existing: null,
  tables: [],
  inserts: [],
  updates: [],
};

function builder(table: string) {
  const b: Record<string, unknown> = {};
  const self = () => b;
  b.select = self;
  b.eq = self;
  b.insert = (payload: Record<string, unknown>) => {
    state.inserts.push({ table, payload });
    return b;
  };
  b.update = (payload: Record<string, unknown>) => {
    state.updates.push({ table, payload });
    return b;
  };
  b.maybeSingle = async () => {
    if (table === 'appointments') {
      return {
        data: {
          id: APPT,
          doctor_id: DOCTOR,
          patient_id: PATIENT,
          status: 'confirmed',
          appointment_date: '2030-01-15T10:00:00.000Z',
          reason_for_visit: 'Gate check',
        },
        error: null,
      };
    }
    if (table === 'doctor_settings') {
      return { data: { slot_interval_minutes: 30 }, error: null };
    }
    return { data: state.existing, error: null };
  };
  b.then = (resolve: (value: { data: null; error: null }) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve({ data: null, error: null }).then(resolve, reject);
  return b;
}

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: () => ({
    from: (table: string) => {
      state.tables.push(table);
      return builder(table);
    },
  }),
}));

jest.mock('../../../src/utils/audit-logger', () => ({
  logAuditEvent: jest.fn(async () => undefined),
}));

const input = {
  token: '',
  noticeVersion: 'pending-counsel',
  allergies: { none: true, items: [] as Array<{ name: string }> },
  medicines: { none: false, items: [{ name: 'Paracetamol' }] },
  conditions: { none: true, items: [] as Array<{ name: string }> },
  chips: { since: '2 days', course: 'worse' as const, aim: 'new_problem' as const },
};

async function load() {
  jest.resetModules();
  process.env.BOOKING_TOKEN_SECRET = 'test-booking-token-secret';
  const tokens = await import('../../../src/utils/history-form-token');
  const service = await import('../../../src/services/public-clinic-history-service');
  return { tokens, service };
}

describe('submitPatientHistory', () => {
  beforeEach(() => {
    state.existing = null;
    state.tables = [];
    state.inserts = [];
    state.updates = [];
  });

  it('does not call the desk upsert or a chart table', () => {
    const src = readFileSync(
      resolve(__dirname, '../../../src/services/public-clinic-history-service.ts'),
      'utf8'
    );
    expect(src).not.toContain('upsertHistorySubmission');
    expect(src).not.toContain('patient_medications');
    expect(src).not.toContain('patient_allergies');
    expect(src).not.toContain('patient_chronic_conditions');
  });

  it('inserts one patient row and saves chips without copying them into the reason', async () => {
    const { tokens, service } = await load();
    const token = tokens.mintHistoryFormToken(
      { id: APPT, status: 'confirmed', scheduledEnd: new Date('2030-01-15T10:30:00.000Z') },
      new Date('2030-01-15T09:00:00.000Z')
    );
    const result = await service.submitPatientHistory({ ...input, token }, 'corr-1');
    expect(result).toEqual({ listsStored: true, chipsSaved: true });
    const inserted = state.inserts.find((row) => row.table === 'patient_history_submissions');
    expect(inserted?.payload.source).toBe('patient');
    expect(inserted?.payload.actor_id).toBe(PATIENT);
    expect(inserted?.payload.why_today).toBe('Gate check');
    expect(inserted?.payload.notice_version).toBe('pending-counsel');
    const chips = state.updates.find((row) => row.table === 'appointments');
    expect(chips?.payload).toEqual({
      previsit_context: { since: '2 days', course: 'worse', aim: 'new_problem' },
    });
    expect(JSON.stringify(state.updates)).not.toContain('reason_for_visit');
    expect(state.tables).not.toContain('patient_medications');
  });

  it('stores how long on a medicine and a condition', async () => {
    const { tokens, service } = await load();
    const token = tokens.mintHistoryFormToken(
      { id: APPT, status: 'confirmed', scheduledEnd: new Date('2030-01-15T10:30:00.000Z') },
      new Date('2030-01-15T09:00:00.000Z')
    );
    await service.submitPatientHistory(
      {
        ...input,
        token,
        medicines: { none: false, items: [{ name: 'Amlodac 5mg', durationValue: 5, durationUnit: 'years' }] },
        conditions: { none: false, items: [{ name: 'Asthma', durationValue: 2, durationUnit: 'months' }] },
      },
      'corr-duration'
    );
    const inserted = state.inserts.find((row) => row.table === 'patient_history_submissions');
    expect(inserted?.payload.medicines).toEqual({
      none: false,
      items: [{ name: 'Amlodac 5mg', durationValue: 5, durationUnit: 'years' }],
    });
    expect(inserted?.payload.conditions).toEqual({
      none: false,
      items: [{ name: 'Asthma', durationValue: 2, durationUnit: 'months' }],
    });
    expect(inserted?.payload.allergies).toEqual({ none: true, items: [] });
  });

  it('stores a skipped medicine list as empty rather than none', async () => {
    const { tokens, service } = await load();
    const token = tokens.mintHistoryFormToken(
      { id: APPT, status: 'confirmed', scheduledEnd: new Date('2030-01-15T10:30:00.000Z') },
      new Date('2030-01-15T09:00:00.000Z')
    );
    await service.submitPatientHistory(
      {
        ...input,
        token,
        medicines: { none: false, items: [] },
      },
      'corr-skip'
    );
    const inserted = state.inserts.find((row) => row.table === 'patient_history_submissions');
    expect(inserted?.payload.medicines).toEqual({ none: false, items: [] });
  });

  it('rejects a second patient submit and leaves a desk row unchanged while still saving chips', async () => {
    const { tokens, service } = await load();
    const token = tokens.mintHistoryFormToken(
      { id: APPT, status: 'confirmed', scheduledEnd: new Date('2030-01-15T10:30:00.000Z') },
      new Date('2030-01-15T09:00:00.000Z')
    );
    state.existing = { id: 'row-1', source: 'patient' };
    await expect(service.submitPatientHistory({ ...input, token }, 'corr-2')).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(state.inserts).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
    expect(state.existing).toEqual({ id: 'row-1', source: 'patient' });

    state.existing = { id: 'row-2', source: 'front_desk' };
    state.inserts = [];
    state.updates = [];
    const hidden = await service.submitPatientHistory({ ...input, token }, 'corr-3');
    expect(hidden).toEqual({ listsStored: false, chipsSaved: true });
    expect(state.inserts).toHaveLength(0);
    expect(state.updates[0]?.payload.previsit_context).toEqual({
      since: '2 days',
      course: 'worse',
      aim: 'new_problem',
    });
    expect(state.existing).toEqual({ id: 'row-2', source: 'front_desk' });
  });

  it('does not write when the token is missing', async () => {
    const { service } = await load();
    await expect(service.submitPatientHistory({ ...input, token: '' }, 'corr-4')).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(state.tables).toHaveLength(0);
  });
});
