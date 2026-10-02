import { describe, it, expect } from '@jest/globals';
import {
  AUTOMATED_MENU_EN,
  RECEPTIONIST_GREETING_EN,
  buildReceptionistGreetingMessage,
} from '../../../src/utils/instagram-greeting-copy';

describe('instagram-greeting-copy', () => {
  it('English menu is an automated reply, not a person', () => {
    expect(buildReceptionistGreetingMessage('en')).toBe(RECEPTIONIST_GREETING_EN);
    expect(RECEPTIONIST_GREETING_EN).toBe(AUTOMATED_MENU_EN);
    expect(RECEPTIONIST_GREETING_EN).toMatch(/Automated reply/i);
    expect(RECEPTIONIST_GREETING_EN).toMatch(/availability/i);
    expect(RECEPTIONIST_GREETING_EN).toMatch(/booking link/i);
    expect(RECEPTIONIST_GREETING_EN).not.toMatch(/receptionist|how can I help/i);
    expect(RECEPTIONIST_GREETING_EN).not.toMatch(/consult fee|₹/i);
    expect(RECEPTIONIST_GREETING_EN).not.toMatch(/doctor|teleconsult|medical|Dr\b|patient/i);
  });

  it('fee and address stay off the menu', () => {
    const withFee = buildReceptionistGreetingMessage('en', { catalogMode: 'single_fee' });
    const withAddress = buildReceptionistGreetingMessage('en', { hasAddress: true });
    expect(withFee).toBe(AUTOMATED_MENU_EN);
    expect(withAddress).toBe(AUTOMATED_MENU_EN);
    expect(withFee).not.toMatch(/appointment fee|address|₹/i);
  });

  it('falls back to English for other', () => {
    expect(buildReceptionistGreetingMessage('other')).toBe(RECEPTIONIST_GREETING_EN);
  });

  it('uses the connected Instagram display name, not a numeric id', () => {
    expect(buildReceptionistGreetingMessage('en', { accountName: 'City Clinic' })).toBe(
      'Automated reply from City Clinic. Options: availability, cancel/reschedule, or a booking link.'
    );
    expect(buildReceptionistGreetingMessage('en', { accountName: '17841433414940360' })).toBe(
      RECEPTIONIST_GREETING_EN
    );
  });
});
