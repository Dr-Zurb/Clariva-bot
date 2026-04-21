/**
 * Unit tests for `workers/recording-archival-worker.ts` (Plan 02 · Task 34).
 *
 * Covers:
 *   - Hide phase identifies artifacts past patient-self-serve TTL.
 *   - Hide phase in dry-run mode does not mutate.
 *   - Hide phase is idempotent: a second real-run finds no candidates.
 *   - Hard-delete phase respects the per-policy retention_years.
 *   - Hard-delete phase respects retention_until_age for pediatrics when
 *     the patient DOB is known.
 *   - Hard-delete phase writes archival_history + stamps hard_deleted_at.
 *   - Hard-delete phase in dry-run mode does not call storage, does not
 *     insert archival_history, does not mutate the index.
 *   - Scan helpers (scanHideCandidates / scanDeleteCandidates) surface
 *     the same metadata the admin-preview API exposes.
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks — declared before the SUT import.
// ---------------------------------------------------------------------------

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

jest.mock('../../../src/services/storage-service', () => ({
  deleteObject: jest.fn().mockReturnValue(Promise.resolve(true)),
}));

import {
  runHardDeletePhase,
  runHidePhase,
  scanDeleteCandidates,
  scanHideCandidates,
} from '../../../src/workers/recording-archival-worker';
import * as database from '../../../src/config/database';
import * as retention from '../../../src/services/regulatory-retention-service';
import * as storage from '../../../src/services/storage-service';

const mockedDb = database as jest.Mocked<typeof database>;
const mockedRetention = retention as jest.Mocked<typeof retention>;
const mockedStorage = storage as jest.Mocked<typeof storage>;

beforeEach(() => {
  jest.clearAllMocks();
  mockedStorage.deleteObject.mockReturnValue(Promise.resolve(true));
});

// ---------------------------------------------------------------------------
// Fixtures + mock harness
// ---------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type Row = Record<string, unknown>;

interface HarnessState {
  /** Rows returned by the artifact scan. */
  artifacts: Row[];
  /** doctor_id → { country, specialty } */
  doctors: Record<string, { country: string | null; specialty: string | null }>;
  /** patient_id → { date_of_birth } */
  patients: Record<string, { date_of_birth: string | null }>;
  /** Rows in signed_url_revocation. */
  revocations: Row[];
  /** Mutation log — tests assert against this. */
  calls: {
    archivalHistoryInserts: Row[];
    indexUpdates: Array<{ id: string; update: Row }>;
    revocationDeletes: string[];
  };
}

function makeState(): HarnessState {
  return {
    artifacts: [],
    doctors: {},
    patients: {},
    revocations: [],
    calls: {
      archivalHistoryInserts: [],
      indexUpdates: [],
      revocationDeletes: [],
    },
  };
}

function buildAdminClient(
  state: HarnessState,
): ReturnType<typeof mockedDb.getSupabaseAdminClient> {
  // Each `.from(table)` returns an object exposing the select / update /
  // insert / delete shape the SUT chains against. Chain calls return
  // self-proxies until a terminal (maybeSingle / thenable / .select with
  // head:true).
  const from = jest.fn((table: string) => {
    if (table === 'recording_artifact_index') {
      // The SUT uses two paths:
      //   1. SELECT ... .is('hard_deleted_at', null) — live-scan (returns array)
      //   2. SELECT ... .eq('id', x).is('hard_deleted_at', null).maybeSingle()
      //      — re-verify inside the delete loop.
      //   3. UPDATE ... .eq('id', x).eq('patient_self_serve_visible', true) — hide
      //   4. UPDATE ... .eq('id', x).is('hard_deleted_at', null) — stamp hard_deleted
      //   5. SELECT id with head:true, count:'exact' — revocation cleanup count
      return indexTable(state);
    }
    if (table === 'doctor_settings') return doctorSettingsTable(state);
    if (table === 'patients') return patientsTable(state);
    if (table === 'archival_history') return archivalHistoryTable(state);
    if (table === 'signed_url_revocation') return revocationTable(state);
    throw new Error(`unexpected table ${table}`);
  });
  return { from } as unknown as ReturnType<
    typeof mockedDb.getSupabaseAdminClient
  >;
}

