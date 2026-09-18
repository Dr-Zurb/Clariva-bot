/**
 * lang-21: consent / revoke / pause default — byte-identical English + LANG5-D4.
 */

import { describe, expect, it } from '@jest/globals';
import {
  buildConsentDeniedMessage,
  buildConsentPersistMissingInfoMessage,
  buildConsentPersistMissingPhoneMessage,
  buildConsentPersistSuccessMessage,
  buildConsentRevokeAlreadyRemovedMessage,
  buildConsentRevokeNoStoredDataMessage,
  buildConsentRevokeRecordNotFoundMessage,
  buildConsentRevokeSuccessMessage,
  buildReceptionistPauseDefaultMessage,
  DM_COPY_LANG21_PHI,
} from '../../../src/utils/dm-copy';
import { resolveReceptionistPauseMessage } from '../../../src/workers/dm/control-gates';

describe('lang-21 consent / pause copy', () => {
  it('en arms are byte-identical to pre-migration literals', () => {
    expect(buildConsentPersistMissingInfoMessage({ language: 'en' })).toBe(
      "I didn't receive your information. Please start over with 'book appointment' if you'd like to schedule."
    );
    expect(buildConsentPersistMissingPhoneMessage({ language: 'en' })).toBe(
      "We need your phone number to complete registration. Please start over with 'book appointment'."
    );
    expect(buildConsentPersistSuccessMessage({ language: 'en' })).toBe(
      "Thanks! I've saved your details. How can I help you next - would you like to book an appointment or check availability?"
    );
    expect(buildConsentDeniedMessage({ language: 'en' })).toBe(
      "No problem. I haven't saved any of your information. Say 'book appointment' anytime if you'd like to try again."
    );
    expect(buildConsentRevokeRecordNotFoundMessage({ language: 'en' })).toBe(
      "I couldn't find your record. If you had shared information before, it may already have been removed."
    );
    expect(buildConsentRevokeAlreadyRemovedMessage({ language: 'en' })).toBe(
      'Your data has already been removed. Is there anything else I can help with?'
    );
    expect(buildConsentRevokeNoStoredDataMessage({ language: 'en' })).toBe(
      "We don't have any stored personal information to remove. Say 'book appointment' if you'd like to schedule."
    );
    expect(buildConsentRevokeSuccessMessage({ language: 'en' })).toBe(
      "Done. I've removed your personal information from our records. Is there anything else I can help with?"
    );
    expect(buildReceptionistPauseDefaultMessage({ language: 'en' })).toBe(
      'Thanks for your message. Our team will reply from this inbox personally when they can. Automated scheduling is paused right now - we appreciate your patience.'
    );
  });

  it('LANG5-D3 verified-negative: no phi interpolation in lang-21 builders', () => {
    for (const v of Object.values(DM_COPY_LANG21_PHI)) {
      expect(v).toBe(false);
    }
  });

  it('LANG5-D4: custom doctor pause message passes through on hi-Latn thread', () => {
    const custom = 'Clinic is closed today — please WhatsApp the front desk.';
    expect(
      resolveReceptionistPauseMessage(
        { instagram_receptionist_pause_message: `  ${custom}  ` } as never,
        'hi-Latn'
      )
    ).toBe(custom);
  });

  it('pause default arm follows language param (lang-26 translated)', () => {
    const en = buildReceptionistPauseDefaultMessage({ language: 'en' });
    expect(resolveReceptionistPauseMessage(null, 'hi')).not.toBe(en);
    expect(resolveReceptionistPauseMessage(null, 'pa-Latn')).not.toBe(en);
    expect(resolveReceptionistPauseMessage(null, 'hi')).toBe(
      buildReceptionistPauseDefaultMessage({ language: 'hi' })
    );
  });

  it('lang-27: consent persist / revoke arms differ from en on hi/pa', () => {
    const en = buildConsentPersistSuccessMessage({ language: 'en' });
    expect(buildConsentPersistSuccessMessage({ language: 'hi' })).not.toBe(en);
    expect(buildConsentDeniedMessage({ language: 'pa' })).not.toBe(
      buildConsentDeniedMessage({ language: 'en' })
    );
    expect(buildConsentRevokeSuccessMessage({ language: 'hi-Latn' })).not.toBe(en);
  });
});
