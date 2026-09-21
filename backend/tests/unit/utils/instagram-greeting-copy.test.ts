import { describe, it, expect } from '@jest/globals';
import {
  RECEPTIONIST_GREETING_EN,
  buildReceptionistGreetingMessage,
} from '../../../src/utils/instagram-greeting-copy';

describe('instagram-greeting-copy', () => {
  it('English greeting is receptionist-only', () => {
    expect(buildReceptionistGreetingMessage('en')).toBe(RECEPTIONIST_GREETING_EN);
    expect(RECEPTIONIST_GREETING_EN).toMatch(/receptionist/i);
    expect(RECEPTIONIST_GREETING_EN).toMatch(/availability/i);
    expect(RECEPTIONIST_GREETING_EN).toMatch(/booking link/i);
    expect(RECEPTIONIST_GREETING_EN).not.toMatch(/consult fee|₹/i);
    expect(RECEPTIONIST_GREETING_EN).not.toMatch(/doctor|teleconsult|medical|Dr\b|patient/i);
  });

  it('single_fee adds fee to the menu, not a rupee amount', () => {
    const line = buildReceptionistGreetingMessage('en', { catalogMode: 'single_fee' });
    expect(line).toMatch(/consult fee/i);
    expect(line).not.toMatch(/₹/);
  });

  it('address appears only when the doctor published one', () => {
    expect(buildReceptionistGreetingMessage('en', { hasAddress: true })).toMatch(/address/i);
    expect(buildReceptionistGreetingMessage('en')).not.toMatch(/address/i);
  });

  it('falls back to English for other', () => {
    expect(buildReceptionistGreetingMessage('other')).toBe(RECEPTIONIST_GREETING_EN);
  });
});
