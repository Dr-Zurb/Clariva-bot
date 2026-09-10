/**
 * rxl-29 — Phase 3 gate. Two proofs carry the weight: yesterday is refused
 * against a "today" clock, and Version 2 is minted at re-issue only.
 */
import { describe, expect, it } from '@jest/globals';
import { evaluatePrescriptionWriteGuard } from '../../src/services/prescription-write-guard';
import { buildPrescriptionPdfFilename } from '../../src/utils/prescription-pdf-filename';
import { buildPrescriptionReplacesLine } from '../../src/utils/prescription-replaces-line';

const TZ = 'Asia/Kolkata';
/** 12:00 PM IST, 9 Sep 2026 — "today" on the client. */
const CLIENT_TODAY = new Date('2026-09-09T06:30:00.000Z');
/** 10:15 AM IST, 8 Sep 2026 — issued yesterday. */
const YESTERDAY_ISSUED = '2026-09-08T04:45:00.000Z';
/** 10:15 AM IST, 9 Sep 2026. */
const TODAY_ISSUED = '2026-09-09T04:45:00.000Z';
/** 6:40 PM IST, 9 Sep 2026. */
const TODAY_REVISED = '2026-09-09T13:10:00.000Z';

describe('rxl-29 Phase 3 gate', () => {
  it('refuses a yesterday-issued note even when the client clock says today', () => {
    expect(
      evaluatePrescriptionWriteGuard({
        supersededById: null,
        issuedAt: YESTERDAY_ISSUED,
        attestedAt: YESTERDAY_ISSUED,
        appointmentStatus: 'completed',
        now: CLIENT_TODAY,
        timezone: TZ,
      })
    ).toEqual({ ok: false, reason: 'attested' });
  });

  it('lets same-day Finish edits accumulate on the working row (no Version 47)', () => {
    const afterTyping = evaluatePrescriptionWriteGuard({
      supersededById: null,
      issuedAt: TODAY_ISSUED,
      attestedAt: TODAY_ISSUED,
      appointmentStatus: 'completed',
      now: CLIENT_TODAY,
      timezone: TZ,
    });
    expect(afterTyping).toEqual({ ok: true });
  });

  it('distinguishes Version 1 and Version 2 filenames', () => {
    const v1 = buildPrescriptionPdfFilename({
      instantIso: TODAY_ISSUED,
      version: 1,
      timezone: TZ,
    });
    const v2 = buildPrescriptionPdfFilename({
      instantIso: TODAY_REVISED,
      version: 2,
      timezone: TZ,
    });
    expect(v1).toBe('prescription-9sep2026-v1.pdf');
    expect(v2).toBe('prescription-9sep2026-v2.pdf');
    expect(v1).not.toBe(v2);
  });

  it('prints a pharmacist replaces-line on Version 2', () => {
    const line = buildPrescriptionReplacesLine({
      version: 2,
      revisedAtIso: TODAY_REVISED,
      previousIssuedAtIso: TODAY_ISSUED,
      timezone: TZ,
    });
    expect(line).toBe(
      'Revised 6:40 PM, 9 Sep 2026 — replaces the slip issued 10:15 AM. Version 2.'
    );
    expect(
      buildPrescriptionReplacesLine({
        version: 1,
        revisedAtIso: TODAY_REVISED,
        previousIssuedAtIso: TODAY_ISSUED,
        timezone: TZ,
      })
    ).toBeNull();
  });
});
