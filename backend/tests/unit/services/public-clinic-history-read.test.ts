import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const APPT = '44444444-4444-4444-8444-444444444444';
const PATIENT = '77777777-7777-4777-8777-777777777777';
const DOCTOR = '11111111-1111-4111-8111-111111111111';
const CONV = '66666666-6666-4666-8666-666666666666';

const state: {
  tables: string[];
  existing: {
    source: string;
    allergies?: unknown;
    medicines?: unknown;
    conditions?: unknown;
  } | null;
  chips: unknown;
  consultationType: string | null;
} = {
  tables: [],
  existing: null,
  chips: { since: '3 days', course: 'worse', reason_for_visit: 'should not leak' },
  consultationType: 'video',
};

function builder(table: string) {
  const b: Record<string, unknown> = {};
  const self = () => b;
  b.select = self;
  b.eq = self;
  b.maybeSingle = async () => {
    if (table === 'appointments') {
      return {
        data: {
          id: APPT,
          doctor_id: DOCTOR,
          patient_id: PATIENT,
          status: 'confirmed',
          appointment_date: '2030-01-15T10:00:00.000Z',
          previsit_context: state.chips,
          consultation_type: state.consultationType,
        },
        error: null,
      };
    }
    if (table === 'doctor_settings') {
      return { data: { slot_interval_minutes: 30 }, error: null };
    }
    return { data: state.existing, error: null };
  };
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

async function load() {
  jest.resetModules();
  process.env.BOOKING_TOKEN_SECRET = 'test-booking-token-secret';
  process.env.CONSULTATION_TOKEN_SECRET = 'test-consultation-token-secret';
  const tokens = await import('../../../src/utils/history-form-token');
  const booking = await import('../../../src/utils/booking-token');
  const service = await import('../../../src/services/public-clinic-history-service');
  return { tokens, booking, service };
}

describe('readPatientHistory', () => {
  beforeEach(() => {
    state.tables = [];
    state.existing = null;
    state.chips = { since: '3 days', course: 'worse', reason_for_visit: 'should not leak' };
    state.consultationType = 'video';
  });

  it('returns an empty form and does not read the chart', async () => {
    const { tokens, service } = await load();
    const token = tokens.mintHistoryFormToken(
      { id: APPT, status: 'confirmed', scheduledEnd: new Date('2030-01-15T10:30:00.000Z') },
      new Date('2030-01-15T09:00:00.000Z')
    );
    const result = await service.readPatientHistory(token, 'corr-read');
    expect(result.consultationType).toBe('video');
    expect(result).not.toHaveProperty('orders');
    expect(JSON.stringify(result)).not.toContain('patient_name');
    expect(result.listsEditable).toBe(true);
    expect(result.alreadySent).toBe(false);
    expect(result.allergies).toEqual({ none: false, items: [] });
    expect(result.medicines).toEqual({ none: false, items: [] });
    expect(result.conditions).toEqual({ none: false, items: [] });
    expect(result.chips).toEqual({ since: '3 days', course: 'worse' });
    expect(JSON.stringify(result)).not.toContain('should not leak');
    expect(state.tables).not.toContain('patient_allergies');
    expect(state.tables).not.toContain('patient_medications');
    expect(state.tables).not.toContain('patient_chronic_conditions');
    expect(state.tables).not.toContain('patients');
  });

  it('hides desk lists and keeps a patient row read-only', async () => {
    const { tokens, service } = await load();
    const token = tokens.mintHistoryFormToken(
      { id: APPT, status: 'confirmed', scheduledEnd: new Date('2030-01-15T10:30:00.000Z') },
      new Date('2030-01-15T09:00:00.000Z')
    );
    state.existing = {
      source: 'front_desk',
      medicines: { none: false, items: [{ name: 'Secret med', dose: '40' }] },
      allergies: { none: false, items: [{ name: 'Penicillin' }] },
      conditions: { none: false, items: [{ name: 'Asthma' }] },
    };
    const hidden = await service.readPatientHistory(token, 'corr-desk');
    expect(hidden.listsHidden).toBe(true);
    expect(hidden.listsEditable).toBe(false);
    expect(hidden.allergies).toBeUndefined();
    expect(hidden.medicines).toBeUndefined();
    expect(hidden.conditions).toBeUndefined();
    expect(JSON.stringify(hidden)).not.toContain('Secret med');
    expect(hidden.chips).toEqual({ since: '3 days', course: 'worse' });

    state.existing = {
      source: 'patient',
      medicines: {
        none: false,
        items: [
          {
            name: 'Telma 40',
            durationValue: 5,
            durationUnit: 'years',
            accepted_at: '2030-01-01',
          },
        ],
      },
      allergies: { none: true, items: [] },
      conditions: { none: true, items: [] },
    };
    const sent = await service.readPatientHistory(token, 'corr-sent');
    expect(sent.alreadySent).toBe(true);
    expect(sent.listsEditable).toBe(false);
    expect(sent.medicines).toEqual({
      none: false,
      items: [{ name: 'Telma 40', durationValue: 5, durationUnit: 'years' }],
    });
    expect(JSON.stringify(sent)).not.toContain('accepted_at');
  });

  it('returns no lists for a booking token', async () => {
    const { booking, service } = await load();
    await expect(
      service.readPatientHistory(booking.generateBookingToken(CONV, DOCTOR), 'corr-book')
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(state.tables).toHaveLength(0);
  });
});
