import { describe, expect, it } from '@jest/globals';
import { validatePrescriptionPdfMedicineKeyHeader } from '../../../src/utils/validation';
import { prescriptionMedicinePrintKey } from '../../../src/utils/prescription-medicine-print-key';

describe('prescription medicine print key', () => {
  it('decodes the header back to the ordered names', () => {
    const key = prescriptionMedicinePrintKey([
      'Telmisartan',
      '  ',
      'Levocetirizine',
    ]);
    expect(key).toBe('Telmisartan\u0001Levocetirizine');
    const header = Buffer.from(key, 'utf8').toString('base64');
    expect(validatePrescriptionPdfMedicineKeyHeader(header)).toBe(key);
    expect(validatePrescriptionPdfMedicineKeyHeader(undefined)).toBeUndefined();
    expect(validatePrescriptionPdfMedicineKeyHeader('')).toBe('');
  });
});
