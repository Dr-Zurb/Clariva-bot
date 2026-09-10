/**
 * rec-23 matrix — `deriveVideoEscalationState` + `isChargeableEscalationRow`.
 *
 * Implement-to-the-table: every row of task-rec-23 is a test. Decline
 * and timeout keep 5 min from `requested_at`. A consensual stop / grant
 * expiry refunds the attempt and debounces 30s from `revoked_at`.
 *
 * @see docs/Work/Daily-plans/August 2026/17-08-2026/recording-governance-v2/p4-video-escalation-control/Tasks/task-rec-23-derive-state-counter-split.md
 */

import { describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../src/config/env', () => ({
  env: { TWILIO_ACCOUNT_SID: 'AC_test', TWILIO_AUTH_TOKEN: 'tok_test' },
}));

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

jest.mock('../../../src/services/consultation-session-service', () => ({
  findSessionById: jest.fn(),
}));

jest.mock('../../../src/services/consultation-message-service', () => ({
  emitVideoRecordingFailedToStart: jest.fn(),
  emitVideoRecordingStarted: jest.fn(),
  emitVideoRecordingStopped: jest.fn(),
}));

jest.mock('../../../src/services/recording-track-service', () => ({
  escalateToFullVideoRecording: jest.fn(),
  revertToAudioOnlyRecording: jest.fn(),
}));

jest.mock('../../../src/services/twilio-recording-rules', () => ({
  getCurrentRecordingMode: jest.fn(),
}));

jest.mock('../../../src/services/dashboard-events-service', () => ({
  insertDashboardEvent: jest.fn(),
}));

import {
  deriveVideoEscalationState,
  isChargeableEscalationRow,
  type EscalationDeriveInput,
} from '../../../src/services/recording-escalation-service';

const T0 = Date.parse('2026-08-20T10:00:00.000Z');
const MIN = 60_000;
const FIVE_MIN = 5 * MIN;

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function row(
  overrides: Partial<EscalationDeriveInput> & Pick<EscalationDeriveInput, 'id'>,
): EscalationDeriveInput {
  return {
    patient_response: null,
    requested_at:     iso(T0),
    revoked_at:       null,
    revoke_reason:    null,
    initiated_by:     'doctor',
    ...overrides,
  };
}

describe('isChargeableEscalationRow', () => {
  it('charges a doctor-initiated pending, active allow, decline, and timeout', () => {
    expect(isChargeableEscalationRow(row({ id: 'p' }))).toBe(true);
    expect(
      isChargeableEscalationRow(row({ id: 'a', patient_response: 'allow' })),
    ).toBe(true);
    expect(
      isChargeableEscalationRow(row({ id: 'd', patient_response: 'decline' })),
    ).toBe(true);
    expect(
      isChargeableEscalationRow(row({ id: 't', patient_response: 'timeout' })),
    ).toBe(true);
  });

  it('does not charge a patient-initiated row or a stop / grant-expiry', () => {
    expect(
      isChargeableEscalationRow(row({ id: 'off', initiated_by: 'patient' })),
    ).toBe(false);
    expect(
      isChargeableEscalationRow(
        row({
          id:               'stop',
          patient_response: 'allow',
          revoked_at:       iso(T0 + 10_000),
          revoke_reason:    'patient_revoked',
        }),
      ),
    ).toBe(false);
    expect(
      isChargeableEscalationRow(
        row({
          id:               'exp',
          patient_response: 'allow',
          revoked_at:       iso(T0 + 10_000),
          revoke_reason:    'grant_expired',
        }),
      ),
    ).toBe(false);
  });
});

