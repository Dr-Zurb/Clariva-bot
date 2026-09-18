/**
 * rec-20 orphan reconciliation worker.
 *
 * Pins observe-and-record: Twilio is read, never written. Outcomes
 * are completed / failed / indeterminate. A sibling or a lost claim
 * writes nothing new.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

const mockGetIncluded = jest.fn<(roomSid: string) => Promise<string[]>>();
const mockSetAudioOnly = jest.fn();
const mockSetBoth = jest.fn();
const mockExclude = jest.fn();
const mockInclude = jest.fn();

jest.mock('../../../src/services/twilio-recording-rules', () => {
  class TwilioRoomNotFoundError extends Error {
    roomSid: string;
    constructor(roomSid: string) {
      super(`Twilio room ${roomSid} not found`);
      this.name = 'TwilioRoomNotFoundError';
      this.roomSid = roomSid;
    }
  }
  return {
    getIncludedRecordingKinds: (roomSid: string) => mockGetIncluded(roomSid),
    setRecordingRulesToAudioOnly: (...a: unknown[]) => mockSetAudioOnly(...a),
    setRecordingRulesToAudioAndVideo: (...a: unknown[]) => mockSetBoth(...a),
    excludeAllParticipantsFromRecording: (...a: unknown[]) => mockExclude(...a),
    includeAllParticipantsInRecording: (...a: unknown[]) => mockInclude(...a),
    TwilioRoomNotFoundError,
  };
});

import * as database from '../../../src/config/database';
import {
  decideReconcileOutcome,
  runRecordingOrphanReconcileJob,
} from '../../../src/workers/recording-orphan-reconciliation-worker';
import { RECORDING_AUDIT_ORPHAN_SLA_MS } from '../../../src/types/consultation-recording-audit';
import { TwilioRoomNotFoundError } from '../../../src/services/twilio-recording-rules';

const mockedDb = database as jest.Mocked<typeof database>;

const NOW = Date.parse('2026-08-19T09:10:00.000Z');
const STALE_AT = '2026-08-19T09:00:00.000Z';

interface DbRow {
  id: string;
  session_id: string;
  action: string;
  reason: string | null;
  pause_reason_code: string | null;
  metadata: Record<string, unknown>;
  correlation_id: string | null;
  created_at: string;
}

function attemptedPause(overrides: Partial<DbRow> = {}): DbRow {
  return {
    id: 'orph-1',
    session_id: 'sess-1',
    action: 'recording_paused',
    reason: 'administrative',
    pause_reason_code: 'administrative',
    metadata: {
      status: 'attempted',
      twilio_sid: 'RM1',
      kind: 'audio',
      paused_kinds: ['audio'],
    },
    correlation_id: 'corr-1',
    created_at: STALE_AT,
    ...overrides,
  };
}

function buildAdminMock(opts: {
  scanRows?: DbRow[];
  siblingRows?: Array<{ id: string; correlation_id: string | null; metadata: { status?: string } }>;
  claimSequence?: boolean[];
} = {}): {
  client: { from: (table: string) => unknown };
  inserts: Array<Record<string, unknown>>;
  lteValues: string[];
} {
  const inserts: Array<Record<string, unknown>> = [];
  const lteValues: string[] = [];
  let claimIdx = 0;

  const from = () => {
    let mode: 'scan' | 'siblings' | 'sibling-one' = 'scan';
    let claimIsNull = false;
    let isRelease = false;

    const chain: {
      select: () => unknown;
      filter: (col: string, op: string, val?: unknown) => unknown;
      lte: (col: string, val: string) => unknown;
      order: () => unknown;
      limit: () => unknown;
      in: () => unknown;
      eq: (col: string) => unknown;
      neq: () => unknown;
      update: () => unknown;
      insert: (row: Record<string, unknown>) => Promise<{ error: null }>;
      maybeSingle: () => Promise<{ data: { id: string } | null; error: null }>;
      then: (resolve: (v: { data: unknown; error: null }) => void) => void;
    } = {
      select: () => chain,
      filter: (col: string, op: string) => {
        if (col === 'metadata->>reconciliation_claimed_at' && op === 'is') claimIsNull = true;
        if (col === 'metadata->>reconciliation_claimed_at' && op === 'eq') isRelease = true;
        return chain;
      },
      lte: (_col: string, val: string) => {
        lteValues.push(val);
        return chain;
      },
      order: () => chain,
      limit: () => chain,
      in: () => {
        mode = 'siblings';
        return chain;
      },
      eq: (col: string) => {
        if (col === 'correlation_id') mode = 'sibling-one';
        return chain;
      },
      neq: () => chain,
      update: () => chain,
      insert: async (row: Record<string, unknown>) => {
        inserts.push(row);
        return { error: null };
      },
      maybeSingle: async () => {
        if (isRelease) return { data: { id: 'released' }, error: null };
        if (claimIsNull) {
          const ok = opts.claimSequence?.[claimIdx++] ?? true;
          return { data: ok ? { id: 'claimed' } : null, error: null };
        }
        const ok = opts.claimSequence?.[claimIdx++] ?? true;
        return { data: ok ? { id: 'claimed' } : null, error: null };
      },
      then: (resolve) => {
        if (mode === 'scan') {
          resolve({ data: opts.scanRows ?? [], error: null });
          return;
        }
        resolve({ data: opts.siblingRows ?? [], error: null });
      },
    };
    return chain;
  };

  return { client: { from }, inserts, lteValues };
}

describe('decideReconcileOutcome', () => {
  it('closes completed when Twilio shows a pause in effect', () => {
    expect(
      decideReconcileOutcome({
        action: 'recording_paused',
        metadata: { paused_kinds: ['audio', 'video'] },
        includedKinds: [],
      }),
    ).toBe('completed');
  });

  it('closes failed when Twilio still has the paused kinds included', () => {
    expect(
      decideReconcileOutcome({
        action: 'recording_paused',
        metadata: { paused_kinds: ['audio'] },
        includedKinds: ['audio'],
      }),
    ).toBe('failed');
  });

  it('closes completed when a resume\'s restored kinds are included', () => {
    expect(
      decideReconcileOutcome({
        action: 'recording_resumed',
        metadata: { restored_kinds: ['audio'] },
        includedKinds: ['audio'],
      }),
    ).toBe('completed');
  });

  it('closes completed for audio-only start when audio is included', () => {
    expect(
      decideReconcileOutcome({
        action: 'recording_started',
        metadata: {},
        includedKinds: ['audio'],
      }),
    ).toBe('completed');
  });

  it('closes indeterminate when the room is gone', () => {
    expect(
      decideReconcileOutcome({
        action: 'recording_paused',
        metadata: {},
        includedKinds: null,
      }),
    ).toBe('indeterminate');
  });

  it('does not guess an unknown action', () => {
    expect(
      decideReconcileOutcome({
        action: 'patient_declined_pre_session',
        metadata: {},
        includedKinds: ['audio'],
      }),
    ).toBe('indeterminate');
  });
});

describe('runRecordingOrphanReconcileJob', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetIncluded.mockResolvedValue([]);
  });

  it('no-ops when the scan is empty (younger than SLA or none)', async () => {
    const adm = buildAdminMock({ scanRows: [] });
    mockedDb.getSupabaseAdminClient.mockReturnValue(adm.client as never);

    const result = await runRecordingOrphanReconcileJob('corr-empty', NOW);

    expect(result).toEqual({
      scanned: 0,
      closedCompleted: 0,
      closedFailed: 0,
      closedIndeterminate: 0,
      raced: 0,
      errors: [],
    });
    expect(adm.lteValues[0]).toBe(new Date(NOW - RECORDING_AUDIT_ORPHAN_SLA_MS).toISOString());
    expect(adm.inserts).toHaveLength(0);
    expect(mockGetIncluded).not.toHaveBeenCalled();
  });

  it('does not treat a row with a completed sibling as an orphan', async () => {
    const adm = buildAdminMock({
      scanRows: [attemptedPause()],
      siblingRows: [
        { id: 'done-1', correlation_id: 'corr-1', metadata: { status: 'completed' } },
      ],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(adm.client as never);

    const result = await runRecordingOrphanReconcileJob('corr-sib', NOW);

    expect(result.scanned).toBe(0);
    expect(adm.inserts).toHaveLength(0);
    expect(mockGetIncluded).not.toHaveBeenCalled();
  });

  it('closes completed when Twilio agrees the pause took effect', async () => {
    const adm = buildAdminMock({ scanRows: [attemptedPause()] });
    mockedDb.getSupabaseAdminClient.mockReturnValue(adm.client as never);
    mockGetIncluded.mockResolvedValueOnce([]);

    const result = await runRecordingOrphanReconcileJob('corr-ok', NOW);

    expect(result.scanned).toBe(1);
    expect(result.closedCompleted).toBe(1);
    expect(adm.inserts).toHaveLength(1);
    expect(adm.inserts[0]).toMatchObject({
      session_id: 'sess-1',
      action: 'recording_paused',
      action_by: '00000000-0000-0000-0000-000000000000',
      action_by_role: 'system',
      reason: 'administrative',
      correlation_id: 'corr-1',
      metadata: {
        status: 'completed',
        reconciled: true,
        observed_kinds: [],
      },
    });
    expect(mockGetIncluded).toHaveBeenCalledWith('RM1');
  });

  it('closes failed when Twilio disagrees', async () => {
    const adm = buildAdminMock({ scanRows: [attemptedPause()] });
    mockedDb.getSupabaseAdminClient.mockReturnValue(adm.client as never);
    mockGetIncluded.mockResolvedValueOnce(['audio']);

    const result = await runRecordingOrphanReconcileJob('corr-fail', NOW);

    expect(result.closedFailed).toBe(1);
    expect(adm.inserts[0]?.metadata).toMatchObject({
      status: 'failed',
      error: 'observed_state_mismatch',
      reconciled: true,
    });
  });

  it('closes indeterminate on TwilioRoomNotFoundError and does not guess', async () => {
    const adm = buildAdminMock({ scanRows: [attemptedPause()] });
    mockedDb.getSupabaseAdminClient.mockReturnValue(adm.client as never);
    mockGetIncluded.mockRejectedValueOnce(new TwilioRoomNotFoundError('RM1'));

    const result = await runRecordingOrphanReconcileJob('corr-404', NOW);

    expect(result.closedIndeterminate).toBe(1);
    expect(adm.inserts[0]?.metadata).toMatchObject({
      status: 'indeterminate',
      observe_note: 'room_not_found',
      reconciled: true,
    });
  });

  it('counts a lost claim as raced and does not observe Twilio', async () => {
    const adm = buildAdminMock({
      scanRows: [attemptedPause(), attemptedPause({ id: 'orph-2', correlation_id: 'corr-2' })],
      claimSequence: [false, true],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(adm.client as never);

    const result = await runRecordingOrphanReconcileJob('corr-race', NOW);

    expect(result.raced).toBe(1);
    expect(result.closedCompleted).toBe(1);
    expect(mockGetIncluded).toHaveBeenCalledTimes(1);
  });

  it('two concurrent claims close the orphan once', async () => {
    const adm = buildAdminMock({
      scanRows: [attemptedPause()],
      claimSequence: [true, false],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(adm.client as never);

    const [a, b] = await Promise.all([
      runRecordingOrphanReconcileJob('corr-a', NOW),
      runRecordingOrphanReconcileJob('corr-b', NOW),
    ]);

    expect(a.closedCompleted + b.closedCompleted).toBe(1);
    expect(a.raced + b.raced).toBe(1);
    expect(adm.inserts).toHaveLength(1);
    expect(mockGetIncluded).toHaveBeenCalledTimes(1);
  });

  it('a second tick is a no-op once a terminal sibling exists', async () => {
    const first = buildAdminMock({ scanRows: [attemptedPause()] });
    mockedDb.getSupabaseAdminClient.mockReturnValue(first.client as never);
    await runRecordingOrphanReconcileJob('corr-t1', NOW);
    expect(first.inserts).toHaveLength(1);

    const second = buildAdminMock({
      scanRows: [attemptedPause()],
      siblingRows: [
        { id: 'close-1', correlation_id: 'corr-1', metadata: { status: 'completed' } },
      ],
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(second.client as never);
    const again = await runRecordingOrphanReconcileJob('corr-t2', NOW);

    expect(again.scanned).toBe(0);
    expect(second.inserts).toHaveLength(0);
  });

  it('performs no rule-flipping Twilio call', async () => {
    const adm = buildAdminMock({ scanRows: [attemptedPause()] });
    mockedDb.getSupabaseAdminClient.mockReturnValue(adm.client as never);
    await runRecordingOrphanReconcileJob('corr-noflip', NOW);

    expect(mockSetAudioOnly).not.toHaveBeenCalled();
    expect(mockSetBoth).not.toHaveBeenCalled();
    expect(mockExclude).not.toHaveBeenCalled();
    expect(mockInclude).not.toHaveBeenCalled();
    expect(mockGetIncluded).toHaveBeenCalledTimes(1);
  });
});
