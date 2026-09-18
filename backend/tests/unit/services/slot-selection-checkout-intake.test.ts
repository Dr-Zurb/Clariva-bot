/**
 * mca-13: owned-page checkout intake — placeholder vs ready patient.
 */

import { describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../src/services/prescription-pdf-service', () => ({
  generatePrescriptionPdf: jest.fn(),
}));
jest.mock('../../../src/services/prescription-pdf-cache', () => ({
  invalidatePrescriptionPdfCache: jest.fn(),
}));

import { resolvePublicCheckoutIntake } from '../../../src/services/slot-selection-service';

describe('resolvePublicCheckoutIntake (mca-13)', () => {
  const completeIntake = {
    patientName: 'Test Patient',
    patientPhone: '+919876543210',
    reasonForVisit: 'Follow-up',
    consentGranted: true,
  };

  it('applies owned-page details when the patient row has no name or phone', () => {
    const result = resolvePublicCheckoutIntake({ name: '', phone: '' }, completeIntake);
    expect(result).toEqual({
      kind: 'apply',
      name: 'Test Patient',
      phone: '+919876543210',
      reasonForVisit: 'Follow-up',
    });
  });

  it('keeps a ready patient on the existing path and does not swap identity', () => {
    const result = resolvePublicCheckoutIntake(
      { name: 'Existing', phone: '+911112223334' },
      {
        patientName: 'Someone Else',
        patientPhone: '+919999999999',
        reasonForVisit: 'New complaint',
        consentGranted: true,
      }
    );
    expect(result).toEqual({
      kind: 'ready',
      reasonForVisit: 'New complaint',
    });
  });

  it('treats a ready patient with no body fields as ready', () => {
    const result = resolvePublicCheckoutIntake({ name: 'Existing', phone: '+911112223334' }, {});
    expect(result).toEqual({ kind: 'ready' });
  });

  it('is incomplete when a placeholder is missing consent', () => {
    const result = resolvePublicCheckoutIntake(
      { name: null, phone: null },
      {
        patientName: 'Test Patient',
        patientPhone: '+919876543210',
        consentGranted: false,
      }
    );
    expect(result).toEqual({ kind: 'incomplete' });
  });

  it('is incomplete when a placeholder is missing name or phone', () => {
    expect(resolvePublicCheckoutIntake({ name: '', phone: '' }, { consentGranted: true })).toEqual({
      kind: 'incomplete',
    });
    expect(resolvePublicCheckoutIntake(null, completeIntake)).toEqual({
      kind: 'incomplete',
    });
  });
});
