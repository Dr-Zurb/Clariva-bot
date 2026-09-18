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

jest.mock('../../../src/services/consultation-session-service', () => ({
  findLatestAppointmentSessionSummary: jest.fn(async () => null),
  findLatestAppointmentSessionSummariesBulk: jest.fn(async () => new Map()),
}));

jest.mock('../../../src/services/prescription-pdf-service', () => ({
  generatePrescriptionPdf: jest.fn(async () => Buffer.from([])),
  buildPrescriptionPdfContext: jest.fn(async () => ({})),
}));

jest.mock('../../../src/services/patient-service', () => ({
  ensurePatientMrnIfEligible: jest.fn(),
}));

jest.mock('../../../src/services/doctor-settings-service', () => ({
  getDoctorSettings: jest.fn(async () => null),
  getDoctorTimezone: jest.fn(async () => 'Asia/Kolkata'),
}));

jest.mock('../../../src/services/care-episode-service', () => ({
  syncCareEpisodeLifecycleOnAppointmentCompleted: jest.fn(async () => undefined),
}));

import { getSupabaseAdminClient } from '../../../src/config/database';
import { checkInAppointment } from '../../../src/services/appointment-service';
import { logDataModification } from '../../../src/utils/audit-logger';
import { NotFoundError, ValidationError } from '../../../src/utils/errors';

const DOCTOR_ID = '00000000-0000-0000-0000-0000000000aa';
const ACTOR_ID = '00000000-0000-0000-0000-0000000000cc';
const APT_ID = '00000000-0000-0000-0000-0000000000ff';

function mockAdmin(existing: Record<string, unknown>, updated?: Record<string, unknown>) {
  const single = jest
    .fn<(...args: unknown[]) => Promise<unknown>>()
    .mockResolvedValueOnce({ data: existing, error: null })
    .mockResolvedValueOnce({ data: updated ?? existing, error: null });
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    single,
  };
  return {
    from: jest.fn().mockReturnValue(chain),
    chain,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('checkInAppointment', () => {
  it('stamps patient_checked_in_at and audits the actor', async () => {
    const existing = {
      id: APT_ID,
      doctor_id: DOCTOR_ID,
      status: 'confirmed',
      patient_checked_in_at: null,
    };
    const updated = {
      ...existing,
      patient_checked_in_at: '2026-08-22T10:00:00.000Z',
    };
    const admin = mockAdmin(existing, updated);
    (getSupabaseAdminClient as jest.Mock).mockReturnValue(admin);

    const result = await checkInAppointment(APT_ID, DOCTOR_ID, 'cid', ACTOR_ID);

    expect(result.patient_checked_in_at).toBe('2026-08-22T10:00:00.000Z');
    expect(logDataModification).toHaveBeenCalledWith(
      'cid',
      ACTOR_ID,
      'update',
      'appointment',
      APT_ID,
      ['patient_checked_in_at'],
      DOCTOR_ID
    );
  });

  it('is idempotent when already checked in', async () => {
    const existing = {
      id: APT_ID,
      doctor_id: DOCTOR_ID,
      status: 'confirmed',
      patient_checked_in_at: '2026-08-22T09:00:00.000Z',
    };
    const admin = mockAdmin(existing);
    (getSupabaseAdminClient as jest.Mock).mockReturnValue(admin);

    const result = await checkInAppointment(APT_ID, DOCTOR_ID, 'cid', ACTOR_ID);

    expect(result.patient_checked_in_at).toBe('2026-08-22T09:00:00.000Z');
    expect(admin.chain.update).not.toHaveBeenCalled();
    expect(logDataModification).not.toHaveBeenCalled();
  });

  it('404s when the appointment belongs to another doctor', async () => {
    const admin = mockAdmin({
      id: APT_ID,
      doctor_id: '00000000-0000-0000-0000-0000000000bb',
      status: 'confirmed',
      patient_checked_in_at: null,
    });
    (getSupabaseAdminClient as jest.Mock).mockReturnValue(admin);

    await expect(checkInAppointment(APT_ID, DOCTOR_ID, 'cid', ACTOR_ID)).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it('rejects cancelled appointments', async () => {
    const admin = mockAdmin({
      id: APT_ID,
      doctor_id: DOCTOR_ID,
      status: 'cancelled',
      patient_checked_in_at: null,
    });
    (getSupabaseAdminClient as jest.Mock).mockReturnValue(admin);

    await expect(checkInAppointment(APT_ID, DOCTOR_ID, 'cid', ACTOR_ID)).rejects.toBeInstanceOf(
      ValidationError
    );
  });
});