function indexTable(state: HarnessState) {
  // Fluent chain. Collect applied filters until a terminal is called.
  const filters: Record<string, unknown> = {};
  const updatePayload: { value: Row | null } = { value: null };

  const chain = {
    select: jest.fn((_cols: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.head) {
        // Count path (revocation cleanup). Matches on .like('storage_uri', prefix%).
        return countChain(state, filters);
      }
      return chain;
    }),
    eq: jest.fn((col: string, val: unknown) => {
      filters[col] = val;
      return chain;
    }),
    is: jest.fn((col: string, val: unknown) => {
      filters[`${col}__is`] = val;
      return chain;
    }),
    maybeSingle: jest.fn(() => {
      const id = filters.id as string | undefined;
      if (!id) return Promise.resolve({ data: null, error: null });
      const row = state.artifacts.find((a) => a.id === id);
      if (!row) return Promise.resolve({ data: null, error: null });
      if (row.hard_deleted_at != null) {
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: row, error: null });
    }),
    update: jest.fn((payload: Row) => {
      updatePayload.value = payload;
      return {
        eq: jest.fn((col: string, val: unknown) => {
          filters[col] = val;
          return {
            eq: jest.fn((col2: string, val2: unknown) => {
              filters[col2] = val2;
              return {
                select: jest.fn(() => {
                  const id = filters.id as string;
                  if (filters.patient_self_serve_visible !== true) {
                    return Promise.resolve({ data: [], error: null });
                  }
                  const row = state.artifacts.find((a) => a.id === id);
                  if (!row || row.patient_self_serve_visible !== true) {
                    return Promise.resolve({ data: [], error: null });
                  }
                  Object.assign(row, updatePayload.value);
                  state.calls.indexUpdates.push({
                    id,
                    update: updatePayload.value!,
                  });
                  return Promise.resolve({ data: [{ id }], error: null });
                }),
              };
            }),
            is: jest.fn((col2: string, val2: unknown) => {
              filters[`${col2}__is`] = val2;
              const id = filters.id as string;
              const row = state.artifacts.find((a) => a.id === id);
              if (!row || row.hard_deleted_at != null) {
                return Promise.resolve({ data: null, error: null });
              }
              Object.assign(row, updatePayload.value);
              state.calls.indexUpdates.push({
                id,
                update: updatePayload.value!,
              });
              return Promise.resolve({ data: null, error: null });
            }),
          };
        }),
      };
    }),
    then: (resolve: (v: unknown) => void) => {
      // Terminal: the artifact-scan SELECT resolves here.
      const rows = state.artifacts
        .filter((a) => a.hard_deleted_at == null)
        .map((a) => ({
          ...a,
          consultation_sessions: (a as Row)['consultation_sessions'],
        }));
      resolve({ data: rows, error: null });
      return undefined;
    },
  };
  return chain;
}

function countChain(state: HarnessState, filters: Record<string, unknown>) {
  return {
    is: jest.fn((col: string, val: unknown) => {
      filters[`${col}__is`] = val;
      return {
        like: jest.fn((_col: string, pattern: string) => {
          const prefix = pattern.replace(/%$/, '');
          const count = state.artifacts.filter(
            (a) =>
              a.hard_deleted_at == null &&
              typeof a.storage_uri === 'string' &&
              (a.storage_uri as string).startsWith(prefix),
          ).length;
          return Promise.resolve({ count, error: null });
        }),
      };
    }),
  };
}

function doctorSettingsTable(state: HarnessState) {
  const filters: Record<string, unknown> = {};
  const chain = {
    select: jest.fn(() => chain),
    eq: jest.fn((col: string, val: unknown) => {
      filters[col] = val;
      return chain;
    }),
    maybeSingle: jest.fn(() => {
      const doctorId = filters.doctor_id as string;
      const row = state.doctors[doctorId];
      if (!row) return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ data: row, error: null });
    }),
  };
  return chain;
}

