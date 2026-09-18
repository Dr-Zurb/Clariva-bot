import { describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../src/config/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

jest.mock('../../../src/services/consultation-session-service', () => ({
  findSessionById: jest.fn(),
}));

jest.mock('../../../src/services/patient-service', () => ({
  findPatientByIdWithAdmin: jest.fn(),
}));

import { ForbiddenError, NotFoundError } from '../../../src/utils/errors';
import { recordVisitNarrativeProvenance } from '../../../src/services/visit-narrative-provenance-service';

const SESSION_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TRANSCRIPT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const DOCTOR_ID = '11111111-1111-1111-1111-111111111111';
const OTHER = '33333333-3333-3333-3333-333333333333';

const baseInput = {
  consultationSessionId: SESSION_ID,
  transcriptId: TRANSCRIPT_ID,
  spanStart: 0,
  spanEnd: 5,
  targetKind: 'vitals' as const,
  doctorId: DOCTOR_ID,
  correlationId: 'c1',
};

describe('recordVisitNarrativeProvenance', () => {
  it('inserts an append-only row for the owning doctor', async () => {
    const insertRow = jest.fn(async () => ({ id: 'prov-1' }));
    const result = await recordVisitNarrativeProvenance(baseInput, {
      loadSession: async () => ({
        doctorId: DOCTOR_ID,
        appointmentId: 'appt-1',
        patientId: 'pat-1',
      }),
      insertRow,
    });
    expect(result).toEqual({ recorded: true, id: 'prov-1' });
    expect(insertRow).toHaveBeenCalledWith(
      expect.objectContaining({
        doctor_id: DOCTOR_ID,
        appointment_id: 'appt-1',
        consultation_session_id: SESSION_ID,
        transcript_id: TRANSCRIPT_ID,
        span_start: 0,
        span_end: 5,
        target_kind: 'vitals',
        accepted_by: DOCTOR_ID,
      }),
    );
  });

  it('does not throw when insert fails — accept must not block', async () => {
    const result = await recordVisitNarrativeProvenance(baseInput, {
      loadSession: async () => ({
        doctorId: DOCTOR_ID,
        appointmentId: 'appt-1',
        patientId: null,
      }),
      insertRow: async () => null,
    });
    expect(result).toEqual({ recorded: false, id: null });
  });

  it('404s another doctor and forbids clinic staff', async () => {
    await expect(
      recordVisitNarrativeProvenance(
        { ...baseInput, doctorId: OTHER },
        {
          loadSession: async () => ({
            doctorId: DOCTOR_ID,
            appointmentId: 'appt-1',
            patientId: 'pat-1',
          }),
          insertRow: async () => ({ id: 'x' }),
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);

    await expect(
      recordVisitNarrativeProvenance(
        { ...baseInput, actorRole: 'receptionist' },
        {
          loadSession: async () => ({
            doctorId: DOCTOR_ID,
            appointmentId: 'appt-1',
            patientId: 'pat-1',
          }),
          insertRow: async () => ({ id: 'x' }),
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
