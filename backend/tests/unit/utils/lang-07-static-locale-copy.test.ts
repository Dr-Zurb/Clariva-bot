/**
 * lang-07: consent-unclear + empty-status copy from static tables (no OpenAI).
 */

import { resolveConsentUnclearMessage } from '../../../src/utils/booking-consent-context';
import { resolveNoUpcomingAppointmentsMessage } from '../../../src/utils/dm-appointment-status';
import type { ConversationLanguage } from '../../../src/utils/conversation-language';
import * as openai from '../../../src/config/openai';

jest.mock('../../../src/config/openai');

const mockedOpenai = openai as jest.Mocked<typeof openai>;

const CONSENT_EN =
  "I didn't catch that — please reply **Yes** to consent and continue, or **No** to cancel.";
const STATUS_EN =
  "You don't have any upcoming appointments. Say 'book appointment' to schedule one.";

describe('lang-07 static locale copy (no network)', () => {
  const languages: ConversationLanguage[] = [
    'en',
    'hi',
    'hi-Latn',
    'pa',
    'pa-Latn',
    'other',
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // LANG3-D4 is discharged: these arms are translated per locale, so the original
  // "English for every language" expectation no longer holds. What lang-07 still
  // guarantees is that the copy comes from static tables — deterministic, non-empty,
  // and never a network call.
  it('consent-unclear renders per language with zero OpenAI calls', () => {
    expect(resolveConsentUnclearMessage('en')).toBe(CONSENT_EN);
    for (const language of languages) {
      const rendered = resolveConsentUnclearMessage(language);
      expect(rendered.trim().length).toBeGreaterThan(0);
      expect(resolveConsentUnclearMessage(language)).toBe(rendered);
    }
    expect(mockedOpenai.getOpenAIClient).not.toHaveBeenCalled();
  });

  it('status-empty renders per language with zero OpenAI calls', () => {
    expect(resolveNoUpcomingAppointmentsMessage('en')).toBe(STATUS_EN);
    for (const language of languages) {
      const rendered = resolveNoUpcomingAppointmentsMessage(language);
      expect(rendered.trim().length).toBeGreaterThan(0);
      expect(resolveNoUpcomingAppointmentsMessage(language)).toBe(rendered);
    }
    expect(mockedOpenai.getOpenAIClient).not.toHaveBeenCalled();
  });

  it('locale invariants survive translation (Yes/No tokens, book appointment)', () => {
    for (const language of languages) {
      const consent = resolveConsentUnclearMessage(language);
      expect(consent).toContain('**Yes**');
      expect(consent).toContain('**No**');
      expect(resolveNoUpcomingAppointmentsMessage(language)).toContain(
        'book appointment'
      );
    }
  });

  it('preserves markdown bold markers (placeholder-style tokens)', () => {
    expect(resolveConsentUnclearMessage('en')).toContain('**Yes**');
    expect(resolveConsentUnclearMessage('en')).toContain('**No**');
    expect(resolveNoUpcomingAppointmentsMessage('hi-Latn')).toContain('book appointment');
  });
});
