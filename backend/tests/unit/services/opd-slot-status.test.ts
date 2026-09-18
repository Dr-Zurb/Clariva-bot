import { describe, it, expect } from '@jest/globals';

import {
  deriveLifecycle,
  deriveSlotAxes,
  deriveTags,
  deriveTiming,
  toLegacySlotStatus,
} from '../../../src/services/opd/opd-slot-status';
import type { DeriveSlotAxesInput } from '../../../src/services/opd/opd-slot-status';

const baseInput: DeriveSlotAxesInput = {
  graceMinutes: 15,
  nowMs: new Date('2026-05-15T10:00:00.000Z').getTime(),
  session: null,
  opdEventType: null,
  bookingOrigin: 'booked',
  delayMinutes: null,
  earlyInviteExpiresAt: null,
  earlyInviteResponse: null,
  appointmentStatus: 'confirmed',
  scheduledAtMs: new Date('2026-05-15T10:30:00.000Z').getTime(),
};

describe('deriveLifecycle', () => {
  it('returns cancelled / completed / no_show from appointment status', () => {
    expect(
      deriveLifecycle({ ...baseInput, appointmentStatus: 'cancelled' })
    ).toBe('cancelled');
    expect(
      deriveLifecycle({ ...baseInput, appointmentStatus: 'completed' })
    ).toBe('completed');
    expect(
      deriveLifecycle({ ...baseInput, appointmentStatus: 'no_show' })
    ).toBe('no_show');
  });

  it('returns in_consult when session is live (OSM-D10 — never incomplete)', () => {
    expect(
      deriveLifecycle({
        ...baseInput,
        session: {
          status: 'live',
          actual_started_at: '2026-05-15T09:55:00.000Z',
        },
      })
    ).toBe('in_consult');
  });

  it('returns incomplete when session started but is not live', () => {
    expect(
      deriveLifecycle({
        ...baseInput,
        session: {
          status: 'ended',
          actual_started_at: '2026-05-15T09:00:00.000Z',
        },
      })
    ).toBe('incomplete');
  });

  it('returns scheduled when no session has started', () => {
    expect(deriveLifecycle({ ...baseInput, session: null })).toBe('scheduled');
    expect(
      deriveLifecycle({
        ...baseInput,
        session: { status: 'scheduled' },
      })
    ).toBe('scheduled');
  });
});

describe('deriveTiming', () => {
  it('returns null for terminal lifecycle', () => {
    expect(deriveTiming(baseInput, 'completed')).toBeNull();
    expect(deriveTiming(baseInput, 'cancelled')).toBeNull();
    expect(deriveTiming(baseInput, 'no_show')).toBeNull();
  });

  it('bands early / due before start; late the moment start is past', () => {
    const early = deriveTiming(
      {
        ...baseInput,
        scheduledAtMs: new Date('2026-05-15T10:20:00.000Z').getTime(),
      },
      'scheduled'
    );
    expect(early?.band).toBe('early');

    // 5 min before start, inside grace → due (about to start)
    const due = deriveTiming(
      {
        ...baseInput,
        scheduledAtMs: new Date('2026-05-15T10:05:00.000Z').getTime(),
      },
      'scheduled'
    );
    expect(due?.band).toBe('due');

    // Exactly at start → late (no post-start Scheduled)
    const atStart = deriveTiming(
      {
        ...baseInput,
        scheduledAtMs: new Date('2026-05-15T10:00:00.000Z').getTime(),
      },
      'scheduled'
    );
    expect(atStart?.band).toBe('late');

    // 5 min past start (still inside old ±grace) → late, not due
    const justPast = deriveTiming(
      {
        ...baseInput,
        scheduledAtMs: new Date('2026-05-15T09:55:00.000Z').getTime(),
      },
      'scheduled'
    );
    expect(justPast?.band).toBe('late');

    const late = deriveTiming(
      {
        ...baseInput,
        scheduledAtMs: new Date('2026-05-15T09:30:00.000Z').getTime(),
      },
      'scheduled'
    );
    expect(late?.band).toBe('late');
  });
});

