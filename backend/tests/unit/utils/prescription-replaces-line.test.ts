import {
  buildPrescriptionReplacesLine,
} from '../../../src/utils/prescription-replaces-line';

const TZ = 'Asia/Kolkata';
/** 10:15 AM IST, 9 Sep 2026 */
const ISSUED = '2026-09-09T04:45:00.000Z';
/** 6:40 PM IST, 9 Sep 2026 */
const REVISED = '2026-09-09T13:10:00.000Z';

describe('buildPrescriptionReplacesLine', () => {
  it('omits the line on Version 1', () => {
    expect(
      buildPrescriptionReplacesLine({
        version: 1,
        revisedAtIso: REVISED,
        previousIssuedAtIso: ISSUED,
        timezone: TZ,
      })
    ).toBeNull();
    expect(
      buildPrescriptionReplacesLine({
        version: null,
        revisedAtIso: REVISED,
        previousIssuedAtIso: ISSUED,
        timezone: TZ,
      })
    ).toBeNull();
  });

  it('renders the pharmacist copy for Version 2', () => {
    expect(
      buildPrescriptionReplacesLine({
        version: 2,
        revisedAtIso: REVISED,
        previousIssuedAtIso: ISSUED,
        timezone: TZ,
      })
    ).toBe(
      'Revised 6:40 PM, 9 Sep 2026 — replaces the slip issued 10:15 AM. Version 2.'
    );
  });

  it('keeps the version when the previous stamp is missing', () => {
    expect(
      buildPrescriptionReplacesLine({
        version: 2,
        revisedAtIso: REVISED,
        previousIssuedAtIso: null,
        timezone: TZ,
      })
    ).toBe('Revised 6:40 PM, 9 Sep 2026. Version 2.');
  });

  it('does not use engineer-speak', () => {
    const line = buildPrescriptionReplacesLine({
      version: 2,
      revisedAtIso: REVISED,
      previousIssuedAtIso: ISSUED,
      timezone: TZ,
    });
    expect(line).not.toMatch(/Rev |Edited |h:mm/i);
  });
});
