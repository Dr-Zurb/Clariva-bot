import { describe, expect, it } from '@jest/globals';
import { buildDeskBookingConfirmationMessage } from '../../../src/utils/dm-copy';

describe('buildDeskBookingConfirmationMessage', () => {
  it('confirms the time without payment language', () => {
    const out = buildDeskBookingConfirmationMessage({
      language: 'en',
      appointmentDateDisplay: 'Tue, Apr 29, 2026, 4:30 PM',
      patientMrn: 'CLR-00123',
    });
    expect(out).toContain('Your appointment is confirmed');
    expect(out).toContain('Tue, Apr 29 · 4:30 PM');
    expect(out).toContain('CLR-00123');
    expect(out.toLowerCase()).not.toContain('payment');
  });
});
