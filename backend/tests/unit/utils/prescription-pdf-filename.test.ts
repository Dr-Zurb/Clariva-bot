import { buildPrescriptionPdfFilename } from '../../../src/utils/prescription-pdf-filename';

const TZ = 'Asia/Kolkata';
/** 10:15 AM IST, 9 Sep 2026 */
const ISSUED = '2026-09-09T04:45:00.000Z';

describe('buildPrescriptionPdfFilename', () => {
  it('names Version 2 with clinic-local date', () => {
    expect(
      buildPrescriptionPdfFilename({
        instantIso: ISSUED,
        version: 2,
        timezone: TZ,
      })
    ).toBe('prescription-9sep2026-v2.pdf');
  });

  it('distinguishes Version 1 from Version 2 on the same day', () => {
    const v1 = buildPrescriptionPdfFilename({
      instantIso: ISSUED,
      version: 1,
      timezone: TZ,
    });
    const v2 = buildPrescriptionPdfFilename({
      instantIso: ISSUED,
      version: 2,
      timezone: TZ,
    });
    expect(v1).toBe('prescription-9sep2026-v1.pdf');
    expect(v2).toBe('prescription-9sep2026-v2.pdf');
    expect(v1).not.toBe(v2);
  });

  it('does not fabricate v1 when version is unset', () => {
    expect(
      buildPrescriptionPdfFilename({
        instantIso: ISSUED,
        version: null,
        timezone: TZ,
      })
    ).toBe('prescription-9sep2026.pdf');
  });
});
