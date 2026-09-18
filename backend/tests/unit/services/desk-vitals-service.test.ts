import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
  supabase: {},
}));

jest.mock('../../../src/utils/audit-logger', () => ({
  logDataAccess: jest.fn(async () => undefined),
  logDataModification: jest.fn(async () => undefined),
  logAuditEvent: jest.fn(async () => undefined),
}));

import { getSupabaseAdminClient } from '../../../src/config/database';
import { getDeskVitals, upsertDeskVitals } from '../../../src/services/desk-vitals-service';
import { logDataAccess, logDataModification } from '../../../src/utils/audit-logger';
import { NotFoundError, ValidationError } from '../../../src/utils/errors';

const DOCTOR_ID = '00000000-0000-0000-0000-0000000000aa';
const ACTOR_ID = '00000000-0000-0000-0000-0000000000cc';
const APT_ID = '00000000-0000-0000-0000-0000000000ff';
const PATIENT_ID = '00000000-0000-0000-0000-0000000000ee';
const VITALS_ID = '00000000-0000-0000-0000-0000000000bb';

const CHECKED_IN = {
  id: APT_ID,
  doctor_id: DOCTOR_ID,
  patient_id: PATIENT_ID,
  status: 'confirmed',
  patient_checked_in_at: '2026-08-24T04:00:00.000Z',
};

function appointmentChain(row: Record<string, unknown> | null) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
      data: row,
      error: null,
    }),
  };
}

function vitalsLookupChain(row: Record<string, unknown> | null) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
      data: row,
      error: null,
    }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getDeskVitals', () => {
  it('returns null when the arrived visit has no reading yet', async () => {
    const apt = appointmentChain(CHECKED_IN);
    const vitals = vitalsLookupChain(null);
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => (table === 'appointments' ? apt : vitals)),
    });

    const row = await getDeskVitals(APT_ID, DOCTOR_ID, 'cid', ACTOR_ID);
    expect(row).toBeNull();
    expect(logDataAccess).toHaveBeenCalledWith('cid', ACTOR_ID, 'patient_vitals', PATIENT_ID);
  });

  it('rejects before check-in', async () => {
    const apt = appointmentChain({ ...CHECKED_IN, patient_checked_in_at: null });
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => apt),
    });

    await expect(getDeskVitals(APT_ID, DOCTOR_ID, 'cid', ACTOR_ID)).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it('hides another doctor appointment', async () => {
    const apt = appointmentChain({ ...CHECKED_IN, doctor_id: 'other' });
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => apt),
    });

    await expect(getDeskVitals(APT_ID, DOCTOR_ID, 'cid', ACTOR_ID)).rejects.toBeInstanceOf(
      NotFoundError
    );
  });
});

describe('upsertDeskVitals', () => {
  it('inserts a new reading for the acting doctor and audits the staff actor', async () => {
    const created = {
      id: VITALS_ID,
      doctor_id: DOCTOR_ID,
      patient_id: PATIENT_ID,
      appointment_id: APT_ID,
      heart_rate: 72,
    };
    const apt = appointmentChain(CHECKED_IN);
    const lookup = vitalsLookupChain(null);
    const insert = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
        data: created,
        error: null,
      }),
    };
    let vitalsCalls = 0;
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'appointments') return apt;
        vitalsCalls += 1;
        return vitalsCalls === 1 ? lookup : insert;
      }),
    });

    const row = await upsertDeskVitals(APT_ID, DOCTOR_ID, { heartRate: 72 }, 'cid', ACTOR_ID);
    expect(row.id).toBe(VITALS_ID);
    expect(insert.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        doctor_id: DOCTOR_ID,
        patient_id: PATIENT_ID,
        appointment_id: APT_ID,
        heart_rate: 72,
        note: null,
      })
    );
    expect(logDataModification).toHaveBeenCalledWith(
      'cid',
      ACTOR_ID,
      'create',
      'patient_vitals',
      VITALS_ID,
      undefined,
      DOCTOR_ID
    );
  });

  it('updates an existing appointment-scoped row', async () => {
    const existing = {
      id: VITALS_ID,
      doctor_id: DOCTOR_ID,
      appointment_id: APT_ID,
      heart_rate: 72,
    };
    const apt = appointmentChain(CHECKED_IN);
    const lookup = vitalsLookupChain(existing);
    const update = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
        data: { ...existing, heart_rate: 80 },
        error: null,
      }),
    };
    let vitalsCalls = 0;
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'appointments') return apt;
        vitalsCalls += 1;
        return vitalsCalls === 1 ? lookup : update;
      }),
    });

    const row = await upsertDeskVitals(APT_ID, DOCTOR_ID, { heartRate: 80 }, 'cid', ACTOR_ID);
    expect(row.heart_rate).toBe(80);
    expect(update.update).toHaveBeenCalledWith(expect.objectContaining({ heart_rate: 80 }));
  });

  it('persists a trimmed note on insert', async () => {
    const created = {
      id: VITALS_ID,
      doctor_id: DOCTOR_ID,
      patient_id: PATIENT_ID,
      appointment_id: APT_ID,
      note: 'sitting',
    };
    const apt = appointmentChain(CHECKED_IN);
    const lookup = vitalsLookupChain(null);
    const insert = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
        data: created,
        error: null,
      }),
    };
    let vitalsCalls = 0;
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'appointments') return apt;
        vitalsCalls += 1;
        return vitalsCalls === 1 ? lookup : insert;
      }),
    });

    await upsertDeskVitals(APT_ID, DOCTOR_ID, { note: '  sitting  ' }, 'cid', ACTOR_ID);
    expect(insert.insert).toHaveBeenCalledWith(expect.objectContaining({ note: 'sitting' }));
  });

  it('clears a note on update when the client sends null', async () => {
    const existing = {
      id: VITALS_ID,
      doctor_id: DOCTOR_ID,
      appointment_id: APT_ID,
      note: 'sitting',
    };
    const apt = appointmentChain(CHECKED_IN);
    const lookup = vitalsLookupChain(existing);
    const update = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
        data: { ...existing, note: null },
        error: null,
      }),
    };
    let vitalsCalls = 0;
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'appointments') return apt;
        vitalsCalls += 1;
        return vitalsCalls === 1 ? lookup : update;
      }),
    });

    await upsertDeskVitals(APT_ID, DOCTOR_ID, { heartRate: 80, note: null }, 'cid', ACTOR_ID);
    expect(update.update).toHaveBeenCalledWith(expect.objectContaining({ note: null }));
  });
});
