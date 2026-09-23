import { describe, expect, it } from '@jest/globals';
import {
  buildAppointmentReminder24hDm,
  buildConsultationCheckinDm,
  buildConsultationCheckinNudgeDm,
  buildConsultationStartingNowDm,
  formatPrevisitTimeLeftPhrase,
} from '../../../src/utils/dm-copy';

describe('previsit DM greeting', () => {
  it('check-in opens with Hi {firstName} and time left', () => {
    const msg = buildConsultationCheckinDm({
      language: 'en',
      practiceName: 'Test Clinic',
      joinUrl: 'https://example.com/join?token=abc',
      patientName: 'Riya Sharma',
      whenLabel: 'Wed, 12 Aug, 8:19 pm',
      minutesLeft: 28,
    });
    expect(msg.startsWith('Hi Riya,')).toBe(true);
    expect(msg).toContain('Test Clinic');
    expect(msg).toContain('Wed, 12 Aug, 8:19 pm');
    expect(msg).toContain('about 28 minutes left');
    expect(msg).toContain('https://example.com/join?token=abc');
  });

  it('nudge includes scheduled time and actual minutes left', () => {
    const msg = buildConsultationCheckinNudgeDm({
      language: 'en',
      practiceName: 'Test Clinic',
      joinUrl: 'https://example.com/join?token=abc',
      minutesLeft: 5,
      minutesLeftActual: 4,
      whenLabel: 'Wed, 12 Aug, 8:34 pm',
      patientName: 'Aarav Mehta',
    });
    expect(msg.startsWith('Hi Aarav,')).toBe(true);
    expect(msg).toContain('Wed, 12 Aug, 8:34 pm');
    expect(msg).toContain('about 4 minutes left');
  });

  it('starting_now says starting now with join link', () => {
    const msg = buildConsultationStartingNowDm({
      language: 'en',
      practiceName: 'Test Clinic',
      joinUrl: 'https://example.com/join?token=abc',
      whenLabel: 'Wed, 12 Aug, 8:19 pm',
      patientName: 'Kabir Singh',
    });
    expect(msg.startsWith('Hi Kabir,')).toBe(true);
    expect(msg).toContain('starting now');
    expect(msg).toContain('Wed, 12 Aug, 8:19 pm');
    expect(msg).toContain('https://example.com/join?token=abc');
  });

  it('24h reminder greets with when + time left and without a join URL', () => {
    const msg = buildAppointmentReminder24hDm({
      language: 'en',
      practiceName: 'Test Clinic',
      whenLabel: 'Wed, 13 Aug, 3:30 pm',
      patientName: 'Neha Kapoor',
      minutesLeft: 23 * 60 + 40,
    });
    expect(msg.startsWith('Hi Neha,')).toBe(true);
    expect(msg).toContain('tomorrow');
    expect(msg).toContain('Wed, 13 Aug, 3:30 pm');
    expect(msg).toContain('about 23 hours 40 minutes left');
    expect(msg).not.toContain('http');
  });

  it('24h reminder does not mention emergency numbers', () => {
    const msg = buildAppointmentReminder24hDm({
      language: 'en',
      practiceName: 'Test Clinic',
      whenLabel: 'Wed, 13 Aug, 3:30 pm',
      patientName: 'Neha Kapoor',
    });
    const lines = msg.split('\n');
    expect(lines[lines.length - 1]).toBe('Reply in this thread if you need to reschedule.');
    expect(msg).not.toMatch(/\b(112|108)\b/);
    expect(msg.toLowerCase()).not.toContain('emergency');
  });
});

describe('formatPrevisitTimeLeftPhrase', () => {
  it('formats minutes and hours', () => {
    expect(formatPrevisitTimeLeftPhrase('en', 1)).toBe('about 1 minute');
    expect(formatPrevisitTimeLeftPhrase('en', 15)).toBe('about 15 minutes');
    expect(formatPrevisitTimeLeftPhrase('en', 60)).toBe('about 1 hour');
    expect(formatPrevisitTimeLeftPhrase('en', 90)).toBe(
      'about 1 hour 30 minutes'
    );
  });
});