describe('deriveTags', () => {
  it('tags overflow / walk_in / rebooked from booking_origin', () => {
    expect(
      deriveTags({ ...baseInput, bookingOrigin: 'overflow' })
    ).toContain('overflow');
    expect(
      deriveTags({ ...baseInput, bookingOrigin: 'walk_in' })
    ).toContain('walk_in');
    expect(
      deriveTags({ ...baseInput, bookingOrigin: 'rebooked' })
    ).toContain('rebooked');
  });

  it('tags return_visit from origin or opd_event_type without forcing overflow', () => {
    const fromOrigin = deriveTags({
      ...baseInput,
      bookingOrigin: 'return_after_completed',
    });
    expect(fromOrigin).toContain('return_visit');
    expect(fromOrigin).not.toContain('overflow');

    const fromEvent = deriveTags({
      ...baseInput,
      bookingOrigin: 'booked',
      opdEventType: 'return_after_completed',
    });
    expect(fromEvent).toContain('return_visit');
    expect(fromEvent).not.toContain('overflow');
  });

  it('tags early_invited and delayed from row fields', () => {
    expect(
      deriveTags({
        ...baseInput,
        earlyInviteExpiresAt: '2026-05-15T10:15:00.000Z',
        earlyInviteResponse: null,
      })
    ).toContain('early_invited');

    expect(
      deriveTags({
        ...baseInput,
        earlyInviteExpiresAt: '2026-05-15T10:15:00.000Z',
        earlyInviteResponse: 'declined',
      })
    ).not.toContain('early_invited');

    expect(
      deriveTags({ ...baseInput, delayMinutes: 10 })
    ).toContain('delayed');
  });

  it('tags patient_waiting vs patient_stepped_away from lobby stamps', () => {
    const now = baseInput.nowMs;
    const waiting = deriveTags({
      ...baseInput,
      patientCheckedInAt: new Date(now - 60_000).toISOString(),
      patientLobbyLastSeenAt: new Date(now - 30_000).toISOString(),
    });
    expect(waiting).toContain('patient_waiting');
    expect(waiting).not.toContain('patient_stepped_away');

    const away = deriveTags({
      ...baseInput,
      patientCheckedInAt: new Date(now - 10 * 60_000).toISOString(),
      patientLobbyLastSeenAt: new Date(now - 5 * 60_000).toISOString(),
    });
    expect(away).toContain('patient_stepped_away');
    expect(away).not.toContain('patient_waiting');
  });

  it('does not tag stepped_away for desk-only check-in', () => {
    const tags = deriveTags({
      ...baseInput,
      patientCheckedInAt: new Date(baseInput.nowMs - 60_000).toISOString(),
      patientLobbyLastSeenAt: null,
    });
    expect(tags).not.toContain('patient_stepped_away');
    expect(tags).not.toContain('patient_waiting');
  });
});

describe('deriveSlotAxes — overflow + late coexistence (regression)', () => {
  it('reports scheduled + late + overflow together', () => {
    const axes = deriveSlotAxes({
      ...baseInput,
      bookingOrigin: 'overflow',
      scheduledAtMs: new Date('2026-05-15T09:30:00.000Z').getTime(),
    });
    expect(axes.lifecycle).toBe('scheduled');
    expect(axes.timing?.band).toBe('late');
    expect(axes.tags).toContain('overflow');
  });
});

describe('toLegacySlotStatus', () => {
  it('maps incomplete and in_consult to in_consultation', () => {
    expect(toLegacySlotStatus('incomplete', null, [])).toBe('in_consultation');
    expect(toLegacySlotStatus('in_consult', null, [])).toBe('in_consultation');
  });

  it('collapses scheduled+overflow to legacy overflow (OSM-D7 trade-off)', () => {
    expect(
      toLegacySlotStatus('scheduled', { minutesToStart: -30, band: 'late' }, [
        'overflow',
      ])
    ).toBe('overflow');
  });

  it('maps scheduled late without overflow to running_late', () => {
    expect(
      toLegacySlotStatus('scheduled', { minutesToStart: -30, band: 'late' }, [])
    ).toBe('running_late');
  });
});
