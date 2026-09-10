import { describe, expect, it } from '@jest/globals';
import {
  resolvePrevisitStageDue,
  type PrevisitAptRow,
} from '../../../src/utils/previsit-notify-stages';

function apt(overrides: Partial<PrevisitAptRow> = {}): PrevisitAptRow {
  return {
    id: 'a1',
    appointment_date: '2026-08-12T12:00:00.000Z',
    patient_checkin_notified_at: null,
    patient_reminder_24h_notified_at: null,
    patient_checkin_nudge_15_notified_at: null,
    patient_checkin_nudge_5_notified_at: null,
    patient_start_notified_at: null,
    patient_checked_in_at: null,
    patient_lobby_last_seen_at: null,
    ...overrides,
  };
}

describe('resolvePrevisitStageDue', () => {
  const start = Date.parse('2026-08-12T12:00:00.000Z');

  it('returns reminder_24h in the 23–24h band', () => {
    const nowMs = start - 23.5 * 60 * 60 * 1000;
    expect(resolvePrevisitStageDue(apt(), nowMs, 30)).toBe('reminder_24h');
  });

  it('returns checkin_30 inside the lead window before nudges', () => {
    const nowMs = start - 25 * 60 * 1000;
    expect(resolvePrevisitStageDue(apt(), nowMs, 30)).toBe('checkin_30');
  });

  it('returns nudge_15 when check-in settled and not waiting', () => {
    const nowMs = start - 12 * 60 * 1000;
    expect(
      resolvePrevisitStageDue(
        apt({
          patient_checkin_notified_at: new Date(nowMs - 10 * 60 * 1000).toISOString(),
        }),
        nowMs,
        30
      )
    ).toBe('nudge_15');
  });

  it('does not nudge immediately after check-in stamp', () => {
    const nowMs = start - 12 * 60 * 1000;
    expect(
      resolvePrevisitStageDue(
        apt({
          patient_checkin_notified_at: new Date(nowMs - 30_000).toISOString(),
        }),
        nowMs,
        30
      )
    ).toBeNull();
  });

  it('returns nudge_5 inside 5 minutes when not waiting', () => {
    const nowMs = start - 3 * 60 * 1000;
    expect(
      resolvePrevisitStageDue(
        apt({
          patient_checkin_notified_at: new Date(nowMs - 20 * 60 * 1000).toISOString(),
          patient_checkin_nudge_15_notified_at: new Date(
            nowMs - 10 * 60 * 1000
          ).toISOString(),
        }),
        nowMs,
        30
      )
    ).toBe('nudge_5');
  });

  it('skips nudges when patient is Waiting', () => {
    const nowMs = start - 3 * 60 * 1000;
    expect(
      resolvePrevisitStageDue(
        apt({
          patient_checkin_notified_at: new Date(nowMs - 20 * 60 * 1000).toISOString(),
          patient_checked_in_at: '2026-08-12T11:40:00.000Z',
          patient_lobby_last_seen_at: new Date(nowMs - 20_000).toISOString(),
        }),
        nowMs,
        30
      )
    ).toBeNull();
  });

  it('forceCheckin30 works outside the clock window', () => {
    const nowMs = start - 2 * 60 * 60 * 1000;
    expect(
      resolvePrevisitStageDue(apt(), nowMs, 30, { forceCheckin30: true })
    ).toBe('checkin_30');
  });

  it('returns starting_now at exact start time', () => {
    expect(resolvePrevisitStageDue(apt(), start, 30)).toBe('starting_now');
  });

  it('returns starting_now within 2-minute grace after start', () => {
    const nowMs = start + 90_000;
    expect(resolvePrevisitStageDue(apt(), nowMs, 30)).toBe('starting_now');
  });

  it('does not return starting_now after grace window', () => {
    const nowMs = start + 3 * 60 * 1000;
    expect(resolvePrevisitStageDue(apt(), nowMs, 30)).toBeNull();
  });

  it('skips starting_now when patient is Waiting', () => {
    expect(
      resolvePrevisitStageDue(
        apt({
          patient_checked_in_at: '2026-08-12T11:50:00.000Z',
          patient_lobby_last_seen_at: new Date(start - 10_000).toISOString(),
        }),
        start,
        30
      )
    ).toBeNull();
  });

  it('skips starting_now when already stamped', () => {
    expect(
      resolvePrevisitStageDue(
        apt({ patient_start_notified_at: '2026-08-12T12:00:00.000Z' }),
        start,
        30
      )
    ).toBeNull();
  });
});
