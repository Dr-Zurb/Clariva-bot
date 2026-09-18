/**
 * rec-18 — gap derivation and REC3-D8 media-time arithmetic.
 *
 * The two-pause case is the one that catches a naive wall-clock offset.
 */

import { describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../src/services/recording-track-service', () => ({
  getRecordingArtifactsForSession: jest.fn(),
}));

import {
  deriveRecordingGaps,
  positionGapsInMediaTime,
  type GapLedgerRow,
} from '../../../src/services/recording-gap-service';
import { PAUSE_REASON_NOT_RECORDED } from '../../../src/types/consultation-recording-audit';

const T0 = new Date('2026-08-19T10:00:00.000Z');

function pauseRow(
  at: string,
  overrides: Partial<GapLedgerRow> = {}
): GapLedgerRow {
  return {
    action: 'recording_paused',
    createdAt: new Date(at),
    status: 'completed',
    actionByRole: 'doctor',
    pauseReasonCode: 'administrative',
    reason: 'administrative',
    pauseClosedAs: null,
    ...overrides,
  };
}

function resumeRow(
  at: string,
  overrides: Partial<GapLedgerRow> = {}
): GapLedgerRow {
  return {
    action: 'recording_resumed',
    createdAt: new Date(at),
    status: 'completed',
    actionByRole: 'doctor',
    pauseReasonCode: null,
    reason: null,
    pauseClosedAs: null,
    ...overrides,
  };
}

