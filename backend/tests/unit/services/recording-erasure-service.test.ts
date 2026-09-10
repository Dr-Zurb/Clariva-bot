/**
 * rec-32 — patient recording erasure plan + apply.
 * All Twilio interaction is mocked. No live delete.
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('../../../src/config/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

jest.mock('../../../src/services/regulatory-retention-service', () => ({
  resolveRetentionPolicy: jest.fn(),
}));

jest.mock('../../../src/services/storage-service', () => {
  const actual = jest.requireActual(
    '../../../src/services/storage-service',
  ) as typeof import('../../../src/services/storage-service');
  return {
    ...actual,
    deleteObject: jest.fn().mockReturnValue(Promise.resolve(true)),
  };
});

jest.mock('../../../src/services/twilio-compositions', () => ({
  deleteComposition: jest.fn().mockReturnValue(Promise.resolve()),
  fetchCompositionMetadata: jest.fn(),
}));

jest.mock('../../../src/services/twilio-recordings', () => ({
  deleteRecording: jest.fn().mockReturnValue(Promise.resolve()),
  fetchRecordingMetadata: jest.fn(),
}));

import {
  applyPatientErasurePlan,
  buildPatientErasurePlan,
  deriveErasureDmOutcome,
  planAndMaybeErasePatientRecordings,
} from '../../../src/services/recording-erasure-service';
import * as database from '../../../src/config/database';
import * as retention from '../../../src/services/regulatory-retention-service';
import * as storage from '../../../src/services/storage-service';
import * as twilioCompositions from '../../../src/services/twilio-compositions';
import * as twilioRecordings from '../../../src/services/twilio-recordings';
import { InternalError, NotFoundError } from '../../../src/utils/errors';

const mockedDb = database as jest.Mocked<typeof database>;
const mockedRetention = retention as jest.Mocked<typeof retention>;
const mockedStorage = storage as jest.Mocked<typeof storage>;
const mockedTwilio = twilioCompositions as jest.Mocked<typeof twilioCompositions>;
const mockedTwilioRecordings =
  twilioRecordings as jest.Mocked<typeof twilioRecordings>;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TWILIO_SID = 'CJaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TWILIO_URI = `twilio-composition:${TWILIO_SID}`;
const RECORDING_SID = 'RTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const RECORDING_URI = `twilio-recording:${RECORDING_SID}`;

type Row = Record<string, unknown>;

interface Harness {
  sessions: Row[];
  artifacts: Row[];
  doctors: Record<string, { country: string | null; specialty: string | null }>;
  patientDob: string | null;
  historyInserts: Row[];
  indexUpdates: Array<{ id: string; update: Row }>;
  failHistory: boolean;
  failStamp: boolean;
}

function makeHarness(): Harness {
  return {
    sessions: [],
    artifacts: [],
    doctors: {},
    patientDob: null,
    historyInserts: [],
    indexUpdates: [],
    failHistory: false,
    failStamp: false,
  };
}

function buildAdmin(h: Harness) {
  const from = jest.fn((table: string) => {
    if (table === 'consultation_sessions') {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => Promise.resolve({ data: h.sessions, error: null });
      return chain;
    }
    if (table === 'recording_artifact_index') {
      const filters: Record<string, unknown> = {};
      let updatePayload: Row | null = null;
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.in = (col: string, ids: string[]) => {
        filters[col] = ids;
        return chain;
      };
      chain.is = () =>
        Promise.resolve({
          data: h.artifacts.filter((a) => a.hard_deleted_at == null),
          error: null,
        });
      chain.update = (payload: Row) => {
        updatePayload = payload;
        return {
          eq: (_col: string, id: string) => ({
            is: () => {
              if (h.failStamp) {
                return Promise.resolve({
                  data: null,
                  error: { message: 'stamp failed' },
                });
              }
              const row = h.artifacts.find((a) => a.id === id);
              if (row) Object.assign(row, updatePayload);
              h.indexUpdates.push({ id, update: updatePayload! });
              return Promise.resolve({ data: null, error: null });
            },
          }),
        };
      };
      return chain;
    }
    if (table === 'patients') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: { date_of_birth: h.patientDob },
                error: null,
              }),
          }),
        }),
      };
    }
    if (table === 'doctor_settings') {
      return {
        select: () => ({
          eq: (_col: string, doctorId: string) => ({
            maybeSingle: () =>
              Promise.resolve({
                data: h.doctors[doctorId] ?? null,
                error: null,
              }),
          }),
        }),
      };
    }
    if (table === 'archival_history') {
      return {
        insert: (payload: Row) => {
          if (h.failHistory) {
            return Promise.resolve({
              data: null,
              error: { message: 'history failed' },
            });
          }
          h.historyInserts.push(payload);
          return Promise.resolve({ data: null, error: null });
        },
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
  return { from } as unknown as ReturnType<typeof mockedDb.getSupabaseAdminClient>;
}

function policy(overrides?: Partial<ReturnType<typeof basePolicy>>) {
  return { ...basePolicy(), ...(overrides ?? {}) };
}

function basePolicy() {
  return {
    retentionYears: 3,
    retentionUntilAge: null as number | null,
    patientSelfServeDays: 90,
    source: 'test-source',
    policyId: 'policy-general',
    matchedTier: 'exact' as const,
    matchedCountry: 'IN',
    matchedSpecialty: '*',
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedStorage.deleteObject.mockReturnValue(Promise.resolve(true));
  mockedTwilio.deleteComposition.mockImplementation(async () => undefined);
  mockedTwilio.fetchCompositionMetadata.mockImplementation(async () => {
    throw new NotFoundError(`Composition ${TWILIO_SID} not found`);
  });
  mockedTwilioRecordings.deleteRecording.mockImplementation(async () => undefined);
  mockedTwilioRecordings.fetchRecordingMetadata.mockImplementation(async () => ({
    status:          'deleted',
    type:            'audio',
    containerFormat: 'mka',
    codec:           'opus',
    mediaUrlPrefix:  `https://video.twilio.com/v1/Recordings/${RECORDING_SID}/Media`,
  }));
});

describe('raw track erasure (cost-cut step 7)', () => {
  function trackPlan() {
    return {
      enumerated: 1,
      eligibleNow: 1,
      heldBack: 0,
      twilioRevocationPrefixes: [RECORDING_URI],
      held: [],
      latestHeldUntil: null,
      eligible: [
        {
          artifactId: 'a-1',
          sessionId: 's-1',
          artifactKind: 'audio_track',
          storageUri: RECORDING_URI,
          bytes: 12,
          policyId: 'policy-general',
          country: 'IN',
          specialty: '*',
          retentionYears: 3,
          retentionUntilAge: null,
          classified: {
            host: 'twilio_recording' as const,
            recordingSid: RECORDING_SID,
          },
        },
      ],
    };
  }

  it('plans a revocation prefix for a raw track so signed URLs are severed', async () => {
    const h = makeHarness();
    h.sessions.push({
      id: 's-1',
      actual_ended_at: new Date(Date.now() - 4 * 365 * MS_PER_DAY).toISOString(),
      doctor_id: 'd-1',
      patient_id: 'p-1',
    });
    h.artifacts.push({
      id: 'a-1',
      session_id: 's-1',
      artifact_kind: 'audio_track',
      storage_uri: RECORDING_URI,
      bytes: 12,
      hard_deleted_at: null,
    });
    h.doctors['d-1'] = { country: 'IN', specialty: '*' };
    mockedDb.getSupabaseAdminClient.mockReturnValue(buildAdmin(h));
    mockedRetention.resolveRetentionPolicy.mockReturnValue(Promise.resolve(policy()));

    const plan = await buildPatientErasurePlan({
      patientId: 'p-1',
      correlationId: 'c',
    });

    expect(plan.twilioRevocationPrefixes).toEqual([RECORDING_URI]);
  });

  it('deletes at the recording endpoint, never the composition endpoint', async () => {
    const h = makeHarness();
    mockedDb.getSupabaseAdminClient.mockReturnValue(buildAdmin(h));

    const result = await applyPatientErasurePlan({
      plan: trackPlan(),
      correlationId: 'c',
    });

    expect(result.deleted).toBe(1);
    expect(mockedTwilioRecordings.deleteRecording).toHaveBeenCalledWith(RECORDING_SID);
    expect(mockedTwilio.deleteComposition).not.toHaveBeenCalled();
    expect(mockedStorage.deleteObject).not.toHaveBeenCalled();
    expect(h.historyInserts[0]!.deletion_reason).toBe(
      'patient_erasure_country=IN_specialty=*_years=3_provider=twilio_recording_derived_compositions=intact',
    );
    expect(h.indexUpdates).toHaveLength(1);
  });

  it('accepts Twilio 30-day deleted metadata as proof the media is gone', async () => {
    const h = makeHarness();
    mockedDb.getSupabaseAdminClient.mockReturnValue(buildAdmin(h));

    const result = await applyPatientErasurePlan({
      plan: trackPlan(),
      correlationId: 'c',
    });

    expect(result.deleted).toBe(1);
    expect(mockedTwilioRecordings.fetchRecordingMetadata).toHaveBeenCalledWith(
      RECORDING_SID,
    );
  });

  it('refuses to stamp when the track is still live after the delete', async () => {
    const h = makeHarness();
    mockedDb.getSupabaseAdminClient.mockReturnValue(buildAdmin(h));
    mockedTwilioRecordings.fetchRecordingMetadata.mockImplementation(async () => ({
      status:          'completed',
      type:            'audio',
      containerFormat: 'mka',
      codec:           'opus',
      mediaUrlPrefix:  `https://video.twilio.com/v1/Recordings/${RECORDING_SID}/Media`,
    }));

    await expect(
      applyPatientErasurePlan({ plan: trackPlan(), correlationId: 'c' }),
    ).rejects.toBeInstanceOf(InternalError);

    expect(h.historyInserts).toHaveLength(0);
    expect(h.indexUpdates).toHaveLength(0);
  });
});

describe('deriveErasureDmOutcome', () => {
  it('maps the four patient-visible states', () => {
    expect(
      deriveErasureDmOutcome({
        mediaDeleteEnabled: true,
        enumerated: 0,
        deleted: 0,
        heldBack: 0,
        eligibleNow: 0,
      }),
    ).toBe('none');
    expect(
      deriveErasureDmOutcome({
        mediaDeleteEnabled: false,
        enumerated: 2,
        deleted: 0,
        heldBack: 1,
        eligibleNow: 1,
      }),
    ).toBe('severed_only');
    expect(
      deriveErasureDmOutcome({
        mediaDeleteEnabled: true,
        enumerated: 1,
        deleted: 1,
        heldBack: 0,
        eligibleNow: 1,
      }),
    ).toBe('deleted');
    expect(
      deriveErasureDmOutcome({
        mediaDeleteEnabled: true,
        enumerated: 1,
        deleted: 0,
        heldBack: 1,
        eligibleNow: 0,
      }),
    ).toBe('deferred');
    expect(
      deriveErasureDmOutcome({
        mediaDeleteEnabled: true,
        enumerated: 2,
        deleted: 1,
        heldBack: 1,
        eligibleNow: 1,
      }),
    ).toBe('mixed');
  });
});

describe('buildPatientErasurePlan', () => {
  it('marks a past-cutoff Twilio artifact eligible and emits a SID prefix', async () => {
    const h = makeHarness();
    h.sessions.push({
      id: 's-1',
      actual_ended_at: new Date(Date.now() - 4 * 365 * MS_PER_DAY).toISOString(),
      doctor_id: 'd-1',
      patient_id: 'p-1',
    });
    h.artifacts.push({
      id: 'a-1',
      session_id: 's-1',
      artifact_kind: 'audio_composition',
      storage_uri: TWILIO_URI,
      bytes: 100,
      hard_deleted_at: null,
    });
    h.doctors['d-1'] = { country: 'IN', specialty: '*' };
    mockedDb.getSupabaseAdminClient.mockReturnValue(buildAdmin(h));
    mockedRetention.resolveRetentionPolicy.mockReturnValue(Promise.resolve(policy()));

    const plan = await buildPatientErasurePlan({
      patientId: 'p-1',
      correlationId: 'c',
    });
    expect(plan.enumerated).toBe(1);
    expect(plan.eligibleNow).toBe(1);
    expect(plan.heldBack).toBe(0);
    expect(plan.twilioRevocationPrefixes).toEqual([TWILIO_URI]);
  });

  it('holds an in-window artifact under the policy that matched that consult', async () => {
    const h = makeHarness();
    h.sessions.push({
      id: 's-1',
      actual_ended_at: new Date(Date.now() - 1 * 365 * MS_PER_DAY).toISOString(),
      doctor_id: 'd-1',
      patient_id: 'p-1',
    });
    h.artifacts.push({
      id: 'a-1',
      session_id: 's-1',
      artifact_kind: 'audio_composition',
      storage_uri: TWILIO_URI,
      bytes: 100,
      hard_deleted_at: null,
    });
    h.doctors['d-1'] = { country: 'IN', specialty: '*' };
    mockedDb.getSupabaseAdminClient.mockReturnValue(buildAdmin(h));
    mockedRetention.resolveRetentionPolicy.mockReturnValue(Promise.resolve(policy()));

    const plan = await buildPatientErasurePlan({
      patientId: 'p-1',
      correlationId: 'c',
    });
    expect(plan.eligibleNow).toBe(0);
    expect(plan.heldBack).toBe(1);
    expect(plan.held[0]!.reason).toBe('retention_carve_out');
    expect(plan.held[0]!.policyId).toBe('policy-general');
    expect(plan.held[0]!.cutoffAt).toBeTruthy();
  });

  it('resolves mixed policies per artifact, not per patient', async () => {
    const h = makeHarness();
    h.sessions.push(
      {
        id: 's-old',
        actual_ended_at: new Date(Date.now() - 4 * 365 * MS_PER_DAY).toISOString(),
        doctor_id: 'd-gen',
        patient_id: 'p-1',
      },
      {
        id: 's-ped',
        actual_ended_at: new Date(Date.now() - 4 * 365 * MS_PER_DAY).toISOString(),
        doctor_id: 'd-ped',
        patient_id: 'p-1',
      },
    );
    h.artifacts.push(
      {
        id: 'a-old',
        session_id: 's-old',
        artifact_kind: 'audio_composition',
        storage_uri: 'recordings/patient_p-1/sess_s-old/audio.mp4',
        bytes: 10,
        hard_deleted_at: null,
      },
      {
        id: 'a-ped',
        session_id: 's-ped',
        artifact_kind: 'audio_composition',
        storage_uri: TWILIO_URI,
        bytes: 20,
        hard_deleted_at: null,
      },
    );
    h.doctors['d-gen'] = { country: 'IN', specialty: '*' };
    h.doctors['d-ped'] = { country: 'IN', specialty: 'pediatrics' };
    h.patientDob = new Date(Date.now() - 10 * 365 * MS_PER_DAY).toISOString();
    mockedDb.getSupabaseAdminClient.mockReturnValue(buildAdmin(h));
    mockedRetention.resolveRetentionPolicy.mockImplementation(async (input) => {
      if (input.specialty === 'pediatrics') {
        return policy({
          policyId: 'policy-ped',
          matchedSpecialty: 'pediatrics',
          retentionUntilAge: 21,
        });
      }
      return policy();
    });

    const plan = await buildPatientErasurePlan({
      patientId: 'p-1',
      correlationId: 'c',
    });
    expect(plan.eligibleNow).toBe(1);
    expect(plan.heldBack).toBe(1);
    expect(plan.eligible[0]!.artifactId).toBe('a-old');
    expect(plan.held[0]!.artifactId).toBe('a-ped');
    expect(plan.held[0]!.policyId).toBe('policy-ped');
  });

  it('unknown pediatric DOB uses retention-years only (same as archival worker)', async () => {
    const h = makeHarness();
    h.sessions.push({
      id: 's-1',
      actual_ended_at: new Date(Date.now() - 5 * 365 * MS_PER_DAY).toISOString(),
      doctor_id: 'd-ped',
      patient_id: 'p-1',
    });
    h.artifacts.push({
      id: 'a-1',
      session_id: 's-1',
      artifact_kind: 'audio_composition',
      storage_uri: TWILIO_URI,
      bytes: 1,
      hard_deleted_at: null,
    });
    h.doctors['d-ped'] = { country: 'IN', specialty: 'pediatrics' };
    h.patientDob = null;
    mockedDb.getSupabaseAdminClient.mockReturnValue(buildAdmin(h));
    mockedRetention.resolveRetentionPolicy.mockReturnValue(
      Promise.resolve(
        policy({
          policyId: 'policy-ped',
          matchedSpecialty: 'pediatrics',
          retentionUntilAge: 21,
        }),
      ),
    );

    const plan = await buildPatientErasurePlan({
      patientId: 'p-1',
      correlationId: 'c',
    });
    expect(plan.eligibleNow).toBe(1);
    expect(plan.heldBack).toBe(0);
  });

  it('throws on an unclassifiable storage_uri', async () => {
    const h = makeHarness();
    h.sessions.push({
      id: 's-1',
      actual_ended_at: new Date(Date.now() - 4 * 365 * MS_PER_DAY).toISOString(),
      doctor_id: 'd-1',
      patient_id: 'p-1',
    });
    h.artifacts.push({
      id: 'a-1',
      session_id: 's-1',
      artifact_kind: 'audio_composition',
      storage_uri: 'garbage',
      bytes: 1,
      hard_deleted_at: null,
    });
    h.doctors['d-1'] = { country: 'IN', specialty: '*' };
    mockedDb.getSupabaseAdminClient.mockReturnValue(buildAdmin(h));
    mockedRetention.resolveRetentionPolicy.mockReturnValue(Promise.resolve(policy()));

    await expect(
      buildPatientErasurePlan({ patientId: 'p-1', correlationId: 'c' }),
    ).rejects.toBeInstanceOf(InternalError);
  });
});

describe('applyPatientErasurePlan', () => {
  it('deletes at Twilio, writes patient_erasure history, stamps hard_deleted_at', async () => {
    const h = makeHarness();
    mockedDb.getSupabaseAdminClient.mockReturnValue(buildAdmin(h));

    const plan = {
      enumerated: 1,
      eligibleNow: 1,
      heldBack: 0,
      twilioRevocationPrefixes: [TWILIO_URI],
      held: [],
      latestHeldUntil: null,
      eligible: [
        {
          artifactId: 'a-1',
          sessionId: 's-1',
          artifactKind: 'audio_composition',
          storageUri: TWILIO_URI,
          bytes: 12,
          policyId: 'policy-general',
          country: 'IN',
          specialty: '*',
          retentionYears: 3,
          retentionUntilAge: null,
          classified: {
            host: 'twilio_composition' as const,
            compositionSid: TWILIO_SID,
          },
        },
      ],
    };

    const result = await applyPatientErasurePlan({ plan, correlationId: 'c' });
    expect(result.deleted).toBe(1);
    expect(mockedTwilio.deleteComposition).toHaveBeenCalledWith(TWILIO_SID);
    expect(mockedTwilio.fetchCompositionMetadata).toHaveBeenCalledWith(TWILIO_SID);
    expect(mockedStorage.deleteObject).not.toHaveBeenCalled();
    expect(h.historyInserts).toHaveLength(1);
    expect(h.historyInserts[0]!.deletion_reason).toBe(
      'patient_erasure_country=IN_specialty=*_years=3_provider=twilio_composition_source_recordings=intact',
    );
    expect(h.indexUpdates).toHaveLength(1);
  });

  it('does not write history or stamp when the provider delete fails', async () => {
    const h = makeHarness();
    mockedDb.getSupabaseAdminClient.mockReturnValue(buildAdmin(h));
    mockedTwilio.deleteComposition.mockImplementation(async () => {
      throw new InternalError('twilio down');
    });

    const plan = {
      enumerated: 1,
      eligibleNow: 1,
      heldBack: 0,
      twilioRevocationPrefixes: [TWILIO_URI],
      held: [],
      latestHeldUntil: null,
      eligible: [
        {
          artifactId: 'a-1',
          sessionId: 's-1',
          artifactKind: 'audio_composition',
          storageUri: TWILIO_URI,
          bytes: 12,
          policyId: 'policy-general',
          country: 'IN',
          specialty: '*',
          retentionYears: 3,
          retentionUntilAge: null,
          classified: {
            host: 'twilio_composition' as const,
            compositionSid: TWILIO_SID,
          },
        },
      ],
    };

    await expect(
      applyPatientErasurePlan({ plan, correlationId: 'c' }),
    ).rejects.toBeInstanceOf(InternalError);
    expect(h.historyInserts).toHaveLength(0);
    expect(h.indexUpdates).toHaveLength(0);
  });
});

describe('planAndMaybeErasePatientRecordings', () => {
  it('does not call the provider when mediaDeleteEnabled is false', async () => {
    const h = makeHarness();
    h.sessions.push({
      id: 's-1',
      actual_ended_at: new Date(Date.now() - 4 * 365 * MS_PER_DAY).toISOString(),
      doctor_id: 'd-1',
      patient_id: 'p-1',
    });
    h.artifacts.push({
      id: 'a-1',
      session_id: 's-1',
      artifact_kind: 'audio_composition',
      storage_uri: TWILIO_URI,
      bytes: 100,
      hard_deleted_at: null,
    });
    h.doctors['d-1'] = { country: 'IN', specialty: '*' };
    mockedDb.getSupabaseAdminClient.mockReturnValue(buildAdmin(h));
    mockedRetention.resolveRetentionPolicy.mockReturnValue(Promise.resolve(policy()));

    const result = await planAndMaybeErasePatientRecordings({
      patientId: 'p-1',
      correlationId: 'c',
      mediaDeleteEnabled: false,
    });
    expect(result.deleted).toBe(0);
    expect(result.outcome).toBe('severed_only');
    expect(mockedTwilio.deleteComposition).not.toHaveBeenCalled();
  });
});
