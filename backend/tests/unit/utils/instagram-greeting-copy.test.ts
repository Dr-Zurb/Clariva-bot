import { describe, it, expect } from '@jest/globals';
import {
  RECEPTIONIST_GREETING_EN,
  buildReceptionistGreetingMessage,
} from '../../../src/utils/instagram-greeting-copy';

describe('instagram-greeting-copy', () => {
  it('English greeting is receptionist-only', () => {
    expect(buildReceptionistGreetingMessage('en')).toBe(RECEPTIONIST_GREETING_EN);
    expect(RECEPTIONIST_GREETING_EN).toMatch(/receptionist/i);
    expect(RECEPTIONIST_GREETING_EN).toMatch(/timings/i);
    expect(RECEPTIONIST_GREETING_EN).toMatch(/booking link/i);
    expect(RECEPTIONIST_GREETING_EN).not.toMatch(/doctor|teleconsult|medical|Dr\b|patient/i);
  });

  it('falls back to English for other', () => {
    expect(buildReceptionistGreetingMessage('other')).toBe(RECEPTIONIST_GREETING_EN);
  });
});