describe('deriveRecordingGaps', () => {
  it('returns no gaps when there are no pauses', () => {
    const result = deriveRecordingGaps([], {
      audio: { startedAt: T0, endedAt: new Date('2026-08-19T10:30:00.000Z') },
      video: null,
    });
    expect(result.schemaVersion).toBe(1);
    expect(result.gaps).toEqual([]);
  });

  it('positions one pause at the wall offset from the artifact start', () => {
    const result = deriveRecordingGaps(
      [
        pauseRow('2026-08-19T10:05:00.000Z'),
        resumeRow('2026-08-19T10:09:00.000Z'),
      ],
      { audio: { startedAt: T0, endedAt: new Date('2026-08-19T10:30:00.000Z') }, video: null }
    );
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]?.mediaOffsetMs.audio).toBe(5 * 60_000);
    expect(result.gaps[0]?.durationMs).toBe(4 * 60_000);
    expect(result.gaps[0]?.closedAs).toBe('manual_resume');
    expect(result.gaps[0]?.reasonCode).toBe('administrative');
  });

  it('pins the second marker in media time after subtracting the first gap', () => {
    // Artifact 10:00. Pause 10:05–10:09 (4 min). Pause 10:15–10:16 (1 min).
    // Naive wall offset for #2 is 15 min. Media offset is 15 − 4 = 11 min.
    const result = deriveRecordingGaps(
      [
        pauseRow('2026-08-19T10:05:00.000Z'),
        resumeRow('2026-08-19T10:09:00.000Z'),
        pauseRow('2026-08-19T10:15:00.000Z', {
          actionByRole: 'patient',
          pauseReasonCode: 'patient_request',
          reason: 'patient_request',
        }),
        resumeRow('2026-08-19T10:16:00.000Z', { actionByRole: 'patient' }),
      ],
      { audio: { startedAt: T0, endedAt: new Date('2026-08-19T10:30:00.000Z') }, video: null }
    );
    expect(result.gaps).toHaveLength(2);
    expect(result.gaps[0]?.mediaOffsetMs.audio).toBe(5 * 60_000);
    expect(result.gaps[1]?.mediaOffsetMs.audio).toBe(11 * 60_000);
    expect(result.gaps[1]?.durationMs).toBe(60_000);
    expect(result.gaps[1]?.actorRole).toBe('patient');
  });

  it('runs a dangling pause to the end of the recording', () => {
    const endedAt = new Date('2026-08-19T10:30:00.000Z');
    const result = deriveRecordingGaps(
      [
        pauseRow('2026-08-19T10:20:00.000Z', {
          pauseClosedAs: 'session_ended_while_paused',
        }),
      ],
      { audio: { startedAt: T0, endedAt }, video: null }
    );
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]?.wallEndedAt).toBe(endedAt.toISOString());
    expect(result.gaps[0]?.durationMs).toBe(10 * 60_000);
    expect(result.gaps[0]?.closedAs).toBe('session_ended_while_paused');
    expect(result.gaps[0]?.mediaOffsetMs.audio).toBe(20 * 60_000);
  });

  it('does not treat an attempted-only row as a gap', () => {
    const result = deriveRecordingGaps(
      [
        pauseRow('2026-08-19T10:05:00.000Z', { status: 'attempted' }),
      ],
      { audio: { startedAt: T0, endedAt: new Date('2026-08-19T10:30:00.000Z') }, video: null }
    );
    expect(result.gaps).toEqual([]);
  });

  it('does not treat a failed row as a gap', () => {
    const result = deriveRecordingGaps(
      [
        pauseRow('2026-08-19T10:05:00.000Z', { status: 'failed' }),
        resumeRow('2026-08-19T10:09:00.000Z', { status: 'failed' }),
      ],
      { audio: { startedAt: T0, endedAt: new Date('2026-08-19T10:30:00.000Z') }, video: null }
    );
    expect(result.gaps).toEqual([]);
  });

  it('renders a legacy row without a code as not_recorded_in_preset_form', () => {
    const result = deriveRecordingGaps(
      [
        pauseRow('2026-08-19T10:05:00.000Z', {
          pauseReasonCode: null,
          reason: 'Patient disclosed a diagnosis',
        }),
        resumeRow('2026-08-19T10:06:00.000Z'),
      ],
      { audio: { startedAt: T0, endedAt: new Date('2026-08-19T10:30:00.000Z') }, video: null }
    );
    expect(result.gaps[0]?.reasonCode).toBe(PAUSE_REASON_NOT_RECORDED);
  });

  it('lists an unpositionable gap instead of dropping it', () => {
    const result = deriveRecordingGaps(
      [
        pauseRow('2026-08-19T10:05:00.000Z'),
        resumeRow('2026-08-19T10:06:00.000Z'),
      ],
      { audio: null, video: null }
    );
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]?.mediaOffsetMs.audio).toBeNull();
    expect(result.gaps[0]?.mediaOffsetMs.video).toBeNull();
    expect(result.gaps[0]?.durationMs).toBe(60_000);
  });

  it('attributes auto-resume from the system resume row', () => {
    const result = deriveRecordingGaps(
      [
        pauseRow('2026-08-19T10:05:00.000Z'),
        resumeRow('2026-08-19T10:10:00.000Z', { actionByRole: 'system' }),
      ],
      { audio: { startedAt: T0, endedAt: new Date('2026-08-19T10:30:00.000Z') }, video: null }
    );
    expect(result.gaps[0]?.closedAs).toBe('auto_resume');
  });

  it('pairs what it can when history is malformed (nested pause ignored)', () => {
    const result = deriveRecordingGaps(
      [
        pauseRow('2026-08-19T10:05:00.000Z'),
        pauseRow('2026-08-19T10:06:00.000Z', { pauseReasonCode: 'technical' }),
        resumeRow('2026-08-19T10:09:00.000Z'),
      ],
      { audio: { startedAt: T0, endedAt: new Date('2026-08-19T10:30:00.000Z') }, video: null }
    );
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]?.reasonCode).toBe('administrative');
    expect(result.gaps[0]?.durationMs).toBe(4 * 60_000);
  });

  it('positions the same gaps independently on audio and video artifacts', () => {
    const videoStart = new Date('2026-08-19T10:10:00.000Z');
    const result = deriveRecordingGaps(
      [
        pauseRow('2026-08-19T10:05:00.000Z'),
        resumeRow('2026-08-19T10:09:00.000Z'),
        pauseRow('2026-08-19T10:15:00.000Z'),
        resumeRow('2026-08-19T10:16:00.000Z'),
      ],
      {
        audio: { startedAt: T0, endedAt: new Date('2026-08-19T10:30:00.000Z') },
        video: { startedAt: videoStart, endedAt: new Date('2026-08-19T10:30:00.000Z') },
      }
    );
    expect(result.gaps[0]?.mediaOffsetMs.audio).toBe(5 * 60_000);
    expect(result.gaps[0]?.mediaOffsetMs.video).toBeNull();
    expect(result.gaps[1]?.mediaOffsetMs.audio).toBe(11 * 60_000);
    expect(result.gaps[1]?.mediaOffsetMs.video).toBe(5 * 60_000);
  });
});

describe('positionGapsInMediaTime', () => {
  it('is the single implementation of the offset arithmetic', () => {
    const positioned = positionGapsInMediaTime(
      [
        {
          wallStartedAt: '2026-08-19T10:05:00.000Z',
          wallEndedAt: '2026-08-19T10:09:00.000Z',
          durationMs: 4 * 60_000,
          actorRole: 'doctor',
          reasonCode: 'administrative',
          closedAs: 'manual_resume',
        },
        {
          wallStartedAt: '2026-08-19T10:15:00.000Z',
          wallEndedAt: '2026-08-19T10:16:00.000Z',
          durationMs: 60_000,
          actorRole: 'patient',
          reasonCode: 'patient_request',
          closedAs: 'manual_resume',
        },
      ],
      { audio: { startedAt: T0, endedAt: null }, video: null }
    );
    expect(positioned[1]?.mediaOffsetMs.audio).toBe(11 * 60_000);
  });
});
