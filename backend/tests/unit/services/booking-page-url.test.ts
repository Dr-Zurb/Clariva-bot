import { describe, it, expect, jest } from '@jest/globals';

const CONV = '55555555-5555-4555-8555-555555555555';
const DOC = '11111111-1111-4111-8111-111111111111';
const APPT = '66666666-6666-4666-8666-666666666666';

async function loadUrls() {
  jest.resetModules();
  process.env.BOOKING_TOKEN_SECRET = 'test-booking-token-secret';
  const urls = await import('../../../src/utils/booking-page-url');
  const tokens = await import('../../../src/utils/booking-token');
  return { ...urls, verifyBookingToken: tokens.verifyBookingToken };
}

describe('booking page URL', () => {
  it('uses /d/:slug?c= when the practice has a slug', async () => {
    const { buildBookingPageUrl, verifyBookingToken } = await loadUrls();
    const url = new URL(buildBookingPageUrl(CONV, DOC, 'city-clinic'));
    expect(url.pathname).toBe('/d/city-clinic');
    expect(url.searchParams.get('token')).toBeNull();
    const token = url.searchParams.get('c') ?? '';
    expect(verifyBookingToken(token)).toEqual(
      expect.objectContaining({ conversationId: CONV, doctorId: DOC })
    );
  });

  it('keeps /book?token= when the slug is missing or not url-safe', async () => {
    const { buildBookingPageUrl, verifyBookingToken } = await loadUrls();
    for (const slug of [undefined, null, '', 'No Spaces', 'ab']) {
      const url = new URL(buildBookingPageUrl(CONV, DOC, slug));
      expect(url.pathname.endsWith('/book')).toBe(true);
      expect(url.pathname).not.toContain('/d/');
      expect(url.searchParams.get('c')).toBeNull();
      expect(verifyBookingToken(url.searchParams.get('token') ?? '').doctorId).toBe(DOC);
    }
  });

  it('adds for=times or for=change without dropping the chat token', async () => {
    const { buildBookingPageUrl, verifyBookingToken } = await loadUrls();
    const times = new URL(buildBookingPageUrl(CONV, DOC, 'city-clinic', 'times'));
    const change = new URL(buildBookingPageUrl(CONV, DOC, 'city-clinic', 'change'));
    expect(times.searchParams.get('for')).toBe('times');
    expect(change.searchParams.get('for')).toBe('change');
    expect(verifyBookingToken(times.searchParams.get('c') ?? '').conversationId).toBe(CONV);
    expect(verifyBookingToken(change.searchParams.get('c') ?? '').conversationId).toBe(CONV);
    const plain = new URL(buildBookingPageUrl(CONV, DOC, 'city-clinic'));
    expect(plain.searchParams.get('for')).toBeNull();
  });

  it('keeps reschedule on /book?token=', async () => {
    const { buildReschedulePageUrl, verifyBookingToken } = await loadUrls();
    const url = new URL(buildReschedulePageUrl(CONV, DOC, APPT));
    expect(url.pathname.endsWith('/book')).toBe(true);
    expect(url.searchParams.get('c')).toBeNull();
    expect(verifyBookingToken(url.searchParams.get('token') ?? '').appointmentId).toBe(APPT);
  });
});
