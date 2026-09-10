import { describe, it, expect } from '@jest/globals';
import { evaluatePrescriptionWriteGuard } from '../../../src/services/prescription-write-guard';

const TZ = 'Asia/Kolkata';
const NOW_NOON_IST = new Date('2026-09-09T06:30:00.000Z');

describe('evaluatePrescriptionWriteGuard (rxl-23)', () => {
  it('allows a draft on an open appointment', () => {
    expect(
      evaluatePrescriptionWriteGuard({
        supersededById: null,
        issuedAt: null,
        attestedAt: null,
        appointmentStatus: 'confirmed',
        now: NOW_NOON_IST,
        timezone: TZ,
      })
    ).toEqual({ ok: true });
  });

  it('allows a same-day attested note on a completed appointment', () => {
    expect(
      evaluatePrescriptionWriteGuard({
        supersededById: null,
        issuedAt: null,
        attestedAt: '2026-09-09T04:45:00.000Z',
        appointmentStatus: 'completed',
        now: NOW_NOON_IST,
        timezone: TZ,
      })
    ).toEqual({ ok: true });
  });

  it('refuses a note attested on a previous clinic day even if the client clock says today', () => {
    expect(
      evaluatePrescriptionWriteGuard({
        supersededById: null,
        issuedAt: null,
        attestedAt: '2026-09-08T04:45:00.000Z',
        appointmentStatus: 'completed',
        now: NOW_NOON_IST,
        timezone: TZ,
      })
    ).toEqual({ ok: false, reason: 'attested' });
  });

  it('refuses a superseded row issued today', () => {
    expect(
      evaluatePrescriptionWriteGuard({
        supersededById: '22222222-2222-2222-2222-222222222222',
        issuedAt: '2026-09-09T04:45:00.000Z',
        attestedAt: '2026-09-09T04:45:00.000Z',
        appointmentStatus: 'completed',
        now: NOW_NOON_IST,
        timezone: TZ,
      })
    ).toEqual({ ok: false, reason: 'superseded' });
  });

  it('locks cancelled and no_show even for a same-day draft', () => {
    expect(
      evaluatePrescriptionWriteGuard({
        supersededById: null,
        issuedAt: null,
        attestedAt: null,
        appointmentStatus: 'cancelled',
        now: NOW_NOON_IST,
        timezone: TZ,
      })
    ).toEqual({ ok: false, reason: 'appointment_locked' });
  });

  it('locks a historical null-stamp row on a completed appointment', () => {
    expect(
      evaluatePrescriptionWriteGuard({
        supersededById: null,
        issuedAt: null,
        attestedAt: null,
        appointmentStatus: 'completed',
        now: NOW_NOON_IST,
        timezone: TZ,
      })
    ).toEqual({ ok: false, reason: 'appointment_locked' });
  });

  it('prefers issued_at over attested_at for the day clock', () => {
    expect(
      evaluatePrescriptionWriteGuard({
        supersededById: null,
        issuedAt: '2026-09-08T04:45:00.000Z',
        attestedAt: '2026-09-09T04:45:00.000Z',
        appointmentStatus: 'completed',
        now: NOW_NOON_IST,
        timezone: TZ,
      })
    ).toEqual({ ok: false, reason: 'attested' });
  });

  it('stays writable across midnight until 06:00', () => {
    expect(
      evaluatePrescriptionWriteGuard({
        supersededById: null,
        issuedAt: null,
        attestedAt: '2026-09-09T18:00:00.000Z',
        appointmentStatus: 'completed',
        now: new Date('2026-09-10T00:29:00.000Z'),
        timezone: TZ,
      })
    ).toEqual({ ok: true });
  });
});