function patientsTable(state: HarnessState) {
  const filters: Record<string, unknown> = {};
  const chain = {
    select: jest.fn(() => chain),
    eq: jest.fn((col: string, val: unknown) => {
      filters[col] = val;
      return chain;
    }),
    maybeSingle: jest.fn(() => {
      const id = filters.id as string;
      const row = state.patients[id];
      if (!row) return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ data: row, error: null });
    }),
  };
  return chain;
}

function archivalHistoryTable(state: HarnessState) {
  return {
    insert: jest.fn((payload: Row) => {
      state.calls.archivalHistoryInserts.push(payload);
      return Promise.resolve({ data: null, error: null });
    }),
  };
}

function revocationTable(state: HarnessState) {
  const filters: Record<string, unknown> = {};
  const chain = {
    select: jest.fn(() => Promise.resolve({ data: state.revocations, error: null })),
    delete: jest.fn(() => ({
      eq: jest.fn((col: string, val: unknown) => {
        filters[col] = val;
        state.revocations = state.revocations.filter(
          (r) => (r.url_prefix as string) !== (val as string),
        );
        state.calls.revocationDeletes.push(val as string);
        return Promise.resolve({ data: null, error: null });
      }),
    })),
  };
  return chain;
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeArtifact(overrides: {
  id: string;
  sessionId: string;
  doctorId: string;
  patientId?: string | null;
  endedAt: Date | null;
  storageUri?: string;
  visible?: boolean;
  hardDeleted?: boolean;
  bytes?: number | null;
  kind?: string;
}): Row {
  return {
    id: overrides.id,
    session_id: overrides.sessionId,
    artifact_kind: overrides.kind ?? 'audio_composition',
    storage_uri:
      overrides.storageUri ?? `recordings/patient_${overrides.patientId ?? 'x'}/sess_${overrides.sessionId}/audio.mp4`,
    bytes: overrides.bytes ?? 1024,
    patient_self_serve_visible: overrides.visible ?? true,
    hard_deleted_at: overrides.hardDeleted ? new Date().toISOString() : null,
    consultation_sessions: {
      id: overrides.sessionId,
      actual_ended_at: overrides.endedAt ? overrides.endedAt.toISOString() : null,
      doctor_id: overrides.doctorId,
      patient_id: overrides.patientId ?? null,
    },
  };
}

function mockPolicy(overrides?: Partial<ReturnType<typeof makePolicyValue>>) {
  mockedRetention.resolveRetentionPolicy.mockReset();
  mockedRetention.resolveRetentionPolicy.mockReturnValue(
    Promise.resolve(makePolicyValue(overrides)),
  );
}

function makePolicyValue(
  overrides?: Partial<ReturnType<typeof basePolicy>>,
): ReturnType<typeof basePolicy> {
  return { ...basePolicy(), ...(overrides ?? {}) };
}

function basePolicy() {
  return {
    retentionYears: 3,
    retentionUntilAge: null as number | null,
    patientSelfServeDays: 90,
    source: 'test-source',
    policyId: 'policy-1',
    matchedTier: 'exact' as 'exact' | 'country' | 'global',
    matchedCountry: 'IN',
    matchedSpecialty: '*',
  };
}

// ---------------------------------------------------------------------------
// Hide phase
// ---------------------------------------------------------------------------

describe('runHidePhase', () => {
  it('identifies artifacts past patientSelfServeDays and hides them', async () => {
    const state = makeState();
    // Artifact ended 120 days ago — past the 90-day TTL.
    const endedAt = new Date(Date.now() - 120 * MS_PER_DAY);
    state.artifacts.push(
      makeArtifact({
        id: 'a-1',
        sessionId: 's-1',
        doctorId: 'd-1',
        patientId: 'pat-1',
        endedAt,
      }),
    );
    state.doctors['d-1'] = { country: 'IN', specialty: '*' };
    mockedDb.getSupabaseAdminClient.mockReturnValue(buildAdminClient(state));
    mockPolicy();

    const result = await runHidePhase({ dryRun: false, correlationId: 'c' });
    expect(result.candidates).toBe(1);
    expect(result.hidden).toBe(1);
    expect(state.calls.indexUpdates).toHaveLength(1);
    expect(state.calls.indexUpdates[0]!.update.patient_self_serve_visible).toBe(
      false,
    );
    expect(state.calls.indexUpdates[0]!.update.patient_self_serve_hidden_at).toBeDefined();
  });

  it('does not identify artifacts still within the self-serve window', async () => {
    const state = makeState();
    const endedAt = new Date(Date.now() - 30 * MS_PER_DAY); // only 30 days ago
    state.artifacts.push(
      makeArtifact({
        id: 'a-1',
        sessionId: 's-1',
        doctorId: 'd-1',
        patientId: 'pat-1',
        endedAt,
      }),
    );
    state.doctors['d-1'] = { country: 'IN', specialty: '*' };
    mockedDb.getSupabaseAdminClient.mockReturnValue(buildAdminClient(state));
    mockPolicy();

    const result = await runHidePhase({ dryRun: false, correlationId: 'c' });
    expect(result.candidates).toBe(0);
    expect(result.hidden).toBe(0);
    expect(state.calls.indexUpdates).toHaveLength(0);
  });

  it('dry-run identifies candidates but does not mutate', async () => {
    const state = makeState();
    const endedAt = new Date(Date.now() - 120 * MS_PER_DAY);
    state.artifacts.push(
      makeArtifact({
        id: 'a-1',
        sessionId: 's-1',
        doctorId: 'd-1',
        patientId: 'pat-1',
        endedAt,
      }),
    );
    state.doctors['d-1'] = { country: 'IN', specialty: '*' };
    mockedDb.getSupabaseAdminClient.mockReturnValue(buildAdminClient(state));
    mockPolicy();

    const result = await runHidePhase({ dryRun: true, correlationId: 'c' });
    expect(result.candidates).toBe(1);
    expect(result.hidden).toBe(0);
    expect(state.calls.indexUpdates).toHaveLength(0);
  });

  it('is idempotent: a second run after the first finds no new candidates', async () => {
    const state = makeState();
    const endedAt = new Date(Date.now() - 120 * MS_PER_DAY);
    state.artifacts.push(
      makeArtifact({
        id: 'a-1',
        sessionId: 's-1',
        doctorId: 'd-1',
        patientId: 'pat-1',
        endedAt,
      }),
    );
    state.doctors['d-1'] = { country: 'IN', specialty: '*' };
    mockedDb.getSupabaseAdminClient.mockReturnValue(buildAdminClient(state));
    mockPolicy();

    const first = await runHidePhase({ dryRun: false, correlationId: 'c' });
    expect(first.hidden).toBe(1);
    // Between runs, the first mutation flipped visible = false.
    const second = await runHidePhase({ dryRun: false, correlationId: 'c' });
    expect(second.candidates).toBe(0);
    expect(second.hidden).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// scanHideCandidates / scanDeleteCandidates — admin preview surface
// ---------------------------------------------------------------------------

describe('scan helpers', () => {
  it('scanHideCandidates surfaces policy metadata for admin preview', async () => {
    const state = makeState();
    const endedAt = new Date(Date.now() - 120 * MS_PER_DAY);
    state.artifacts.push(
      makeArtifact({
        id: 'a-1',
        sessionId: 's-1',
        doctorId: 'd-1',
        patientId: 'pat-1',
        endedAt,
      }),
    );
    state.doctors['d-1'] = { country: 'IN', specialty: '*' };
    mockedDb.getSupabaseAdminClient.mockReturnValue(buildAdminClient(state));
    mockPolicy();

    const candidates = await scanHideCandidates();
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.sessionId).toBe('s-1');
    expect(candidates[0]!.artifactKind).toBe('audio_composition');
    expect(candidates[0]!.ageDays).toBeGreaterThanOrEqual(119);
    expect(candidates[0]!.policy.patientSelfServeDays).toBe(90);
    expect(candidates[0]!.policy.matchedTier).toBe('exact');
  });

  it('scanDeleteCandidates includes retentionCutoffAt + policy source', async () => {
    const state = makeState();
    const endedAt = new Date(Date.now() - 4 * 365 * MS_PER_DAY); // 4 years ago
    state.artifacts.push(
      makeArtifact({
        id: 'a-1',
        sessionId: 's-1',
        doctorId: 'd-1',
        patientId: 'pat-1',
        endedAt,
      }),
    );
    state.doctors['d-1'] = { country: 'IN', specialty: '*' };
    mockedDb.getSupabaseAdminClient.mockReturnValue(buildAdminClient(state));
    mockPolicy({ retentionYears: 3 });

    const candidates = await scanDeleteCandidates();
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.policy.retentionYears).toBe(3);
    expect(candidates[0]!.policy.source).toBe('test-source');
    expect(candidates[0]!.retentionCutoffAt).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Hard-delete phase
// ---------------------------------------------------------------------------

describe('runHardDeletePhase', () => {
  it('deletes storage object, writes archival_history, and stamps hard_deleted_at', async () => {
    const state = makeState();
    const endedAt = new Date(Date.now() - 4 * 365 * MS_PER_DAY);
    state.artifacts.push(
      makeArtifact({
        id: 'a-1',
        sessionId: 's-1',
        doctorId: 'd-1',
        patientId: 'pat-1',
        endedAt,
        bytes: 2048,
      }),
    );
    state.doctors['d-1'] = { country: 'IN', specialty: '*' };
    mockedDb.getSupabaseAdminClient.mockReturnValue(buildAdminClient(state));
    mockPolicy({ retentionYears: 3 });

    const result = await runHardDeletePhase({
      dryRun: false,
      correlationId: 'c',
    });
    expect(result.candidates).toBe(1);
    expect(result.deleted).toBe(1);
    expect(result.bytesFreed).toBe(2048);
    expect(mockedStorage.deleteObject).toHaveBeenCalledTimes(1);
    expect(state.calls.archivalHistoryInserts).toHaveLength(1);

    const history = state.calls.archivalHistoryInserts[0]!;
    expect(history.session_id).toBe('s-1');
    expect(history.artifact_kind).toBe('audio_composition');
    expect(typeof history.deletion_reason).toBe('string');
    expect(history.policy_id).toBe('policy-1');

    // Hard_deleted_at was stamped on the index row.
    expect(state.artifacts[0]!.hard_deleted_at).not.toBeNull();
  });

  it('respects retention_years — artifact within the window is not deleted', async () => {
    const state = makeState();
    const endedAt = new Date(Date.now() - 1 * 365 * MS_PER_DAY); // 1 year ago
    state.artifacts.push(
      makeArtifact({
        id: 'a-1',
        sessionId: 's-1',
        doctorId: 'd-1',
        patientId: 'pat-1',
        endedAt,
      }),
    );
    state.doctors['d-1'] = { country: 'IN', specialty: '*' };
    mockedDb.getSupabaseAdminClient.mockReturnValue(buildAdminClient(state));
    mockPolicy({ retentionYears: 3 });

    const result = await runHardDeletePhase({
      dryRun: false,
      correlationId: 'c',
    });
    expect(result.candidates).toBe(0);
    expect(result.deleted).toBe(0);
    expect(mockedStorage.deleteObject).not.toHaveBeenCalled();
    expect(state.calls.archivalHistoryInserts).toHaveLength(0);
  });

  it('dry-run does NOT call storage or insert archival_history', async () => {
    const state = makeState();
    const endedAt = new Date(Date.now() - 4 * 365 * MS_PER_DAY);
    state.artifacts.push(
      makeArtifact({
        id: 'a-1',
        sessionId: 's-1',
        doctorId: 'd-1',
        patientId: 'pat-1',
        endedAt,
      }),
    );
    state.doctors['d-1'] = { country: 'IN', specialty: '*' };
    mockedDb.getSupabaseAdminClient.mockReturnValue(buildAdminClient(state));
    mockPolicy({ retentionYears: 3 });

    const result = await runHardDeletePhase({
      dryRun: true,
      correlationId: 'c',
    });
    expect(result.candidates).toBe(1);
    expect(result.deleted).toBe(0);
    expect(mockedStorage.deleteObject).not.toHaveBeenCalled();
    expect(state.calls.archivalHistoryInserts).toHaveLength(0);
    expect(state.artifacts[0]!.hard_deleted_at).toBeNull();
  });

  it('respects retention_until_age for pediatrics — an artifact whose patient is still under-age is NOT deleted', async () => {
    const state = makeState();
    // Session ended 5 years ago (past retention_years = 3) but patient is
    // currently only 15 — retention_until_age = 21 means the artifact
    // must stay. pediatric branch wins.
    const endedAt = new Date(Date.now() - 5 * 365 * MS_PER_DAY);
    const dob = new Date(Date.now() - 15 * 365 * MS_PER_DAY); // age 15
    state.artifacts.push(
      makeArtifact({
        id: 'a-1',
        sessionId: 's-1',
        doctorId: 'd-1',
        patientId: 'pat-1',
        endedAt,
      }),
    );
    state.doctors['d-1'] = { country: 'IN', specialty: 'pediatrics' };
    state.patients['pat-1'] = { date_of_birth: dob.toISOString() };
    mockedDb.getSupabaseAdminClient.mockReturnValue(buildAdminClient(state));
    mockPolicy({
      retentionYears: 3,
      retentionUntilAge: 21,
      matchedSpecialty: 'pediatrics',
    });

    const result = await runHardDeletePhase({
      dryRun: false,
      correlationId: 'c',
    });
    expect(result.candidates).toBe(0);
    expect(result.deleted).toBe(0);
    expect(mockedStorage.deleteObject).not.toHaveBeenCalled();
  });

  it('retention_until_age — when patient has reached the age, the artifact IS deleted', async () => {
    const state = makeState();
    const endedAt = new Date(Date.now() - 5 * 365 * MS_PER_DAY);
    const dob = new Date(Date.now() - 25 * 365 * MS_PER_DAY); // age 25
    state.artifacts.push(
      makeArtifact({
        id: 'a-1',
        sessionId: 's-1',
        doctorId: 'd-1',
        patientId: 'pat-1',
        endedAt,
      }),
    );
    state.doctors['d-1'] = { country: 'IN', specialty: 'pediatrics' };
    state.patients['pat-1'] = { date_of_birth: dob.toISOString() };
    mockedDb.getSupabaseAdminClient.mockReturnValue(buildAdminClient(state));
    mockPolicy({
      retentionYears: 3,
      retentionUntilAge: 21,
      matchedSpecialty: 'pediatrics',
    });

    const result = await runHardDeletePhase({
      dryRun: false,
      correlationId: 'c',
    });
    expect(result.candidates).toBe(1);
    expect(result.deleted).toBe(1);
  });

  it('retention_until_age with unknown DOB falls back to retention_years — 5y past 3y retention IS deleted', async () => {
    const state = makeState();
    const endedAt = new Date(Date.now() - 5 * 365 * MS_PER_DAY);
    state.artifacts.push(
      makeArtifact({
        id: 'a-1',
        sessionId: 's-1',
        doctorId: 'd-1',
        patientId: 'pat-1',
        endedAt,
      }),
    );
    state.doctors['d-1'] = { country: 'IN', specialty: 'pediatrics' };
    state.patients['pat-1'] = { date_of_birth: null }; // DOB unknown
    mockedDb.getSupabaseAdminClient.mockReturnValue(buildAdminClient(state));
    mockPolicy({
      retentionYears: 3,
      retentionUntilAge: 21,
      matchedSpecialty: 'pediatrics',
    });

    const result = await runHardDeletePhase({
      dryRun: false,
      correlationId: 'c',
    });
    expect(result.candidates).toBe(1);
    expect(result.deleted).toBe(1);
  });
});