describe('deriveVideoEscalationState — rec-23 matrix', () => {
  it('1 — no rows → idle used 0', () => {
    expect(deriveVideoEscalationState([], T0)).toEqual({
      kind: 'idle',
      attemptsUsed: 0,
    });
  });

  it('2 — pending < 60s → requesting used 1', () => {
    const state = deriveVideoEscalationState([row({ id: 'p' })], T0 + 30_000);
    expect(state).toEqual({
      kind:         'requesting',
      requestId:    'p',
      expiresAt:    iso(T0 + MIN),
      attemptsUsed: 1,
    });
  });

  it('3 — pending ≥ 60s (worker has not ticked) → still requesting', () => {
    const state = deriveVideoEscalationState([row({ id: 'p' })], T0 + 61_000);
    expect(state.kind).toBe('requesting');
    if (state.kind === 'requesting') {
      expect(state.attemptsUsed).toBe(1);
    }
  });

  it('4 — decline < 5 min of requested_at → cooldown used 1 last decline', () => {
    const state = deriveVideoEscalationState(
      [row({ id: 'd', patient_response: 'decline' })],
      T0 + 2 * MIN,
    );
    expect(state).toEqual({
      kind:         'cooldown',
      availableAt:  iso(T0 + FIVE_MIN),
      attemptsUsed: 1,
      lastOutcome:  'decline',
      lastReason:   null,
    });
  });

  it('5 — decline ≥ 5 min → idle used 1', () => {
    expect(
      deriveVideoEscalationState(
        [row({ id: 'd', patient_response: 'decline' })],
        T0 + FIVE_MIN,
      ),
    ).toEqual({ kind: 'idle', attemptsUsed: 1 });
  });

  it('6 — timeout < 5 min → cooldown used 1 last timeout', () => {
    const state = deriveVideoEscalationState(
      [row({ id: 't', patient_response: 'timeout' })],
      T0 + 2 * MIN,
    );
    expect(state.kind).toBe('cooldown');
    if (state.kind === 'cooldown') {
      expect(state.attemptsUsed).toBe(1);
      expect(state.lastOutcome).toBe('timeout');
      expect(state.availableAt).toBe(iso(T0 + FIVE_MIN));
    }
  });

  it('7 — timeout ≥ 5 min → idle used 1', () => {
    expect(
      deriveVideoEscalationState(
        [row({ id: 't', patient_response: 'timeout' })],
        T0 + FIVE_MIN,
      ),
    ).toEqual({ kind: 'idle', attemptsUsed: 1 });
  });

  it('8 — active allow → locked already_recording_video', () => {
    expect(
      deriveVideoEscalationState(
        [row({ id: 'a', patient_response: 'allow' })],
        T0 + 5_000,
      ),
    ).toEqual({
      kind:            'locked',
      reason:          'already_recording_video',
      requestId:       'a',
      grantExpiresAt:  null,
      extensionSpent:  false,
      videoPaused:     false,
    });
  });

  it('9 — paused active allow still derives as already_recording_video', () => {
    expect(
      deriveVideoEscalationState(
        [row({
          id: 'a',
          patient_response: 'allow',
          video_paused_at: iso(T0 + 1_000),
        })],
        T0 + 5_000,
      ),
    ).toEqual({
      kind:            'locked',
      reason:          'already_recording_video',
      requestId:       'a',
      grantExpiresAt:  null,
      extensionSpent:  false,
      videoPaused:     true,
    });
  });

  it('10 — stop < 30s of revoked_at → cooldown used 0 last stopped', () => {
    const revokedAt = T0 + 10_000;
    const state = deriveVideoEscalationState(
      [
        row({
          id:               's',
          patient_response: 'allow',
          revoked_at:       iso(revokedAt),
          revoke_reason:    'patient_revoked',
        }),
      ],
      revokedAt + 10_000,
    );
    expect(state).toEqual({
      kind:         'cooldown',
      availableAt:  iso(revokedAt + 30_000),
      attemptsUsed: 0,
      lastOutcome:  'stopped',
      lastReason:   null,
    });
  });

  it('11 — stop ≥ 30s but < 5 min of requested_at → idle used 0', () => {
    const revokedAt = T0 + 10_000;
    expect(
      deriveVideoEscalationState(
        [
          row({
            id:               's',
            patient_response: 'allow',
            revoked_at:       iso(revokedAt),
            revoke_reason:    'patient_revoked',
          }),
        ],
        revokedAt + 30_000,
      ),
    ).toEqual({ kind: 'idle', attemptsUsed: 0 });
  });

  it('12 — stop ≥ 5 min → idle used 0', () => {
    expect(
      deriveVideoEscalationState(
        [
          row({
            id:               's',
            patient_response: 'allow',
            requested_at:     iso(T0),
            revoked_at:       iso(T0 + MIN),
            revoke_reason:    'patient_revoked',
          }),
        ],
        T0 + FIVE_MIN,
      ),
    ).toEqual({ kind: 'idle', attemptsUsed: 0 });
  });

  it('13 — grant expiry < 30s of revert → same class as stop', () => {
    const revokedAt = T0 + MIN;
    const state = deriveVideoEscalationState(
      [
        row({
          id:               'e',
          patient_response: 'allow',
          revoked_at:       iso(revokedAt),
          revoke_reason:    'grant_expired',
        }),
      ],
      revokedAt + 5_000,
    );
    expect(state.kind).toBe('cooldown');
    if (state.kind === 'cooldown') {
      expect(state.attemptsUsed).toBe(0);
      expect(state.lastOutcome).toBe('stopped');
      expect(state.availableAt).toBe(iso(revokedAt + 30_000));
    }
  });

  it('14 — grant expiry ≥ 30s → idle used 0', () => {
    const revokedAt = T0 + MIN;
    expect(
      deriveVideoEscalationState(
        [
          row({
            id:               'e',
            patient_response: 'allow',
            revoked_at:       iso(revokedAt),
            revoke_reason:    'grant_expired',
          }),
        ],
        revokedAt + 30_000,
      ),
    ).toEqual({ kind: 'idle', attemptsUsed: 0 });
  });

  it('15 — decline after decline → locked max_attempts (any window)', () => {
    const rows = [
      row({ id: 'd2', patient_response: 'decline', requested_at: iso(T0 + MIN) }),
      row({ id: 'd1', patient_response: 'decline', requested_at: iso(T0) }),
    ];
    expect(deriveVideoEscalationState(rows, T0 + MIN + 10_000)).toEqual({
      kind:      'locked',
      reason:    'max_attempts',
      requestId: null,
    });
    expect(deriveVideoEscalationState(rows, T0 + 20 * MIN)).toEqual({
      kind:      'locked',
      reason:    'max_attempts',
      requestId: null,
    });
  });

  it('16 — decline after a stop, < 5 min → cooldown used 1 last decline', () => {
    const state = deriveVideoEscalationState(
      [
        row({
          id:               'd',
          patient_response: 'decline',
          requested_at:     iso(T0 + 2 * MIN),
        }),
        row({
          id:               's',
          patient_response: 'allow',
          requested_at:     iso(T0),
          revoked_at:       iso(T0 + MIN),
          revoke_reason:    'patient_revoked',
        }),
      ],
      T0 + 3 * MIN,
    );
    expect(state.kind).toBe('cooldown');
    if (state.kind === 'cooldown') {
      expect(state.attemptsUsed).toBe(1);
      expect(state.lastOutcome).toBe('decline');
    }
  });

  it('17 — stop after a decline: < 30s cooldown used 1 last stopped; then idle used 1', () => {
    const revokedAt = T0 + 3 * MIN;
    const rows = [
      row({
        id:               's',
        patient_response: 'allow',
        requested_at:     iso(T0 + 2 * MIN),
        revoked_at:       iso(revokedAt),
        revoke_reason:    'patient_revoked',
      }),
      row({
        id:               'd',
        patient_response: 'decline',
        requested_at:     iso(T0),
      }),
    ];
    const during = deriveVideoEscalationState(rows, revokedAt + 5_000);
    expect(during.kind).toBe('cooldown');
    if (during.kind === 'cooldown') {
      expect(during.attemptsUsed).toBe(1);
      expect(during.lastOutcome).toBe('stopped');
    }
    expect(deriveVideoEscalationState(rows, revokedAt + 30_000)).toEqual({
      kind:         'idle',
      attemptsUsed: 1,
    });
  });

  it('18 — two stops ≥ 30s → idle used 0', () => {
    expect(
      deriveVideoEscalationState(
        [
          row({
            id:               's2',
            patient_response: 'allow',
            requested_at:     iso(T0 + 2 * MIN),
            revoked_at:       iso(T0 + 3 * MIN),
            revoke_reason:    'patient_revoked',
          }),
          row({
            id:               's1',
            patient_response: 'allow',
            requested_at:     iso(T0),
            revoked_at:       iso(T0 + MIN),
            revoke_reason:    'patient_revoked',
          }),
        ],
        T0 + 3 * MIN + 30_000,
      ),
    ).toEqual({ kind: 'idle', attemptsUsed: 0 });
  });

  it('19 — pending after a stop → requesting used 1 (not 2)', () => {
    const state = deriveVideoEscalationState(
      [
        row({ id: 'p', requested_at: iso(T0 + 2 * MIN) }),
        row({
          id:               's',
          patient_response: 'allow',
          requested_at:     iso(T0),
          revoked_at:       iso(T0 + MIN),
          revoke_reason:    'patient_revoked',
        }),
      ],
      T0 + 2 * MIN + 5_000,
    );
    expect(state.kind).toBe('requesting');
    if (state.kind === 'requesting') {
      expect(state.attemptsUsed).toBe(1);
    }
  });

  it('20 — patient offer, active → locked; offer is never chargeable', () => {
    const state = deriveVideoEscalationState(
      [
        row({
          id:               'off',
          patient_response: 'allow',
          initiated_by:     'patient',
        }),
      ],
      T0 + 5_000,
    );
    expect(state).toEqual({
      kind:            'locked',
      reason:          'already_recording_video',
      requestId:       'off',
      grantExpiresAt:  null,
      extensionSpent:  false,
      videoPaused:     false,
    });
    expect(
      isChargeableEscalationRow(
        row({
          id:               'off',
          patient_response: 'allow',
          initiated_by:     'patient',
        }),
      ),
    ).toBe(false);
  });

  it('21 — ended patient offer + doctor decline within 5 min → cooldown used 1 last decline', () => {
    const state = deriveVideoEscalationState(
      [
        row({
          id:               'd',
          patient_response: 'decline',
          requested_at:     iso(T0 + 2 * MIN),
        }),
        row({
          id:               'off',
          patient_response: 'allow',
          initiated_by:     'patient',
          requested_at:     iso(T0),
          revoked_at:       iso(T0 + MIN),
          revoke_reason:    'patient_revoked',
        }),
      ],
      T0 + 3 * MIN,
    );
    expect(state.kind).toBe('cooldown');
    if (state.kind === 'cooldown') {
      expect(state.attemptsUsed).toBe(1);
      expect(state.lastOutcome).toBe('decline');
    }
  });

  it('22 — ≥3 rows are legal; attemptsUsed counts chargeable only', () => {
    const threeStops = deriveVideoEscalationState(
      [
        row({
          id:               's3',
          patient_response: 'allow',
          requested_at:     iso(T0 + 4 * MIN),
          revoked_at:       iso(T0 + 5 * MIN),
          revoke_reason:    'patient_revoked',
        }),
        row({
          id:               's2',
          patient_response: 'allow',
          requested_at:     iso(T0 + 2 * MIN),
          revoked_at:       iso(T0 + 3 * MIN),
          revoke_reason:    'patient_revoked',
        }),
        row({
          id:               's1',
          patient_response: 'allow',
          requested_at:     iso(T0),
          revoked_at:       iso(T0 + MIN),
          revoke_reason:    'patient_revoked',
        }),
      ],
      T0 + 5 * MIN + 30_000,
    );
    expect(threeStops).toEqual({ kind: 'idle', attemptsUsed: 0 });

    const declineOverStops = deriveVideoEscalationState(
      [
        row({
          id:               'd',
          patient_response: 'decline',
          requested_at:     iso(T0 + 6 * MIN),
        }),
        row({
          id:               's2',
          patient_response: 'allow',
          requested_at:     iso(T0 + 2 * MIN),
          revoked_at:       iso(T0 + 3 * MIN),
          revoke_reason:    'patient_revoked',
        }),
        row({
          id:               's1',
          patient_response: 'allow',
          requested_at:     iso(T0),
          revoked_at:       iso(T0 + MIN),
          revoke_reason:    'patient_revoked',
        }),
      ],
      T0 + 7 * MIN,
    );
    expect(declineOverStops.kind).toBe('cooldown');
    if (declineOverStops.kind === 'cooldown') {
      expect(declineOverStops.attemptsUsed).toBe(1);
      expect(declineOverStops.lastOutcome).toBe('decline');
    }
  });
});
