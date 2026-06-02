import { describe, it, expect } from '@jest/globals';

import { deriveSlotStatus } from '../../../src/services/opd/opd-slot-status';

describe('deriveSlotStatus', () => {
  const baseInput = {
    graceMinutes: 15,
    nowMs: new Date('2026-05-15T10:00:00.000Z').getTime(),
    consultationLive: false,
    opdEventType: null,
    isAppendedAfterDay: false,
  } as const;

  it('returns "cancelled" when appointment status is cancelled', () => {
    expect(
      deriveSlotStatus({
        ...baseInput,
        appointmentStatus: 'cancelled',
        scheduledAtMs: new Date('2026-05-15T10:30:00.000Z').getTime(),
      })
    ).toBe('cancelled');
  });

  it('returns "completed" when appointment status is completed', () => {
    expect(
      deriveSlotStatus({
        ...baseInput,
        appointmentStatus: 'completed',
        scheduledAtMs: new Date('2026-05-15T10:30:00.000Z').getTime(),
      })
    ).toBe('completed');
  });

  it('returns "in_consultation" when consultation_sessions row is live', () => {
    expect(
      deriveSlotStatus({
        ...baseInput,
        appointmentStatus: 'confirmed',
        consultationLive: true,
        scheduledAtMs: new Date('2026-05-15T10:30:00.000Z').getTime(),
      })
    ).toBe('in_consultation');
  });

  it('returns "missed" when appointment status is no_show', () => {
    expect(
      deriveSlotStatus({
        ...baseInput,
        appointmentStatus: 'no_show',
        scheduledAtMs: new Date('2026-05-15T10:30:00.000Z').getTime(),
      })
    ).toBe('missed');
  });

  it('returns "overflow" for return_after_completed event type', () => {
    expect(
      deriveSlotStatus({
        ...baseInput,
        appointmentStatus: 'confirmed',
        opdEventType: 'return_after_completed',
        scheduledAtMs: new Date('2026-05-15T10:30:00.000Z').getTime(),
      })
    ).toBe('overflow');
  });

  it('returns "overflow" for appointments appended after the day', () => {
    expect(
      deriveSlotStatus({
        ...baseInput,
        appointmentStatus: 'confirmed',
        isAppendedAfterDay: true,
        scheduledAtMs: new Date('2026-05-15T10:30:00.000Z').getTime(),
      })
    ).toBe('overflow');
  });

  it('returns "upcoming" when slot starts > grace minutes from now', () => {
    expect(
      deriveSlotStatus({
        ...baseInput,
        appointmentStatus: 'confirmed',
        scheduledAtMs: new Date('2026-05-15T10:20:00.000Z').getTime(),
      })
    ).toBe('upcoming');
  });

  it('returns "grace" when slot starts within ±grace minutes of now', () => {
    expect(
      deriveSlotStatus({
        ...baseInput,
        appointmentStatus: 'confirmed',
        scheduledAtMs: new Date('2026-05-15T10:05:00.000Z').getTime(),
      })
    ).toBe('grace');
  });

  it('returns "running_late" when slot started > grace minutes ago', () => {
    expect(
      deriveSlotStatus({
        ...baseInput,
        appointmentStatus: 'confirmed',
        scheduledAtMs: new Date('2026-05-15T09:30:00.000Z').getTime(),
      })
    ).toBe('running_late');
  });

  it('precedence: in_consultation beats overflow', () => {
    expect(
      deriveSlotStatus({
        ...baseInput,
        appointmentStatus: 'confirmed',
        consultationLive: true,
        opdEventType: 'return_after_completed',
        scheduledAtMs: new Date('2026-05-15T09:30:00.000Z').getTime(),
      })
    ).toBe('in_consultation');
  });

  it('precedence: missed beats overflow', () => {
    expect(
      deriveSlotStatus({
        ...baseInput,
        appointmentStatus: 'no_show',
        opdEventType: 'return_after_completed',
        isAppendedAfterDay: true,
        scheduledAtMs: new Date('2026-05-15T10:00:00.000Z').getTime(),
      })
    ).toBe('missed');
  });
});
