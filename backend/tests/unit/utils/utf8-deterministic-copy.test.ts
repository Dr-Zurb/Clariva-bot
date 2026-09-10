/**
 * RBH-16: Deterministic user-visible strings must not contain common mojibake or fancy dashes.
 */

import { describe, expect, it } from '@jest/globals';
import {
  MEDICAL_QUERY_RESPONSE_EN,
  EMERGENCY_RESPONSE_EN,
  EMERGENCY_REAFFIRM_RESPONSE_EN,
} from '../../../src/utils/safety-messages';
import { formatBookingLinkDm } from '../../../src/utils/booking-link-copy';
import { buildReceptionistPauseDefaultMessage } from '../../../src/utils/dm-copy';
import type { DoctorSettingsRow } from '../../../src/types/doctor-settings';

const MOJIBAKE_EM_DASH = '\u00e2\u20ac\u201d';

describe('RBH-16 UTF-8 / deterministic copy', () => {
  it('pause DM default has no mojibake or unicode dash in problematic range', () => {
    const pause = buildReceptionistPauseDefaultMessage({ language: 'en' });
    expect(pause).not.toContain(MOJIBAKE_EM_DASH);
    expect(pause).not.toMatch(/[\u2013\u2014]/);
  });

  it('safety English templates are ASCII-safe for dashes', () => {
    expect(MEDICAL_QUERY_RESPONSE_EN).not.toContain(MOJIBAKE_EM_DASH);
    expect(EMERGENCY_RESPONSE_EN).not.toContain(MOJIBAKE_EM_DASH);
    expect(EMERGENCY_RESPONSE_EN).not.toMatch(/[\u2013\u2014]/);
    expect(EMERGENCY_REAFFIRM_RESPONSE_EN).not.toContain(MOJIBAKE_EM_DASH);
    expect(EMERGENCY_REAFFIRM_RESPONSE_EN).not.toMatch(/[\u2013\u2014]/);
  });

  it('booking-link queue copy uses ASCII hyphen phrasing', () => {
    const queueSettings = { opd_mode: 'queue' } as DoctorSettingsRow;
    const hint = formatBookingLinkDm({
      language: 'en',
      slotLink: 'https://example.com/q',
      doctorSettings: queueSettings,
    });
    expect(hint).not.toContain(MOJIBAKE_EM_DASH);
    expect(hint).not.toMatch(/[\u2013\u2014]/);
  });
});
