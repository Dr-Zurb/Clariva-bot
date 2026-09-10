/**
 * rxl-10 — Phase 2 gate. Isolation is the headline: a second note must not
 * look like a second visit. Guard lines are Phase-3-amended (same-day
 * issued is writable; yesterday is not).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from '@jest/globals';
import { evaluatePrescriptionWriteGuard } from '../../src/services/prescription-write-guard';

const TZ = 'Asia/Kolkata';
const TODAY = new Date('2026-09-09T06:30:00.000Z');

describe('rxl-10 Phase 2 gate', () => {
  it('prescription service never inserts appointments or visit_payments', () => {
    const src = readFileSync(
      join(__dirname, '../../src/services/prescription-service.ts'),
      'utf8'
    );
    expect(src).not.toMatch(/from\(\s*['"]visit_payments['"]\s*\)/);
    expect(src).not.toMatch(
      /from\(\s*['"]appointments['"]\s*\)[\s\S]{0,400}\.insert\(/
    );
    expect(src).toContain('appointment_id: data.appointmentId');
  });

  it('refuses a previous clinic day and allows a same-day issued note', () => {
    expect(
      evaluatePrescriptionWriteGuard({
        supersededById: null,
        issuedAt: '2026-09-08T04:45:00.000Z',
        attestedAt: '2026-09-08T04:45:00.000Z',
        appointmentStatus: 'completed',
        now: TODAY,
        timezone: TZ,
      })
    ).toEqual({ ok: false, reason: 'attested' });

    expect(
      evaluatePrescriptionWriteGuard({
        supersededById: null,
        issuedAt: '2026-09-09T04:45:00.000Z',
        attestedAt: '2026-09-09T04:45:00.000Z',
        appointmentStatus: 'completed',
        now: TODAY,
        timezone: TZ,
      })
    ).toEqual({ ok: true });
  });

  it('still allows a draft write on an open visit', () => {
    expect(
      evaluatePrescriptionWriteGuard({
        supersededById: null,
        issuedAt: null,
        attestedAt: null,
        appointmentStatus: 'confirmed',
        now: TODAY,
        timezone: TZ,
      })
    ).toEqual({ ok: true });
  });
});
